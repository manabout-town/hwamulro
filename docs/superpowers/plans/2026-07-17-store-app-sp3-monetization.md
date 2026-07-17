# 탁카 스토어 앱 SP3(수익화) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 매칭이용료 3,000원(A안) 유지 + 결제수단만 토스 파트너 토스페이 → **토스페이먼츠(PG) v1 API**로 교체. 백엔드 결제 어댑터 신규·라우트 재배선(오케스트레이터 로직 보존), 결제위젯 웹페이지 서빙, MatchDetail RN 이식(연락처 게이팅·WebView 결제·채팅 폴링), OrderDetail·DriverMy 진입 연결.

**Architecture:**
- 백엔드 `matchFeeFlow`(주입형 오케스트레이터)의 **결제 dep만** 토스페이먼츠 어댑터로 교체. 상태머신·멱등·markPaid 조건부갱신·레이스→자동취소·만료(expire) 로직은 전부 보존.
- 결제 UI = **2안 확정**: 백엔드가 서빙하는 토스페이먼츠 웹 결제위젯 페이지(`app/pay/match-fee/[feeId]`) + RN `react-native-webview`. 결제 성공 시 Toss가 `successUrl`로 리다이렉트 → WebView가 URL 인터셉트로 `paymentKey` 파싱 → RN이 Bearer 세션으로 `match-fee/confirm` 호출. (1안 미채택 근거는 하단 "결정 근거" 참조.)
- DB 스키마 변경 없음. 토스페이먼츠 필드가 기존 컬럼에 그대로 매핑됨(하단 "DB 컬럼 처리" 참조).

**Tech Stack:** 기존 Next.js(App Router)·Supabase·vitest, 신규 `react-native-webview`(Expo install), 토스페이먼츠 v1 REST(`/v1/payments/confirm`, `/v1/payments/{paymentKey}/cancel`), 웹 SDK `https://js.tosspayments.com/v1/payment`.

**전제:** 레포 루트 `/Users/park/Desktop/탁카`, 브랜치 `feat/store-app-expo`. 현재 vitest **54 passed(8 files)**. 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. (커밋은 오케스트레이터/사용자 검수 후.)

---

### 결정 근거 (계획 확정 사항)

**RN 결제 UI: 2안(백엔드 서빙 결제위젯 웹페이지 + WebView) 확정.**
- 1안 `@tosspayments/widget-sdk-react-native`는 npm에 존재하나(v1.5.2, 2026-05 갱신) `peerDependencies`에 **`react-native-webview >=13.3.0 <14.0.0`** 하드핀이 있다. `mobile/AGENTS.md`는 Expo SDK 57을 명시하며, Expo가 관리하는 `react-native-webview` 버전이 14.x면 피어 충돌이 난다. SDK 자체가 WebView 래퍼라 네이티브 리스크만 늘고 UX 이득이 없다.
- 프로젝트에 이미 검증된 토스페이먼츠 v1 웹 플로우가 존재한다(`app/(shipper)/shipper/orders/[id]/pay/page.tsx` + `app/api/payments/toss/{confirm,success,fail}`). 같은 v1 API·같은 가맹점 도메인(takca.vercel.app)을 재사용하면 PG 가맹점 등록 1건으로 웹·앱을 모두 커버한다.
- `react-native-webview`는 버전 핀 없이 `npx expo install`로 붙는 Expo 1급 패키지다.

**matchFeeFlow 시그니처: 변경 있음(로직은 보존).** 토스페이먼츠 PG는 파트너 토스페이와 결제 모델이 다르다. 파트너페이는 서버 make-payment(payToken 발급)→클라 checkoutPayment→서버 execute-payment로 **서버 2콜**이지만, 토스페이먼츠는 클라 위젯 `requestPayment`(orderId+amount+clientKey)→리다이렉트(paymentKey)→서버 `confirm` **1콜**이다. 따라서:
- `payMatchFeeFlow`: 외부 결제 생성이 사라지고 "주문번호 준비" 단계가 된다. `getDriverTossKey`·`createPayment` dep 제거, 반환 `{ payToken }`→`{ orderNo, amount }`.
- `confirmMatchFeeFlow`: 입력 `payToken`→`paymentKey`, `executePayment({tossUserKey,payToken,orderNo})`→`confirmPayment({paymentKey,orderId,amount})`, `refundPayment`→`cancelPayment`, `getDriverTossKey` 제거. 서버 금액가드(`amount===3000`)·orderId 대조 추가.
- `refundMatchFeeFlow`: `getDriverTossKey` 제거, `refundPayment`→`cancelPayment`.
- 상태머신·멱등·`markPaid` 조건부갱신·레이스→자동취소·`expireMatchFeeFlow`(변경 없음)는 그대로. `matchFeeFlow.test.ts`를 새 dep 형태로 갱신(TDD: 테스트 먼저). `isTest` 플래그는 테스트/라이브가 키 선택으로 결정되므로 전 함수에서 제거.

**DB 컬럼 처리: 마이그레이션 불필요(컬럼 재해석).** 019/021의 `match_fees` 컬럼이 토스페이먼츠 필드와 정확히 대응한다.
- `toss_order_no` ← 토스페이먼츠 `orderId`
- `toss_payment_key` ← 토스페이먼츠 `paymentKey` (컬럼명이 이미 일치)
- `toss_transaction_id` ← confirm 응답 `lastTransactionKey`
신규 022 마이그레이션 없음.

---

### Task 1: 토스페이먼츠 결제 어댑터 (TDD)

DI `fetch`로 단위테스트 가능한 순수 어댑터. 웹 에스크로 confirm(`app/api/payments/toss/confirm/route.ts` 63-71행)의 Basic 인증·엔드포인트 패턴 재사용.

**Files:**
- Create: `lib/payments/tossPayments.ts`
- Create: `lib/payments/tossPayments.test.ts`

