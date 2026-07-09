"use client"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { COMMUNITY_CATEGORIES } from "./constants"

export function CategoryTabs() {
  const searchParams = useSearchParams()
  const current = searchParams.get("category") || ""

  const tabs = [{ key: "", label: "전체", icon: "📋" }, ...COMMUNITY_CATEGORIES]

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
      {tabs.map(tab => {
        const active = current === tab.key
        return (
          <Link
            key={tab.key}
            href={tab.key ? `/community?category=${tab.key}` : "/community"}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold transition-colors ${
              active
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            <span className="text-xs">{tab.icon}</span>
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
