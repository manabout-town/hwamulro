import { createServiceClient } from "@/lib/supabase/service"
import { PROVINCES } from "@/lib/constants/regions"
import Link from "next/link"
import { Suspense } from "react"
import { DriversFilter } from "./DriversFilter"

const VEHICLE_TYPES = ["다마스/라보","1톤","1.4톤","2.5톤","3.5톤","5톤","11톤","18톤","25톤","윙바디","냉동/냉장","특수차량"]

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  const days = ["일","월","화","수","목","금","토"]
  return `${d.getMonth()+1}/${d.getDate()}(${days[d.getDay()]})`
}

type SearchParams = {
  date?: string
  origin?: string
  dest?: string
  vehicle?: string
}

export default async function ShipperDriversPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { date, origin, dest, vehicle } = await searchParams
  // 공개 기사 운행일정 디렉터리(기사가 직접 등록·공개). 기사 이름·연락처 임베드
  // 를 읽으려 service-role 사용(행은 status=active 공개 일정으로 한정).
  const service = createServiceClient()
  const today = new Date().toISOString().split("T")[0]

  let query = service
    .from("driver_schedules")
    .select(`
      *,
      drivers:users!driver_id(
        id, name, phone,
        driver_profiles(vehicle_type, rating_avg, rating_count, is_verified, completed_count)
      )
    `)
    .eq("status", "active")
    .gte("available_date", today)
    .order("available_date", { ascending: true })
    .limit(100)

  if (date) {
    query = query.eq("available_date", date)
  }
  if (origin) {
    query = query.eq("origin_city", origin)
  }
  if (vehicle) {
    query = query.eq("vehicle_type", vehicle)
  }

  const { data: schedules } = await query

  // dest 필터는 클라이언트에서 (배열 contains 필터)
  const filtered = dest
    ? schedules?.filter((s: any) =>
        s.dest_regions?.some((r: string) => r.startsWith(dest))
      )
    : schedules

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl md:text-3xl font-bold text-gray-900 tracking-tight">가용 기사 찾기</h1>
          <p className="text-sm md:text-base text-gray-400 mt-1 md:mt-2">운행 가능한 기사님을 찾아 의뢰하세요</p>
        </div>
      </div>

      {/* 필터 */}
      <Suspense fallback={<div className="h-20 bg-white rounded-2xl border border-gray-100 animate-pulse" />}>
        <DriversFilter
          provinces={PROVINCES}
          vehicleTypes={VEHICLE_TYPES}
          initialDate={date}
          initialOrigin={origin}
          initialDest={dest}
          initialVehicle={vehicle}
        />
      </Suspense>

      {/* 결과 카운트 */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {filtered?.length
            ? <><span className="font-semibold text-gray-900">{filtered.length}명</span>의 기사가 운행 가능합니다</>
            : "조건에 맞는 기사가 없습니다"
          }
        </p>
      </div>

      {/* 기사 카드 목록 */}
      {!filtered?.length ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <div className="text-4xl mb-3">🚛</div>
          <p className="text-gray-500 font-medium">조건에 맞는 가용 기사가 없습니다</p>
          <p className="text-sm text-gray-400 mt-1">필터를 변경하거나 날짜를 넓혀보세요</p>
          <Link href="/shipper/drivers" className="mt-4 inline-block text-sm text-orange-500 font-semibold hover:underline">
            필터 초기화
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map((s: any) => {
            const dp = s.drivers?.driver_profiles
            const hasRating = (dp?.rating_avg || 0) > 0

            return (
              <div key={s.id} className="bg-white border border-gray-100 rounded-2xl p-5 hover:border-orange-200 hover:shadow-sm transition-all">
                <div className="flex items-start justify-between gap-4">
                  {/* 기사 정보 */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 bg-orange-100 rounded-full flex items-center justify-center text-orange-700 font-bold text-lg shrink-0">
                      {s.drivers?.name?.[0] || "?"}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-900">{s.drivers?.name}</span>
                        {dp?.is_verified && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-semibold">인증</span>
                        )}
                        {hasRating && (
                          <span className="text-xs text-amber-600 font-semibold">★ {dp.rating_avg.toFixed(1)}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {dp?.vehicle_type || "차량 정보 없음"}
                        {hasRating && ` · 리뷰 ${dp.rating_count}건`}
                        {dp?.completed_count > 0 && ` · 완료 ${dp.completed_count}건`}
                      </p>
                    </div>
                  </div>

                  {/* 날짜 배지 */}
                  <div className="shrink-0 text-right">
                    <span className="text-sm font-bold text-orange-700 bg-orange-50 px-3 py-1.5 rounded-full border border-orange-100">
                      {formatDate(s.available_date)}
                    </span>
                  </div>
                </div>

                {/* 운행 정보 */}
                <div className="mt-4 space-y-2">
                  <div className="flex items-start gap-3 text-sm">
                    <span className="text-gray-400 text-xs shrink-0 mt-0.5 w-6">출발</span>
                    <span className="text-gray-800 font-medium">
                      {s.origin_city}{s.origin_detail ? ` · ${s.origin_detail}` : ""}
                    </span>
                  </div>
                  <div className="flex items-start gap-3 text-sm">
                    <span className="text-gray-400 text-xs shrink-0 mt-0.5 w-6">도착</span>
                    <div className="flex flex-wrap gap-1">
                      {s.dest_regions.slice(0, 8).map((r: string) => (
                        <span key={r} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{r}</span>
                      ))}
                      {s.dest_regions.length > 8 && (
                        <span className="text-xs text-gray-400">+{s.dest_regions.length - 8}곳</span>
                      )}
                    </div>
                  </div>
                  {s.cargo_types?.length > 0 && (
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-gray-400 text-xs shrink-0 w-6">차종</span>
                      <span className="text-xs text-gray-600">{s.cargo_types.join(", ")}</span>
                    </div>
                  )}
                  {s.memo && (
                    <p className="text-xs text-gray-400 italic pl-9">"{s.memo}"</p>
                  )}
                </div>

                {/* 액션 버튼 */}
                <div className="mt-4 flex gap-2">
                  {s.drivers?.phone && (
                    <a
                      href={`tel:${s.drivers.phone}`}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors"
                    >
                      📞 전화하기
                    </a>
                  )}
                  <Link
                    href={`/shipper/orders/new?driverPhone=${encodeURIComponent(s.drivers?.phone || "")}&driverName=${encodeURIComponent(s.drivers?.name || "")}&date=${s.available_date}&origin=${encodeURIComponent(s.origin_city)}`}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-xl transition-colors"
                  >
                    이 기사에게 의뢰하기 →
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
