import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/shared/PageHeader"
import { AdminCommunityClient } from "./AdminCommunityClient"

export default async function AdminCommunityPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const service = createServiceClient()

  // 신고 목록 + 대상 콘텐츠 로드
  const { data: reports } = await service
    .from("community_reports")
    .select("*, reporter:users!reporter_id(name)")
    .order("created_at", { ascending: false })
    .limit(100)

  const postIds = (reports || []).filter(r => r.target_type === "post").map(r => r.target_id)
  const commentIds = (reports || []).filter(r => r.target_type === "comment").map(r => r.target_id)

  const [{ data: targetPosts }, { data: targetComments }, { data: recentPosts }] = await Promise.all([
    postIds.length
      ? service.from("community_posts").select("id, title, content, is_hidden, author:users!author_id(name)").in("id", postIds)
      : Promise.resolve({ data: [] as any[] }),
    commentIds.length
      ? service.from("community_comments").select("id, content, post_id, is_hidden, author:users!author_id(name)").in("id", commentIds)
      : Promise.resolve({ data: [] as any[] }),
    service
      .from("community_posts")
      .select("id, title, category, is_hidden, like_count, comment_count, created_at, author:users!author_id(name)")
      .order("created_at", { ascending: false })
      .limit(30),
  ])

  return (
    <div>
      <PageHeader
        title="커뮤니티 관리"
        description={`신고 ${reports?.filter(r => r.status === "pending").length || 0}건 대기`}
      />
      <AdminCommunityClient
        reports={(reports as any[]) || []}
        targetPosts={(targetPosts as any[]) || []}
        targetComments={(targetComments as any[]) || []}
        recentPosts={(recentPosts as any[]) || []}
      />
    </div>
  )
}
