"use client"
import { useState, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { createPost } from "@/app/actions/community"
import { COMMUNITY_CATEGORIES, type CategoryKey } from "./constants"

interface UploadedImage {
  url: string
  localPreview: string
}

export function PostForm({ initialCategory }: { initialCategory?: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [category, setCategory] = useState<CategoryKey>(
    (COMMUNITY_CATEGORIES.some(c => c.key === initialCategory) ? initialCategory : "info") as CategoryKey
  )
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [price, setPrice] = useState("")
  const [images, setImages] = useState<UploadedImage[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  const isTrade = category === "buy" || category === "sell"

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    if (images.length + files.length > 6) {
      setError("사진은 최대 6장까지 업로드할 수 있습니다")
      return
    }
    setUploading(true)
    setError(null)
    for (const file of files) {
      try {
        const localPreview = URL.createObjectURL(file)
        const ext = file.name.split(".").pop() || "jpg"
        const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from("community-images")
          .upload(path, file, { contentType: file.type })
        if (uploadError) throw uploadError
        const { data: { publicUrl } } = supabase.storage.from("community-images").getPublicUrl(path)
        setImages(prev => [...prev, { url: publicUrl, localPreview }])
      } catch (err: any) {
        setError(`사진 업로드 실패: ${err.message}`)
        break
      }
    }
    setUploading(false)
    e.target.value = ""
  }

  function removeImage(index: number) {
    setImages(prev => {
      const next = [...prev]
      URL.revokeObjectURL(next[index].localPreview)
      next.splice(index, 1)
      return next
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) { setError("제목을 입력해주세요"); return }
    if (!content.trim()) { setError("내용을 입력해주세요"); return }

    const formData = new FormData()
    formData.set("category", category)
    formData.set("title", title.trim())
    formData.set("content", content.trim())
    if (isTrade && price) formData.set("price", price)
    formData.set("images", JSON.stringify(images.map(i => ({ url: i.url }))))

    startTransition(async () => {
      try {
        const result = await createPost(formData)
        if (result?.error) setError(result.error)
      } catch (err: any) {
        // 성공 시 서버 액션이 redirect → NEXT_REDIRECT는 재던짐
        if (err?.digest?.startsWith("NEXT_REDIRECT")) throw err
        setError(err?.message || "오류가 발생했습니다")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* 카테고리 선택 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
        <h2 className="font-semibold text-gray-900 text-sm">카테고리</h2>
        <div className="grid grid-cols-2 gap-2">
          {COMMUNITY_CATEGORIES.map(c => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCategory(c.key)}
              className={`px-3 py-3 rounded-xl border-2 text-left transition-all ${
                category === c.key
                  ? "border-indigo-400 bg-indigo-50"
                  : "border-gray-100 bg-gray-50 hover:border-gray-200"
              }`}
            >
              <div className="text-sm font-semibold text-gray-800">{c.icon} {c.label}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">{c.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 제목/내용 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="제목"
          maxLength={100}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        {isTrade && (
          <input
            type="number"
            min={0}
            value={price}
            onChange={e => setPrice(e.target.value)}
            placeholder="희망 가격 (원, 선택)"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        )}
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          placeholder={category === "photo"
            ? "운행 중 촬영한 사진과 함께 이야기를 공유해보세요..."
            : isTrade
            ? "차량/물품 정보, 연식, 상태, 거래 방법 등을 자세히 적어주세요..."
            : "내용을 입력하세요..."}
          rows={8}
          maxLength={5000}
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>

      {/* 사진 */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm">
            사진 <span className="text-gray-400 font-normal">({images.length}/6{category === "photo" ? " · 운행사진 권장" : " · 선택"})</span>
          </h2>
          {images.length < 6 && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-xs text-indigo-600 font-semibold px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors disabled:opacity-50"
            >
              {uploading ? "업로드 중..." : "+ 사진 추가"}
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
          disabled={uploading}
        />
        {images.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {images.map((img, i) => (
              <div key={i} className="relative aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.localPreview} alt="" className="w-full h-full object-cover rounded-xl border border-gray-200" />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute top-1 right-1 w-6 h-6 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center text-xs font-bold"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-3 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 transition-colors"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={isPending || uploading}
          className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
        >
          {isPending ? "등록 중..." : "게시글 등록"}
        </button>
      </div>
    </form>
  )
}
