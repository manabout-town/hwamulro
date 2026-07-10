import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServiceClient } from "@/lib/supabase/service"
import { createMtlsFetch } from "@/lib/apps-in-toss/mtls"
import { confirmMatchFeeFlow } from "@/lib/apps-in-toss/matchFeeFlow"
import { executeTossPayment } from "@/lib/apps-in-toss/tossPay"

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

  let body: { feeId?: string; payToken?: string; isTest?: boolean }
  try { body = await request.json() } catch { return NextResponse.json({ error: "invalid body" }, { status: 400 }) }
  if (!body.feeId || !body.payToken) return NextResponse.json({ error: "feeId/payToken 필요" }, { status: 400 })

  const service = createServiceClient()
  const mtlsFetch = createMtlsFetch(cert, key)
  try {
    const result = await confirmMatchFeeFlow(
      {
        getFee: async (feeId) => {
          const { data } = await service.from("match_fees").select("id,driver_id,status,toss_order_no").eq("id", feeId).single()
          return (data as { id: string; driver_id: string; status: string; toss_order_no: string | null } | null) ?? null
        },
        getDriverTossKey: async (driverId) => {
          const { data } = await service.from("users").select("toss_user_key").eq("id", driverId).single()
          return (data as { toss_user_key: string | null } | null)?.toss_user_key ?? null
        },
        executePayment: async ({ tossUserKey, payToken, orderNo, isTest }) =>
          executeTossPayment(mtlsFetch, { apiBase }, { tossUserKey, payToken, orderNo, isTest }),
        markPaid: async (feeId, payToken) => {
          await service.from("match_fees").update({ status: "paid", toss_payment_key: payToken, paid_at: new Date().toISOString() }).eq("id", feeId)
        },
      },
      { feeId: body.feeId, userId: user.id, payToken: body.payToken, isTest: body.isTest ?? false }
    )
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "confirm failed" }, { status: 400 })
  }
}
