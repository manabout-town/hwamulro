"use client"
import { useState, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { submitConditionReport } from "@/app/actions/conditionReport"
import type { ChecklistData, PhotoData } from "@/app/actions/conditionReport"
import { PHOTO_SLOTS } from "@/lib/constants/photoSlots"

interface Order {
  id: string
  origin: string
  destination: string
  price: number
  pickup_at: string
}

interface Props {
  matchId: string
  type: "pickup" | "delivery"
  order: Order
  alreadySubmitted: boolean
}

const CHECKLIST_ITEMS: { key: keyof Omit<ChecklistData, "mileage">; label: string; icon: string }[] = [
  { key: "exterior_ok", label: "외관 (스크래치/파손 없음)", icon: "🚗" },
  { key: "glass_ok", label: "유리 (파손 없음)", icon: "🪟" },
  { key: "tires_ok", label: "타이어 (펑크 없음)", icon: "⚙️" },
  { key: "interior_ok", label: "내부 (깨끗한 상태)", icon: "💺" },
  { key: "engine_ok", label: "엔진 이상 없음", icon: "🔧" },
]

interface SlotPhoto {
  url: string
  localPreview: string
}

export function ConditionReportForm({ matchId, type, order, alreadySubmitted }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // 슬롯별 사진 (전면/후면/좌측면/우측면/지붕/차대번호/차키/계기판)
  const [slotPhotos, setSlotPhotos] = useState<Record<string, SlotPhoto>>({})
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null)
  const [activeSlot, setActiveSlot] = useState<string | null>(null)
  const [checklist, setChecklist] = useState<ChecklistData>({
    exterior_ok: false,
    glass_ok: false,
    tires_ok: false,
    interior_ok: false,
    engine_ok: false,
    mileage: null,
  })
  const [notes, setNotes] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const title = type === "pickup" ? "탁송 전 차량 상태 확인" : "탁송 후 차량 상태 확인"
  const subtitle = type === "pickup"
    ? "차량 픽업 전 의무 사진 8장을 촬영해 기록합니다"
    : "차량 인도 후 의무 사진 8장을 촬영해 기록합니다"

  const filledCount = Object.keys(slotPhotos).length
  const allFilled = PHOTO_SLOTS.every(s => !!slotPhotos[s.key])

  function openPicker(slotKey: string) {
    setActiveSlot(slotKey)
    // state 반영 후 파일 선택창 열기
    setTimeout(() => fileInputRef.current?.click(), 0)
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    const slotKey = activeSlot
    e.target.value = ""
    if (!file || !slotKey) return

    setUploadingSlot(slotKey)
    setError(null)
    try {
      const localPreview = URL.createObjectURL(file)
      const ext = file.name.split(".").pop() || "jpg"
      const path = `${matchId}/${type}/${slotKey}_${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from("condition-reports")
        .upload(path, file, { contentType: file.type })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from("condition-reports")
        .getPublicUrl(path)

      setSlotPhotos(prev => {
        if (prev[slotKey]) URL.revokeObjectURL(prev[slotKey].localPreview)
        return { ...prev, [slotKey]: { url: publicUrl, localPreview } }
      })
    } catch (err: any) {
      setError(`사진 업로드 실패: ${err.message}`)
    }
    setUploadingSlot(null)
    setActiveSlot(null)
  }

  function removeSlotPhoto(slotKey: string) {
    setSlotPhotos(prev => {
      const next = { ...prev }
      if (next[slotKey]) URL.revokeObjectURL(next[slotKey].localPreview)
      delete next[slotKey]
      return next
    })
  }

  function toggleChecklist(key: keyof Omit<ChecklistData, "mileage">) {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!allFilled) {
      const missing = PHOTO_SLOTS.filter(s => !slotPhotos[s.key]).map(s => s.label)
      setError(`필수 사진이 누락되었습니다: ${missing.join(", ")}`)
      return
    }

    startTransition(async () => {
      const photoData: PhotoData[] = PHOTO_SLOTS.map(s => ({
        url: slotPhotos[s.key].url,
        caption: s.label,
        slot: s.key,
      }))
      const result = await submitConditionReport(matchId, type, photoData, checklist, notes)
      if (result.error) {
        setError(result.error)
      } else {
        router.push(`/chat/${matchId}`)
        router.refresh()
      }
    })
  }

  if (alreadySubmitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-sm border border-gray-100">
          <div className="text-4xl mb-3">✅</div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">이미 제출되었습니다</h2>
          <p className="text-sm text-gray-500 mb-6">
            {type === "pickup" ? "탁송 전" : "탁송 후"} 상태 리포트가 이미 제출되었습니다
          </p>
          <button
            onClick={() => router.push(`/chat/${matchId}`)}
            className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold transition-colors"
          >
            채팅으로 돌아가기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 text-lg transition-colors shrink-0"
          >
            ←
          </button>
          <div>
            <h1 className="font-bold text-gray-900 text-base">{title}</h1>
            <p className="text-xs text-gray-400">{order.origin} → {order.destination}</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-lg mx-auto px-4 py-5 space-y-5 pb-28">
        {/* Info card */}
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4">
          <p className="text-sm text-indigo-700 font-medium">{subtitle}</p>
          <p className="text-xs text-indigo-500 mt-1">
            탁송 전/후 사진은 대조 목적의 <strong>의무 제출</strong>입니다. 미제출 시 {type === "pickup" ? "운송 시작" : "완료 요청"}이 불가하며, 분쟁 발생 시 증거 자료로 활용됩니다.
          </p>
        </div>

        {/* 의무 사진 8장 슬롯 */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">
              필수 사진 <span className={`font-bold ${allFilled ? "text-emerald-600" : "text-orange-500"}`}>({filledCount}/8)</span>
            </h2>
            {!allFilled && <span className="text-[11px] text-gray-400">모든 칸을 채워야 제출 가능</span>}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />

          <div className="grid grid-cols-2 gap-2">
            {PHOTO_SLOTS.map(slot => {
              const photo = slotPhotos[slot.key]
              const isUploading = uploadingSlot === slot.key
              return (
                <div key={slot.key} className="relative">
                  {photo ? (
                    <div className="relative aspect-[4/3]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.localPreview}
                        alt={slot.label}
                        className="w-full h-full object-cover rounded-xl border-2 border-emerald-300"
                      />
                      <span className="absolute bottom-1 left-1 text-[10px] font-bold text-white bg-emerald-600/90 rounded px-1.5 py-0.5">
                        ✓ {slot.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeSlotPhoto(slot.key)}
                        className="absolute top-1 right-1 w-6 h-6 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center text-xs font-bold"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openPicker(slot.key)}
                      disabled={isUploading || uploadingSlot !== null}
                      className="w-full aspect-[4/3] border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-1 hover:border-indigo-300 hover:bg-indigo-50 transition-colors disabled:opacity-50"
                    >
                      <span className="text-xl">{isUploading ? "⏳" : slot.icon}</span>
                      <span className="text-xs font-semibold text-gray-600">
                        {isUploading ? "업로드 중..." : slot.label}
                      </span>
                      <span className="text-[10px] text-gray-400 px-2 text-center leading-tight">{slot.hint}</span>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Checklist */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <h2 className="font-semibold text-gray-900 text-sm">차량 상태 체크리스트</h2>
          <div className="space-y-2">
            {CHECKLIST_ITEMS.map(item => (
              <button
                key={item.key}
                type="button"
                onClick={() => toggleChecklist(item.key)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 transition-all text-left ${
                  checklist[item.key]
                    ? "border-emerald-400 bg-emerald-50"
                    : "border-gray-100 bg-gray-50 hover:border-gray-200"
                }`}
              >
                <span className="text-xl shrink-0">{item.icon}</span>
                <span className={`flex-1 text-sm font-medium ${
                  checklist[item.key] ? "text-emerald-700" : "text-gray-700"
                }`}>
                  {item.label}
                </span>
                <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                  checklist[item.key]
                    ? "border-emerald-500 bg-emerald-500"
                    : "border-gray-300 bg-white"
                }`}>
                  {checklist[item.key] && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                    </svg>
                  )}
                </span>
              </button>
            ))}
          </div>

          {/* Mileage */}
          <div className="pt-1">
            <label className="block text-xs font-medium text-gray-500 mb-1.5">
              주행거리 (km) <span className="text-gray-400 font-normal">선택</span>
            </label>
            <input
              type="number"
              min={0}
              value={checklist.mileage ?? ""}
              onChange={e => setChecklist(prev => ({
                ...prev,
                mileage: e.target.value ? Number(e.target.value) : null
              }))}
              placeholder="예: 45230"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-all"
            />
          </div>
        </div>

        {/* Notes */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
          <h2 className="font-semibold text-gray-900 text-sm">기타 특이사항 <span className="text-gray-400 font-normal">선택</span></h2>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="추가로 기록할 사항이 있으면 입력하세요..."
            rows={3}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-all"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}
      </form>

      {/* Sticky submit button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="max-w-lg mx-auto">
          <button
            type="submit"
            form=""
            onClick={handleSubmit}
            disabled={isPending || uploadingSlot !== null || !allFilled}
            className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-bold rounded-xl text-base transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending
              ? "제출 중..."
              : allFilled
              ? `${type === "pickup" ? "탁송 전" : "탁송 후"} 리포트 제출`
              : `필수 사진 ${8 - filledCount}장 남음`}
          </button>
        </div>
      </div>
    </div>
  )
}
