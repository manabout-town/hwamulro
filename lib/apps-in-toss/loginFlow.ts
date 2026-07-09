import type { MintedSession } from "./tossSession"
import type { TossTokenResponse, TossUser } from "./tossLogin"

export interface TossLoginDeps {
  exchange: (code: string, referrer: string) => Promise<TossTokenResponse>
  fetchUser: (accessToken: string) => Promise<TossUser>
  resolve: (
    userKey: string,
    profile: { name: string; role: "shipper" | "driver" }
  ) => Promise<{ userId: string; isNew: boolean }>
  mint: (userKey: string) => Promise<MintedSession>
}

export interface TossLoginBody {
  authorizationCode: string
  referrer: string
  role?: "shipper" | "driver"
}

export interface TossLoginResult {
  accessToken: string
  refreshToken: string
  userId: string
  isNew: boolean
}

/**
 * 앱인토스 로그인 오케스트레이션(순수, 주입형).
 * 교환→사용자조회→신원매핑→Supabase 세션 발급.
 */
export async function handleTossLogin(
  deps: TossLoginDeps,
  body: TossLoginBody
): Promise<TossLoginResult> {
  const token = await deps.exchange(body.authorizationCode, body.referrer)
  const user = await deps.fetchUser(token.accessToken)
  const resolved = await deps.resolve(user.userKey, {
    name: user.name ?? "토스사용자",
    role: body.role ?? "shipper",
  })
  const session = await deps.mint(user.userKey)
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    userId: resolved.userId,
    isNew: resolved.isNew,
  }
}
