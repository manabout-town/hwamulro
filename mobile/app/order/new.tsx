import { useState } from "react"
import { View, Text, TextInput, Pressable, Switch, ScrollView } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { router } from "expo-router"
import { supabase } from "../../lib/supabase"

const ORANGE = "#F97316"

export default function OrderNew() {
  const [origin, setOrigin] = useState("")
  const [destination, setDestination] = useState("")
  const [vehicleNotes, setVehicleNotes] = useState("")
  const [vehicleCount, setVehicleCount] = useState("1")
  const [price, setPrice] = useState("")
  const [pickupAt, setPickupAt] = useState("")
  const [isUrgent, setIsUrgent] = useState(false)
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!origin || !destination || !price || !pickupAt) {
      setStatus("출발지·도착지·금액·픽업일시는 필수예요")
      return
    }
    const priceNum = parseInt(price, 10)
    if (Number.isNaN(priceNum) || priceNum < 0) {
      setStatus("금액을 올바르게 입력하세요")
      return
    }
    const pickupDate = new Date(pickupAt)
    if (Number.isNaN(pickupDate.getTime())) {
      setStatus("픽업 일시를 올바르게 입력하세요")
      return
    }
    setBusy(true)
    setStatus("등록 중…")
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setStatus("로그인이 필요해요"); setBusy(false); return }
    const { error } = await supabase.from("orders").insert({
      shipper_id: user.id,
      origin,
      destination,
      // 프로덕션 orders.cargo_type이 NOT NULL(마이그 012 미적용 상태에서도 동작하도록 명시)
      cargo_type: "차량",
      vehicle_count: parseInt(vehicleCount, 10) || 1,
      vehicle_notes: vehicleNotes || null,
      price: priceNum,
      pickup_at: pickupDate.toISOString(),
      is_urgent: isUrgent,
      urgent_fee: isUrgent ? 1000 : 0,
      status: "pending",
    })
    setBusy(false)
    if (error) { setStatus(`오류: ${error.message}`); return }
    router.replace("/(tabs)/orders")
  }

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()}>
          <Text style={s.back}>← 뒤로</Text>
        </Pressable>
        <Text style={s.title}>탁송 주문 등록</Text>

        <Text style={s.label}>출발지</Text>
        <TextInput style={s.input} value={origin} onChangeText={setOrigin} placeholder="예: 서울 강남구 삼성동" />

        <Text style={s.label}>도착지</Text>
        <TextInput style={s.input} value={destination} onChangeText={setDestination} placeholder="예: 부산 해운대구 우동" />

        <Text style={s.label}>차량 대수</Text>
        <TextInput style={s.input} value={vehicleCount} onChangeText={setVehicleCount} keyboardType="number-pad" />

        <Text style={s.label}>차종·메모 (선택)</Text>
        <TextInput style={s.input} value={vehicleNotes} onChangeText={setVehicleNotes} placeholder="예: 제네시스 G80 승용" />

        <Text style={s.label}>희망 금액 (원)</Text>
        <TextInput style={s.input} value={price} onChangeText={setPrice} keyboardType="number-pad" placeholder="예: 280000" />

        <Text style={s.label}>픽업 일시</Text>
        <TextInput style={s.input} value={pickupAt} onChangeText={setPickupAt} placeholder="예: 2026-07-20T14:00" />

        <View style={s.urgentRow}>
          <Text style={s.urgentLabel}>긴급 탁송 (수수료 +1,000원)</Text>
          <Switch value={isUrgent} onValueChange={setIsUrgent} trackColor={{ true: ORANGE }} />
        </View>

        <Pressable style={[s.cta, busy && s.ctaDisabled]} onPress={submit} disabled={busy}>
          <Text style={s.ctaText}>주문 등록하기</Text>
        </Pressable>
        {!!status && <Text style={s.status}>{status}</Text>}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = {
  safe: { flex: 1, backgroundColor: "#fff" },
  wrap: { padding: 24 },
  back: { color: "#6B7280", fontSize: 15, marginBottom: 12 },
  title: { fontSize: 24, fontWeight: "800" as const, color: "#111827", marginBottom: 20 },
  label: { fontSize: 14, color: "#6B7280", fontWeight: "600" as const, marginBottom: 6 },
  input: {
    width: "100%" as const, borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12,
    padding: 14, fontSize: 16, marginBottom: 14, backgroundColor: "#fff", color: "#111827",
  },
  urgentRow: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, marginVertical: 4, marginBottom: 20 },
  urgentLabel: { color: "#374151", fontSize: 15 },
  cta: { width: "100%" as const, backgroundColor: ORANGE, borderRadius: 14, padding: 18, alignItems: "center" as const },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: "#fff", fontSize: 18, fontWeight: "800" as const },
  status: { color: "#9CA3AF", fontSize: 14, marginTop: 12, textAlign: "center" as const },
}
