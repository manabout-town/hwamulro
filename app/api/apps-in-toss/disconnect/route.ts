import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"

// 토스 연결 끊기 콜백. 콘솔에 등록한 Basic Auth 헤더로 토스가 호출한다.
// referrer: UNLINK(설정 해제) / WITHDRAWAL_TERMS(약관 철회) / WITHDRAWAL_TOSS(토스 탈퇴)
function authOk(req: NextRequest): boolean {
  const expected = process.env.APPS_IN_TOSS_DISCONNECT_BASIC
  if (!expected) return false
  return req.headers.get("authorization") === `Basic ${expected}`
}

// 연결 끊기 후처리: 매핑 해제 + 익명화.
// 재무/거래 기록(orders·escrow) 보존 위해 하드 삭제 대신 suspend + PII 제거.
async function cleanup(userKey: string | null): Promise<void> {
  if (!userKey) return
  const service = createServiceClient()
  await service
    .from("users")
    .update({ status: "suspended", toss_user_key: null, name: "탈퇴회원", phone: null })
    .eq("toss_user_key", String(userKey))
}

export async function POST(req: NextRequest) {
  if (!authOk(req)) return new NextResponse("unauthorized", { status: 401 })
  let userKey: string | null = null
  try {
    const body = await req.json()
    userKey = body?.userKey != null ? String(body.userKey) : null
  } catch {
    // 바디 없거나 파싱 실패 — userKey 없이 200 반환(재시도 방지)
  }
  await cleanup(userKey)
  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
  if (!authOk(req)) return new NextResponse("unauthorized", { status: 401 })
  const userKey = req.nextUrl.searchParams.get("userKey")
  await cleanup(userKey)
  return NextResponse.json({ ok: true })
}
