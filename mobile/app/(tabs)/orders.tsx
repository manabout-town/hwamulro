import { View, Text } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useAuth } from "../../lib/auth"

export default function Orders() {
  const { role } = useAuth()

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.wrap}>
        <Text style={s.title}>{role === "driver" ? "탁송 피드" : "내 주문"}</Text>
        <Text style={s.desc}>SP2에서 구현 예정입니다</Text>
      </View>
    </SafeAreaView>
  )
}

const s = {
  safe: { flex: 1, backgroundColor: "#fff" },
  wrap: { flex: 1, alignItems: "center" as const, justifyContent: "center" as const, gap: 8, padding: 24 },
  title: { fontSize: 18, fontWeight: "700" as const, color: "#111827" },
  desc: { fontSize: 14, color: "#6B7280" },
}
