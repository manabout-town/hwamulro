# 시작 전 취소·환불 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 화주가 결제(escrow held) 후 물리적 운송 시작 전 의뢰를 취소하면 전액 환불(escrow refunded)하고, 기존 기사 취소(cancelMatch)의 escrow 고아 버그를 수정한다.

**Architecture:** `app/actions/matches.ts`에 공통 헬퍼 `refundEscrowIfHeld`를 두고, 신규 화주 취소 액션 `cancelMatchByShipper`와 기존 `cancelMatch` 버그픽스가 공유. 화주 UI는 주문 상세 페이지에 신규 client 컴포넌트 버튼+모달 추가. 환불은 DB 상태 전이(escrow→refunded)만 — Toss 취소 API 미도입.

**Tech Stack:** Next.js App Router server actions, Supabase(service role), TypeScript. 테스트 러너 없음 → `npx tsc --noEmit` + 시나리오 코드리뷰로 검증.

---

### Task 1: 공통 헬퍼 `refundEscrowIfHeld` + 버그픽스 B (cancelMatch escrow 환불)

**Files:**
- Modify: `app/actions/matches.ts` (헬퍼 추가 + cancelMatch line 99 직전 삽입 + 기사 알림 body)

- [ ] **Step 1: 헬퍼 추가**

`app/actions/matches.ts` 상단 import 아래, `export async function cancelMatch` 위에 삽입:

```ts
async function refundEscrowIfHeld(
  service: ReturnType<typeof createServiceClient>,
  orderId: string
): Promise<{ refunded: boolean }> {
  const { data: escrow } = await service
    .from("escrow")
    .select("id, status")
    .eq("order_id", orderId)
    .maybeSingle()
  if (escrow?.status === "held") {
    await service.from("escrow").update({ status: "refunded" }).eq("id", escrow.id)
    return { refunded: true }
  }
  return { refunded: false }
}
```

- [ ] **Step 2: cancelMatch에 escrow 환불 삽입**

`app/actions/matches.ts`에서 `await service.from("matches").update({` (현 line 99) **직전**에 삽입:

```ts
  // BUG(escrow 고아): 결제완료(held) 건 취소 시 화주에게 환불 — 미처리 시 돈 고아+재결제 위험
  const { refunded: escrowRefunded } = await refundEscrowIfHeld(service, match.order_id)
```

- [ ] **Step 3: 기사→화주 알림에 환불 안내 append**

`app/actions/matches.ts` notifications insert의 shipper 알림 `body` (penalty 분기)에서, 환불 안내를 덧붙인다. 기존:

```ts
      body: penaltyAmount > 0
        ? `기사가 ${routeLabel} 운송을 취소했습니다. 위약금 ${penaltyAmount.toLocaleString()}원이 지급됩니다.`
        : `기사가 ${routeLabel} 운송을 취소했습니다. 의뢰가 재공개됩니다.`,
```

로 교체:

```ts
      body: (penaltyAmount > 0
        ? `기사가 ${routeLabel} 운송을 취소했습니다. 위약금 ${penaltyAmount.toLocaleString()}원이 지급됩니다.`
        : `기사가 ${routeLabel} 운송을 취소했습니다. 의뢰가 재공개됩니다.`)
        + (escrowRefunded ? " 결제금은 영업일 5~10일 내 환불됩니다." : ""),
```

- [ ] **Step 4: 반환에 refunded 추가**

`return { success: true, penaltyAmount, penaltyLabel }` 를 다음으로 교체:

```ts
  return { success: true, penaltyAmount, penaltyLabel, refunded: escrowRefunded }
```

- [ ] **Step 5: 타입체크**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 6: Commit**

```bash
git add app/actions/matches.ts
git commit -m "fix: cancelMatch escrow 고아 버그 — 결제완료 건 취소 시 환불(refundEscrowIfHeld)"
```

---

### Task 2: 화주 취소 액션 `cancelMatchByShipper`

**Files:**
- Modify: `app/actions/matches.ts` (cancelMatch 아래 신규 export)

