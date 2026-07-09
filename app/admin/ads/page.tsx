import { createServiceClient } from "@/lib/supabase/service"
import { PageHeader } from "@/components/shared/PageHeader"
import { AdminAdsClient } from "./AdminAdsClient"

export default async function AdminAdsPage() {
  const service = createServiceClient()
  const { data: banners } = await service
    .from("ad_banners")
    .select("*")
    .order("created_at", { ascending: false })

  return (
    <div>
      <PageHeader
        title="광고 배너 관리"
        description={`총 ${banners?.length || 0}개 · 활성 ${banners?.filter(b => b.is_active).length || 0}개 — 제휴 문의: /partnership`}
      />
      <AdminAdsClient banners={(banners as any[]) || []} />
    </div>
  )
}
