import { describe, it, expect } from "vitest"
import { approveBidFlow } from "./approveBid"

function deps(over: Partial<Parameters<typeof approveBidFlow>[0]> = {}) {
  const calls: string[] = []
  return {
    calls,
    d: {
      getOrder: async () => ({ shipper_id: "shipper-1", status: "pending" }),
      getBid: async () => ({ driver_id: "driver-1", price: 280000 }),
      insertMatch: async () => { calls.push("match"); return { error: null } },
      updateOrderMatched: async () => { calls.push("order") },
      acceptBid: async () => { calls.push("accept") },
      rejectOtherBids: async () => { calls.push("reject") },
      insertMatchFee: async () => { calls.push("fee") },
      ...over,
    },
  }
}

describe("approveBidFlow", () => {
  it("정상 수락 시 match·order·accept·reject 순서로 처리", async () => {
    const { d, calls } = deps()
    const r = await approveBidFlow(d, { bidId: "b1", orderId: "o1", userId: "shipper-1" })
    expect(r).toEqual({ ok: true })
    expect(calls).toEqual(["match", "order", "accept", "reject", "fee"])
  })
  it("fee 생성은 match·order·accept·reject 이후 마지막에 호출", async () => {
    const { d, calls } = deps()
    await approveBidFlow(d, { bidId: "b1", orderId: "o1", userId: "shipper-1" })
    expect(calls[calls.length - 1]).toBe("fee")
  })
  it("주문 소유자가 아니면 권한 에러", async () => {
    const { d } = deps({ getOrder: async () => ({ shipper_id: "other", status: "pending" }) })
    await expect(approveBidFlow(d, { bidId: "b1", orderId: "o1", userId: "shipper-1" }))
      .rejects.toThrow("권한이 없습니다")
  })
  it("이미 처리된 주문이면 에러", async () => {
    const { d } = deps({ getOrder: async () => ({ shipper_id: "shipper-1", status: "matched" }) })
    await expect(approveBidFlow(d, { bidId: "b1", orderId: "o1", userId: "shipper-1" }))
      .rejects.toThrow("이미 처리된 의뢰입니다")
  })
  it("동시 수락 유니크 위반(23505)은 친화 메시지", async () => {
    const { d } = deps({ insertMatch: async () => ({ error: { code: "23505", message: "dup" } }) })
    await expect(approveBidFlow(d, { bidId: "b1", orderId: "o1", userId: "shipper-1" }))
      .rejects.toThrow("이미 다른 기사와 매칭된 의뢰입니다")
  })
})
