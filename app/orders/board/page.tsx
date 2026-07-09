import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Navbar } from "@/components/shared/Navbar"
import { MobileNav } from "@/components/shared/MobileNav"
import { SessionGuard } from "@/components/shared/SessionGuard"
import { OrderBoardClient } from "./OrderBoardClient"
import { AdBanner } from "@/components/shared/AdBanner"
import type { User } from "@/lib/types"

interface SearchParams {
  origin?: string
  urgent?: string
}

export default async function OrderBoardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single()

  if (!profile || profile.role === "admin") redirect("/")

  const sp = await searchParams

  let query = supabase
    .from("orders")
    .select("*, shippers:users!shipper_id(name)")
    .eq("status", "pending")
    .order("is_urgent", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(60)

  if (sp.origin) query = query.ilike("origin", `%${sp.origin}%`)
  if (sp.urgent === "true") query = query.eq("is_urgent", true)
  if (sp.urgent === "false") query = query.eq("is_urgent", false)

  const { data: orders } = await query

  // Shipper: also fetch their own orders (all statuses) for context
  let myOrders: any[] = []
  if (profile.role === "shipper") {
    const { data } = await supabase
      .from("orders")
      .select("*")
      .eq("shipper_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20)
    myOrders = data || []
  }

  const urgentCount = orders?.filter((o) => o.is_urgent).length || 0

  return (
    <div className="min-h-screen bg-gray-50">
      <SessionGuard />
      <Navbar user={profile as User} />
      <main className="max-w-5xl mx-auto px-4 md:px-6 py-8 pb-28 md:pb-10">
        {/* 광고 배너 — 기사·화주 공용 오더보드 상단 */}
        <AdBanner placement="order_board" className="mb-5" />
        <OrderBoardClient
          role={profile.role}
          userId={user.id}
          orders={orders || []}
          myOrders={myOrders}
          urgentCount={urgentCount}
          initialOrigin={sp.origin || ""}
          initialUrgent={sp.urgent || ""}
        />
      </main>
      <MobileNav role={profile.role} />
    </div>
  )
}
