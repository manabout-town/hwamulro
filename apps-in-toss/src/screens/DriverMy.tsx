import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"

const ORANGE = "#F97316"
const BID_KO: Record<string, string> = { pending: "입찰 대기", accepted: "수락됨", rejected: "마감" }

interface OrderRef { origin: string; destination: string; pickup_at: string; status: string }
interface BidRow { id: string; price: number; status: string; order_id: string; orders: OrderRef | OrderRef[] | null }

function one(o: OrderRef | OrderRef[] | null): OrderRef | null {
  if (!o) return null
  return Array.isArray(o) ? (o[0] ?? null) : o
}
function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export default function DriverMy({ onBack, onOpenMatch }: { onBack: () => void; onOpenMatch: (orderId: string) => void }) {
  const [rows, setRows] = useState<BidRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data } = await supabase.from("bids")
        .select("id,price,status,order_id,orders(origin,destination,pickup_at,status)")
        .eq("driver_id", user.id).order("created_at", { ascending: false })
      setRows((data as BidRow[]) ?? [])
      setLoading(false)
    })()
  }, [])

  const matched = rows.filter((r) => r.status === "accepted")
  const expected = matched.reduce((s, r) => s + r.price, 0)

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: 24, fontFamily: "-apple-system, 'Apple SD Gothic Neo', sans-serif" }}>
      <button onClick={onBack} style={{ background: "none", border: 0, color: "#6B7280", fontSize: 15, marginBottom: 12, cursor: "pointer" }}>← 뒤로</button>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: "#111827", marginBottom: 14 }}>내 입찰 · 매칭</h2>

      <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
        <div style={{ flex: 1, background: "#FFF3E9", borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 13, color: "#9A3412", fontWeight: 700 }}>매칭</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: ORANGE, marginTop: 2 }}>{matched.length}건</div>
        </div>
        <div style={{ flex: 1, background: "#FFF3E9", borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 13, color: "#9A3412", fontWeight: 700 }}>예상 수익</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: ORANGE, marginTop: 2 }}>{expected.toLocaleString()}원</div>
        </div>
      </div>

      {loading && <p style={{ color: "#9CA3AF" }}>불러오는 중…</p>}
      {!loading && rows.length === 0 && <p style={{ color: "#9CA3AF", textAlign: "center", marginTop: 40 }}>아직 입찰한 의뢰가 없어요</p>}

      {rows.map((r) => {
        const o = one(r.orders)
        const isMatched = r.status === "accepted"
        return (
          <button key={r.id} onClick={() => isMatched && onOpenMatch(r.order_id)} disabled={!isMatched}
            style={{ display: "block", width: "100%", textAlign: "left", background: "#fff",
              border: isMatched ? `1.5px solid ${ORANGE}` : "1.5px solid #E5E7EB", borderRadius: 16, padding: 18, marginBottom: 12,
              cursor: isMatched ? "pointer" : "default" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 17, fontWeight: 800, color: "#111827" }}>{o ? `${o.origin} → ${o.destination}` : "주문"}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: isMatched ? "#12B589" : "#6B7280",
                background: isMatched ? "#E7F8F1" : "#F3F4F6", padding: "4px 10px", borderRadius: 8 }}>{BID_KO[r.status] ?? r.status}</span>
            </div>
            {o && <div style={{ color: "#6B7280", fontSize: 14, marginTop: 6 }}>{fmtDate(o.pickup_at)}</div>}
            <div style={{ fontSize: 18, fontWeight: 800, color: ORANGE, marginTop: 8 }}>내 입찰 {r.price.toLocaleString()}원</div>
            {isMatched && <div style={{ color: ORANGE, fontSize: 14, fontWeight: 700, marginTop: 6 }}>연락처 · 채팅 보기 →</div>}
          </button>
        )
      })}
    </main>
  )
}
