"use server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { revalidatePath } from "next/cache"
import { AD_PLACEMENTS, type AdPlacement } from "@/lib/constants/adPlacements"

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single()
  return profile?.role === "admin" ? user : null
}

export async function createBanner(formData: FormData) {
  const admin = await requireAdmin()
  if (!admin) return { error: "관리자 권한이 필요합니다" }

  const title = ((formData.get("title") as string) || "").trim()
  const advertiserName = ((formData.get("advertiser_name") as string) || "").trim()
  const contact = ((formData.get("contact") as string) || "").trim()
  const imageUrl = ((formData.get("image_url") as string) || "").trim()
  const linkUrl = ((formData.get("link_url") as string) || "").trim()
  const placement = formData.get("placement") as string
  const sortOrder = parseInt((formData.get("sort_order") as string) || "0", 10)
  const startsAt = (formData.get("starts_at") as string) || ""
  const endsAt = (formData.get("ends_at") as string) || ""

  if (!title) return { error: "제목을 입력해주세요" }
  if (!advertiserName) return { error: "광고주명을 입력해주세요" }
  if (!imageUrl) return { error: "배너 이미지를 업로드해주세요" }
  if (!AD_PLACEMENTS.includes(placement as AdPlacement)) return { error: "게재 위치를 선택해주세요" }
  if (linkUrl && !/^https?:\/\//.test(linkUrl)) return { error: "링크는 http(s)://로 시작해야 합니다" }

  const service = createServiceClient()
  const { error } = await service.from("ad_banners").insert({
    title,
    advertiser_name: advertiserName,
    contact: contact || null,
    image_url: imageUrl,
    link_url: linkUrl || null,
    placement,
    sort_order: isNaN(sortOrder) ? 0 : sortOrder,
    starts_at: startsAt ? new Date(startsAt).toISOString() : null,
    ends_at: endsAt ? new Date(endsAt).toISOString() : null,
  })
  if (error) return { error: error.message }

  revalidatePath("/admin/ads")
  return { success: true }
}

export async function toggleBannerActive(bannerId: string, isActive: boolean) {
  const admin = await requireAdmin()
  if (!admin) return { error: "관리자 권한이 필요합니다" }

  const service = createServiceClient()
  const { error } = await service.from("ad_banners").update({ is_active: isActive }).eq("id", bannerId)
  if (error) return { error: error.message }

  revalidatePath("/admin/ads")
  return { success: true }
}

export async function deleteBanner(bannerId: string) {
  const admin = await requireAdmin()
  if (!admin) return { error: "관리자 권한이 필요합니다" }

  const service = createServiceClient()
  const { error } = await service.from("ad_banners").delete().eq("id", bannerId)
  if (error) return { error: error.message }

  revalidatePath("/admin/ads")
  return { success: true }
}
