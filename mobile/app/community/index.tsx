import { useCallback, useState } from "react"
import { View, Text, Pressable, FlatList, ActivityIndicator } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { router, useFocusEffect } from "expo-router"
import { API_BASE } from "../../lib/supabase"
import {
  COMMUNITY_CATEGORIES,
  CATEGORY_LABEL,
  CATEGORY_COLOR,
  ROLE_BADGE,
  type CommunityPost,
  type CommunityFeedResponse,
} from "../../lib/community"

const ORANGE = "#F97316"

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export default function CommunityList() {
  const [category, setCategory] = useState<string | null>(null)
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState("")

  const load = useCallback(async (cat: string | null) => {
    setLoading(true)
    setMsg("")
    try {
      const qs = cat ? `?category=${cat}` : ""
      const res = await fetch(`${API_BASE}/api/community/feed${qs}`)
      const data: CommunityFeedResponse | { error: string } = await res.json()
      if (!res.ok || "error" in data) {
        setMsg(("error" in data && data.error) || "불러오기 실패")
        setPosts([])
      } else if (data.mode === "list") {
        setPosts(data.posts)
      }
    } catch {
      setMsg("서버 연결에 실패했습니다")
    }
    setLoading(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      load(category)
    }, [load, category])
  )

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={s.wrap}
        ListHeaderComponent={
          <>
            <View style={s.header}>
              <Text style={s.title}>커뮤니티</Text>
              <Pressable style={s.writeBtn} onPress={() => router.push("/community/new")}>
                <Text style={s.writeBtnText}>✏️ 글쓰기</Text>
              </Pressable>
            </View>

            <View style={s.tabs}>
              <Pressable
                style={[s.tab, category === null && s.tabActive]}
                onPress={() => setCategory(null)}
              >
                <Text style={[s.tabText, category === null && s.tabTextActive]}>전체</Text>
              </Pressable>
              {COMMUNITY_CATEGORIES.map((c) => (
                <Pressable
                  key={c.key}
                  style={[s.tab, category === c.key && s.tabActive]}
                  onPress={() => setCategory(c.key)}
                >
                  <Text style={[s.tabText, category === c.key && s.tabTextActive]}>
                    {c.icon} {c.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {loading && <ActivityIndicator color={ORANGE} style={{ marginTop: 20 }} />}
            {!loading && posts.length === 0 && !msg && (
              <Text style={s.empty}>아직 게시글이 없습니다{"\n"}첫 번째 글을 작성해보세요</Text>
            )}
            {!!msg && <Text style={s.msg}>{msg}</Text>}
          </>
        }
        renderItem={({ item }) => {
          const color = CATEGORY_COLOR[item.category] ?? { bg: "#F3F4F6", fg: "#6B7280" }
          const roleBadge = item.author?.role ? ROLE_BADGE[item.author.role] : null
          return (
            <Pressable style={s.card} onPress={() => router.push(`/community/${item.id}`)}>
              <View style={s.cardTop}>
                <Text style={[s.categoryBadge, { backgroundColor: color.bg, color: color.fg }]}>
                  {CATEGORY_LABEL[item.category] ?? item.category}
                </Text>
                <Text style={s.date}>{fmtDate(item.created_at)}</Text>
              </View>
              <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={s.cardContent} numberOfLines={2}>{item.content}</Text>
              {item.price != null && <Text style={s.price}>{item.price.toLocaleString()}원</Text>}
              <View style={s.cardBottom}>
                <View style={s.authorRow}>
                  <Text style={s.authorName}>{item.author?.name ?? "익명"}</Text>
                  {roleBadge && (
                    <Text style={[s.roleBadge, { color: roleBadge.color }]}>{roleBadge.label}</Text>
                  )}
                </View>
                <Text style={s.stats}>❤️ {item.like_count} · 💬 {item.comment_count}</Text>
              </View>
            </Pressable>
          )
        }}
      />
    </SafeAreaView>
  )
}

const s = {
  safe: { flex: 1, backgroundColor: "#fff" },
  wrap: { padding: 24, paddingBottom: 48 },
  header: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "800" as const, color: "#111827" },
  writeBtn: { backgroundColor: ORANGE, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  writeBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" as const },
  tabs: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8, marginBottom: 16 },
  tab: { borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  tabActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  tabText: { fontSize: 13, fontWeight: "700" as const, color: "#6B7280" },
  tabTextActive: { color: "#fff" },
  empty: { color: "#9CA3AF", textAlign: "center" as const, marginTop: 40, lineHeight: 22 },
  msg: { color: "#DC2626", textAlign: "center" as const, marginTop: 20 },
  card: { backgroundColor: "#fff", borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 16, padding: 16, marginBottom: 12 },
  cardTop: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, marginBottom: 8 },
  categoryBadge: { fontSize: 11, fontWeight: "800" as const, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, overflow: "hidden" as const },
  date: { fontSize: 11, color: "#9CA3AF" },
  cardTitle: { fontSize: 16, fontWeight: "800" as const, color: "#111827", marginBottom: 4 },
  cardContent: { fontSize: 13, color: "#6B7280", lineHeight: 18 },
  price: { fontSize: 15, fontWeight: "800" as const, color: "#EA580C", marginTop: 8 },
  cardBottom: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  authorRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6 },
  authorName: { fontSize: 12, fontWeight: "700" as const, color: "#374151" },
  roleBadge: { fontSize: 10, fontWeight: "800" as const },
  stats: { fontSize: 12, color: "#9CA3AF" },
}
