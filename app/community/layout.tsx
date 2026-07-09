import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Navbar } from "@/components/shared/Navbar"
import { MobileNav } from "@/components/shared/MobileNav"
import { SessionGuard } from "@/components/shared/SessionGuard"
import type { User } from "@/lib/types"

// 기사·화주·관리자 공동 커뮤니티 레이아웃 (로그인 회원 전용)
export default async function CommunityLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single()

  if (!profile) redirect("/onboarding")

  return (
    <div className="min-h-screen bg-gray-50">
      <SessionGuard />
      <Navbar user={profile as User} />
      <main className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-10 pb-28 md:pb-10">{children}</main>
      <MobileNav role={profile.role} />
    </div>
  )
}