- [ ] **Step 1: 실패 테스트 작성** — `lib/payments/tossPayments.test.ts`

```ts
import { describe, it, expect } from "vitest"
import { confirmTossPayments, cancelTossPayments, tossBasicAuth } from "./tossPayments"

function okFetch(json: unknown, capture?: (url: string, init: RequestInit) => void): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    capture?.(url, init)
    return { ok: true, status: 200, json: async () => json }
  }) as unknown as typeof fetch
}
function failFetch(status: number, json: unknown = {}): typeof fetch {
  return (async () => ({ ok: false, status, json: async () => json })) as unknown as typeof fetch
}

describe("tossBasicAuth", () => {
  it("secretKey 뒤에 콜론 붙여 base64 Basic 헤더 생성", () => {
    expect(tossBasicAuth("test_sk_abc")).toBe(`Basic ${Buffer.from("test_sk_abc:").toString("base64")}`)
  })
})

describe("confirmTossPayments", () => {
  it("성공 시 paymentKey/orderId/금액/거래키 반환 + 올바른 엔드포인트·바디", async () => {
    let seenUrl = "", seenBody = ""
    const f = okFetch(
      { paymentKey: "pk_1", orderId: "mf_1", totalAmount: 3000, status: "DONE", lastTransactionKey: "tx_1" },
      (u, i) => { seenUrl = u; seenBody = String(i.body) },
    )
    const r = await confirmTossPayments(f, { secretKey: "sk" }, { paymentKey: "pk_1", orderId: "mf_1", amount: 3000 })
    expect(seenUrl).toBe("https://api.tosspayments.com/v1/payments/confirm")
    expect(JSON.parse(seenBody)).toEqual({ paymentKey: "pk_1", orderId: "mf_1", amount: 3000 })
    expect(r).toEqual({ paymentKey: "pk_1", orderId: "mf_1", totalAmount: 3000, transactionKey: "tx_1" })
  })
  it("HTTP 실패면 토스 code로 에러", async () => {
    await expect(confirmTossPayments(failFetch(400, { code: "ALREADY_PROCESSED_PAYMENT" }), { secretKey: "sk" },
      { paymentKey: "pk_1", orderId: "mf_1", amount: 3000 })).rejects.toThrow("결제 승인 실패: ALREADY_PROCESSED_PAYMENT")
  })
})

describe("cancelTossPayments", () => {
  it("성공 시 status 반환 + paymentKey 경로·cancelReason 바디", async () => {
    let seenUrl = "", seenBody = ""
    const f = okFetch({ status: "CANCELED" }, (u, i) => { seenUrl = u; seenBody = String(i.body) })
    const r = await cancelTossPayments(f, { secretKey: "sk" }, { paymentKey: "pk_1", reason: "청약철회" })
    expect(seenUrl).toBe("https://api.tosspayments.com/v1/payments/pk_1/cancel")
    expect(JSON.parse(seenBody)).toEqual({ cancelReason: "청약철회" })
    expect(r).toEqual({ status: "CANCELED" })
  })
  it("HTTP 실패면 토스 code로 에러", async () => {
    await expect(cancelTossPayments(failFetch(400, { code: "NOT_CANCELABLE_AMOUNT" }), { secretKey: "sk" },
      { paymentKey: "pk_1", reason: "x" })).rejects.toThrow("결제 취소 실패: NOT_CANCELABLE_AMOUNT")
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run lib/payments/tossPayments.test.ts` → Expected: FAIL (module not found)

- [ ] **Step 3: 구현** — `lib/payments/tossPayments.ts`

```ts
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
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run lib/payments/tossPayments.test.ts` → Expected: 5 passed

- [ ] **Step 5: 커밋** — `git add lib/payments && git commit -m "feat(payments): 토스페이먼츠 v1 결제 어댑터(confirm·cancel) TDD"`

---

### Task 2: matchFeeFlow 결제 dep 교체 + 파트너 어댑터 제거 (TDD)

오케스트레이터의 결제 dep만 토스페이먼츠 형태로 교체. 상태머신·멱등·레이스 로직 보존. `matchFeeFlow.test.ts`를 새 dep 형태로 갱신(테스트 먼저). 파트너 전용 `tossPay.ts`/`tossPay.test.ts`·`matchFeeConfig.ts`의 파트너 경로 상수 삭제.

**Files:**
- Modify: `lib/apps-in-toss/matchFeeFlow.ts`
- Modify: `lib/apps-in-toss/matchFeeFlow.test.ts`
- Modify: `lib/apps-in-toss/matchFeeConfig.ts`
- Delete: `lib/apps-in-toss/tossPay.ts`, `lib/apps-in-toss/tossPay.test.ts`

