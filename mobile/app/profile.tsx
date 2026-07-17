import { useCallback, useEffect, useState } from "react"
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { router } from "expo-router"
import { supabase } from "../lib/supabase"
import { useAuth } from "../lib/auth"

const ORANGE = "#F97316"
const BORDER = "#E5E7EB"

type VerificationStatus = "unverified" | "pending" | "verified" | "rejected"

function badgeFor(status: VerificationStatus | null): { label: string; bg: string; fg: string } {
  switch (status) {
    case "verified": return { label: "인증완료", bg: "#E7F8F1", fg: "#12B589" }
    case "pending": return { label: "심사중", bg: "#FEF9C3", fg: "#A16207" }
    case "rejected": return { label: "인증반려", bg: "#FEE2E2", fg: "#DC2626" }
    default: return { label: "미인증", bg: "#F3F4F6", fg: "#6B7280" }
  }
}

export default function Profile() {
  const { role } = useAuth()
  const isDriver = role === "driver"

  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | null>(null)

  const [vehicleNumber, setVehicleNumber] = useState("")
  const [vehicleType, setVehicleType] = useState("")
  const [homeRegion, setHomeRegion] = useState("")
  const [routeRegions, setRouteRegions] = useState("")

  const [companyName, setCompanyName] = useState("")
  const [businessNumber, setBusinessNumber] = useState("")

  const [basicMsg, setBasicMsg] = useState("")
  const [roleMsg, setRoleMsg] = useState("")
  const [savingBasic, setSavingBasic] = useState(false)
  const [savingRole, setSavingRole] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)

    const { data: userRow } = await supabase
      .from("users")
      .select("name, phone, verification_status")
      .eq("id", user.id)
      .single()
    if (userRow) {
      setName(userRow.name ?? "")
      setPhone(userRow.phone ?? "")
      setVerificationStatus((userRow.verification_status as VerificationStatus) ?? "unverified")
    }

    if (role === "driver") {
      const { data: dp } = await supabase
        .from("driver_profiles")
        .select("vehicle_number, vehicle_type, home_region, route_regions")
        .eq("user_id", user.id)
        .single()
      if (dp) {
        setVehicleNumber(dp.vehicle_number ?? "")
        setVehicleType(dp.vehicle_type ?? "")
        setHomeRegion(dp.home_region ?? "")
        setRouteRegions((dp.route_regions ?? []).join(", "))
      }
    } else if (role === "shipper") {
      const { data: sp } = await supabase
        .from("shipper_profiles")
        .select("company_name, business_number")
        .eq("user_id", user.id)
        .single()
      if (sp) {
        setCompanyName(sp.company_name ?? "")
        setBusinessNumber(sp.business_number ?? "")
      }
    }

    setLoading(false)
  }, [role])

  useEffect(() => { load() }, [load])

  const PHONE_RE = /^01[0-9]\d{7,8}$/

  async function saveBasicInfo() {
    if (!userId) return
    const trimmedName = name.trim()
    const cleanedPhone = phone.replace(/-/g, "").trim()

    if (!trimmedName) { setBasicMsg("이름을 입력해주세요"); return }
    if (trimmedName.length > 20) { setBasicMsg("이름은 20자 이하여야 합니다"); return }
    if (cleanedPhone && !PHONE_RE.test(cleanedPhone)) {
      setBasicMsg("올바른 휴대폰 번호를 입력해주세요 (예: 01012345678)")
      return
    }

    setSavingBasic(true)
    setBasicMsg("")
    const { error } = await supabase
      .from("users")
      .update({ name: trimmedName, phone: cleanedPhone || null })
      .eq("id", userId)
    setSavingBasic(false)
    setBasicMsg(error ? `오류: ${error.message}` : "저장되었어요")
  }

  async function saveDriverInfo() {
    if (!userId) return
    const trimmedNumber = vehicleNumber.trim()
    const trimmedType = vehicleType.trim()
    if (!trimmedNumber) { setRoleMsg("차량번호를 입력해주세요"); return }
    if (!trimmedType) { setRoleMsg("차량 종류를 선택해주세요"); return }

    const regions = routeRegions.split(",").map(r => r.trim()).filter(Boolean)

    setSavingRole(true)
    setRoleMsg("")
    const { error } = await supabase
      .from("driver_profiles")
      .update({
        vehicle_number: trimmedNumber,
        vehicle_type: trimmedType,
        home_region: homeRegion.trim() || null,
        route_regions: regions,
      })
      .eq("user_id", userId)
    setSavingRole(false)
    setRoleMsg(error ? `오류: ${error.message}` : "저장되었어요")
  }

  async function saveShipperInfo() {
    if (!userId) return
    setSavingRole(true)
    setRoleMsg("")
    const { error } = await supabase
      .from("shipper_profiles")
      .update({
        company_name: companyName.trim() || null,
        business_number: businessNumber.trim() || null,
      })
      .eq("user_id", userId)
    setSavingRole(false)
    setRoleMsg(error ? `오류: ${error.message}` : "저장되었어요")
  }

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["top"]}>
        <ActivityIndicator color={ORANGE} style={{ marginTop: 60 }} />
      </SafeAreaView>
    )
  }

  const badge = badgeFor(verificationStatus)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: "#6B7280", fontSize: 15, marginBottom: 12 }}>← 뒤로</Text>
        </Pressable>

        <Text style={{ fontSize: 22, fontWeight: "800", color: "#111827", marginBottom: 4 }}>내 프로필</Text>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8, marginBottom: 20 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: badge.fg, backgroundColor: badge.bg, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8 }}>
            {badge.label}
          </Text>
        </View>

        {verificationStatus !== "verified" && (
          <Pressable
            onPress={() => router.push("/verification")}
            style={{ backgroundColor: "#FFF7ED", borderWidth: 1.5, borderColor: "#FED7AA", borderRadius: 14, padding: 16, marginBottom: 24 }}
          >
            <Text style={{ fontSize: 15, fontWeight: "800", color: "#9A3412" }}>본인 인증하기 →</Text>
          </Pressable>
        )}

        <Text style={{ fontSize: 16, fontWeight: "800", color: "#111827", marginBottom: 12 }}>기본 정보</Text>

        <Text style={{ fontSize: 13, color: "#6B7280", marginBottom: 6 }}>이름</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="이름"
          style={{ borderWidth: 1.5, borderColor: BORDER, borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 14 }}
        />

        <Text style={{ fontSize: 13, color: "#6B7280", marginBottom: 6 }}>휴대폰 번호</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="01012345678"
          keyboardType="number-pad"
          style={{ borderWidth: 1.5, borderColor: BORDER, borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 14 }}
        />

        {!!basicMsg && <Text style={{ fontSize: 13, color: basicMsg.startsWith("오류") ? "#DC2626" : "#12B589", marginBottom: 10 }}>{basicMsg}</Text>}

        <Pressable onPress={saveBasicInfo} disabled={savingBasic} style={{ backgroundColor: ORANGE, borderRadius: 12, padding: 14, opacity: savingBasic ? 0.6 : 1, marginBottom: 28 }}>
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800", textAlign: "center" }}>{savingBasic ? "저장 중…" : "기본 정보 저장"}</Text>
        </Pressable>

        {isDriver && (
          <>
            <Text style={{ fontSize: 16, fontWeight: "800", color: "#111827", marginBottom: 12 }}>차량 정보</Text>

            <Text style={{ fontSize: 13, color: "#6B7280", marginBottom: 6 }}>차량번호</Text>
            <TextInput
              value={vehicleNumber}
              onChangeText={setVehicleNumber}
              placeholder="12가 3456"
              style={{ borderWidth: 1.5, borderColor: BORDER, borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 14 }}
            />

            <Text style={{ fontSize: 13, color: "#6B7280", marginBottom: 6 }}>차량 종류</Text>
            <TextInput
              value={vehicleType}
              onChangeText={setVehicleType}
              placeholder="예: 1톤 카캐리어"
              style={{ borderWidth: 1.5, borderColor: BORDER, borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 14 }}
            />

            <Text style={{ fontSize: 13, color: "#6B7280", marginBottom: 6 }}>거점 지역</Text>
            <TextInput
              value={homeRegion}
              onChangeText={setHomeRegion}
              placeholder="예: 서울"
              style={{ borderWidth: 1.5, borderColor: BORDER, borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 14 }}
            />

            <Text style={{ fontSize: 13, color: "#6B7280", marginBottom: 6 }}>운행 가능 지역 (콤마로 구분)</Text>
            <TextInput
              value={routeRegions}
              onChangeText={setRouteRegions}
              placeholder="서울, 경기, 인천"
              style={{ borderWidth: 1.5, borderColor: BORDER, borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 14 }}
            />

            {!!roleMsg && <Text style={{ fontSize: 13, color: roleMsg.startsWith("오류") ? "#DC2626" : "#12B589", marginBottom: 10 }}>{roleMsg}</Text>}

            <Pressable onPress={saveDriverInfo} disabled={savingRole} style={{ backgroundColor: ORANGE, borderRadius: 12, padding: 14, opacity: savingRole ? 0.6 : 1 }}>
              <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800", textAlign: "center" }}>{savingRole ? "저장 중…" : "차량 정보 저장"}</Text>
            </Pressable>
          </>
        )}

        {!isDriver && role === "shipper" && (
          <>
            <Text style={{ fontSize: 16, fontWeight: "800", color: "#111827", marginBottom: 12 }}>사업자 정보</Text>

            <Text style={{ fontSize: 13, color: "#6B7280", marginBottom: 6 }}>회사명</Text>
            <TextInput
              value={companyName}
              onChangeText={setCompanyName}
              placeholder="회사명"
              style={{ borderWidth: 1.5, borderColor: BORDER, borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 14 }}
            />

            <Text style={{ fontSize: 13, color: "#6B7280", marginBottom: 6 }}>사업자등록번호</Text>
            <TextInput
              value={businessNumber}
              onChangeText={setBusinessNumber}
              placeholder="123-45-67890"
              style={{ borderWidth: 1.5, borderColor: BORDER, borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 14 }}
            />

            {!!roleMsg && <Text style={{ fontSize: 13, color: roleMsg.startsWith("오류") ? "#DC2626" : "#12B589", marginBottom: 10 }}>{roleMsg}</Text>}

            <Pressable onPress={saveShipperInfo} disabled={savingRole} style={{ backgroundColor: ORANGE, borderRadius: 12, padding: 14, opacity: savingRole ? 0.6 : 1 }}>
              <Text style={{ color: "#fff", fontSize: 15, fontWeight: "800", textAlign: "center" }}>{savingRole ? "저장 중…" : "사업자 정보 저장"}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
