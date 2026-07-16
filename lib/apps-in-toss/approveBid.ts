export interface ApproveBidDeps {
  getOrder: (orderId: string) => Promise<{ shipper_id: string; status: string } | null>
  getBid: (bidId: string) => Promise<{ driver_id: string; price: number } | null>
  insertMatch: (orderId: string, driverId: string) => Promise<{ error: { code?: string; message: string } | null }>
  updateOrderMatched: (orderId: string, price: number) => Promise<void>
  acceptBid: (bidId: string) => Promise<void>
  rejectOtherBids: (orderId: string, bidId: string) => Promise<void>
  insertMatchFee: (orderId: string, driverId: string) => Promise<void>
}

export interface ApproveBidInput {
  bidId: string
  orderId: string
  userId: string
}

/**
 * 입찰 수락 오케스트레이션(주입형). 기존 app/actions/bids.ts approveBid와 동일 규칙.
 * match 생성 → order matched+price → bid accepted → 나머지 rejected.
 */
export async function approveBidFlow(
  deps: ApproveBidDeps,
  input: ApproveBidInput
): Promise<{ ok: true }> {
  const order = await deps.getOrder(input.orderId)
  if (!order || order.shipper_id !== input.userId) {
    throw new Error("권한이 없습니다")
  }
  if (order.status !== "pending") {
    throw new Error("이미 처리된 의뢰입니다")
  }
  const bid = await deps.getBid(input.bidId)
  if (!bid) {
    throw new Error("입찰을 찾을 수 없습니다")
  }
  const { error } = await deps.insertMatch(input.orderId, bid.driver_id)
  if (error) {
    // 한 오더 = 활성 매칭 1건(020 부분 유니크 인덱스). 다른 기사가 이미 매칭됐거나
    // 같은 기사 중복이면 23505 → 친화 메시지.
    if (error.code === "23505") throw new Error("이미 다른 기사와 매칭된 의뢰입니다")
    throw new Error(error.message)
  }
  await deps.updateOrderMatched(input.orderId, bid.price)
  await deps.acceptBid(input.bidId)
  await deps.rejectOtherBids(input.orderId, input.bidId)
  await deps.insertMatchFee(input.orderId, bid.driver_id)
  return { ok: true }
}
