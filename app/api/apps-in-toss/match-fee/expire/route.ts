import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServiceClient } from "@/lib/supabase/service"
import { expireMatchFeeFlow } from "@/lib/apps-in-toss/matchFeeFlow"

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
    const result = await expireMatchFeeFlow(
      {
        getFee: async (feeId) => {
          const { data } = await service.from("match_fees").select("id,match_id,status,expires_at").eq("id", feeId).single()
          return (data as { id: string; match_id: string; status: string; expires_at: string } | null) ?? null
        },
        getMatchOrder: async (matchId) => {
          const { data } = await service.from("matches").select("order_id").eq("id", matchId).single()
          return (data as { order_id: string } | null) ?? null
        },
        cancelMatch: async (matchId) => { await service.from("matches").update({ status: "cancelled" }).eq("id", matchId) },
        reopenOrder: async (orderId) => {
          await service.from("orders").update({ status: "pending", price: 0 }).eq("id", orderId)
          await service.from("bids").update({ status: "pending" }).eq("order_id", orderId).eq("status", "accepted")
        },
        cancelFee: async (feeId) => {
          const { data } = await service.from("match_fees").update({ status: "cancelled" }).eq("id", feeId).eq("status", "pending").select("id")
          return (data as { id: string }[] | null)?.length ?? 0
        },
        now: () => Date.now(),
      },
      { feeId: body.feeId }
    )
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "expire failed" }, { status: 400 })
  }
}