- [ ] **Step 1: 테스트 갱신(실패 유도)** — `lib/apps-in-toss/matchFeeFlow.test.ts` 의 `payDeps`/`confirmDeps`/`refundDeps`·기대값을 새 dep 형태로 교체. 핵심 변경:
  - `payDeps`: `getDriverTossKey`·`createPayment` 제거. `getFee`가 `amount:3000` 유지. `payMatchFeeFlow(d, { feeId, userId })` 호출(→ `isTest` 인자 제거), 기대값 `{ orderNo: expect.stringMatching(/^mf_/), amount: 3000 }`, `calls`에 `"orderNo"` 포함.
  - `confirmDeps`: `getFee`에 `amount:3000` 추가. `getDriverTossKey` 제거. `executePayment`→`confirmPayment: async () => { calls.push("confirm"); return { transactionKey: "tx_1" } }`. `refundPayment`→`cancelPayment: async () => { calls.push("cancel") }`. 호출 `confirmMatchFeeFlow(d, { feeId, userId, paymentKey: "pk_1" })`. 성공 기대 `calls === ["confirm","paid"]`. 레이스 케이스는 `["confirm","paid","cancel","markRefunded"]`, 취소실패는 `["confirm","paid","markRefundFailed"]`. 에러문구는 "자동 취소" 계열로 갱신.
  - 신규 케이스 추가: `getFee`가 `amount: 5000`이면 confirm 전 `"결제 금액이 올바르지 않습니다"`로 차단, `calls === []`.
  - `refundDeps`: `getDriverTossKey` 제거, `refundPayment`→`cancelPayment: async () => { calls.push("cancel") }`. 호출 `refundMatchFeeFlow(d, { feeId, reason })`(→ `isTest` 제거). 성공 기대 `["cancel","markRefunded"]`.
  - `expireMatchFeeFlow` 블록은 변경 없음(그대로 유지).

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run lib/apps-in-toss/matchFeeFlow.test.ts` → Expected: FAIL(시그니처 불일치)

- [ ] **Step 3: 오케스트레이터 구현** — `lib/apps-in-toss/matchFeeFlow.ts` 의 Pay/Confirm/Refund만 교체(Expire 블록은 유지)

```ts
import { MATCH_FEE_AMOUNT } from "./matchFeeConfig"

export interface PayDeps {
  getFee: (feeId: string) => Promise<{ id: string; driver_id: string; amount: number; status: string; expires_at: string; toss_order_no: string | null } | null>
  setOrderNo: (feeId: string, orderNo: string) => Promise<void>
  now: () => number
}

export async function payMatchFeeFlow(
  deps: PayDeps,
  input: { feeId: string; userId: string },
): Promise<{ orderNo: string; amount: number }> {
  const fee = await deps.getFee(input.feeId)
  if (!fee) throw new Error("이용료 정보를 찾을 수 없습니다")
  if (fee.driver_id !== input.userId) throw new Error("권한이 없습니다")
  if (fee.status === "paid") throw new Error("이미 결제된 매칭입니다")
  if (fee.status !== "pending") throw new Error("결제할 수 없는 상태입니다")
  if (new Date(fee.expires_at).getTime() < deps.now()) throw new Error("매칭이 만료되었습니다")

  // 유니크 주문번호: fee.id + timestamp (재시도 시 매번 신규)
  const orderNo = `mf_${fee.id.replace(/-/g, "").slice(0, 20)}_${deps.now()}`
  await deps.setOrderNo(input.feeId, orderNo)
  return { orderNo, amount: fee.amount }
}

export interface ConfirmDeps {
  getFee: (feeId: string) => Promise<{ id: string; driver_id: string; amount: number; status: string; toss_order_no: string | null; expires_at: string } | null>
  confirmPayment: (args: { paymentKey: string; orderId: string; amount: number }) => Promise<{ transactionKey: string }>
  markPaid: (feeId: string, paymentKey: string, transactionKey: string) => Promise<number>
  cancelPayment: (args: { paymentKey: string; reason: string }) => Promise<void>
  markRefunded: (feeId: string, reason: string) => Promise<void>
  markRefundFailed: (feeId: string, reason: string) => Promise<void>
  now: () => number
}

export async function confirmMatchFeeFlow(
  deps: ConfirmDeps,
  input: { feeId: string; userId: string; paymentKey: string },
): Promise<{ ok: true }> {
  const fee = await deps.getFee(input.feeId)
  if (!fee) throw new Error("이용료 정보를 찾을 수 없습니다")
  if (fee.driver_id !== input.userId) throw new Error("권한이 없습니다")
  if (fee.status === "paid") return { ok: true } // 멱등
  if (fee.status !== "pending") throw new Error("취소되었거나 만료된 매칭입니다. 결제할 수 없습니다")
  if (!fee.toss_order_no) throw new Error("결제 생성 이력이 없습니다")
  if (new Date(fee.expires_at).getTime() < deps.now()) throw new Error("매칭이 만료되었습니다")
  if (fee.amount !== MATCH_FEE_AMOUNT) throw new Error("결제 금액이 올바르지 않습니다")

  // orderId·amount는 서버 저장값으로 승인(클라 위변조 차단)
  const { transactionKey } = await deps.confirmPayment({ paymentKey: input.paymentKey, orderId: fee.toss_order_no, amount: fee.amount })
  const updated = await deps.markPaid(input.feeId, input.paymentKey, transactionKey)
  if (updated > 0) return { ok: true }

  // 레이스: 승인과 만료취소(스윕)가 겹쳐 pending이 아니게 됨 → 이미 출금된 결제를 즉시 취소
  try {
    await deps.cancelPayment({ paymentKey: input.paymentKey, reason: "매칭 만료로 자동 취소" })
    await deps.markRefunded(input.feeId, "expired_during_confirm")
  } catch (e) {
    await deps.markRefundFailed(input.feeId, `REFUND_FAILED: ${e instanceof Error ? e.message : "unknown"}`)
    throw new Error("매칭이 만료되었으나 자동 취소에 실패했습니다. 고객센터에 문의해 주세요")
  }
  throw new Error("매칭이 만료되어 결제가 자동 취소되었습니다")
}
```

Refund 블록도 교체:

```ts
export interface RefundDeps {
  getFee: (feeId: string) => Promise<{ id: string; status: string; toss_payment_key: string | null } | null>
  cancelPayment: (args: { paymentKey: string; reason: string }) => Promise<void>
  markRefunded: (feeId: string, reason: string) => Promise<void>
}

