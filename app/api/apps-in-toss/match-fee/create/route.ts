import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServiceClient } from "@/lib/supabase/service"
import { createMtlsFetch } from "@/lib/apps-in-toss/mtls"
import { payMatchFeeFlow } from "@/lib/apps-in-toss/matchFeeFlow"
import { createTossPayment } from "@/lib/apps-in-toss/tossPay"
import { matchFeeProductDesc } from "@/lib/apps-in-toss/matchFeeConfig"

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const apiBase = process.env.TOSS_PARTNER_API_BASE
  const cert = process.env.TOSS_MTLS_CERT
  const key = process.env.TOSS_MTLS_KEY
  if (!url || !anon || !apiBase || !cert || !key) {
    return NextResponse.json({ error: "server not configured" }, { status: 503 })
  }
  const token = request.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  let body: { feeId?: string; isTest?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: "invalid body" }, { status: 400 }) }
  if (!body.feeId) return NextResponse.json({ error: "feeId 필요" }, { status: 400 })

  const service = createServiceClient()
  const mtlsFetch = createMtlsFetch(cert, key)
  try {
    const result = await payMatchFeeFlow(
      {
        getFee: async (feeId) => {
          const { data } = await service.from("match_fees")
            .select("id,driver_id,amount,status,expires_at,toss_order_no").eq("id", feeId).single()
          return (data as { id: string; driver_id: string; amount: number; status: string; expires_at: string; toss_order_no: string | null } | null) ?? null
        },
        getDriverTossKey: async (driverId) => {
          const { data } = await service.from("users").select("toss_user_key").eq("id", driverId).single()
          return (data as { toss_user_key: string | null } | null)?.toss_user_key ?? null
        },
        setOrderNo: async (feeId, orderNo) => {
          await service.from("match_fees").update({ toss_order_no: orderNo }).eq("id", feeId)
        },
        createPayment: async ({ tossUserKey, orderNo, amount, isTest }) =>
          createTossPayment(mtlsFetch, { apiBase }, { tossUserKey, orderNo, amount, productDesc: matchFeeProductDesc(), isTest }),
        now: () => Date.now(),
      },
      { feeId: body.feeId, userId: user.id, isTest: body.isTest ?? false }
    )
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "create failed" }, { status: 400 })
  }
}
