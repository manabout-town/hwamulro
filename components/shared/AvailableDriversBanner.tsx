import { createServiceClient } from "@/lib/supabase/service"
import Link from "next/link"

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  const days = ["일","월","화","수","목","금","토"]
  return `${d.getMonth()+1}/${d.getDate()}(${days[d.getDay()]})`
}

export async function AvailableDriversBanner() {
  // 공개 기사 운행일정 배너(기사가 직접 등록·공개). 기사 이름·연락처 임베드를
  // 읽으려 service-role 사용(행은 status=active 공개 일정으로 한정).
  const service = createServiceClient()

  const today = new Date().toISOString().split("T")[0]
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

  const { data: schedules } = await service
    .from("driver_schedules")
    .select(`
      *,
      drivers:users!driver_id(
        id, name, phone,
        driver_profiles(vehicle_type, rating_avg, rating_count, is_verified)
      )
    `)
    .eq("status", "active")
    .gte("available_date", today)
    .lte("available_date", nextWeek)
    .order("available_date", { ascending: true })
    .limit(20)

  if (!schedules || schedules.length === 0) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-semibold text-gray-900">운행 가능한 기사</h2>
          <p className="text-xs text-gray-400 mt-0.5">향후 7일 내 운행 가능 기사 {schedules.length}명</p>
        </div>
      </div>

      <div className="grid gap-3">
        {schedules.map((s: any) => {
          const dp = s.drivers?.driver_profiles
          const hasRating = (dp?.rating_avg || 0) > 0
          return (
            <div key={s.id} className="bg-white border border-gray-100 rounded-2xl p-4 hover:border-indigo-200 hover:shadow-sm transition-all">
              <div className="flex items-start justify-between gap-4">
                {/* 기사 정보 */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold shrink-0">
                    {s.drivers?.name?.[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{s.drivers?.name}</span>
                      {dp?.is_verified && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold">인증</span>
                      )}
                      {hasRating && (
                        <span className="text-[10px] text-amber-600 font-semibold">★ {(dp.rating_avg).toFixed(1)}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {dp?.vehicle_type || "차량 미등록"}
                      {hasRating && ` · 리뷰 ${dp.rating_count}건`}
                    </p>
                  </div>
                </div>

                {/* 날짜 + 연락 */}
                <div className="shrink-0 text-right">
                  <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
                    {formatDate(s.available_date)}
                  </span>
                  {s.drivers?.phone && (
                    <a href={`tel:${s.drivers.phone}`}
                      className="mt-2 flex items-center justify-end gap-1 text-xs text-emerald-600 hover:text-emerald-800 font-medium transition-colors">
                      📞 {s.drivers.phone}
                    </a>
                  )}
                </div>
              </div>

              {/* 운행 정보 */}
              <div className="mt-3 pt-3 border-t border-gray-50 space-y-1.5">
                <div className="flex items-start gap-2 text-xs">
                  <span className="text-gray-400 shrink-0 mt-0.5">출발</span>
                  <span className="text-gray-700 font-medium">
                    {s.origin_city}{s.origin_detail ? ` · ${s.origin_detail}` : ""}
                  </span>
                </div>
                <div className="flex items-start gap-2 text-xs">
                  <span className="text-gray-400 shrink-0 mt-0.5">도착</span>
                  <div className="flex flex-wrap gap-1">
                    {s.dest_regions.slice(0, 6).map((r: string) => (
                      <span key={r} className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{r}</span>
                    ))}
                    {s.dest_regions.length > 6 && (
                      <span className="text-gray-400">+{s.dest_regions.length - 6}곳</span>
                    )}
                  </div>
                </div>
                {s.cargo_types?.length > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400">차종</span>
                    <span className="text-gray-600">{s.cargo_types.join(", ")}</span>
                  </div>
                )}
                {s.memo && (
                  <p className="text-xs text-gray-400 italic">"{s.memo}"</p>
                )}
              </div>

              {/* 의뢰 등록 버튼 */}
              <div className="mt-3">
                <Link href={`/shipper/orders/new?driverPhone=${encodeURIComponent(s.drivers?.phone || "")}&driverName=${encodeURIComponent(s.drivers?.name || "")}`}
                  className="w-full flex items-center justify-center gap-1.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition-colors">
                  이 기사에게 의뢰하기 →
                </Link>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
