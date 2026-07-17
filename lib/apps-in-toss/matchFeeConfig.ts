// 매칭 이용료 정책 상수. 금액 변경은 여기서만.
export const MATCH_FEE_AMOUNT = 3000
export const MATCH_FEE_TTL_MS = 24 * 60 * 60 * 1000 // 24시간

export function matchFeeProductDesc(): string {
  return "탁카 매칭 이용료"
}
