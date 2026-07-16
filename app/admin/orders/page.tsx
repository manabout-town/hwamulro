import { createServiceClient } from "@/lib/supabase/service"
import { formatKRW, formatDate, formatDateOnly } from "@/lib/utils/format"
import { ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from "@/lib/utils/status"
import { PageHeader } from "@/components/shared/PageHeader"
import Link from "next/link"
import type { OrderStatus } from "@/lib/types"

type StatusFilter = OrderStatus | "all"

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "pending", label: "매칭 대기" },
  { key: "matched", label: "매칭 완료" },
  { key: "in_progress", label: "운송 중" },
  { key: "completed", label: "완료" },
  { key: "cancelled", label: "취소" },
  { key: "disputed", label: "분쟁 중" },
]

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const activeStatus: StatusFilter = (status as StatusFilter) || "all"

  // 관리자 전용(admin/layout 에서 role 검증) — 타 회원 PII 조회는 service-role 로.
  const service = createServiceClient()

  let query = service
    .from("orders")
    .select(`*, shippers:users!shipper_id(name, email), matches(count)`)
    .order("created_at", { ascending: false })
    .limit(100)

  if (activeStatus !== "all") {
    query = query.eq("status", activeStatus)
  }

  const { data: orders } = await query

  // Stats: always from full dataset for counts
  const { data: allOrders } = await service
    .from("orders")
    .select("status")

  const stats: Record<StatusFilter, number> = {
    all: 0,
    pending: 0,
    matched: 0,
    in_progress: 0,
    completed: 0,
    cancelled: 0,
    disputed: 0,
  }

  if (allOrders) {
    stats.all = allOrders.length
    for (const o of allOrders) {
      const s = o.status as OrderStatus
      if (s in stats) stats[s]++
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="의뢰 관리"
        description={`총 ${stats.all}건의 운송 의뢰`}
      />

      {/* Stats */}
      <div className="grid grid-cols-3 md:grid-cols-7 gap-2 md:gap-3">
        {(["all", "pending", "matched", "in_progress", "completed", "cancelled", "disputed"] as StatusFilter[]).map((key) => (
          <StatPill
            key={key}
            label={key === "all" ? "전체" : ORDER_STATUS_LABEL[key as OrderStatus]}
            value={stats[key]}
            active={activeStatus === key}
            href={`/admin/orders${key !== "all" ? `?status=${key}` : ""}`}
            colorClass={key === "all" ? "text-gray-900" : ORDER_STATUS_COLOR[key as OrderStatus]}
          />
        ))}
      </div>

      {/* Filter tabs - scrollable on mobile */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {STATUS_TABS.map((t) => (
          <a
            key={t.key}
            href={`/admin/orders${t.key !== "all" ? `?status=${t.key}` : ""}`}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
              activeStatus === t.key
                ? "bg-[#FF6B2B] text-white shadow-sm"
                : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            {t.label}
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                activeStatus === t.key
                  ? "bg-white/20 text-white"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {stats[t.key]}
            </span>
          </a>
        ))}
      </div>

      {/* Desktop table */}
      {orders && orders.length > 0 ? (
        <>
          <div className="hidden md:block bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[860px]">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {["구간", "차량", "화주", "금액", "상태", "픽업일", "등록일", ""].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orders.map((o: any) => {
                    const matchCount =
                      o.matches?.[0]?.count ?? 0
                    return (
                      <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3.5 font-medium text-gray-900 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            {o.is_urgent && (
                              <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold shrink-0">
                                긴급
                              </span>
                            )}
                            <span className="truncate max-w-[180px]">
                              {o.origin} → {o.destination}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap">
                          {o.vehicle_count}대
                          {matchCount > 0 && (
                            <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">
                              매칭 {matchCount}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="text-gray-900 font-medium">{o.shippers?.name}</div>
                          <div className="text-xs text-gray-400">{o.shippers?.email}</div>
                        </td>
                        <td className="px-4 py-3.5 font-bold text-gray-900 whitespace-nowrap">
                          {formatKRW(o.price)}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span
                            className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                              ORDER_STATUS_COLOR[o.status as OrderStatus] ?? "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-gray-500 whitespace-nowrap text-xs">
                          {formatDateOnly(o.pickup_at)}
                        </td>
                        <td className="px-4 py-3.5 text-gray-400 whitespace-nowrap text-xs">
                          {formatDateOnly(o.created_at)}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <Link
                            href={`/admin/orders/${o.id}`}
                            className="text-xs text-[#FF6B2B] hover:text-orange-600 font-medium"
                          >
                            상세 →
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {orders.map((o: any) => {
              const matchCount = o.matches?.[0]?.count ?? 0
              return (
                <div
                  key={o.id}
                  className="bg-white rounded-2xl border border-gray-100 p-4"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {o.is_urgent && (
                          <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold shrink-0">
                            긴급
                          </span>
                        )}
                        <span className="font-semibold text-gray-900 text-sm truncate">
                          {o.origin} → {o.destination}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400">
                        {o.shippers?.name} · 차량 {o.vehicle_count}대
                        {matchCount > 0 && ` · 매칭 ${matchCount}건`}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-1 rounded-full font-semibold shrink-0 ${
                        ORDER_STATUS_COLOR[o.status as OrderStatus] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {ORDER_STATUS_LABEL[o.status as OrderStatus] ?? o.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold text-gray-900">{formatKRW(o.price)}</div>
                      <div className="text-xs text-gray-400">픽업 {formatDateOnly(o.pickup_at)}</div>
                    </div>
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-2 rounded-xl font-medium transition-colors"
                    >
                      상세 →
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-center text-xs text-gray-400 py-2">
            최근 100건 표시 · 총 {stats[activeStatus]}건
          </p>
        </>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <p className="text-3xl mb-3">📦</p>
          <p className="text-sm text-gray-400">해당하는 의뢰가 없습니다</p>
        </div>
      )}
    </div>
  )
}

function StatPill({
  label,
  value,
  active,
  href,
  colorClass,
}: {
  label: string
  value: number
  active: boolean
  href: string
  colorClass: string
}) {
  return (
    <a
      href={href}
      className={`rounded-xl border p-3 text-center transition-colors ${
        active
          ? "bg-[#FF6B2B] border-orange-400 text-white"
          : "bg-white border-gray-100 hover:bg-gray-50"
      }`}
    >
      <div className={`text-lg font-bold ${active ? "text-white" : colorClass}`}>
        {value}
      </div>
      <div className={`text-[10px] mt-0.5 ${active ? "text-white/80" : "text-gray-500"}`}>
        {label}
      </div>
    </a>
  )
}
