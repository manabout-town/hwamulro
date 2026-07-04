"use server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

export async function submitBid(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다" }

  // BUG-001: 입찰은 KYC 인증된 기사 전용 (POL-010, POL-051)
  const { data: bidder } = await supabase.from("users").select("role, verification_status").eq("id", user.id).single()
  if (bidder?.role !== "driver") return { error: "기사만 입찰할 수 있습니다" }
  if (bidder.verification_status !== "verified") return { error: "KYC 인증 후 입찰할 수 있습니다" }

  const orderId = formData.get("orderId") as string
  const price = parseInt(formData.get("price") as string)
  const message = formData.get("message") as string

  if (!orderId || !price) return { error: "입찰 정보를 모두 입력해주세요" }
  if (price < 1000) return { error: "입찰 금액은 1,000원 이상이어야 합니다" }

  // 의뢰 상태 확인
  const { data: order } = await supabase.from("orders").select("status, shipper_id").eq("id", orderId).single()
  if (!order) return { error: "의뢰를 찾을 수 없습니다" }
  if (order.status !== "pending") return { error: "이미 진행 중인 의뢰입니다" }
  if (order.shipper_id === user.id) return { error: "본인의 의뢰에는 입찰할 수 없습니다" }

  // 기존 입찰 확인
  const { data: existing } = await supabase.from("bids").select("id").eq("order_id", orderId).eq("driver_id", user.id).single()
  if (existing) return { error: "이미 입찰한 의뢰입니다" }

  const { error } = await supabase.from("bids").insert({
    order_id: orderId,
    driver_id: user.id,
    price,
    message: message || null,
    status: "pending",
  })
  if (error) return { error: error.message }

  revalidatePath(`/driver/orders/${orderId}`)
  revalidatePath(`/shipper/orders/${orderId}`)
  return { success: true }
}

export async function approveBid(bidId: string, orderId: string) {
  const supabase = await createClient()
  const service = createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다" }

  // 화주 본인 의뢰인지 확인
  const { data: order } = await supabase.from("orders").select("shipper_id, status").eq("id", orderId).single()
  if (!order || order.shipper_id !== user.id) return { error: "권한이 없습니다" }
  if (order.status !== "pending") return { error: "이미 처리된 의뢰입니다" }

  // 해당 입찰 정보 가져오기
  const { data: bid } = await supabase.from("bids").select("driver_id, price").eq("id", bidId).single()
  if (!bid) return { error: "입찰을 찾을 수 없습니다" }

  // 매칭 생성
  const { error: matchError } = await service.from("matches").insert({
    order_id: orderId,
    driver_id: bid.driver_id,
    status: "accepted",
    matched_at: new Date().toISOString(),
  })
  if (matchError) return { error: matchError.message }

  // 의뢰 금액 업데이트 + 상태 변경
  await service.from("orders").update({ status: "matched", price: bid.price }).eq("id", orderId)

  // 해당 입찰 승인 + 나머지 거절
  await service.from("bids").update({ status: "accepted" }).eq("id", bidId)
  await service.from("bids").update({ status: "rejected" }).eq("order_id", orderId).neq("id", bidId)

  revalidatePath(`/shipper/orders/${orderId}`)
  revalidatePath(`/shipper/dashboard`)
  revalidatePath(`/driver/dashboard`)
  redirect(`/shipper/orders/${orderId}`)
}

export async function rejectBid(bidId: string, orderId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다" }

  const { data: order } = await supabase.from("orders").select("shipper_id").eq("id", orderId).single()
  if (!order || order.shipper_id !== user.id) return { error: "권한이 없습니다" }

  await supabase.from("bids").update({ status: "rejected" }).eq("id", bidId)
  revalidatePath(`/shipper/orders/${orderId}`)
  return { success: true }
}
