"use server"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"

// POL-081 / OPS-002: 개인위치정보 이용동의 + 서버측 강제 수집

export async function getLocationConsent(): Promise<{ consented: boolean }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { consented: false }
  const { data } = await supabase.from("users").select("location_consent_at").eq("id", user.id).single()
  return { consented: !!data?.location_consent_at }
}

export async function grantLocationConsent() {
  const supabase = await createClient()
  const service = createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다" }

  await service.from("users").update({ location_consent_at: new Date().toISOString() }).eq("id", user.id)
  await service.from("location_consents").insert({ user_id: user.id, consented: true })
  return { success: true }
}

export async function revokeLocationConsent() {
  const supabase = await createClient()
  const service = createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다" }

  await service.from("users").update({ location_consent_at: null }).eq("id", user.id)
  await service.from("location_consents").insert({ user_id: user.id, consented: false })
  // 철회 시 기존 위치 이력 파기
  await service.from("driver_locations").delete().eq("driver_id", user.id)
  return { success: true }
}

// 위치 기록 — 동의 + 진행 중 거래 검증 후 service role로만 기록 (직접 upsert는 RLS로 차단됨)
export async function pushDriverLocation(input: {
  matchId: string
  lat: number
  lng: number
  heading?: number | null
  speed?: number | null
}) {
  const supabase = await createClient()
  const service = createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다" }

  // 동의 검증
  const { data: u } = await supabase.from("users").select("role, location_consent_at").eq("id", user.id).single()
  if (u?.role !== "driver") return { error: "기사만 위치를 공유할 수 있습니다" }
  if (!u.location_consent_at) return { error: "no_consent" }

  // 진행 중 & 본인 매칭 검증 (완료/취소 건은 수집 중단 — POL-081)
  const { data: match } = await supabase
    .from("matches")
    .select("id, driver_id, status")
    .eq("id", input.matchId)
    .single()
  if (!match || match.driver_id !== user.id) return { error: "권한이 없습니다" }
  if (match.status !== "in_progress") return { error: "not_active" }

  await service.from("driver_locations").upsert({
    driver_id: user.id,
    lat: input.lat,
    lng: input.lng,
    heading: input.heading ?? null,
    speed: input.speed ?? null,
    match_id: input.matchId,
    updated_at: new Date().toISOString(),
  })
  return { success: true }
}
