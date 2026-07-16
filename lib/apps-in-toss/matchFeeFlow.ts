// 매칭 이용료 오케스트레이터(주입형). 토스페이·Supabase는 라우트가 주입.

export interface PayDeps {
  getFee: (feeId: string) => Promise<{ id: string; driver_id: string; amount: number; status: string; expires_at: string; toss_order_no: string | null } | null>
  getDriverTossKey: (driverId: string) => Promise<string | null>
  setOrderNo: (feeId: string, orderNo: string) => Promise<void>
  createPayment: (args: { tossUserKey: string; orderNo: string; amount: number; isTest: boolean }) => Promise<{ payToken: string }>
  now: () => number
}

export async function payMatchFeeFlow(
  deps: PayDeps,
  input: { feeId: string; userId: string; isTest: boolean }
): Promise<{ payToken: string }> {
  const fee = await deps.getFee(input.feeId)
  if (!fee) throw new Error("이용료 정보를 찾을 수 없습니다")
  if (fee.driver_id !== input.userId) throw new Error("권한이 없습니다")
  if (fee.status === "paid") throw new Error("이미 결제된 매칭입니다")
  if (fee.status !== "pending") throw new Error("결제할 수 없는 상태입니다")
  if (new Date(fee.expires_at).getTime() < deps.now()) throw new Error("매칭이 만료되었습니다")

  const tossUserKey = await deps.getDriverTossKey(fee.driver_id)
  if (!tossUserKey) throw new Error("토스 사용자 정보가 없습니다")

  // 유니크 주문번호: fee.id + timestamp (재시도 시 재사용 불가하므로 매번 신규)
  const orderNo = `mf_${fee.id.replace(/-/g, "").slice(0, 20)}_${deps.now()}`
  await deps.setOrderNo(input.feeId, orderNo)
  const { payToken } = await deps.createPayment({ tossUserKey, orderNo, amount: fee.amount, isTest: input.isTest })
  return { payToken }
}

export interface ConfirmDeps {
  getFee: (feeId: string) => Promise<{ id: string; driver_id: string; status: string; toss_order_no: string | null; expires_at: string } | null>
  getDriverTossKey: (driverId: string) => Promise<string | null>
  executePayment: (args: { tossUserKey: string; payToken: string; orderNo: string; isTest: boolean }) => Promise<{ transactionId: string; payToken: string; stateMsg: string }>
  // status='pending'인 행만 조건부 갱신 → 갱신된 행 수 반환(0이면 만료취소와 레이스에서 짐)
  markPaid: (feeId: string, payToken: string, transactionId: string) => Promise<number>
  refundPayment: (args: { tossUserKey: string; payToken: string; isTest: boolean; reason: string }) => Promise<void>
  markRefunded: (feeId: string, reason: string) => Promise<void>
  markRefundFailed: (feeId: string, reason: string) => Promise<void>
  now: () => number
}

export async function confirmMatchFeeFlow(
  deps: ConfirmDeps,
  input: { feeId: string; userId: string; payToken: string; isTest: boolean }
): Promise<{ ok: true }> {
  const fee = await deps.getFee(input.feeId)
  if (!fee) throw new Error("이용료 정보를 찾을 수 없습니다")
  if (fee.driver_id !== input.userId) throw new Error("권한이 없습니다")
  if (fee.status === "paid") return { ok: true } // 멱등
  if (fee.status !== "pending") throw new Error("취소되었거나 만료된 매칭입니다. 결제할 수 없습니다")
  if (!fee.toss_order_no) throw new Error("결제 생성 이력이 없습니다")
  if (new Date(fee.expires_at).getTime() < deps.now()) throw new Error("매칭이 만료되었습니다")

  const tossUserKey = await deps.getDriverTossKey(fee.driver_id)
  if (!tossUserKey) throw new Error("토스 사용자 정보가 없습니다")

  const { transactionId } = await deps.executePayment({ tossUserKey, payToken: input.payToken, orderNo: fee.toss_order_no, isTest: input.isTest })
  const updated = await deps.markPaid(input.feeId, input.payToken, transactionId)
  if (updated > 0) return { ok: true }

  // 레이스: 결제 실행과 만료취소(스윕)가 겹쳐 pending이 아니게 됨 → 이미 출금된 결제를 즉시 환불
  try {
    await deps.refundPayment({ tossUserKey, payToken: input.payToken, isTest: input.isTest, reason: "매칭 만료로 자동 환불" })
    await deps.markRefunded(input.feeId, "expired_during_confirm")
  } catch (e) {
    // 환불 호출 실패 → 수동 처리 표식만 남기고 에러 반환
    await deps.markRefundFailed(input.feeId, `REFUND_FAILED: ${e instanceof Error ? e.message : "unknown"}`)
    throw new Error("매칭이 만료되었으나 자동 환불에 실패했습니다. 고객센터에 문의해 주세요")
  }
  throw new Error("매칭이 만료되어 결제가 자동 환불되었습니다")
}

