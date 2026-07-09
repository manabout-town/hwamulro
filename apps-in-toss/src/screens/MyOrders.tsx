import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"

const ORANGE = "#F97316"
const STATUS_KO: Record<string, string> = {
  pending: "입찰 대기", matched: "매칭됨", in_progress: "진행중",
  completed: "완료", cancelled: "취소", disputed: "분쟁",
}

interface Order { id: string; origin: string; destination: string; price: number; status: string }

export default function MyOrders({ onBack, onOpen }: { onBack: () => void; onOpen: (id: string) => void }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data } = await supabase.from("orders")
        .select("id,origin,destination,price,status")
        .eq("shipper_id", user.id).order("created_at", { ascending: false })
      setOrders((data as Order[]) ?? [])
      setLoading(false)
    })()
  }, [])

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: 24, fontFamily: "-apple-system, sans-serif" }}>
      <button onClick={onBack} style={{ background: "none", border: 0, color: "#6B7280", fontSize: 15, marginBottom: 12, cursor: "pointer" }}>← 뒤로</button>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: "#111827", marginBottom: 16 }}>내 주문</h2>
      {loading && <p style={{ color: "#9CA3AF" }}>불러오는 중…</p>}
      {!loading && orders.length === 0 && <p style={{ color: "#9CA3AF", textAlign: "center", marginTop: 40 }}>아직 등록한 주문이 없어요</p>}
      {orders.map((o) => (
        <button key={o.id} onClick={() => onOpen(o.id)}
          style={{ display: "block", width: "100%", textAlign: "left", background: "#fff",
            border: "1.5px solid #E5E7EB", borderRadius: 16, padding: 18, marginBottom: 12, cursor: "pointer" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 17, fontWeight: 800, color: "#111827" }}>{o.origin} → {o.destination}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: ORANGE, background: "#FFF3E9", padding: "4px 10px", borderRadius: 8 }}>{STATUS_KO[o.status] ?? o.status}</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: ORANGE, marginTop: 8 }}>{o.price.toLocaleString()}원</div>
        </button>
      ))}
    </main>
  )
}
