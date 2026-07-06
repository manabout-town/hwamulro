"use server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { revalidatePath } from "next/cache"

async function refundEscrowIfHeld(
  service: ReturnType<typeof createServiceClient>,
  matchId: string
): Promise<{ refunded: boolean }> {
  const { data: escrow } = await service
    .from("escrow")
    .select("id, status")
    .eq("match_id", matchId)
    .maybeSingle()
  if (escrow?.status === "held") {
    await service.from("escrow").update({ status: "refunded" }).eq("id", escrow.id)
    return { refunded: true }
  }
  return { refunded: false }
}

export async function cancelMatch(matchId: string, reason: string = "") {
  const supabase = await createClient()
  const service = createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다" }

  const { data: match } = await supabase
    .from("matches")
    .select("id, order_id, driver_id, status, orders!inner(shipper_id, price, origin, destination, pickup_at)")
    .eq("id", matchId)
    .single()

  if (!match) return { error: "매칭을 찾을 수 없습니다" }
  if (match.driver_id !== user.id) return { error: "권한이 없습니다" }
  if (!["accepted", "in_progress"].includes(match.status)) return { error: "취소할 수 없는 상태입니다" }

  const order = match.orders as any
  const orderPrice: number = order?.price || 0
  const shipperId: string = order?.shipper_id
  const routeLabel = `${order?.origin} → ${order?.destination}`

  // Time-based penalty calculation
  // 당일 취소 → 운임의 30%, 12시간 이내 취소 → 운임의 20%, 그 외 → 0
  const now = new Date()
  const pickup = new Date(order?.pickup_at)
  const hoursUntilPickup = (pickup.getTime() - now.getTime()) / (1000 * 60 * 60)
  // KST(Asia/Seoul) 기준 날짜 비교 — 서버 로컬타임 의존 버그 방지
  const kstDate = (d: Date) => d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })
  const isSameDay = kstDate(now) === kstDate(pickup)

  let penaltyRate = 0
  let penaltyLabel = ""
  if (isSameDay) {
    penaltyRate = 0.30
    penaltyLabel = "당일 취소 위약금 (운임의 30%)"
  } else if (hoursUntilPickup <= 12) {
    penaltyRate = 0.20
    penaltyLabel = "단기 취소 위약금 (운임의 20%)"
  }

  const penaltyAmount = Math.floor(orderPrice * penaltyRate)
  let penaltyStatus: "none" | "pending" | "collected" = "none"

  if (penaltyAmount > 0) {
    // Deduct from driver wallet
    const { data: driverWallet } = await service
      .from("wallets")
      .select("balance")
      .eq("user_id", user.id)
      .maybeSingle()
    const driverBalance = driverWallet?.balance || 0
    const newDriverBalance = driverBalance - penaltyAmount

    await service.from("wallets").upsert(
      { user_id: user.id, balance: newDriverBalance, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    )
    await service.from("wallet_transactions").insert({
      user_id: user.id,
      type: "withdrawal",
      amount: -penaltyAmount,
      balance_after: newDriverBalance,
      description: `${penaltyLabel} — ${routeLabel}`,
      reference_id: matchId,
      status: "completed",
    })

    // Credit shipper
    const { data: shipperWallet } = await service
      .from("wallets")
      .select("balance")
      .eq("user_id", shipperId)
      .maybeSingle()
    const shipperBalance = shipperWallet?.balance || 0
    const newShipperBalance = shipperBalance + penaltyAmount

    await service.from("wallets").upsert(
      { user_id: shipperId, balance: newShipperBalance, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    )
    await service.from("wallet_transactions").insert({
      user_id: shipperId,
      type: "deposit",
      amount: penaltyAmount,
      balance_after: newShipperBalance,
      description: `위약금 수령 — 기사 취소 (${routeLabel})`,
      reference_id: matchId,
      status: "completed",
    })

    penaltyStatus = "collected"
  }

  // BUG(escrow 고아): 결제완료(held) 건 취소 시 화주에게 환불 — 미처리 시 돈 고아+재결제 위험
  const { refunded: escrowRefunded } = await refundEscrowIfHeld(service, matchId)

  await service.from("matches").update({
    status: "cancelled",
    cancelled_at: now.toISOString(),
    cancelled_by_user: user.id,
    cancel_reason: reason || null,
    penalty_amount: penaltyAmount,
    penalty_status: penaltyStatus,
  }).eq("id", matchId)

  await service.from("orders").update({ status: "pending" }).eq("id", match.order_id)

  await service.from("notifications").insert([
    {
      user_id: user.id,
      title: "운송 취소 완료",
      body: penaltyAmount > 0
        ? `${routeLabel} 취소. ${penaltyLabel}: ${penaltyAmount.toLocaleString()}원 부과.`
        : `${routeLabel} 취소 처리되었습니다.`,
      type: "match_cancelled",
      reference_id: matchId,
    },
    {
      user_id: shipperId,
      title: "기사 취소 알림",
      body: (penaltyAmount > 0
        ? `기사가 ${routeLabel} 운송을 취소했습니다. 위약금 ${penaltyAmount.toLocaleString()}원이 지급됩니다.`
        : `기사가 ${routeLabel} 운송을 취소했습니다. 의뢰가 재공개됩니다.`)
        + (escrowRefunded ? " 결제금은 영업일 5~10일 내 환불됩니다." : ""),
      type: "match_cancelled",
      reference_id: matchId,
    },
  ])

  revalidatePath("/driver/matches")
  revalidatePath("/driver/dashboard")
  revalidatePath("/driver/wallet")
  revalidatePath("/shipper/dashboard")
  revalidatePath("/shipper/wallet")

  return { success: true, penaltyAmount, penaltyLabel, refunded: escrowRefunded }
}

export async function cancelMatchByShipper(matchId: string, reason: string = "") {
  const supabase = await createClient()
  const service = createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다" }

  const { data: match } = await supabase
    .from("matches")
    .select("id, order_id, driver_id, status, orders!inner(shipper_id, origin, destination, status)")
    .eq("id", matchId)
    .single()

  if (!match) return { error: "매칭을 찾을 수 없습니다" }
  const order = match.orders as any
  if (order?.shipper_id !== user.id) return { error: "권한이 없습니다" }
  if (!["accepted", "in_progress"].includes(match.status)) {
    return { error: "취소할 수 없는 상태입니다" }
  }
  // 분쟁 진행 중이면 취소 불가 — escrow 동결 상태 보호
  if (order?.status === "disputed") {
    return { error: "분쟁이 진행 중인 의뢰는 취소할 수 없습니다." }
  }

  // 물리적 운송 시작(pickup 리포트) 후에는 취소 불가 — 분쟁 경로 안내
  const { data: pickupReport } = await service
    .from("condition_reports")
    .select("id")
    .eq("match_id", matchId)
    .eq("type", "pickup")
    .maybeSingle()
  if (pickupReport) {
    return { error: "이미 운송이 시작되어 취소할 수 없습니다. 분쟁을 이용해주세요." }
  }

  const routeLabel = `${order?.origin} → ${order?.destination}`
  const { refunded } = await refundEscrowIfHeld(service, matchId)

  await service.from("matches").update({
    status: "cancelled",
    cancelled_at: new Date().toISOString(),
    cancelled_by_user: user.id,
    cancel_reason: reason || null,
  }).eq("id", matchId)

  await service.from("orders").update({ status: "cancelled" }).eq("id", match.order_id)

  await service.from("notifications").insert([
    {
      user_id: user.id,
      title: "취소 완료",
      body: refunded
        ? `${routeLabel} 의뢰를 취소했습니다. 결제금은 영업일 5~10일 내 환불됩니다.`
        : `${routeLabel} 의뢰를 취소했습니다.`,
      type: "match_cancelled",
      reference_id: matchId,
    },
    {
      user_id: match.driver_id,
      title: "화주 취소 알림",
      body: `화주가 ${routeLabel} 운송을 취소했습니다.`,
      type: "match_cancelled",
      reference_id: matchId,
    },
  ])

  // POL-081: 위치 이력 파기
  await service.from("driver_locations").delete().eq("match_id", matchId)

  revalidatePath("/shipper/dashboard")
  revalidatePath(`/shipper/orders/${match.order_id}`)
  revalidatePath("/driver/matches")
  revalidatePath("/driver/dashboard")
  revalidatePath(`/chat/${matchId}`)

  return { success: true, refunded }
}
