"use server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

export type CommunityCategory = "buy" | "sell" | "photo" | "info"

const CATEGORIES: CommunityCategory[] = ["buy", "sell", "photo", "info"]

// ============ 게시글 ============

export async function createPost(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다" }

  const category = formData.get("category") as CommunityCategory
  const title = ((formData.get("title") as string) || "").trim()
  const content = ((formData.get("content") as string) || "").trim()
  const priceRaw = formData.get("price") as string
  const imagesRaw = formData.get("images") as string

  if (!CATEGORIES.includes(category)) return { error: "잘못된 카테고리입니다" }
  if (!title || title.length > 100) return { error: "제목은 1~100자로 입력해주세요" }
  if (!content || content.length > 5000) return { error: "내용은 1~5000자로 입력해주세요" }

  let images: { url: string }[] = []
  try {
    const parsed = imagesRaw ? JSON.parse(imagesRaw) : []
    if (Array.isArray(parsed)) {
      images = parsed
        .filter((i: any) => typeof i?.url === "string")
        .slice(0, 6)
        .map((i: any) => ({ url: i.url }))
    }
  } catch { /* ignore */ }

  const price = priceRaw ? parseInt(priceRaw, 10) : null
  if (price !== null && (isNaN(price) || price < 0)) return { error: "가격이 올바르지 않습니다" }

  const { data, error } = await supabase
    .from("community_posts")
    .insert({
      author_id: user.id,
      category,
      title,
      content,
      images,
      price: (category === "buy" || category === "sell") ? price : null,
    })
    .select("id")
    .single()

  if (error) return { error: error.message }

  revalidatePath("/community")
  redirect(`/community/${data.id}`)
}

export async function deletePost(postId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다" }

  // RLS가 본인 글만 삭제 허용
  const { error } = await supabase.from("community_posts").delete().eq("id", postId).eq("author_id", user.id)
  if (error) return { error: error.message }

  revalidatePath("/community")
  redirect("/community")
}

// ============ 댓글 ============

export async function createComment(postId: string, content: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다" }

  const trimmed = (content || "").trim()
  if (!trimmed || trimmed.length > 1000) return { error: "댓글은 1~1000자로 입력해주세요" }

  // 대상 글 존재/공개 확인
  const { data: post } = await supabase
    .from("community_posts")
    .select("id, is_hidden")
    .eq("id", postId)
    .maybeSingle()
  if (!post || post.is_hidden) return { error: "게시글을 찾을 수 없습니다" }

  const { error } = await supabase.from("community_comments").insert({
    post_id: postId,
    author_id: user.id,
    content: trimmed,
  })
  if (error) return { error: error.message }

  revalidatePath(`/community/${postId}`)
  return { success: true }
}

export async function deleteComment(commentId: string, postId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다" }

  const { error } = await supabase
    .from("community_comments")
    .delete()
    .eq("id", commentId)
    .eq("author_id", user.id)
  if (error) return { error: error.message }

  revalidatePath(`/community/${postId}`)
  return { success: true }
}

// ============ 좋아요 ============

export async function toggleLike(postId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다" }

  const { data: existing } = await supabase
    .from("community_likes")
    .select("post_id")
    .eq("post_id", postId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from("community_likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", user.id)
    if (error) return { error: error.message }
    revalidatePath(`/community/${postId}`)
    return { success: true, liked: false }
  }

  const { error } = await supabase
    .from("community_likes")
    .insert({ post_id: postId, user_id: user.id })
  if (error) {
    if ((error as { code?: string }).code === "23505") return { success: true, liked: true }
    return { error: error.message }
  }
  revalidatePath(`/community/${postId}`)
  return { success: true, liked: true }
}

// ============ 신고 ============

export async function reportContent(
  targetType: "post" | "comment",
  targetId: string,
  reason: string
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다" }

  const trimmed = (reason || "").trim()
  if (!trimmed || trimmed.length > 500) return { error: "신고 사유를 1~500자로 입력해주세요" }
  if (targetType !== "post" && targetType !== "comment") return { error: "잘못된 신고 대상입니다" }

  const { error } = await supabase.from("community_reports").insert({
    target_type: targetType,
    target_id: targetId,
    reporter_id: user.id,
    reason: trimmed,
  })
  if (error) {
    if ((error as { code?: string }).code === "23505") return { error: "이미 신고한 게시물입니다" }
    return { error: error.message }
  }
  return { success: true }
}

// ============ 관리자 (신고 처리) ============

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single()
  return profile?.role === "admin" ? user : null
}

export async function adminResolveReport(
  reportId: string,
  action: "hide" | "dismiss"
) {
  const admin = await requireAdmin()
  if (!admin) return { error: "관리자 권한이 필요합니다" }

  const service = createServiceClient()
  const { data: report } = await service
    .from("community_reports")
    .select("id, target_type, target_id, status")
    .eq("id", reportId)
    .single()
  if (!report) return { error: "신고를 찾을 수 없습니다" }
  if (report.status !== "pending") return { error: "이미 처리된 신고입니다" }

  if (action === "hide") {
    const table = report.target_type === "post" ? "community_posts" : "community_comments"
    const { error: hideErr } = await service.from(table).update({ is_hidden: true }).eq("id", report.target_id)
    if (hideErr) return { error: hideErr.message }
  }

  const { error } = await service
    .from("community_reports")
    .update({ status: action === "hide" ? "actioned" : "dismissed" })
    .eq("id", reportId)
  if (error) return { error: error.message }

  revalidatePath("/admin/community")
  revalidatePath("/community")
  return { success: true }
}

export async function adminSetPostHidden(postId: string, hidden: boolean) {
  const admin = await requireAdmin()
  if (!admin) return { error: "관리자 권한이 필요합니다" }

  const service = createServiceClient()
  const { error } = await service.from("community_posts").update({ is_hidden: hidden }).eq("id", postId)
  if (error) return { error: error.message }

  revalidatePath("/admin/community")
  revalidatePath("/community")
  return { success: true }
}
