import { describe, it, expect } from "vitest"
import { payMatchFeeFlow, confirmMatchFeeFlow, expireMatchFeeFlow, refundMatchFeeFlow } from "./matchFeeFlow"

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
      getFee: async () => ({ id: "f1", driver_id: "d1", status: "pending", toss_order_no: "o-1" as string | null, expires_at: future }),
      getDriverTossKey: async () => "uk_1",
      executePayment: async () => { calls.push("execute"); return { transactionId: "tx_1", payToken: "pt_1", stateMsg: "결제 완료" } },
      markPaid: async () => { calls.push("paid"); return 1 },
      refundPayment: async () => { calls.push("refund") },
      markRefunded: async () => { calls.push("markRefunded") },
      markRefundFailed: async () => { calls.push("markRefundFailed") },
      now,
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
    const { d, calls } = confirmDeps({ getFee: async () => ({ id: "f1", driver_id: "d1", status: "paid", toss_order_no: "o-1", expires_at: future }) })
    const r = await confirmMatchFeeFlow(d, { feeId: "f1", userId: "d1", payToken: "pt_1", isTest: true })
    expect(r).toEqual({ ok: true })
    expect(calls).toEqual([])
  })
  it("cancelled 상태면 결제 실행 안 하고 차단", async () => {
    const { d, calls } = confirmDeps({ getFee: async () => ({ id: "f1", driver_id: "d1", status: "cancelled", toss_order_no: "o-1", expires_at: future }) })
    await expect(confirmMatchFeeFlow(d, { feeId: "f1", userId: "d1", payToken: "pt_1", isTest: true }))
      .rejects.toThrow("취소되었거나 만료된 매칭입니다")
    expect(calls).toEqual([])
  })
  it("만료 경과면 결제 실행 전 차단", async () => {
    const { d, calls } = confirmDeps({ getFee: async () => ({ id: "f1", driver_id: "d1", status: "pending", toss_order_no: "o-1", expires_at: past }) })
    await expect(confirmMatchFeeFlow(d, { feeId: "f1", userId: "d1", payToken: "pt_1", isTest: true }))
      .rejects.toThrow("매칭이 만료되었습니다")
    expect(calls).toEqual([])
  })
  it("markPaid 0행(만료취소 레이스)이면 자동 환불 후 에러", async () => {
    const { d, calls } = confirmDeps({ markPaid: async () => { calls.push("paid"); return 0 } })
    await expect(confirmMatchFeeFlow(d, { feeId: "f1", userId: "d1", payToken: "pt_1", isTest: true }))
      .rejects.toThrow("자동 환불되었습니다")
    expect(calls).toEqual(["execute", "paid", "refund", "markRefunded"])
  })
  it("markPaid 0행 + 환불 호출 실패면 수동처리 표식 후 에러", async () => {
    const { d, calls } = confirmDeps({
      markPaid: async () => { calls.push("paid"); return 0 },
      refundPayment: async () => { throw new Error("toss down") },
    })
    await expect(confirmMatchFeeFlow(d, { feeId: "f1", userId: "d1", payToken: "pt_1", isTest: true }))
      .rejects.toThrow("자동 환불에 실패했습니다")
    expect(calls).toEqual(["execute", "paid", "markRefundFailed"])
  })
})

function expireDeps(over: Partial<Parameters<typeof expireMatchFeeFlow>[0]> = {}) {
  const calls: string[] = []
  return {
    calls,
    d: {
      getFee: async () => ({ id: "f1", match_id: "m1", status: "pending", expires_at: past }),
      getMatchOrder: async () => ({ order_id: "o1", match_status: "accepted", order_status: "matched" }),
      cancelMatch: async () => { calls.push("cancelMatch") },
      reopenOrder: async () => { calls.push("reopen") },
      cancelFee: async () => { calls.push("cancelFee"); return 1 },
      now,
      ...over,
    },
  }
}

