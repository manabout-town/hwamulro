# 탁카 QA 테스트 시나리오 (Stage 6)

## 오라클(Oracle)과 실행 방식
- **오라클**: 2단계 BRD·3단계 기능명세가 없으므로(정책서만 진행), 검증 기준은 **`docs/03-spec/policies.md`의 POL** + **실제 구현 코드 동작**이다. 코드가 돌아가더라도 POL과 어긋나면 결함으로 본다.
- **실행 모드**: 라이브 E2E는 Supabase·Toss·Anthropic 실연동 환경이 필요해 이번 회차는 **정적 코드 검사(code-inspection)** 로 수행. 각 TC에 실행 모드 표기. 라이브 자동화(Chrome MCP)·수동 실행은 후속 회차 권장.
- **범위**: 핵심 3플로우 — TS-001 역제안 입찰/즉시수락, TS-002 에스크로 결제/정산, TS-003 KYC 인증 + TS-004 통합 여정.

## 결과 요약

| 지표 | 값 |
|---|---|
| 총 TC | 34 |
| Pass | 23 |
| Fail | 11 |
| Pass rate | 67.6% |
| 심각도 분포 | Critical 0 · Major 5 · Minor 6 · Trivial 0 |
| 정책/스펙 결함 | POL-022·043·052 미구현 코드 확인(정책 대비 갭) |

> Fail 다수는 **인가(authorization) 경계**와 **금전 무결성**에 집중 — 돈 다루는 서비스의 론칭 전 최우선 수정 영역. 대부분 서버측 가드 추가로 해결 가능.

---

## TS-001 역제안 입찰 / 즉시수락

관련 코드: `app/actions/bids.ts`, `app/actions/orders.ts`, `accept_order_atomic()`, `matches_unique_active_per_order`
관련 POL: POL-010(역할 접근), POL-030(동시수락), POL-051(미인증 기사 제한)

| TC | 분류 | 사전조건 | 절차 | 기대(POL/코드) | 실행모드 | 결과 |
|---|---|---|---|---|---|---|
| TC-001 | happy | 인증 기사, pending 의뢰 | 입찰가 5만, 메시지 제출 | bids insert, success | code | **Pass** |
| TC-002 | happy | 화주 본인 의뢰, 입찰 존재 | 입찰 승인 | match(accepted) 생성, 나머지 입찰 rejected, order matched | code | **Pass** |
| TC-003 | happy | 인증 기사, pending 의뢰 | 즉시수락 | accept_order_atomic → match, order matched | code | **Pass** |
| TC-004 | neg | 본인 의뢰 | 화주가 자기 의뢰 입찰/수락 | 차단(self) | code | **Pass** (submitBid L23, RPC self_accept) |
| TC-005 | neg | 이미 입찰함 | 동일 의뢰 재입찰 | "이미 입찰한 의뢰" 차단 | code | **Pass** (L26-27) |
| TC-006 | neg | 미인증 기사(rejected) | /driver/feed 접근·수락 | POL-051 미인증 제한 | code | **Pass**(미들웨어 KYC 게이트 리다이렉트) — 단 액션 자체 KYC 미검사(방어심화 권고, BUG-003 연관) |
| TC-007 | neg | **역할=화주** 세션 | `submitBid` 서버액션 직접 호출 | POL-010: 화주는 입찰 불가 → 차단돼야 함 | code | **Fail → BUG-001** (role 미검사, 입찰 생성됨) |
| TC-008 | neg | **역할=기사** 세션 | `createOrder` 직접 호출 | POL-010: 기사는 의뢰등록 불가 | code | **Fail → BUG-002** (role 미검사, 의뢰 생성됨) |
| TC-009 | neg | verified 화주 | `/driver/feed` 등 기사 영역 접근 | 역할 영역 접근 차단돼야 | code | **Fail → BUG-003** (미들웨어 role-area 미강제) |
| TC-010 | boundary | pending 의뢰, 기사 2인 | 동시 즉시수락 | 1명만 성립, 후착 already_matched | code | **Pass** (FOR UPDATE RPC) |
| TC-011 | boundary | 입찰 진행 중 + 동시 즉시수락 | approveBid·acceptOrder 경쟁 | 활성 매칭 1개만 | code | **Pass** (matches_unique_active_per_order) — 단 approveBid는 raw DB 에러 노출 → **BUG-010** |
| TC-012 | boundary | — | 입찰가 999 / 1000 | 999 차단, 1000 허용(≥1000) | code | **Pass** (L17) |

## TS-002 에스크로 결제 / 정산

관련 코드: `app/api/payments/toss/confirm/route.ts`, `app/actions/orders.ts`(confirmCompletion/cancelOrder), `app/actions/disputes.ts`, `app/actions/admin.ts`, `auto-release/route.ts`, `payouts_escrow_id_unique`
관련 POL: POL-040~044(에스크로/수수료/취소·환불/분쟁), POL-031(결제 멱등)

