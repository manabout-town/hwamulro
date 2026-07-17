# 탁카 스토어 앱 SP5(커뮤니티·부가) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (권장) 또는 superpowers:executing-plans 로 task 단위 구현. 체크박스 문법 사용.

**Goal:** 커뮤니티 최소기능(목록·글보기·글쓰기 + 댓글·좋아요) 이식 + 더보기 탭 전면 재구성(서비스설명·고객센터·약관/개인정보 웹링크·사업자정보 + 프로필·커뮤니티 진입 + 로그아웃).

**Architecture:** 커뮤니티는 Supabase 직결. `users_select` RLS 가 `USING(true)` 이므로 작성자 `name, role` 임베드 조인을 **모바일 anon+세션으로 직접 조회 가능**(웹은 편의상 service-role 사용했으나 신규 라우트 불필요 — 0개). 광고/제휴 배너(`AdBanner`)·신고·관리자 기능은 제외. 이미지 첨부는 스코프 외(텍스트 게시글, 아래 주의 참조). 팔레트는 SP1~SP4 화면과 동일. 더보기는 웹 미니앱 `More.tsx` 텍스트를 그대로 이식하되 약관·개인정보만 웹 URL 링크로 대체.

**Tech Stack:** 기존 mobile/ (Expo SDK 57, expo-router), supabase-js. 신규 의존성: `expo-web-browser`.