export interface ExpireDeps {
  getFee: (feeId: string) => Promise<{ id: string; match_id: string; status: string; expires_at: string } | null>
  getMatchOrder: (matchId: string) => Promise<{ order_id: string } | null>
  cancelMatch: (matchId: string) => Promise<void>
  reopenOrder: (orderId: string) => Promise<void>
  // status='pending'인 행만 조건부 취소 → 취소된 행 수 반환(0이면 이미 paid 등, 매칭 유지)
  cancelFee: (feeId: string) => Promise<number>
  now: () => number
}

export async function expireMatchFeeFlow(
  deps: ExpireDeps,
  input: { feeId: string }
): Promise<{ expired: boolean }> {
  const fee = await deps.getFee(input.feeId)
  if (!fee) return { expired: false }
  if (fee.status !== "pending") return { expired: false }
  if (new Date(fee.expires_at).getTime() >= deps.now()) return { expired: false }

  // fee를 먼저 조건부 취소 → confirm과의 레이스에서 paid를 cancelled로 덮지 않음.
  // 취소 성공(1행)일 때만 매칭 취소·주문 재오픈 진행.
  const canceled = await deps.cancelFee(fee.id)
  if (canceled === 0) return { expired: false }

  const mo = await deps.getMatchOrder(fee.match_id)
  await deps.cancelMatch(fee.match_id)
  if (mo) await deps.reopenOrder(mo.order_id)
  return { expired: true }
}

export interface RefundDeps {
  getFee: (feeId: string) => Promise<{ id: string; driver_id: string; status: string; toss_payment_key: string | null } | null>
  getDriverTossKey: (driverId: string) => Promise<string | null>
  refundPayment: (args: { tossUserKey: string; payToken: string; isTest: boolean; reason: string }) => Promise<void>
  // status='paid'인 행만 조건부 갱신 → refunded 반영
  markRefunded: (feeId: string, reason: string) => Promise<void>
}

// 어드민/청약철회 환불 오케스트레이터. status='paid'만 환불 가능, 이미 refunded면 멱등.
export async function refundMatchFeeFlow(
  deps: RefundDeps,
  input: { feeId: string; reason: string; isTest: boolean }
): Promise<{ ok: true }> {
  const fee = await deps.getFee(input.feeId)
  if (!fee) throw new Error("이용료 정보를 찾을 수 없습니다")
  if (fee.status === "refunded") return { ok: true } // 멱등
  if (fee.status !== "paid") throw new Error("결제 완료 상태만 환불할 수 있습니다")
  if (!fee.toss_payment_key) throw new Error("결제 토큰이 없어 환불할 수 없습니다")

  const tossUserKey = await deps.getDriverTossKey(fee.driver_id)
  if (!tossUserKey) throw new Error("토스 사용자 정보가 없습니다")

  await deps.refundPayment({ tossUserKey, payToken: fee.toss_payment_key, isTest: input.isTest, reason: input.reason })
  await deps.markRefunded(input.feeId, input.reason)
  return { ok: true }
}
