import { createClient } from "@/lib/supabase/server"
import { DriverFeedCard } from "@/components/driver/DriverFeedCard"
import { EmptyState } from "@/components/shared/EmptyState"
import { PageHeader } from "@/components/shared/PageHeader"
import { FeedFilter } from "@/components/driver/FeedFilter"
import { AdBanner } from "@/components/shared/AdBanner"

interface SearchParams { origin?: string; urgent?: string }

export default async function DriverFeedPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const supabase = await createClient()

  let query = supabase
    .from("orders")
    .select("*")
    .eq("status", "pending")
    .order("is_urgent", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50)

  if (searchParams.origin) query = query.ilike("origin", `%${searchParams.origin}%`)
  if (searchParams.urgent === "true") query = query.eq("is_urgent", true)
  if (searchParams.urgent === "false") query = query.eq("is_urgent", false)

  const { data: orders } = await query

  const urgentCount = orders?.filter(o => o.is_urgent).length || 0

  return (
    <div>
      <PageHeader
        title="탁송 의뢰 피드"
        description={`${orders?.length || 0}건 | 긴급 ${urgentCount}건`}
      />

      <FeedFilter />

      {/* 광고 배너 — 기사들이 매일 보는 피드 상단 */}
      <AdBanner placement="driver_feed" className="mb-4" />

      {!orders || orders.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="조건에 맞는 의뢰가 없습니다"
          description="필터를 조정하거나 나중에 다시 확인해보세요"
        />
      ) : (
        <div className="grid gap-4">
          {orders.map(order => (
            <DriverFeedCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  )
}
