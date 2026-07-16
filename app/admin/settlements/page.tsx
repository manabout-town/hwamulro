import { createServiceClient } from "@/lib/supabase/service"
import { formatKRW, formatDate } from "@/lib/utils/format"
import { PageHeader } from "@/components/shared/PageHeader"
import { markPayoutPaid } from "./actions"
import type { EscrowStatus } from "@/lib/types"

type ActiveTab = "escrow" | "payouts"

const ESCROW_STATUS_LABEL: Record<EscrowStatus, string> = {
  held: "보관 중",
  released: "지급 완료",
  refunded: "환불 완료",
  disputed: "분쟁 중",
}

const ESCROW_STATUS_COLOR: Record<EscrowStatus, string> = {
  held: "bg-amber-100 text-amber-700",
  released: "bg-emerald-100 text-emerald-700",
  refunded: "bg-gray-100 text-gray-600",
  disputed: "bg-red-100 text-red-700",
}

const PAYOUT_STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
}

const PAYOUT_STATUS_LABEL: Record<string, string> = {
  pending: "대기 중",
  paid: "지급 완료",
}

export default async function AdminSettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const activeTab: ActiveTab = tab === "payouts" ? "payouts" : "escrow"

  // 관리자 전용(admin/layout 에서 role 검증) — 타 회원 PII 조회는 service-role 로.
  const service = createServiceClient()

  const [{ data: escrows }, { data: payouts }] = await Promise.all([
    service
      .from("escrow")
      .select(`
        *,
        order:orders(origin, destination, vehicle_count, pickup_at),
        match:matches(driver_id, drivers:users!driver_id(name, email))
      `)
      .order("held_at", { ascending: false })
      .limit(100),
    service
      .from("payouts")
      .select(`
        *,
        driver:users!driver_id(name, email)
      `)
      .order("paid_at", { ascending: false })
      .limit(50),
  ])

  // Summary calculations
  const heldTotal =
    escrows
      ?.filter((e) => e.status === "held")
      .reduce((s, e) => s + (e.total_amount ?? 0), 0) ?? 0

  const releasedTotal =
    escrows
      ?.filter((e) => e.status === "released")
      .reduce((s, e) => s + (e.total_amount ?? 0), 0) ?? 0

  const feeTotal =
    escrows
      ?.filter((e) => e.status === "released")
      .reduce((s, e) => s + (e.platform_fee ?? 0), 0) ?? 0

  const refundedTotal =
    escrows
      ?.filter((e) => e.status === "refunded")
      .reduce((s, e) => s + (e.total_amount ?? 0), 0) ?? 0

  const summaryCards = [
    {
      label: "에스크로 보관 중",
      value: formatKRW(heldTotal),
      icon: "🔒",
      bg: "bg-amber-50 border-amber-100",
      color: "text-amber-700",
    },
    {
      label: "정산 완료",
      value: formatKRW(releasedTotal),
      icon: "✅",
      bg: "bg-emerald-50 border-emerald-100",
      color: "text-emerald-700",
    },
    {
      label: "플랫폼 수수료 누적",
      value: formatKRW(feeTotal),
      icon: "💰",
      bg: "bg-indigo-50 border-indigo-100",
      color: "text-indigo-700",
    },
    {
      label: "환불 처리",
      value: formatKRW(refundedTotal),
      icon: "↩️",
      bg: "bg-gray-50 border-gray-200",
      color: "text-gray-700",
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="정산 관리"
        description="에스크로 보관 및 기사 정산 내역"
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summaryCards.map((c) => (
          <div key={c.label} className={`${c.bg} border rounded-2xl p-4`}>
            <div className="text-xl mb-1.5">{c.icon}</div>
            <div className={`text-lg md:text-xl font-bold tracking-tight ${c.color}`}>
              {c.value}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        <a
          href="/admin/settlements"
          className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            activeTab === "escrow"
              ? "bg-[#FF6B2B] text-white shadow-sm"
              : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
          }`}
        >
          에스크로 내역
          <span
            className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              activeTab === "escrow" ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            {escrows?.length ?? 0}
          </span>
        </a>
        <a
          href="/admin/settlements?tab=payouts"
          className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
            activeTab === "payouts"
              ? "bg-[#FF6B2B] text-white shadow-sm"
              : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
          }`}
        >
          정산 내역
          <span
            className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              activeTab === "payouts" ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
            }`}
          >
            {payouts?.length ?? 0}
          </span>
        </a>
      </div>

      {/* Escrow tab */}
      {activeTab === "escrow" && (
        <>
          {!escrows || escrows.length === 0 ? (
            <EmptyState icon="🔒" message="에스크로 내역이 없습니다" />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[800px]">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {["구간", "기사", "총액", "수수료", "기사 지급액", "상태", "생성일"].map(
                          (h) => (
                            <th
                              key={h}
                              className="px-4 py-3 text-left text-xs font-semibold text-gray-500 whitespace-nowrap"
                            >
                              {h}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {escrows.map((e: any) => {
                        const order = e.order
                        const driver = e.match?.drivers
                        const status = e.status as EscrowStatus
                        return (
                          <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3.5 font-medium text-gray-900 whitespace-nowrap">
                              {order ? (
                                <div>
                                  <div className="truncate max-w-[160px]">
                                    {order.origin} → {order.destination}
                                  </div>
                                  <div className="text-xs text-gray-400">
                                    차량 {order.vehicle_count}대
                                  </div>
                                </div>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              {driver ? (
                                <div>
                                  <div className="font-medium text-gray-900">{driver.name}</div>
                                  <div className="text-xs text-gray-400">{driver.email}</div>
                                </div>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 font-bold text-gray-900 whitespace-nowrap">
                              {formatKRW(e.total_amount ?? 0)}
                            </td>
                            <td className="px-4 py-3.5 text-indigo-600 font-medium whitespace-nowrap">
                              {formatKRW(e.platform_fee ?? 0)}
                            </td>
                            <td className="px-4 py-3.5 text-emerald-700 font-medium whitespace-nowrap">
                              {formatKRW(e.driver_payout ?? 0)}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <span
                                className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                                  ESCROW_STATUS_COLOR[status] ?? "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {ESCROW_STATUS_LABEL[status] ?? status}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-gray-400 text-xs whitespace-nowrap">
                              {formatDate(e.held_at)}
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
                {escrows.map((e: any) => {
                  const order = e.order
                  const driver = e.match?.drivers
                  const status = e.status as EscrowStatus
                  return (
                    <div key={e.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-900 text-sm truncate">
                            {order ? `${order.origin} → ${order.destination}` : "—"}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {driver?.name ?? "기사 미배정"}
                          </div>
                        </div>
                        <span
                          className={`text-[10px] px-2 py-1 rounded-full font-semibold shrink-0 ${
                            ESCROW_STATUS_COLOR[status] ?? "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {ESCROW_STATUS_LABEL[status] ?? status}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <div className="text-gray-400">총액</div>
                          <div className="font-bold text-gray-900">{formatKRW(e.total_amount ?? 0)}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">수수료</div>
                          <div className="font-medium text-indigo-600">{formatKRW(e.platform_fee ?? 0)}</div>
                        </div>
                        <div>
                          <div className="text-gray-400">기사 지급</div>
                          <div className="font-medium text-emerald-700">{formatKRW(e.driver_payout ?? 0)}</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* Payouts tab */}
      {activeTab === "payouts" && (
        <>
          {!payouts || payouts.length === 0 ? (
            <EmptyState icon="💸" message="정산 내역이 없습니다" />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[600px]">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {["기사", "금액", "상태", "등록일", ""].map((h) => (
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
                      {payouts.map((p: any) => (
                        <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="font-medium text-gray-900">{p.driver?.name ?? "—"}</div>
                            <div className="text-xs text-gray-400">{p.driver?.email}</div>
                          </td>
                          <td className="px-4 py-3.5 font-bold text-gray-900 whitespace-nowrap">
                            {formatKRW(p.amount ?? 0)}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <span
                              className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                                PAYOUT_STATUS_COLOR[p.status] ?? "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {PAYOUT_STATUS_LABEL[p.status] ?? p.status}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-gray-400 text-xs whitespace-nowrap">
                            {formatDate(p.paid_at)}
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            {p.status === "pending" && (
                              <form action={markPayoutPaid.bind(null, p.id)}>
                                <button
                                  type="submit"
                                  className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-semibold transition-colors"
                                >
                                  지급 완료 처리
                                </button>
                              </form>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {payouts.map((p: any) => (
                  <div key={p.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <div className="font-semibold text-gray-900">{p.driver?.name ?? "—"}</div>
                        <div className="text-xs text-gray-400">{p.driver?.email}</div>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-1 rounded-full font-semibold shrink-0 ${
                          PAYOUT_STATUS_COLOR[p.status] ?? "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {PAYOUT_STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-lg font-bold text-gray-900">
                          {formatKRW(p.amount ?? 0)}
                        </div>
                        <div className="text-xs text-gray-400">{formatDate(p.paid_at)}</div>
                      </div>
                      {p.status === "pending" && (
                        <form action={markPayoutPaid.bind(null, p.id)}>
                          <button
                            type="submit"
                            className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 min-h-[44px] rounded-xl font-semibold transition-colors"
                          >
                            지급 완료
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
      <p className="text-3xl mb-3">{icon}</p>
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  )
}
