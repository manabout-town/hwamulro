import { createServerClient, type CookieOptions } from "@supabase/ssr"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  // Public paths — no auth required
  const publicPaths = ["/", "/login", "/signup", "/intro", "/verify-email", "/auth/callback", "/terms", "/privacy", "/partnership"]
  const isPublic = publicPaths.some(p => path === p || path.startsWith("/auth/")) || path.startsWith("/api/")

  if (!user && !isPublic && path !== "/onboarding") {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  if (!user) return response

  // Fetch profile (role + verification_status)
  const { data: profile } = await supabase
    .from("users")
    .select("role, verification_status")
    .eq("id", user.id)
    .single()

  // No profile yet → onboarding
  if (!profile?.role) {
    if (path !== "/onboarding") return NextResponse.redirect(new URL("/onboarding", request.url))
    return response
  }

  const { role, verification_status } = profile

  // Redirect logged-in users away from auth/landing pages
  if (path === "/" || path === "/login" || path === "/signup") {
    if (role === "admin") return NextResponse.redirect(new URL("/admin/dashboard", request.url))
    if (verification_status !== "verified") {
      return NextResponse.redirect(new URL("/verification", request.url))
    }
    if (role === "shipper") return NextResponse.redirect(new URL("/shipper/dashboard", request.url))
    if (role === "driver") return NextResponse.redirect(new URL("/driver/dashboard", request.url))
  }

  // Admin bypasses KYC gate entirely
  if (role === "admin") return response

  // KYC gate — unverified/rejected users must complete verification
  // (Allow: /verification itself, /intro, /profile, API routes, onboarding)
  const kycExempt = ["/verification", "/onboarding", "/intro", "/profile", "/community", "/partnership"]
  const isKycExempt = kycExempt.some(p => path === p || path.startsWith(p + "/")) || path.startsWith("/api/")

  if (!isKycExempt && verification_status !== "verified") {
    return NextResponse.redirect(new URL("/verification", request.url))
  }

  // BUG-003: 역할별 전용 영역 접근 통제 (POL-010)
  // 비공개 하위경로만 차단 — /driver/[userId] 프로필·공유경로(chat/review/orders/payment)는 허용
  const seg = path.split("/").filter(Boolean)
  const driverPrivate = new Set(["dashboard", "feed", "mypage", "wallet", "orders", "matches", "schedule", "calendar"])
  const shipperPrivate = new Set(["dashboard", "mypage", "wallet", "orders", "calendar", "drivers"])
  if (seg[0] === "driver" && driverPrivate.has(seg[1]) && role !== "driver") {
    return NextResponse.redirect(new URL(role === "shipper" ? "/shipper/dashboard" : "/verification", request.url))
  }
  if (seg[0] === "shipper" && shipperPrivate.has(seg[1]) && role !== "shipper") {
    return NextResponse.redirect(new URL(role === "driver" ? "/driver/dashboard" : "/verification", request.url))
  }

  return response
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
