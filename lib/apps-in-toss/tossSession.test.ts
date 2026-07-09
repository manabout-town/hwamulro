import { describe, it, expect } from "vitest"
import { mintSupabaseSession } from "./tossSession"

function fakeAdmin(linkResult: unknown) {
  return { auth: { admin: { generateLink: async () => linkResult } } } as never
}
function fakeVerifier(otpResult: unknown) {
  return { auth: { verifyOtp: async () => otpResult } } as never
}

describe("mintSupabaseSession", () => {
  it("generateLink→verifyOtp로 세션 토큰을 발급한다", async () => {
    const admin = fakeAdmin({ data: { properties: { hashed_token: "ht_1" } }, error: null })
    const verifier = fakeVerifier({ data: { session: { access_token: "at", refresh_token: "rt" } }, error: null })
    const r = await mintSupabaseSession(admin, verifier, "toss_x@apps.takca.internal")
    expect(r).toEqual({ accessToken: "at", refreshToken: "rt" })
  })
  it("매직링크 토큰이 없으면 에러", async () => {
    const admin = fakeAdmin({ data: { properties: {} }, error: null })
    const verifier = fakeVerifier({ data: { session: null }, error: null })
    await expect(mintSupabaseSession(admin, verifier, "e")).rejects.toThrow("매직링크 생성 실패")
  })
  it("세션 발급 실패 시 에러", async () => {
    const admin = fakeAdmin({ data: { properties: { hashed_token: "ht_1" } }, error: null })
    const verifier = fakeVerifier({ data: { session: null }, error: { message: "bad otp" } })
    await expect(mintSupabaseSession(admin, verifier, "e")).rejects.toThrow("세션 발급 실패: bad otp")
  })
})
