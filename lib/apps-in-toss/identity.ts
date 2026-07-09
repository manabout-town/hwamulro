import type { SupabaseClient } from "@supabase/supabase-js"

const SHADOW_EMAIL_DOMAIN = "apps.takca.internal"

export interface TossProfile {
  name: string
  role: "shipper" | "driver"
}

export interface ResolvedUser {
  userId: string
  isNew: boolean
}

export function shadowEmail(tossUserKey: string): string {
  return `toss_${tossUserKey}@${SHADOW_EMAIL_DOMAIN}`
}

/**
 * 토스 userKey를 users 레코드로 해소한다.
 * 매핑이 없으면 shadow auth 유저(합성 이메일) 생성 후 users에 매핑.
 * service: service-role Supabase 클라이언트(auth.admin 권한 필요).
 */
export async function resolveUserByTossKey(
  service: SupabaseClient,
  tossUserKey: string,
  profile: TossProfile
): Promise<ResolvedUser> {
  const { data: existing } = await service
    .from("users")
    .select("id")
    .eq("toss_user_key", tossUserKey)
    .maybeSingle()

  if (existing) {
    return { userId: existing.id, isNew: false }
  }

  const email = shadowEmail(tossUserKey)
  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { name: profile.name, role: profile.role, toss_user_key: tossUserKey },
  })
  if (createErr || !created?.user) {
    throw new Error(`shadow user 생성 실패: ${createErr?.message ?? "unknown"}`)
  }
  const userId = created.user.id

  const { error: upsertErr } = await service.from("users").upsert({
    id: userId,
    email,
    name: profile.name,
    role: profile.role,
    status: "active",
    toss_user_key: tossUserKey,
  })
  if (upsertErr) {
    throw new Error(`users 매핑 실패: ${upsertErr.message}`)
  }

  return { userId, isNew: true }
}
