import Link from "next/link"
import { LandingHeader } from "@/components/shared/LandingHeader"

export const metadata = { title: "제휴·광고 문의 | 탁카" }

// 광고주(중고차 전문 업체 등) 대상 제휴/광고 안내 페이지
export default function PartnershipPage() {
  const slots = [
    { name: "기사 의뢰 피드 배너", desc: "탁송 기사들이 매일 확인하는 의뢰 피드 상단", target: "기사" },
    { name: "오더보드 배너", desc: "기사·화주가 함께 보는 실시간 오더보드", target: "기사·화주" },
    { name: "커뮤니티 배너", desc: "중고차 거래(삽니다/팝니다) 게시판 — 중고차 업체 최적", target: "기사·화주" },
    { name: "대시보드 배너", desc: "로그인 직후 첫 화면 노출", target: "기사·화주" },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <LandingHeader />
      <main className="max-w-2xl mx-auto px-6 py-12 space-y-8">
        <div className="text-center">
          <div className="text-4xl mb-3">🤝</div>
          <h1 className="text-2xl font-bold text-gray-900">제휴·광고 문의</h1>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            탁카는 차량 탁송 기사와 화주가 매일 이용하는 플랫폼입니다.<br />
            중고차 매매·정비·보험·타이어 등 차량 관련 업체의 광고와 제휴를 환영합니다.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <h2 className="font-bold text-gray-900 text-sm">광고 게재 위치</h2>
          <div className="space-y-2">
            {slots.map(s => (
              <div key={s.name} className="flex items-start justify-between gap-3 bg-gray-50 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.desc}</p>
                </div>
                <span className="shrink-0 text-[10px] font-semibold bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full">
                  {s.target}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          <h2 className="font-bold text-gray-900 text-sm">문의 방법</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            아래 내용을 포함하여 이메일로 보내주시면 영업일 기준 2일 이내 회신드립니다.
          </p>
          <ul className="text-sm text-gray-600 space-y-1.5 list-disc pl-5">
            <li>업체명 / 담당자 / 연락처</li>
            <li>광고 희망 위치와 기간</li>
            <li>배너 소재 (가로형 이미지 권장, 10MB 이하)</li>
          </ul>
          <a
            href="mailto:partnership@takka.kr?subject=[제휴문의]"
            className="block w-full text-center py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors"
          >
            📧 partnership@takka.kr
          </a>
        </div>

        <p className="text-center">
          <Link href="/" className="text-xs text-gray-400 hover:text-gray-600">← 홈으로 돌아가기</Link>
        </p>
      </main>
    </div>
  )
}
