import { useCallback, useEffect, useRef, useState } from "react"
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Linking, Modal } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { WebView } from "react-native-webview"
import { router, useLocalSearchParams } from "expo-router"
import { supabase, API_BASE } from "../../lib/supabase"

const ORANGE = "#F97316"
interface Msg { id: string; sender_id: string; message: string; sent_at: string }
interface Fee { id: string; status: string; amount: number; expires_at: string }

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export default function MatchDetail() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>()
  const [meId, setMeId] = useState<string | null>(null)
  const [route, setRoute] = useState("")
  const [amount, setAmount] = useState<number | null>(null)
  const [statusKo, setStatusKo] = useState("")
  const [orderStatus, setOrderStatus] = useState("")
  const [other, setOther] = useState<{ name: string; phone: string | null } | null>(null)
  const [matchId, setMatchId] = useState<string | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")
  const [fee, setFee] = useState<Fee | null>(null)
  const [iAmDriver, setIAmDriver] = useState(false)
  const [payMsg, setPayMsg] = useState("")
  const [paying, setPaying] = useState(false)
  const [payUrl, setPayUrl] = useState<string | null>(null)
  const handledReturn = useRef(false)

  const loadChats = useCallback(async (mId: string) => {
    const { data } = await supabase.from("chats").select("id,sender_id,message,sent_at").eq("match_id", mId).order("sent_at", { ascending: true })
    setMsgs((data as Msg[]) ?? [])
  }, [])

  const fetchContact = useCallback(async (mId: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch(`${API_BASE}/api/apps-in-toss/match-contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ matchId: mId }),
    })
    if (!res.ok) return
    const data = await res.json().catch(() => null)
    if (data && typeof data.name === "string") setOther({ name: data.name, phone: data.phone ?? null })
  }, [])

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setErr("로그인이 필요해요"); setLoading(false); return }
      setMeId(user.id)
      const { data: order } = await supabase.from("orders").select("origin,destination,status,price").eq("id", orderId).single()
      const { data: match } = await supabase.from("matches").select("id,driver_id,status").eq("order_id", orderId).maybeSingle()
      if (!order || !match) { setErr("매칭 정보를 찾을 수 없어요"); setLoading(false); return }
      setRoute(`${order.origin} → ${order.destination}`)
      setMatchId(match.id)
      setOrderStatus(order.status)
      setStatusKo(order.status === "matched" ? "매칭됨" : order.status === "in_progress" ? "진행중" : order.status === "completed" ? "완료" : order.status)
      const { data: feeRow } = await supabase.from("match_fees").select("id,status,amount,expires_at").eq("match_id", match.id).maybeSingle()
      setFee((feeRow as Fee | null) ?? null)
      const { data: bid } = await supabase.from("bids").select("price").eq("order_id", orderId).eq("status", "accepted").maybeSingle()
      setAmount(bid?.price ?? order.price ?? null)
      setIAmDriver(user.id === match.driver_id)
      await loadChats(match.id)
      const feeStatus = (feeRow as Fee | null)?.status
      if (!feeRow || feeStatus === "paid") await fetchContact(match.id)
      setLoading(false)
    })()
  }, [orderId, loadChats, fetchContact])

  useEffect(() => {
    if (!matchId) return
    const t = setInterval(() => loadChats(matchId), 4000)
    return () => clearInterval(t)
  }, [matchId, loadChats])

  async function send() {
    const text = input.trim()
    if (!text || !matchId || !meId) return
    setInput("")
    const { error } = await supabase.from("chats").insert({ match_id: matchId, sender_id: meId, message: text })
    if (error) { setErr(`전송 실패: ${error.message}`); return }
    await loadChats(matchId)
  }

  async function startPay() {
    if (!fee) return
    setPaying(true); setPayMsg("결제 준비 중…"); handledReturn.current = false
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setPayMsg("로그인이 필요해요"); setPaying(false); return }
    const res = await fetch(`${API_BASE}/api/apps-in-toss/match-fee/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ feeId: fee.id }),
    })
    if (!res.ok) { const j = await res.json().catch(() => ({})); setPayMsg(`결제 생성 실패: ${j.error ?? res.status}`); setPaying(false); return }
    const { orderNo, amount: amt } = await res.json()
    setPayUrl(`${API_BASE}/pay/match-fee/${fee.id}?orderId=${encodeURIComponent(orderNo)}&amount=${amt}`)
  }

  async function onNav(navState: { url: string }) {
    if (handledReturn.current) return
    if (!navState.url.includes("/pay/match-fee/return")) return
    handledReturn.current = true
    setPayUrl(null)
    const q = new URLSearchParams(navState.url.split("?")[1] ?? "")
    const paymentKey = q.get("paymentKey")
    if (!paymentKey) { setPayMsg(`결제 취소: ${q.get("message") ?? ""}`); setPaying(false); return }
    setPayMsg("결제 승인 중…")
    const { data: { session } } = await supabase.auth.getSession()
    if (!session || !fee) { setPaying(false); return }
    const res = await fetch(`${API_BASE}/api/apps-in-toss/match-fee/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ feeId: fee.id, paymentKey }),
    })
    if (!res.ok) { const j = await res.json().catch(() => ({})); setPayMsg(`결제 승인 실패: ${j.error ?? res.status}`); setPaying(false); return }
    setPayMsg("결제 완료 ✅ 연락처가 열렸어요")
    setFee({ ...fee, status: "paid" })
    if (matchId) await fetchContact(matchId)
    setPaying(false)
  }

  const isPaid = fee?.status === "paid"
  const unlocked = isPaid || fee === null

  if (loading) return <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}><ActivityIndicator color={ORANGE} style={{ marginTop: 40 }} /></SafeAreaView>

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <Pressable onPress={() => router.back()}><Text style={{ color: "#6B7280", fontSize: 15, marginBottom: 12 }}>← 뒤로</Text></Pressable>
        <Text style={{ fontSize: 22, fontWeight: "800", color: "#111827" }}>{route}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 }}>
          {amount != null && <Text style={{ fontSize: 20, fontWeight: "800", color: ORANGE }}>{amount.toLocaleString()}원</Text>}
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#12B589", backgroundColor: "#E7F8F1", paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8 }}>{statusKo}</Text>
        </View>
        {!!err && <Text style={{ color: "#DC2626", fontSize: 14, marginTop: 10 }}>{err}</Text>}

        {orderStatus === "completed" && matchId && (
          <Pressable
            onPress={() => router.push(`/review/${matchId}`)}
            style={{ backgroundColor: ORANGE, borderRadius: 12, padding: 16, marginTop: 18 }}
          >
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "800", textAlign: "center" }}>리뷰 작성하기</Text>
          </Pressable>
        )}

        {fee && !isPaid && (
          <View style={{ backgroundColor: "#FFF7ED", borderWidth: 1.5, borderColor: "#FED7AA", borderRadius: 16, padding: 18, marginTop: 18 }}>
            {iAmDriver ? (
              <>
                <Text style={{ fontSize: 15, fontWeight: "800", color: "#9A3412" }}>매칭 성사! 이용료를 결제하면 화주 연락처와 채팅이 열려요</Text>
                <Text style={{ color: "#6B7280", fontSize: 14, marginVertical: 8 }}>매칭 이용료 {(fee.amount).toLocaleString()}원 · 미결제 시 24시간 후 매칭이 자동 취소돼요</Text>
                <Pressable onPress={startPay} disabled={paying} style={{ backgroundColor: ORANGE, borderRadius: 12, padding: 16, opacity: paying ? 0.6 : 1 }}>
                  <Text style={{ color: "#fff", fontSize: 16, fontWeight: "800", textAlign: "center" }}>{fee.amount.toLocaleString()}원 결제하고 연락처 받기</Text>
                </Pressable>
                <Text style={{ color: "#9CA3AF", fontSize: 13, marginTop: 8, textAlign: "center" }}>{payMsg}</Text>
              </>
            ) : <Text style={{ fontSize: 15, fontWeight: "700", color: "#9A3412" }}>기사님이 매칭을 확정하면 연락처가 열려요</Text>}
          </View>
        )}

        {other && (
          <View style={{ backgroundColor: "#fff", borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 16, padding: 16, marginTop: 18 }}>
            <Text style={{ fontSize: 13, color: "#9CA3AF", fontWeight: "700", marginBottom: 6 }}>상대방</Text>
            <Text style={{ fontSize: 17, fontWeight: "800", color: "#111827" }}>{other.name}</Text>
            {other.phone ? (
              <Pressable onPress={() => Linking.openURL(`tel:${other.phone}`)} style={{ marginTop: 10, alignSelf: "flex-start", backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 18 }}>
                <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800" }}>📞 {other.phone}</Text>
              </Pressable>
            ) : <Text style={{ color: "#9CA3AF", fontSize: 14, marginTop: 8 }}>상대가 아직 연락처를 등록하지 않았어요. 채팅으로 연락해 보세요.</Text>}
          </View>
        )}

        {unlocked && (
          <>
            <Text style={{ fontSize: 17, fontWeight: "800", color: "#111827", marginTop: 22, marginBottom: 10 }}>채팅</Text>
            <View style={{ backgroundColor: "#F9FAFB", borderWidth: 1, borderColor: "#F0F1F3", borderRadius: 16, padding: 14, minHeight: 200 }}>
              {msgs.length === 0 && <Text style={{ color: "#9CA3AF", textAlign: "center", marginTop: 60 }}>첫 메시지를 보내보세요</Text>}
              {msgs.map((m) => {
                const mine = m.sender_id === meId
                return (
                  <View key={m.id} style={{ alignItems: mine ? "flex-end" : "flex-start", marginBottom: 8 }}>
                    <View style={{ maxWidth: "75%", backgroundColor: mine ? ORANGE : "#fff", borderWidth: mine ? 0 : 1, borderColor: "#E5E7EB", borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 }}>
                      <Text style={{ color: mine ? "#fff" : "#111827", fontSize: 15 }}>{m.message}</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: "#9CA3AF", marginTop: 3 }}>{fmtTime(m.sent_at)}</Text>
                  </View>
                )
              })}
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
              <TextInput value={input} onChangeText={setInput} placeholder="메시지 입력" style={{ flex: 1, borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12, padding: 14, fontSize: 15 }} />
              <Pressable onPress={send} style={{ backgroundColor: ORANGE, borderRadius: 12, justifyContent: "center", paddingHorizontal: 22 }}><Text style={{ color: "#fff", fontSize: 16, fontWeight: "800" }}>전송</Text></Pressable>
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={!!payUrl} animationType="slide" onRequestClose={() => { setPayUrl(null); setPaying(false) }}>
        <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
          <Pressable onPress={() => { setPayUrl(null); setPaying(false); setPayMsg("결제를 취소했어요") }} style={{ padding: 16 }}><Text style={{ color: "#6B7280", fontSize: 15 }}>✕ 닫기</Text></Pressable>
          {payUrl && <WebView source={{ uri: payUrl }} onNavigationStateChange={onNav} />}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}
