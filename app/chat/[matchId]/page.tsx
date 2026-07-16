import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { redirect, notFound } from "next/navigation"
import { ChatWindow } from "@/components/chat/ChatWindow"
import type { User } from "@/lib/types"

export default async function ChatPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // 상대(화주/기사) 프로필을 임베드로 읽으므로 service-role 사용. 접근 권한은
  // 아래 isShipper/isDriver 검증 + redirect 로 직접 강제한다(RLS 대체).
  const service = createServiceClient()

  const { data: match } = await service
    .from("matches")
    .select(`
      *,
      orders(*, shippers:users!shipper_id(*)),
      drivers:users!driver_id(*)
    `)
    .eq("id", matchId)
    .single()

  if (!match) notFound()

  // Only shipper or driver of this match can access
  const isShipper = match.orders?.shipper_id === user.id
  const isDriver = match.driver_id === user.id
  if (!isShipper && !isDriver) redirect("/")

  const { data: currentUser } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single()

  const { data: initialMessages } = await service
    .from("chats")
    .select("*, sender:users!sender_id(id, name, role)")
    .eq("match_id", matchId)
    .order("sent_at", { ascending: true })
    .limit(100)

  // Fetch condition reports for this match
  const { data: conditionReports } = await supabase
    .from("condition_reports")
    .select("*")
    .eq("match_id", matchId)
    .order("created_at", { ascending: true })

  const pickupReport = conditionReports?.find(r => r.type === "pickup") ?? null
  const deliveryReport = conditionReports?.find(r => r.type === "delivery") ?? null

  return (
    <ChatWindow
      match={match as any}
      currentUser={currentUser as User}
      initialMessages={initialMessages || []}
      isShipper={isShipper}
      pickupReport={pickupReport}
      deliveryReport={deliveryReport}
    />
  )
}
