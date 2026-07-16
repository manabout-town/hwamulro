# 탁카 스토어 앱 SP1(기반) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expo RN 앱 스캐폴딩 + 이메일 로그인/가입(역할선택 포함) + 인증 게이트 + 탭 네비게이션 골격.

**Architecture:** `mobile/` = Expo(TypeScript, expo-router). Supabase JS 직결(AsyncStorage 세션), 가입만 신규 백엔드 라우트 `POST /api/mobile/signup`(service-role 필요해서). 웹 `app/actions/auth.ts:signUp`과 동일 데이터 계약(users + role별 profiles insert).

**Tech Stack:** Expo SDK(latest), expo-router, @supabase/supabase-js, @react-native-async-storage/async-storage, vitest(백엔드).

**전제:** 레포 루트 `/Users/park/Desktop/탁카`, 브랜치 `feat/store-app-expo`. 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: 백엔드 모바일 가입 플로우 (TDD)

**Files:**
- Create: `lib/mobile/signupFlow.ts`
- Create: `lib/mobile/signupFlow.test.ts`
- Create: `app/api/mobile/signup/route.ts`

웹 `app/actions/auth.ts:signUp`(10-70행)과 동일 규칙을 주입형 순수함수로. 검증 규칙 동일: 비번 8자+특수문자 `/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\/~`]/`, 폰 `/^01[0-9]\d{7,8}$/`.

- [ ] **Step 1: 실패 테스트 작성** — `lib/mobile/signupFlow.test.ts`

```ts
import { describe, it, expect, vi } from "vitest"
import { signupFlow, type SignupDeps } from "./signupFlow"