export async function refundMatchFeeFlow(
  deps: RefundDeps,
  input: { feeId: string; reason: string },
): Promise<{ ok: true }> {
  const fee = await deps.getFee(input.feeId)
  if (!fee) throw new Error("이용료 정보를 찾을 수 없습니다")
  if (fee.status === "refunded") return { ok: true } // 멱등
  if (fee.status !== "paid") throw new Error("결제 완료 상태만 환불할 수 있습니다")
  if (!fee.toss_payment_key) throw new Error("결제 토큰이 없어 환불할 수 없습니다")

  await deps.cancelPayment({ paymentKey: fee.toss_payment_key, reason: input.reason })
  await deps.markRefunded(input.feeId, input.reason)
  return { ok: true }
}
```

`ExpireDeps`/`expireMatchFeeFlow`는 파일에서 **변경 없이 유지**(파트너 결제와 무관).

- [ ] **Step 4: config 정리** — `lib/apps-in-toss/matchFeeConfig.ts` 에서 파트너 경로 상수 3개(`TOSSPAY_MAKE_PAYMENT`/`TOSSPAY_EXECUTE_PAYMENT`/`TOSSPAY_REFUND_PAYMENT`) 삭제. `MATCH_FEE_AMOUNT`·`MATCH_FEE_TTL_MS`·`matchFeeProductDesc()` 유지.

- [ ] **Step 5: 파트너 어댑터 삭제** — `git rm lib/apps-in-toss/tossPay.ts lib/apps-in-toss/tossPay.test.ts` (Task 3에서 라우트 import를 끊은 뒤 tsc가 깨지지 않음. `mtls.ts`는 `app/api/apps-in-toss/login/route.ts`가 계속 쓰므로 **삭제 금지**.)

- [ ] **Step 6: 통과 확인** — Run: `npx vitest run lib/apps-in-toss/matchFeeFlow.test.ts` → Expected: all passed (신규 금액가드 케이스 포함)

- [ ] **Step 7: 커밋** — `git add -A lib/apps-in-toss && git commit -m "refactor(match-fee): 오케스트레이터 결제 dep 토스페이먼츠로 교체(로직 보존) + 파트너 어댑터 제거"`

---

### Task 3: match-fee 라우트 3종 재배선 (create·confirm·refund)

mTLS·파트너 env·`tossPay`/`matchFeeProductDesc` 배선 제거하고 토스페이먼츠 어댑터로 배선. 시크릿키는 `TOSS_PAYMENTS_SECRET_KEY`(테스트키로 개발; 웹 에스크로 가맹점과 동일 값 사용 가능).

**Files:**
- Modify: `app/api/apps-in-toss/match-fee/create/route.ts`
- Modify: `app/api/apps-in-toss/match-fee/confirm/route.ts`
- Modify: `app/api/apps-in-toss/match-fee/refund/route.ts`

- [ ] **Step 1: create 라우트 교체** — `app/api/apps-in-toss/match-fee/create/route.ts` 전체를 아래로

```ts
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServiceClient } from "@/lib/supabase/service"
import { payMatchFeeFlow } from "@/lib/apps-in-toss/matchFeeFlow"

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return NextResponse.json({ error: "server not configured" }, { status: 503 })

  const token = request.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  let body: { feeId?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: "invalid body" }, { status: 400 }) }
  if (!body.feeId) return NextResponse.json({ error: "feeId 필요" }, { status: 400 })

  const service = createServiceClient()
  try {
    const result = await payMatchFeeFlow(
      {
        getFee: async (feeId) => {
          const { data } = await service.from("match_fees")
            .select("id,driver_id,amount,status,expires_at,toss_order_no").eq("id", feeId).single()
          return (data as { id: string; driver_id: string; amount: number; status: string; expires_at: string; toss_order_no: string | null } | null) ?? null
        },
        setOrderNo: async (feeId, orderNo) => {
          await service.from("match_fees").update({ toss_order_no: orderNo }).eq("id", feeId)
        },
        now: () => Date.now(),
      },
      { feeId: body.feeId, userId: user.id },
    )
    return NextResponse.json(result) // { orderNo, amount }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "create failed" }, { status: 400 })
  }
}
```

- [ ] **Step 2: confirm 라우트 교체** — `app/api/apps-in-toss/match-fee/confirm/route.ts` 전체를 아래로 (body: `{ feeId, paymentKey }`, `getFee`에 `amount` 포함)

```ts
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServiceClient } from "@/lib/supabase/service"
import { confirmMatchFeeFlow } from "@/lib/apps-in-toss/matchFeeFlow"
import { confirmTossPayments, cancelTossPayments } from "@/lib/payments/tossPayments"

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const secretKey = process.env.TOSS_PAYMENTS_SECRET_KEY
  if (!url || !anon || !secretKey) return NextResponse.json({ error: "server not configured" }, { status: 503 })

  const token = request.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  let body: { feeId?: string; paymentKey?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: "invalid body" }, { status: 400 }) }
  if (!body.feeId || !body.paymentKey) return NextResponse.json({ error: "feeId/paymentKey 필요" }, { status: 400 })

  const service = createServiceClient()
  try {
    const result = await confirmMatchFeeFlow(
      {
        getFee: async (feeId) => {
          const { data } = await service.from("match_fees")
            .select("id,driver_id,amount,status,toss_order_no,expires_at").eq("id", feeId).single()
          return (data as { id: string; driver_id: string; amount: number; status: string; toss_order_no: string | null; expires_at: string } | null) ?? null
        },
        confirmPayment: async ({ paymentKey, orderId, amount }) => {
          const r = await confirmTossPayments(fetch, { secretKey }, { paymentKey, orderId, amount })
          return { transactionKey: r.transactionKey }
        },
        markPaid: async (feeId, paymentKey, transactionKey) => {
          const { data } = await service.from("match_fees")
            .update({ status: "paid", toss_payment_key: paymentKey, toss_transaction_id: transactionKey, paid_at: new Date().toISOString() })
            .eq("id", feeId).eq("status", "pending").select("id")
          return (data as { id: string }[] | null)?.length ?? 0
        },
        cancelPayment: async ({ paymentKey, reason }) => {
          await cancelTossPayments(fetch, { secretKey }, { paymentKey, reason })
        },
        markRefunded: async (feeId, reason) => {
          await service.from("match_fees")
            .update({ status: "refunded", refunded_at: new Date().toISOString(), refund_reason: reason }).eq("id", feeId)
        },
        markRefundFailed: async (feeId, reason) => {
          await service.from("match_fees").update({ refund_reason: reason }).eq("id", feeId)
        },
        now: () => Date.now(),
      },
      { feeId: body.feeId, userId: user.id, paymentKey: body.paymentKey },
    )
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "confirm failed" }, { status: 400 })
  }
}
```

- [ ] **Step 3: refund 라우트 교체** — `app/api/apps-in-toss/match-fee/refund/route.ts`: 인증부(CRON_SECRET 또는 admin)와 body(`{ feeId, reason }`)는 유지. env를 `TOSS_PAYMENTS_SECRET_KEY`로 바꾸고 dep을 아래로 교체(mTLS·`getDriverTossKey`·`refundTossPayment` 제거).

```ts
// import 교체
import { refundMatchFeeFlow } from "@/lib/apps-in-toss/matchFeeFlow"
import { cancelTossPayments } from "@/lib/payments/tossPayments"

