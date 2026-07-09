import { describe, it, expect } from "vitest"
import { handleTossLogin } from "./loginFlow"

function deps(overrides: Partial<Parameters<typeof handleTossLogin>[0]> = {}) {
  return {
    exchange: async () => ({ accessToken: "at", refreshToken: "rt", expiresIn: 3600 }),
    fetchUser: async () => ({ userKey: "uk_1", name: "홍길동", phone: "010" }),
    resolve: async () => ({ userId: "user-1", isNew: true }),
    mint: async () => ({ accessToken: "sb_at", refreshToken: "sb_rt" }),
    ...overrides,
  }
}

describe("handleTossLogin", () => {
  it("교환→조회→매핑→세션까지 순서대로 처리하고 세션을 반환한다", async () => {
    const r = await handleTossLogin(deps(), { authorizationCode: "c", referrer: "DEFAULT" })
    expect(r).toEqual({ accessToken: "sb_at", refreshToken: "sb_rt", userId: "user-1", isNew: true })
  })
  it("role 미지정 시 shipper 기본, userKey를 resolve에 넘긴다", async () => {
    let seenKey = ""; let seenRole = ""
    const r = await handleTossLogin(deps({
      resolve: async (userKey, profile) => { seenKey = userKey; seenRole = profile.role; return { userId: "u", isNew: false } },
    }), { authorizationCode: "c", referrer: "DEFAULT" })
    expect(seenKey).toBe("uk_1")
    expect(seenRole).toBe("shipper")
    expect(r.isNew).toBe(false)
  })
  it("교환 실패는 위로 전파된다", async () => {
    await expect(handleTossLogin(deps({
      exchange: async () => { throw new Error("토큰 발급 실패: 401") },
    }), { authorizationCode: "c", referrer: "DEFAULT" })).rejects.toThrow("토큰 발급 실패: 401")
  })
})
