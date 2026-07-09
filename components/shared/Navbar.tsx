"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "@/app/actions/auth"
import { Logo } from "@/components/shared/Logo"
import { NotificationBell } from "@/components/shared/NotificationBell"
import type { User } from "@/lib/types"

interface NavbarProps { user: User }

export function Navbar({ user }: NavbarProps) {
  const pathname = usePathname()

  const shipperNav = [
    { href: "/shipper/dashboard", label: "대시보드" },
    { href: "/shipper/orders/new", label: "의뢰 등록" },
    { href: "/shipper/drivers", label: "기사 찾기" },
    { href: "/shipper/wallet", label: "지갑" },
    { href: "/community", label: "커뮤니티" },
    { href: "/shipper/mypage", label: "마이페이지" },
  ]
  const driverNav = [
    { href: "/driver/dashboard", label: "대시보드" },
    { href: "/driver/feed", label: "의뢰 피드" },
    { href: "/driver/matches", label: "내 운송" },
    { href: "/driver/calendar", label: "캘린더" },
    { href: "/driver/schedule", label: "가용일정" },
    { href: "/driver/wallet", label: "수익 지갑" },
    { href: "/community", label: "커뮤니티" },
    { href: "/driver/mypage", label: "마이페이지" },
  ]
  const adminNav = [
    { href: "/admin/dashboard", label: "대시보드" },
    { href: "/admin/kyc", label: "KYC 검토" },
    { href: "/admin/orders", label: "의뢰 관리" },
    { href: "/admin/drivers", label: "기사 인증" },
    { href: "/admin/disputes", label: "분쟁 관리" },
    { href: "/admin/settlements", label: "정산 관리" },
    { href: "/admin/users", label: "회원 관리" },
    { href: "/admin/community", label: "커뮤니티" },
    { href: "/admin/ads", label: "광고" },
  ]

  const nav = user.role === "shipper" ? shipperNav
    : user.role === "driver" ? driverNav
    : adminNav

  const activeStyle = user.role === "shipper"
    ? "bg-orange-50 text-orange-600 font-semibold"
    : user.role === "driver"
    ? "bg-indigo-50 text-indigo-600 font-semibold"
    : "bg-amber-50 text-amber-700 font-semibold"

  const roleBadge = user.role === "shipper" ? "화주" : user.role === "driver" ? "기사" : "관리자"
  const roleColor = user.role === "shipper"
    ? "bg-orange-100 text-orange-700"
    : user.role === "driver"
    ? "bg-indigo-100 text-indigo-700"
    : "bg-amber-100 text-amber-700"

  return (
    <nav className="bg-white/95 backdrop-blur border-b border-gray-100 sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Logo />
          <div className="hidden md:flex items-center gap-0.5">
            {nav.map(item => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/")
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    active ? activeStyle : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell userId={user.id} />
          <div className="hidden sm:flex items-center gap-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${roleColor}`}>{roleBadge}</span>
            <span className="text-sm font-medium text-gray-700">{user.name}</span>
          </div>
          <form action={signOut}>
            <button type="submit" className="text-xs text-gray-400 hover:text-gray-700 transition-colors px-2 py-1 rounded hover:bg-gray-100 min-h-[44px] min-w-[44px]">
              로그아웃
            </button>
          </form>
        </div>
      </div>
    </nav>
  )
}
