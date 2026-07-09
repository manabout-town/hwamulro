import { Agent, fetch as undiciFetch, type RequestInfo, type RequestInit } from "undici"

/**
 * 파트너 API용 mTLS 클라이언트 인증서를 붙인 fetch를 만든다.
 * cert/key는 PEM 문자열(환경변수 주입). Vercel 서버리스 아웃바운드 mTLS 검증 필요(R6).
 */
export function createMtlsFetch(cert: string, key: string): typeof fetch {
  const dispatcher = new Agent({ connect: { cert, key } })
  return ((input: RequestInfo, init?: RequestInit) =>
    undiciFetch(input, { ...init, dispatcher })) as unknown as typeof fetch
}
