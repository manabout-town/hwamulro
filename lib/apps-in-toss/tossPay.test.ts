import { describe, it, expect } from "vitest"
import { createTossPayment, executeTossPayment, refundTossPayment } from "./tossPay"

function okFetch(json: unknown): typeof fetch {
  return (async () => ({ ok: true, status: 200, json: async () => json })) as unknown as typeof fetch
}
function failFetch(status: number): typeof fetch {
  return (async () => ({ ok: false, status, json: async () => ({}) })) as unknown as typeof fetch
}

describe("createTossPayment", () => {
  it("성공 시 payToken 반환", async () => {
    const f = okFetch({ resultType: "SUCCESS", success: { payToken: "pt_1" } })
    const r = await createTossPayment(f, { apiBase: "https://x" }, {
      tossUserKey: "uk_1", orderNo: "o-1", amount: 3000, productDesc: "탁카 매칭 이용료", isTest: true,
    })
    expect(r).toEqual({ payToken: "pt_1" })
  })
  it("실패 응답이면 에러", async () => {
    await expect(createTossPayment(failFetch(400), { apiBase: "https://x" }, {
      tossUserKey: "uk_1", orderNo: "o-1", amount: 3000, productDesc: "d", isTest: true,
    })).rejects.toThrow("결제 생성 실패: 400")
  })
  it("resultType이 SUCCESS 아니면 에러", async () => {
    const f = okFetch({ resultType: "FAIL", success: null })
    await expect(createTossPayment(f, { apiBase: "https://x" }, {
      tossUserKey: "uk_1", orderNo: "o-1", amount: 3000, productDesc: "d", isTest: true,
    })).rejects.toThrow("결제 생성 실패")
  })
})

describe("executeTossPayment", () => {
  it("성공 시 승인결과 반환", async () => {
    const f = okFetch({ resultType: "SUCCESS", success: { stateMsg: "결제 완료", transactionId: "tx_1", payToken: "pt_1" } })
    const r = await executeTossPayment(f, { apiBase: "https://x" }, {
      tossUserKey: "uk_1", payToken: "pt_1", orderNo: "o-1", isTest: true,
    })
    expect(r).toEqual({ stateMsg: "결제 완료", transactionId: "tx_1", payToken: "pt_1" })
  })
  it("실패면 에러", async () => {
    await expect(executeTossPayment(failFetch(500), { apiBase: "https://x" }, {
      tossUserKey: "uk_1", payToken: "pt_1", orderNo: "o-1", isTest: true,
    })).rejects.toThrow("결제 승인 실패: 500")
  })
})

describe("refundTossPayment", () => {
  it("성공 시 환불결과 반환", async () => {
    const f = okFetch({ resultType: "SUCCESS", success: { refundNo: "rf_1", transactionId: "tx_1" } })
    const r = await refundTossPayment(f, { apiBase: "https://x" }, {
      tossUserKey: "uk_1", payToken: "pt_1", reason: "청약철회", isTest: true,
    })
    expect(r).toEqual({ refundNo: "rf_1", transactionId: "tx_1" })
  })
  it("HTTP 실패면 에러", async () => {
    await expect(refundTossPayment(failFetch(500), { apiBase: "https://x" }, {
      tossUserKey: "uk_1", payToken: "pt_1", reason: "청약철회", isTest: true,
    })).rejects.toThrow("결제 환불 실패: 500")
  })
  it("resultType이 SUCCESS 아니면 에러", async () => {
    const f = okFetch({ resultType: "FAIL", error: { errorCode: "REFUND_NOT_ALLOWED" } })
    await expect(refundTossPayment(f, { apiBase: "https://x" }, {
      tossUserKey: "uk_1", payToken: "pt_1", reason: "청약철회", isTest: true,
    })).rejects.toThrow("결제 환불 실패")
  })
})
