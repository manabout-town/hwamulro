import { describe, it, expect } from "vitest"
import { confirmTossPayments, cancelTossPayments, tossBasicAuth } from "./tossPayments"

function okFetch(json: unknown, capture?: (url: string, init: RequestInit) => void): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    capture?.(url, init)
    return { ok: true, status: 200, json: async () => json }
  }) as unknown as typeof fetch
}
function failFetch(status: number, json: unknown = {}): typeof fetch {
  return (async () => ({ ok: false, status, json: async () => json })) as unknown as typeof fetch
}

describe("tossBasicAuth", () => {
  it("secretKey 뒤에 콜론 붙여 base64 Basic 헤더 생성", () => {
    expect(tossBasicAuth("test_sk_abc")).toBe(`Basic ${Buffer.from("test_sk_abc:").toString("base64")}`)
  })
})

describe("confirmTossPayments", () => {
  it("성공 시 paymentKey/orderId/금액/거래키 반환 + 올바른 엔드포인트·바디", async () => {
    let seenUrl = "", seenBody = ""
    const f = okFetch(
      { paymentKey: "pk_1", orderId: "mf_1", totalAmount: 3000, status: "DONE", lastTransactionKey: "tx_1" },
      (u, i) => { seenUrl = u; seenBody = String(i.body) },
    )
    const r = await confirmTossPayments(f, { secretKey: "sk" }, { paymentKey: "pk_1", orderId: "mf_1", amount: 3000 })
    expect(seenUrl).toBe("https://api.tosspayments.com/v1/payments/confirm")
    expect(JSON.parse(seenBody)).toEqual({ paymentKey: "pk_1", orderId: "mf_1", amount: 3000 })
    expect(r).toEqual({ paymentKey: "pk_1", orderId: "mf_1", totalAmount: 3000, transactionKey: "tx_1" })
  })
  it("HTTP 실패면 토스 code로 에러", async () => {
    await expect(confirmTossPayments(failFetch(400, { code: "ALREADY_PROCESSED_PAYMENT" }), { secretKey: "sk" },
      { paymentKey: "pk_1", orderId: "mf_1", amount: 3000 })).rejects.toThrow("결제 승인 실패: ALREADY_PROCESSED_PAYMENT")
  })
})

describe("cancelTossPayments", () => {
  it("성공 시 status 반환 + paymentKey 경로·cancelReason 바디", async () => {
    let seenUrl = "", seenBody = ""
    const f = okFetch({ status: "CANCELED" }, (u, i) => { seenUrl = u; seenBody = String(i.body) })
    const r = await cancelTossPayments(f, { secretKey: "sk" }, { paymentKey: "pk_1", reason: "청약철회" })
    expect(seenUrl).toBe("https://api.tosspayments.com/v1/payments/pk_1/cancel")
    expect(JSON.parse(seenBody)).toEqual({ cancelReason: "청약철회" })
    expect(r).toEqual({ status: "CANCELED" })
  })
  it("HTTP 실패면 토스 code로 에러", async () => {
    await expect(cancelTossPayments(failFetch(400, { code: "NOT_CANCELABLE_AMOUNT" }), { secretKey: "sk" },
      { paymentKey: "pk_1", reason: "x" })).rejects.toThrow("결제 취소 실패: NOT_CANCELABLE_AMOUNT")
  })
})
