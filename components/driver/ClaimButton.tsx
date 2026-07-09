"use client"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { claimOrder } from "@/app/actions/claim"
import { ArrowRight, Loader2, CheckCircle2 } from "lucide-react"
import { LegalWarningModal } from "./LegalWarningModal"

export function ClaimButton({ orderId }: { orderId: string }) {
  const [isPending, startTransition] = useTransition()
  const [claimed, setClaimed] = useState(false)
  const [showWarning, setShowWarning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function handleConfirmedClaim() {
    setError(null)
    startTransition(async () => {
      const result = await claimOrder(orderId)
      if (result.error) {
        setError(result.error)
        setShowWarning(false)
      } else {
        setShowWarning(false)
        setClaimed(true)
        setTimeout(() => router.push("/driver/matches"), 800)
      }
    })
  }

  if (claimed) {
    return (
      <div className="flex items-center justify-center gap-2 bg-emerald-500 text-white font-bold text-base py-4">
        <CheckCircle2 className="w-5 h-5" />
        수락 완료!
      </div>
    )
  }

  return (
    <div>
      {error && (
        <div className="px-4 py-2 bg-red-50 text-red-600 text-sm text-center">
          {error}
        </div>
      )}
      <button
        onClick={() => { setError(null); setShowWarning(true) }}
        disabled={isPending}
        className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 disabled:bg-orange-300 text-white font-bold text-base py-4 transition-colors"
      >
        {isPending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            수락 중...
          </>
        ) : (
          <>
            수락하기
            <ArrowRight className="w-4 h-4" />
          </>
        )}
      </button>

      <LegalWarningModal
        open={showWarning}
        loading={isPending}
        onConfirm={handleConfirmedClaim}
        onCancel={() => setShowWarning(false)}
      />
    </div>
  )
}
