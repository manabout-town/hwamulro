import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"

// 72시간 자동 에스크로 해제 (cron job용)
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const service = createServiceClient()
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString()

  // Find matches where completion was requested > 72h ago but shipper hasn't confirmed
  const { data: expiredMatches } = await service
    .from("matches")
    .select("id, driver_id, order_id")
    .not("completion_requested_at", "is", null)
    .lt("completion_requested_at", cutoff)
    .eq("status", "in_progress")

  if (!expiredMatches?.length) {
    return NextResponse.json({ released: 0 })
  }

  const matchIds = expiredMatches.map((m) => m.id)
  const { data: heldEscrows } = await service
    .from("escrow")
    .select("id, match_id, driver_payout")
    .in("match_id", matchIds)
    .eq("status", "held")

  if (!heldEscrows?.length) {
    return NextResponse.json({ released: 0 })
  }

  const escrowByMatchId = Object.fromEntries(heldEscrows.map((e) => [e.match_id, e]))

  let released = 0
  for (const match of expiredMatches) {
    const escrow = escrowByMatchId[match.id]
    if (!escrow) continue

    // BUG-005: 정산액은 보관된 escrow.driver_payout 사용
    const driverPayout = escrow.driver_payout

    await service.from("escrow").update({
      status: "released",
      released_at: new Date().toISOString(),
    }).eq("id", escrow.id)

    await service.from("payouts").insert({
      escrow_id: escrow.id,
      driver_id: match.driver_id,
      amount: driverPayout,
      status: "pending",
    })

    await service.from("matches").update({
      status: "completed",
      completed_at: new Date().toISOString(),
    }).eq("id", match.id)

    await service.from("orders").update({ status: "completed" }).eq("id", match.order_id)

    await service.rpc("increment_driver_completed_count", { p_driver_id: match.driver_id })

    // POL-081: 거래 완료 시 위치 이력 파기
    await service.from("driver_locations").delete().eq("match_id", match.id)

    released++
  }

  return NextResponse.json({ released })
}
