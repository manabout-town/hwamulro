import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { resolveCommunityFeed, type FeedDeps } from "@/lib/community/feedFlow"

const VALID_CATEGORIES = ["buy", "sell", "photo", "info"]

// 커뮤니티 목록·글보기+댓글 공개 조회(모바일 앱용). users_select RLS가 020에서
// 본인 행만 조회로 바뀌어(연락처 페이월) 모바일 anon+세션으로 author 임베드 조인이
// 불가능해졌음 — service-role로 서버에서 조회하고 name·role 두 필드만 내려준다
// (phone/email 등 PII는 feedFlow의 sanitizePost가 방어적으로 한 번 더 걸러낸다).
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const postId = searchParams.get("postId") ?? undefined
  const categoryRaw = searchParams.get("category") ?? undefined
  const category = categoryRaw && VALID_CATEGORIES.includes(categoryRaw) ? categoryRaw : undefined

  const service = createServiceClient()

  const AUTHOR_SELECT = "author:users!author_id(name, role)"

  const deps: FeedDeps = {
    fetchList: async (cat) => {
      let query = service
        .from("community_posts")
        .select(`id, category, title, content, images, price, like_count, comment_count, created_at, ${AUTHOR_SELECT}`)
        .eq("is_hidden", false)
        .order("created_at", { ascending: false })
        .limit(50)
      if (cat) query = query.eq("category", cat)
      const { data, error } = await query
      if (error) throw new Error(error.message)
      return (data ?? []) as never
    },
    fetchPost: async (id) => {
      const { data, error } = await service
        .from("community_posts")
        .select(`id, category, title, content, images, price, like_count, comment_count, created_at, author_id, is_hidden, ${AUTHOR_SELECT}`)
        .eq("id", id)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data as never
    },
    fetchComments: async (postId) => {
      const { data, error } = await service
        .from("community_comments")
        .select(`id, content, created_at, author_id, ${AUTHOR_SELECT}`)
        .eq("post_id", postId)
        .eq("is_hidden", false)
        .order("created_at", { ascending: true })
      if (error) throw new Error(error.message)
      return (data ?? []) as never
    },
  }

  try {
    const result = await resolveCommunityFeed(deps, { postId, category })
    if (result.mode === "not_found") {
      return NextResponse.json({ error: "게시글을 찾을 수 없습니다" }, { status: 404 })
    }
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
