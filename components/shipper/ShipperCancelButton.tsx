"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { cancelMatchByShipper } from "@/app/actions/matches"

export function ShipperCancelButton({ matchId }: { matchId: string }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleCancel() {
    setBusy(true)
    setError(null)
    const res = await cancelMatchByShipper(matchId)
    setBusy(false)
    if (res?.error) {
      setError(res.error)
      return
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full border border-red-200 text-red-600 py-3 rounded-xl text-sm font-semibold hover:bg-red-50 transition-colors min-h-[48px]"
      >
        의뢰 취소
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setOpen(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 text-lg">의뢰를 취소하시겠어요?</h3>
            <p className="text-sm text-gray-500 mt-2">
              운송 시작 전 취소는 전액 환불됩니다. 결제하신 경우 원결제 수단으로 영업일 5~10일 내 환불되며, 되돌릴 수 없습니다.
            </p>
            {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                닫기
              </button>
              <button
                onClick={handleCancel}
                disabled={busy}
                className="flex-1 bg-red-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? "처리 중..." : "취소하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
