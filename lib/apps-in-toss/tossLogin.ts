// 토스로그인 파트너 API 교환 순수 로직.
// 파트너 인증은 mTLS 클라이언트 인증서로 하며(문서 기준), 그 배선은
// 호출부(라우트)가 fetch 구현(dispatcher 포함)을 주입해 처리한다.
// 여기서는 주입된 fetchFn만 사용해 순수/테스트가능하게 유지한다.

export interface TossLoginConfig {
  apiBase: string
}
export interface TossTokenResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number
}
export interface TossUser {
  userKey: string
  name?: string
  phone?: string
}

const GENERATE_TOKEN = "/api-partner/v1/apps-in-toss/user/oauth2/generate-token"
const LOGIN_ME = "/api-partner/v1/apps-in-toss/user/oauth2/login-me"

export async function exchangeTossCode(
  fetchFn: typeof fetch,
  cfg: TossLoginConfig,
  authorizationCode: string,
  referrer: string
): Promise<TossTokenResponse> {
  const res = await fetchFn(`${cfg.apiBase}${GENERATE_TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ authorizationCode, referrer }),
  })
  if (!res.ok) {
    throw new Error(`토큰 발급 실패: ${res.status}`)
  }
  const json = await res.json()
  return {
    accessToken: json.accessToken,
    refreshToken: json.refreshToken,
    expiresIn: json.expiresIn,
  }
}

export async function fetchTossUser(
  fetchFn: typeof fetch,
  cfg: TossLoginConfig,
  accessToken: string
): Promise<TossUser> {
  const res = await fetchFn(`${cfg.apiBase}${LOGIN_ME}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    throw new Error(`사용자 조회 실패: ${res.status}`)
  }
  const json = await res.json()
  return { userKey: json.userKey, name: json.name, phone: json.phone }
}