describe("expireMatchFeeFlow", () => {
  it("만료+pending이면 fee 취소 후 매칭 취소·주문 재오픈", async () => {
    const { d, calls } = expireDeps()
    const r = await expireMatchFeeFlow(d, { feeId: "f1" })
    expect(r).toEqual({ expired: true })
    // cancelFee가 먼저, 성공 시에만 매칭 취소·재오픈
    expect(calls).toEqual(["cancelFee", "cancelMatch", "reopen"])
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
  it("cancelFee 0행(confirm과 레이스에서 paid)이면 매칭 안 건드림", async () => {
    const { d, calls } = expireDeps({ cancelFee: async () => { calls.push("cancelFee"); return 0 } })
    const r = await expireMatchFeeFlow(d, { feeId: "f1" })
    expect(r).toEqual({ expired: false })
    expect(calls).toEqual(["cancelFee"])
  })
  it("매칭이 in_progress면 매칭·오더 미변경, fee만 취소(사유 기록)", async () => {
    let feeReason: string | undefined = "UNSET"
    const { d, calls } = expireDeps({
      getMatchOrder: async () => ({ order_id: "o1", match_status: "in_progress", order_status: "in_progress" }),
      cancelFee: async (_id: string, reason?: string) => { calls.push("cancelFee"); feeReason = reason; return 1 },
    })
    const r = await expireMatchFeeFlow(d, { feeId: "f1" })
    // 매칭은 살아있으므로 expired:false, 매칭·오더는 손대지 않음
    expect(r).toEqual({ expired: false })
    expect(calls).toEqual(["cancelFee"])
    expect(feeReason).toBe("expired_after_progress")
  })
  it("오더가 completed면 매칭·오더 미변경, fee만 취소", async () => {
    const { d, calls } = expireDeps({
      getMatchOrder: async () => ({ order_id: "o1", match_status: "accepted", order_status: "completed" }),
    })
    const r = await expireMatchFeeFlow(d, { feeId: "f1" })
    expect(r).toEqual({ expired: false })
    expect(calls).toEqual(["cancelFee"])
  })
  it("accepted+matched(미진행)면 기존대로 매칭 취소·주문 재오픈", async () => {
    const { d, calls } = expireDeps({
      getMatchOrder: async () => ({ order_id: "o1", match_status: "accepted", order_status: "matched" }),
    })
    const r = await expireMatchFeeFlow(d, { feeId: "f1" })
    expect(r).toEqual({ expired: true })
    expect(calls).toEqual(["cancelFee", "cancelMatch", "reopen"])
  })
})

function refundDeps(over: Partial<Parameters<typeof refundMatchFeeFlow>[0]> = {}) {
  const calls: string[] = []
  return {
    calls,
    d: {
      getFee: async () => ({ id: "f1", driver_id: "d1", status: "paid", toss_payment_key: "pt_1" as string | null }),
      getDriverTossKey: async () => "uk_1",
      refundPayment: async () => { calls.push("refund") },
      markRefunded: async () => { calls.push("markRefunded") },
      ...over,
    },
  }
}

describe("refundMatchFeeFlow", () => {
  it("paid면 환불 실행 후 refunded 마킹", async () => {
    const { d, calls } = refundDeps()
    const r = await refundMatchFeeFlow(d, { feeId: "f1", reason: "청약철회", isTest: true })
    expect(r).toEqual({ ok: true })
    expect(calls).toEqual(["refund", "markRefunded"])
  })
  it("이미 refunded면 멱등(재환불 안 함)", async () => {
    const { d, calls } = refundDeps({ getFee: async () => ({ id: "f1", driver_id: "d1", status: "refunded", toss_payment_key: "pt_1" }) })
    const r = await refundMatchFeeFlow(d, { feeId: "f1", reason: "청약철회", isTest: true })
    expect(r).toEqual({ ok: true })
    expect(calls).toEqual([])
  })
  it("paid 아니면(pending 등) 환불 거부", async () => {
    const { d, calls } = refundDeps({ getFee: async () => ({ id: "f1", driver_id: "d1", status: "pending", toss_payment_key: null }) })
    await expect(refundMatchFeeFlow(d, { feeId: "f1", reason: "청약철회", isTest: true }))
      .rejects.toThrow("결제 완료 상태만 환불할 수 있습니다")
    expect(calls).toEqual([])
  })
  it("결제 토큰 없으면 환불 불가 에러", async () => {
    const { d } = refundDeps({ getFee: async () => ({ id: "f1", driver_id: "d1", status: "paid", toss_payment_key: null }) })
    await expect(refundMatchFeeFlow(d, { feeId: "f1", reason: "청약철회", isTest: true }))
      .rejects.toThrow("결제 토큰이 없어")
  })
})
