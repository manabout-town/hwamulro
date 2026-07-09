// 광고 배너 게재 위치
export const AD_PLACEMENTS = [
  "driver_feed",
  "order_board",
  "community",
  "shipper_dashboard",
  "driver_dashboard",
] as const

export type AdPlacement = (typeof AD_PLACEMENTS)[number]
