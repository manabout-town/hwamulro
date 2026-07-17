import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServiceClient } from "@/lib/supabase/service"
import { payMatchFeeFlow } from "@/lib/apps-in-toss/matchFeeFlow"

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return NextResponse.json({ error: "server not configured" }, { status: 503 })

  const token = request.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  let body: { feeId?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: "invalid body" }, { status: 400 }) }
  if (!body.feeId) return NextResponse.json({ error: "feeId 필요" }, { status: 400 })

  const service = createServiceClient()
  try {
    const result = await payMatchFeeFlow(
      {
        getFee: async (feeId) => {
          const { data } = await service.from("match_fees")
            .select("id,driver_id,amount,status,expires_at,toss_order_no").eq("id", feeId).single()
          return (data as { id: string; driver_id: string; amount: number; status: string; expires_at: string; toss_order_no: string | null } | null) ?? null
        },
        setOrderNo: async (feeId, orderNo) => {
          await service.from("match_fees").update({ toss_order_no: orderNo }).eq("id", feeId)
        },
        now: () => Date.now(),
      },
      { feeId: body.feeId, userId: user.id },
    )
    return NextResponse.json(result) // { orderNo, amount }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "create failed" }, { status: 400 })
  }
}
