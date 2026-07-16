import { useCallback, useState } from "react"
import { View, Text, TextInput, Pressable, FlatList, ActivityIndicator } from "react-native"
import { useFocusEffect } from "expo-router"
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

export default function Feed() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)
  const [bidPrice, setBidPrice] = useState("")
  const [bidMsg, setBidMsg] = useState("")
  const [msg, setMsg] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from("orders")
      .select("id,origin,destination,price,pickup_at,vehicle_count,vehicle_notes,is_urgent")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
    if (error) setMsg(`불러오기 실패: ${error.message}`)
    setOrders((data as Order[]) ?? [])
    setLoading(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load])
  )

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
    <FlatList
      data={orders}
      keyExtractor={(o) => o.id}
      contentContainerStyle={s.wrap}
      ListHeaderComponent={
        <>
          <Text style={s.title}>탁송 의뢰 찾기</Text>
          {loading && <ActivityIndicator color={ORANGE} style={{ marginTop: 20 }} />}
          {!loading && orders.length === 0 && <Text style={s.empty}>지금은 대기 중인 의뢰가 없어요</Text>}
        </>
      }
      renderItem={({ item }) => (
        <View style={s.card}>
          <View style={s.cardTop}>
            <Text style={s.route}>{item.origin} → {item.destination}</Text>
            {item.is_urgent && <Text style={s.urgentBadge}>긴급</Text>}
          </View>
          <Text style={s.meta}>
            {fmtDate(item.pickup_at)} · 차량 {item.vehicle_count}대{item.vehicle_notes ? ` · ${item.vehicle_notes}` : ""}
          </Text>
          <View style={s.cardBottom}>
            <Text style={s.price}>{item.price.toLocaleString()}원</Text>
            <Pressable style={s.bidBtn} onPress={() => (openId === item.id ? setOpenId(null) : openBid(item.id))}>
              <Text style={s.bidBtnText}>{openId === item.id ? "닫기" : "입찰하기"}</Text>
            </Pressable>
          </View>

          {openId === item.id && (
            <View style={s.bidForm}>
              <TextInput
                style={s.input}
                value={bidPrice}
                onChangeText={setBidPrice}
                keyboardType="number-pad"
                placeholder="입찰가 (원)"
              />
              <TextInput
                style={s.input}
                value={bidMsg}
                onChangeText={setBidMsg}
                placeholder="메시지 (선택)"
              />
              <Pressable style={s.submitBtn} onPress={() => submitBid(item.id)}>
                <Text style={s.submitBtnText}>입찰 제출</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
      ListFooterComponent={!!msg ? <Text style={s.msg}>{msg}</Text> : null}
    />
  )
}

const s = {
  wrap: { padding: 24 },
  title: { fontSize: 24, fontWeight: "800" as const, color: "#111827", marginBottom: 16 },
  empty: { color: "#9CA3AF", textAlign: "center" as const, marginTop: 40 },
  card: { backgroundColor: "#fff", borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 16, padding: 18, marginBottom: 12 },
  cardTop: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const },
  route: { fontSize: 18, fontWeight: "800" as const, color: "#111827" },
  urgentBadge: { backgroundColor: "#FEE2E2", color: "#DC2626", fontSize: 12, fontWeight: "800" as const, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, overflow: "hidden" as const },
  meta: { color: "#6B7280", fontSize: 14, marginTop: 6 },
  cardBottom: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, marginTop: 12 },
  price: { fontSize: 20, fontWeight: "800" as const, color: ORANGE },
  bidBtn: { backgroundColor: "#FFF3E9", borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  bidBtnText: { color: ORANGE, fontSize: 15, fontWeight: "800" as const },
  bidForm: { marginTop: 14, borderTopWidth: 1, borderTopColor: "#F0F1F3", paddingTop: 14 },
  input: { width: "100%" as const, borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 10, color: "#111827" },
  submitBtn: { width: "100%" as const, backgroundColor: ORANGE, borderRadius: 12, padding: 14, alignItems: "center" as const },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" as const },
  msg: { color: "#9CA3AF", fontSize: 14, marginTop: 12, textAlign: "center" as const },
}