| TC | 분류 | 사전조건 | 절차 | 기대 | 실행모드 | 결과 |
|---|---|---|---|---|---|---|
| TC-020 | happy | matched 의뢰, 화주 결제 | Toss confirm(escrow) | escrow held 생성, order/match in_progress | code | **Pass** |
| TC-021 | happy | escrow held, 완료요청됨 | 화주 완료확인 | escrow released, payout(pending) insert, 정산 4% 차감 | code | **Pass** |
| TC-022 | happy | 완료요청 후 72h 경과, 미확인 | 크론 auto-release | 자동 released + payout | code | **Pass** |
| TC-023 | neg | escrow held, 분쟁 제기 | 분쟁 → status disputed | 72h 크론에서 제외(held만 대상) | code | **Pass** (auto-release L32 status='held') |
| TC-024 | neg | 완료확인 이미 처리 | confirmCompletion 재호출 | 멱등 — 이중 정산 없음 | code | **Pass** (escrow status guard + payouts UNIQUE) |
| TC-025 | boundary | escrow held | 결제 amount ≠ order.price로 confirm | POL-040: 보관액=의뢰금액, order.price 교차검증돼야 | code | **Fail → BUG-004** (client amount 미검증) |
| TC-026 | boundary | 완료확인/자동해제 | 정산액 산출 근거 | escrow.driver_payout(실제 보관·정산액) 사용돼야 | code | **Fail → BUG-005** (orders.price 재계산 — 가격 변경 시 불일치) |
| TC-027 | neg | 타인 세션 + 유효 paymentKey | 남의 escrow confirm | 화주 본인만 결제 확정 | code | **Fail → BUG-006** (호출자 소유 미검증) |
| TC-028 | neg | matched·결제완료(held) 상태 | 화주가 취소 시도 | POL-043 시작 전 취소=전액환불 경로 존재 | code | **Fail → BUG-007** (cancelOrder는 pending만 허용, 환불경로 없음) |
| TC-029 | neg | matched·미결제(escrow 없음) | 화주 완료확인 호출 | 미결제 상태 안내 | code | **Fail → BUG-011** ("이미 처리된 완료 요청" 오표시) |
| TC-030 | boundary | 잔액 < 출금액, 동시 출금 | request_withdrawal_atomic | insufficient_balance, 잔액 음수 불가 | code | **Pass** (FOR UPDATE) |
| TC-031 | neg | 분쟁 partial_refund 판정 | admin 판정 | 기사 정산액 50% 지급, 잔여 환불 | code | **Pass** (admin.ts partial 50%) |

## TS-003 KYC 인증

관련 코드: `app/api/kyc/verify/route.ts`
관련 POL: POL-050(임계값), POL-051(제한), POL-052(재제출), POL-022(업로드), POL-080/082(개인정보), POL-090(폴백)

| TC | 분류 | 사전조건 | 절차 | 기대 | 실행모드 | 결과 |
|---|---|---|---|---|---|---|
| TC-040 | happy | 기사, 사업자+면허 제출, confidence≥0.72 | KYC 제출 | approved, verification_status=verified | code | **Pass** (L465) |
| TC-041 | happy | 화주, 서류 없음 | KYC 제출 | auto-approve | code | **Pass** (L358) |
| TC-042 | neg | 기사, 면허 누락 | 제출 | 400 "운전면허증 필요" | code | **Pass** (L351) |
| TC-043 | neg | Claude Vision API 장애 | 제출 | confidence 0.5 → manual_review (POL-090) | code | **Pass** (L457, L470) |
| TC-044 | boundary | confidence == 0.35 | 판정 | manual_review (POL-050: <0.35만 거절) | code | **Pass** (L467) |
| TC-045 | boundary | confidence == 0.72 | 판정 | approved | code | **Pass** (L465) |
| TC-046 | neg | 기사, 100MB 비이미지 파일 | 업로드 | POL-022: 타입/용량 제한 | code | **Fail → BUG-008** (검증 부재, 그대로 저장·전송) |
| TC-047 | neg | 거절된 기사 | 즉시 반복 재제출 | POL-052: 재제출 제한/쿨다운 | code | **Fail → BUG-009** (제한 없음, 비용·남용) |
| TC-048 | neg | 이미 verified | KYC 재요청 | short-circuit approved | code | **Pass** (L331) |

## TS-004 통합 여정 (Cross-feature)

| TC | 시나리오 | 결과 |
|---|---|---|
| TC-060 | 화주 의뢰등록 → 기사 입찰 → 화주 승인(매칭) → 화주 에스크로 결제 → 기사 픽업/완료요청 → 화주 완료확인 → 4% 차감 정산 → 상호 리뷰 | **Pass** — 핵심 해피패스 end-to-end 코드상 연결 확인. (금전·인가 경계 결함은 TS-001/002 참조) |

---

## 정상 동작 확인 목록 (신뢰성 근거)
- 동시 즉시수락 경쟁조건 방지(accept_order_atomic FOR UPDATE) ✅
- 활성 매칭 1개 강제(부분 유니크 인덱스) ✅
- 이중 정산 차단(payouts UNIQUE escrow_id + status guard) ✅
- 결제 멱등성(pg_transaction_id 선체크) ✅
- 분쟁 시 72h 자동해제 제외 ✅
- KYC Claude 장애 폴백 → manual_review ✅
- KYC 임계값 0.72/0.35 정책 일치 ✅
- 출금 잔액 원자적 검증 ✅

## 후속 회차 권장
- 라이브 E2E: Toss 테스트결제 실승인, Claude Vision 실판정, 크론 실행까지 자동화 검증.
- 부하/경쟁: 동일 의뢰 다수 기사 동시 수락 실부하 테스트.
