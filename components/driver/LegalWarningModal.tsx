"use client"
import { useState } from "react"

interface Props {
  open: boolean
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

const WARNINGS = [
  {
    icon: "🚫",
    title: "대리운행·제3자 운행 절대 금지",
    body: "수락한 기사 본인 외 다른 사람(대리기사·지인 포함)이 운행할 경우 법적 처벌 대상이 되며, 보험 적용이 거부될 수 있습니다. 적발 시 계정 영구정지 및 민·형사상 책임을 집니다.",
    critical: true,
  },
  {
    icon: "📸",
    title: "탁송 전/후 차량 사진 8장 의무 제출",
    body: "전면·후면·좌측면·우측면·지붕·차대번호·차키·계기판 사진을 탁송 전과 후에 각각 제출해야 합니다. 미제출 시 운송 시작 및 완료 처리가 불가합니다.",
  },
  {
    icon: "⚠️",
    title: "안전 운행 서약",
    body: "무면허·음주·약물 상태의 운행은 금지되며, 차량 파손·분실 발생 시 배상 책임이 발생할 수 있습니다.",
  },
]

/**
 * 의뢰 수락 직전 법적 경고 모달
 * — 경고 확인 체크 후에만 최종 수락 가능
 */
export function LegalWarningModal({ open, loading = false, onConfirm, onCancel }: Props) {
  const [agreed, setAgreed] = useState(false)

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={e => {
        e.preventDefault()
        e.stopPropagation()
        if (e.target === e.currentTarget && !loading) onCancel()
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto"
        onClick={e => { e.preventDefault(); e.stopPropagation() }}
      >
        <div className="p-5 space-y-4">
          <div className="text-center">
            <div className="text-3xl mb-1.5">⚖️</div>
            <h3 className="font-bold text-gray-900 text-lg">수락 전 필수 확인 사항</h3>
            <p className="text-xs text-gray-400 mt-1">아래 내용을 확인해야 의뢰 수락이 진행됩니다</p>
          </div>

          <div className="space-y-2.5">
            {WARNINGS.map((w, i) => (
              <div
                key={i}
                className={`rounded-xl border p-3.5 ${
                  w.critical ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-100"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-base">{w.icon}</span>
                  <span className={`text-sm font-bold ${w.critical ? "text-red-700" : "text-amber-800"}`}>
                    {w.title}
                  </span>
                </div>
                <p className={`text-xs leading-relaxed ${w.critical ? "text-red-600" : "text-amber-700"}`}>
                  {w.body}
                </p>
              </div>
            ))}
          </div>

          <label className="flex items-start gap-2.5 px-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-orange-500 shrink-0"
            />
            <span className="text-xs text-gray-600 leading-relaxed">
              위 내용을 모두 확인했으며, <strong className="text-gray-900">본인이 직접 운행</strong>하고
              탁송 전/후 의무 사진을 제출할 것을 서약합니다.
            </span>
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 py-3 min-h-[44px] border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!agreed || loading}
              className="flex-1 py-3 min-h-[44px] bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? "수락 중..." : "확인 후 최종 수락"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
