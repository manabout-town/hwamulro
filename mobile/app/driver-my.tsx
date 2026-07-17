import { useEffect, useState } from "react"
import { View, Text, Pressable, FlatList, ActivityIndicator } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { router } from "expo-router"
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

export default function DriverMy() {
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
    <SafeAreaView style={s.safe} edges={["top"]}>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={s.wrap}
        ListHeaderComponent={
          <>
            <Pressable onPress={() => router.back()}>
              <Text style={s.back}>← 뒤로</Text>
            </Pressable>
            <Text style={s.title}>내 입찰 · 매칭</Text>
            <View style={s.statsRow}>
              <View style={s.statBox}>
                <Text style={s.statLabel}>매칭</Text>
                <Text style={s.statValue}>{matched.length}건</Text>
              </View>
              <View style={s.statBox}>
                <Text style={s.statLabel}>예상 수익</Text>
                <Text style={s.statValue}>{expected.toLocaleString()}원</Text>
              </View>
            </View>
            {loading && <ActivityIndicator color={ORANGE} style={{ marginTop: 20 }} />}
            {!loading && rows.length === 0 && <Text style={s.empty}>아직 입찰한 의뢰가 없어요</Text>}
          </>
        }
        renderItem={({ item }) => {
          const o = one(item.orders)
          const isMatched = item.status === "accepted"
          const body = (
            <>
              <View style={s.cardRow}>
                <Text style={s.route}>{o ? `${o.origin} → ${o.destination}` : "주문"}</Text>
                <Text style={[s.badge, isMatched ? s.badgeMatched : s.badgeDefault]}>{BID_KO[item.status] ?? item.status}</Text>
              </View>
              {o && <Text style={s.date}>{fmtDate(o.pickup_at)}</Text>}
              <Text style={s.price}>내 입찰 {item.price.toLocaleString()}원</Text>
              {isMatched && <Text style={s.matchCta}>매칭 상세 · 채팅 열기 →</Text>}
            </>
          )
          if (isMatched) {
            return (
              <Pressable style={[s.card, s.cardMatched]} onPress={() => router.push(`/match/${item.order_id}`)}>
                {body}
              </Pressable>
            )
          }
          return <View style={s.card}>{body}</View>
        }}
      />
    </SafeAreaView>
  )
}

const s = {
  safe: { flex: 1, backgroundColor: "#fff" },
  wrap: { padding: 24 },
  back: { color: "#6B7280", fontSize: 15, marginBottom: 12 },
  title: { fontSize: 24, fontWeight: "800" as const, color: "#111827", marginBottom: 14 },
  statsRow: { flexDirection: "row" as const, gap: 10, marginBottom: 18 },
  statBox: { flex: 1, backgroundColor: "#FFF3E9", borderRadius: 14, padding: 14 },
  statLabel: { fontSize: 13, color: "#9A3412", fontWeight: "700" as const },
  statValue: { fontSize: 22, fontWeight: "800" as const, color: ORANGE, marginTop: 2 },
  empty: { color: "#9CA3AF", textAlign: "center" as const, marginTop: 40 },
  card: { backgroundColor: "#fff", borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 16, padding: 18, marginBottom: 12 },
  cardMatched: { borderColor: ORANGE },
  cardRow: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const },
  route: { fontSize: 17, fontWeight: "800" as const, color: "#111827" },
  badge: { fontSize: 13, fontWeight: "700" as const, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, overflow: "hidden" as const },
  badgeMatched: { color: "#12B589", backgroundColor: "#E7F8F1" },
  badgeDefault: { color: "#6B7280", backgroundColor: "#F3F4F6" },
  date: { color: "#6B7280", fontSize: 14, marginTop: 6 },
  price: { fontSize: 18, fontWeight: "800" as const, color: ORANGE, marginTop: 8 },
  matchCta: { fontSize: 14, fontWeight: "800" as const, color: ORANGE, marginTop: 10 },
}
