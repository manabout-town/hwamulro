# 탁카 스토어 앱 (Expo React Native) 전환 설계

날짜: 2026-07-16
상태: 승인됨 (사용자 승인 완료)
브랜치: `feat/store-app-expo` (base: `feat/apps-in-toss-심의-수익화` b19942e)

## 배경 / 피벗 결정

앱인토스 미니앱으로 개발하던 탁카 모바일을 **구글 플레이 + 애플 앱스토어 출시용 네이티브 앱**으로 전환한다.
앱인토스 진입 불가 판단(사용자 결정)에 따른 방향 전환이며, 미니앱 코드(`apps-in-toss/`)는 참고용으로 보존한다.

### 확정된 결정 (사용자 선택)

| 항목 | 결정 |
|------|------|
| 스택 | Expo React Native (신규) |
| 수익화 | A안 유지 — 기사 매칭이용료 3,000원, 연락처 잠금해제형, 24h 자동취소·환불 |
| 결제수단 | 토스 파트너 토스페이 → **토스페이먼츠(PG)** 교체 |
| 로그인 | 웹앱과 동일 Supabase 이메일+비밀번호 (계정 완전 공유) |
| 코드 위치 | 모노레포 `mobile/` |
| apps-in-toss/ | 보존 (참고용) |
| MVP 범위 | 웹 전체기능 수준 (단, 아래 제외 항목 참조) |

### 범위 제외 (정합성 정리)

- **에스크로 결제(탁송대금 전액) 제외** — A안 채택으로 앱 내 결제는 매칭이용료 3,000원만. 탁송대금은 당사자 직접 정산.
- **어드민 제외** — 웹 전용 유지.

## 아키텍처

```
mobile/ (Expo RN, TypeScript, expo-router)
  ├─ Supabase JS 클라이언트 직결 (RLS 기반 조회·쓰기)
  │    └─ 018~021 마이그레이션이 유저세션용 RLS 정비 완료 → 그대로 활용
  ├─ 민감 작업은 기존 Next.js API를 Bearer(세션 access_token)로 호출
  │    ├─ POST /api/apps-in-toss/bids/approve   (입찰수락)
  │    ├─ POST /api/apps-in-toss/match-fee/create·confirm (이용료)
  │    └─ GET  /api/apps-in-toss/match-contact  (결제 후 연락처)
  └─ 세션: expo-secure-store 보관, supabase-js auth storage 어댑터
```

- 백엔드는 기존 Next.js(Vercel) 재사용. 라우트 경로는 당분간 `apps-in-toss/` 프리픽스 유지(동작 우선, 리네임은 후순위).
- `matchFeeFlow`(주입형 오케스트레이터)·RLS·환불 로직·2026-07-16 보안수정 4건은 결제수단 무관 — 전부 유지.

### 결제 어댑터 교체 (SP3 핵심)

- `lib/apps-in-toss/tossPay.ts`(파트너API make/execute-payment, mTLS) → **토스페이먼츠 v1 API 어댑터** 신규:
  - 승인: `POST https://api.tosspayments.com/v1/payments/confirm` (secretKey Basic 인증, paymentKey+orderId+amount)
  - 취소/환불: `POST /v1/payments/{paymentKey}/cancel`
  - 기존 웹 에스크로 confirm 라우트(`app/api/payments/toss/confirm`)에 검증된 패턴 존재 → 참조
- 클라이언트: 토스페이먼츠 결제위젯 RN SDK(WebView 기반) → 성공 콜백에서 백엔드 confirm 호출
- `matchFeeFlow`의 결제 dep만 교체. 테스트(46개) 유지 + 어댑터 테스트 추가.
- mTLS·x-toss-user-key 등 토스 파트너 전용 배선 제거(어댑터 경계 안에서).

### 인증 (SP1)

- Supabase 이메일+비번, 웹과 동일 users 테이블·계정 공유.
- 가입 시 역할 선택(화주/기사) → users.role. 웹 온보딩과 동일 데이터 계약.
- toss_user_key 신원매핑 미사용(토스 전용 유산 — 백엔드에 남아 있어도 무해).

## 하위 프로젝트 (순차, 각각 plan → 구현 → 검수)

| # | 이름 | 내용 | 구현 모델 |
|---|------|------|-----------|
| SP1 | 기반 | Expo 스캐폴딩, 이메일 로그인/가입, 역할선택 온보딩, 탭 네비 | Sonnet |
| SP2 | 매칭 코어 | 주문등록, 기사 피드+입찰, 입찰수락, 내주문 (미니앱 화면 이식) | Sonnet |
| SP3 | 수익화 | 매칭상세, 이용료 결제(토스페이먼츠), 연락처·채팅 게이팅, 환불, 백엔드 어댑터 교체 | Opus |
| SP4 | 신뢰 | KYC 서류 업로드, 리뷰, 프로필 | Sonnet |
| SP5 | 커뮤니티·부가 | 커뮤니티 피드, 더보기(약관·사업자정보) | Sonnet |
| SP6 | 출시 | 푸시알림(새입찰·매칭·채팅), 계정삭제(애플 필수), 아이콘·스플래시, EAS 빌드 | Opus |

오케스트레이션·설계·검수: Fable.

## 테스트 전략

- 백엔드: 기존 vitest 46개 그린 유지 + 토스페이먼츠 어댑터 단위테스트(DI fetch 목).
- 모바일: 로직 훅·유틸 단위테스트(vitest 또는 jest-expo), 화면은 시뮬레이터/Expo Go 실사 검증.
- 각 SP 완료 시: tsc 0(루트+mobile), 테스트 그린, 핵심 플로우 실사.

## 리스크

| 리스크 | 대응 |
|--------|------|
| 애플 심사: 계정삭제 필수 | SP6에 계정삭제 기능 포함 |
| 애플 심사: KYC 개인정보 | 개인정보처리방침 URL(웹 /privacy) + 앱 내 고지 |
| 토스페이먼츠 라이브키 | 가맹점 심사 필요. 개발은 테스트키로 진행 |
| 이용료 결제 = 실물서비스 중개 수수료 | 애플 3.1.3(e)/(f) 실물서비스 → 외부 PG 허용. IAP 비대상 |
| prod DB 마이그레이션 018~021 미적용 | 앱 동작 전제조건. 배포 시점에 순서 적용 (기존 펜딩 그대로) |
