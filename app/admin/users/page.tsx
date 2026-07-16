import { createServiceClient } from "@/lib/supabase/service"
import { formatDate } from "@/lib/utils/format"
import { PageHeader } from "@/components/shared/PageHeader"

const ROLE_LABEL: Record<string, string> = { shipper: "화주", driver: "기사", admin: "관리자" }
const ROLE_STYLE: Record<string, string> = {
  admin: "bg-indigo-100 text-indigo-700",
  driver: "bg-emerald-100 text-emerald-700",
  shipper: "bg-sky-100 text-sky-700",
}
const STATUS_LABEL: Record<string, string> = { active: "활성", suspended: "정지", pending: "대기" }
const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  suspended: "bg-red-100 text-red-700",
  pending: "bg-gray-100 text-gray-500",
}

export default async function AdminUsersPage() {
  // 관리자 전용(admin/layout 에서 role 검증) — 전 회원 조회는 service-role 로.
  const service = createServiceClient()
  const { data: users } = await service
    .from("users")
    .select("*")
    .order("created_at", { ascending: false })

  return (
    <div>
      <PageHeader title="회원 관리" description={`총 ${users?.length || 0}명`} />
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {["이름", "이메일", "연락처", "역할", "상태", "가입일"].map(h => (
                  <th key={h} className="px-4 md:px-5 py-3 text-left text-xs font-semibold text-gray-400 tracking-wide whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users?.map((u: any) => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 md:px-5 py-3 md:py-3.5 font-medium text-gray-900 whitespace-nowrap">{u.name}</td>
                  <td className="px-4 md:px-5 py-3 md:py-3.5 text-gray-500 max-w-[180px] truncate">{u.email}</td>
                  <td className="px-4 md:px-5 py-3 md:py-3.5 text-gray-500 whitespace-nowrap">{u.phone || "—"}</td>
                  <td className="px-4 md:px-5 py-3 md:py-3.5">
                    <span className={`badge ${ROLE_STYLE[u.role] || "bg-gray-100 text-gray-600"}`}>
                      {ROLE_LABEL[u.role] || u.role}
                    </span>
                  </td>
                  <td className="px-4 md:px-5 py-3 md:py-3.5">
                    <span className={`badge ${STATUS_STYLE[u.status] || "bg-gray-100 text-gray-500"}`}>
                      {STATUS_LABEL[u.status] || u.status}
                    </span>
                  </td>
                  <td className="px-4 md:px-5 py-3 md:py-3.5 text-gray-400 text-xs whitespace-nowrap">{formatDate(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {(!users || users.length === 0) && (
          <div className="py-12 text-center text-sm text-gray-400">등록된 회원이 없습니다</div>
        )}
      </div>
    </div>
  )
}