function makeDeps(overrides: Partial<SignupDeps> = {}): SignupDeps {
  return {
    createAuthUser: vi.fn().mockResolvedValue({ userId: "u1", session: null }),
    insertUserRow: vi.fn().mockResolvedValue(undefined),
    insertRoleProfile: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

const valid = { email: "A@b.com ", password: "pass123!", name: "홍길동", phone: "010-1234-5678", role: "driver" as const }

describe("signupFlow", () => {
  it("유효 입력이면 유저 생성 + users insert + 역할 프로필 insert", async () => {
    const deps = makeDeps()
    const r = await signupFlow(valid, deps)
    expect(r).toEqual({ ok: true, needsEmailVerify: true })
    expect(deps.createAuthUser).toHaveBeenCalledWith("a@b.com", "pass123!", { name: "홍길동", role: "driver" })
    expect(deps.insertUserRow).toHaveBeenCalledWith({
      id: "u1", email: "a@b.com", name: "홍길동", phone: "01012345678",
      role: "driver", status: "active", verification_status: "unverified",
    })
    expect(deps.insertRoleProfile).toHaveBeenCalledWith("u1", "driver")
  })

  it("비밀번호 특수문자 없으면 검증 에러", async () => {
    const deps = makeDeps()
    const r = await signupFlow({ ...valid, password: "password1" }, deps)
    expect(r).toEqual({ ok: false, error: "비밀번호에 특수문자를 1개 이상 포함해야 합니다" })
    expect(deps.createAuthUser).not.toHaveBeenCalled()
  })

  it("휴대폰 형식 오류면 검증 에러", async () => {
    const r = await signupFlow({ ...valid, phone: "02-123-4567" }, makeDeps())
    expect(r).toEqual({ ok: false, error: "올바른 휴대폰 번호를 입력해주세요 (예: 010-1234-5678)" })
  })

  it("auth 생성 실패는 에러 그대로 반환", async () => {
    const deps = makeDeps({ createAuthUser: vi.fn().mockResolvedValue({ error: "User already registered" }) })
    const r = await signupFlow(valid, deps)
    expect(r).toEqual({ ok: false, error: "User already registered" })
    expect(deps.insertUserRow).not.toHaveBeenCalled()
  })

  it("세션이 즉시 발급되면 needsEmailVerify=false", async () => {
    const deps = makeDeps({ createAuthUser: vi.fn().mockResolvedValue({ userId: "u1", session: { access_token: "t" } }) })
    const r = await signupFlow(valid, deps)
    expect(r).toEqual({ ok: true, needsEmailVerify: false })
  })
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run lib/mobile/signupFlow.test.ts` → Expected: FAIL (signupFlow not found)

- [ ] **Step 3: 구현** — `lib/mobile/signupFlow.ts`

```ts
export type SignupInput = {
  email: string; password: string; name: string; phone: string; role: "shipper" | "driver"
}

export type SignupDeps = {
  createAuthUser: (email: string, password: string, meta: { name: string; role: string }) =>
    Promise<{ userId?: string; session?: unknown; error?: string }>
  insertUserRow: (row: {
    id: string; email: string; name: string; phone: string
    role: string; status: string; verification_status: string
  }) => Promise<void>
  insertRoleProfile: (userId: string, role: "shipper" | "driver") => Promise<void>
}

export type SignupResult = { ok: true; needsEmailVerify: boolean } | { ok: false; error: string }

const SPECIAL_CHAR_RE = /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\/~`]/
const PHONE_RE = /^01[0-9]\d{7,8}$/

export async function signupFlow(input: SignupInput, deps: SignupDeps): Promise<SignupResult> {
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()
  const phone = input.phone.replace(/-/g, "").trim()
  const { password, role } = input

  if (!email || !password || !name || !phone) return { ok: false, error: "모든 필수 항목을 입력해주세요" }
  if (password.length < 8) return { ok: false, error: "비밀번호는 8자 이상이어야 합니다" }
  if (!SPECIAL_CHAR_RE.test(password)) return { ok: false, error: "비밀번호에 특수문자를 1개 이상 포함해야 합니다" }
  if (!PHONE_RE.test(phone)) return { ok: false, error: "올바른 휴대폰 번호를 입력해주세요 (예: 010-1234-5678)" }
  if (role !== "shipper" && role !== "driver") return { ok: false, error: "역할을 선택해주세요" }

  const created = await deps.createAuthUser(email, password, { name, role })
  if (created.error || !created.userId) return { ok: false, error: created.error ?? "회원가입 실패" }

  await deps.insertUserRow({
    id: created.userId, email, name, phone, role,
    status: "active", verification_status: "unverified",
  })
  await deps.insertRoleProfile(created.userId, role)

  return { ok: true, needsEmailVerify: !created.session }
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run lib/mobile/signupFlow.test.ts` → Expected: 5 passed

- [ ] **Step 5: 라우트 배선** — `app/api/mobile/signup/route.ts` (기존 라우트 패턴은 `app/api/apps-in-toss/login/route.ts` 참조. anon 클라이언트로 signUp, service 클라이언트로 insert — `lib/supabase/service.ts`의 `createServiceClient` 사용)

```ts
import { NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { createServiceClient } from "@/lib/supabase/service"
import { signupFlow, type SignupInput } from "@/lib/mobile/signupFlow"

export async function POST(req: Request) {
  let body: SignupInput
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return NextResponse.json({ error: "서버 설정 오류" }, { status: 503 })

  const anon = createSupabaseClient(url, anonKey, { auth: { persistSession: false } })
  const service = createServiceClient()

  const result = await signupFlow(body, {
    createAuthUser: async (email, password, meta) => {
      const { data, error } = await anon.auth.signUp({
        email, password,
        options: { data: meta, emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
      })
      if (error) return { error: error.message }
      if (!data.user) return { error: "회원가입 실패" }
      return { userId: data.user.id, session: data.session ?? undefined }
    },
    insertUserRow: async (row) => {
      const { error } = await service.from("users").insert(row)
      if (error) throw new Error(error.message)
    },
    insertRoleProfile: async (userId, role) => {
      if (role === "driver") {
        await service.from("driver_profiles").insert({
          user_id: userId, vehicle_number: "", vehicle_type: "",
          is_verified: false, rating_avg: 0, rating_count: 0,
        })
      } else {
        await service.from("shipper_profiles").insert({ user_id: userId })
      }
    },
  }).catch((e: Error) => ({ ok: false as const, error: e.message }))

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result)
}
```

- [ ] **Step 6: 전체 검증** — Run: `npx vitest run && npx tsc --noEmit` → Expected: 기존 46 + 신규 5 = 51 passed, tsc 에러 0

- [ ] **Step 7: 커밋** — `git add lib/mobile app/api/mobile && git commit -m "feat(mobile): 모바일 가입 백엔드 — signupFlow TDD + /api/mobile/signup 라우트"`

---

### Task 2: Expo 스캐폴딩 + expo-router 설정

**Files:**
- Create: `mobile/` (create-expo-app)
- Modify: `mobile/package.json`, `mobile/app.json`
- Create: `mobile/.env.example`, `mobile/app/_layout.tsx`, `mobile/app/index.tsx`

- [ ] **Step 1: 스캐폴딩**

```bash
cd /Users/park/Desktop/탁카
npx create-expo-app@latest mobile --template blank-typescript --no-install
cd mobile && npm install
```

- [ ] **Step 2: 의존성 설치**

```bash
cd /Users/park/Desktop/탁카/mobile
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar @react-native-async-storage/async-storage
npm install @supabase/supabase-js react-native-url-polyfill
```

- [ ] **Step 3: expo-router 진입점·스킴 설정**
  - `mobile/package.json`: `"main": "expo-router/entry"` 로 교체
  - `mobile/app.json`의 `expo`에 추가: `"scheme": "takca"`, `"plugins": ["expo-router"]`, `"name": "탁카"`, `"slug": "takca"`
  - 템플릿 `App.tsx` 삭제

- [ ] **Step 4: 루트 레이아웃 + 인덱스** — `mobile/app/_layout.tsx`

```tsx
import { Stack } from "expo-router"

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
```

`mobile/app/index.tsx` (임시 — Task 4에서 인증 게이트로 교체)

```tsx
import { View, Text } from "react-native"

export default function Index() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>탁카</Text>
    </View>
  )
}
```

- [ ] **Step 5: env 예시 + gitignore** — `mobile/.env.example`

```
EXPO_PUBLIC_SUPABASE_URL=https://ypqwifcbgemmaatnzcbb.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key — apps-in-toss/.env의 VITE_SUPABASE_ANON_KEY 값 복사>
EXPO_PUBLIC_API_BASE=https://takca.vercel.app
```

실값 `mobile/.env`는 `apps-in-toss/.env`(있으면) 또는 루트 `.env.local`의 SUPABASE 값으로 생성. `mobile/.gitignore`에 `.env` 포함 확인(expo 템플릿 기본 포함 — 없으면 추가).

- [ ] **Step 6: 타입체크 확인** — Run: `cd mobile && npx tsc --noEmit` → Expected: 에러 0

- [ ] **Step 7: 커밋** — `git add mobile && git commit -m "feat(mobile): Expo 스캐폴딩 + expo-router 설정"` (`.env` 미포함 확인: `git status`에 mobile/.env 없어야 함)

---

### Task 3: Supabase 클라이언트 + 인증 컨텍스트

**Files:**
- Create: `mobile/lib/supabase.ts`
- Create: `mobile/lib/auth.tsx`

- [ ] **Step 1: 클라이언트** — `mobile/lib/supabase.ts`

```ts
import "react-native-url-polyfill/auto"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { createClient } from "@supabase/supabase-js"

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "https://takca.vercel.app"
```

- [ ] **Step 2: 인증 컨텍스트** — `mobile/lib/auth.tsx`

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "./supabase"

type Role = "shipper" | "driver" | null

type AuthState = { session: Session | null; role: Role; loading: boolean }

const AuthContext = createContext<AuthState>({ session: null, role: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<Role>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) { setRole(null); return }
    supabase.from("users").select("role").eq("id", session.user.id).single()
      .then(({ data }) => {
        if (data?.role === "shipper" || data?.role === "driver") setRole(data.role)
      })
  }, [session?.user?.id])

  return <AuthContext.Provider value={{ session, role, loading }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
```

- [ ] **Step 3: 타입체크** — Run: `cd mobile && npx tsc --noEmit` → Expected: 에러 0

- [ ] **Step 4: 커밋** — `git commit -am "feat(mobile): Supabase 클라이언트 + AuthProvider"`

---

### Task 4: 인증 게이트 + 로그인/가입/이메일확인 화면

**Files:**
- Modify: `mobile/app/_layout.tsx`, `mobile/app/index.tsx`
- Create: `mobile/app/(auth)/login.tsx`, `mobile/app/(auth)/signup.tsx`, `mobile/app/(auth)/verify-email.tsx`, `mobile/app/(auth)/_layout.tsx`

- [ ] **Step 1: 루트에 AuthProvider 배선** — `mobile/app/_layout.tsx` 교체

```tsx
import { Stack } from "expo-router"
import { AuthProvider } from "../lib/auth"

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  )
}
```

- [ ] **Step 2: 인덱스 = 게이트** — `mobile/app/index.tsx` 교체

```tsx
import { Redirect } from "expo-router"
import { ActivityIndicator, View } from "react-native"
import { useAuth } from "../lib/auth"

export default function Index() {
  const { session, loading } = useAuth()
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    )
  }
  return session ? <Redirect href="/(tabs)/home" /> : <Redirect href="/(auth)/login" />
}
```

- [ ] **Step 3: (auth) 레이아웃** — `mobile/app/(auth)/_layout.tsx`

```tsx
import { Stack } from "expo-router"

