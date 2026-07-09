import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { CategoryTabs } from "@/components/community/CategoryTabs"
import { PostCard } from "@/components/community/PostCard"
import { AdBanner } from "@/components/shared/AdBanner"
import { EmptyState } from "@/components/shared/EmptyState"

interface SearchParams { category?: string }

const VALID_CATEGORIES = ["buy", "sell", "photo", "info"]

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const supabase = await createClient()

  let query = supabase
    .from("community_posts")
    .select("id, category, title, content, images, price, like_count, comment_count, created_at, author:users!author_id(name, role)")
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .limit(50)

  if (searchParams.category && VALID_CATEGORIES.includes(searchParams.category)) {
    query = query.eq("category", searchParams.category)
  }

  const { data: posts } = await query

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">커뮤니티</h1>
          <p className="text-xs md:text-sm text-gray-400 mt-0.5">기사·화주가 함께하는 공간 — 사고팔고, 운행사진, 정보공유</p>
        </div>
        <Link
          href="/community/new"
          className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
        >
          ✏️ 글쓰기
        </Link>
      </div>

      {/* 광고 배너 (커뮤니티 상단 — 중고차 업체 등 제휴 광고 최적 위치) */}
      <AdBanner placement="community" />

      <CategoryTabs />

      {!posts || posts.length === 0 ? (
        <EmptyState
          icon="💬"
          title="아직 게시글이 없습니다"
          description="첫 번째 글을 작성해보세요"
        />
      ) : (
        <div className="space-y-2.5">
          {posts.map((post: any, i: number) => (
            <div key={post.id}>
              <PostCard post={post} />
              {/* 목록 중간 광고 (7번째 글 뒤) */}
              {i === 6 && posts.length > 8 && <div className="mt-2.5"><AdBanner placement="community" /></div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
