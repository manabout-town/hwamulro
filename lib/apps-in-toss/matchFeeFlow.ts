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
  getFee: (feeId: string) => Promise<{ id: string; driver_id: string; status: string; toss_order_no: string | null } | null>
  getDriverTossKey: (driverId: string) => Promise<string | null>
  executePayment: (args: { tossUserKey: string; payToken: string; orderNo: string; isTest: boolean }) => Promise<{ transactionId: string; payToken: string; stateMsg: string }>
  markPaid: (feeId: string, payToken: string) => Promise<void>
}

export async function confirmMatchFeeFlow(
  deps: ConfirmDeps,
  input: { feeId: string; userId: string; payToken: string; isTest: boolean }
): Promise<{ ok: true }> {
  const fee = await deps.getFee(input.feeId)
  if (!fee) throw new Error("이용료 정보를 찾을 수 없습니다")
  if (fee.driver_id !== input.userId) throw new Error("권한이 없습니다")
  if (fee.status === "paid") return { ok: true } // 멱등
  if (!fee.toss_order_no) throw new Error("결제 생성 이력이 없습니다")

  const tossUserKey = await deps.getDriverTossKey(fee.driver_id)
  if (!tossUserKey) throw new Error("토스 사용자 정보가 없습니다")

  await deps.executePayment({ tossUserKey, payToken: input.payToken, orderNo: fee.toss_order_no, isTest: input.isTest })
  await deps.markPaid(input.feeId, input.payToken)
  return { ok: true }
}

export interface ExpireDeps {
  getFee: (feeId: string) => Promise<{ id: string; match_id: string; status: string; expires_at: string } | null>
  getMatchOrder: (matchId: string) => Promise<{ order_id: string } | null>
  cancelMatch: (matchId: string) => Promise<void>
  reopenOrder: (orderId: string) => Promise<void>
  cancelFee: (feeId: string) => Promise<void>
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

  const mo = await deps.getMatchOrder(fee.match_id)
  await deps.cancelMatch(fee.match_id)
  if (mo) await deps.reopenOrder(mo.order_id)
  await deps.cancelFee(fee.id)
  return { expired: true }
}
