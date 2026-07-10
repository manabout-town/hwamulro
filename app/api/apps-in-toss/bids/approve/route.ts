import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServiceClient } from "@/lib/supabase/service"
import { approveBidFlow } from "@/lib/apps-in-toss/approveBid"
import { MATCH_FEE_AMOUNT, MATCH_FEE_TTL_MS } from "@/lib/apps-in-toss/matchFeeConfig"

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
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

  let body: { bidId?: string; orderId?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: "invalid body" }, { status: 400 }) }
  if (!body.bidId || !body.orderId) {
    return NextResponse.json({ error: "bidId/orderId 필요" }, { status: 400 })
  }

  const service = createServiceClient()
  try {
    const result = await approveBidFlow(
      {
        getOrder: async (orderId) => {
          const { data } = await service.from("orders").select("shipper_id, status").eq("id", orderId).single()
          return data as { shipper_id: string; status: string } | null
        },
        getBid: async (bidId) => {
          const { data } = await service.from("bids").select("driver_id, price").eq("id", bidId).single()
          return data as { driver_id: string; price: number } | null
        },
        insertMatch: async (orderId, driverId) => {
          const { error } = await service.from("matches").insert({
            order_id: orderId, driver_id: driverId, status: "accepted", matched_at: new Date().toISOString(),
          })
          return { error: error ? { code: (error as { code?: string }).code, message: error.message } : null }
        },
        updateOrderMatched: async (orderId, price) => {
          await service.from("orders").update({ status: "matched", price }).eq("id", orderId)
        },
        acceptBid: async (bidId) => { await service.from("bids").update({ status: "accepted" }).eq("id", bidId) },
        rejectOtherBids: async (orderId, bidId) => {
          await service.from("bids").update({ status: "rejected" }).eq("order_id", orderId).neq("id", bidId)
        },
        insertMatchFee: async (orderId, driverId) => {
          const { data: match } = await service.from("matches")
            .select("id").eq("order_id", orderId).eq("driver_id", driverId).single()
          if (!match) return
          await service.from("match_fees").upsert({
            match_id: match.id,
            driver_id: driverId,
            amount: MATCH_FEE_AMOUNT,
            status: "pending",
            expires_at: new Date(Date.now() + MATCH_FEE_TTL_MS).toISOString(),
          }, { onConflict: "match_id", ignoreDuplicates: true })
        },
      },
      { bidId: body.bidId, orderId: body.orderId, userId: user.id }
    )
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "approve failed" }, { status: 400 })
  }
}
