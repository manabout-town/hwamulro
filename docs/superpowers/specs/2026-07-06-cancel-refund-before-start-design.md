# 시작 전 취소·환불 설계 (POL-043 구현 / BUG-007 해소)

- 날짜: 2026-07-06
- 관련: BUG-007, POL-043, POL-040(취소·환불 수수료 미부과), POL-021(soft delete)
- 목적: 매칭·결제(held) 이후 **물리적 운송 시작 전** 단계에 정상 취소·환불 경로 신설. 현재는 `cancelOrder`가 `pending`만 허용하고, 결제금 환불은 분쟁 경로로만 가능 → 정책·동작 불일치(CS 리스크) 해소.

## ⚠️ 조사 정정 (초안 전제 오류)

초안은 "취소 경로가 cancelOrder(pending)뿐"이라 가정했으나 **틀림**. 실제 기존 인프라:
- `cancelOrder(orderId)` — 화주, **pending 전용**, 환불 없음. (`app/actions/orders.ts`)
- `cancelMatch(matchId, reason)` — **기사 전용**, accepted+in_progress, **시간기반 위약금(당일 30%/12h내 20%, wallet 기반 기사→화주)**, order를 **pending 재공개**, **escrow 미처리**. UI: `components/driver/MatchStatusButtons.tsx`. 위약금 컬럼(`matches.cancelled_by_user/cancel_reason/penalty_amount/penalty_status`)은 마이그레이션 011에 이미 존재.

**실제 갭:**
1. 화주는 결제 후(escrow held) 시작 전 취소 경로 **전무** (cancelOrder는 pending만).
2. **escrow 고아 버그**: 기사가 결제완료(held) 건 cancelMatch → order pending 재공개되나 escrow held 잔존 → 화주 미환불 + 재결제 가능(이중결제 위험).

## 결정된 요구사항 (재확정)

1. **환불 실행 = DB 상태만** (escrow status→refunded). Toss 취소 API 미도입(백로그).
2. **화주 취소 A**: 화주 시작 전 취소 → order **cancelled**(종결) + escrow held면 **refunded** + match cancelled. 화주 자기 주문 취소 → **위약금 없음**(POL-043 시작전 전액환불). 기사측 위약금(cancelMatch)은 **그대로 유지**.
3. **버그픽스 B**: `cancelMatch`에 결제완료(escrow held) 건 취소 시 **escrow refunded** 처리 추가(고아·이중결제 차단). 기존 위약금·pending 재공개 동작은 유지.
4. **공통 헬퍼**: `refundEscrowIfHeld(service, orderId)` — A·B 공유(DRY).

## 취소 가능 경계 (화주측 A)

핵심 신호: **`condition_reports`의 `type='pickup'` 리포트 존재 여부**.
- 결제 시 order·match가 즉시 `in_progress`로 전이(`app/api/payments/toss/confirm/route.ts:101-102`)되므로 order.status만으로는 "물리적 시작" 판별 불가.
- pickup 리포트 = 기사가 픽업 시점 차량 상태 문서화 = 물리적 운송 시작. 이것을 "시작" 게이트로 사용.

| order 상태 | 조건 | 결과 |
|---|---|---|
| `pending` | 매칭 전 | 취소만 (escrow 없음) — 기존 `cancelOrder` 유지 |
| `matched` | 입찰 수락·미결제 | 취소 (escrow 없음) |
| `in_progress` | escrow `held` + pickup 리포트 **없음** | 취소 + escrow→`refunded` |
| `in_progress` | pickup 리포트 **있음** | ❌ 차단 → 분쟁 경로 안내 |
| `completed`/`cancelled`/`disputed` | — | ❌ 차단 |

## 공통 헬퍼: `refundEscrowIfHeld(service, orderId)`

위치: `app/actions/matches.ts` 상단. escrow held면 refunded 전이, 아니면 no-op. 반환 `{ refunded }`.

```ts
async function refundEscrowIfHeld(
  service: ReturnType<typeof createServiceClient>,
  orderId: string
): Promise<{ refunded: boolean }> {
  const { data: escrow } = await service
    .from("escrow").select("id, status").eq("order_id", orderId).maybeSingle()
  if (escrow?.status === "held") {
    await service.from("escrow").update({ status: "refunded" }).eq("id", escrow.id)
    return { refunded: true }
  }
  return { refunded: false }
}
```

