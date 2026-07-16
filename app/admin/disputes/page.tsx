import { createServiceClient } from "@/lib/supabase/service"
import { formatDate } from "@/lib/utils/format"
import { PageHeader } from "@/components/shared/PageHeader"
import Link from "next/link"

export default async function AdminDisputesPage() {
  // 관리자 전용(admin/layout 에서 role 검증) — 타 회원 PII 조회는 service-role 로.
  const service = createServiceClient()
  const { data: disputes } = await service
    .from("disputes")
    .select("*, raised_by_user:users!raised_by(name, email), matches(order_id, orders(origin, destination))")
    .order("created_at", { ascending: false })

  return (
    <div>
      <PageHeader title="분쟁 관리" description={`전체 ${disputes?.length || 0}건`} />
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead className="bg-gray-50 border-b">
              <tr>
                {["신고일", "구간", "신고자", "사유", "상태", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {disputes?.map((d: any) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(d.created_at)}</td>
                  <td className="px-4 py-3 font-medium whitespace-nowrap">
                    {d.matches?.orders?.origin} → {d.matches?.orders?.destination}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{d.raised_by_user?.name}</td>
                  <td className="px-4 py-3 max-w-[200px] truncate text-gray-600">{d.reason}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`badge ${
                      d.status === "resolved" ? "bg-green-100 text-green-700" :
                      d.status === "investigating" ? "bg-indigo-100 text-indigo-700" :
                      "bg-red-100 text-red-700"
                    }`}>
                      {d.status === "open" ? "미처리" : d.status === "investigating" ? "조사중" : "해결됨"}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link href={`/admin/disputes/${d.id}`} className="text-indigo-600 hover:underline text-xs min-h-[44px] inline-flex items-center">
                      상세
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(!disputes || disputes.length === 0) && (
          <div className="text-center py-12 text-gray-400 text-sm">분쟁 내역이 없습니다</div>
        )}
      </div>
    </div>
  )
}
