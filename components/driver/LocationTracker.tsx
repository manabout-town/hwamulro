"use client"
import { useEffect, useRef, useState } from "react"
import { getLocationConsent, grantLocationConsent, pushDriverLocation } from "@/app/actions/location"

interface Props {
  driverId: string
  matchId?: string | null
  active: boolean
}

export function LocationTracker({ matchId, active }: Props) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [consent, setConsent] = useState<boolean | null>(null)
  const [granting, setGranting] = useState(false)

  // 동의 여부 확인
  useEffect(() => {
    if (!active) return
    getLocationConsent().then((r) => setConsent(r.consented))
  }, [active])

  async function pushLocation() {
    if (!navigator.geolocation || !matchId) return
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const res = await pushDriverLocation({
          matchId,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading ?? null,
          speed: pos.coords.speed ?? null,
        })
        // 동의 철회/미동의 감지 시 추적 중단
        if ((res as { error?: string })?.error === "no_consent") {
          setConsent(false)
          if (intervalRef.current) clearInterval(intervalRef.current)
        }
      },
      undefined,
      { enableHighAccuracy: true, maximumAge: 10000 }
    )
  }

  useEffect(() => {
    if (!active || consent !== true) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    pushLocation()
    intervalRef.current = setInterval(pushLocation, 30_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [active, matchId, consent])

  async function handleGrant() {
    setGranting(true)
    const res = await grantLocationConsent()
    setGranting(false)
    if (!(res as { error?: string })?.error) setConsent(true)
  }

  // 미동의 상태에서 진행 중 거래가 있으면 동의 배너 노출
  if (active && consent === false) {
    return (
      <div className="fixed bottom-0 inset-x-0 z-50 p-4 bg-white border-t border-gray-200 shadow-lg">
        <p className="text-sm font-semibold text-gray-900 mb-1">실시간 위치 공유 동의</p>
        <p className="text-xs text-gray-500 mb-3">
          진행 중인 탁송의 화주에게 실시간 위치를 공유합니다. 위치정보는 탁송 진행 중에만
          수집되며 완료 시 파기됩니다. 마이페이지에서 언제든 철회할 수 있습니다.
        </p>
        <button
          onClick={handleGrant}
          disabled={granting}
          className="w-full py-2.5 rounded-xl bg-orange-500 text-white text-sm font-semibold disabled:opacity-60"
        >
          {granting ? "처리 중…" : "동의하고 위치 공유 시작"}
        </button>
      </div>
    )
  }

  return null
}
