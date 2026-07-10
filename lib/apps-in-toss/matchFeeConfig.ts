// 매칭 이용료 정책 상수. 금액 변경은 여기서만.
export const MATCH_FEE_AMOUNT = 3000
export const MATCH_FEE_TTL_MS = 24 * 60 * 60 * 1000 // 24시간

// 토스페이 파트너 API 경로
export const TOSSPAY_MAKE_PAYMENT = "/api-partner/v1/apps-in-toss/pay/make-payment"
export const TOSSPAY_EXECUTE_PAYMENT = "/api-partner/v1/apps-in-toss/pay/execute-payment"

export function matchFeeProductDesc(): string {
  return "탁카 매칭 이용료"
}
