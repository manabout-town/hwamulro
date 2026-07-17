import { useState } from "react"
import { View, Text, TextInput, Pressable } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { router, useLocalSearchParams } from "expo-router"
import { supabase } from "../../lib/supabase"

const ORANGE = "#F97316"

export default function ReviewScreen() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [err, setErr] = useState("")

  async function submitReview() {
    if (rating === 0 || !matchId) return
    setSubmitting(true)
    setErr("")

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setErr("로그인이 필요해요"); setSubmitting(false); return }

    const { data: match } = await supabase
      .from("matches")
      .select("driver_id, orders(shipper_id)")
      .eq("id", matchId)
      .single()

    if (!match) { setErr("매칭 정보를 찾을 수 없어요"); setSubmitting(false); return }

    const order = match.orders as unknown as { shipper_id: string } | null
    const isDriver = match.driver_id === user.id
    const revieweeId = isDriver ? order?.shipper_id : match.driver_id

    const { error } = await supabase.from("reviews").insert({
      match_id: matchId,
      reviewer_id: user.id,
      reviewee_id: revieweeId,
      rating,
      comment: comment.trim() || null,
    })

    if (error) { setErr(`리뷰 등록 실패: ${error.message}`); setSubmitting(false); return }

    // 원본과 동일: 화주가 기사를 리뷰할 때만 driver_profiles 평점 갱신 시도.
    // driver_profiles UPDATE RLS는 user_id = auth.uid() 제약이라 화주가 실행하면
    // 0행 갱신(무해 no-op) — 웹 원본 거동 그대로 이식.
    if (!isDriver) {
      const { data: reviews } = await supabase
        .from("reviews")
        .select("rating")
        .eq("reviewee_id", match.driver_id)

      if (reviews && reviews.length > 0) {
        const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
        await supabase
          .from("driver_profiles")
          .update({ rating_avg: avg, rating_count: reviews.length })
          .eq("user_id", match.driver_id)
      }
    }

    setSubmitted(true)
    setSubmitting(false)
    setTimeout(() => router.back(), 1500)
  }

  if (submitted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }} edges={["top"]}>
        <Text style={{ fontSize: 44, marginBottom: 12 }}>🎉</Text>
        <Text style={{ fontSize: 18, fontWeight: "800", color: "#111827", marginBottom: 6 }}>리뷰가 등록되었습니다!</Text>
        <Text style={{ fontSize: 13, color: "#9CA3AF" }}>잠시 후 이동합니다...</Text>
      </SafeAreaView>
    )
  }

  const ratingLabel =
    rating === 0 ? "별점을 선택하세요" :
    rating === 1 ? "매우 불만족" :
    rating === 2 ? "불만족" :
    rating === 3 ? "보통" :
    rating === 4 ? "만족" : "매우 만족"

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["top"]}>
      <View style={{ flex: 1, padding: 24, justifyContent: "center" }}>
        <Text style={{ fontSize: 20, fontWeight: "800", color: "#111827", textAlign: "center", marginBottom: 6 }}>거래 완료!</Text>
        <Text style={{ fontSize: 14, color: "#6B7280", textAlign: "center", marginBottom: 24 }}>상대방에 대한 리뷰를 남겨주세요</Text>

        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 16 }}>
          {[1, 2, 3, 4, 5].map((star) => (
            <Pressable key={star} onPress={() => setRating(star)} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 32, color: rating >= star ? "#FBBF24" : "#E5E7EB" }}>★</Text>
            </Pressable>
          ))}
        </View>

        <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center", marginBottom: 20 }}>{ratingLabel}</Text>

        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder="리뷰 내용을 입력해주세요 (선택사항)"
          multiline
          numberOfLines={3}
          style={{ borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12, padding: 14, fontSize: 15, minHeight: 80, textAlignVertical: "top", marginBottom: 16 }}
        />

        {!!err && <Text style={{ color: "#DC2626", fontSize: 13, marginBottom: 12 }}>{err}</Text>}

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable onPress={() => router.back()} style={{ flex: 1, borderWidth: 1.5, borderColor: "#D1D5DB", borderRadius: 12, padding: 14 }}>
            <Text style={{ color: "#6B7280", fontSize: 15, fontWeight: "700", textAlign: "center" }}>건너뛰기</Text>
          </Pressable>
          <Pressable
            onPress={submitReview}
            disabled={rating === 0 || submitting}
            style={{ flex: 1, backgroundColor: ORANGE, borderRadius: 12, padding: 14, opacity: rating === 0 || submitting ? 0.5 : 1 }}
          >
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800", textAlign: "center" }}>{submitting ? "등록 중..." : "리뷰 등록"}</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  )
}
