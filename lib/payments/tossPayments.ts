// 토스페이먼츠(PG) v1 REST 어댑터. DI fetch로 단위테스트 가능.
// 인증: Basic base64("{secretKey}:") — 웹 에스크로 confirm과 동일 방식.

export interface TossPaymentsConfig {
  secretKey: string
}

export function tossBasicAuth(secretKey: string): string {
  const enc = typeof btoa === "function" ? btoa(`${secretKey}:`) : Buffer.from(`${secretKey}:`).toString("base64")
  return `Basic ${enc}`
}

export interface ConfirmInput {
  paymentKey: string
  orderId: string
  amount: number
}

export async function confirmTossPayments(
  fetchFn: typeof fetch,
  cfg: TossPaymentsConfig,
  input: ConfirmInput,
): Promise<{ paymentKey: string; orderId: string; totalAmount: number; transactionKey: string }> {
  const res = await fetchFn("https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: { Authorization: tossBasicAuth(cfg.secretKey), "Content-Type": "application/json" },
    body: JSON.stringify({ paymentKey: input.paymentKey, orderId: input.orderId, amount: input.amount }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`결제 승인 실패: ${json?.code ?? res.status}`)
  return {
    paymentKey: json.paymentKey,
    orderId: json.orderId,
    totalAmount: json.totalAmount,
    transactionKey: json.lastTransactionKey ?? json.paymentKey,
  }
}

export interface CancelInput {
  paymentKey: string
  reason: string
}

export async function cancelTossPayments(
  fetchFn: typeof fetch,
  cfg: TossPaymentsConfig,
  input: CancelInput,
): Promise<{ status: string }> {
  const res = await fetchFn(`https://api.tosspayments.com/v1/payments/${input.paymentKey}/cancel`, {
    method: "POST",
    headers: { Authorization: tossBasicAuth(cfg.secretKey), "Content-Type": "application/json" },
    body: JSON.stringify({ cancelReason: input.reason }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`결제 취소 실패: ${json?.code ?? res.status}`)
  return { status: json.status }
}
