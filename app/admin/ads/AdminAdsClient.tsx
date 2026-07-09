"use client"
import { useState, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { createBanner, toggleBannerActive, deleteBanner } from "@/app/actions/ads"

const PLACEMENT_LABEL: Record<string, string> = {
  driver_feed: "기사 의뢰 피드",
  order_board: "오더보드",
  community: "커뮤니티",
  shipper_dashboard: "화주 대시보드",
  driver_dashboard: "기사 대시보드",
}

export function AdminAdsClient({ banners }: { banners: any[] }) {
  const router = useRouter()
  const [showForm, setShowForm] = useState(false)
  const [imageUrl, setImageUrl] = useState("")
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const supabase = createClient()

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const ext = file.name.split(".").pop() || "jpg"
      const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from("ad-banners")
        .upload(path, file, { contentType: file.type })
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from("ad-banners").getPublicUrl(path)
      setImageUrl(publicUrl)
    } catch (err: any) {
      setError(`이미지 업로드 실패: ${err.message}`)
    }
    setUploading(false)
    e.target.value = ""
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    formData.set("image_url", imageUrl)
    startTransition(async () => {
      const result = await createBanner(formData)
      if (result?.error) setError(result.error)
      else {
        formRef.current?.reset()
        setImageUrl("")
        setShowForm(false)
        router.refresh()
      }
    })
  }

  function handleToggle(id: string, active: boolean) {
    startTransition(async () => {
      const result = await toggleBannerActive(id, active)
      if (result?.error) setError(result.error)
      else router.refresh()
    })
  }

  function handleDelete(id: string) {
    if (!window.confirm("이 배너를 삭제할까요?")) return
    startTransition(async () => {
      const result = await deleteBanner(id)
      if (result?.error) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <button
        onClick={() => setShowForm(v => !v)}
        className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
      >
        {showForm ? "닫기" : "+ 새 배너 등록"}
      </button>

      {error && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}

      {showForm && (
        <form ref={formRef} onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <input name="title" placeholder="배너 제목 (내부 관리용)" required
              className="border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            <input name="advertiser_name" placeholder="광고주명 (예: OO중고차)" required
              className="border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            <input name="contact" placeholder="광고주 연락처/이메일 (선택)"
              className="border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            <input name="link_url" placeholder="클릭 시 이동 URL (https://..., 선택)"
              className="border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            <select name="placement" required defaultValue=""
              className="border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
              <option value="" disabled>게재 위치 선택</option>
              {Object.entries(PLACEMENT_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <input name="sort_order" type="number" placeholder="정렬 순서 (낮을수록 우선, 기본 0)"
              className="border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            <label className="text-xs text-gray-500">
              게재 시작 (선택)
              <input name="starts_at" type="datetime-local"
                className="mt-1 w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </label>
            <label className="text-xs text-gray-500">
              게재 종료 (선택)
              <input name="ends_at" type="datetime-local"
                className="mt-1 w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </label>
          </div>

          <div className="space-y-2">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-xs text-indigo-600 font-semibold px-3 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors disabled:opacity-50"
            >
              {uploading ? "업로드 중..." : imageUrl ? "배너 이미지 변경" : "📤 배너 이미지 업로드 (가로형 권장)"}
            </button>
            {imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="배너 미리보기" className="max-h-24 rounded-xl border border-gray-200" />
            )}
          </div>

          <button
            type="submit"
            disabled={isPending || uploading || !imageUrl}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-40"
          >
            {isPending ? "등록 중..." : "배너 등록"}
          </button>
        </form>
      )}

      <div className="space-y-2.5">
        {banners.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-10">
            등록된 배너가 없습니다. 광고주 문의가 오면 여기서 배너를 등록하세요.
          </p>
        )}
        {banners.map(b => (
          <div key={b.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={b.image_url} alt="" className="w-28 h-16 object-cover rounded-xl border border-gray-100 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-semibold text-gray-800 truncate">{b.title}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${b.is_active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400"}`}>
                  {b.is_active ? "활성" : "비활성"}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5 truncate">
                {b.advertiser_name} · {PLACEMENT_LABEL[b.placement] || b.placement}
                {b.contact ? ` · ${b.contact}` : ""}
              </p>
              {(b.starts_at || b.ends_at) && (
                <p className="text-[11px] text-gray-300">
                  {b.starts_at ? new Date(b.starts_at).toLocaleDateString("ko-KR") : "즉시"} ~ {b.ends_at ? new Date(b.ends_at).toLocaleDateString("ko-KR") : "무기한"}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              <button
                onClick={() => handleToggle(b.id, !b.is_active)}
                disabled={isPending}
                className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                  b.is_active
                    ? "border-gray-200 text-gray-500 hover:bg-gray-50"
                    : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                }`}
              >
                {b.is_active ? "중지" : "게재"}
              </button>
              <button
                onClick={() => handleDelete(b.id)}
                disabled={isPending}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
