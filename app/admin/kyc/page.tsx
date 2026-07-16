import { createServiceClient } from "@/lib/supabase/service"
import { formatDate } from "@/lib/utils/format"
import { PageHeader } from "@/components/shared/PageHeader"
import { approveKYC, rejectKYC } from "./actions"
import type { KYCSubmissionStatus } from "@/lib/types"

type FilterTab = "all" | "review" | "approved" | "rejected"

const STATUS_LABEL: Record<KYCSubmissionStatus, string> = {
  pending: "대기 중",
  processing: "처리 중",
  approved: "승인됨",
  rejected: "거절됨",
  manual_review: "수동 검토",
}

const STATUS_COLOR: Record<KYCSubmissionStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  manual_review: "bg-orange-100 text-orange-700",
}

const ROLE_LABEL: Record<string, string> = {
  shipper: "화주",
  driver: "기사",
}

function confidenceColor(score: number): string {
  if (score >= 0.72) return "text-emerald-600"
  if (score >= 0.35) return "text-yellow-600"
  return "text-red-600"
}

export default async function AdminKYCPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const activeTab: FilterTab = (tab as FilterTab) || "all"

  // 관리자 전용(admin/layout 에서 role 검증) — 타 회원 PII 조회는 service-role 로.
  const service = createServiceClient()

  const { data: submissions } = await service
    .from("kyc_submissions")
    .select(`
      *,
      users!user_id(name, email, role, phone)
    `)
    .order("created_at", { ascending: false })

  const all = submissions ?? []

  const total = all.length
  const pendingReview = all.filter(
    (s) => s.status === "manual_review" || s.status === "pending"
  ).length
  const approved = all.filter((s) => s.status === "approved").length
  const rejected = all.filter((s) => s.status === "rejected").length

  const filtered =
    activeTab === "review"
      ? all.filter((s) => s.status === "manual_review" || s.status === "pending")
      : activeTab === "approved"
      ? all.filter((s) => s.status === "approved")
      : activeTab === "rejected"
      ? all.filter((s) => s.status === "rejected")
      : all

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "all", label: "전체", count: total },
    { key: "review", label: "검토필요", count: pendingReview },
    { key: "approved", label: "승인됨", count: approved },
    { key: "rejected", label: "거절됨", count: rejected },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="KYC 검토"
        description="사업자등록증 및 운전면허증 심사"
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="전체 제출" value={total} color="text-gray-900" bg="bg-white" />
        <StatCard label="검토 필요" value={pendingReview} color="text-orange-600" bg="bg-orange-50 border-orange-100" />
        <StatCard label="승인됨" value={approved} color="text-emerald-600" bg="bg-emerald-50 border-emerald-100" />
        <StatCard label="거절됨" value={rejected} color="text-red-600" bg="bg-red-50 border-red-100" />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {tabs.map((t) => (
          <a
            key={t.key}
            href={`/admin/kyc${t.key !== "all" ? `?tab=${t.key}` : ""}`}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === t.key
                ? "bg-[#FF6B2B] text-white shadow-sm"
                : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            {t.label}
            {t.count > 0 && (
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  activeTab === t.key ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"
                }`}
              >
                {t.count}
              </span>
            )}
          </a>
        ))}
      </div>

      {/* Submission list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center">
          <p className="text-3xl mb-3">📋</p>
          <p className="text-sm text-gray-400">해당하는 KYC 제출이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s: any) => {
            const user = s.users
            const score = s.confidence_score ?? null
            const isManualReview = s.status === "manual_review"

            return (
              <div
                key={s.id}
                className={`bg-white rounded-2xl border p-4 md:p-5 space-y-4 ${
                  isManualReview ? "border-orange-200" : "border-gray-100"
                }`}
              >
                {/* Header row */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-600 shrink-0">
                      {user?.name?.[0] ?? "?"}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900">{user?.name ?? "—"}</span>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                          {ROLE_LABEL[user?.role] ?? user?.role}
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[s.status as KYCSubmissionStatus] ?? "bg-gray-100 text-gray-600"}`}>
                          {STATUS_LABEL[s.status as KYCSubmissionStatus] ?? s.status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 flex flex-wrap gap-x-2">
                        <span>{user?.email}</span>
                        {user?.phone && <span>{user.phone}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 shrink-0">{formatDate(s.created_at)}</div>
                </div>

                {/* Confidence + documents */}
                <div className="flex flex-wrap gap-4 items-center">
                  {score !== null && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-gray-500">신뢰도</span>
                      <span className={`text-sm font-bold ${confidenceColor(score)}`}>
                        {Math.round(score * 100)}%
                      </span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {s.business_registration_url && (
                      <a
                        href={`/api/admin/kyc-signed-url?url=${encodeURIComponent(s.business_registration_url)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium transition-colors"
                      >
                        사업자등록증 ↗
                      </a>
                    )}
                    {s.driver_license_url && (
                      <a
                        href={`/api/admin/kyc-signed-url?url=${encodeURIComponent(s.driver_license_url)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium transition-colors"
                      >
                        운전면허증 ↗
                      </a>
                    )}
                  </div>
                </div>

                {/* Rejection reason display */}
                {s.status === "rejected" && s.rejection_reason && (
                  <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-xs text-red-700">
                    <span className="font-semibold">거절 사유: </span>{s.rejection_reason}
                  </div>
                )}

                {/* Approve / Reject actions (manual_review only) */}
                {isManualReview && (
                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <form
                      action={approveKYC.bind(null, s.id)}
                      className="flex-1"
                    >
                      <button
                        type="submit"
                        className="w-full py-2.5 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-semibold rounded-xl transition-colors"
                      >
                        승인
                      </button>
                    </form>
                    <RejectForm submissionId={s.id} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  color,
  bg,
}: {
  label: string
  value: number
  color: string
  bg: string
}) {
  return (
    <div className={`${bg} border border-gray-100 rounded-2xl p-4`}>
      <div className={`text-2xl md:text-3xl font-bold tracking-tight ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  )
}

function RejectForm({ submissionId }: { submissionId: string }) {
  return (
    <form
      action={async (formData: FormData): Promise<void> => {
        "use server"
        const reason = formData.get("reason") as string
        await rejectKYC(submissionId, reason || "관리자 거절")
      }}
      className="flex-1 flex gap-2"
    >
      <input
        name="reason"
        placeholder="거절 사유 (선택)"
        className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300"
      />
      <button
        type="submit"
        className="shrink-0 px-4 py-2.5 min-h-[44px] bg-red-500 hover:bg-red-600 active:bg-red-700 text-white text-sm font-semibold rounded-xl transition-colors"
      >
        거절
      </button>
    </form>
  )
}
