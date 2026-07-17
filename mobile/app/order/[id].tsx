import { useCallback, useEffect, useState } from "react"
import { View, Text, Pressable, FlatList, ActivityIndicator } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { router, useLocalSearchParams } from "expo-router"
import { supabase, API_BASE } from "../../lib/supabase"

const ORANGE = "#F97316"

interface Bid { id: string; price: number; message: string | null; status: string }
interface OrderInfo { origin: string; destination: string; price: number; status: string }

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [order, setOrder] = useState<OrderInfo | null>(null)
  const [bids, setBids] = useState<Bid[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState("")
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const { data: o } = await supabase.from("orders").select("origin,destination,price,status").eq("id", id).single()
    setOrder(o as OrderInfo | null)
    const { data: b } = await supabase.from("bids").select("id,price,message,status").eq("order_id", id).order("price", { ascending: true })
    setBids((b as Bid[]) ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  async function accept(bidId: string) {
    setBusy(true); setMsg("수락 처리 중…")
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setMsg("로그인이 필요해요"); setBusy(false); return }
    const res = await fetch(`${API_BASE}/api/apps-in-toss/bids/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ bidId, orderId: id }),
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

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <FlatList
        data={bids}
        keyExtractor={(b) => b.id}
        contentContainerStyle={s.wrap}
        ListHeaderComponent={
          <>
            <Pressable onPress={() => router.back()}>
              <Text style={s.back}>← 뒤로</Text>
            </Pressable>
            {loading && <ActivityIndicator color={ORANGE} style={{ marginTop: 20 }} />}
            {!loading && order && (
              <>
                <Text style={s.title}>{order.origin} → {order.destination}</Text>
                <Text style={s.sub}>
                  희망가 {order.price.toLocaleString()}원 · {order.status === "pending" ? "입찰 대기" : order.status === "matched" ? "매칭됨" : order.status}
                </Text>
                {order.status === "matched" && (
                  <Pressable onPress={() => router.push(`/match/${id}`)} style={s.matchBtn}>
                    <Text style={s.matchBtnText}>매칭 상세 · 채팅 열기</Text>
                  </Pressable>
                )}
              </>
            )}
            {!loading && <Text style={s.section}>받은 입찰 {bids.length}건</Text>}
            {!loading && bids.length === 0 && <Text style={s.empty}>아직 받은 입찰이 없어요</Text>}
          </>
        }
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.cardRow}>
              <Text style={s.price}>{item.price.toLocaleString()}원</Text>
              {item.status === "accepted" && <Text style={s.accepted}>수락됨</Text>}
              {item.status === "rejected" && <Text style={s.rejected}>마감</Text>}
              {item.status === "pending" && order?.status === "pending" && (
                <Pressable style={[s.acceptBtn, busy && s.acceptBtnDisabled]} onPress={() => accept(item.id)} disabled={busy}>
                  <Text style={s.acceptBtnText}>수락</Text>
                </Pressable>
              )}
            </View>
            {!!item.message && <Text style={s.msgText}>{item.message}</Text>}
          </View>
        )}
        ListFooterComponent={!!msg ? <Text style={s.footerMsg}>{msg}</Text> : null}
      />
    </SafeAreaView>
  )
}

const s = {
  safe: { flex: 1, backgroundColor: "#fff" },
  wrap: { padding: 24 },
  back: { color: "#6B7280", fontSize: 15, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: "800" as const, color: "#111827" },
  sub: { color: "#6B7280", marginTop: 6, marginBottom: 8, fontSize: 15 },
  matchBtn: { backgroundColor: ORANGE, borderRadius: 12, padding: 14, marginTop: 12 },
  matchBtnText: { color: "#fff", fontWeight: "800" as const, textAlign: "center" as const, fontSize: 15 },
  section: { fontSize: 17, fontWeight: "800" as const, color: "#111827", marginTop: 22, marginBottom: 10 },
  empty: { color: "#9CA3AF" },
  card: { backgroundColor: "#fff", borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 16, padding: 16, marginBottom: 10 },
  cardRow: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const },
  price: { fontSize: 19, fontWeight: "800" as const, color: ORANGE },
  accepted: { color: "#12B589", fontWeight: "800" as const, fontSize: 14 },
  rejected: { color: "#9CA3AF", fontSize: 14 },
  acceptBtn: { backgroundColor: ORANGE, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  acceptBtnDisabled: { opacity: 0.6 },
  acceptBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" as const },
  msgText: { color: "#6B7280", fontSize: 14, marginTop: 8 },
  footerMsg: { color: "#9CA3AF", fontSize: 14, minHeight: 20, marginTop: 12, textAlign: "center" as const },
}
