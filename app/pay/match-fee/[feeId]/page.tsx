"use client"
import { useEffect, useRef, useState } from "react"
import { useParams, useSearchParams } from "next/navigation"

declare const TossPayments: any

export default function MatchFeePayPage() {
  const { feeId } = useParams<{ feeId: string }>()
  const sp = useSearchParams()
  const orderId = sp.get("orderId") ?? ""
  const amount = Number(sp.get("amount") ?? "0")
  const [ready, setReady] = useState(false)
  const [err, setErr] = useState("")
  const started = useRef(false)

  useEffect(() => {
    if (document.getElementById("toss-sdk")) { setReady(true); return }
    const s = document.createElement("script")
    s.id = "toss-sdk"; s.src = "https://js.tosspayments.com/v1/payment"
    s.onload = () => setReady(true)
    document.head.appendChild(s)
  }, [])

  async function pay() {
    if (started.current || !orderId || !amount) return
    started.current = true
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://takca.vercel.app"
      const toss = TossPayments(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY)
      await toss.requestPayment("카드", {
        amount,
        orderId,
        orderName: "탁카 매칭 이용료",
        successUrl: `${appUrl}/pay/match-fee/return`,
        failUrl: `${appUrl}/pay/match-fee/return`,
      })
    } catch (e: any) {
      started.current = false
      if (e?.code !== "USER_CANCEL") setErr(e?.message || "결제 오류가 발생했습니다")
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: 24, fontFamily: "-apple-system, sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800 }}>매칭 이용료 결제</h1>
      <p style={{ color: "#6B7280", marginTop: 8 }}>{amount.toLocaleString()}원 · 결제하면 연락처와 채팅이 열립니다.</p>
      {err && <p style={{ color: "#DC2626", marginTop: 8 }}>{err}</p>}
      <button onClick={pay} disabled={!ready || !orderId || !amount}
        style={{ width: "100%", marginTop: 20, background: "#F97316", color: "#fff", border: 0, borderRadius: 12, padding: 16, fontSize: 16, fontWeight: 800 }}>
        {amount.toLocaleString()}원 결제하기
      </button>
    </div>
  )
}
