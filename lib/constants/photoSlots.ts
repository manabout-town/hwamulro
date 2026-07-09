// 탁송 전/후 의무 촬영 슬롯 (8장) — 대조 목적
export interface PhotoSlot {
  key: string
  label: string
  icon: string
  hint: string
}

export const PHOTO_SLOTS: PhotoSlot[] = [
  { key: "front",     label: "전면",     icon: "🚗", hint: "차량 앞면 전체가 보이게" },
  { key: "rear",      label: "후면",     icon: "🚙", hint: "차량 뒷면 전체가 보이게" },
  { key: "left",      label: "좌측면",   icon: "⬅️", hint: "운전석 쪽 측면 전체" },
  { key: "right",     label: "우측면",   icon: "➡️", hint: "조수석 쪽 측면 전체" },
  { key: "roof",      label: "지붕",     icon: "🔝", hint: "차량 상단(루프) 상태" },
  { key: "vin",       label: "차대번호", icon: "🔢", hint: "차대번호가 선명하게 보이게" },
  { key: "key",       label: "차키",     icon: "🔑", hint: "인수한 차키 전체" },
  { key: "dashboard", label: "계기판",   icon: "📟", hint: "주행거리·연료량이 보이게" },
]

export const PHOTO_SLOT_KEYS = PHOTO_SLOTS.map(s => s.key)

export const PHOTO_SLOT_LABEL: Record<string, string> = Object.fromEntries(
  PHOTO_SLOTS.map(s => [s.key, s.label])
)
