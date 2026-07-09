export const COMMUNITY_CATEGORIES = [
  { key: "buy",   label: "삽니다",   icon: "🛒", description: "중고 차량·용품 구매 글" },
  { key: "sell",  label: "팝니다",   icon: "🏷️", description: "개인 중고차·용품 판매 글" },
  { key: "photo", label: "운행사진", icon: "📸", description: "운행 중 촬영한 풍경·현장 공유" },
  { key: "info",  label: "정보공유", icon: "💡", description: "탁송 일 시작·노하우·정보 공유" },
] as const

export type CategoryKey = (typeof COMMUNITY_CATEGORIES)[number]["key"]

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  COMMUNITY_CATEGORIES.map(c => [c.key, c.label])
)

export const CATEGORY_COLOR: Record<string, string> = {
  buy: "bg-emerald-100 text-emerald-700",
  sell: "bg-orange-100 text-orange-700",
  photo: "bg-sky-100 text-sky-700",
  info: "bg-violet-100 text-violet-700",
}

export const ROLE_BADGE: Record<string, { label: string; color: string }> = {
  driver: { label: "기사", color: "bg-indigo-100 text-indigo-700" },
  shipper: { label: "화주", color: "bg-orange-100 text-orange-700" },
  admin: { label: "관리자", color: "bg-amber-100 text-amber-700" },
}
