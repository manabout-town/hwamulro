"use client"
import { useEffect, useRef, useState } from "react"

declare global {
  interface Window {
    kakao: any
  }
}

// SVG Fallback (API 키 없을 때)
function RouteMapFallback({ origin, destination }: {
  origin: string
  destination: string
}) {
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-2xl overflow-hidden">
      <div className="px-5 py-4">
        <svg viewBox="0 0 440 100" xmlns="http://www.w3.org/2000/svg" className="w-full">
          <defs>
            <linearGradient id="rg" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#4F46E5" />
              <stop offset="100%" stopColor="#10B981" />
            </linearGradient>
            <marker id="arr" markerWidth="7" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 7 3, 0 6" fill="#10B981" />
            </marker>
          </defs>
          <line x1="80" y1="50" x2="360" y2="50" stroke="#E5E7EB" strokeWidth="1.5" strokeDasharray="6,5" />
          <path d="M 80 50 Q 220 15 360 50" fill="none" stroke="url(#rg)"
            strokeWidth="2.5" strokeLinecap="round" markerEnd="url(#arr)" />
          <circle cx="80" cy="50" r="11" fill="#4F46E5" />
          <text x="80" y="54" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">출</text>
          <circle cx="360" cy="50" r="11" fill="#10B981" />
          <text x="360" y="54" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">도</text>
        </svg>
        <div className="flex justify-between mt-1 px-1">
          <div>
            <div className="text-[9px] font-semibold text-indigo-500 uppercase tracking-wider">출발</div>
            <div className="text-xs font-medium text-gray-700 max-w-[160px] truncate">{origin}</div>
          </div>
          <div className="text-right">
            <div className="text-[9px] font-semibold text-emerald-500 uppercase tracking-wider">도착</div>
            <div className="text-xs font-medium text-gray-700 max-w-[160px] truncate">{destination}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface KakaoRouteMapProps {
  origin: string
  destination: string
}

export function KakaoRouteMap({ origin, destination }: KakaoRouteMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const [mapState, setMapState] = useState<"loading" | "ready" | "error">("loading")

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY
    if (!key) { setMapState("error"); return }

    const initMap = () => {
      if (!mapRef.current) return
      const { maps } = window.kakao
      const center = new maps.LatLng(36.5, 127.5)
      const map = new maps.Map(mapRef.current, { center, level: 10 })
      const geocoder = new maps.services.Geocoder()

      let oCoords: any = null
      let dCoords: any = null

      const tryRender = () => {
        if (!oCoords || !dCoords) return
        const bounds = new maps.LatLngBounds()
        bounds.extend(oCoords); bounds.extend(dCoords)
        map.setBounds(bounds, 60)

        // 출발 마커 (인디고)
        const oMarker = new maps.Marker({ map, position: oCoords, title: origin })
        const dMarker = new maps.Marker({ map, position: dCoords, title: destination })

        // 출발 오버레이
        const makeOverlay = (pos: any, label: string, color: string) => {
          const content = `<div style="
            background:${color};color:#fff;padding:3px 8px;border-radius:12px;
            font-size:11px;font-weight:700;white-space:nowrap;
            box-shadow:0 2px 6px rgba(0,0,0,0.25);
          ">${label}</div>`
          new maps.CustomOverlay({ map, position: pos, content, yAnchor: 2.2 })
        }
        makeOverlay(oCoords, "출발: " + origin, "#4F46E5")
        makeOverlay(dCoords, "도착: " + destination, "#10B981")

        // 경로선 (점선)
        new maps.Polyline({
          map,
          path: [oCoords, dCoords],
          strokeWeight: 3,
          strokeColor: "#4F46E5",
          strokeOpacity: 0.6,
          strokeStyle: "dashed",
        })

        setMapState("ready")
      }

      geocoder.addressSearch(origin, (res: any, status: any) => {
        if (status === maps.services.Status.OK) {
          oCoords = new maps.LatLng(parseFloat(res[0].y), parseFloat(res[0].x))
          tryRender()
        } else setMapState("error")
      })
      geocoder.addressSearch(destination, (res: any, status: any) => {
        if (status === maps.services.Status.OK) {
          dCoords = new maps.LatLng(parseFloat(res[0].y), parseFloat(res[0].x))
          tryRender()
        } else setMapState("error")
      })
    }

    if (window.kakao?.maps) {
      window.kakao.maps.load(initMap)
      return
    }

    const script = document.createElement("script")
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&libraries=services,geometry&autoload=false`
    script.onload = () => window.kakao.maps.load(initMap)
    script.onerror = () => setMapState("error")
    document.head.appendChild(script)
  }, [origin, destination])

  return (
    <div className="space-y-3">
      {/* 지도 */}
      {mapState === "error" ? (
        <RouteMapFallback origin={origin} destination={destination} />
      ) : (
        <div className="relative">
          <div
            ref={mapRef}
            className="w-full h-56 rounded-2xl border border-gray-100 bg-gray-100"
          />
          {mapState === "loading" && (
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-gray-100">
              <div className="text-xs text-gray-400 animate-pulse">지도 로딩 중...</div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}
