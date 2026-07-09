import { useEffect, useState, type ReactNode } from "react"
import { appLogin } from "@apps-in-toss/web-framework"
import { supabase } from "./lib/supabase"

const BACKEND = import.meta.env.VITE_BACKEND_URL ?? "https://takca.vercel.app"
const ORANGE = "#F97316"

type Role = "shipper" | "driver"
type View = "loading" | "entry" | "home"

function Center({ children }: { children: ReactNode }) {
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 20, padding: 24,
      fontFamily: "-apple-system, 'Apple SD Gothic Neo', sans-serif" }}>
      {children}
    </main>
  )
}
function Brand() {
  return <h1 style={{ fontSize: 30, fontWeight: 800 }}>탁<span style={{ color: ORANGE }}>카</span></h1>
}

export default function App() {
  const [view, setView] = useState<View>("loading")
  const [role, setRole] = useState<Role>("shipper")
  const [status, setStatus] = useState("")
  const [isNew, setIsNew] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setView(data.session ? "home" : "entry")
    })
  }, [])

  async function handleLogin() {
    try {
      setStatus("토스 로그인 중…")
      const { authorizationCode, referrer } = await appLogin()
      const res = await fetch(`${BACKEND}/api/apps-in-toss/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorizationCode, referrer, role }),
      })
      if (!res.ok) { setStatus(`로그인 실패: ${res.status}`); return }
      const data = await res.json()
      const { error } = await supabase.auth.setSession({
        access_token: data.accessToken,
        refresh_token: data.refreshToken,
      })
      if (error) { setStatus(`세션 오류: ${error.message}`); return }
      setIsNew(Boolean(data.isNew))
      setView("home")
    } catch (e) {
      setStatus(`오류: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setStatus("")
    setView("entry")
  }

  if (view === "loading") return <Center><p style={{ color: "#9CA3AF" }}>불러오는 중…</p></Center>

  if (view === "home") {
    return (
      <Center>
        <Brand />
        <p style={{ fontSize: 20, fontWeight: 700 }}>{isNew ? "환영합니다 🎉" : "다시 오셨어요"}</p>
        <p style={{ color: "#6B7280", textAlign: "center" }}>로그인 완료 · 곧 주문/입찰 화면이 열립니다</p>
        <button onClick={handleLogout}
          style={{ background: "#fff", color: "#374151", border: "1px solid #E5E7EB",
            borderRadius: 12, padding: "12px 22px", fontSize: 15, fontWeight: 600 }}>
          로그아웃
        </button>
      </Center>
    )
  }

  return (
    <Center>
      <Brand />
      <p style={{ color: "#6B7280" }}>차량 탁송 직거래</p>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        {(["shipper", "driver"] as Role[]).map((r) => (
          <button key={r} onClick={() => setRole(r)}
            style={{ padding: "14px 18px", borderRadius: 12, fontSize: 15, fontWeight: 700,
              cursor: "pointer",
              border: role === r ? `2px solid ${ORANGE}` : "1.5px solid #E5E7EB",
              background: role === r ? "#FFF3E9" : "#fff",
              color: role === r ? ORANGE : "#6B7280" }}>
            {r === "shipper" ? "화주 (차 맡기기)" : "기사 (탁송하기)"}
          </button>
        ))}
      </div>
      <button onClick={handleLogin}
        style={{ background: ORANGE, color: "#fff", border: 0, borderRadius: 12,
          padding: "16px 28px", fontSize: 18, fontWeight: 700, cursor: "pointer", marginTop: 4 }}>
        토스로 시작하기
      </button>
      <div style={{ color: "#9CA3AF", fontSize: 14, minHeight: 20 }}>{status}</div>
    </Center>
  )
}
