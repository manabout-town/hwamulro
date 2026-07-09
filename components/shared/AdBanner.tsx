import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import type { AdPlacement } from "@/lib/constants/adPlacements"

interface Props {
  placement: AdPlacement
  className?: string
}

/**
 * 광고 배너 슬롯 (서버 컴포넌트)
 * - 활성 배너가 있으면 노출 (sort_order 순, 게재기간 필터는 RLS에서 처리)
 * - 없으면 제휴/광고 문의 안내 칸 노출 → 실제 업체 광고를 받을 수 있는 자리
 */
export async function AdBanner({ placement, className = "" }: Props) {
  const supabase = await createClient()
  const { data: banners } = await supabase
    .from("ad_banners")
    .select("id, title, advertiser_name, image_url, link_url")
    .eq("placement", placement)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(5)

  if (!banners || banners.length === 0) {
    // 빈 광고 슬롯: 제휴 문의 유도
    return (
      <Link
        href="/partnership"
        className={`block rounded-2xl border border-dashed border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors px-4 py-3 ${className}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-bold text-gray-400 border border-gray-300 rounded px-1 py-px shrink-0">AD</span>
            <p className="text-xs text-gray-400 truncate">
              이 자리에 광고를 게재해보세요 — 중고차·정비·보험 등 제휴 환영
            </p>
          </div>
          <span className="text-xs font-semibold text-indigo-500 shrink-0">광고 문의 →</span>
        </div>
      </Link>
    )
  }

  // 노출마다 순환 (간단한 로테이션)
  const banner = banners[Math.floor(Math.random() * banners.length)]

  const inner = (
    <div className="relative rounded-2xl overflow-hidden border border-gray-100 bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={banner.image_url}
        alt={`${banner.advertiser_name} 광고`}
        className="w-full h-auto max-h-28 object-cover"
      />
      <span className="absolute top-2 left-2 text-[10px] font-bold text-white bg-black/50 rounded px-1.5 py-0.5">AD</span>
      <span className="absolute bottom-2 right-2 text-[10px] text-white bg-black/40 rounded px-1.5 py-0.5">
        {banner.advertiser_name}
      </span>
    </div>
  )

  return (
    <div className={className}>
      {banner.link_url ? (
        <a href={banner.link_url} target="_blank" rel="noopener noreferrer sponsored" className="block hover:opacity-95 transition-opacity">
          {inner}
        </a>
      ) : inner}
      <div className="flex justify-end mt-1">
        <Link href="/partnership" className="text-[10px] text-gray-300 hover:text-gray-400">광고·제휴 문의</Link>
      </div>
    </div>
  )
}
