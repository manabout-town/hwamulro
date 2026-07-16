import { createServiceClient } from "@/lib/supabase/service"
import { notFound } from "next/navigation"
import Link from "next/link"
import { Logo } from "@/components/shared/Logo"
import { DriverRankBadge } from "@/components/shared/DriverRankBadge"

export default async function DriverProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params
  // 공개 기사 프로필: 기사 이름·리뷰어 이름 임베드를 읽으려 service-role 사용
  // (공개 정보만 노출: 이름·평점·리뷰).
  const service = createServiceClient()

  const { data: profile } = await service
    .from("driver_profiles")
    .select("*, users(id, name, created_at)")
    .eq("user_id", userId)
    .single()

  if (!profile) notFound()

  const { data: reviews } = await service
    .from("reviews")
    .select("rating, comment, created_at, reviewer:users!reviewer_id(name)")
    .eq("reviewee_id", userId)
    .order("created_at", { ascending: false })
    .limit(10)

  const { count: completedCount } = await service
    .from("matches")
    .select("*", { count: "exact", head: true })
    .eq("driver_id", userId)
    .eq("status", "completed")

  const user = profile.users as { id: string; name: string; created_at: string } | null

  const stars = (rating: number) =>
    Array.from({ length: 5 }, (_, i) => (
      <span key={i} className={i < Math.round(rating) ? "text-amber-400" : "text-gray-200"}>★</span>
    ))

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white/95 backdrop-blur border-b border-gray-100 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center">
          <Logo />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6 md:py-10 space-y-4 md:space-y-6">
        {/* 프로필 헤더 */}
        <div className="bg-white rounded-2xl p-4 md:p-6 flex items-start gap-3 md:gap-5">
          <div className="w-14 h-14 md:w-16 md:h-16 bg-emerald-100 rounded-2xl flex items-center justify-center text-xl md:text-2xl font-bold text-emerald-700 shrink-0">
            {user?.name?.[0] ?? "기"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">{user?.name ?? "기사"}</h1>
              {profile.is_verified && (
                <span className="bg-emerald-100 text-emerald-700 text-[10px] px-2 py-0.5 rounded-full font-semibold">인증 기사</span>
              )}
              <DriverRankBadge completedCount={completedCount ?? 0} size="sm" showProgress={false} />
            </div>
            <div className="flex items-center gap-1 mb-2 md:mb-3 flex-wrap">
              {stars(profile.rating_avg)}
              <span className="text-sm font-semibold text-gray-900 ml-1">{profile.rating_avg.toFixed(1)}</span>
              <span className="text-xs text-gray-400">({profile.rating_count}건)</span>
            </div>
            <div className="flex flex-wrap gap-2 md:gap-4 text-xs md:text-sm text-gray-500">
              <span>🚚 {profile.vehicle_type}</span>
              <span>📋 완료 {completedCount ?? 0}건</span>
              <span>📅 {new Date(user?.created_at ?? "").getFullYear()}년 가입</span>
            </div>
          </div>
        </div>

        {/* 차량 정보 */}
        <div className="bg-white rounded-2xl p-4 md:p-6">
          <h2 className="font-bold text-gray-900 mb-4 md:mb-5 text-base md:text-lg">차량 정보</h2>
          <div className="grid grid-cols-2 gap-3 md:gap-4 text-sm">
            <div>
              <div className="text-xs text-gray-400 mb-1">차량 종류</div>
              <div className="font-medium text-gray-900">{profile.vehicle_type}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">차량 번호</div>
              <div className="font-medium text-gray-900">{profile.vehicle_number}</div>
            </div>
          </div>
        </div>

        {/* 통계 */}
        <div className="grid grid-cols-3 gap-2 md:gap-4">
          {[
            { label: "완료 운송", value: `${completedCount ?? 0}건` },
            { label: "평균 평점", value: `${profile.rating_avg.toFixed(1)}점` },
            { label: "받은 평가", value: `${profile.rating_count}건` },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl p-4 md:p-6 text-center">
              <div className="text-xl md:text-3xl font-bold text-gray-900 tracking-tight">{s.value}</div>
              <div className="text-xs md:text-sm text-gray-400 mt-1 md:mt-2">{s.label}</div>
            </div>
          ))}
        </div>

        {/* 리뷰 */}
        <div className="bg-white rounded-2xl p-4 md:p-6">
          <h2 className="font-bold text-gray-900 mb-4 md:mb-5 text-base md:text-lg">받은 리뷰 ({reviews?.length ?? 0})</h2>
          {reviews && reviews.length > 0 ? (
            <div className="space-y-4">
              {reviews.map((r, i) => {
                const reviewer = (Array.isArray(r.reviewer) ? r.reviewer[0] : r.reviewer) as { name: string } | null
                return (
                  <div key={i} className="border-b border-gray-50 last:border-0 pb-4 last:pb-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <div className="flex">{stars(r.rating)}</div>
                      <span className="text-xs text-gray-500">{reviewer?.name ?? "화주"}</span>
                      <span className="text-xs text-gray-300 ml-auto">
                        {new Date(r.created_at).toLocaleDateString("ko-KR")}
                      </span>
                    </div>
                    {r.comment && <p className="text-sm text-gray-600 leading-relaxed">{r.comment}</p>}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400 text-sm">아직 리뷰가 없습니다</div>
          )}
        </div>

        <div className="text-center pt-2">
          <Link href="/signup" className="inline-block bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-xl text-sm font-semibold transition-colors min-h-[44px]">
            이 기사님과 거래하기
          </Link>
        </div>
      </div>
    </div>
  )
}
