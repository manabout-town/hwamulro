import { useEffect, useState } from "react"
import { View, Text, Pressable, ScrollView, ActivityIndicator, Image } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import * as ImagePicker from "expo-image-picker"
import { router } from "expo-router"
import { supabase, API_BASE } from "../lib/supabase"
import { useAuth } from "../lib/auth"

const ORANGE = "#F97316"
const BORDER = "#E5E7EB"

type Step = 1 | 2 | 3
type ResultStatus = "approved" | "manual_review" | "rejected" | "error" | null

interface PickedDoc {
  uri: string
  name: string
  mimeType: string
}

function labelFor(status: ResultStatus): string {
  switch (status) {
    case "approved": return "인증 완료!"
    case "manual_review": return "서류 접수 완료"
    case "rejected": return "인증 실패"
    case "error": return "오류가 발생했습니다"
    default: return ""
  }
}

async function pickDoc(): Promise<PickedDoc | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) return null
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.8,
  })
  if (res.canceled || res.assets.length === 0) return null
  const asset = res.assets[0]
  const mimeType = asset.mimeType ?? "image/jpeg"
  const name = asset.fileName ?? `doc_${Date.now()}.${mimeType.split("/")[1] ?? "jpg"}`
  return { uri: asset.uri, name, mimeType }
}

