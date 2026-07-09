import { describe, it, expect } from "vitest"
import { exchangeTossCode, fetchTossUser } from "./tossLogin"

function okFetch(json: unknown) {
  return (async () => ({ ok: true, status: 200, json: async () => json })) as unknown as typeof fetch
}
function errFetch(status: number) {
  return (async () => ({ ok: false, status, json: async () => ({}) })) as unknown as typeof fetch
}
const cfg = { apiBase: "https://api.example.com" }

describe("exchangeTossCode", () => {
  it("authorizationCode를 토큰으로 교환한다", async () => {
    const f = okFetch({ accessToken: "at", refreshToken: "rt", expiresIn: 3600 })
    const r = await exchangeTossCode(f, cfg, "code123", "DEFAULT")
    expect(r).toEqual({ accessToken: "at", refreshToken: "rt", expiresIn: 3600 })
  })
  it("실패 응답이면 에러를 던진다", async () => {
    await expect(exchangeTossCode(errFetch(401), cfg, "code123", "DEFAULT"))
      .rejects.toThrow("토큰 발급 실패: 401")
  })
})

describe("fetchTossUser", () => {
  it("accessToken으로 사용자 정보를 조회한다", async () => {
    const f = okFetch({ userKey: "uk_1", name: "홍길동", phone: "010" })
    const r = await fetchTossUser(f, cfg, "at")
    expect(r).toEqual({ userKey: "uk_1", name: "홍길동", phone: "010" })
  })
  it("실패 응답이면 에러를 던진다", async () => {
    await expect(fetchTossUser(errFetch(403), cfg, "at"))
      .rejects.toThrow("사용자 조회 실패: 403")
  })
})
