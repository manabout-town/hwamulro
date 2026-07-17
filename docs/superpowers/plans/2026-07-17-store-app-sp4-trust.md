# 탁카 스토어 앱 SP4(신뢰) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (권장) 또는 superpowers:executing-plans 로 task 단위 구현. 체크박스 문법 사용.

**Goal:** 웹 신뢰 기능 3종을 Expo RN으로 이식 — KYC 서류 업로드(expo-image-picker + 기존 `/api/kyc/verify` 재사용), 프로필 조회·수정(더보기 진입), 리뷰 작성(완료 매칭에서 진입).

**Architecture:** 프로필·리뷰는 Supabase 직결(RLS로 본인 쓰기 허용 — 아래 계약 참조). KYC만 기존 Next.js 라우트를 Bearer 로 호출(서버가 Storage 업로드 + Claude Vision 수행). 신규 백엔드 라우트 0개 — 기존 `/api/kyc/verify` 에 Bearer 인증 폴백만 추가. 스타일 팔레트는 SP1~SP3 화면과 동일(#F97316 CTA, #E5E7EB 보더, 흰 배경, SafeAreaView).

**Tech Stack:** 기존 mobile/ (Expo SDK 57, expo-router), supabase-js. 신규 의존성: `expo-image-picker`.

**포팅 규칙(모든 태스크 공통):**
- 원본의 Supabase 필드·검증·에러처리를 **그대로** 유지. 필드 추가/생략 금지.
- `div→View`, 텍스트는 반드시 `<Text>`, `input/textarea→TextInput`, `button→Pressable`, `alert()→상태 기반 인라인 메시지`.
- 화면 상단 SafeAreaView(react-native-safe-area-context, `edges={["top"]}`).
- 백엔드 호출 토큰: `const { data: { session } } = await supabase.auth.getSession()` → `Authorization: Bearer ${session.access_token}` (SP3 `match/[orderId].tsx` 패턴과 동일).
- 각 태스크 끝 gate: `cd mobile && npx tsc --noEmit` 0 에러 → (백엔드 수정 태스크는 추가로 루트 `npm test` 그린 확인) → 커밋(메시지 끝 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`).

**웹에서 확정한 데이터 계약(정확히 준수):**
- `users`: `id, role('shipper'|'driver'), name, nickname, phone, verification_status('unverified'|'pending'|'verified'|'rejected')`. RLS: SELECT `USING(true)`, UPDATE `id = auth.uid()`.
- `driver_profiles`: `user_id, vehicle_number, vehicle_type, home_region, route_regions(text[]), rating_avg, rating_count`. RLS: SELECT `USING(true)`, UPDATE `user_id = auth.uid()`.
- `shipper_profiles`: `user_id, company_name, business_number`. RLS: SELECT `USING(true)`, UPDATE `user_id = auth.uid()`.
- `reviews`: `match_id, reviewer_id, reviewee_id, rating(1~5), comment(nullable)`. RLS: SELECT `USING(true)`, INSERT `reviewer_id = auth.uid()`.
- KYC Storage: 버킷 `kyc-documents`(private), 경로 `kyc/{userId}/{docType}_{ts}.{ext}` — **서버(`/api/kyc/verify`)가 service-role 로 업로드**. 모바일은 Storage 직접 접근/서명 URL 불필요.
- `/api/kyc/verify` 폼 필드: `business_registration`(File), `driver_license`(File, 기사만). 서버 허용 타입 `image/jpeg|png|webp`, 최대 10MB. 응답: `{ status: 'approved'|'rejected'|'manual_review'|'error', reason, confidence }`. 화주가 사업자등록증 미첨부 시 자동 승인.

---

### Task 1: KYC 백엔드 Bearer 지원 + 모바일 인증 화면

**Files:**
- Modify: `app/api/kyc/verify/route.ts` (쿠키 인증 → Bearer 폴백 추가)
- Create: `mobile/app/verification.tsx`
- Modify: `mobile/package.json` (`npx expo install expo-image-picker`)
- 원본: `app/verification/page.tsx`(572줄 — 3-step UI), `app/api/kyc/verify/route.ts`(먼저 읽기)

- [ ] Step 1: 라우트 Bearer 폴백 — `app/api/kyc/verify/route.ts` POST 초입 인증부를 수정. 쿠키 `createClient().auth.getUser()` 로 유저가 없으면 `Authorization` 헤더의 Bearer 토큰으로 anon 클라이언트(`@supabase/supabase-js`, `global.headers.Authorization`) 생성해 `getUser()`로 폴백(SP3 `app/api/apps-in-toss/match-contact/route.ts` 패턴 동일). 이후 로직(service-role 업로드·Vision·kyc_submissions insert·users.verification_status 갱신)은 **무변경**. `ANTHROPIC_API_KEY` 미설정 시 기존 동작(Vision 실패 → confidence 0.5 → manual_review) 유지.
- [ ] Step 2: `expo-image-picker` 설치. `verification.tsx` 3단계 이식 — (1) 안내(역할별 필요 서류: 기사=사업자등록증+운전면허증 필수, 화주=사업자등록증 선택), (2) 업로드: `ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 })` 로 서류별 asset 선택·미리보기·제거, (3) 결과. 역할은 `useAuth()` 의 role 사용. 진입 시 `users.verification_status` 조회해 이미 `verified` 면 안내 메시지.
- [ ] Step 3: 제출 — `FormData` 에 `{ uri, name, type }` 형태로 `business_registration`(+ 기사면 `driver_license`) append 후 `fetch(`${API_BASE}/api/kyc/verify`, { method:'POST', headers:{ Authorization: `Bearer ${token}` }, body: formData })`(Content-Type 미지정 — RN이 boundary 설정). 응답 `status` 별 인라인 결과(승인/수동검토/반려+reason/오류) + 반려·오류 시 재시도. 성공 시 `router.back()` 또는 안내.
- [ ] Step 4: gate — `cd mobile && npx tsc --noEmit` 0, 루트 `npm test` 그린(KYC 라우트 회귀 없음) → 커밋 `feat(mobile): KYC 서류 업로드 화면 + 라우트 Bearer 지원`

### Task 2: 프로필 조회·수정 (더보기 진입 + KYC 진입)

**Files:**
- Create: `mobile/app/profile.tsx`
- Modify: `mobile/app/(tabs)/more.tsx` (프로필 진입 버튼 추가 — SP5에서 더보기 전면 재구성 시 이 링크 유지)
- 원본: `app/actions/profile.ts`(updateBasicInfo / updateVehicle / updateShipperProfile 검증 규칙 그대로)

- [ ] Step 1: 진입 시 로드 — `users`(name, phone, verification_status) 조회, 기사면 `driver_profiles`(vehicle_number, vehicle_type, home_region, route_regions) 조회, 화주면 `shipper_profiles`(company_name, business_number) 조회. `verification_status` 뱃지 표시 + 미인증 시 "본인 인증하기" → `router.push('/verification')`.
- [ ] Step 2: 기본정보 수정 — name(필수·20자↓), phone(선택, `/^01[0-9]\d{7,8}$/`, 하이픈 제거) 검증 후 `supabase.from('users').update({ name, phone: phone||null }).eq('id', user.id)`(원본 updateBasicInfo 규칙 그대로). nickname 은 스코프 외(생략 가능).
- [ ] Step 3: 역할별 수정 — 기사: vehicle_number(필수)·vehicle_type(필수)·home_region·route_regions(콤마 분리 배열) → `driver_profiles.update(...).eq('user_id', user.id)`. 화주: company_name·business_number → `shipper_profiles.update(...).eq('user_id', user.id)`. 성공/실패 인라인 메시지. 더보기 탭에 "프로필" 진입 버튼 배선.
- [ ] Step 4: gate — `cd mobile && npx tsc --noEmit` 0 → 커밋 `feat(mobile): 프로필 조회·수정 화면`

### Task 3: 리뷰 작성 (완료 매칭에서 진입)

**Files:**
- Create: `mobile/app/review/[matchId].tsx`
- Modify: `mobile/app/match/[orderId].tsx` (order.status === 'completed' 시 "리뷰 작성" CTA 추가 → `router.push(`/review/${matchId}`)`)
- 원본: `app/review/[matchId]/page.tsx`(130줄 — 별점 1~5 + 코멘트)

- [ ] Step 1: 리뷰 화면 이식 — 별점(1~5 Pressable ★)·코멘트 TextInput. 제출 시 원본 `submitReview` 로직 그대로: `matches` 에서 `driver_id, orders(shipper_id)` single 조회 → `isDriver = match.driver_id === user.id` → `revieweeId` 결정 → `supabase.from('reviews').insert({ match_id, reviewer_id: user.id, reviewee_id, rating, comment: comment.trim()||null })`.
- [ ] Step 2: 평점 집계 — 원본대로 `!isDriver`(화주가 기사 리뷰) 일 때 `reviews` 재조회 후 avg 계산해 `driver_profiles.update({ rating_avg, rating_count }).eq('user_id', match.driver_id)`. **주의(웹과 동일 RLS 거동):** driver_profiles UPDATE 는 `user_id = auth.uid()` 제약 → 화주가 실행하면 0행 갱신(무해 no-op). 웹 원본도 동일하게 시도하므로 **그대로 이식**(집계 정정은 별도 트랙). 제출 성공 시 완료 표시 후 `router.back()`.
- [ ] Step 3: 매칭상세 CTA — `match/[orderId].tsx` 에서 `order.status === 'completed'` 이면 리뷰 작성 버튼 노출(이미 로드된 `matchId` 사용). 중복 작성 방지는 스코프 외(선택: `reviews` 에서 내 리뷰 존재 조회해 버튼 숨김).
- [ ] Step 4: gate — `cd mobile && npx tsc --noEmit` 0 → 커밋 `feat(mobile): 리뷰 작성 화면 + 완료 매칭 진입`

---

### 완료 기준
1. mobile tsc 0, 루트 vitest 그린(백엔드 KYC 라우트 회귀 없음 — Bearer 폴백만 추가).
2. 실사(오케스트레이터): 기사 로그인 → 프로필 → 본인 인증 화면에서 이미지 선택·제출 → 결과 표시; 완료된 매칭에서 리뷰 작성 → reviews insert 확인.
3. 커뮤니티·더보기 전면 재구성은 SP5 범위 — 이 계획은 more.tsx 에 프로필 진입 링크만 추가.

### 주의 / 리스크
- KYC 라우트는 쿠키 인증이라 Bearer 폴백 추가가 **필수**(미추가 시 모바일 401). service-role 업로드·Vision 경로는 절대 손대지 말 것.
- 모바일 KYC 는 이미지(jpeg/png/webp)만 — 웹의 PDF 옵션은 expo-image-picker 범위상 제외(서버 허용 타입과 일치).
- `EXPO_PUBLIC_API_BASE` (기본 `https://takca.vercel.app`) 가 KYC·연락처와 동일 백엔드를 가리킴 — dev 시 로컬 백엔드로 바꾸려면 env 조정.