export default function Verification() {
  const { role } = useAuth()
  const isDriver = role === "driver"

  const [step, setStep] = useState<Step>(1)
  const [checkingStatus, setCheckingStatus] = useState(true)
  const [alreadyVerified, setAlreadyVerified] = useState(false)

  const [bizDoc, setBizDoc] = useState<PickedDoc | null>(null)
  const [licDoc, setLicDoc] = useState<PickedDoc | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<ResultStatus>(null)
  const [reason, setReason] = useState("")

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setCheckingStatus(false); return }
      const { data } = await supabase.from("users").select("verification_status").eq("id", user.id).single()
      if (data?.verification_status === "verified") setAlreadyVerified(true)
      setCheckingStatus(false)
    })()
  }, [])

  async function handlePickBiz() {
    const doc = await pickDoc()
    if (doc) setBizDoc(doc)
  }

  async function handlePickLic() {
    const doc = await pickDoc()
    if (doc) setLicDoc(doc)
  }

  const canSubmit = isDriver ? !!bizDoc && !!licDoc : true

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setStep(3)
    setResult(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setResult("error"); setSubmitting(false); return }

      const formData = new FormData()
      if (bizDoc) {
        formData.append("business_registration", {
          uri: bizDoc.uri,
          name: bizDoc.name,
          type: bizDoc.mimeType,
        } as unknown as Blob)
      }
      if (isDriver && licDoc) {
        formData.append("driver_license", {
          uri: licDoc.uri,
          name: licDoc.name,
          type: licDoc.mimeType,
        } as unknown as Blob)
      }

      const res = await fetch(`${API_BASE}/api/kyc/verify`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      })

      const data = await res.json().catch(() => null)
      if (!res.ok || !data) {
        setResult("error")
        setSubmitting(false)
        return
      }

      const status: ResultStatus = data.status ?? "error"
      setResult(status)
      if (status === "rejected") setReason(data.reason ?? "서류를 확인할 수 없습니다.")
      if (status === "approved") {
        setTimeout(() => router.back(), 1500)
      }
    } catch {
      setResult("error")
    } finally {
      setSubmitting(false)
    }
  }

  function retry() {
    setResult(null)
    setStep(2)
  }

  if (checkingStatus) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["top"]}>
        <ActivityIndicator color={ORANGE} style={{ marginTop: 60 }} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: "#6B7280", fontSize: 15, marginBottom: 12 }}>← 뒤로</Text>
        </Pressable>

        {alreadyVerified ? (
          <View style={{ alignItems: "center", paddingVertical: 60 }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>✅</Text>
            <Text style={{ fontSize: 18, fontWeight: "800", color: "#111827" }}>이미 인증된 계정입니다</Text>
          </View>
        ) : (
          <>
            {step === 1 && (
              <View>
                <Text style={{ fontSize: 20, fontWeight: "800", color: "#111827", marginBottom: 8 }}>본인 인증이 필요합니다</Text>
                <Text style={{ fontSize: 14, color: "#6B7280", marginBottom: 20 }}>탁카 서비스 이용을 위해 아래 서류를 준비해주세요.</Text>

                <View style={{ backgroundColor: "#F9FAFB", borderRadius: 14, padding: 18, marginBottom: 24 }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: ORANGE, marginBottom: 10 }}>
                    {isDriver ? "기사 필요 서류" : "화주 필요 서류"}
                  </Text>
                  <Text style={{ fontSize: 14, color: "#374151", marginBottom: 6 }}>
                    사업자등록증 {isDriver ? <Text style={{ color: ORANGE, fontSize: 12 }}>필수</Text> : <Text style={{ color: "#9CA3AF", fontSize: 12 }}>(선택)</Text>}
                  </Text>
                  {isDriver && (
                    <Text style={{ fontSize: 14, color: "#374151" }}>
                      운전면허증 <Text style={{ color: ORANGE, fontSize: 12 }}>필수</Text>
                    </Text>
                  )}
                  <Text style={{ fontSize: 12, color: "#9CA3AF", marginTop: 12 }}>JPG, PNG, WEBP · 파일당 최대 10MB</Text>
                </View>

                <Pressable onPress={() => setStep(2)} style={{ backgroundColor: ORANGE, borderRadius: 12, padding: 16 }}>
                  <Text style={{ color: "#fff", fontSize: 16, fontWeight: "800", textAlign: "center" }}>인증 시작하기 →</Text>
                </Pressable>
              </View>
            )}

            {step === 2 && (
              <View>
                <Text style={{ fontSize: 20, fontWeight: "800", color: "#111827", textAlign: "center", marginBottom: 4 }}>서류 업로드</Text>
                <Text style={{ fontSize: 14, color: "#6B7280", textAlign: "center", marginBottom: 24 }}>선명하게 촬영한 사진을 선택해주세요.</Text>

                <Text style={{ fontSize: 14, fontWeight: "700", color: "#374151", marginBottom: 8 }}>
                  사업자등록증 {isDriver ? <Text style={{ color: ORANGE, fontSize: 12 }}>필수</Text> : <Text style={{ color: "#9CA3AF", fontSize: 12 }}>선택</Text>}
                </Text>
                {bizDoc ? (
                  <View style={{ borderWidth: 1.5, borderColor: BORDER, borderRadius: 14, padding: 12, marginBottom: 20, flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <Image source={{ uri: bizDoc.uri }} style={{ width: 56, height: 56, borderRadius: 8 }} />
                    <Text style={{ flex: 1, fontSize: 13, color: "#111827" }} numberOfLines={1}>{bizDoc.name}</Text>
                    <Pressable onPress={() => setBizDoc(null)}><Text style={{ fontSize: 18, color: "#9CA3AF" }}>×</Text></Pressable>
                  </View>
                ) : (
                  <Pressable onPress={handlePickBiz} style={{ borderWidth: 2, borderColor: BORDER, borderStyle: "dashed", borderRadius: 14, padding: 24, alignItems: "center", marginBottom: 20 }}>
                    <Text style={{ fontSize: 14, color: "#6B7280" }}>탭하여 사진 선택</Text>
                  </Pressable>
                )}

                {isDriver && (
                  <>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: "#374151", marginBottom: 8 }}>
                      운전면허증 <Text style={{ color: ORANGE, fontSize: 12 }}>필수</Text>
                    </Text>
                    {licDoc ? (
                      <View style={{ borderWidth: 1.5, borderColor: BORDER, borderRadius: 14, padding: 12, marginBottom: 20, flexDirection: "row", alignItems: "center", gap: 12 }}>
                        <Image source={{ uri: licDoc.uri }} style={{ width: 56, height: 56, borderRadius: 8 }} />
                        <Text style={{ flex: 1, fontSize: 13, color: "#111827" }} numberOfLines={1}>{licDoc.name}</Text>
                        <Pressable onPress={() => setLicDoc(null)}><Text style={{ fontSize: 18, color: "#9CA3AF" }}>×</Text></Pressable>
                      </View>
                    ) : (
                      <Pressable onPress={handlePickLic} style={{ borderWidth: 2, borderColor: BORDER, borderStyle: "dashed", borderRadius: 14, padding: 24, alignItems: "center", marginBottom: 20 }}>
                        <Text style={{ fontSize: 14, color: "#6B7280" }}>탭하여 사진 선택</Text>
                      </Pressable>
                    )}
                  </>
                )}

                <Pressable
                  onPress={handleSubmit}
                  disabled={!canSubmit}
                  style={{ backgroundColor: canSubmit ? ORANGE : "#E5E7EB", borderRadius: 12, padding: 16, marginBottom: 10 }}
                >
                  <Text style={{ color: canSubmit ? "#fff" : "#9CA3AF", fontSize: 16, fontWeight: "800", textAlign: "center" }}>제출하기</Text>
                </Pressable>
                <Pressable onPress={() => setStep(1)} style={{ padding: 10 }}>
                  <Text style={{ color: "#6B7280", fontSize: 14, textAlign: "center" }}>← 뒤로</Text>
                </Pressable>
              </View>
            )}

            {step === 3 && (
              <View style={{ alignItems: "center", paddingVertical: 20 }}>
                {submitting ? (
                  <>
                    <ActivityIndicator color={ORANGE} size="large" style={{ marginBottom: 20 }} />
                    <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827" }}>AI가 서류를 검토 중입니다...</Text>
                    <Text style={{ fontSize: 13, color: "#9CA3AF", marginTop: 6 }}>(최대 30초)</Text>
                  </>
                ) : (
                  <>
                    <Text style={{ fontSize: 40, marginBottom: 12 }}>
                      {result === "approved" ? "✅" : result === "manual_review" ? "🕒" : "❌"}
                    </Text>
                    <Text style={{ fontSize: 18, fontWeight: "800", color: "#111827", marginBottom: 8 }}>{labelFor(result)}</Text>
                    {result === "approved" && (
                      <Text style={{ fontSize: 14, color: "#6B7280", textAlign: "center" }}>탁카 서비스를 이용하실 수 있습니다.</Text>
                    )}
                    {result === "manual_review" && (
                      <Text style={{ fontSize: 14, color: "#6B7280", textAlign: "center" }}>담당자 검토 후 1–2 영업일 내 결과를 알려드립니다.</Text>
                    )}
                    {result === "rejected" && !!reason && (
                      <View style={{ backgroundColor: "#FEF2F2", borderRadius: 12, padding: 14, marginTop: 8, marginBottom: 16, width: "100%" }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: "#DC2626", marginBottom: 4 }}>반려 사유</Text>
                        <Text style={{ fontSize: 13, color: "#374151" }}>{reason}</Text>
                      </View>
                    )}
                    {result === "error" && (
                      <Text style={{ fontSize: 14, color: "#6B7280", textAlign: "center", marginBottom: 16 }}>잠시 후 다시 시도해주세요.</Text>
                    )}
                    {(result === "rejected" || result === "error") && (
                      <Pressable onPress={retry} style={{ backgroundColor: ORANGE, borderRadius: 12, padding: 16, marginTop: 8, alignSelf: "stretch" }}>
                        <Text style={{ color: "#fff", fontSize: 16, fontWeight: "800", textAlign: "center" }}>다시 시도하기</Text>
                      </Pressable>
                    )}
                  </>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
