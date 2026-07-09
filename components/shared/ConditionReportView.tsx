"use client"
import { useTransition, useState } from "react"
import { confirmConditionReport } from "@/app/actions/conditionReport"
import { PHOTO_SLOT_LABEL } from "@/lib/constants/photoSlots"

export interface ConditionReport {
  id: string
  match_id: string
  type: "pickup" | "delivery"
  photos: Array<{ url: string; caption: string; slot?: string }>
  checklist: {
    exterior_ok?: boolean
    glass_ok?: boolean
    tires_ok?: boolean
    interior_ok?: boolean
    engine_ok?: boolean
    mileage?: number | null
  }
  notes?: string | null
  submitted_by: string
  shipper_confirmed: boolean
  created_at: string
}

interface Props {
  report: ConditionReport | null
  type: "pickup" | "delivery"
  isShipper?: boolean
}

const CHECKLIST_LABELS: { key: string; label: string; icon: string }[] = [
  { key: "exterior_ok", label: "외관 이상 없음", icon: "🚗" },
  { key: "glass_ok", label: "유리 이상 없음", icon: "🪟" },
  { key: "tires_ok", label: "타이어 이상 없음", icon: "⚙️" },
  { key: "interior_ok", label: "내부 이상 없음", icon: "💺" },
  { key: "engine_ok", label: "엔진 이상 없음", icon: "🔧" },
]

export function ConditionReportView({ report, type, isShipper = false }: Props) {
  const [isPending, startTransition] = useTransition()
  const [confirmed, setConfirmed] = useState(report?.shipper_confirmed ?? false)
  const [error, setError] = useState<string | null>(null)

  const typeLabel = type === "pickup" ? "픽업 전" : "인도 후"

  if (!report) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
          {typeLabel} 미제출
        </span>
      </div>
    )
  }

  function handleConfirm() {
    if (!report) return
    setError(null)
    startTransition(async () => {
      const result = await confirmConditionReport(report.id)
      if (result.error) {
        setError(result.error)
      } else {
        setConfirmed(true)
      }
    })
  }

  const allChecked = CHECKLIST_LABELS.every(item => report.checklist[item.key as keyof typeof report.checklist])
  const checkedCount = CHECKLIST_LABELS.filter(item => report.checklist[item.key as keyof typeof report.checklist]).length

  return (
    <div className="space-y-3">
      {/* Status header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
            {typeLabel} 리포트 제출됨
          </span>
          {confirmed && (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
              화주 확인 완료
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400">
          {new Date(report.created_at).toLocaleDateString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      {/* Photos (슬롯 라벨 포함 — 탁송 전/후 대조용) */}
      {report.photos.length > 0 && (
        <div className="grid grid-cols-3 gap-1.5">
          {report.photos.map((photo, i) => (
            <a
              key={i}
              href={photo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 hover:opacity-90 transition-opacity"
            >
              <img
                src={photo.url}
                alt={photo.caption || `차량 사진 ${i + 1}`}
                className="w-full h-full object-cover"
              />
              {(photo.slot ? PHOTO_SLOT_LABEL[photo.slot] : photo.caption) && (
                <span className="absolute bottom-1 left-1 text-[9px] font-bold text-white bg-black/50 rounded px-1 py-0.5">
                  {photo.slot ? PHOTO_SLOT_LABEL[photo.slot] : photo.caption}
                </span>
              )}
            </a>
          ))}
        </div>
      )}

      {/* Checklist summary */}
      <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-600">체크리스트</span>
          <span className={`text-xs font-medium ${allChecked ? "text-emerald-600" : "text-amber-600"}`}>
            {checkedCount}/{CHECKLIST_LABELS.length} 정상
          </span>
        </div>
        {CHECKLIST_LABELS.map(item => {
          const ok = !!report.checklist[item.key as keyof typeof report.checklist]
          return (
            <div key={item.key} className="flex items-center gap-2 text-xs">
              <span className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                ok ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-500"
              }`}>
                {ok ? "✓" : "✗"}
              </span>
              <span className="text-gray-500">{item.icon}</span>
              <span className={ok ? "text-gray-700" : "text-red-600 font-medium"}>{item.label}</span>
            </div>
          )
        })}
        {report.checklist.mileage != null && (
          <div className="flex items-center gap-2 text-xs pt-1 border-t border-gray-200 mt-1">
            <span className="text-gray-500">🔢</span>
            <span className="text-gray-600">주행거리: <strong>{report.checklist.mileage.toLocaleString()}km</strong></span>
          </div>
        )}
      </div>

      {/* Notes */}
      {report.notes && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
          <p className="text-xs font-semibold text-amber-700 mb-0.5">특이사항</p>
          <p className="text-xs text-amber-800">{report.notes}</p>
        </div>
      )}

      {/* Shipper confirm */}
      {isShipper && !confirmed && (
        <div>
          {error && <p className="text-xs text-red-500 mb-1.5">{error}</p>}
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            {isPending ? "처리 중..." : `${typeLabel} 상태 확인`}
          </button>
        </div>
      )}
    </div>
  )
}
