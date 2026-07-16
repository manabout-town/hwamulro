import { View, Text, Pressable } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { router } from "expo-router"
import { useAuth } from "../../lib/auth"

export default function Home() {
  const { role } = useAuth()
  const isDriver = role === "driver"

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.wrap}>
        <Text style={s.greeting}>{isDriver ? "안녕하세요, 기사님" : "안녕하세요, 화주님"}</Text>
        <Text style={s.desc}>{isDriver ? "오늘 새로운 탁송 건을 확인해보세요" : "카 캐리어 탁송을 등록해보세요"}</Text>
        <Pressable style={s.cta} onPress={() => router.push(isDriver ? "/(tabs)/orders" : "/order/new")}>
          <Text style={s.ctaText}>{isDriver ? "탁송 피드 보기" : "주문 등록하기"}</Text>
        </Pressable>
        {isDriver && (
          <Pressable style={s.secondaryCta} onPress={() => router.push("/driver-my")}>
            <Text style={s.secondaryCtaText}>내 활동 보기</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  )
}

const s = {
  safe: { flex: 1, backgroundColor: "#fff" },
  wrap: { flex: 1, padding: 24, justifyContent: "center" as const, gap: 12 },
  greeting: { fontSize: 22, fontWeight: "800" as const, color: "#111827" },
  desc: { fontSize: 15, color: "#6B7280", marginBottom: 16 },
  cta: { backgroundColor: "#F97316", borderRadius: 10, padding: 16, alignItems: "center" as const },
  ctaText: { color: "#fff", fontWeight: "700" as const, fontSize: 16 },
  secondaryCta: { backgroundColor: "#FFF3E9", borderRadius: 10, padding: 16, alignItems: "center" as const },
  secondaryCtaText: { color: "#F97316", fontWeight: "700" as const, fontSize: 16 },
}
