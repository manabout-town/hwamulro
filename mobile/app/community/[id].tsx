import { useCallback, useEffect, useState } from "react"
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Image } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { router, useLocalSearchParams } from "expo-router"
import { supabase, API_BASE } from "../../lib/supabase"
import {
  CATEGORY_LABEL,
  CATEGORY_COLOR,
  ROLE_BADGE,
  type CommunityPostDetail,
  type CommunityComment,
  type CommunityFeedResponse,
} from "../../lib/community"

const ORANGE = "#F97316"
const BORDER = "#E5E7EB"

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("ko-KR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

export default function CommunityPostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()

  const [post, setPost] = useState<CommunityPostDetail | null>(null)
  const [comments, setComments] = useState<CommunityComment[]>([])
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState("")

  const [userId, setUserId] = useState<string | null>(null)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [likeBusy, setLikeBusy] = useState(false)

  const [commentText, setCommentText] = useState("")
  const [commentBusy, setCommentBusy] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setMsg("")
    try {
      const res = await fetch(`${API_BASE}/api/community/feed?postId=${id}`)
      if (res.status === 404) { setNotFound(true); setLoading(false); return }
      const data: CommunityFeedResponse | { error: string } = await res.json()
      if (!res.ok || "error" in data || data.mode !== "detail") {
        setMsg(("error" in data && data.error) || "불러오기 실패")
        setLoading(false)
        return
      }
      setPost(data.post)
      setComments(data.comments)
      setLikeCount(data.post.like_count)
    } catch {
      setMsg("서버 연결에 실패했습니다")
    }
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  // 내 좋아요 여부는 유저 세션으로 조회(community_likes SELECT USING(true)).
  useEffect(() => {
    if (!id) return
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      const { data } = await supabase
        .from("community_likes")
        .select("post_id")
        .eq("post_id", id)
        .eq("user_id", user.id)
        .maybeSingle()
      setLiked(!!data)
    })
  }, [id])

  // 원본 toggleLike 로직 그대로(유저 세션): 존재 조회 → delete/insert, 23505는 이미 좋아요.
  async function toggleLike() {
    if (!id || likeBusy) return
    if (!userId) { setMsg("로그인이 필요합니다"); return }
    setLikeBusy(true)

    const { data: existing } = await supabase
      .from("community_likes")
      .select("post_id")
      .eq("post_id", id)
      .eq("user_id", userId)
      .maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from("community_likes")
        .delete()
        .eq("post_id", id)
        .eq("user_id", userId)
      if (!error) {
        setLiked(false)
        setLikeCount((c) => Math.max(0, c - 1))
      } else {
        setMsg(`오류: ${error.message}`)
      }
    } else {
      const { error } = await supabase
        .from("community_likes")
        .insert({ post_id: id, user_id: userId })
      if (!error || (error as { code?: string }).code === "23505") {
        setLiked(true)
        if (!error) setLikeCount((c) => c + 1)
      } else {
        setMsg(`오류: ${error.message}`)
      }
    }
    setLikeBusy(false)
  }

  // 원본 createComment 규칙(1~1000자) 그대로(유저 세션 insert) → feed 재조회.
  async function submitComment() {
    const trimmed = commentText.trim()
    if (!trimmed || trimmed.length > 1000) { setMsg("댓글은 1~1000자로 입력해주세요"); return }
    if (!userId) { setMsg("로그인이 필요합니다"); return }
    if (!id) return

    setCommentBusy(true)
    setMsg("")
    const { error } = await supabase.from("community_comments").insert({
      post_id: id,
      author_id: userId,
      content: trimmed,
    })
    setCommentBusy(false)
    if (error) { setMsg(`오류: ${error.message}`); return }
    setCommentText("")
    await load()
  }

  async function deleteComment(commentId: string) {
    if (!userId) return
    const { error } = await supabase
      .from("community_comments")
      .delete()
      .eq("id", commentId)
      .eq("author_id", userId)
    if (error) { setMsg(`오류: ${error.message}`); return }
    await load()
  }

  if (loading) {
    return (
      <SafeAreaView style={s.safe} edges={["top"]}>
        <ActivityIndicator color={ORANGE} style={{ marginTop: 60 }} />
      </SafeAreaView>
    )
  }

  if (notFound || !post) {
    return (
      <SafeAreaView style={s.safe} edges={["top"]}>
        <View style={s.wrap}>
          <Pressable onPress={() => router.back()}>
            <Text style={s.back}>← 뒤로</Text>
          </Pressable>
          <Text style={s.notFound}>게시글을 찾을 수 없습니다</Text>
          {!!msg && <Text style={s.msg}>{msg}</Text>}
        </View>
      </SafeAreaView>
    )
  }

  const color = CATEGORY_COLOR[post.category] ?? { bg: "#F3F4F6", fg: "#6B7280" }
  const roleBadge = post.author?.role ? ROLE_BADGE[post.author.role] : null
  const images: { url: string }[] = Array.isArray(post.images)
    ? (post.images as { url: string }[]).filter((i) => typeof i?.url === "string")
    : []

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
          <View style={s.headerRow}>
            <Pressable onPress={() => router.back()}>
              <Text style={s.back}>← 뒤로</Text>
            </Pressable>
            <Text style={[s.categoryBadge, { backgroundColor: color.bg, color: color.fg }]}>
              {CATEGORY_LABEL[post.category] ?? post.category}
            </Text>
          </View>

          <Text style={s.title}>{post.title}</Text>
          <View style={s.authorRow}>
            <Text style={s.authorName}>{post.author?.name ?? "익명"}</Text>
            {roleBadge && <Text style={[s.roleBadge, { color: roleBadge.color }]}>{roleBadge.label}</Text>}
            <Text style={s.date}>{fmtDate(post.created_at)}</Text>
          </View>

          {post.price != null && (
            <View style={s.priceBox}>
              <Text style={s.priceLabel}>희망 가격</Text>
              <Text style={s.priceValue}>{post.price.toLocaleString()}원</Text>
            </View>
          )}

          <Text style={s.content}>{post.content}</Text>

          {images.length > 0 && (
            <View style={s.imageWrap}>
              {images.map((img, i) => (
                <Image key={i} source={{ uri: img.url }} style={s.image} resizeMode="cover" />
              ))}
            </View>
          )}

          <View style={s.likeRow}>
            <Pressable style={[s.likeBtn, liked && s.likeBtnActive]} onPress={toggleLike} disabled={likeBusy}>
              <Text style={[s.likeText, liked && s.likeTextActive]}>
                {liked ? "❤️" : "🤍"} 좋아요 {likeCount}
              </Text>
            </Pressable>
          </View>

          <Text style={s.commentHeader}>댓글 {comments.length}</Text>

          {comments.length === 0 && <Text style={s.emptyComment}>첫 번째 댓글을 남겨보세요</Text>}

          {comments.map((c) => {
            const cBadge = c.author?.role ? ROLE_BADGE[c.author.role] : null
            return (
              <View key={c.id} style={s.commentCard}>
                <View style={s.commentTop}>
                  <View style={s.authorRow}>
                    <Text style={s.authorName}>{c.author?.name ?? "익명"}</Text>
                    {cBadge && <Text style={[s.roleBadge, { color: cBadge.color }]}>{cBadge.label}</Text>}
                    <Text style={s.date}>{fmtDate(c.created_at)}</Text>
                  </View>
                  {userId === c.author_id && (
                    <Pressable onPress={() => deleteComment(c.id)}>
                      <Text style={s.deleteText}>삭제</Text>
                    </Pressable>
                  )}
                </View>
                <Text style={s.commentContent}>{c.content}</Text>
              </View>
            )
          })}

          <View style={s.commentForm}>
            <TextInput
              style={s.commentInput}
              value={commentText}
              onChangeText={setCommentText}
              placeholder="댓글을 입력하세요 (1~1000자)"
              maxLength={1000}
              multiline
            />
            <Pressable
              style={[s.commentSubmit, commentBusy && { opacity: 0.6 }]}
              onPress={submitComment}
              disabled={commentBusy}
            >
              <Text style={s.commentSubmitText}>{commentBusy ? "등록 중…" : "등록"}</Text>
            </Pressable>
          </View>

          {!!msg && <Text style={s.msg}>{msg}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = {
  safe: { flex: 1, backgroundColor: "#fff" },
  wrap: { padding: 24, paddingBottom: 48 },
  headerRow: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, marginBottom: 16 },
  back: { color: "#6B7280", fontSize: 15 },
  categoryBadge: { fontSize: 12, fontWeight: "800" as const, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, overflow: "hidden" as const },
  notFound: { color: "#9CA3AF", textAlign: "center" as const, marginTop: 60, fontSize: 15 },
  title: { fontSize: 20, fontWeight: "800" as const, color: "#111827", marginBottom: 8 },
  authorRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6, flexShrink: 1 },
  authorName: { fontSize: 13, fontWeight: "700" as const, color: "#374151" },
  roleBadge: { fontSize: 11, fontWeight: "800" as const },
  date: { fontSize: 11, color: "#9CA3AF" },
  priceBox: { backgroundColor: "#FFF7ED", borderWidth: 1, borderColor: "#FED7AA", borderRadius: 12, padding: 14, marginTop: 14 },
  priceLabel: { fontSize: 12, color: "#F97316" },
  priceValue: { fontSize: 18, fontWeight: "800" as const, color: "#EA580C", marginTop: 2 },
  content: { fontSize: 15, color: "#374151", lineHeight: 23, marginTop: 16 },
  imageWrap: { gap: 8, marginTop: 16 },
  image: { width: "100%" as const, height: 220, borderRadius: 12, backgroundColor: "#F3F4F6" },
  likeRow: { flexDirection: "row" as const, marginTop: 20, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  likeBtn: { borderWidth: 1.5, borderColor: BORDER, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  likeBtnActive: { borderColor: "#FCA5A5", backgroundColor: "#FEF2F2" },
  likeText: { fontSize: 14, fontWeight: "700" as const, color: "#6B7280" },
  likeTextActive: { color: "#DC2626" },
  commentHeader: { fontSize: 16, fontWeight: "800" as const, color: "#111827", marginTop: 20, marginBottom: 12 },
  emptyComment: { color: "#9CA3AF", fontSize: 13, marginBottom: 12 },
  commentCard: { borderWidth: 1, borderColor: "#F3F4F6", borderRadius: 12, padding: 12, marginBottom: 10 },
  commentTop: { flexDirection: "row" as const, justifyContent: "space-between" as const, alignItems: "center" as const, marginBottom: 6 },
  deleteText: { fontSize: 12, color: "#DC2626", fontWeight: "700" as const },
  commentContent: { fontSize: 14, color: "#374151", lineHeight: 20 },
  commentForm: { flexDirection: "row" as const, gap: 8, marginTop: 12, alignItems: "flex-end" as const },
  commentInput: { flex: 1, borderWidth: 1.5, borderColor: BORDER, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 44, maxHeight: 120, color: "#111827" },
  commentSubmit: { backgroundColor: ORANGE, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 13 },
  commentSubmitText: { color: "#fff", fontSize: 14, fontWeight: "800" as const },
  msg: { color: "#DC2626", fontSize: 13, marginTop: 12 },
}
