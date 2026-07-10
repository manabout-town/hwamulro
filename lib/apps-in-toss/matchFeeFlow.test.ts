import { describe, it, expect } from "vitest"
import { payMatchFeeFlow, confirmMatchFeeFlow, expireMatchFeeFlow } from "./matchFeeFlow"

const now = () => new Date("2026-07-10T00:00:00Z").getTime()
const future = new Date("2026-07-11T00:00:00Z").toISOString()
const past = new Date("2026-07-09T00:00:00Z").toISOString()

function payDeps(over: Partial<Parameters<typeof payMatchFeeFlow>[0]> = {}) {
  const calls: string[] = []
  return {
    calls,
    d: {
      getFee: async () => ({ id: "f1", driver_id: "d1", amount: 3000, status: "pending", expires_at: future, toss_order_no: null as string | null }),
      getDriverTossKey: async () => "uk_1",
      setOrderNo: async () => { calls.push("orderNo") },
      createPayment: async () => { calls.push("create"); return { payToken: "pt_1" } },
      now,
      ...over,
    },
  }
}

describe("payMatchFeeFlow", () => {
  it("pending·미만료·본인이면 payToken 발급", async () => {
    const { d, calls } = payDeps()
    const r = await payMatchFeeFlow(d, { feeId: "f1", userId: "d1", isTest: true })
    expect(r).toEqual({ payToken: "pt_1" })
    expect(calls).toContain("create")
  })
  it("본인 아니면 권한 에러", async () => {
    const { d } = payDeps()
    await expect(payMatchFeeFlow(d, { feeId: "f1", userId: "other", isTest: true }))
      .rejects.toThrow("권한이 없습니다")
  })
  it("이미 결제(paid)면 에러", async () => {
    const { d } = payDeps({ getFee: async () => ({ id: "f1", driver_id: "d1", amount: 3000, status: "paid", expires_at: future, toss_order_no: "o" }) })
    await expect(payMatchFeeFlow(d, { feeId: "f1", userId: "d1", isTest: true }))
      .rejects.toThrow("이미 결제된 매칭입니다")
  })
  it("만료면 에러", async () => {
    const { d } = payDeps({ getFee: async () => ({ id: "f1", driver_id: "d1", amount: 3000, status: "pending", expires_at: past, toss_order_no: null }) })
    await expect(payMatchFeeFlow(d, { feeId: "f1", userId: "d1", isTest: true }))
      .rejects.toThrow("매칭이 만료되었습니다")
  })
})

function confirmDeps(over: Partial<Parameters<typeof confirmMatchFeeFlow>[0]> = {}) {
  const calls: string[] = []
  return {
    calls,
    d: {
      getFee: async () => ({ id: "f1", driver_id: "d1", status: "pending", toss_order_no: "o-1" as string | null }),
      getDriverTossKey: async () => "uk_1",
      executePayment: async () => { calls.push("execute"); return { transactionId: "tx_1", payToken: "pt_1", stateMsg: "결제 완료" } },
      markPaid: async () => { calls.push("paid") },
      ...over,
    },
  }
}

describe("confirmMatchFeeFlow", () => {
  it("승인 성공 시 paid 마킹", async () => {
    const { d, calls } = confirmDeps()
    const r = await confirmMatchFeeFlow(d, { feeId: "f1", userId: "d1", payToken: "pt_1", isTest: true })
    expect(r).toEqual({ ok: true })
    expect(calls).toEqual(["execute", "paid"])
  })
  it("본인 아니면 권한 에러", async () => {
    const { d } = confirmDeps()
    await expect(confirmMatchFeeFlow(d, { feeId: "f1", userId: "x", payToken: "pt_1", isTest: true }))
      .rejects.toThrow("권한이 없습니다")
  })
  it("이미 paid면 멱등(재승인 안 함)", async () => {
    const { d, calls } = confirmDeps({ getFee: async () => ({ id: "f1", driver_id: "d1", status: "paid", toss_order_no: "o-1" }) })
    const r = await confirmMatchFeeFlow(d, { feeId: "f1", userId: "d1", payToken: "pt_1", isTest: true })
    expect(r).toEqual({ ok: true })
    expect(calls).toEqual([])
  })
})

function expireDeps(over: Partial<Parameters<typeof expireMatchFeeFlow>[0]> = {}) {
  const calls: string[] = []
  return {
    calls,
    d: {
      getFee: async () => ({ id: "f1", match_id: "m1", status: "pending", expires_at: past }),
      getMatchOrder: async () => ({ order_id: "o1" }),
      cancelMatch: async () => { calls.push("cancelMatch") },
      reopenOrder: async () => { calls.push("reopen") },
      cancelFee: async () => { calls.push("cancelFee") },
      now,
      ...over,
    },
  }
}

describe("expireMatchFeeFlow", () => {
  it("만료+pending이면 매칭 취소·주문 재오픈·fee 취소", async () => {
    const { d, calls } = expireDeps()
    const r = await expireMatchFeeFlow(d, { feeId: "f1" })
    expect(r).toEqual({ expired: true })
    expect(calls).toEqual(["cancelMatch", "reopen", "cancelFee"])
  })
  it("미만료면 아무것도 안 함", async () => {
    const { d, calls } = expireDeps({ getFee: async () => ({ id: "f1", match_id: "m1", status: "pending", expires_at: future }) })
    const r = await expireMatchFeeFlow(d, { feeId: "f1" })
    expect(r).toEqual({ expired: false })
    expect(calls).toEqual([])
  })
  it("이미 paid면 아무것도 안 함", async () => {
    const { d, calls } = expireDeps({ getFee: async () => ({ id: "f1", match_id: "m1", status: "paid", expires_at: past }) })
    const r = await expireMatchFeeFlow(d, { feeId: "f1" })
    expect(r).toEqual({ expired: false })
    expect(calls).toEqual([])
  })
})
