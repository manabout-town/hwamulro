import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { DriverMypageClient } from "./DriverMypageClient"

export default async function DriverMyPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // 매칭된 화주 이름 임베드 → service-role(행은 driver_id 본인으로 한정).
  const service = createServiceClient()

  const [
    { data: profile },
    { data: dp },
    { data: matches },
    { data: reviews },
    { data: pendingPayouts },
    { data: paidPayouts },
  ] = await Promise.all([
    supabase.from("users").select("*").eq("id", user!.id).single(),
    supabase.from("driver_profiles").select("*").eq("user_id", user!.id).maybeSingle(),
    service
      .from("matches")
      .select("*, orders(price, origin, destination, pickup_at, status, is_urgent, shippers:users!shipper_id(name))")
      .eq("driver_id", user!.id)
      .order("matched_at", { ascending: false })
      .limit(50),
    supabase
      .from("reviews")
      .select("*")
      .eq("reviewee_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("payouts")
      .select("*, escrow(total_amount, orders(origin, destination, pickup_at))")
      .eq("driver_id", user!.id)
      .eq("status", "pending"),
    supabase
      .from("payouts")
      .select("*, escrow(total_amount, orders(origin, destination, pickup_at))")
      .eq("driver_id", user!.id)
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(30),
  ])

  const completedMatches = matches?.filter((m) => m.status === "completed") || []
  const totalEarned =
    completedMatches.reduce(
      (s: number, m: any) => s + Math.floor(((m.orders as any)?.price || 0) * 0.96),
      0
    )

  const pendingAmount = pendingPayouts?.reduce((s, p) => s + (p.amount || 0), 0) || 0
  const totalPaid     = paidPayouts?.reduce((s, p) => s + (p.amount || 0), 0) || 0

  return (
    <DriverMypageClient
      profile={profile}
      dp={dp}
      matches={matches || []}
      completedMatches={completedMatches}
      reviews={reviews || []}
      totalEarned={totalEarned}
      pendingPayouts={pendingPayouts || []}
      paidPayouts={paidPayouts || []}
      pendingAmount={pendingAmount}
      totalPaid={totalPaid}
      userId={user!.id}
    />
  )
}
