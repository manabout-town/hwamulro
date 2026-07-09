"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createComment, deleteComment } from "@/app/actions/community"
import { ReportButton } from "./ReportButton"
import { ROLE_BADGE } from "./constants"

interface Comment {
  id: string
  content: string
  created_at: string
  author_id: string
  author?: { name: string; role: string } | null
}

interface Props {
  postId: string
  comments: Comment[]
  currentUserId: string
}

export function CommentSection({ postId, comments, currentUserId }: Props) {
  const router = useRouter()
  const [content, setContent] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return
    setError(null)
    startTransition(async () => {
      const result = await createComment(postId, content)
      if (result?.error) setError(result.error)
      else {
        setContent("")
        router.refresh()
      }
    })
  }

  function handleDelete(commentId: string) {
    startTransition(async () => {
      const result = await deleteComment(commentId, postId)
      if (result?.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
      <h2 className="font-semibold text-gray-900 text-sm">댓글 {comments.length}</h2>

      {comments.length === 0 ? (
        <p className="text-xs text-gray-400 py-3 text-center">첫 댓글을 남겨보세요</p>
      ) : (
        <div className="space-y-3">
          {comments.map(c => {
            const badge = c.author?.role ? ROLE_BADGE[c.author.role] : null
            const isMine = c.author_id === currentUserId
            return (
              <div key={c.id} className="border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-semibold text-gray-700 truncate">{c.author?.name || "익명"}</span>
                    {badge && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${badge.color}`}>
                        {badge.label}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-300 shrink-0">
                      {new Date(c.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isMine ? (
                      <button
                        onClick={() => handleDelete(c.id)}
                        disabled={isPending}
                        className="text-[11px] text-gray-300 hover:text-red-400 transition-colors"
                      >
                        삭제
                      </button>
                    ) : (
                      <ReportButton targetType="comment" targetId={c.id} small />
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap break-words">{c.content}</p>
              </div>
            )
          })}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder="댓글을 입력하세요..."
          maxLength={1000}
          className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <button
          type="submit"
          disabled={isPending || !content.trim()}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-40 shrink-0"
        >
          {isPending ? "..." : "등록"}
        </button>
      </form>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
