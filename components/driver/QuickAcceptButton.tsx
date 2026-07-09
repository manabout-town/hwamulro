"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { acceptOrder } from "@/app/actions/orders"
import { LegalWarningModal } from "./LegalWarningModal"

interface Props {
  orderId: string
  price: number
}

export function QuickAcceptButton({ orderId, price }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showWarning, setShowWarning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setError(null)
    // 수락 직전 법적 경고 확인 필수
    setShowWarning(true)
  }

  async function handleConfirmedAccept() {
    setLoading(true)
    setError(null)
    try {
      const result = await acceptOrder(orderId)
      if (result?.error) {
        setError(result.error)
        setLoading(false)
        setShowWarning(false)
      }
      // 성공 시 acceptOrder가 redirect 처리
    } catch (e: any) {
      if (e?.digest?.startsWith("NEXT_REDIRECT")) throw e
      setError(e?.message || "오류가 발생했습니다")
      setLoading(false)
      setShowWarning(false)
    }
  }

  if (error) {
    return (
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setError(null) }}
        className="shrink-0 text-xs text-red-500 bg-red-50 border border-red-200 px-3 py-2 rounded-xl font-medium"
      >
        {error.length > 12 ? "오류" : error}
      </button>
    )
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        className="shrink-0 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-60 min-w-[80px] min-h-[44px]"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-1.5">
            <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
            </svg>
            수락 중
          </span>
        ) : "즉시 수락"}
      </button>

      <LegalWarningModal
        open={showWarning}
        loading={loading}
        onConfirm={handleConfirmedAccept}
        onCancel={() => setShowWarning(false)}
      />
    </>
  )
}