// env 가드 교체
const secretKey = process.env.TOSS_PAYMENTS_SECRET_KEY
if (!url || !anon || !secretKey) return NextResponse.json({ error: "server not configured" }, { status: 503 })

// 오케스트레이터 배선 교체
const result = await refundMatchFeeFlow(
  {
    getFee: async (feeId) => {
      const { data } = await service.from("match_fees").select("id,status,toss_payment_key").eq("id", feeId).single()
      return (data as { id: string; status: string; toss_payment_key: string | null } | null) ?? null
    },
    cancelPayment: async ({ paymentKey, reason }) => {
      await cancelTossPayments(fetch, { secretKey }, { paymentKey, reason })
    },
    markRefunded: async (feeId, reason) => {
      await service.from("match_fees")
        .update({ status: "refunded", refunded_at: new Date().toISOString(), refund_reason: reason })
        .eq("id", feeId).eq("status", "paid")
    },
  },
  { feeId: body.feeId, reason: body.reason },
)
```

- [ ] **Step 4: env 예시 반영** — 루트 `.env.example`(있으면)과 배포 노트에 `TOSS_PAYMENTS_SECRET_KEY=test_sk_...` 추가. `TOSS_PARTNER_API_BASE`/`TOSS_MTLS_CERT`/`TOSS_MTLS_KEY`는 match-fee 라우트에서 더 이상 필요 없음(login 등 다른 용도 없으면 정리 후순위).

- [ ] **Step 5: 전체 검증** — Run: `npx vitest run && npx tsc --noEmit` → Expected: vitest 그린(어댑터 교체 반영 후 총 54개 이상), tsc 0. (`create`/`confirm`/`refund` 라우트가 `tossPay`/`mtls`를 더 이상 import하지 않아 tsc 그린.)

- [ ] **Step 6: 커밋** — `git add app/api/apps-in-toss/match-fee && git commit -m "feat(match-fee): 라우트 3종 토스페이먼츠 재배선 + 서버 금액가드"`

---

### Task 4: 백엔드 결제위젯 웹페이지 + 반환 페이지

RN WebView가 로드할 토스페이먼츠 결제 페이지와, 성공/실패 리다이렉트를 받아 WebView가 인터셉트할 반환 페이지. 웹 SDK·`NEXT_PUBLIC_TOSS_CLIENT_KEY`는 기존 에스크로 페이지(`app/(shipper)/shipper/orders/[id]/pay/page.tsx`)와 동일 패턴.

**Files:**
- Create: `app/pay/match-fee/[feeId]/page.tsx`
- Create: `app/pay/match-fee/return/page.tsx`

- [ ] **Step 1: 결제위젯 페이지** — `app/pay/match-fee/[feeId]/page.tsx`. `orderId`·`amount`는 RN이 create 응답값을 쿼리로 전달(페이지는 미인증 WebView라 match_fees RLS 조회 불가 → 쿼리 신뢰, 실제 금액검증은 서버 confirm의 금액가드가 담당).

```tsx
"use client"
import { useEffect, useRef, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"

declare const TossPayments: any

export default function MatchFeePayPage() {
  const { feeId } = useParams<{ feeId: string }>()
  const sp = useSearchParams()
  const orderId = sp.get("orderId") ?? ""
  const amount = Number(sp.get("amount") ?? "0")
  const [ready, setReady] = useState(false)
  const [err, setErr] = useState("")
  const started = useRef(false)

  useEffect(() => {
    if (document.getElementById("toss-sdk")) { setReady(true); return }
    const s = document.createElement("script")
    s.id = "toss-sdk"; s.src = "https://js.tosspayments.com/v1/payment"
    s.onload = () => setReady(true)
    document.head.appendChild(s)
  }, [])

  async function pay() {
    if (started.current || !orderId || !amount) return
    started.current = true
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://takca.vercel.app"
      const toss = TossPayments(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY)
      await toss.requestPayment("카드", {
        amount,
        orderId,
        orderName: "탁카 매칭 이용료",
        successUrl: `${appUrl}/pay/match-fee/return`,
        failUrl: `${appUrl}/pay/match-fee/return`,
      })
    } catch (e: any) {
      started.current = false
      if (e?.code !== "USER_CANCEL") setErr(e?.message || "결제 오류가 발생했습니다")
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: 24, fontFamily: "-apple-system, sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800 }}>매칭 이용료 결제</h1>
      <p style={{ color: "#6B7280", marginTop: 8 }}>{amount.toLocaleString()}원 · 결제하면 연락처와 채팅이 열립니다.</p>
      {err && <p style={{ color: "#DC2626", marginTop: 8 }}>{err}</p>}
      <button onClick={pay} disabled={!ready || !orderId || !amount}
        style={{ width: "100%", marginTop: 20, background: "#F97316", color: "#fff", border: 0, borderRadius: 12, padding: 16, fontSize: 16, fontWeight: 800 }}>
        {amount.toLocaleString()}원 결제하기
      </button>
    </div>
  )
}
```

- [ ] **Step 2: 반환 페이지** — `app/pay/match-fee/return/page.tsx`. Toss가 `?paymentKey&orderId&amount`(성공) 또는 `?code&message`(실패)를 붙여 리다이렉트. RN WebView가 이 경로를 인터셉트하므로 여기서는 안내만 렌더(confirm 호출은 RN이 담당).

```tsx
export default function MatchFeeReturnPage() {
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: 40, textAlign: "center", fontFamily: "-apple-system, sans-serif" }}>
      <p style={{ fontSize: 16, color: "#111827" }}>결제 처리 중입니다. 앱으로 돌아갑니다…</p>
    </div>
  )
}
```

- [ ] **Step 3: 빌드 스모크** — Run: `npx tsc --noEmit` → Expected: 0. (선택) `npm run build`로 라우트 컴파일 확인.

- [ ] **Step 4: 커밋** — `git add app/pay && git commit -m "feat(pay): 매칭이용료 토스페이먼츠 결제위젯 페이지 + 반환 페이지"`

---

### Task 5: MatchDetail RN 이식 (WebView 결제·연락처 게이팅·채팅 폴링)

미니앱 `apps-in-toss/src/screens/MatchDetail.tsx`(256줄)를 RN으로 이식. 결제 게이팅(`match-contact`), WebView 결제 CTA, 4초 채팅 폴링 포함. 결제 성공은 WebView URL 인터셉트로 감지 후 Bearer 세션으로 confirm 호출.

**Files:**
- Modify: `mobile/package.json`(react-native-webview 추가)
- Create: `mobile/app/match/[orderId].tsx`

- [ ] **Step 1: WebView 설치** — `cd /Users/park/Desktop/탁카/mobile && npx expo install react-native-webview` (Expo SDK 57가 관리하는 호환 버전 설치. 버전 핀 없음.)

- [ ] **Step 2: 매칭상세 화면** — `mobile/app/match/[orderId].tsx`. 이식 원본의 로직(내정보·상대·fee·bid 로드, 폴링, 전화걸기 `Linking.openURL('tel:')`)을 RN으로. 결제 플로우: create 호출 → `{orderNo, amount}` → WebView 모달로 `${API_BASE}/pay/match-fee/${feeId}?orderId=${orderNo}&amount=${amount}` 오픈 → `onNavigationStateChange`에서 `/pay/match-fee/return` 감지·URL에서 `paymentKey` 파싱 → 모달 닫고 confirm 호출.

```tsx
import { useCallback, useEffect, useRef, useState } from "react"
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Linking, Modal } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { WebView } from "react-native-webview"
import { router, useLocalSearchParams } from "expo-router"
import { supabase, API_BASE } from "../../lib/supabase"

