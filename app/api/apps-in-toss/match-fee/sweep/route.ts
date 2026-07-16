import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { expireMatchFeeFlow } from "@/lib/apps-in-toss/matchFeeFlow"

// 만료 매칭 이용료 스윕(크론 백스톱). lazy 정리가 주 경로.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get("authorization")
  if (process.env.NODE_ENV === "production" && (!secret || auth !== `Bearer ${secret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const service = createServiceClient()
  const { data: expired } = await service.from("match_fees")
    .select("id").eq("status", "pending").lt("expires_at", new Date().toISOString()).limit(100)
  let count = 0
  for (const row of ((expired as { id: string }[] | null) ?? [])) {
    await expireMatchFeeFlow(
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
      { feeId: row.id }
    )
    count++
  }
  return NextResponse.json({ swept: count })
}