export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
```

- [ ] **Step 4: 로그인 화면** — `mobile/app/(auth)/login.tsx`. `supabase.auth.signInWithPassword` 직접 호출, 성공 시 `router.replace("/")`. 스타일: 브랜드 오렌지 `#F97316` CTA, 흰 배경, 여백 24. 이메일 미인증 에러(`Email not confirmed`)는 "이메일 인증을 완료해주세요"로 표시. 하단 "회원가입" 링크 → `/(auth)/signup`.

```tsx
import { useState } from "react"
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native"
import { Link, router } from "expo-router"
import { supabase } from "../../lib/supabase"

export default function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onLogin() {
    setError(null); setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    setBusy(false)
    if (error) {
      setError(error.message.includes("Email not confirmed") ? "이메일 인증을 완료해주세요" : "이메일 또는 비밀번호가 올바르지 않습니다")
      return
    }
    router.replace("/")
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.flex}>
      <View style={s.wrap}>
        <Text style={s.logo}>탁카</Text>
        <Text style={s.sub}>카 캐리어 탁송 매칭</Text>
        <TextInput style={s.input} placeholder="이메일" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={s.input} placeholder="비밀번호" secureTextEntry value={password} onChangeText={setPassword} />
        {error && <Text style={s.error}>{error}</Text>}
        <Pressable style={s.cta} onPress={onLogin} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaText}>로그인</Text>}
        </Pressable>
        <Link href="/(auth)/signup" style={s.link}>회원가입</Link>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = {
  flex: { flex: 1 },
  wrap: { flex: 1, justifyContent: "center" as const, padding: 24, backgroundColor: "#fff", gap: 12 },
  logo: { fontSize: 32, fontWeight: "800" as const, color: "#F97316", textAlign: "center" as const },
  sub: { textAlign: "center" as const, color: "#6B7280", marginBottom: 16 },
  input: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, padding: 14, fontSize: 16 },
  error: { color: "#DC2626", fontSize: 13 },
  cta: { backgroundColor: "#F97316", borderRadius: 10, padding: 16, alignItems: "center" as const },
  ctaText: { color: "#fff", fontWeight: "700" as const, fontSize: 16 },
  link: { textAlign: "center" as const, color: "#6B7280", marginTop: 8, textDecorationLine: "underline" as const },
}
```

