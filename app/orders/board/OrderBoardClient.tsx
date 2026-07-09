"use client"
import { useState, useCallback, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { MapPin, Car, Calendar, Zap, Search, SlidersHorizontal, Plus } from "lucide-react"
import { formatKRW, formatDate } from "@/lib/utils/format"
import { ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from "@/lib/utils/status"
import { acceptOrder } from "@/app/actions/orders"
import { LegalWarningModal } from "@/components/driver/LegalWarningModal"

interface Props {
  role: "shipper" | "driver"
  userId: string
  orders: any[]
  myOrders: any[]
  urgentCount: number
  initialOrigin: string
  initialUrgent: string
}

function UrgentBadge() {
  return (
    <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs font-semibold shrink-0">
      <Zap size={10} /> 긴급
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const label = ORDER_STATUS_LABEL[status as keyof typeof ORDER_STATUS_LABEL] ?? status
  const color = ORDER_STATUS_COLOR[status as keyof typeof ORDER_STATUS_COLOR] ?? "bg-gray-100 text-gray-700"
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      {label}
    </span>
  )
}

function OrderBoardCard({
  order,
  role,
  onAccept,
  accepting,
}: {
  order: any
  role: "shipper" | "driver"
  onAccept?: (id: string) => void
  accepting?: boolean
}) {
  const detailHref =
    role === "shipper"
      ? `/shipper/orders/${order.id}`
      : `/driver/orders/${order.id}`

  return (
    <div className="bg-white rounded-2xl border border-gray-100 hover:border-orange-200 hover:shadow-sm transition-all duration-200 overflow-hidden">
      <Link href={detailHref} className="block p-5">
        {/* Top row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            {order.is_urgent && <UrgentBadge />}
            {role === "shipper" && <StatusBadge status={order.status} />}
          </div>
          <span className="text-base font-bold text-[#FF6B2B] shrink-0">
            {formatKRW(order.price)}
          </span>
        </div>

        {/* Route */}
        <div className="flex items-center gap-2 text-sm mb-3 min-w-0">
          <MapPin size={14} className="text-[#FF6B2B] shrink-0" />
          <span className="font-semibold text-gray-900 truncate">{order.origin}</span>
          <span className="text-gray-300 shrink-0">→</span>
          <span className="font-semibold text-gray-900 truncate">{order.destination}</span>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-4 text-xs text-gray-500 mb-2">
          <span className="flex items-center gap-1">
            <Car size={12} className="shrink-0" />
            차량 {order.vehicle_count}대
          </span>
          <span className="flex items-center gap-1">
            <Calendar size={12} className="shrink-0" />
            {formatDate(order.pickup_at)}
          </span>
        </div>

        {/* Notes + shipper */}
        <div className="flex items-center justify-between gap-2">
          {order.vehicle_notes && (
            <p className="text-xs text-gray-400 line-clamp-1 flex-1">{order.vehicle_notes}</p>
          )}
          {order.shippers?.name && (
            <span className="text-xs text-gray-400 shrink-0 ml-auto">
              의뢰인: {order.shippers.name}
            </span>
          )}
        </div>
      </Link>

      {/* Driver accept button */}
      {role === "driver" && onAccept && (
        <div className="border-t border-gray-50 px-5 py-3 flex items-center justify-between gap-3">
          <Link
            href={detailHref}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            상세 보기
          </Link>
          <button
            onClick={() => onAccept(order.id)}
            disabled={accepting}
            className="flex-1 max-w-[140px] py-2.5 bg-[#FF6B2B] hover:bg-orange-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {accepting ? "처리 중..." : "수락하기"}
          </button>
        </div>
      )}
    </div>
  )
}

export function OrderBoardClient({
  role,
  userId,
  orders,
  myOrders,
  urgentCount,
  initialOrigin,
  initialUrgent,
}: Props) {
  const router = useRouter()
  const [origin, setOrigin] = useState(initialOrigin)
  const [urgent, setUrgent] = useState(initialUrgent)
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [acceptFeedback, setAcceptFeedback] = useState<{ id: string; msg: string; isError: boolean } | null>(null)
  const [, startTransition] = useTransition()

  const applyFilter = useCallback(() => {
    const p = new URLSearchParams()
    if (origin) p.set("origin", origin)
    if (urgent) p.set("urgent", urgent)
    router.push(`/orders/board?${p.toString()}`)
  }, [origin, urgent, router])

  const resetFilter = useCallback(() => {
    setOrigin("")
    setUrgent("")
    router.push("/orders/board")
  }, [router])

  // 수락 클릭 → 법적 경고 모달 표시 (확인 후 최종 수락)
  const [warningOrderId, setWarningOrderId] = useState<string | null>(null)

  function handleAccept(orderId: string) {
    setWarningOrderId(orderId)
  }

  function handleConfirmedAccept(orderId: string) {
    setWarningOrderId(null)
    setAcceptingId(orderId)
    startTransition(async () => {
      // acceptOrder server action redirects on success → Next.js throws a special NEXT_REDIRECT
      // error that React catches during transition. We catch only real errors here.
      try {
        const result = await acceptOrder(orderId)
        // If we get here, it means no redirect happened (returned an error object)
        if (result?.error) {
          setAcceptFeedback({ id: orderId, msg: result.error, isError: true })
          setAcceptingId(null)
          setTimeout(() => setAcceptFeedback(null), 3500)
        }
      } catch (e: any) {
        // NEXT_REDIRECT is thrown as a special error — re-throw it so Next.js handles navigation
        if (e?.digest?.startsWith("NEXT_REDIRECT")) throw e
        setAcceptFeedback({ id: orderId, msg: e?.message || "오류가 발생했습니다", isError: true })
        setAcceptingId(null)
        setTimeout(() => setAcceptFeedback(null), 3500)
      }
    })
  }

  // Shipper: split orders into my pending vs others
  const myPendingOrders = role === "shipper"
    ? orders.filter((o) => o.shipper_id === userId)
    : []
  const otherPendingOrders = role === "shipper"
    ? orders.filter((o) => o.shipper_id !== userId)
    : orders

  return (
    <div className="space-y-6">
      <LegalWarningModal
        open={warningOrderId !== null}
        loading={acceptingId !== null}
        onConfirm={() => warningOrderId && handleConfirmedAccept(warningOrderId)}
        onCancel={() => setWarningOrderId(null)}
      />
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-3xl font-bold text-gray-900 tracking-tight">
            탁송 의뢰 게시판
          </h1>
          <p className="text-sm md:text-base text-gray-500 mt-1">
            {orders.length}건
            {urgentCount > 0 && (
              <span className="ml-2 text-[#FF6B2B] font-semibold">긴급 {urgentCount}건</span>
            )}
          </p>
        </div>
        {role === "shipper" && (
          <Link
            href="/shipper/orders/new"
            className="flex items-center gap-1.5 bg-[#FF6B2B] hover:bg-orange-600 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shrink-0 min-h-[44px]"
          >
            <Plus size={16} />
            새 의뢰 등록
          </Link>
        )}
      </div>

      {/* Accept feedback toast */}
      {acceptFeedback && (
        <div
          className={`px-4 py-3 rounded-xl text-sm font-medium ${
            acceptFeedback.isError
              ? "bg-red-50 text-red-600 border border-red-100"
              : "bg-emerald-50 text-emerald-700 border border-emerald-100"
          }`}
        >
          {acceptFeedback.isError ? "⚠ " : "✓ "}
          {acceptFeedback.msg}
        </div>
      )}

      {/* Filter */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <div className="flex items-center gap-2 mb-3">
          <SlidersHorizontal size={14} className="text-gray-400" />
          <span className="text-xs font-medium text-gray-500">필터</span>
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-xs font-medium text-gray-500 mb-1.5">출발지</label>
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B2B] focus:border-transparent transition-all bg-white"
                placeholder="예: 서울"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyFilter()}
              />
            </div>
          </div>
          <div className="flex-1 min-w-[120px]">
            <label className="block text-xs font-medium text-gray-500 mb-1.5">구분</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B2B] focus:border-transparent transition-all"
              value={urgent}
              onChange={(e) => setUrgent(e.target.value)}
            >
              <option value="">전체</option>
              <option value="true">긴급만</option>
              <option value="false">일반만</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              onClick={applyFilter}
              className="bg-[#FF6B2B] hover:bg-orange-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors min-h-[44px]"
            >
              검색
            </button>
            <button
              onClick={resetFilter}
              className="border border-gray-200 text-gray-500 hover:bg-gray-50 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors min-h-[44px]"
            >
              초기화
            </button>
          </div>
        </div>
      </div>

      {/* Shipper: My pending orders section */}
      {role === "shipper" && myPendingOrders.length > 0 && (
        <section>
          <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#FF6B2B] inline-block" />
            내 대기 중 의뢰 ({myPendingOrders.length}건)
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {myPendingOrders.map((order) => (
              <OrderBoardCard key={order.id} order={order} role={role} />
            ))}
          </div>
        </section>
      )}

      {/* Main board */}
      <section>
        {role === "shipper" && myPendingOrders.length > 0 && (
          <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
            전체 대기 의뢰 ({otherPendingOrders.length}건)
          </h2>
        )}

        {otherPendingOrders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
            <div className="text-4xl mb-3">🔍</div>
            <p className="font-semibold text-gray-700">조건에 맞는 의뢰가 없습니다</p>
            <p className="text-sm text-gray-400 mt-1">필터를 조정하거나 나중에 다시 확인해보세요</p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {otherPendingOrders.map((order) => (
              <OrderBoardCard
                key={order.id}
                order={order}
                role={role}
                onAccept={role === "driver" ? handleAccept : undefined}
                accepting={acceptingId === order.id}
              />
            ))}
          </div>
        )}
      </section>

      {/* Shipper: recent my orders (all statuses) */}
      {role === "shipper" && myOrders.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-900">내 전체 의뢰 내역</h2>
            <Link
              href="/shipper/dashboard"
              className="text-sm text-[#FF6B2B] hover:underline font-medium"
            >
              대시보드 →
            </Link>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
            {myOrders.slice(0, 8).map((o) => (
              <Link
                key={o.id}
                href={`/shipper/orders/${o.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <StatusBadge status={o.status} />
                    {o.is_urgent && <UrgentBadge />}
                  </div>
                  <p className="text-sm font-medium text-gray-800 truncate mt-1">
                    {o.origin} → {o.destination}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(o.created_at)}</p>
                </div>
                <p className="font-bold text-[#FF6B2B] text-sm shrink-0 ml-3">
                  {formatKRW(o.price)}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
