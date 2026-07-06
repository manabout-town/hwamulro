import Link from "next/link"
import { formatKRW } from "@/lib/utils/format"
import { Zap, Car, Truck } from "lucide-react"
import { ClaimButton } from "@/components/driver/ClaimButton"

interface CallCardProps {
  order: {
    id: string
    title?: string | null
    origin: string
    destination: string
    price: number
    vehicle_count?: number | null
    vehicle_notes?: string | null
    pickup_at?: string | null
    is_urgent?: boolean | null
  }
}

export function CallCard({ order }: CallCardProps) {
  const payout = Math.round(order.price * 0.96)

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 active:scale-[0.99] transition-transform">
      {/* Top: urgent + payout */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          {order.is_urgent ? (
            <span className="inline-flex items-center gap-1 bg-orange-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
              <Zap className="w-3 h-3" />
              긴급
            </span>
          ) : (
            <span className="text-xs text-gray-400 font-medium">일반 의뢰</span>
          )}
        </div>
        <div className="text-right">
          <div className="text-2xl font-black text-emerald-500 tracking-tight leading-none">
            {formatKRW(payout)}
          </div>
          <div className="text-[10px] text-gray-400 mt-0.5">수령액</div>
        </div>
      </div>

      {/* Route */}
      <div className="px-4 pb-3">
        <div className="flex items-stretch gap-3">
          <div className="flex flex-col items-center pt-1 gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
            <div className="w-0.5 flex-1 bg-gray-200 min-h-[20px]" />
            <div className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0" />
          </div>
          <div className="flex-1 flex flex-col justify-between gap-2 min-w-0">
            <div>
              <div className="text-[11px] text-gray-400 leading-none mb-0.5">출발</div>
              <div className="font-semibold text-gray-900 text-sm leading-tight truncate">{order.origin}</div>
            </div>
            <div>
              <div className="text-[11px] text-gray-400 leading-none mb-0.5">도착</div>
              <div className="font-semibold text-gray-900 text-sm leading-tight truncate">{order.destination}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Meta chips */}
      <div className="flex items-center gap-2 px-4 pb-4 flex-wrap">
        <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
          <Car className="w-3 h-3" />
          {order.vehicle_count ?? 1}대
        </span>
        {order.vehicle_notes && (
          <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
            <Truck className="w-3 h-3" />
            {order.vehicle_notes}
          </span>
        )}
        {order.pickup_at && (
          <span className="text-xs text-gray-400 ml-auto">
            {new Date(order.pickup_at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric", weekday: "short" })}
          </span>
        )}
      </div>

      {/* CTA */}
      <div className="flex">
        <Link
          href={`/driver/orders/${order.id}`}
          className="flex items-center justify-center px-5 bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium text-sm py-4 transition-colors shrink-0"
        >
          자세히
        </Link>
        <div className="flex-1 overflow-hidden">
          <ClaimButton orderId={order.id} />
        </div>
      </div>
    </div>
  )
}