- [ ] **Step 1: 액션 구현**

`app/actions/matches.ts` 끝(cancelMatch 함수 뒤)에 추가:

```ts
export async function cancelMatchByShipper(matchId: string, reason: string = "") {
  const supabase = await createClient()
  const service = createServiceClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "로그인이 필요합니다" }

  const { data: match } = await supabase
    .from("matches")
    .select("id, order_id, driver_id, status, orders!inner(shipper_id, origin, destination, status)")
    .eq("id", matchId)
    .single()

  if (!match) return { error: "매칭을 찾을 수 없습니다" }
  const order = match.orders as any
  if (order?.shipper_id !== user.id) return { error: "권한이 없습니다" }
  if (!["accepted", "in_progress"].includes(match.status)) {
    return { error: "취소할 수 없는 상태입니다" }
  }
  // 분쟁 진행 중이면 취소 불가(스펙 경계표) — escrow 동결 상태 보호
  if (order?.status === "disputed") {
    return { error: "분쟁이 진행 중인 의뢰는 취소할 수 없습니다." }
  }

  // 물리적 운송 시작(pickup 리포트) 후에는 취소 불가 — 분쟁 경로 안내
  const { data: pickupReport } = await service
    .from("condition_reports")
    .select("id")
    .eq("match_id", matchId)
    .eq("type", "pickup")
    .maybeSingle()
  if (pickupReport) {
    return { error: "이미 운송이 시작되어 취소할 수 없습니다. 분쟁을 이용해주세요." }
  }

  const routeLabel = `${order?.origin} → ${order?.destination}`
  const { refunded } = await refundEscrowIfHeld(service, match.order_id)

  await service.from("matches").update({
    status: "cancelled",
    cancelled_at: new Date().toISOString(),
    cancelled_by_user: user.id,
    cancel_reason: reason || null,
  }).eq("id", matchId)

  await service.from("orders").update({ status: "cancelled" }).eq("id", match.order_id)

  await service.from("notifications").insert([
    {
      user_id: user.id,
      title: "취소 완료",
      body: refunded
        ? `${routeLabel} 의뢰를 취소했습니다. 결제금은 영업일 5~10일 내 환불됩니다.`
        : `${routeLabel} 의뢰를 취소했습니다.`,
      type: "match_cancelled",
      reference_id: matchId,
    },
    {
      user_id: match.driver_id,
      title: "화주 취소 알림",
      body: `화주가 ${routeLabel} 운송을 취소했습니다.`,
      type: "match_cancelled",
      reference_id: matchId,
    },
  ])

  // POL-081: 위치 이력 파기
  await service.from("driver_locations").delete().eq("match_id", matchId)

  revalidatePath("/shipper/dashboard")
  revalidatePath(`/shipper/orders/${match.order_id}`)
  revalidatePath("/driver/matches")
  revalidatePath("/driver/dashboard")

  return { success: true, refunded }
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 3: Commit**

```bash
git add app/actions/matches.ts
git commit -m "feat: 화주 시작 전 취소 액션 cancelMatchByShipper (전액환불+종결)"
```

---

### Task 3: `ShipperCancelButton` 클라이언트 컴포넌트

**Files:**
- Create: `components/shipper/ShipperCancelButton.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { cancelMatchByShipper } from "@/app/actions/matches"

