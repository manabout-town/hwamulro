import { useState } from "react"
import { supabase } from "../lib/supabase"

const ORANGE = "#F97316"
const label: React.CSSProperties = { fontSize: 14, color: "#6B7280", fontWeight: 600, marginBottom: 6 }
const input: React.CSSProperties = {
  width: "100%", border: "1.5px solid #E5E7EB", borderRadius: 12,
  padding: "14px 14px", fontSize: 16, marginBottom: 14, background: "#fff",
}

export default function OrderNew({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  const [origin, setOrigin] = useState("")
  const [destination, setDestination] = useState("")
  const [vehicleNotes, setVehicleNotes] = useState("")
  const [vehicleCount, setVehicleCount] = useState(1)
  const [price, setPrice] = useState("")
  const [pickupAt, setPickupAt] = useState("")
  const [isUrgent, setIsUrgent] = useState(false)
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!origin || !destination || !price || !pickupAt) {
      setStatus("출발지·도착지·금액·픽업일시는 필수예요")
      return
    }
    const priceNum = parseInt(price, 10)
    if (Number.isNaN(priceNum) || priceNum < 0) {
      setStatus("금액을 올바르게 입력하세요")
      return
    }
    setBusy(true)
    setStatus("등록 중…")
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setStatus("로그인이 필요해요"); setBusy(false); return }
    const { error } = await supabase.from("orders").insert({
      shipper_id: user.id,
      origin,
      destination,
      vehicle_count: vehicleCount,
      vehicle_notes: vehicleNotes || null,
      price: priceNum,
      pickup_at: new Date(pickupAt).toISOString(),
      is_urgent: isUrgent,
      urgent_fee: isUrgent ? 1000 : 0,
      status: "pending",
    })
    setBusy(false)
    if (error) { setStatus(`오류: ${error.message}`); return }
    onDone()
  }

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: 24,
      fontFamily: "-apple-system, 'Apple SD Gothic Neo', sans-serif" }}>
      <button onClick={onBack} style={{ background: "none", border: 0, color: "#6B7280", fontSize: 15, marginBottom: 12, cursor: "pointer" }}>← 뒤로</button>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: "#111827", marginBottom: 20 }}>탁송 주문 등록</h2>

      <div style={label}>출발지</div>
      <input style={input} value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="예: 서울 강남구 삼성동" />
      <div style={label}>도착지</div>
      <input style={input} value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="예: 부산 해운대구 우동" />
      <div style={label}>차량 대수</div>
      <input style={input} type="number" min={1} value={vehicleCount} onChange={(e) => setVehicleCount(parseInt(e.target.value, 10) || 1)} />
      <div style={label}>차종·메모 (선택)</div>
      <input style={input} value={vehicleNotes} onChange={(e) => setVehicleNotes(e.target.value)} placeholder="예: 제네시스 G80 승용" />
      <div style={label}>희망 금액 (원)</div>
      <input style={input} type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="예: 280000" />
      <div style={label}>픽업 일시</div>
      <input style={input} type="datetime-local" value={pickupAt} onChange={(e) => setPickupAt(e.target.value)} />

      <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0 20px", color: "#374151", fontSize: 15 }}>
        <input type="checkbox" checked={isUrgent} onChange={(e) => setIsUrgent(e.target.checked)} />
        긴급 탁송 (수수료 +1,000원)
      </label>

      <button onClick={submit} disabled={busy}
        style={{ width: "100%", background: ORANGE, color: "#fff", border: 0, borderRadius: 14,
          padding: 18, fontSize: 18, fontWeight: 800, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}>
        주문 등록하기
      </button>
      <div style={{ color: "#9CA3AF", fontSize: 14, minHeight: 20, marginTop: 12, textAlign: "center" }}>{status}</div>
    </main>
  )
}
