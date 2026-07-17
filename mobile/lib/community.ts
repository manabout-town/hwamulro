// 웹 components/community/constants.ts 값 그대로 이식.
export const COMMUNITY_CATEGORIES = [
  { key: "buy", label: "삽니다", icon: "🛒", description: "중고 차량·용품 구매 글" },
  { key: "sell", label: "팝니다", icon: "🏷️", description: "개인 중고차·용품 판매 글" },
  { key: "photo", label: "운행사진", icon: "📸", description: "운행 중 촬영한 풍경·현장 공유" },
  { key: "info", label: "정보공유", icon: "💡", description: "탁송 일 시작·노하우·정보 공유" },
] as const

export type CategoryKey = (typeof COMMUNITY_CATEGORIES)[number]["key"]

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  COMMUNITY_CATEGORIES.map((c) => [c.key, c.label])
)

export const CATEGORY_COLOR: Record<string, { bg: string; fg: string }> = {
  buy: { bg: "#D1FAE5", fg: "#047857" },
  sell: { bg: "#FFEDD5", fg: "#C2410C" },
  photo: { bg: "#E0F2FE", fg: "#0369A1" },
  info: { bg: "#EDE9FE", fg: "#6D28D9" },
}

export const ROLE_BADGE: Record<string, { label: string; color: string }> = {
  driver: { label: "기사", color: "#4F46E5" },
  shipper: { label: "화주", color: "#EA580C" },
  admin: { label: "관리자", color: "#B45309" },
}

// app/api/community/feed 응답 타입(작성자는 name·role 두 필드만 내려온다).
export interface CommunityAuthor {
  name: string | null
  role: string | null
}

export interface CommunityPost {
  id: string
  category: string
  title: string
  content: string
  images: { url: string }[] | unknown
  price: number | null
  like_count: number
  comment_count: number
  created_at: string
  author: CommunityAuthor | null
}

export interface CommunityPostDetail extends CommunityPost {
  author_id: string
  is_hidden: boolean
}

export interface CommunityComment {
  id: string
  content: string
  created_at: string
  author_id: string
  author: CommunityAuthor | null
}

export type CommunityFeedResponse =
  | { mode: "list"; posts: CommunityPost[] }
  | { mode: "detail"; post: CommunityPostDetail; comments: CommunityComment[] }
