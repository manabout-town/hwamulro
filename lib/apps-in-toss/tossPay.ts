// 토스페이 파트너 API 순수 호출. mTLS·헤더는 fetchFn에 주입(tossLogin.ts 동일 패턴).
import { TOSSPAY_MAKE_PAYMENT, TOSSPAY_EXECUTE_PAYMENT } from "./matchFeeConfig"

export interface TossPayConfig {
  apiBase: string
}

export interface CreatePaymentInput {
  tossUserKey: string
  orderNo: string
  amount: number
  productDesc: string
  isTest: boolean
}

export async function createTossPayment(
  fetchFn: typeof fetch,
  cfg: TossPayConfig,
  input: CreatePaymentInput
): Promise<{ payToken: string }> {
  const res = await fetchFn(`${cfg.apiBase}${TOSSPAY_MAKE_PAYMENT}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-toss-user-key": input.tossUserKey },
    body: JSON.stringify({
      orderNo: input.orderNo,
      productDesc: input.productDesc,
      amount: input.amount,
      amountTaxFree: input.amount, // 중개 서비스료: 비과세 처리(과세 필요 시 정책에 맞게 조정)
      cashReceipt: false,
      isTestPayment: input.isTest,
    }),
  })
  if (!res.ok) throw new Error(`결제 생성 실패: ${res.status}`)
  const json = await res.json()
  if (json?.resultType !== "SUCCESS" || !json?.success?.payToken) {
    throw new Error(`결제 생성 실패: ${json?.error?.errorCode ?? "unknown"}`)
  }
  return { payToken: json.success.payToken as string }
}

export interface ExecutePaymentInput {
  tossUserKey: string
  payToken: string
  orderNo: string
  isTest: boolean
}

export async function executeTossPayment(
  fetchFn: typeof fetch,
  cfg: TossPayConfig,
  input: ExecutePaymentInput
): Promise<{ stateMsg: string; transactionId: string; payToken: string }> {
  const res = await fetchFn(`${cfg.apiBase}${TOSSPAY_EXECUTE_PAYMENT}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-toss-user-key": input.tossUserKey },
    body: JSON.stringify({ payToken: input.payToken, orderNo: input.orderNo, isTestPayment: input.isTest }),
  })
  if (!res.ok) throw new Error(`결제 승인 실패: ${res.status}`)
  const json = await res.json()
  if (json?.resultType !== "SUCCESS") {
    throw new Error(`결제 승인 실패: ${json?.success?.errorCode ?? json?.error?.errorCode ?? "unknown"}`)
  }
  const s = json.success
  return { stateMsg: s.stateMsg, transactionId: s.transactionId, payToken: s.payToken }
}
