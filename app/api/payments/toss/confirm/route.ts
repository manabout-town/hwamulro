import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { createClient } from "@/lib/supabase/server"
import { calculateFee } from "@/lib/utils/format"

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
        return NextResponse.json({ error: err.message }, { status: 400 })
      }

      const { platformFee, driverPayout } = calculateFee(amount)

      await service.from("escrow").insert({
        order_id: dbOrderId,
        match_id: activeMatch.id,
        total_amount: amount,
        platform_fee: platformFee,
        driver_payout: driverPayout,
        status: "held",
        pg_transaction_id: paymentKey,
        held_at: new Date().toISOString(),
      })
      await service.from("orders").update({ status: "in_progress" }).eq("id", dbOrderId)
      await service.from("matches").update({ status: "in_progress" }).eq("id", activeMatch.id)

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
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
