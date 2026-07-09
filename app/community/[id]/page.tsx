import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { LikeButton } from "@/components/community/LikeButton"
import { ReportButton } from "@/components/community/ReportButton"
import { CommentSection } from "@/components/community/CommentSection"
import { DeletePostButton } from "@/components/community/DeletePostButton"
import { CATEGORY_LABEL, CATEGORY_COLOR, ROLE_BADGE } from "@/components/community/constants"
import { formatKRW } from "@/lib/utils/format"

interface PageProps { params: { id: string } }

export default async function PostDetailPage({ params }: PageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: post } = await supabase
    .from("community_posts")
    .select("*, author:users!author_id(name, role)")
    .eq("id", params.id)
    .maybeSingle()

  if (!post || (post.is_hidden && post.author_id !== user.id)) notFound()

  const [{ data: comments }, { data: myLike }] = await Promise.all([
    supabase
      .from("community_comments")
      .select("id, content, created_at, author_id, author:users!author_id(name, role)")
      .eq("post_id", post.id)
      .eq("is_hidden", false)
      .order("created_at", { ascending: true }),
    supabase
      .from("community_likes")
      .select("post_id")
      .eq("post_id", post.id)
      .eq("user_id", user.id)
      .maybeSingle(),
  ])

  const author = post.author as any
  const roleBadge = author?.role ? ROLE_BADGE[author.role] : null
  const isMine = post.author_id === user.id
  const images: { url: string }[] = Array.isArray(post.images) ? post.images : []

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      <div className="flex items-center gap-3">
        <Link
          href="/community"
          className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 text-lg transition-colors"
        >
          ←
        </Link>
        <span className={`text-xs font-bold px-2 py-1 rounded ${CATEGORY_COLOR[post.category] || "bg-gray-100 text-gray-600"}`}>
          {CATEGORY_LABEL[post.category] || post.category}
        </span>
      </div>

      {post.is_hidden && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-xs text-red-600">
          이 게시글은 신고 처리로 숨김 상태입니다 (작성자에게만 표시)
        </div>
      )}

      <article className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900 break-words">{post.title}</h1>
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-gray-700">{author?.name || "익명"}</span>
              {roleBadge && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${roleBadge.color}`}>
                  {roleBadge.label}
                </span>
              )}
              <span className="text-[11px] text-gray-300">
                {new Date(post.created_at).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            {isMine && <DeletePostButton postId={post.id} />}
          </div>
        </div>

        {post.price != null && (
          <div className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3">
            <span className="text-xs text-orange-500">희망 가격</span>
            <p className="text-lg font-bold text-orange-600">{formatKRW(post.price)}</p>
          </div>
        )}

        <p className="text-sm text-gray-700 whitespace-pre-wrap break-words leading-relaxed">{post.content}</p>

        {images.length > 0 && (
          <div className={`grid gap-2 ${images.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
            {images.map((img, i) => (
              <a key={i} href={img.url} target="_blank" rel="noopener noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={`첨부 사진 ${i + 1}`}
                  className="w-full rounded-xl border border-gray-100 object-cover"
                />
              </a>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-gray-50">
          <LikeButton postId={post.id} initialCount={post.like_count} initialLiked={!!myLike} />
          {!isMine && <ReportButton targetType="post" targetId={post.id} />}
        </div>
      </article>

      <CommentSection postId={post.id} comments={(comments as any[]) || []} currentUserId={user.id} />
    </div>
  )
}