**포팅 규칙(모든 태스크 공통):**
- 원본의 Supabase 필드·검증·에러처리(23505 등)를 **그대로** 유지.
- `div→View`, 텍스트는 `<Text>`, `input/textarea→TextInput`, `button→Pressable`, 목록은 `FlatList`, `alert()→인라인 메시지`.
- SafeAreaView(`edges={["top"]}`) 사용.
- 각 태스크 끝 gate: `cd mobile && npx tsc --noEmit` 0 → 커밋(메시지 끝 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`). 백엔드 무변경이므로 루트 vitest 회귀 없음(변경 시에만 확인).

**웹에서 확정한 데이터 계약(정확히 준수):**
- `community_posts`: `id, author_id, category('buy'|'sell'|'photo'|'info'), title(1~100), content(1~5000), images(jsonb {url}[]), price(int·buy/sell만), like_count, comment_count, created_at, is_hidden`. RLS: SELECT `NOT is_hidden OR author_id = auth.uid()`, INSERT `author_id = auth.uid()`, UPDATE/DELETE own.
- `community_comments`: `id, post_id, author_id, content(1~1000), created_at, is_hidden`. RLS: SELECT `NOT is_hidden OR own`, INSERT own, DELETE own.
- `community_likes`: `post_id, user_id`(unique → 중복 insert 23505). RLS: SELECT `USING(true)`, INSERT/DELETE own.
- 작성자 임베드: `.select("...author:users!author_id(name, role)")` — `users_select USING(true)` 로 조회 가능.
- 카테고리 라벨/색: 웹 `components/community/constants.ts`(CATEGORY_LABEL/CATEGORY_COLOR, ROLE_BADGE) 값 그대로 상수화.
- 사업자정보(원본 `apps-in-toss/src/screens/More.tsx` BIZ): 서비스명 탁카 / 상호 에이치앤에이치(H&H) / 대표 박효균 / 사업자등록번호 328-48-01175 / 업종 전자상거래 소매 중개업(SNS 마켓) / 주소 부산광역시 강서구 화전산단4로 74, 107동 1605호 (화전동, 우방아이유쉘) / 고객센터·개인정보 gurbsl12@naver.com.
- 약관·개인정보 웹 URL: `${API_BASE}/terms`, `${API_BASE}/privacy` (둘 다 웹앱에 존재 확인됨).

---

### Task 1: 커뮤니티 목록 + 글쓰기

**Files:**
- Create: `mobile/app/community/index.tsx` (목록), `mobile/app/community/new.tsx` (글쓰기)
- Create: `mobile/lib/community.ts` (CATEGORY_LABEL/COLOR·ROLE_BADGE 상수 — 웹 constants 값 이식)
- 원본: `app/community/page.tsx`(목록 쿼리), `app/community/new/page.tsx` + `components/community/PostForm.tsx`, `app/actions/community.ts` `createPost`(검증 규칙)

- [ ] Step 1: 목록 이식 — `community_posts.select("id, category, title, content, images, price, like_count, comment_count, created_at, author:users!author_id(name, role)").eq("is_hidden", false).order("created_at",{ascending:false}).limit(50)`. 카테고리 필터(buy/sell/photo/info) 탭. FlatList 행 탭 → `router.push(`/community/${id}`)`. `useFocusEffect` 로 포커스 재조회. 빈 상태 문구. **AdBanner 제외**.
- [ ] Step 2: 글쓰기 이식 — 카테고리 선택 + title(1~100)·content(1~5000) TextInput + buy/sell 일 때만 price 입력. `createPost` 검증 그대로. `supabase.from("community_posts").insert({ author_id: user.id, category, title, content, images: [], price: (category==="buy"||category==="sell") ? price : null }).select("id").single()` → 성공 시 `router.replace(`/community/${data.id}`)`. images 는 `[]`(주의 참조).
- [ ] Step 3: 목록 상단 "글쓰기" → `router.push("/community/new")` 배선.
- [ ] Step 4: gate — `cd mobile && npx tsc --noEmit` 0 → 커밋 `feat(mobile): 커뮤니티 목록 + 글쓰기`

### Task 2: 커뮤니티 글보기 + 댓글·좋아요

**Files:**
- Create: `mobile/app/community/[id].tsx`
- 원본: `app/community/[id]/page.tsx`(글·댓글·좋아요 조회), `app/actions/community.ts` `createComment`/`toggleLike`

- [ ] Step 1: 글 조회 — `community_posts.select("*, author:users!author_id(name, role)").eq("id", id).maybeSingle()`. 없음/숨김(작성자 아님) 시 not-found 인라인. 제목·작성자(name+role 뱃지)·작성일·price(있으면)·content 표시. `images` 배열 있으면 렌더(있을 때만 — 웹 파리티).
- [ ] Step 2: 댓글 — `community_comments.select("id, content, created_at, author_id, author:users!author_id(name, role)").eq("post_id", id).eq("is_hidden", false).order("created_at",{ascending:true})`. 입력 후 `createComment` 규칙(1~1000자)대로 `insert({ post_id, author_id: user.id, content })` → 재조회. 본인 댓글 삭제(선택: `delete().eq("id").eq("author_id", user.id)`).
- [ ] Step 3: 좋아요 토글 — 원본 `toggleLike` 로직 그대로: `community_likes` 존재 조회 → 있으면 delete, 없으면 insert(23505 시 이미 좋아요로 처리). 하트 카운트/상태 낙관적 업데이트. 신고 버튼은 **제외**.
- [ ] Step 4: gate — `cd mobile && npx tsc --noEmit` 0 → 커밋 `feat(mobile): 커뮤니티 글보기 + 댓글·좋아요`

### Task 3: 더보기 탭 재구성 (약관·사업자정보·진입)

**Files:**
- Modify: `mobile/app/(tabs)/more.tsx` (placeholder + SP4 프로필 링크 → 전면 재구성)
- Modify: `mobile/package.json` (`npx expo install expo-web-browser`)
- 원본: `apps-in-toss/src/screens/More.tsx`(아코디언 텍스트·BIZ)

- [ ] Step 1: `expo-web-browser` 설치. 아코디언 섹션 컴포넌트(펼침 상태 useState) — 인라인 텍스트: "탁카는 어떤 서비스인가요"(중개 플랫폼·탁송료 미결제 고지), "고객센터/문의"(이메일·영업일 3일), "사업자 정보"(BIZ 6항목). 원본 문구 그대로 이식.
- [ ] Step 2: 약관·개인정보 — 인라인 대신 링크 행(Pressable) → `WebBrowser.openBrowserAsync(`${API_BASE}/terms`)` / `.../privacy`.
- [ ] Step 3: 진입·로그아웃 — "프로필"(→`/profile`, SP4 화면), "커뮤니티"(→`/community`) 진입 행 + 기존 로그아웃(`supabase.auth.signOut()` → `router.replace("/(auth)/login")`) 유지. SP4가 more.tsx 에 넣은 프로필 링크는 이 재구성에 통합.
- [ ] Step 4: gate — `cd mobile && npx tsc --noEmit` 0 → 커밋 `feat(mobile): 더보기 재구성 — 약관·사업자정보·프로필·커뮤니티 진입`

---

### 완료 기준
1. mobile tsc 0(백엔드 무변경 → 루트 vitest 회귀 없음).
2. 실사(오케스트레이터): 로그인 → 더보기 → 커뮤니티 목록 → 글쓰기 → 글보기에서 댓글·좋아요; 더보기 약관 링크가 인앱 브라우저로 열림; 사업자정보 표시.

### 주의 / 리스크
- 이미지 첨부 제외: 커뮤니티 글쓰기는 텍스트만(`images: []`). "photo" 카테고리도 텍스트로 게시 가능. Storage(`community-images` 버킷·`community_images_insert` RLS) 연동은 후속(원하면 SP6 이후 별도 태스크). "글쓰기 최소" 결정에 부합.
- 신고(`community_reports`)·관리자 처리·AdBanner(`ad_banners`)는 스코프 제외(웹 전용/부가).
- `like_count`/`comment_count` 는 웹에서 트리거/서버가 관리하는 파생값 — 모바일은 조회만(직접 증감 금지). 좋아요/댓글 후 재조회로 최신값 반영.
- SP4↔SP5 조정: SP4 Task2 가 more.tsx 에 프로필 진입을 임시 추가 → 본 SP5 Task3 재구성에서 프로필·커뮤니티 진입으로 통합. 재구성 시 프로필 링크 누락 금지.
