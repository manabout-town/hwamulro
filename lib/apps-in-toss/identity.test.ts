import { describe, it, expect } from "vitest"
import { shadowEmail, resolveUserByTossKey } from "./identity"

// 주입할 Supabase service 클라이언트 목
function fakeService(opts: {
  existing?: { id: string } | null
  createResult?: { user: { id: string } | null; error: { message: string } | null }
  upsertError?: { message: string } | null
}) {
  const calls = { createUser: 0, upsert: 0 }
  const service = {
    from: (_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: opts.existing ?? null, error: null }),
        }),
      }),
      upsert: async (_row: unknown) => {
        calls.upsert++
        return { error: opts.upsertError ?? null }
      },
    }),
    auth: {
      admin: {
        createUser: async (_args: unknown) => {
          calls.createUser++
          return opts.createResult ?? { user: { id: "new-uid" }, error: null }
        },
      },
    },
  }
  return { service, calls }
}

describe("shadowEmail", () => {
  it("토스 userKey로 합성 이메일을 만든다", () => {
    expect(shadowEmail("abc123")).toBe("toss_abc123@apps.takca.internal")
  })
})

describe("resolveUserByTossKey", () => {
  it("이미 매핑된 유저가 있으면 그 id를 반환하고 새 유저를 만들지 않는다", async () => {
    const { service, calls } = fakeService({ existing: { id: "existing-uid" } })
    const result = await resolveUserByTossKey(service as never, "abc123", {
      name: "홍길동",
      role: "shipper",
    })
    expect(result).toEqual({ userId: "existing-uid", isNew: false })
    expect(calls.createUser).toBe(0)
  })

  it("매핑이 없으면 shadow auth 유저 생성 + users upsert 후 새 id 반환", async () => {
    const { service, calls } = fakeService({
      existing: null,
      createResult: { user: { id: "new-uid" }, error: null },
    })
    const result = await resolveUserByTossKey(service as never, "abc123", {
      name: "김기사",
      role: "driver",
    })
    expect(result).toEqual({ userId: "new-uid", isNew: true })
    expect(calls.createUser).toBe(1)
    expect(calls.upsert).toBe(1)
  })

  it("shadow auth 유저 생성 실패 시 에러를 던진다", async () => {
    const { service } = fakeService({
      existing: null,
      createResult: { user: null, error: { message: "boom" } },
    })
    await expect(
      resolveUserByTossKey(service as never, "abc123", { name: "x", role: "shipper" })
    ).rejects.toThrow("shadow user 생성 실패: boom")
  })
})
