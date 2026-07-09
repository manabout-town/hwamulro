"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { adminResolveReport, adminSetPostHidden } from "@/app/actions/community"
import { CATEGORY_LABEL } from "@/components/community/constants"

interface Props {
  reports: any[]
  targetPosts: any[]
  targetComments: any[]
  recentPosts: any[]
}

const STATUS_LABEL: Record<string, string> = { pending: "대기", actioned: "숨김 처리", dismissed: "기각" }
const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  actioned: "bg-red-100 text-red-700",
  dismissed: "bg-gray-100 text-gray-500",
}

export function AdminCommunityClient({ reports, targetPosts, targetComments, recentPosts }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<"reports" | "posts">("reports")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const postMap = new Map(targetPosts.map(p => [p.id, p]))
  const commentMap = new Map(targetComments.map(c => [c.id, c]))

  function resolve(reportId: string, action: "hide" | "dismiss") {
    setError(null)
    startTransition(async () => {
      const result = await adminResolveReport(reportId, action)
      if (result?.error) setError(result.error)
      else router.refresh()
    })
  }

  function togglePostHidden(postId: string, hidden: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await adminSetPostHidden(postId, hidden)
      if (result?.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5">
        <button
          onClick={() => setTab("reports")}
          className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
            tab === "reports" ? "bg-gray-900 text-white" : "bg-white text-gray-500 border border-gray-200"
          }`}
        >
          🚨 신고 ({reports.filter(r => r.status === "pending").length})
        </button>
        <button
          onClick={() => setTab("posts")}
          className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
            tab === "posts" ? "bg-gray-900 text-white" : "bg-white text-gray-500 border border-gray-200"
          }`}
        >
          📋 최근 게시글
        </button>
      </div>

      {error && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}

      {tab === "reports" && (
        <div className="space-y-2.5">
          {reports.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">신고 내역이 없습니다</p>
          )}
          {reports.map(r => {
            const target = r.target_type === "post" ? postMap.get(r.target_id) : commentMap.get(r.target_id)
            const linkPostId = r.target_type === "post" ? r.target_id : target?.post_id
            return (
              <div key={r.id} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                    <span className="text-xs font-semibold text-gray-700">
                      {r.target_type === "post" ? "게시글" : "댓글"} 신고
                    </span>
                  </div>
                  <span className="text-[11px] text-gray-300">
                    {new Date(r.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>

                <p className="text-xs text-gray-500">
                  신고자: {r.reporter?.name || "-"} · 사유: <span className="text-red-600 font-medium">{r.reason}</span>
                </p>

                {target ? (
                  <div className="bg-gray-50 rounded-xl px-3.5 py-2.5">
                    <p className="text-xs text-gray-400 mb-0.5">
                      작성자: {target.author?.name || "-"}{target.is_hidden && " · 현재 숨김 상태"}
                    </p>
                    <p className="text-sm text-gray-700 line-clamp-2">
                      {r.target_type === "post" ? `[${target.title}] ${target.content}` : target.content}
                    </p>
                    {linkPostId && (
                      <Link href={`/community/${linkPostId}`} className="text-[11px] text-indigo-500 hover:underline">
                        게시글 보기 →
                      </Link>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 bg-gray-50 rounded-xl px-3.5 py-2.5">대상 콘텐츠가 삭제되었습니다</p>
                )}

                {r.status === "pending" && (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => resolve(r.id, "hide")}
                      disabled={isPending}
                      className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                    >
                      콘텐츠 숨김
                    </button>
                    <button
                      onClick={() => resolve(r.id, "dismiss")}
                      disabled={isPending}
                      className="flex-1 py-2 border border-gray-200 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      기각
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tab === "posts" && (
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
          {recentPosts.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">게시글이 없습니다</p>
          )}
          {recentPosts.map(p => (
            <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                    {CATEGORY_LABEL[p.category] || p.category}
                  </span>
                  {p.is_hidden && (
                    <span className="text-[10px] font-semibold bg-red-100 text-red-600 px-1.5 py-0.5 rounded">숨김</span>
                  )}
                </div>
                <Link href={`/community/${p.id}`} className="text-sm font-medium text-gray-800 hover:underline truncate block mt-0.5">
                  {p.title}
                </Link>
                <p className="text-[11px] text-gray-400">
                  {p.author?.name || "-"} · 👍 {p.like_count} · 💬 {p.comment_count}
                </p>
              </div>
              <button
                onClick={() => togglePostHidden(p.id, !p.is_hidden)}
                disabled={isPending}
                className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                  p.is_hidden
                    ? "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                    : "border-red-200 text-red-500 hover:bg-red-50"
                }`}
              >
                {p.is_hidden ? "노출" : "숨김"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
