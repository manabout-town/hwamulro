import { View, Text, Pressable } from "react-native"
import { router, useLocalSearchParams } from "expo-router"

export default function VerifyEmail() {
  const { email } = useLocalSearchParams<{ email?: string }>()

  return (
    <View style={s.wrap}>
      <Text style={s.logo}>탁카</Text>
      <Text style={s.title}>이메일 인증이 필요합니다</Text>
      {email && <Text style={s.email}>{email}</Text>}
      <Text style={s.desc}>가입 메일의 인증 링크를 눌러주세요</Text>
      <Pressable style={s.cta} onPress={() => router.replace("/(auth)/login")}>
        <Text style={s.ctaText}>로그인으로</Text>
      </Pressable>
    </View>
  )
}

const s = {
  wrap: { flex: 1, justifyContent: "center" as const, padding: 24, backgroundColor: "#fff", gap: 12 },
  logo: { fontSize: 32, fontWeight: "800" as const, color: "#F97316", textAlign: "center" as const },
  title: { fontSize: 18, fontWeight: "700" as const, textAlign: "center" as const, marginTop: 8 },
  email: { fontSize: 15, color: "#374151", textAlign: "center" as const },
  desc: { fontSize: 14, color: "#6B7280", textAlign: "center" as const, marginBottom: 16 },
  cta: { backgroundColor: "#F97316", borderRadius: 10, padding: 16, alignItems: "center" as const },
  ctaText: { color: "#fff", fontWeight: "700" as const, fontSize: 16 },
}
