# 탁카 스토어 앱 SP2(매칭 코어) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox 문법.

**Goal:** 미니앱(`apps-in-toss/src/screens/`)의 매칭 플로우 4화면을 Expo RN으로 이식 — 주문등록, 내주문(화주)/피드(기사), 주문상세+입찰수락, 기사 활동내역.

**Architecture:** 데이터 로직은 미니앱 화면과 1:1 동일(Supabase 직결 + 입찰수락만 백엔드 Bearer 호출). UI만 RN 프리미티브로 변환. 스타일 팔레트는 SP1 화면(#F97316 CTA, #E5E7EB 보더, 흰 배경)과 동일.

**Tech Stack:** 기존 mobile/ (Expo SDK 57, expo-router), supabase-js.

**포팅 규칙(모든 태스크 공통):**
- 원본 파일의 Supabase 쿼리·필드·에러처리(23505 등)를 **그대로** 유지. 필드 추가/생략 금지
- `div→View`, 텍스트는 반드시 `<Text>`, `input/textarea→TextInput`, `button→Pressable`, `alert()→상태 기반 인라인 메시지`, 목록은 `FlatList`
- 화면 상단 SafeAreaView(react-native-safe-area-context) 사용
- 백엔드 호출 시 토큰: `const { data: { session } } = await supabase.auth.getSession()` → `Authorization: Bearer ${session.access_token}`
- 각 태스크 끝: `cd mobile && npx tsc --noEmit` 0 에러 확인 후 커밋(메시지 끝 Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>)

---

### Task 1: 화주 주문등록

**Files:**
- Create: `mobile/app/order/new.tsx`
- Modify: `mobile/app/(tabs)/home.tsx` (화주 CTA → `router.push("/order/new")`)
- 원본: `apps-in-toss/src/screens/OrderNew.tsx` (85줄 — 먼저 전체 읽기)

- [ ] Step 1: 원본 읽고 orders insert 필드 계약 확인 (`supabase.from("orders").insert({...})` 36행 — shipper_id는 `auth.uid()` RLS 정합 위해 세션 user.id)
- [ ] Step 2: RN 화면 작성 — 원본과 동일 입력 필드·검증·insert. 성공 시 `router.replace("/(tabs)/orders")`
- [ ] Step 3: 홈 화주 CTA 연결
- [ ] Step 4: tsc 확인 → 커밋 `feat(mobile): 화주 주문등록 화면`

### Task 2: orders 탭 = 역할 분기(내주문/피드)

**Files:**
- Modify: `mobile/app/(tabs)/orders.tsx` (placeholder 교체 — role==="driver"?<Feed/>:<MyOrders/>)
- Create: `mobile/components/MyOrders.tsx`, `mobile/components/Feed.tsx`
- 원본: `apps-in-toss/src/screens/MyOrders.tsx`(70줄), `apps-in-toss/src/screens/Feed.tsx`(113줄)

- [ ] Step 1: MyOrders 이식 — orders select(id,origin,destination,price,status) 내 주문, 상태 뱃지, 행 탭 → `router.push(\`/order/${id}\`)`. useFocusEffect(expo-router)로 포커스 시 재조회
- [ ] Step 2: Feed 이식 — pending orders select(원본 34-35행 필드 그대로), 인라인 입찰(bids insert, price>=1000 검증, 23505 중복 친화 메시지 — 원본 54행 로직 그대로)
- [ ] Step 3: orders.tsx 역할 분기 배선, 홈 기사 CTA → orders 탭
- [ ] Step 4: tsc 확인 → 커밋 `feat(mobile): 내주문·기사피드 — orders 탭 역할 분기`

### Task 3: 주문상세 + 입찰수락(화주)

**Files:**
- Create: `mobile/app/order/[id].tsx`
- 원본: `apps-in-toss/src/screens/OrderDetail.tsx` (85줄)

- [ ] Step 1: 이식 — 주문 single 조회 + bids 목록(price asc), 입찰별 "수락" 버튼
- [ ] Step 2: 수락 = `POST ${API_BASE}/api/apps-in-toss/bids/approve` Bearer 세션토큰, body는 원본과 동일({ bidId }? 원본 31행 확인해 그대로). 성공 시 재조회, 에러 메시지 인라인 표시
- [ ] Step 3: tsc 확인 → 커밋 `feat(mobile): 주문상세 + 입찰수락`

### Task 4: 기사 활동내역(DriverMy)

**Files:**
- Create: `mobile/app/driver-my.tsx`
- Modify: `mobile/app/(tabs)/home.tsx` (기사 홈에 "내 활동" 보조 버튼)
- 원본: `apps-in-toss/src/screens/DriverMy.tsx` (79줄)

- [ ] Step 1: 이식 — 내 입찰·매칭·예상수익 조회 원본 그대로
- [ ] Step 2: 기사 홈 진입 버튼
- [ ] Step 3: tsc 확인 → 커밋 `feat(mobile): 기사 활동내역 화면`

---

### 완료 기준
1. mobile tsc 0, 루트 vitest 54 passed(회귀 없음 — 백엔드 무변경이므로)
2. 웹 모드(포트 8090 dev 서버) 실사: 화주 로그인→주문등록→내주문 목록 표시, 주문상세 진입(오케스트레이터가 수행)
3. 매칭상세(MatchDetail)·연락처·채팅·결제는 SP3 범위 — 이 계획에서 손대지 않음
