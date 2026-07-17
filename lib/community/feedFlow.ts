export type CommunityCategory = "buy" | "sell" | "photo" | "info"

/** 작성자 임베드 — 페이월 우회 차단을 위해 name·role 두 필드만 허용. */
export interface AuthorInfo {
  name: string | null
  role: string | null
}

export interface CommunityPostSummary {
  id: string
  category: string
  title: string
  content: string
  images: unknown
  price: number | null
  like_count: number
  comment_count: number
  created_at: string
  author: AuthorInfo | null
}

export interface CommunityPostDetail extends CommunityPostSummary {
  author_id: string
  is_hidden: boolean
}

export interface CommunityComment {
  id: string
  content: string
  created_at: string
  author_id: string
  author: AuthorInfo | null
}

export interface FeedDeps {
  fetchList: (category?: string) => Promise<CommunityPostSummary[]>
  fetchPost: (postId: string) => Promise<CommunityPostDetail | null>
  fetchComments: (postId: string) => Promise<CommunityComment[]>
}

export interface FeedQuery {
  postId?: string
  category?: string
}

export type FeedResult =
  | { mode: "list"; posts: CommunityPostSummary[] }
  | { mode: "detail"; post: CommunityPostDetail; comments: CommunityComment[] }
  | { mode: "not_found" }

/** 임베드 조인이 실수로 phone/email 등을 더 실어 와도 name·role 만 남긴다(방어적 필터). */
function pickAuthor(author: unknown): AuthorInfo | null {
  if (!author || typeof author !== "object") return null
  const a = author as Record<string, unknown>
  return {
    name: typeof a.name === "string" ? a.name : null,
    role: typeof a.role === "string" ? a.role : null,
  }
}

function sanitizePost<T extends { author: unknown }>(post: T): T {
  return { ...post, author: pickAuthor(post.author) }
}

/**
 * 커뮤니티 목록/글보기+댓글 조회 오케스트레이션(순수, 주입형).
 * postId 없으면 목록, 있으면 단건+댓글. 작성자 필드는 name·role 로만 제한.
 */
export async function resolveCommunityFeed(
  deps: FeedDeps,
  query: FeedQuery
): Promise<FeedResult> {
  if (query.postId) {
    const post = await deps.fetchPost(query.postId)
    if (!post || post.is_hidden) return { mode: "not_found" }
    const comments = await deps.fetchComments(query.postId)
    return {
      mode: "detail",
      post: sanitizePost(post),
      comments: comments.map(sanitizePost),
    }
  }

  const posts = await deps.fetchList(query.category)
  return { mode: "list", posts: posts.map(sanitizePost) }
}
