# 시작 전 취소·환불 설계 (POL-043 구현 / BUG-007 해소)

- 날짜: 2026-07-06
- 관련: BUG-007, POL-043, POL-040(취소·환불 수수료 미부과), POL-021(soft delete)
- 목적: 매칭·결제(held) 이후 **물리적 운송 시작 전** 단계에 정상 취소·환불 경로 신설. 현재는 `cancelOrder`가 `pending`만 허용하고, 결제금 환불은 분쟁 경로로만 가능 → 정책·동작 불일치(CS 리스크) 해소.

## 결정된 요구사항 (브레인스토밍 확정)

1. **환불 실행 = DB 상태만** (기존 분쟁 환불 패턴 동일). 실제 카드 환불은 수동/장부 처리. 전체 코드베이스에 Toss 취소 API 전무 — 본 기능도 도입하지 않음(별도 백로그).
2. **위약금 없음** — 시작 전 취소는 화주/기사 귀책 무관 전액 환불. 화주 귀책 단계별 위약금율은 정책 미확정 블로커 → 후속.
3. **취소 주체 = 화주·기사 둘 다** — 시작 전엔 양측 백아웃 가능. 위약금 없으니 금전상 귀책 구분 불필요, 알림·기록에만 반영.

## 취소 가능 경계

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

## 서버 액션: `cancelBeforeStart(matchId: string)`

위치: `app/actions/orders.ts` (기존 `cancelOrder`는 pending 전용으로 유지).

흐름:
1. 인증. 미로그인 → `{ error }`.
2. match + order 조회 (`matches` → `orders(shipper_id, status)`, `driver_id`). 없으면 에러.
3. 당사자 검증: `user.id === order.shipper_id || user.id === match.driver_id`. 아니면 권한 에러.
4. 종결 상태(order.status ∈ {completed, cancelled, disputed}) → "취소할 수 없는 상태".
5. pickup 리포트 조회(`condition_reports` where match_id, type='pickup'). 존재 → "이미 운송이 시작되어 취소할 수 없습니다. 분쟁을 이용해주세요."
6. escrow 조회(order_id). status='held'면 `update status='refunded'`. (없거나 held 아니면 스킵 — 멱등)
7. `orders.status='cancelled'`, `matches.status='cancelled'` (service role).
8. `notifications`: 상대방 + 본인에게 취소 알림(취소 주체·전액 환불·영업일 5~10일 안내 문구).
9. `driver_locations` 파기(match_id 기준, POL-081).
10. revalidate 관련 경로. `{ success: true }`.

멱등: 이미 cancelled면 4에서 차단 → 재호출 무해.

## UI

- **화주** `app/(shipper)/shipper/orders/[id]` — 시작 전 조건일 때 "취소" 버튼 노출. 클릭 → 확인 모달(전액 환불·되돌릴 수 없음·영업일 5~10일) → `cancelBeforeStart` 호출.
- **기사** `app/(driver)/driver/orders/[id]` (DriverOrderDetailClient) — 동일 버튼·모달.
- 버튼 노출 조건은 서버에서 pickup 리포트 부재 + 종결 아님 계산해 prop 전달(클라 위조 무의미 — 서버액션이 재검증).

## 데이터

신규 컬럼 없음(YAGNI). 기존 `orders.status`, `matches.status`, `escrow.status`, `notifications`로 처리. 취소 주체·시각은 알림 레코드로 추적.
- (후속 선택지) 감사·CS 강화 시 `orders.cancelled_by uuid`, `cancelled_at timestamptz` 추가 — 마이그레이션 필요, 본 범위 제외.

## 에러 처리

- 미로그인 / 권한 없음 / 종결 상태 / 이미 시작(pickup) — 각기 사용자 문구.
- escrow 업데이트·상태 전이 실패는 기존 패턴대로 에러 반환(부분실패 원자화는 #9 백로그).

## 테스트 (정적/시나리오)

- pending 취소(화주) → cancelled, escrow 없음.
- matched 취소(화주/기사) → cancelled.
- in_progress + held + pickup 없음 취소 → cancelled + escrow refunded.
- in_progress + pickup 있음 → 차단.
- 제3자 호출 → 권한 에러.
- 이미 cancelled 재호출 → 차단(멱등).

## 비범위 (명시적 제외)

- 실제 Toss 취소 API 환불 (백로그).
- 화주 귀책 위약금 (정책 미확정).
- 취소 사유 입력·통계 대시보드.
- 결제 confirm 원자화(#9).
