import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { notFound } from "next/navigation"
import { DriverOrderDetailClient } from "./DriverOrderDetailClient"

export default async function DriverOrderDetail({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // order 조회는 유저 세션 유지 → orders RLS(대기/본인/매칭기사)가 접근 권한을 강제한다.
  const [{ data: order }, { data: myBid }, { data: driverProfile }] = await Promise.all([
    supabase.from("orders").select("*").eq("id", params.id).single(),
    supabase.from("bids").select("*").eq("order_id", params.id).eq("driver_id", user!.id).maybeSingle(),
    supabase.from("driver_profiles").select("home_region, route_regions").eq("user_id", user!.id).maybeSingle(),
  ])

  if (!order) notFound()

  // 화주 이름·연락처는 users RLS(본인 행만)로 임베드가 비므로, 접근 권한이 확인된
  // 뒤(order 가 RLS 를 통과함) service-role 로 보강한다.
  const service = createServiceClient()
  const { data: shipper } = await service
    .from("users").select("name, phone").eq("id", order.shipper_id).single()
  ;(order as { shippers?: { name: string; phone: string | null } | null }).shippers = shipper ?? null

  const canBid = order.status === "pending" && order.shipper_id !== user!.id

  return (
    <DriverOrderDetailClient
      order={order}
      myBid={myBid}
      canBid={canBid}
      driverProfile={driverProfile}
    />
  )
}
