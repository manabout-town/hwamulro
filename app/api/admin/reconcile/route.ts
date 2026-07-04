import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { logError } from "@/lib/utils/observability"

// OPS-001 결제 정합성 대사 (cron)
// 'attempted' 상태로 남은 결제 시도 = confirm 처리가 중단된 구간.
// escrow가 실제 존재하면 self-heal(confirmed), 없으면 "돈만 빠지고 미기록" 의심 → 로깅/알림.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const service = createServiceClient()
  // 10분 이상 'attempted'로 정체된 건만 (진행 중 정상 요청 제외)
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString()

  const { data: stuck } = await service
    .from("payment_attempts")
    .select("payment_key, order_id, amount, type, created_at")
    .eq("status", "attempted")
    .lt("created_at", cutoff)

  if (!stuck?.length) return NextResponse.json({ checked: 0, healed: 0, missing: 0 })

  let healed = 0
  const missing: string[] = []

  for (const a of stuck) {
    if (a.type !== "escrow") {
      // urgent 등은 별도 처리 — 여기선 escrow만 대사
      continue
    }
    const { data: escrow } = await service
      .from("escrow")
      .select("id")
      .eq("pg_transaction_id", a.payment_key)
      .maybeSingle()

    if (escrow) {
      // 기록은 됐는데 attempt 상태만 안 바뀐 경우 → 정합성 회복
      await service.from("payment_attempts").update({ status: "confirmed", confirmed_at: new Date().toISOString() }).eq("payment_key", a.payment_key)
      healed++
    } else {
      // escrow 부재 — Toss 승인 여부 수동확인 필요(자금-기록 불일치 의심)
      missing.push(a.payment_key)
      await logError("reconcile", "결제 시도 정체 + escrow 부재 — 자금-기록 불일치 의심", {
        paymentKey: a.payment_key, orderId: a.order_id, amount: a.amount, since: a.created_at,
      })
    }
  }

  return NextResponse.json({ checked: stuck.length, healed, missing: missing.length, missingKeys: missing })
}
