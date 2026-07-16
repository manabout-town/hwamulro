import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServiceClient } from "@/lib/supabase/service"

// 게이팅된 상대 연락처 조회. 매칭 당사자(기사/화주)만, 그리고 매칭 이용료
// (match_fees) 결제 후에만 상대방 이름·연락처를 반환한다.
// 인증 패턴은 match-fee/create 와 동일: Bearer 토큰 → anon 클라이언트로 유저
// 확인 → service-role 로 조회.
export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    return NextResponse.json({ error: "server not configured" }, { status: 503 })
  }

  const token = request.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  let body: { matchId?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: "invalid body" }, { status: 400 }) }
  if (!body.matchId) return NextResponse.json({ error: "matchId 필요" }, { status: 400 })

  const service = createServiceClient()

  const { data: match } = await service.from("matches")
    .select("id, driver_id, order_id").eq("id", body.matchId).single()
  if (!match) return NextResponse.json({ error: "매칭을 찾을 수 없어요" }, { status: 404 })

  const { data: order } = await service.from("orders")
    .select("shipper_id").eq("id", match.order_id).single()
  if (!order) return NextResponse.json({ error: "의뢰를 찾을 수 없어요" }, { status: 404 })

  const isDriver = user.id === match.driver_id
  const isShipper = user.id === order.shipper_id
  if (!isDriver && !isShipper) return NextResponse.json({ error: "권한이 없어요" }, { status: 403 })

  // 이용료 결제 게이팅: fee row 가 있고 미결제면 차단(웹 매칭은 fee 없음 → 통과)
  const { data: fee } = await service.from("match_fees")
    .select("status").eq("match_id", match.id).maybeSingle()
  if (fee && fee.status !== "paid") {
    return NextResponse.json({ error: "이용료 결제 후 확인할 수 있습니다" }, { status: 403 })
  }

  const otherId = isDriver ? order.shipper_id : match.driver_id
  const { data: other } = await service.from("users")
    .select("name, phone").eq("id", otherId).single()
  if (!other) return NextResponse.json({ error: "상대 정보를 찾을 수 없어요" }, { status: 404 })

  return NextResponse.json({ name: other.name, phone: other.phone ?? null })
}
