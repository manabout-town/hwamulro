"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { submitBid } from "@/app/actions/bids"
import { formatKRW, formatDate, calculateFee } from "@/lib/utils/format"
import { KakaoRouteMap } from "@/components/shared/KakaoRouteMap"
import Link from "next/link"

interface Order {
  id: string; origin: string; destination: string
  vehicle_count?: number; vehicle_notes?: string
  price: number; status: string; is_urgent: boolean; pickup_at: string
  shippers?: { name: string; phone?: string }
}
interface Bid { id: string; driver_id: string; status: string; price: number }

interface Props {
  order: Order
  myBid: Bid | null
  canBid: boolean
  driverProfile?: { home_region?: string; route_regions?: string[] } | null
}

export function DriverOrderDetailClient({ order, myBid, canBid, driverProfile }: Props) {
  const router = useRouter()
  const [bidPrice, setBidPrice] = useState(order.price)
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleBid(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const fd = new FormData()
    fd.set("orderId", order.id)
    fd.set("price", bidPrice.toString())
    fd.set("message", message)
    const result = await submitBid(fd)
    setLoading(false)
    if (result?.error) { setError(result.error); return }
    setSuccess(true)
    router.refresh()
  }

  const { driverPayout } = calculateFee(bidPrice, 0.04)

  const bidStatusBadge = myBid?.status === "accepted"
    ? <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-semibold">✓ 승인됨</span>
    : myBid?.status === "rejected"
    ? <span className="px-2.5 py-1 bg-red-100 text-red-600 rounded-full text-xs font-semibold">✗ 거절됨</span>
    : myBid
    ? <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">⏳ 검토 중</span>
    : null

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/driver/feed" className="text-sm text-gray-400 hover:text-gray-700 inline-block transition-colors">← 의뢰 피드</Link>

      <div className="flex items-center gap-2 flex-wrap">
        {order.is_urgent && <span className="px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">⚡ 긴급</span>}
        <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-semibold">
          {order.status === "pending" ? "매칭 대기" : "마감"}
        </span>
        {bidStatusBadge}
      </div>

      {/* 의뢰 정보 + 지도 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{order.origin} → {order.destination}</h1>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div><p className="text-gray-400 text-xs mb-1">출발지</p><p className="font-semibold text-gray-900">{order.origin}</p></div>
          <div><p className="text-gray-400 text-xs mb-1">도착지</p><p className="font-semibold text-gray-900">{order.destination}</p></div>
          <div><p className="text-gray-400 text-xs mb-1">차량 대수</p><p className="font-medium">{order.vehicle_count ?? 1}대</p></div>
          <div><p className="text-gray-400 text-xs mb-1">희망 운임</p><p className="font-bold text-indigo-600">{formatKRW(order.price)}</p></div>
          <div><p className="text-gray-400 text-xs mb-1">픽업 일시</p><p className="font-medium">{formatDate(order.pickup_at)}</p></div>
        </div>

        {order.vehicle_notes && (
          <div className="pt-4 border-t border-gray-50">
            <p className="text-xs text-gray-400 mb-1">비고</p>
            <p className="text-sm text-gray-700">{order.vehicle_notes}</p>
          </div>
        )}

        {/* 지도 + 거리 테이블 */}
        <div className="pt-1">
          <KakaoRouteMap origin={order.origin} destination={order.destination} />
        </div>
      </div>

      {/* 운임 정보 (확정값만 — 추정 통행료·연료비·순수익 제거) */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5">
        <h3 className="font-semibold text-indigo-900 mb-3 text-sm">운임 정보</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-white rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-1">희망 운임</p>
            <p className="font-bold text-gray-900">{formatKRW(order.price)}</p>
          </div>
          <div className="bg-white rounded-xl p-3">
            <p className="text-xs text-gray-400 mb-1">실수령액 (4% 수수료 제외)</p>
            <p className="font-bold text-emerald-600">{formatKRW(calculateFee(order.price).driverPayout)}</p>
          </div>
        </div>
      </div>

      {/* 화주 정보 */}
      {order.shippers && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-3 text-sm">화주 정보</h2>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-sm font-bold text-indigo-700">
              {order.shippers.name?.[0] || "화"}
            </div>
            <div>
              <p className="font-semibold text-gray-900">{order.shippers.name}</p>
              {order.shippers.phone && <p className="text-sm text-gray-500">{order.shippers.phone}</p>}
            </div>
          </div>
        </div>
      )}

      {/* 입찰 폼 */}
      {canBid && !myBid && !success ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-900 mb-4 text-sm">입찰하기</h2>
          <form onSubmit={handleBid} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">입찰 금액</label>
              <div className="relative">
                <input
                  type="number"
                  value={bidPrice}
                  onChange={e => setBidPrice(Number(e.target.value))}
                  min={1000}
                  step={1000}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">원</span>
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                수수료 4% 제외 수령액: <span className="font-semibold text-emerald-600">{formatKRW(driverPayout)}</span>
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                화주에게 한마디 <span className="font-normal text-gray-300">(선택)</span>
              </label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="운송 경험, 차량 상태, 픽업 가능 시간 등을 적어주세요"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm h-24 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                maxLength={300}
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors disabled:opacity-50">
              {loading ? "입찰 중..." : "입찰하기"}
            </button>
          </form>
        </div>
      ) : success || (myBid && myBid.status === "pending") ? (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
          <div className="text-2xl mb-2">⏳</div>
          <p className="font-semibold text-amber-800">입찰 완료 — 화주 검토 중</p>
          <p className="text-sm text-amber-600 mt-1">화주가 승인하면 운송이 시작됩니다</p>
          <p className="text-sm font-bold text-amber-800 mt-2">입찰 금액: {formatKRW(myBid?.price || bidPrice)}</p>
        </div>
      ) : myBid?.status === "accepted" ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
          <div className="text-2xl mb-2">✅</div>
          <p className="font-semibold text-emerald-800">입찰이 승인되었습니다!</p>
          <Link href="/driver/matches" className="mt-3 inline-block px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors">
            내 운송 보기
          </Link>
        </div>
      ) : myBid?.status === "rejected" ? (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 text-center">
          <p className="text-gray-500 text-sm">이번 의뢰는 다른 기사님이 선정되었습니다.</p>
        </div>
      ) : !canBid && !myBid ? (
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6 text-center">
          <p className="text-gray-500 text-sm">이미 마감된 의뢰입니다.</p>
        </div>
      ) : null}
    </div>
  )
}
