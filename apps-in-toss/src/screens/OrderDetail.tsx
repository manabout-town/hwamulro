import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"

const BACKEND = import.meta.env.VITE_BACKEND_URL ?? "https://takca.vercel.app"
const ORANGE = "#F97316"

interface Bid { id: string; price: number; message: string | null; status: string }
interface OrderInfo { origin: string; destination: string; price: number; status: string }

export default function OrderDetail({ orderId, onBack }: { orderId: string; onBack: () => void }) {
  const [order, setOrder] = useState<OrderInfo | null>(null)
  const [bids, setBids] = useState<Bid[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState("")
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    const { data: o } = await supabase.from("orders").select("origin,destination,price,status").eq("id", orderId).single()
    setOrder(o as OrderInfo | null)
    const { data: b } = await supabase.from("bids").select("id,price,message,status").eq("order_id", orderId).order("price", { ascending: true })
    setBids((b as Bid[]) ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [orderId])

  async function accept(bidId: string) {
    setBusy(true); setMsg("수락 처리 중…")
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setMsg("로그인이 필요해요"); setBusy(false); return }
    const res = await fetch(`${BACKEND}/api/apps-in-toss/bids/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ bidId, orderId }),
    })
    setBusy(false)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setMsg(`수락 실패: ${j.error ?? res.status}`)
      return
    }
    setMsg("수락 완료 ✅ 매칭되었어요")
    await load()
  }

  if (loading) return <main style={{ padding: 24 }}><p style={{ color: "#9CA3AF" }}>불러오는 중…</p></main>

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: 24, fontFamily: "-apple-system, sans-serif" }}>
      <button onClick={onBack} style={{ background: "none", border: 0, color: "#6B7280", fontSize: 15, marginBottom: 12, cursor: "pointer" }}>← 뒤로</button>
      {order && (
        <>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111827" }}>{order.origin} → {order.destination}</h2>
          <div style={{ color: "#6B7280", marginTop: 6 }}>희망가 {order.price.toLocaleString()}원 · {order.status === "pending" ? "입찰 대기" : order.status === "matched" ? "매칭됨" : order.status}</div>
        </>
      )}
      <h3 style={{ fontSize: 17, fontWeight: 800, color: "#111827", margin: "22px 0 10px" }}>받은 입찰 {bids.length}건</h3>
      {bids.length === 0 && <p style={{ color: "#9CA3AF" }}>아직 받은 입찰이 없어요</p>}
      {bids.map((b) => (
        <div key={b.id} style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 16, padding: 16, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 19, fontWeight: 800, color: ORANGE }}>{b.price.toLocaleString()}원</span>
            {b.status === "accepted" && <span style={{ color: "#12B589", fontWeight: 800, fontSize: 14 }}>수락됨</span>}
            {b.status === "rejected" && <span style={{ color: "#9CA3AF", fontSize: 14 }}>마감</span>}
            {b.status === "pending" && order?.status === "pending" && (
              <button onClick={() => accept(b.id)} disabled={busy}
                style={{ background: ORANGE, color: "#fff", border: 0, borderRadius: 10, padding: "10px 18px", fontSize: 15, fontWeight: 800, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
                수락
              </button>
            )}
          </div>
          {b.message && <div style={{ color: "#6B7280", fontSize: 14, marginTop: 8 }}>{b.message}</div>}
        </div>
      ))}
      <div style={{ color: "#9CA3AF", fontSize: 14, minHeight: 20, marginTop: 12, textAlign: "center" }}>{msg}</div>
    </main>
  )
}
