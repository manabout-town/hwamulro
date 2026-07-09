"use client"
import { useState, useTransition } from "react"
import { reportContent } from "@/app/actions/community"

interface Props {
  targetType: "post" | "comment"
  targetId: string
  small?: boolean
}

const REASONS = ["욕설/비방", "스팸/광고", "사기 의심", "음란물/부적절한 콘텐츠", "기타"]

export function ReportButton({ targetType, targetId, small = false }: Props) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState(REASONS[0])
  const [detail, setDetail] = useState("")
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    setError(null)
    const fullReason = detail.trim() ? `${reason}: ${detail.trim()}` : reason
    startTransition(async () => {
      const result = await reportContent(targetType, targetId, fullReason)
      if (result?.error) setError(result.error)
      else {
        setDone(true)
        setTimeout(() => setOpen(false), 1200)
      }
    })
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setDone(false); setError(null) }}
        className={small
          ? "text-[11px] text-gray-300 hover:text-red-400 transition-colors"
          : "inline-flex items-center gap-1 px-3 py-2 rounded-full text-xs font-medium text-gray-400 border border-gray-200 hover:text-red-500 hover:border-red-200 transition-colors min-h-[36px]"
        }
      >
        🚨 신고
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            {done ? (
              <div className="text-center py-6">
                <div className="text-3xl mb-2">✅</div>
                <p className="font-semibold text-gray-900">신고가 접수되었습니다</p>
                <p className="text-xs text-gray-400 mt-1">관리자 검토 후 조치됩니다</p>
              </div>
            ) : (
              <>
                <div className="text-center">
                  <div className="text-2xl mb-1">🚨</div>
                  <h3 className="font-bold text-gray-900">{targetType === "post" ? "게시글" : "댓글"} 신고</h3>
                </div>

                <div className="space-y-1.5">
                  {REASONS.map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setReason(r)}
                      className={`w-full text-left px-3.5 py-2.5 rounded-xl border text-sm transition-colors ${
                        reason === r
                          ? "border-red-300 bg-red-50 text-red-700 font-semibold"
                          : "border-gray-100 bg-gray-50 text-gray-600 hover:border-gray-200"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>

                <textarea
                  value={detail}
                  onChange={e => setDetail(e.target.value)}
                  placeholder="상세 사유 (선택)"
                  rows={2}
                  maxLength={400}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300"
                />

                {error && <p className="text-xs text-red-500">{error}</p>}

                <div className="flex gap-2">
                  <button
                    onClick={() => setOpen(false)}
                    disabled={isPending}
                    className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={isPending}
                    className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
                  >
                    {isPending ? "접수 중..." : "신고하기"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
