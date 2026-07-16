import { describe, it, expect, vi } from "vitest"
import { signupFlow, type SignupDeps } from "./signupFlow"

function makeDeps(overrides: Partial<SignupDeps> = {}): SignupDeps {
  return {
    createAuthUser: vi.fn().mockResolvedValue({ userId: "u1", session: null }),
    insertUserRow: vi.fn().mockResolvedValue(undefined),
    insertRoleProfile: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

const valid = { email: "A@b.com ", password: "pass123!", name: "홍길동", phone: "010-1234-5678", role: "driver" as const }

describe("signupFlow", () => {
  it("유효 입력이면 유저 생성 + users insert + 역할 프로필 insert", async () => {
    const deps = makeDeps()
    const r = await signupFlow(valid, deps)
    expect(r).toEqual({ ok: true, needsEmailVerify: true })
    expect(deps.createAuthUser).toHaveBeenCalledWith("a@b.com", "pass123!", { name: "홍길동", role: "driver" })
    expect(deps.insertUserRow).toHaveBeenCalledWith({
      id: "u1", email: "a@b.com", name: "홍길동", phone: "01012345678",
      role: "driver", status: "active", verification_status: "unverified",
    })
    expect(deps.insertRoleProfile).toHaveBeenCalledWith("u1", "driver")
  })

  it("비밀번호 특수문자 없으면 검증 에러", async () => {
    const deps = makeDeps()
    const r = await signupFlow({ ...valid, password: "password1" }, deps)
    expect(r).toEqual({ ok: false, error: "비밀번호에 특수문자를 1개 이상 포함해야 합니다" })
    expect(deps.createAuthUser).not.toHaveBeenCalled()
  })

  it("휴대폰 형식 오류면 검증 에러", async () => {
    const r = await signupFlow({ ...valid, phone: "02-123-4567" }, makeDeps())
    expect(r).toEqual({ ok: false, error: "올바른 휴대폰 번호를 입력해주세요 (예: 010-1234-5678)" })
  })

  it("auth 생성 실패는 에러 그대로 반환", async () => {
    const deps = makeDeps({ createAuthUser: vi.fn().mockResolvedValue({ error: "User already registered" }) })
    const r = await signupFlow(valid, deps)
    expect(r).toEqual({ ok: false, error: "User already registered" })
    expect(deps.insertUserRow).not.toHaveBeenCalled()
  })

  it("세션이 즉시 발급되면 needsEmailVerify=false", async () => {
    const deps = makeDeps({ createAuthUser: vi.fn().mockResolvedValue({ userId: "u1", session: { access_token: "t" } }) })
    const r = await signupFlow(valid, deps)
    expect(r).toEqual({ ok: true, needsEmailVerify: false })
  })
})
