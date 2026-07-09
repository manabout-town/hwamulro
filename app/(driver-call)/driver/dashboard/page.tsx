import { createClient } from "@/lib/supabase/server"
import { AdBanner } from "@/components/shared/AdBanner"
import { LocationTracker } from "@/components/driver/LocationTracker"
import { CallCard } from "@/components/driver/CallCard"
import { formatKRW } from "@/lib/utils/format"
import Link from "next/link"
import {
  Truck, MessageCircle, ArrowRight, Bell, Wallet,
  LayoutList, CheckCircle2,
} from "lucide-react"

export default async function DriverDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [
    { data: profile },
    { data: matches },
    { data: pendingOrders },
  ] = await Promise.all([
    supabase.from("users").select("name").eq("id", user!.id).single(),
    supabase
      .from("matches")
      .select("id, status, orders(id, title, origin, destination, price)")
      .eq("driver_id", user!.id)
      .in("status", ["accepted", "in_progress"])
      .order("matched_at", { ascending: false })
      .limit(1),
    supabase
      .from("orders")
      .select("id, title, origin, destination, price, vehicle_count, vehicle_notes, pickup_at, is_urgent")
      .eq("status", "pending")
      .order("is_urgent", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20),
  ])

  const activeMatch = matches?.[0] ?? null

  return (
    <div className="min-h-screen bg-gray-50">
      <LocationTracker
        driverId={user!.id}
        matchId={activeMatch?.id ?? null}
        active={activeMatch?.status === "in_progress"}
      />

      {/* 광고 배너 */}
      <div className="max-w-5xl mx-auto px-4 md:px-6 pt-4">
        <AdBanner placement="driver_dashboard" />
      </div>

      {/* Header */}
      <div className="bg-white sticky top-0 z-20 border-b border-gray-100 px-4">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
              <Truck className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gray-900">{profile?.name || "기사"}님</span>
          </div>
          <div className="flex items-center gap-1">
            <Link href="/driver/wallet" className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700">
              <Wallet className="w-5 h-5" />
            </Link>
            <Link href="/driver/feed" className="w-10 h-10 flex items-center justify-center text-gray-500 hover:text-gray-700">
              <Bell className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 max-w-lg mx-auto pb-24">

        {/* Active match banner */}
        {activeMatch && (
          <div className={`rounded-2xl overflow-hidden ${
            activeMatch.status === "in_progress"
              ? "bg-indigo-600"
              : "bg-indigo-50 border border-indigo-200"
          }`}>
            <div className={`px-4 py-3 flex items-center justify-between gap-3 ${
              activeMatch.status === "in_progress" ? "text-white" : "text-indigo-800"
            }`}>
              <div className="flex items-center gap-2 min-w-0">
                {activeMatch.status === "in_progress" ? (
                  <Truck className="w-4 h-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="font-bold text-sm">
                    {activeMatch.status === "in_progress" ? "운송 중" : "매칭 완료 · 대기 중"}
                  </div>
                  <div className={`text-xs truncate ${
                    activeMatch.status === "in_progress" ? "text-indigo-200" : "text-indigo-500"
                  }`}>
                    {(activeMatch.orders as any)?.origin} → {(activeMatch.orders as any)?.destination}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className={`font-black text-lg ${
                  activeMatch.status === "in_progress" ? "text-white" : "text-indigo-700"
                }`}>
                  {formatKRW(Math.round(((activeMatch.orders as any)?.price || 0) * 0.96))}
                </div>
                <Link
                  href={`/chat/${activeMatch.id}`}
                  className={`flex items-center justify-center w-9 h-9 rounded-full ${
                    activeMatch.status === "in_progress"
                      ? "bg-white/20 hover:bg-white/30 text-white"
                      : "bg-indigo-100 hover:bg-indigo-200 text-indigo-700"
                  } transition-colors`}
                >
                  <MessageCircle className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Call list header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-black text-xl text-gray-900">콜 목록</h2>
            {pendingOrders && pendingOrders.length > 0 ? (
              <p className="text-sm text-gray-500 mt-0.5">
                지금 <span className="text-orange-500 font-bold">{pendingOrders.length}건</span> 대기 중
              </p>
            ) : (
              <p className="text-sm text-gray-400 mt-0.5">현재 콜 없음</p>
            )}
          </div>
          <Link
            href="/driver/feed"
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600"
          >
            전체 피드 <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Calls */}
        {pendingOrders && pendingOrders.length > 0 ? (
          <div className="space-y-3">
            {pendingOrders.map(order => (
              <CallCard key={order.id} order={order} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <LayoutList className="w-7 h-7 text-gray-300" />
            </div>
            <p className="font-semibold text-gray-400">현재 가능한 콜이 없습니다</p>
            <p className="text-sm text-gray-300 mt-1">새 의뢰가 등록되면 알려드릴게요</p>
          </div>
        )}

      </div>
    </div>
  )
}
