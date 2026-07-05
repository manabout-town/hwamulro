import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"
import { calculateFee } from "@/lib/utils/format"
import { logError } from "@/lib/utils/observability"

export async function POST(req: NextRequest) {
  try {
    const { paymentKey, orderId, amount, type } = await req.json()

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const service = createServiceClient()

    if (type === "escrow") {
      // Extract real orderId from our orderId format (orderId = "escrow_{dbOrderId}_{timestamp}")
      const parts = orderId.split("_")
      const dbOrderId = parts[1]

      // paymentKey 중복 체크 — Toss API 호출 전에 먼저 확인 (idempotency)
      const { data: existingEscrow } = await service
        .from("escrow")
        .select("id")
        .eq("pg_transaction_id", paymentKey)
        .maybeSingle()

      if (existingEscrow) return NextResponse.json({ success: true })

      const { data: order } = await service
        .from("orders")
        .select("*, matches(id, driver_id, status)")
        .eq("id", dbOrderId)
        .single()

      if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 })

      // BUG-006: 결제 확정은 해당 의뢰의 화주 본인만 (POL-011)
      if (order.shipper_id !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }

      // BUG-004: 클라이언트 amount를 서버 확정금액(order.price)과 대조 — 과소결제 방지 (POL-040)
      if (Number(amount) !== Number(order.price)) {
        return NextResponse.json({ error: "결제 금액이 의뢰 금액과 일치하지 않습니다" }, { status: 400 })
      }

      const activeMatch = (order.matches as any[])?.find(m => m.status === "accepted")
      if (!activeMatch) return NextResponse.json({ error: "No active match" }, { status: 400 })

      // OPS-001: Toss 승인 '이전'에 결제 시도 기록 → 대사(reconcile)로 escrow 누락 검출 가능
      await service.from("payment_attempts").upsert({
        payment_key: paymentKey,
        order_id: dbOrderId,
        shipper_id: user.id,
        type: "escrow",
        amount,
        status: "attempted",
      }, { onConflict: "payment_key" })

      // Toss 승인 API 호출
      const encoded = Buffer.from(`${process.env.TOSS_SECRET_KEY}:`).toString("base64")
      const tossRes = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
        method: "POST",
        headers: {
          Authorization: `Basic ${encoded}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ paymentKey, orderId, amount }),
      })

      if (!tossRes.ok) {
        const err = await tossRes.json()
        await service.from("payment_attempts").update({ status: "failed", error: err.message }).eq("payment_key", paymentKey)
        return NextResponse.json({ error: err.message }, { status: 400 })
      }

      const { platformFee, driverPayout } = calculateFee(amount)

      // OPS-001: Toss 승인 성공 후 escrow 기록 실패 시 "돈만 빠지고 미기록" — 반드시 탐지/로깅
      const { error: escrowErr } = await service.from("escrow").insert({
        order_id: dbOrderId,
        match_id: activeMatch.id,
        total_amount: amount,
        platform_fee: platformFee,
        driver_payout: driverPayout,
        status: "held",
        pg_transaction_id: paymentKey,
        held_at: new Date().toISOString(),
      })

      if (escrowErr) {
        await service.from("payment_attempts").update({ status: "failed", error: `escrow_insert: ${escrowErr.message}` }).eq("payment_key", paymentKey)
        await logError("payments/toss/confirm", "Toss 승인 성공했으나 escrow 기록 실패 (자금-기록 불일치)", {
          paymentKey, dbOrderId, amount, error: escrowErr.message,
        })
        return NextResponse.json({ error: "결제는 승인됐으나 처리 중 오류가 발생했습니다. 고객센터가 확인 후 조치합니다." }, { status: 500 })
      }

      await service.from("orders").update({ status: "in_progress" }).eq("id", dbOrderId)
      await service.from("matches").update({ status: "in_progress" }).eq("id", activeMatch.id)
      await service.from("payment_attempts").update({ status: "confirmed", confirmed_at: new Date().toISOString() }).eq("payment_key", paymentKey)

      return NextResponse.json({ success: true })
    }

    if (type === "urgent") {
      const parts = orderId.split("_")
      const dbOrderId = parts[1]

      // idempotency 체크
      const { data: existingUrgent } = await service
        .from("urgent_payments")
        .select("id")
        .eq("pg_transaction_id", paymentKey)
        .maybeSingle()

      if (existingUrgent) return NextResponse.json({ success: true })

      // BUG-006/POL-011: urgent 결제도 해당 의뢰의 화주 본인만 (escrow 경로와 동일 인가 경계)
      const { data: urgentOrder } = await service
        .from("orders")
        .select("shipper_id")
        .eq("id", dbOrderId)
        .single()
      if (!urgentOrder) return NextResponse.json({ error: "Order not found" }, { status: 404 })
      if (urgentOrder.shipper_id !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }

      const encoded = Buffer.from(`${process.env.TOSS_SECRET_KEY}:`).toString("base64")
      const tossRes = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
        method: "POST",
        headers: {
          Authorization: `Basic ${encoded}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ paymentKey, orderId, amount }),
      })

      if (!tossRes.ok) {
        const err = await tossRes.json()
        return NextResponse.json({ error: err.message }, { status: 400 })
      }

      await service.from("urgent_payments").insert({
        order_id: dbOrderId,
        shipper_id: user.id,
        amount,
        pg_transaction_id: paymentKey,
        status: "paid",
        paid_at: new Date().toISOString(),
      })

      await service.from("orders").update({ is_urgent: true, urgent_fee: amount }).eq("id", dbOrderId)

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Unknown payment type" }, { status: 400 })
  } catch (e: any) {
    await logError("payments/toss/confirm", "결제 확정 처리 중 예외", { error: e?.message })
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
