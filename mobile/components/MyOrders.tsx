import { useCallback, useState } from "react"
import { View, Text, Pressable, FlatList, ActivityIndicator } from "react-native"
import { router } from "expo-router"
import { useFocusEffect } from "expo-router"
import { supabase } from "../lib/supabase"

const ORANGE = "#F97316"
const STATUS_KO: Record<string, string> = {
  pending: "입찰 대기", matched: "매칭됨", in_progress: "진행중",
  completed: "완료", cancelled: "취소", disputed: "분쟁",
}

interface Order { id: string; origin: string; destination: string; price: number; status: string }

const ACTIVE = ["matched", "in_progress"]

export default function MyOrders() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    const { data } = await supabase.from("orders")
      .select("id,origin,destination,price,status")
      .eq("shipper_id", user.id).order("created_at", { ascending: false })
    setOrders((data as Order[]) ?? [])
    setLoading(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load])
  )

  const inProgress = orders.filter((o) => ACTIVE.includes(o.status)).length
  const done = orders.filter((o) => o.status === "completed").length
  const total = orders.filter((o) => ACTIVE.includes(o.status) || o.status === "completed").reduce((sum, o) => sum + o.price, 0)

  return (
    <FlatList
      data={orders}
      keyExtractor={(o) => o.id}
      contentContainerStyle={s.wrap}
      ListHeaderComponent={
        <>
          <Text style={s.title}>내 주문</Text>
          {!loading && orders.length > 0 && (
            <View style={s.statsRow}>
              <View style={s.statBox}>
                <Text style={s.statLabel}>진행중</Text>
                <Text style={s.statValue}>{inProgress}건</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statLabel}>완료</Text>
                <Text style={s.statValue}>{done}건</Text>
              </View>
              <View style={[s.statBox, { flex: 1.4 }]}>
                <Text style={s.statLabel}>확정 총액</Text>
                <Text style={s.statValue}>{total.toLocaleString()}원</Text>
              </View>
            </View>
          )}
          {loading && <ActivityIndicator color={ORANGE} style={{ marginTop: 20 }} />}
          {!loading && orders.length === 0 && <Text style={s.empty}>아직 등록한 주문이 없어요</Text>}
        </>
      }
      renderItem={({ item }) => (
        <Pressable style={s.card} onPress={() => router.push(`/order/${item.id}`)}>
          <View style={s.cardRow}>
            <Text style={s.route}>{item.origin} → {item.destination}</Text>
            <Text style={s.badge}>{STATUS_KO[item.status] ?? item.status}</Text>
          </View>
          <Text style={s.price}>{item.price.toLocaleString()}원</Text>
        </Pressable>
      )}
    />
  )
}

const s = {
  wrap: { padding: 24 },
  title: { fontSize: 24, fontWeight: "800" as const, color: "#111827", marginBottom: 14 },
  statsRow: { flexDirection: "row" as const, gap: 8, marginBottom: 16 },
  statBox: { flex: 1, backgroundColor: "#FFF3E9", borderRadius: 12, padding: 12, alignItems: "center" as const },
  statLabel: { fontSize: 12, color: "#9A3412", fontWeight: "700" as const },
  statValue: { fontSize: 19, fontWeight: "800" as const, color: ORANGE },
  empty: { color: "#9CA3AF", textAlign: "center" as const, marginTop: 40 },
  card: { backgroundColor: "#fff", borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 16, padding: 18, marginBottom: 12 },
  cardRow: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const },
  route: { fontSize: 17, fontWeight: "800" as const, color: "#111827" },
  badge: { fontSize: 13, fontWeight: "700" as const, color: ORANGE, backgroundColor: "#FFF3E9", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, overflow: "hidden" as const },
  price: { fontSize: 18, fontWeight: "800" as const, color: ORANGE, marginTop: 8 },
}
