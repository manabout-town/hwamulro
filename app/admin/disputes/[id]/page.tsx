import { createServiceClient } from "@/lib/supabase/service"
import { notFound } from "next/navigation"
import { formatKRW, formatDate } from "@/lib/utils/format"
import { resolveDispute } from "@/app/actions/admin"
import { Card, CardBody, CardHeader } from "@/components/ui/Card"

export default async function AdminDisputeDetail({ params }: { params: { id: string } }) {
  // 관리자 전용(admin/layout 에서 role 검증) — 타 회원 PII 조회는 service-role 로.
  const service = createServiceClient()

  const { data: dispute } = await service
    .from("disputes")
    .select(`
      *,
      raised_by_user:users!raised_by(name, email, phone),
      matches(
        *,
        orders(*, shippers:users!shipper_id(name, email, phone)),
        drivers:users!driver_id(name, email, phone),
        escrow(*)
      )
    `)
    .eq("id", params.id)
    .single()

  if (!dispute) notFound()

  const match = dispute.matches as any
  const order = match?.orders
  const escrow = match?.escrow?.[0]

  return (
    <div className="max-w-3xl mx-auto px-0 md:px-0">
      <div className="flex items-center gap-3 mb-6">
        <a href="/admin/disputes" className="text-sm text-gray-500 hover:text-gray-700 min-h-[44px] inline-flex items-center">← 분쟁 목록</a>
        <span className={`badge ${
          dispute.status === "open" ? "bg-red-100 text-red-700" :
          dispute.status === "investigating" ? "bg-indigo-100 text-indigo-700" :
          "bg-green-100 text-green-700"
        }`}>
          {dispute.status === "open" ? "미처리" : dispute.status === "investigating" ? "조사중" : "해결됨"}
        </span>
      </div>

      <div className="grid gap-5">
        <Card>
          <CardHeader><h2 className="font-bold">신고 내용</h2></CardHeader>
          <CardBody>
            <p className="text-gray-700">{dispute.reason}</p>
            <div className="mt-3 text-sm text-gray-500">신고자: {dispute.raised_by_user?.name} | {formatDate(dispute.created_at)}</div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><h2 className="font-bold">거래 정보</h2></CardHeader>
          <CardBody className="space-y-3 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-gray-500 mb-1">화주</div>
                <div className="font-medium">{order?.shippers?.name}</div>
                <div className="text-gray-500">{order?.shippers?.phone}</div>
              </div>
              <div>
                <div className="text-gray-500 mb-1">기사</div>
                <div className="font-medium">{match?.drivers?.name}</div>
                <div className="text-gray-500">{match?.drivers?.phone}</div>
              </div>
            </div>
            <div className="pt-3 border-t">
              <div className="flex justify-between mb-1">
                <span className="text-gray-500">구간</span>
                <span>{order?.origin} → {order?.destination}</span>
              </div>
              <div className="flex justify-between mb-1">
                <span className="text-gray-500">에스크로 금액</span>
                <span className="font-bold text-indigo-700">{formatKRW(escrow?.total_amount || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">에스크로 상태</span>
                <span>{escrow?.status || "없음"}</span>
              </div>
            </div>
          </CardBody>
        </Card>

        {dispute.status !== "resolved" && (
          <Card>
            <CardHeader><h2 className="font-bold text-red-600">중재 처리</h2></CardHeader>
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <form action={async () => { "use server"; await resolveDispute(dispute.id, "driver_win") }}>
                  <button type="submit" className="w-full py-3 min-h-[52px] bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 active:bg-green-800">
                    ✓ 기사 승리<br/><span className="text-xs opacity-80">(에스크로 해제)</span>
                  </button>
                </form>
                <form action={async () => { "use server"; await resolveDispute(dispute.id, "shipper_win") }}>
                  <button type="submit" className="w-full py-3 min-h-[52px] bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 active:bg-indigo-800">
                    ↩ 화주 승리<br/><span className="text-xs opacity-80">(화주 환불)</span>
                  </button>
                </form>
                <form action={async () => { "use server"; await resolveDispute(dispute.id, "partial_refund") }}>
                  <button type="submit" className="w-full py-3 min-h-[52px] bg-yellow-600 text-white rounded-xl text-sm font-semibold hover:bg-yellow-700 active:bg-yellow-800">
                    ⚖ 절충 처리<br/><span className="text-xs opacity-80">(50% 분할)</span>
                  </button>
                </form>
              </div>
            </CardBody>
          </Card>
        )}

        {dispute.status === "resolved" && (
          <div className="bg-green-50 rounded-xl p-4 text-sm text-green-700 text-center">
            ✓ 해결됨: {dispute.resolution} | {dispute.resolved_at ? formatDate(dispute.resolved_at) : ""}
          </div>
        )}
      </div>
    </div>
  )
}
