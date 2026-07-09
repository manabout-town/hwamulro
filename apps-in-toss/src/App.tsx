import { useState } from "react"
import { appLogin } from "@apps-in-toss/web-framework"

// 백엔드(기존 Next/Vercel) 로그인 엔드포인트. 배포 시 실제 도메인으로.
const BACKEND = import.meta.env.VITE_BACKEND_URL ?? "https://takca.vercel.app"

export default function App() {
  const [status, setStatus] = useState<string>("")

  async function handleLogin() {
    try {
      setStatus("토스 로그인 중…")
      const { authorizationCode, referrer } = await appLogin()
      const res = await fetch(`${BACKEND}/api/apps-in-toss/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorizationCode, referrer }),
      })
      setStatus(res.ok ? "로그인 성공" : `로그인 실패: ${res.status}`)
    } catch (e) {
      setStatus(`오류: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 24, fontFamily: "-apple-system, sans-serif" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>
        탁<span style={{ color: "#F97316" }}>카</span>
      </h1>
      <p style={{ color: "#6B7280" }}>차량 탁송 직거래</p>
      <button onClick={handleLogin}
        style={{ background: "#F97316", color: "#fff", border: 0, borderRadius: 12,
          padding: "16px 28px", fontSize: 18, fontWeight: 700 }}>
        토스로 시작하기
      </button>
      <div style={{ color: "#9CA3AF", fontSize: 14 }}>{status}</div>
    </main>
  )
}
