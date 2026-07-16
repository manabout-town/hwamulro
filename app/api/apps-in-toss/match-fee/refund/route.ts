import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServiceClient } from "@/lib/supabase/service"
import { createMtlsFetch } from "@/lib/apps-in-toss/mtls"
import { refundMatchFeeFlow } from "@/lib/apps-in-toss/matchFeeFlow"
import { refundTossPayment } from "@/lib/apps-in-toss/tossPay"

// 매칭 이용료 환불(청약철회·운영 대응). 어드민 또는 크론 시크릿만 호출 가능.
export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const apiBase = process.env.TOSS_PARTNER_API_BASE
  const cert = process.env.TOSS_MTLS_CERT
  const key = process.env.TOSS_MTLS_KEY
  if (!url || !anon || !apiBase || !cert || !key) {
    return NextResponse.json({ error: "server not configured" }, { status: 503 })
  }

  // 인증: CRON_SECRET 일치(운영 자동화) 또는 admin 유저(수동 환불)
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get("authorization")
  const token = auth?.replace("Bearer ", "")
  let authorized = false
  if (secret && auth === `Bearer ${secret}`) {
    authorized = true
  } else if (token) {
    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (user) {
      const svc = createServiceClient()
      const { data: u } = await svc.from("users").select("role").eq("id", user.id).single()
      if ((u as { role: string } | null)?.role === "admin") authorized = true
    }
  }
  if (!authorized) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  let body: { feeId?: string; reason?: string; isTest?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: "invalid body" }, { status: 400 }) }
  if (!body.feeId || !body.reason) return NextResponse.json({ error: "feeId/reason 필요" }, { status: 400 })

  const service = createServiceClient()
  const mtlsFetch = createMtlsFetch(cert, key)
  try {
    const result = await refundMatchFeeFlow(
      {
        getFee: async (feeId) => {
          const { data } = await service.from("match_fees")
            .select("id,driver_id,status,toss_payment_key").eq("id", feeId).single()
          return (data as { id: string; driver_id: string; status: string; toss_payment_key: string | null } | null) ?? null
        },
        getDriverTossKey: async (driverId) => {
          const { data } = await service.from("users").select("toss_user_key").eq("id", driverId).single()
          return (data as { toss_user_key: string | null } | null)?.toss_user_key ?? null
        },
        refundPayment: async ({ tossUserKey, payToken, isTest, reason }) => {
          await refundTossPayment(mtlsFetch, { apiBase }, { tossUserKey, payToken, isTest, reason })
        },
        markRefunded: async (feeId, reason) => {
          await service.from("match_fees")
            .update({ status: "refunded", refunded_at: new Date().toISOString(), refund_reason: reason })
            .eq("id", feeId).eq("status", "paid")
        },
      },
      { feeId: body.feeId, reason: body.reason, isTest: body.isTest ?? false }
    )
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "refund failed" }, { status: 400 })
  }
}
