import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import Link from "next/link"
import { formatKRW, formatDate } from "@/lib/utils/format"
import { ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from "@/lib/utils/status"
import { cancelOrder, confirmCompletion } from "@/app/actions/orders"
import { approveBid, rejectBid } from "@/app/actions/bids"
import { DriverLocationMap } from "@/components/shared/DriverLocationMap"
import { DriverRankBadge } from "@/components/shared/DriverRankBadge"
import { ShipperCancelButton } from "@/components/shipper/ShipperCancelButton"

export default async function ShipperOrderDetail({ params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: order }, { data: bids }, { data: escrow }] = await Promise.all([
    supabase.from("orders").select(`
      *,
      matches(*, condition_reports(type), drivers:users!driver_id(*, driver_profiles(vehicle_type, vehicle_number, home_region, route_regions, rating_avg, rating_count)))
    `).eq("id", params.id).eq("shipper_id", user!.id).single(),
    supabase.from("bids").select(`*, drivers:users!driver_id(name, phone, driver_profiles(vehicle_type, vehicle_number, home_region, route_regions, rating_avg, completed_count))`).eq("order_id", params.id).order("created_at", { ascending: true }),
    supabase.from("escrow").select("*").eq("order_id", params.id).maybeSingle(),
  ])

  if (!order) notFound()

  const activeMatch = order.matches?.find((m: any) => !["cancelled"].includes(m.status))
  const hasPickupReport = (activeMatch?.condition_reports as any[] | undefined)?.some(r => r.type === "pickup") ?? false
  const canShipperCancel = !!activeMatch && ["accepted", "in_progress"].includes(activeMatch.status) && !hasPickupReport
  const pendingBids = bids?.filter((b: any) => b.status === "pending") || []

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <Link href="/shipper/dashboard" className="text-gray-400 hover:text-gray-700 text-sm transition-colors min-h-[44px] flex items-center">← 내 의뢰</Link>
        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${ORDER_STATUS_COLOR[order.status as keyof typeof ORDER_STATUS_COLOR] || "bg-gray-100 text-gray-700"}`}>
          {ORDER_STATUS_LABEL[order.status as keyof typeof ORDER_STATUS_LABEL]}
        </span>
        {order.is_urgent && <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">⚡ 긴급</span>}
      </div>

      {/* 의뢰 기본 정보 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 md:p-6">
        <h1 className="text-xl md:text-2xl font-bold mb-4 md:mb-5 text-gray-900 tracking-tight">{order.origin} → {order.destination}</h1>
        <div className="grid grid-cols-2 gap-x-4 md:gap-x-6 gap-y-3 md:gap-y-4 text-sm mb-6">
          <div><p className="text-xs text-gray-400 mb-1">출발지</p><p className="font-semibold text-gray-900">{order.origin}</p></div>
          <div><p className="text-xs text-gray-400 mb-1">도착지</p><p className="font-semibold text-gray-900">{order.destination}</p></div>
          <div><p className="text-xs text-gray-400 mb-1">차량 대수</p><p className="font-medium">{order.vehicle_count ?? 1}대</p></div>
          <div><p className="text-xs text-gray-400 mb-1">픽업 일시</p><p className="font-medium">{formatDate(order.pickup_at)}</p></div>
          <div><p className="text-xs text-gray-400 mb-1">희망 운임</p><p className="font-bold text-orange-500">{formatKRW(order.price)}</p></div>
          {order.vehicle_notes && <div className="col-span-2"><p className="text-xs text-gray-400 mb-1">비고</p><p className="font-medium">{order.vehicle_notes}</p></div>}
        </div>

        {/* 지도 + 기사 실시간 위치 */}
        <DriverLocationMap
          origin={order.origin}
          destination={order.destination}
          driverId={activeMatch?.driver_id}
          matchId={activeMatch?.id}
          showTracking={order.status === "in_progress"}
        />
      </div>

      {/* 에스크로 현황 */}
      {escrow && (
        <div className={`rounded-2xl border p-5 ${
          escrow.status === "held" ? "bg-amber-50 border-amber-200" :
          escrow.status === "released" ? "bg-emerald-50 border-emerald-200" :
          "bg-gray-50 border-gray-200"
        }`}>
          <h2 className={`font-semibold mb-3 text-sm ${
            escrow.status === "held" ? "text-amber-800" :
            escrow.status === "released" ? "text-emerald-800" : "text-gray-700"
          }`}>
            🔒 에스크로 {escrow.status === "held" ? "보관 중" : escrow.status === "released" ? "지급 완료" : "환불됨"}
          </h2>
          <div className="grid grid-cols-3 gap-2 md:gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-400 mb-1">결제 금액</p>
              <p className="font-bold text-gray-900 text-sm md:text-base">{formatKRW(escrow.total_amount)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">플랫폼 수수료</p>
              <p className="font-medium text-red-600 text-sm md:text-base">{formatKRW(escrow.platform_fee)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">기사 지급액</p>
              <p className="font-bold text-emerald-700 text-sm md:text-base">{formatKRW(escrow.driver_payout)}</p>
            </div>
          </div>
          {escrow.status === "held" && (
            <p className="text-xs text-amber-700 mt-3">운송 완료 확인 시 기사님께 자동 지급됩니다</p>
          )}
        </div>
      )}

      {/* 에스크로 결제 (매칭됐지만 아직 결제 안 됨) */}
      {activeMatch && !escrow && order.status === "matched" && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5">
          <h2 className="font-semibold text-orange-800 mb-2 text-sm">💳 에스크로 결제 필요</h2>
          <p className="text-sm text-orange-600 mb-4">기사님이 매칭되었습니다. 에스크로 결제 후 운송이 시작됩니다.</p>
          <Link href={`/shipper/orders/${order.id}/pay`}
            className="block w-full text-center bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-xl text-sm font-semibold transition-colors min-h-[44px] flex items-center justify-center">
            {formatKRW(order.price)} 에스크로 결제 →
          </Link>
        </div>
      )}

      {/* 입찰 목록 */}
      {order.status === "pending" && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-4 text-sm">
            입찰 현황 <span className="text-orange-500 ml-1">{pendingBids.length}건</span>
          </h2>
          {pendingBids.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-2xl mb-2">🕐</p>
              <p className="text-sm">아직 입찰한 기사가 없습니다</p>
              <p className="text-xs mt-1">기사들이 의뢰를 확인하고 입찰할 거예요</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingBids.map((bid: any) => {
                const dp = bid.drivers?.driver_profiles
                return (
                  <div key={bid.id} className="border border-gray-100 rounded-2xl p-4 md:p-5 hover:border-indigo-200 transition-colors">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="min-w-0">
                        <a href={`/driver/${bid.drivers?.id || bid.driver_id}`} target="_blank" rel="noopener noreferrer"
                          className="font-semibold text-gray-900 hover:text-indigo-600 transition-colors">
                          {bid.drivers?.name} ↗
                        </a>
                        <p className="text-xs text-gray-500">{dp?.vehicle_type} · {dp?.vehicle_number}</p>
                        {dp?.home_region && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            📍 {dp.home_region}
                            {dp.route_regions?.length > 0 && ` · ${dp.route_regions.join(", ")}`}
                          </p>
                        )}
                        {dp?.rating_avg > 0 && (
                          <p className="text-xs text-amber-500 mt-0.5">★ {dp.rating_avg.toFixed(1)}</p>
                        )}
                        <div className="mt-1">
                          <DriverRankBadge completedCount={dp?.completed_count ?? 0} size="sm" showProgress={false} />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-orange-500 text-base">{formatKRW(bid.price)}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{formatDate(bid.created_at)}</p>
                      </div>
                    </div>
                    {bid.message && (
                      <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 mb-3">{bid.message}</p>
                    )}
                    <div className="flex gap-2">
                      <form action={async () => { "use server"; await approveBid(bid.id, order.id) }} className="flex-1">
                        <button type="submit" className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg transition-colors min-h-[44px]">
                          ✓ 승인
                        </button>
                      </form>
                      <form action={async () => { "use server"; await rejectBid(bid.id, order.id) }}>
                        <button type="submit" className="px-4 py-2.5 border border-gray-200 text-gray-500 text-sm rounded-lg hover:bg-gray-50 transition-colors min-h-[44px]">
                          거절
                        </button>
                      </form>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* 매칭된 기사 */}
      {activeMatch && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
          <h2 className="font-semibold text-emerald-800 mb-3 text-sm">✓ 매칭된 기사</h2>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-sm font-bold text-emerald-700">
              {activeMatch.drivers?.name?.[0] || "기"}
            </div>
            <div>
              <p className="font-semibold text-gray-900">{activeMatch.drivers?.name}</p>
              <p className="text-sm text-gray-600">{activeMatch.drivers?.driver_profiles?.vehicle_type} · {activeMatch.drivers?.driver_profiles?.vehicle_number}</p>
              <p className="text-sm text-gray-500">{activeMatch.drivers?.phone}</p>
            </div>
          </div>
          {["accepted", "in_progress"].includes(activeMatch.status) && (
            <Link href={`/chat/${activeMatch.id}`}
              className="mt-4 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors">
              💬 기사와 채팅하기
            </Link>
          )}
        </div>
      )}

      {/* 완료 확인 */}
      {order.status === "in_progress" && activeMatch && (
        <form action={async () => { "use server"; await confirmCompletion(activeMatch.id) }}>
          <button type="submit" className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors min-h-[48px]">
            운송 완료 확인
          </button>
        </form>
      )}

      {/* 취소 */}
      {order.status === "pending" && (
        <form action={async () => { "use server"; await cancelOrder(params.id) }}>
          <button type="submit" className="w-full py-3 border border-gray-200 text-gray-400 text-sm rounded-xl hover:bg-gray-50 transition-colors min-h-[44px]">
            의뢰 취소
          </button>
        </form>
      )}

      {/* 시작 전 취소 (매칭·결제 후) */}
      {canShipperCancel && activeMatch && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 md:p-6">
          <ShipperCancelButton matchId={activeMatch.id} />
        </div>
      )}
    </div>
  )
}
