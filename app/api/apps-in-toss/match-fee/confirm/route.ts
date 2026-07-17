import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServiceClient } from "@/lib/supabase/service"
import { confirmMatchFeeFlow } from "@/lib/apps-in-toss/matchFeeFlow"
import { confirmTossPayments, cancelTossPayments } from "@/lib/payments/tossPayments"

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const secretKey = process.env.TOSS_PAYMENTS_SECRET_KEY
  if (!url || !anon || !secretKey) return NextResponse.json({ error: "server not configured" }, { status: 503 })

  const token = request.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  let body: { feeId?: string; paymentKey?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: "invalid body" }, { status: 400 }) }
  if (!body.feeId || !body.paymentKey) return NextResponse.json({ error: "feeId/paymentKey 필요" }, { status: 400 })

  const service = createServiceClient()
  try {
    const result = await confirmMatchFeeFlow(
      {
        getFee: async (feeId) => {
          const { data } = await service.from("match_fees")
            .select("id,driver_id,amount,status,toss_order_no,expires_at").eq("id", feeId).single()
          return (data as { id: string; driver_id: string; amount: number; status: string; toss_order_no: string | null; expires_at: string } | null) ?? null
        },
        confirmPayment: async ({ paymentKey, orderId, amount }) => {
          const r = await confirmTossPayments(fetch, { secretKey }, { paymentKey, orderId, amount })
          return { transactionKey: r.transactionKey }
        },
        markPaid: async (feeId, paymentKey, transactionKey) => {
          const { data } = await service.from("match_fees")
            .update({ status: "paid", toss_payment_key: paymentKey, toss_transaction_id: transactionKey, paid_at: new Date().toISOString() })
            .eq("id", feeId).eq("status", "pending").select("id")
          return (data as { id: string }[] | null)?.length ?? 0
        },
        cancelPayment: async ({ paymentKey, reason }) => {
          await cancelTossPayments(fetch, { secretKey }, { paymentKey, reason })
        },
        markRefunded: async (feeId, reason) => {
          await service.from("match_fees")
            .update({ status: "refunded", refunded_at: new Date().toISOString(), refund_reason: reason }).eq("id", feeId)
        },
        markRefundFailed: async (feeId, reason) => {
          await service.from("match_fees").update({ refund_reason: reason }).eq("id", feeId)
        },
        now: () => Date.now(),
      },
      { feeId: body.feeId, userId: user.id, paymentKey: body.paymentKey },
    )
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "confirm failed" }, { status: 400 })
  }
}
