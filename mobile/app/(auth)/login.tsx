import { useState } from "react"
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native"
import { Link, router } from "expo-router"
import { supabase } from "../../lib/supabase"

export default function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onLogin() {
    setError(null); setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    setBusy(false)
    if (error) {
      setError(error.message.includes("Email not confirmed") ? "이메일 인증을 완료해주세요" : "이메일 또는 비밀번호가 올바르지 않습니다")
      return
    }
    router.replace("/")
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.flex}>
      <View style={s.wrap}>
        <Text style={s.logo}>탁카</Text>
        <Text style={s.sub}>카 캐리어 탁송 매칭</Text>
        <TextInput style={s.input} placeholder="이메일" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={s.input} placeholder="비밀번호" secureTextEntry value={password} onChangeText={setPassword} />
        {error && <Text style={s.error}>{error}</Text>}
        <Pressable style={s.cta} onPress={onLogin} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaText}>로그인</Text>}
        </Pressable>
        <Link href="/(auth)/signup" style={s.link}>회원가입</Link>
      </View>
    </KeyboardAvoidingView>
  )
}

const s = {
  flex: { flex: 1 },
  wrap: { flex: 1, justifyContent: "center" as const, padding: 24, backgroundColor: "#fff", gap: 12 },
  logo: { fontSize: 32, fontWeight: "800" as const, color: "#F97316", textAlign: "center" as const },
  sub: { textAlign: "center" as const, color: "#6B7280", marginBottom: 16 },
  input: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, padding: 14, fontSize: 16 },
  error: { color: "#DC2626", fontSize: 13 },
  cta: { backgroundColor: "#F97316", borderRadius: 10, padding: 16, alignItems: "center" as const },
  ctaText: { color: "#fff", fontWeight: "700" as const, fontSize: 16 },
  link: { textAlign: "center" as const, color: "#6B7280", marginTop: 8, textDecorationLine: "underline" as const },
}