const ORANGE = "#F97316"
interface Msg { id: string; sender_id: string; message: string; sent_at: string }
interface Fee { id: string; status: string; amount: number; expires_at: string }

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export default function MatchDetail() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>()
  const [meId, setMeId] = useState<string | null>(null)
  const [route, setRoute] = useState("")
  const [amount, setAmount] = useState<number | null>(null)
  const [statusKo, setStatusKo] = useState("")
  const [other, setOther] = useState<{ name: string; phone: string | null } | null>(null)
  const [matchId, setMatchId] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")
  const [fee, setFee] = useState<Fee | null>(null)
  const [iAmDriver, setIAmDriver] = useState(false)
  const [payMsg, setPayMsg] = useState("")
  const [paying, setPaying] = useState(false)
  const [payUrl, setPayUrl] = useState<string | null>(null)
  const handledReturn = useRef(false)

  const loadChats = useCallback(async (mId: string) => {
    const { data } = await supabase.from("chats").select("id,sender_id,message,sent_at").eq("match_id", mId).order("sent_at", { ascending: true })
    setMsgs((data as Msg[]) ?? [])
  }, [])

  const fetchContact = useCallback(async (mId: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch(`${API_BASE}/api/apps-in-toss/match-contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ matchId: mId }),
    })
    if (!res.ok) return
    const data = await res.json().catch(() => null)
    if (data && typeof data.name === "string") setOther({ name: data.name, phone: data.phone ?? null })
  }, [])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setErr("로그인이 필요해요"); setLoading(false); return }
      setMeId(user.id)
      const { data: order } = await supabase.from("orders").select("origin,destination,status,price").eq("id", orderId).single()
      const { data: match } = await supabase.from("matches").select("id,driver_id,status").eq("order_id", orderId).maybeSingle()
      if (!order || !match) { setErr("매칭 정보를 찾을 수 없어요"); setLoading(false); return }
      setRoute(`${order.origin} → ${order.destination}`)
      setMatchId(match.id)
      setStatusKo(order.status === "matched" ? "매칭됨" : order.status === "in_progress" ? "진행중" : order.status === "completed" ? "완료" : order.status)
      const { data: feeRow } = await supabase.from("match_fees").select("id,status,amount,expires_at").eq("match_id", match.id).maybeSingle()
      setFee((feeRow as Fee | null) ?? null)
      const { data: bid } = await supabase.from("bids").select("price").eq("order_id", orderId).eq("status", "accepted").maybeSingle()
      setAmount(bid?.price ?? order.price ?? null)
      setIAmDriver(user.id === match.driver_id)
      await loadChats(match.id)
      const feeStatus = (feeRow as Fee | null)?.status
      if (!feeRow || feeStatus === "paid") await fetchContact(match.id)
      setLoading(false)
    })()
  }, [orderId, loadChats, fetchContact])

  useEffect(() => {
    if (!matchId) return
    const t = setInterval(() => loadChats(matchId), 4000)
    return () => clearInterval(t)
  }, [matchId, loadChats])

  async function send() {
    const text = input.trim()
    if (!text || !matchId || !meId) return
    setInput("")
    const { error } = await supabase.from("chats").insert({ match_id: matchId, sender_id: meId, message: text })
    if (error) { setErr(`전송 실패: ${error.message}`); return }
    await loadChats(matchId)
  }

  async function startPay() {
    if (!fee) return
    setPaying(true); setPayMsg("결제 준비 중…"); handledReturn.current = false
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setPayMsg("로그인이 필요해요"); setPaying(false); return }
    const res = await fetch(`${API_BASE}/api/apps-in-toss/match-fee/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ feeId: fee.id }),
    })
    if (!res.ok) { const j = await res.json().catch(() => ({})); setPayMsg(`결제 생성 실패: ${j.error ?? res.status}`); setPaying(false); return }
    const { orderNo, amount: amt } = await res.json()
    setPayUrl(`${API_BASE}/pay/match-fee/${fee.id}?orderId=${encodeURIComponent(orderNo)}&amount=${amt}`)
  }

  async function onNav(navState: { url: string }) {
    if (handledReturn.current) return
    if (!navState.url.includes("/pay/match-fee/return")) return
    handledReturn.current = true
    setPayUrl(null)
    const q = new URLSearchParams(navState.url.split("?")[1] ?? "")
    const paymentKey = q.get("paymentKey")
    if (!paymentKey) { setPayMsg(`결제 취소: ${q.get("message") ?? ""}`); setPaying(false); return }
    setPayMsg("결제 승인 중…")
    const { data: { session } } = await supabase.auth.getSession()
    if (!session || !fee) { setPaying(false); return }
    const res = await fetch(`${API_BASE}/api/apps-in-toss/match-fee/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ feeId: fee.id, paymentKey }),
    })
    if (!res.ok) { const j = await res.json().catch(() => ({})); setPayMsg(`결제 승인 실패: ${j.error ?? res.status}`); setPaying(false); return }
    setPayMsg("결제 완료 ✅ 연락처가 열렸어요")
    setFee({ ...fee, status: "paid" })
    if (matchId) await fetchContact(matchId)
    setPaying(false)
  }

  const isPaid = fee?.status === "paid"
  const unlocked = isPaid || fee === null

  if (loading) return <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}><ActivityIndicator color={ORANGE} style={{ marginTop: 40 }} /></SafeAreaView>

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <Pressable onPress={() => router.back()}><Text style={{ color: "#6B7280", fontSize: 15, marginBottom: 12 }}>← 뒤로</Text></Pressable>
        <Text style={{ fontSize: 22, fontWeight: "800", color: "#111827" }}>{route}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 }}>
          {amount != null && <Text style={{ fontSize: 20, fontWeight: "800", color: ORANGE }}>{amount.toLocaleString()}원</Text>}
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#12B589", backgroundColor: "#E7F8F1", paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8 }}>{statusKo}</Text>
        </View>
        {!!err && <Text style={{ color: "#DC2626", fontSize: 14, marginTop: 10 }}>{err}</Text>}

        {fee && !isPaid && (
          <View style={{ backgroundColor: "#FFF7ED", borderWidth: 1.5, borderColor: "#FED7AA", borderRadius: 16, padding: 18, marginTop: 18 }}>
            {iAmDriver ? (
              <>
                <Text style={{ fontSize: 15, fontWeight: "800", color: "#9A3412" }}>매칭 성사! 이용료를 결제하면 화주 연락처와 채팅이 열려요</Text>
                <Text style={{ color: "#6B7280", fontSize: 14, marginVertical: 8 }}>매칭 이용료 {(fee.amount).toLocaleString()}원 · 미결제 시 24시간 후 매칭이 자동 취소돼요</Text>
                <Pressable onPress={startPay} disabled={paying} style={{ backgroundColor: ORANGE, borderRadius: 12, padding: 16, opacity: paying ? 0.6 : 1 }}>
                  <Text style={{ color: "#fff", fontSize: 16, fontWeight: "800", textAlign: "center" }}>{fee.amount.toLocaleString()}원 결제하고 연락처 받기</Text>
                </Pressable>
                <Text style={{ color: "#9CA3AF", fontSize: 13, marginTop: 8, textAlign: "center" }}>{payMsg}</Text>
              </>
            ) : <Text style={{ fontSize: 15, fontWeight: "700", color: "#9A3412" }}>기사님이 매칭을 확정하면 연락처가 열려요</Text>}
          </View>
        )}

        {other && (
          <View style={{ backgroundColor: "#fff", borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 16, padding: 16, marginTop: 18 }}>
            <Text style={{ fontSize: 13, color: "#9CA3AF", fontWeight: "700", marginBottom: 6 }}>상대방</Text>
            <Text style={{ fontSize: 17, fontWeight: "800", color: "#111827" }}>{other.name}</Text>
            {other.phone ? (
              <Pressable onPress={() => Linking.openURL(`tel:${other.phone}`)} style={{ marginTop: 10, alignSelf: "flex-start", backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 18 }}>
                <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800" }}>📞 {other.phone}</Text>
              </Pressable>
            ) : <Text style={{ color: "#9CA3AF", fontSize: 14, marginTop: 8 }}>상대가 아직 연락처를 등록하지 않았어요. 채팅으로 연락해 보세요.</Text>}
          </View>
        )}

        {unlocked && (
          <>
            <Text style={{ fontSize: 17, fontWeight: "800", color: "#111827", marginTop: 22, marginBottom: 10 }}>채팅</Text>
            <View style={{ backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#F0F1F3", borderRadius: 16, padding: 14, minHeight: 200 }}>
              {msgs.length === 0 && <Text style={{ color: "#9CA3AF", textAlign: "center", marginTop: 60 }}>첫 메시지를 보내보세요</Text>}
              {msgs.map((m) => {
                const mine = m.sender_id === meId
                return (
                  <View key={m.id} style={{ alignItems: mine ? "flex-end" : "flex-start", marginBottom: 8 }}>
                    <View style={{ maxWidth: "75%", backgroundColor: mine ? ORANGE : "#fff", borderWidth: mine ? 0 : 1, borderColor: "#E5E7EB", borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 }}>
                      <Text style={{ color: mine ? "#fff" : "#111827", fontSize: 15 }}>{m.message}</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: "#9CA3AF", marginTop: 3 }}>{fmtTime(m.sent_at)}</Text>
                  </View>
                )
              })}
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <TextInput value={input} onChangeText={setInput} placeholder="메시지 입력" style={{ flex: 1, borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12, padding: 14, fontSize: 15 }} />
              <Pressable onPress={send} style={{ backgroundColor: ORANGE, borderRadius: 12, justifyContent: "center", paddingHorizontal: 22 }}><Text style={{ color: "#fff", fontSize: 16, fontWeight: "800" }}>전송</Text></Pressable>
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={!!payUrl} animationType="slide" onRequestClose={() => { setPayUrl(null); setPaying(false) }}>
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          <Pressable onPress={() => { setPayUrl(null); setPaying(false); setPayMsg("결제를 취소했어요") }} style={{ padding: 16 }}><Text style={{ color: "#6B7280", fontSize: 15 }}>✕ 닫기</Text></Pressable>
          {payUrl && <WebView source={{ uri: payUrl }} onNavigationStateChange={onNav} />}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}
```

- [ ] **Step 3: 타입체크** — Run: `cd mobile && npx tsc --noEmit` → Expected: 0

- [ ] **Step 4: 커밋** — `git add mobile && git commit -m "feat(mobile): 매칭상세 화면 이식 — WebView 이용료 결제·연락처 게이팅·채팅 폴링"`

---

### Task 6: OrderDetail·DriverMy 매칭상세 진입 연결 + 전체 검증

SP2에서 의도적으로 빠진 매칭상세 진입 링크 연결. 화주는 OrderDetail(수락 후), 기사는 DriverMy(수락된 입찰)에서 진입.

**Files:**
- Modify: `mobile/app/order/[id].tsx`
- Modify: `mobile/app/driver-my.tsx`

- [ ] **Step 1: OrderDetail 링크** — `mobile/app/order/[id].tsx` 의 헤더(order 렌더 블록, 66-70행 부근)에 매칭됨일 때 진입 버튼 추가. `order.status === "matched"`(또는 accepted bid 존재) 시:

```tsx
{order.status === "matched" && (
  <Pressable onPress={() => router.push(`/match/${id}`)}
    style={{ backgroundColor: ORANGE, borderRadius: 12, padding: 14, marginTop: 12 }}>
    <Text style={{ color: "#fff", fontWeight: "800", textAlign: "center", fontSize: 15 }}>매칭 상세 · 채팅 열기</Text>
  </Pressable>
)}
```

- [ ] **Step 2: DriverMy 링크** — `mobile/app/driver-my.tsx` 의 입찰 행 렌더에서 `status === "accepted"` 행을 `Pressable`로 감싸 `router.push(\`/match/${r.order_id}\`)`. (수락된 매칭만 이동 가능, pending/rejected는 비활성.)

- [ ] **Step 3: 타입체크** — Run: `cd mobile && npx tsc --noEmit` → Expected: 0

- [ ] **Step 4: 루트 회귀** — Run: `cd /Users/park/Desktop/탁카 && npx vitest run && npx tsc --noEmit` → Expected: vitest 그린(54개 이상), tsc 0

- [ ] **Step 5: 번들 스모크** — Run: `cd mobile && npx expo export --platform web` → Expected: 성공(react-native-webview 포함 번들 무결성)

- [ ] **Step 6: 커밋** — `git add mobile && git commit -m "feat(mobile): OrderDetail·DriverMy → 매칭상세 진입 연결"`

---

### 완료 기준 (SP3 Definition of Done)

1. `npx vitest run` 그린 — 토스페이먼츠 어댑터(`tossPayments.test.ts`)로 교체 반영 후 총 테스트 **54개 이상** 유지(파트너 `tossPay.test.ts` 제거분을 신규 어댑터 테스트가 대체, `matchFeeFlow.test.ts`는 신규 금액가드 케이스 포함해 갱신).
2. `npx tsc --noEmit` 루트·mobile 모두 0 에러. match-fee 라우트가 `tossPay`/`mtls`를 더 이상 import하지 않음(파트너 결제 배선 완전 제거, `mtls.ts`는 login 용도로 잔존).
3. `cd mobile && npx expo export --platform web` 성공.
4. 결제 플로우 실사(오케스트레이터/사용자, 토스페이먼츠 **테스트키**): 기사 로그인 → 수락된 매칭 진입 → "결제하고 연락처 받기" → WebView 결제위젯 테스트결제 성공 → 반환 인터셉트 → confirm → `match_fees.status='paid'`·`toss_payment_key`·`toss_transaction_id` 기록 확인 → 연락처·채팅 노출.
5. 게이팅 검증: 미결제 상태에서 `match-contact` 403("이용료 결제 후 확인할 수 있습니다"), 결제 후 200.
6. DB 마이그레이션 신규 없음(컬럼 재해석). `TOSS_PAYMENTS_SECRET_KEY`(서버) 설정 문서화. 라이브 전환은 가맹점 심사 후 라이브 시크릿/클라이언트 키 교체만으로 완료(코드 변경 없음).
