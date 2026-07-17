"use server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

export async function createOrder(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다" }

  // BUG-002: 의뢰 등록은 화주 전용 (POL-010)
  const { data: creator } = await supabase.from("users").select("role").eq("id", user.id).single()
  if (creator?.role !== "shipper") return { error: "화주만 의뢰를 등록할 수 있습니다" }

  const origin = formData.get("origin") as string
  const destination = formData.get("destination") as string
  const vehicleCount = parseInt(formData.get("vehicleCount") as string) || 1
  const vehicleNotes = formData.get("vehicleNotes") as string
  const price = parseInt(formData.get("price") as string)
  const pickupAt = formData.get("pickupAt") as string
  const isUrgent = formData.get("isUrgent") === "true"
  const urgentFee = isUrgent ? 1000 : 0

  const { data, error } = await supabase.from("orders").insert({
    shipper_id: user.id,
    origin,
    destination,
    // 프로덕션 orders.cargo_type NOT NULL(마이그 012 미적용이어도 동작하도록 명시)
    cargo_type: "차량",
    vehicle_count: vehicleCount,
    vehicle_notes: vehicleNotes || null,
    price,
    pickup_at: pickupAt,
    is_urgent: isUrgent,
    urgent_fee: urgentFee,
    status: "pending",
  }).select().single()

  if (error) return { error: error.message }

  revalidatePath("/shipper/dashboard")
  revalidatePath("/driver/feed")
  revalidatePath("/driver/dashboard")
  redirect(`/shipper/orders/${data.id}`)
}

export async function acceptOrder(orderId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다" }

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single()
  if (profile?.role !== "driver") return { error: "기사만 의뢰를 수락할 수 있습니다" }

  const service = createServiceClient()
  const { data, error } = await service.rpc("accept_order_atomic", {
    p_order_id: orderId,
    p_driver_id: user.id,
  })

  if (error) return { error: error.message }
  if (data?.error === "already_matched") return { error: "이미 다른 기사가 수락한 의뢰입니다" }
  if (data?.error === "order_not_found") return { error: "의뢰를 찾을 수 없습니다" }
  if (data?.error === "self_accept") return { error: "본인의 의뢰는 수락할 수 없습니다" }

  revalidatePath("/driver/feed")
  revalidatePath("/driver/dashboard")
  revalidatePath("/shipper/dashboard")
  redirect(`/chat/${data.match_id}`)
}

export async function confirmStart(matchId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다" }

  const { data: match } = await supabase
    .from("matches")
    .select("order_id, driver_id")
    .eq("id", matchId)
    .single()

  if (!match) return { error: "매칭을 찾을 수 없습니다" }
  if (match.driver_id !== user.id) return { error: "권한이 없습니다" }

  // 의무 사항: 탁송 전 차량 사진 8장(상태 리포트) 제출 후에만 운송 시작 가능
  const { data: pickupReport } = await supabase
    .from("condition_reports")
    .select("id")
    .eq("match_id", matchId)
    .eq("type", "pickup")
    .maybeSingle()
  if (!pickupReport) {
    return { error: "탁송 전 차량 사진 8장(전·후·좌·우측면, 지붕, 차대번호, 차키, 계기판)을 먼저 제출해야 운송을 시작할 수 있습니다" }
  }

  const { error: matchErr } = await supabase.from("matches").update({ status: "in_progress" }).eq("id", matchId)
  if (matchErr) return { error: matchErr.message }

  const { error: orderErr } = await supabase.from("orders").update({ status: "in_progress" }).eq("id", match.order_id)
  if (orderErr) return { error: orderErr.message }

  revalidatePath(`/chat/${matchId}`)
  return { success: true }
}

export async function requestCompletion(matchId: string) {
  const supabase = await createClient()
  const service = createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다" }

  const { data: match } = await supabase
    .from("matches")
    .select("order_id, driver_id, orders!inner(shipper_id, origin, destination)")
    .eq("id", matchId)
    .single()

  if (!match) return { error: "매칭을 찾을 수 없습니다" }
  if (match.driver_id !== user.id) return { error: "기사만 완료 요청을 할 수 있습니다" }

  // 의무 사항: 탁송 후 차량 사진 8장(상태 리포트) 제출 후에만 완료 요청 가능
  const { data: deliveryReport } = await supabase
    .from("condition_reports")
    .select("id")
    .eq("match_id", matchId)
    .eq("type", "delivery")
    .maybeSingle()
  if (!deliveryReport) {
    return { error: "탁송 후 차량 사진 8장(전·후·좌·우측면, 지붕, 차대번호, 차키, 계기판)을 먼저 제출해야 완료 요청이 가능합니다" }
  }

  // 채팅에 시스템 메시지 삽입 (트리거가 화주에게 알림 전송)
  await service.from("chats").insert({
    match_id: matchId,
    sender_id: user.id,
    message: "SYSTEM:COMPLETION_REQUESTED",
    sent_at: new Date().toISOString(),
  })

  await service.from("matches").update({
    completion_requested_at: new Date().toISOString(),
  }).eq("id", matchId)

  revalidatePath(`/chat/${matchId}`)
  revalidatePath(`/shipper/orders/${match.order_id}`)
  return { success: true }
}

export async function confirmCompletion(matchId: string) {
  const supabase = await createClient()
  const service = createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다" }

  const { data: match } = await supabase
    .from("matches")
    .select("order_id, driver_id, orders(shipper_id, price)")
    .eq("id", matchId)
    .single()

  if (!match) return { error: "매칭을 찾을 수 없습니다" }
  if ((match.orders as any)?.shipper_id !== user.id) return { error: "화주만 완료 확인할 수 있습니다" }

  // escrow 먼저 조회 + 상태 체크 (idempotency guard — payouts_escrow_id_unique 제약과 이중 방어)
  const { data: escrow } = await service
    .from("escrow")
    .select("id, status, driver_payout")
    .eq("match_id", matchId)
    .single()

  // BUG-011: 미결제(escrow 없음)와 기처리(status != held) 구분
  if (!escrow) return { error: "아직 결제가 완료되지 않았습니다" }
  if (escrow.status !== "held") return { error: "이미 처리된 완료 요청입니다" }

  // BUG-005: 정산액은 결제 시 보관된 escrow.driver_payout 사용 (orders.price 재계산 금지)
  const driverPayout = escrow.driver_payout

  await service.from("matches").update({
    status: "completed",
    completed_at: new Date().toISOString(),
  }).eq("id", matchId)

  await service.from("orders").update({ status: "completed" }).eq("id", match.order_id)

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

  await service.rpc("increment_driver_completed_count", { p_driver_id: match.driver_id })

  // POL-081: 거래 완료 시 위치 이력 파기
  await service.from("driver_locations").delete().eq("match_id", matchId)

  revalidatePath(`/chat/${matchId}`)
  redirect(`/review/${matchId}`)
}

export async function cancelOrder(orderId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다" }

  const { data: order } = await supabase
    .from("orders")
    .select("shipper_id, status")
    .eq("id", orderId)
    .single()

  if (!order) return { error: "의뢰를 찾을 수 없습니다" }
  if (order.shipper_id !== user.id) return { error: "권한이 없습니다" }
  if (!["pending"].includes(order.status)) return { error: "취소할 수 없는 상태입니다" }

  await supabase.from("orders").update({ status: "cancelled" }).eq("id", orderId)

  revalidatePath("/shipper/dashboard")
  redirect("/shipper/dashboard")
}