- [ ] **Step 5: 가입 화면** — `mobile/app/(auth)/signup.tsx`. 필드: 이메일·비번·이름·휴대폰 + 역할 토글(화주/기사, 기본 화주). 제출 → `POST ${API_BASE}/api/mobile/signup` (JSON body: email/password/name/phone/role). 성공 시 `needsEmailVerify`면 `/(auth)/verify-email?email=...`로, 아니면 로그인 화면으로. 에러는 서버 `error` 문자열 표시. 스타일은 login과 동일 팔레트(스타일 객체 복제 OK — 공용화는 SP2에서 화면 늘어날 때).

- [ ] **Step 6: 이메일확인 화면** — `mobile/app/(auth)/verify-email.tsx`. `useLocalSearchParams()`로 email 표시, 안내문("가입 메일의 인증 링크를 눌러주세요"), "로그인으로" 버튼 → `router.replace("/(auth)/login")`.

- [ ] **Step 7: 타입체크** — Run: `cd mobile && npx tsc --noEmit` → Expected: 에러 0

- [ ] **Step 8: 커밋** — `git add mobile && git commit -m "feat(mobile): 이메일 로그인·가입·이메일확인 화면 + 인증 게이트"`

---

### Task 5: 탭 네비게이션 골격

**Files:**
- Create: `mobile/app/(tabs)/_layout.tsx`, `mobile/app/(tabs)/home.tsx`, `mobile/app/(tabs)/orders.tsx`, `mobile/app/(tabs)/more.tsx`

