import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { EmptyState } from "@/components/shared/EmptyState"
import { PageHeader } from "@/components/shared/PageHeader"
import { formatKRW, formatDate } from "@/lib/utils/format"
import { MATCH_STATUS_LABEL } from "@/lib/utils/status"
import { MatchStatusButtons } from "@/components/driver/MatchStatusButtons"
import Link from "next/link"

export default async function DriverMatchesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // 매칭된 화주 이름·연락처 임베드 → service-role(행은 driver_id 본인으로 한정).
  const service = createServiceClient()
  const { data: matches } = await service
    .from("matches")
    .select("*, orders(id, origin, destination, price, pickup_at, shippers:users!shipper_id(name, phone))")
    .eq("driver_id", user!.id)
    .order("matched_at", { ascending: false })

  return (
    <div>
      <PageHeader title="내 운송" description={`총 ${matches?.length || 0}건`} />

      {!matches || matches.length === 0 ? (
        <EmptyState
          icon="🚛"
          title="수락한 의뢰가 없습니다"
          description="피드에서 의뢰를 수락하면 여기 표시됩니다"
          action={
            <Link href="/driver/feed" className="btn-primary px-6 py-2.5 rounded-lg text-sm inline-block">
              의뢰 피드 보기
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4">
          {matches.map((match: any) => (
            <div key={match.id} className="bg-white rounded-2xl border border-gray-100 p-4 md:p-6 hover:border-indigo-200 hover:shadow-sm transition-all">
              <Link href={`/chat/${match.id}`} className="block">
                <div className="flex items-start justify-between gap-3 mb-3 md:mb-4">
                  <span className={`badge shrink-0 ${
                    match.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                    match.status === "in_progress" ? "bg-indigo-100 text-indigo-700" :
                    "bg-amber-100 text-amber-700"
                  }`}>
                    {MATCH_STATUS_LABEL[match.status as keyof typeof MATCH_STATUS_LABEL]}
                  </span>
                  <span className="font-bold text-base md:text-lg text-indigo-600 text-right">{formatKRW(match.orders?.price)}</span>
                </div>
                <div className="font-semibold text-gray-900 mb-1 text-sm md:text-base">
                  {match.orders?.origin} → {match.orders?.destination}
                </div>
                <div className="text-xs md:text-sm text-gray-400">
                  화주: {match.orders?.shippers?.name} · {formatDate(match.matched_at)}
                </div>
              </Link>
              <MatchStatusButtons
                matchId={match.id}
                matchStatus={match.status}
                orderId={match.orders?.id}
                orderPrice={match.orders?.price ?? 0}
                pickupAt={match.orders?.pickup_at}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
