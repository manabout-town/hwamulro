import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "../lib/supabase"

const ORANGE = "#F97316"

interface Msg { id: string; sender_id: string; message: string; sent_at: string }

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export default function MatchDetail({ orderId, onBack }: { orderId: string; onBack: () => void }) {
  const [meId, setMeId] = useState<string | null>(null)
  const [myPhone, setMyPhone] = useState<string | null>(null)
  const [route, setRoute] = useState("")
  const [amount, setAmount] = useState<number | null>(null)
  const [statusKo, setStatusKo] = useState("")
  const [other, setOther] = useState<{ name: string; phone: string | null } | null>(null)
  const [matchId, setMatchId] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState("")
  const [phoneInput, setPhoneInput] = useState("")
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")
  const endRef = useRef<HTMLDivElement>(null)

  const loadChats = useCallback(async (mId: string) => {
    const { data } = await supabase.from("chats")
      .select("id,sender_id,message,sent_at").eq("match_id", mId).order("sent_at", { ascending: true })
    setMsgs((data as Msg[]) ?? [])
  }, [])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setErr("로그인이 필요해요"); setLoading(false); return }
      setMeId(user.id)

      const { data: order } = await supabase.from("orders")
        .select("origin,destination,shipper_id,status,price").eq("id", orderId).single()
      const { data: match } = await supabase.from("matches")
        .select("id,driver_id,status").eq("order_id", orderId).maybeSingle()
      if (!order || !match) { setErr("매칭 정보를 찾을 수 없어요"); setLoading(false); return }

      setRoute(`${order.origin} → ${order.destination}`)
      setMatchId(match.id)
      const st = order.status
      setStatusKo(st === "matched" ? "매칭됨" : st === "in_progress" ? "진행중" : st === "completed" ? "완료" : st)

      const { data: bid } = await supabase.from("bids")
        .select("price").eq("order_id", orderId).eq("status", "accepted").maybeSingle()
      setAmount(bid?.price ?? order.price ?? null)

      const otherId = user.id === match.driver_id ? order.shipper_id : match.driver_id
      const { data: ou } = await supabase.from("users").select("name,phone").eq("id", otherId).single()
      setOther(ou as { name: string; phone: string | null } ?? null)

      const { data: mu } = await supabase.from("users").select("phone").eq("id", user.id).single()
      setMyPhone(mu?.phone ?? null)

      await loadChats(match.id)
      setLoading(false)
    })()
  }, [orderId, loadChats])

  // 채팅 폴링(realtime publication 의존 회피)
  useEffect(() => {
    if (!matchId) return
    const t = setInterval(() => loadChats(matchId), 4000)
    return () => clearInterval(t)
  }, [matchId, loadChats])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }) }, [msgs])

  async function send() {
    const text = input.trim()
    if (!text || !matchId || !meId) return
    setInput("")
    const { error } = await supabase.from("chats").insert({ match_id: matchId, sender_id: meId, message: text })
    if (error) { setErr(`전송 실패: ${error.message}`); return }
    await loadChats(matchId)
  }

  async function savePhone() {
    const p = phoneInput.trim()
    if (!p || !meId) return
    const { error } = await supabase.from("users").update({ phone: p }).eq("id", meId)
    if (error) { setErr(`저장 실패: ${error.message}`); return }
    setMyPhone(p); setPhoneInput("")
  }

  if (loading) return <main style={{ padding: 24 }}><p style={{ color: "#9CA3AF" }}>불러오는 중…</p></main>

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: 24, fontFamily: "-apple-system, 'Apple SD Gothic Neo', sans-serif" }}>
      <button onClick={onBack} style={{ background: "none", border: 0, color: "#6B7280", fontSize: 15, marginBottom: 12, cursor: "pointer" }}>← 뒤로</button>

      <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111827" }}>{route}</h2>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
        {amount != null && <span style={{ fontSize: 20, fontWeight: 800, color: ORANGE }}>{amount.toLocaleString()}원</span>}
        <span style={{ fontSize: 13, fontWeight: 700, color: "#12B589", background: "#E7F8F1", padding: "4px 10px", borderRadius: 8 }}>{statusKo}</span>
      </div>

      {err && <div style={{ color: "#DC2626", fontSize: 14, marginTop: 10 }}>{err}</div>}

      {/* 상대 연락처 */}
      {other && (
        <div style={{ background: "#fff", border: "1.5px solid #E5E7EB", borderRadius: 16, padding: 16, marginTop: 18 }}>
          <div style={{ fontSize: 13, color: "#9CA3AF", fontWeight: 700, marginBottom: 6 }}>상대방</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#111827" }}>{other.name}</div>
          {other.phone ? (
            <a href={`tel:${other.phone}`}
              style={{ display: "inline-block", marginTop: 10, background: ORANGE, color: "#fff",
                borderRadius: 10, padding: "10px 18px", fontSize: 15, fontWeight: 800, textDecoration: "none" }}>
              📞 {other.phone}
            </a>
          ) : (
            <div style={{ color: "#9CA3AF", fontSize: 14, marginTop: 8 }}>상대가 아직 연락처를 등록하지 않았어요. 채팅으로 연락해 보세요.</div>
          )}
        </div>
      )}

      {/* 내 연락처 미등록 안내 */}
      {!myPhone && (
        <div style={{ background: "#FFF7ED", border: "1.5px solid #FED7AA", borderRadius: 16, padding: 16, marginTop: 12 }}>
          <div style={{ fontSize: 14, color: "#9A3412", fontWeight: 700, marginBottom: 8 }}>내 연락처를 등록하면 상대가 전화할 수 있어요</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} type="tel" placeholder="010-0000-0000"
              style={{ flex: 1, border: "1.5px solid #E5E7EB", borderRadius: 10, padding: 12, fontSize: 15 }} />
            <button onClick={savePhone}
              style={{ background: ORANGE, color: "#fff", border: 0, borderRadius: 10, padding: "0 18px", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>등록</button>
          </div>
        </div>
      )}

      {/* 채팅 */}
      <h3 style={{ fontSize: 17, fontWeight: 800, color: "#111827", margin: "22px 0 10px" }}>채팅</h3>
      <div style={{ background: "#F9FAFB", border: "1px solid #F0F1F3", borderRadius: 16, padding: 14, minHeight: 200, maxHeight: 360, overflowY: "auto" }}>
        {msgs.length === 0 && <p style={{ color: "#9CA3AF", textAlign: "center", marginTop: 60 }}>첫 메시지를 보내보세요</p>}
        {msgs.map((m) => {
          const mine = m.sender_id === meId
          return (
            <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 8 }}>
              <div style={{ maxWidth: "75%" }}>
                <div style={{ background: mine ? ORANGE : "#fff", color: mine ? "#fff" : "#111827",
                  border: mine ? "0" : "1px solid #E5E7EB", borderRadius: 14, padding: "10px 14px", fontSize: 15, lineHeight: 1.4, wordBreak: "break-word" }}>
                  {m.message}
                </div>
                <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 3, textAlign: mine ? "right" : "left" }}>{fmtTime(m.sent_at)}</div>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send() }} placeholder="메시지 입력"
          style={{ flex: 1, border: "1.5px solid #E5E7EB", borderRadius: 12, padding: 14, fontSize: 15 }} />
        <button onClick={send}
          style={{ background: ORANGE, color: "#fff", border: 0, borderRadius: 12, padding: "0 22px", fontSize: 16, fontWeight: 800, cursor: "pointer" }}>전송</button>
      </div>
    </main>
  )
}