- [ ] **Step 1: 탭 레이아웃** — `mobile/app/(tabs)/_layout.tsx`

```tsx
import { Tabs, Redirect } from "expo-router"
import { Text } from "react-native"
import { useAuth } from "../../lib/auth"

function Icon({ label, color }: { label: string; color: string }) {
  return <Text style={{ fontSize: 20, color }}>{label}</Text>
}

export default function TabsLayout() {
  const { session, loading, role } = useAuth()
  if (loading) return null
  if (!session) return <Redirect href="/(auth)/login" />

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: "#F97316", headerShown: false }}>
      <Tabs.Screen name="home" options={{ title: "홈", tabBarIcon: ({ color }) => <Icon label="🏠" color={color} /> }} />
      <Tabs.Screen name="orders" options={{ title: role === "driver" ? "피드" : "내주문", tabBarIcon: ({ color }) => <Icon label="📋" color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: "더보기", tabBarIcon: ({ color }) => <Icon label="☰" color={color} /> }} />
    </Tabs>
  )
}
```

- [ ] **Step 2: 홈 placeholder** — `mobile/app/(tabs)/home.tsx`. 역할별 인사·CTA 스텁: 화주면 "주문 등록하기", 기사면 "탁송 피드 보기" (Pressable, onPress는 orders 탭 이동 `router.push("/(tabs)/orders")`). `useAuth()`의 role 사용. SafeAreaView 사용.

- [ ] **Step 3: orders/more placeholder** — 각각 "SP2에서 구현" 수준의 중앙 텍스트 화면. more에는 하단에 "로그아웃" 버튼: `supabase.auth.signOut()` 후 `router.replace("/(auth)/login")`.

- [ ] **Step 4: 타입체크** — Run: `cd mobile && npx tsc --noEmit` → Expected: 에러 0

- [ ] **Step 5: 루트 vitest 회귀** — Run: `cd /Users/park/Desktop/탁카 && npx vitest run` → Expected: 51 passed (mobile은 vitest 대상 아님 — vitest.config.ts가 mobile을 포함하면 exclude 추가)

- [ ] **Step 6: 커밋** — `git add mobile && git commit -m "feat(mobile): 탭 네비 골격(홈·주문/피드·더보기) + 로그아웃"`

---

### 완료 기준 (SP1 Definition of Done)

1. `npx vitest run` 51 passed (루트)
2. `npx tsc --noEmit` 루트·mobile 모두 0 에러
3. `cd mobile && npx expo export --platform web` 성공 (번들 무결성 스모크)
4. 수동 실사(오케스트레이터/사용자): Expo Go에서 로그인(shipper@takca.test/Takca2026!) → 홈 → 탭 전환 → 로그아웃
