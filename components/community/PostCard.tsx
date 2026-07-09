import Link from "next/link"
import { CATEGORY_LABEL, CATEGORY_COLOR, ROLE_BADGE } from "./constants"
import { formatKRW } from "@/lib/utils/format"

interface Post {
  id: string
  category: string
  title: string
  content: string
  images: { url: string }[]
  price: number | null
  like_count: number
  comment_count: number
  created_at: string
  author?: { name: string; role: string } | null
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "방금"
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const d = Math.floor(hr / 24)
  if (d < 7) return `${d}일 전`
  return new Date(dateStr).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })
}

export function PostCard({ post }: { post: Post }) {
  const roleBadge = post.author?.role ? ROLE_BADGE[post.author.role] : null
  const thumb = post.images?.[0]?.url

  return (
    <Link
      href={`/community/${post.id}`}
      className="block bg-white rounded-2xl border border-gray-100 p-4 hover:border-gray-200 hover:shadow-sm transition-all"
    >
      <div className="flex gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${CATEGORY_COLOR[post.category] || "bg-gray-100 text-gray-600"}`}>
              {CATEGORY_LABEL[post.category] || post.category}
            </span>
            {roleBadge && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${roleBadge.color}`}>
                {roleBadge.label}
              </span>
            )}
            <span className="text-[11px] text-gray-400">{post.author?.name || "익명"} · {timeAgo(post.created_at)}</span>
          </div>
          <h3 className="font-semibold text-gray-900 text-sm truncate">{post.title}</h3>
          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{post.content}</p>
          {post.price != null && (
            <p className="text-sm font-bold text-orange-600 mt-1">{formatKRW(post.price)}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
            <span>👍 {post.like_count}</span>
            <span>💬 {post.comment_count}</span>
          </div>
        </div>
        {thumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            className="w-20 h-20 rounded-xl object-cover border border-gray-100 shrink-0"
          />
        )}
      </div>
    </Link>
  )
}
