import { useState } from "react"
import { View, Text, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { router } from "expo-router"
import { supabase } from "../../lib/supabase"
import { COMMUNITY_CATEGORIES, type CategoryKey } from "../../lib/community"

const ORANGE = "#F97316"
const BORDER = "#E5E7EB"

export default function CommunityNew() {
  const [category, setCategory] = useState<CategoryKey>("info")
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [price, setPrice] = useState("")
  const [msg, setMsg] = useState("")
  const [busy, setBusy] = useState(false)

  const isTrade = category === "buy" || category === "sell"

  async function submit() {
    // 웹 createPost 검증 규칙 그대로.
    const trimmedTitle = title.trim()
    const trimmedContent = content.trim()
    if (!trimmedTitle || trimmedTitle.length > 100) { setMsg("제목은 1~100자로 입력해주세요"); return }
    if (!trimmedContent || trimmedContent.length > 5000) { setMsg("내용은 1~5000자로 입력해주세요"); return }

    const priceNum = price ? parseInt(price, 10) : null
    if (priceNum !== null && (Number.isNaN(priceNum) || priceNum < 0)) { setMsg("가격이 올바르지 않습니다"); return }

    setBusy(true)
    setMsg("")
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setMsg("로그인이 필요합니다"); setBusy(false); return }

    const { data, error } = await supabase
      .from("community_posts")
      .insert({
        author_id: user.id,
        category,
        title: trimmedTitle,
        content: trimmedContent,
        images: [],
        price: isTrade ? priceNum : null,
      })
      .select("id")
      .single()
    setBusy(false)
    if (error) { setMsg(`오류: ${error.message}`); return }
    router.replace(`/community/${data.id}`)
  }

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()}>
            <Text style={s.back}>← 뒤로</Text>
          </Pressable>
          <Text style={s.title}>글쓰기</Text>

          <Text style={s.label}>카테고리</Text>
          <View style={s.catRow}>
            {COMMUNITY_CATEGORIES.map((c) => (
              <Pressable
                key={c.key}
                style={[s.catBtn, category === c.key && s.catBtnActive]}
                onPress={() => setCategory(c.key)}
              >
                <Text style={[s.catBtnText, category === c.key && s.catBtnTextActive]}>
                  {c.icon} {c.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={s.label}>제목 (1~100자)</Text>
          <TextInput
            style={s.input}
            value={title}
            onChangeText={setTitle}
            placeholder="제목을 입력하세요"
            maxLength={100}
          />

          <Text style={s.label}>내용 (1~5000자)</Text>
          <TextInput
            style={[s.input, s.textarea]}
            value={content}
            onChangeText={setContent}
            placeholder="내용을 입력하세요"
            multiline
            maxLength={5000}
            textAlignVertical="top"
          />

          {isTrade && (
            <>
              <Text style={s.label}>희망 가격 (원, 선택)</Text>
              <TextInput
                style={s.input}
                value={price}
                onChangeText={setPrice}
                keyboardType="number-pad"
                placeholder="예: 500000"
              />
            </>
          )}

          {!!msg && <Text style={s.msg}>{msg}</Text>}

          <Pressable style={[s.submit, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
            <Text style={s.submitText}>{busy ? "등록 중…" : "등록하기"}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = {
  safe: { flex: 1, backgroundColor: "#fff" },
  wrap: { padding: 24, paddingBottom: 48 },
  back: { color: "#6B7280", fontSize: 15, marginBottom: 12 },
  title: { fontSize: 22, fontWeight: "800" as const, color: "#111827", marginBottom: 20 },
  label: { fontSize: 13, color: "#6B7280", marginBottom: 6, marginTop: 8 },
  catRow: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 8, marginBottom: 8 },
  catBtn: { borderWidth: 1.5, borderColor: BORDER, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  catBtnActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  catBtnText: { fontSize: 13, fontWeight: "700" as const, color: "#6B7280" },
  catBtnTextActive: { color: "#fff" },
  input: { borderWidth: 1.5, borderColor: BORDER, borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 8, color: "#111827" },
  textarea: { minHeight: 160 },
  msg: { color: "#DC2626", fontSize: 13, marginTop: 8 },
  submit: { backgroundColor: ORANGE, borderRadius: 12, padding: 16, alignItems: "center" as const, marginTop: 16 },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "800" as const },
}