export function ShipperCancelButton({ matchId }: { matchId: string }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleCancel() {
    setBusy(true)
    setError(null)
    const res = await cancelMatchByShipper(matchId)
    setBusy(false)
    if (res?.error) {
      setError(res.error)
      return
    }
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full border border-red-200 text-red-600 py-3 rounded-xl text-sm font-semibold hover:bg-red-50 transition-colors min-h-[48px]"
      >
        의뢰 취소
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !busy && setOpen(false)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 text-lg">의뢰를 취소하시겠어요?</h3>
            <p className="text-sm text-gray-500 mt-2">
              운송 시작 전 취소는 전액 환불됩니다. 결제하신 경우 원결제 수단으로 영업일 5~10일 내 환불되며, 되돌릴 수 없습니다.
            </p>
            {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="flex-1 border border-gray-200 text-gray-600 py-3 rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                닫기
              </button>
              <button
                onClick={handleCancel}
                disabled={busy}
                className="flex-1 bg-red-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? "처리 중..." : "취소하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: exit 0 (컴포넌트가 아직 미사용이면 unused 경고 없음 — 컴포넌트는 export라 무해)

- [ ] **Step 3: Commit**

```bash
git add components/shipper/ShipperCancelButton.tsx
git commit -m "feat: ShipperCancelButton 취소 버튼+확인 모달"
```

---

### Task 4: 화주 주문 상세 페이지 연결

**Files:**
- Modify: `app/(shipper)/shipper/orders/[id]/page.tsx`

- [ ] **Step 1: import + matches select에 condition_reports 추가**

상단 import에 추가:

```ts
import { ShipperCancelButton } from "@/components/shipper/ShipperCancelButton"
```

order 조회의 matches select(현 line 16-19)에서 `matches(*, drivers:...)` 를 `matches(*, condition_reports(type), drivers:...)` 로 변경. 즉:

```ts
    supabase.from("orders").select(`
      *,
      matches(*, condition_reports(type), drivers:users!driver_id(*, driver_profiles(vehicle_type, vehicle_number, home_region, route_regions, rating_avg, rating_count)))
    `).eq("id", params.id).eq("shipper_id", user!.id).single(),
```

- [ ] **Step 2: canShipperCancel 계산**

`const activeMatch = order.matches?.find(...)` 아래에 추가:

```ts
  const hasPickupReport = (activeMatch?.condition_reports as any[] | undefined)?.some(r => r.type === "pickup") ?? false
  const canShipperCancel = !!activeMatch && ["accepted", "in_progress"].includes(activeMatch.status) && !hasPickupReport
```

- [ ] **Step 3: 버튼 렌더**

기존 취소 블록(현 line 205-210, `{order.status === "pending" && ...cancelOrder...}`) 바로 뒤에 추가:

```tsx
      {/* 시작 전 취소 (매칭·결제 후) */}
      {canShipperCancel && activeMatch && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 md:p-6">
          <ShipperCancelButton matchId={activeMatch.id} />
        </div>
      )}
```

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: exit 0

- [ ] **Step 5: Commit**

```bash
git add "app/(shipper)/shipper/orders/[id]/page.tsx"
git commit -m "feat: 화주 주문상세에 시작 전 취소 버튼 연결(pickup 리포트 부재 시 노출)"
```

---

### Task 5: 최종 검증 + 빌드 + 배포

**Files:** 없음(검증/배포)

- [ ] **Step 1: 시나리오 코드리뷰**

스펙 "검증" 섹션 7개 시나리오를 코드 경로로 재확인:
- A matched(미결제) → cancelled, refunded=false ✅ (refundEscrowIfHeld: escrow 없음→false)
- A in_progress(held) → cancelled + refunded=true ✅
- A pickup 리포트 있음 → 차단 ✅ (Task 2 Step 1 pickup 체크)
- A 제3자(기사) 호출 → "권한이 없습니다" ✅ (shipper_id 검증)
- A 이미 cancelled 재호출 → "취소할 수 없는 상태입니다" ✅ (status 화이트리스트)
- B 기사 cancelMatch(held) → refunded + 위약금·pending 유지 ✅
- B 기사 cancelMatch(accepted 미결제) → refunded=false, 불변 ✅

- [ ] **Step 2: 프로덕션 빌드**

Run: `npx tsc --noEmit && (pnpm build || npm run build)`
Expected: 빌드 성공, 라우트 테이블 출력, 에러 없음

- [ ] **Step 3: 배포 + 푸시**

```bash
vercel --prod --yes
git push origin master
```
Expected: 배포 Ready, push 성공

- [ ] **Step 4: prod 헬스**

Run: `curl -s -o /dev/null -w "%{http_code}\n" https://takca.vercel.app/`
Expected: 200
