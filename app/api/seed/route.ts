import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"

const TEST_ACCOUNTS = [
  {
    email: "shipper@test.com",
    password: "Test1234!",
    name: "테스트화주",
    phone: "01011111111",
    role: "shipper" as const,
    shipperProfile: {
      company_name: "테스트물류(주)",
      business_number: "1234567890",
    },
    walletBalance: 5000000,
  },
  {
    email: "driver@test.com",
    password: "Test1234!",
    name: "테스트기사",
    phone: "01022222222",
    role: "driver" as const,
    driverProfile: {
      vehicle_number: "12가 3456",
      vehicle_type: "5톤",
      home_region: "경기",
      route_regions: ["서울", "경기", "인천"],
      is_verified: true,
      rating_avg: 4.5,
      rating_count: 23,
    },
    walletBalance: 1200000,
  },
]

export async function GET(request: NextRequest) {
  // 프로덕션 보호: 시크릿 없으면 시딩 차단 (테스트계정 + 실지갑잔액 무단생성 방지)
  const secret = process.env.CRON_SECRET
  if (process.env.NODE_ENV === "production") {
    if (!secret) {
      return NextResponse.json({ error: "seeding disabled" }, { status: 404 })
    }
    const token =
      request.headers.get("authorization")?.replace("Bearer ", "") ??
      request.nextUrl.searchParams.get("token")
    if (token !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
  }

  const service = createServiceClient()
  const results: { email: string; status: string; error?: string }[] = []

  for (const account of TEST_ACCOUNTS) {
    try {
      const { data: existingUsers } = await service.auth.admin.listUsers()
      const existing = existingUsers?.users?.find(u => u.email === account.email)

      let userId: string

      if (existing) {
        userId = existing.id
        results.push({ email: account.email, status: "already_exists" })
      } else {
        const { data, error } = await service.auth.admin.createUser({
          email: account.email,
          password: account.password,
          email_confirm: true,
          user_metadata: { name: account.name, role: account.role },
        })
        if (error || !data.user) {
          results.push({ email: account.email, status: "error", error: error?.message })
          continue
        }
        userId = data.user.id
        results.push({ email: account.email, status: "created" })
      }

      await service.from("users").upsert({
        id: userId,
        email: account.email,
        name: account.name,
        phone: account.phone,
        role: account.role,
        status: "active",
      })

      if (account.role === "driver" && account.driverProfile) {
        await service.from("driver_profiles").upsert({
          user_id: userId,
          ...account.driverProfile,
        })
      } else if (account.role === "shipper" && account.shipperProfile) {
        await service.from("shipper_profiles").upsert({
          user_id: userId,
          ...account.shipperProfile,
        })
      }

      await service.from("wallets").upsert({
        user_id: userId,
        balance: account.walletBalance,
      })
    } catch (err) {
      results.push({ email: account.email, status: "error", error: String(err) })
    }
  }

  return NextResponse.json({ results })
}