## 화주 취소 액션 A: `cancelMatchByShipper(matchId, reason?)`

위치: `app/actions/matches.ts` (cancelMatch와 co-locate).

흐름:
1. 인증. 미로그인 → `{ error }`.
2. match+order 조회(`orders!inner(shipper_id, origin, destination, status)`, driver_id, status).
3. 화주 본인 검증: `order.shipper_id === user.id` 아니면 "권한이 없습니다".
4. match.status ∈ {accepted, in_progress} 아니면 "취소할 수 없는 상태입니다".
5. pickup 리포트(`condition_reports` match_id, type='pickup') 존재 → "이미 운송이 시작되어 취소할 수 없습니다. 분쟁을 이용해주세요."
6. `refundEscrowIfHeld(service, order_id)` → refunded.
7. `matches.update({ status:'cancelled', cancelled_at, cancelled_by_user:user.id, cancel_reason:reason||null })`.
8. `orders.update({ status:'cancelled' })` (종결).
9. `notifications` 2건: 화주(취소 완료, refunded면 "영업일 5~10일 환불" 문구), 기사(화주 취소 알림).
10. `driver_locations` 파기(match_id, POL-081).
11. revalidate: /shipper/dashboard, /shipper/orders/[id], /driver/matches, /driver/dashboard. `{ success:true, refunded }`.

멱등: 이미 cancelled면 4에서 차단.

## 버그픽스 B: `cancelMatch`에 escrow 환불 추가

`matches.update` 직전(현 line 99 근처)에 삽입:
```ts
const { refunded: escrowRefunded } = await refundEscrowIfHeld(service, match.order_id)
```
기사 취소 알림 body에 `escrowRefunded`면 "결제금은 영업일 5~10일 내 환불됩니다." append. 기존 위약금·`orders→pending`·wallet 로직은 **유지**(기사 귀책 재공개 정책 불변).

## UI (화주측 A만 신규)

- **화주** `app/(shipper)/shipper/orders/[id]/page.tsx` — 기존 "의뢰 취소"(pending, cancelOrder) 유지. match.status ∈ {accepted,in_progress} + pickup 리포트 부재일 때 신규 컴포넌트 노출.
- 신규 `components/shipper/ShipperCancelButton.tsx` (client) — 버튼 + 확인 모달(전액 환불·되돌릴 수 없음·영업일 5~10일) → `cancelMatchByShipper(matchId)` 호출, 성공 시 라우터 refresh.
- 노출 조건은 서버 컴포넌트에서 계산(matchId, canCancel bool) 후 prop 전달. 서버액션이 재검증하므로 위조 무의미.

## 데이터

신규 컬럼 없음 — 기존 `matches.cancelled_by_user/cancel_reason/cancelled_at`(마이그레이션 011), `escrow.status`, `orders.status`, `notifications` 재사용.

## 에러 처리

- 미로그인 / 권한 없음(화주 아님) / 상태 부적합 / 이미 시작(pickup) — 각 문구.
- 부분실패 원자화는 #9 백로그(기존 패턴 유지).

## 검증 (테스트 러너 없음 — tsc + 시나리오 정적검증)

리포지토리에 테스트 러너 없음(정적 QA 방식). 각 작업 `npx tsc --noEmit` 통과 + 시나리오 코드리뷰:
- A matched(미결제) 화주 취소 → order/match cancelled, refunded=false.
- A in_progress(held) 화주 취소 → cancelled + escrow refunded=true.
- A pickup 리포트 있음 → 차단.
- A 기사(제3자) 호출 → 권한 에러.
- A 이미 cancelled 재호출 → 차단.
- B 기사 cancelMatch(held) → escrow refunded + 위약금·pending 유지.
- B 기사 cancelMatch(미결제 accepted) → refunded=false, 기존 동작 불변.

## 비범위 (명시적 제외)

- 실제 Toss 취소 API 환불 (백로그).
- 화주 귀책 위약금 (정책 미확정).
- 취소 사유 입력·통계 대시보드.
- 결제 confirm 원자화(#9).
