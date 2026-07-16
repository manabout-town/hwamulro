import { useState } from "react"
import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from "react-native"
import { Link, router } from "expo-router"
import { API_BASE } from "../../lib/supabase"

type Role = "shipper" | "driver"

export default function Signup() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [role, setRole] = useState<Role>("shipper")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSignup() {
    setError(null); setBusy(true)
    try {
      const res = await fetch(`${API_BASE}/api/mobile/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, phone, role }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setError(data.error ?? "회원가입에 실패했습니다")
        setBusy(false)
        return
      }
      setBusy(false)
      if (data.needsEmailVerify) {
        router.replace(`/(auth)/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`)
      } else {
        router.replace("/(auth)/login")
      }
    } catch {
      setBusy(false)
      setError("서버 연결에 실패했습니다")
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.flex}>
      <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
        <Text style={s.logo}>탁카</Text>
        <Text style={s.sub}>회원가입</Text>

        <View style={s.roleRow}>
          <Pressable style={[s.roleBtn, role === "shipper" && s.roleBtnActive]} onPress={() => setRole("shipper")}>
            <Text style={[s.roleBtnText, role === "shipper" && s.roleBtnTextActive]}>화주</Text>
          </Pressable>
          <Pressable style={[s.roleBtn, role === "driver" && s.roleBtnActive]} onPress={() => setRole("driver")}>
            <Text style={[s.roleBtnText, role === "driver" && s.roleBtnTextActive]}>기사</Text>
          </Pressable>
        </View>

        <TextInput style={s.input} placeholder="이메일" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={s.input} placeholder="비밀번호 (8자 이상, 특수문자 포함)" secureTextEntry value={password} onChangeText={setPassword} />
        <TextInput style={s.input} placeholder="이름" value={name} onChangeText={setName} />
        <TextInput style={s.input} placeholder="휴대폰 번호 (예: 010-1234-5678)" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
        {error && <Text style={s.error}>{error}</Text>}
        <Pressable style={s.cta} onPress={onSignup} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.ctaText}>가입하기</Text>}
        </Pressable>
        <Link href="/(auth)/login" style={s.link}>이미 계정이 있으신가요? 로그인</Link>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const s = {
  flex: { flex: 1 },
  wrap: { flexGrow: 1, justifyContent: "center" as const, padding: 24, backgroundColor: "#fff", gap: 12 },
  logo: { fontSize: 32, fontWeight: "800" as const, color: "#F97316", textAlign: "center" as const },
  sub: { textAlign: "center" as const, color: "#6B7280", marginBottom: 8 },
  roleRow: { flexDirection: "row" as const, gap: 8, marginBottom: 4 },
  roleBtn: { flex: 1, borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, padding: 12, alignItems: "center" as const },
  roleBtnActive: { backgroundColor: "#FFF7ED", borderColor: "#F97316" },
  roleBtnText: { fontSize: 15, color: "#6B7280", fontWeight: "600" as const },
  roleBtnTextActive: { color: "#F97316" },
  input: { borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10, padding: 14, fontSize: 16 },
  error: { color: "#DC2626", fontSize: 13 },
  cta: { backgroundColor: "#F97316", borderRadius: 10, padding: 16, alignItems: "center" as const },
  ctaText: { color: "#fff", fontWeight: "700" as const, fontSize: 16 },
  link: { textAlign: "center" as const, color: "#6B7280", marginTop: 8, textDecorationLine: "underline" as const },
}
