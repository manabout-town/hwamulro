import { View, Text, Pressable } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { router } from "expo-router"
import { supabase } from "../../lib/supabase"

export default function More() {
  async function onLogout() {
    await supabase.auth.signOut()
    router.replace("/(auth)/login")
  }

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.wrap}>
        <Text style={s.title}>더보기</Text>
        <Text style={s.desc}>SP2에서 구현 예정입니다</Text>
        <Pressable style={s.logout} onPress={onLogout}>
          <Text style={s.logoutText}>로그아웃</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const s = {
  safe: { flex: 1, backgroundColor: "#fff" },
  wrap: { flex: 1, padding: 24, gap: 8 },
  title: { fontSize: 18, fontWeight: "700" as const, color: "#111827" },
  desc: { fontSize: 14, color: "#6B7280", marginBottom: 24 },
  logout: { marginTop: "auto" as const, borderWidth: 1, borderColor: "#DC2626", borderRadius: 10, padding: 16, alignItems: "center" as const },
  logoutText: { color: "#DC2626", fontWeight: "700" as const, fontSize: 16 },
}
