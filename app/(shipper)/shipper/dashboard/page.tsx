import { createClient } from "@/lib/supabase/server"
import { AdBanner } from "@/components/shared/AdBanner"
import { EmptyState } from "@/components/shared/EmptyState"
import { RouteMap } from "@/components/shared/RouteMap"
import { AvailableDriversBanner } from "@/components/shared/AvailableDriversBanner"
import { formatKRW } from "@/lib/utils/format"
import Link from "next/link"
import { Suspense } from "react"
import {
  LayoutList, Wallet, User,
  ClipboardList, TrendingUp, Loader2, CheckCircle2, Zap,
  ArrowRight, MessageCircle,
} from "lucide-react"
import { QuickOrderSheet } from "@/components/shipper/QuickOrderSheet"

const STATUS_LABEL: Record<string, string> = {
  pending: "대기 중", matched: "매칭됨", in_progress: "운송 중",
  completed: "완료", cancelled: "취소", disputed: "분쟁",
}
const STATUS_DOT: Record<string, string> = {
  pending: "bg-amber-400", matched: "bg-orange-400", in_progress: "bg-orange-500",
  completed: "bg-emerald-400", cancelled: "bg-gray-300", disputed: "bg-red-400",
}

export default async function ShipperDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: profile }, { data: orders }] = await Promise.all([
    supabase.from("users").select("*").eq("id", user!.id).single(),
    supabase
      .from("orders")
      .select("*, matches(id, status, drivers:users!driver_id(name, phone))")
      .eq("shipper_id", user!.id)
      .order("created_at", { ascending: false }),
  ])

  const totalOrders = orders?.length || 0
  const activeOrders = orders?.filter(o => ["pending","matched","in_progress"].includes(o.status)).length || 0
  const completedOrders = orders?.filter(o => o.status === "completed").length || 0
  const totalSpent = orders?.filter(o => o.status === "completed").reduce((s, o) => s + (o.price || 0), 0) || 0
  const activeOrder = orders?.find(o => ["in_progress","matched"].includes(o.status))

  const stats = [
    { label: "전체 의뢰", value: totalOrders, suffix: "건", accent: false, icon: ClipboardList },
    { label: "진행 중", value: activeOrders, suffix: "건", accent: activeOrders > 0, icon: Loader2 },
    { label: "완료", value: completedOrders, suffix: "건", accent: false, icon: CheckCircle2 },
    { label: "총 거래액", value: formatKRW(totalSpent), suffix: "", accent: false, icon: TrendingUp },
  ]

  const quickActions = [
    { href: "/shipper/orders/new", Icon: ClipboardList, label: "상세 등록", color: "orange" },
    { href: "/shipper/dashboard", Icon: LayoutList, label: "의뢰 목록", color: "gray" },
    { href: "/shipper/wallet", Icon: Wallet, label: "에스크로", color: "gray" },
    { href: "/shipper/mypage", Icon: User, label: "마이페이지", color: "gray" },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-3xl font-bold text-gray-900 tracking-tight">
            {profile?.name || "화주"}님, 안녕하세요
          </h1>
          <p className="text-sm md:text-base text-gray-400 mt-1 md:mt-2">화주 대시보드</p>
        </div>
        <QuickOrderSheet />
      </div>

      {/* 광고 배너 */}
      <AdBanner placement="shipper_dashboard" />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <div
              key={s.label}
              className={`rounded-2xl p-4 md:p-5 border relative overflow-hidden ${
                s.accent ? "bg-orange-50 border-orange-100" : "bg-white border-gray-100"
              }`}
            >
              <Icon
                className={`w-5 h-5 absolute top-4 right-4 ${
                  s.accent ? "text-orange-300" : "text-gray-200"
                }`}
              />
              <div className={`text-2xl md:text-3xl font-bold tracking-tight ${s.accent ? "text-orange-600" : "text-gray-900"}`}>
                {s.value}{s.suffix}
              </div>
              <div className="text-xs md:text-sm text-gray-400 mt-1.5">{s.label}</div>
            </div>
          )
        })}
      </div>

      {/* Active order with route map */}
      {activeOrder && (
        <div className="bg-white border border-orange-100 rounded-2xl p-4 md:p-6 ring-1 ring-orange-200/50">
          <div className="flex items-start justify-between gap-2 mb-4 md:mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`w-2 h-2 rounded-full ${STATUS_DOT[activeOrder.status]} animate-pulse`} />
                <span className="text-sm font-semibold text-orange-600">{STATUS_LABEL[activeOrder.status]}</span>
              </div>
              <h2 className="text-base md:text-lg font-bold text-gray-900">{activeOrder.origin} → {activeOrder.destination}</h2>
            </div>
            <span className="text-lg md:text-xl font-bold text-orange-500 shrink-0">{formatKRW(activeOrder.price)}</span>
          </div>
          <RouteMap origin={activeOrder.origin} destination={activeOrder.destination} />
          {activeOrder.matches?.[0] && (
            <div className="mt-4 flex items-center justify-between bg-orange-50 rounded-xl p-4">
              <span className="text-sm text-gray-600">
                배정 기사: <span className="font-semibold text-gray-900">{(activeOrder.matches[0] as any).drivers?.name}</span>
              </span>
              <Link
                href={`/chat/${activeOrder.matches[0].id}`}
                className="flex items-center gap-1.5 text-sm font-semibold text-orange-600 hover:underline"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                채팅
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-4 gap-2 md:gap-3">
        {quickActions.map(({ href, Icon, label, color }) => (
          <Link
            key={href}
            href={href}
            className={`group bg-white border border-gray-100 rounded-2xl p-3 md:p-5 text-center hover:border-orange-200 hover:bg-orange-50/30 transition-all min-h-[72px] flex flex-col items-center justify-center`}
          >
            <div className="flex justify-center mb-1.5 md:mb-2.5">
              <div className={`w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center ${
                color === "orange"
                  ? "bg-orange-100 text-orange-600"
                  : "bg-gray-100 text-gray-500 group-hover:bg-orange-100 group-hover:text-orange-600"
              } transition-colors`}>
                <Icon className="w-4 h-4 md:w-5 md:h-5" />
              </div>
            </div>
            <div className="text-[11px] md:text-xs text-gray-600 font-medium leading-tight">{label}</div>
          </Link>
        ))}
      </div>

      {/* Available drivers banner */}
      <Suspense fallback={null}>
        <AvailableDriversBanner />
      </Suspense>

      {/* Order list */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg md:text-xl font-bold text-gray-900">최근 의뢰</h2>
          <Link href="/shipper/orders" className="text-sm text-gray-400 hover:text-orange-500 transition-colors flex items-center gap-1">
            전체 <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {!orders || orders.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="w-12 h-12 text-gray-200" />}
            title="등록된 의뢰가 없습니다"
            description="첫 번째 의뢰를 등록해보세요"
            action={
              <Link href="/shipper/orders/new" className="btn-primary px-5 py-2.5 rounded-xl text-sm inline-block">
                의뢰 등록하기
              </Link>
            }
          />
        ) : (
          <div className="space-y-3">
            {orders.slice(0, 5).map((order) => (
              <Link
                key={order.id}
                href={`/shipper/orders/${order.id}`}
                className="flex items-center gap-3 md:gap-5 bg-white border border-gray-100 rounded-2xl p-4 md:p-5 hover:border-orange-200 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-900 truncate">{order.origin} → {order.destination}</span>
                    {order.is_urgent && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full shrink-0">
                        <Zap className="w-2.5 h-2.5" />
                        긴급
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-bold text-orange-500">{formatKRW(order.price)}</div>
                  <div className="flex items-center gap-1 justify-end mt-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[order.status] || "bg-gray-300"}`} />
                    <span className="text-xs text-gray-400">{STATUS_LABEL[order.status]}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
