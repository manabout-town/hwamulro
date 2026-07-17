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
        <Pressable style={s.profileLink} onPress={() => router.push("/profile")}>
          <Text style={s.profileLinkText}>내 프로필</Text>
        </Pressable>
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
  title: { fontSize: 18, fontWeight: "700" as const, color: "#111827", marginBottom: 24 },
  profileLink: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, padding: 16 },
  profileLinkText: { color: "#111827", fontWeight: "700" as const, fontSize: 16 },
  logout: { marginTop: "auto" as const, borderWidth: 1, borderColor: "#DC2626", borderRadius: 10, padding: 16, alignItems: "center" as const },
  logoutText: { color: "#DC2626", fontWeight: "700" as const, fontSize: 16 },
}
