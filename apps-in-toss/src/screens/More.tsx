import { useState } from "react"

// 콘솔 '앱 정보'에도 동일하게 등록하세요.
const BIZ = {
  service: "탁카",
  company: "에이치앤에이치(H&H)",
  ceo: "박효균",
  bizNo: "328-48-01175",
  mailOrder: "전자상거래 소매 중개업 (SNS 마켓)", // 통신판매업 신고번호(제0000호) 발급 시 교체
  address: "부산광역시 강서구 화전산단4로 74, 107동 1605호 (화전동, 우방아이유쉘)",
  support: "gurbsl12@naver.com",
  privacy: "gurbsl12@naver.com",
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: "1px solid #F3F4F6" }}>
      <button onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center",
          background: "none", border: 0, padding: "18px 2px", fontSize: 16, fontWeight: 700,
          color: "#111827", cursor: "pointer" }}>
        <span>{title}</span>
        <span style={{ color: "#9CA3AF", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>⌄</span>
      </button>
      {open && (
        <div style={{ padding: "0 2px 18px", fontSize: 14, lineHeight: 1.7, color: "#4B5563", whiteSpace: "pre-line" }}>
          {children}
        </div>
      )}
    </div>
  )
}

export default function More({ onBack, onLogout }: { onBack: () => void; onLogout: () => void }) {
  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: 24, fontFamily: "-apple-system, sans-serif" }}>
      <button onClick={onBack} style={{ background: "none", border: 0, color: "#6B7280", fontSize: 15, marginBottom: 12, cursor: "pointer" }}>← 뒤로</button>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: "#111827", marginBottom: 4 }}>더보기</h2>
      <p style={{ color: "#6B7280", fontSize: 14, marginBottom: 12 }}>고객센터 · 약관 · 개인정보 · 사업자 정보</p>

      <Section title="탁카는 어떤 서비스인가요">
        {`탁카는 차량을 옮기려는 화주와 카 캐리어 기사를 연결해 주는 중개 플랫폼이에요.
회사는 화주와 기사 간 탁송 계약의 직접 당사자가 아니며, 매칭과 정보 제공을 담당해요.
탁송료 결제·정산은 이 미니앱에서 제공하지 않으며, 매칭 이후 당사자 간 별도로 진행돼요.`}
      </Section>

      <Section title="고객센터 / 문의">
        {`서비스 이용, 분쟁, 신고 문의는 아래로 접수해 주세요.
영업일 기준 3일 이내에 답변드려요.

· 이메일: ${BIZ.support}
· 개인정보 문의: ${BIZ.privacy}`}
      </Section>

      <Section title="이용약관">
        {`제1조(목적) 본 약관은 탁카(이하 "회사")가 제공하는 차량 탁송 중개 서비스의 이용 조건을 정합니다.

제2조(서비스의 성격) ① 회사는 화주와 카 캐리어 기사 간의 거래를 중개하는 플랫폼 사업자로, 탁송 계약의 직접 당사자가 아닙니다. ② 탁송의 이행, 차량 상태, 손해 배상 등 계약상 책임은 화주와 기사 당사자에게 있습니다.

제3조(회원) 회원가입은 토스 로그인을 통해 이루어지며, 이용자는 정확한 정보를 제공해야 합니다.

제4조(금지행위) 이용자는 허위 정보 등록, 타인 사칭, 법령 위반 행위를 해서는 안 됩니다.

제5조(분쟁해결) 회사와 이용자 간 분쟁은 고객센터(${BIZ.support}) 접수 후 영업일 기준 3일 이내 답변하며, 관련 법령 및 상관례에 따라 해결합니다.

제6조(약관 변경) 약관 변경 시 최소 7일 전(이용자에게 불리한 변경은 30일 전) 앱 내 공지합니다.`}
      </Section>

      <Section title="개인정보처리방침">
        {`1. 수집 항목: 이름, 이메일, 휴대전화번호(토스 로그인 및 본인확인 과정에서 제공되는 정보), 탁송 주문·매칭 정보.

2. 수집 목적: 회원 식별, 탁송 중개 매칭, 고객 문의 대응, 부정 이용 방지.

3. 보유 기간: 회원 탈퇴 또는 미니앱 연결 해제 시 지체 없이 파기합니다. 단, 관련 법령상 보존 의무가 있는 경우 해당 기간 보관합니다.

4. 제3자 제공: 매칭 성사 시 거래 진행에 필요한 최소한의 정보가 상대방(화주↔기사)에게 제공됩니다. 그 외 목적으로는 제공하지 않습니다.

5. 이용자 권리: 개인정보 열람·정정·삭제·처리정지를 ${BIZ.privacy}로 요청하면 영업일 기준 10일 이내 처리합니다.

6. 개인정보 보호책임자: ${BIZ.privacy}`}
      </Section>

      <Section title="사업자 정보">
        {`· 서비스명: ${BIZ.service}
· 상호: ${BIZ.company}
· 대표자: ${BIZ.ceo}
· 사업자등록번호: ${BIZ.bizNo}
· 업종: ${BIZ.mailOrder}
· 사업장 주소: ${BIZ.address}
· 고객센터: ${BIZ.support}`}
      </Section>

      <button onClick={onLogout}
        style={{ marginTop: 24, width: "100%", background: "#fff", color: "#374151",
          border: "1px solid #E5E7EB", borderRadius: 12, padding: "14px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
        로그아웃
      </button>
    </main>
  )
}
