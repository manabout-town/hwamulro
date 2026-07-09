import type { SupabaseClient } from "@supabase/supabase-js"

export interface MintedSession {
  accessToken: string
  refreshToken: string
}

/**
 * shadow 유저(비번 없음)에게 서버에서 Supabase 세션을 직접 발급한다.
 * admin: service-role 클라이언트(generateLink). verifier: 세션 미저장 클라이언트(verifyOtp).
 * 메일은 발송되지 않는다(admin generateLink는 토큰만 반환).
 */
export async function mintSupabaseSession(
  admin: SupabaseClient,
  verifier: SupabaseClient,
  email: string
): Promise<MintedSession> {
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  })
  const hashedToken = link?.properties?.hashed_token
  if (linkErr || !hashedToken) {
    throw new Error(`매직링크 생성 실패: ${linkErr?.message ?? "no token"}`)
  }
  const { data: otp, error: otpErr } = await verifier.auth.verifyOtp({
    token_hash: hashedToken,
    type: "email",
  })
  if (otpErr || !otp?.session) {
    throw new Error(`세션 발급 실패: ${otpErr?.message ?? "no session"}`)
  }
  return {
    accessToken: otp.session.access_token,
    refreshToken: otp.session.refresh_token,
  }
}
