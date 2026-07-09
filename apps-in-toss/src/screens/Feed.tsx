import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"

const ORANGE = "#F97316"

interface Order {
  id: string
  origin: string
  destination: string
  price: number
  pickup_at: string
  vehicle_count: number
  vehicle_notes: string | null
  is_urgent: boolean
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export default function Feed({ onBack }: { onBack: () => void }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [bidPrice, setBidPrice] = useState("")
  const [bidMsg, setBidMsg] = useState("")
  const [msg, setMsg] = useState("")

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from("orders")
      .select("id,origin,destination,price,pickup_at,vehicle_count,vehicle_notes,is_urgent")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
    if (error) setMsg(`불러오기 실패: ${error.message}`)
    setOrders((data as Order[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openBid(id: string) {
    setOpenId(id); setBidPrice(""); setBidMsg(""); setMsg("")
  }

  async function submitBid(orderId: string) {
    const p = parseInt(bidPrice, 10)
    if (Number.isNaN(p) || p < 1000) { setMsg("입찰가는 1,000원 이상이어야 해요"); return }
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setMsg("로그인이 필요해요"); return }
    const { error } = await supabase.from("bids").insert({
      order_id: orderId,
      driver_id: user.id,
      price: p,
      message: bidMsg || null,
    })
    if (error) {
      setMsg(error.code === "23505" ? "이미 입찰한 주문이에요" : `오류: ${error.message}`)
      return
    }
    setMsg("입찰 완료 ✅"); setOpenId(null)
  }

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: 24,
      fontFamily: "-apple-system, 'Apple SD Gothic Neo', sans-serif" }}>
      <button onClick={onBack} style={{ background: "none", border: 0, color: "#6B7280", fontSize: 15, marginBottom: 12, cursor: "pointer" }}>← 뒤로</button>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: "#111827", marginBottom: 16 }}>탁송 의뢰 찾기</h2>

      {loading && <p style={{ color: "#9CA3AF" }}>불러오는 중…</p>}
      {!loading && orders.length === 0 && (
        <p style={{ color: "#9CA3AF", textAlign: "center", marginTop: 40 }}>지금은 대기 중인 의뢰가 없어요</p>
      )}

      {orders.map((o) => (
        <div key={o.id} style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 16, padding: 18, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#111827" }}>{o.origin} → {o.destination}</div>
            {o.is_urgent && <span style={{ background: "#FEE2E2", color: "#DC2626", fontSize: 12, fontWeight: 800, padding: "4px 8px", borderRadius: 6 }}>긴급</span>}
          </div>
          <div style={{ color: "#6B7280", fontSize: 14, marginTop: 6 }}>
            {fmtDate(o.pickup_at)} · 차량 {o.vehicle_count}대{o.vehicle_notes ? ` · ${o.vehicle_notes}` : ""}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: ORANGE }}>{o.price.toLocaleString()}원</div>
            <button onClick={() => (openId === o.id ? setOpenId(null) : openBid(o.id))}
              style={{ background: "#FFF3E9", color: ORANGE, border: 0, borderRadius: 10, padding: "10px 18px", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
              {openId === o.id ? "닫기" : "입찰하기"}
            </button>
          </div>

          {openId === o.id && (
            <div style={{ marginTop: 14, borderTop: "1px solid #F0F1F3", paddingTop: 14 }}>
              <input value={bidPrice} onChange={(e) => setBidPrice(e.target.value)} type="number" min={1000} placeholder="입찰가 (원)"
                style={{ width: "100%", border: "1.5px solid #E5E7EB", borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 10 }} />
              <input value={bidMsg} onChange={(e) => setBidMsg(e.target.value)} placeholder="메시지 (선택)"
                style={{ width: "100%", border: "1.5px solid #E5E7EB", borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 10 }} />
              <button onClick={() => submitBid(o.id)}
                style={{ width: "100%", background: ORANGE, color: "#fff", border: 0, borderRadius: 12, padding: 14, fontSize: 16, fontWeight: 800, cursor: "pointer" }}>
                입찰 제출
              </button>
            </div>
          )}
        </div>
      ))}

      <div style={{ color: "#9CA3AF", fontSize: 14, minHeight: 20, marginTop: 12, textAlign: "center" }}>{msg}</div>
    </main>
  )
}
