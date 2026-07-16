"use client"
import { useState, useEffect, useRef, useTransition } from "react"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"
import { formatKRW } from "@/lib/utils/format"
import { requestCompletion, confirmCompletion, confirmStart } from "@/app/actions/orders"
import { CargoPhotoSection } from "@/components/shared/CargoPhotoSection"
import { ConditionReportView } from "@/components/shared/ConditionReportView"
import type { User } from "@/lib/types"
import type { ConditionReport } from "@/components/shared/ConditionReportView"

interface Message {
  id: string
  match_id: string
  sender_id: string
  message: string
  sent_at: string
  sender?: { id: string; name: string; role: string }
}

interface ChatWindowProps {
  match: any
  currentUser: User
  initialMessages: Message[]
  isShipper: boolean
  pickupReport: ConditionReport | null
  deliveryReport: ConditionReport | null
}

export function ChatWindow({
  match,
  currentUser,
  initialMessages,
  isShipper,
  pickupReport,
  deliveryReport,
}: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [showReports, setShowReports] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const order = match.orders
  const otherUser = isShipper ? match.drivers : order?.shippers

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  useEffect(() => {
    const channel = supabase
      .channel(`chat:${match.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chats",
          filter: `match_id=eq.${match.id}`,
        },
        (payload) => {
          const newMsg = payload.new as Message
          // 1:1 채팅이라 발신자는 본인 아니면 상대. users 를 다시 조회하지 않고
          // 이미 가진 currentUser/otherUser 로 이름을 붙인다(타인 users 조회 RLS 차단 대응).
          const sender = newMsg.sender_id === currentUser.id
            ? { id: currentUser.id, name: currentUser.name, role: currentUser.role }
            : otherUser
              ? { id: otherUser.id, name: otherUser.name, role: otherUser.role }
              : undefined
          setMessages(prev => [...prev, { ...newMsg, sender }])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  // supabase client is a stable singleton from createBrowserClient
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id])

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || sending) return
    setSending(true)
    const text = input.trim()
    setInput("")
    await supabase.from("chats").insert({
      match_id: match.id,
      sender_id: currentUser.id,
      message: text,
      sent_at: new Date().toISOString(),
    })
    setSending(false)
  }

  const completionRequested = messages.some(m => m.message === "SYSTEM:COMPLETION_REQUESTED")
  const statusLabel =
    match.status === "accepted" ? "매칭 완료" :
    match.status === "in_progress" ? "운송 중" :
    match.status === "completed" ? "완료" : match.status

  const statusStyle =
    match.status === "completed" ? "bg-emerald-50 text-emerald-700" :
    match.status === "in_progress" ? "bg-indigo-50 text-indigo-700" :
    "bg-amber-50 text-amber-700"

  const hasAnyReport = !!(pickupReport || deliveryReport)
  const reportCount = [pickupReport, deliveryReport].filter(Boolean).length

  return (
    <div className="flex flex-col h-[100dvh] max-w-2xl mx-auto bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shrink-0 safe-top">
        <Link
          href={isShipper ? `/shipper/orders/${order?.id}` : "/driver/matches"}
          className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors text-lg shrink-0"
        >
          ←
        </Link>
        <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-700 shrink-0">
          {otherUser?.name?.[0] || "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-gray-900 truncate">{otherUser?.name}</div>
          <div className="text-xs text-gray-400 truncate">
            {order?.origin} → {order?.destination}
            <span className="mx-1.5 text-gray-200">|</span>
            {formatKRW(order?.price)}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Condition reports button */}
          {(hasAnyReport || !isShipper) && (match.status === "accepted" || match.status === "in_progress" || hasAnyReport) && (
            <button
              onClick={() => setShowReports(v => !v)}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                hasAnyReport
                  ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              📋 {reportCount > 0 ? `${reportCount}/2` : "리포트"}
            </button>
          )}
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusStyle}`}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Condition Reports Panel */}
      {showReports && (
        <div className="bg-white border-b border-gray-100 px-4 py-4 space-y-4 shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">차량 상태 리포트</h3>
            <button onClick={() => setShowReports(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">픽업 전</p>
            <ConditionReportView report={pickupReport} type="pickup" isShipper={isShipper} />
          </div>
          {(match.status === "in_progress" || match.status === "completed" || deliveryReport) && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">인도 후</p>
              <ConditionReportView report={deliveryReport} type="delivery" isShipper={isShipper} />
            </div>
          )}
          {/* Driver: link to submit report */}
          {!isShipper && match.status !== "completed" && match.status !== "cancelled" && (
            <Link
              href={`/driver/matches/${match.id}/condition-report?type=${match.status === "accepted" ? "pickup" : "delivery"}`}
              className="block w-full text-center py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              {match.status === "accepted" ? "픽업 전 리포트 작성" : "인도 후 리포트 작성"}
            </Link>
          )}
        </div>
      )}

      {/* Action banners */}
      {match.status === "accepted" && !isShipper && (
        <div className="bg-indigo-50 border-b border-indigo-100 px-4 py-2.5 flex items-center justify-between shrink-0">
          <span className="text-sm text-indigo-700">운송을 시작하셨나요?</span>
          <button
            disabled={isPending}
            onClick={() => startTransition(async () => { await confirmStart(match.id) })}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 min-h-[44px] min-w-[80px] rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            {isPending ? "처리 중..." : "운송 시작"}
          </button>
        </div>
      )}
      {match.status === "in_progress" && !isShipper && !completionRequested && (
        <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-2.5 flex items-center justify-between shrink-0">
          <span className="text-sm text-emerald-700">운송을 완료하셨나요?</span>
          <button
            disabled={isPending}
            onClick={() => startTransition(async () => { await requestCompletion(match.id) })}
            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 min-h-[44px] min-w-[80px] rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            {isPending ? "처리 중..." : "완료 요청"}
          </button>
        </div>
      )}
      {completionRequested && isShipper && match.status !== "completed" && (
        <div className="bg-amber-50 border-b border-amber-100 px-4 py-3 flex items-center justify-between shrink-0">
          <div>
            <div className="text-sm font-semibold text-amber-800">기사님이 완료를 요청했습니다</div>
            <div className="text-xs text-amber-600 mt-0.5">확인 시 에스크로가 해제됩니다</div>
          </div>
          <button
            disabled={isPending}
            onClick={() => startTransition(async () => { await confirmCompletion(match.id) })}
            className="text-sm bg-amber-500 hover:bg-amber-600 text-white px-4 min-h-[44px] min-w-[80px] rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            {isPending ? "처리 중..." : "완료 확인"}
          </button>
        </div>
      )}

      {/* Pickup report nudge for driver */}
      {!isShipper && match.status === "accepted" && !pickupReport && (
        <div className="bg-amber-50 border-b border-amber-100 px-4 py-2.5 flex items-center justify-between shrink-0">
          <span className="text-xs text-amber-700">픽업 전 차량 상태를 기록하세요</span>
          <Link
            href={`/driver/matches/${match.id}/condition-report?type=pickup`}
            className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg font-semibold transition-colors"
          >
            기록하기
          </Link>
        </div>
      )}
      {!isShipper && match.status === "in_progress" && !deliveryReport && (
        <div className="bg-amber-50 border-b border-amber-100 px-4 py-2.5 flex items-center justify-between shrink-0">
          <span className="text-xs text-amber-700">인도 후 차량 상태를 기록하세요</span>
          <Link
            href={`/driver/matches/${match.id}/condition-report?type=delivery`}
            className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg font-semibold transition-colors"
          >
            기록하기
          </Link>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 text-sm py-10">
            매칭이 확정되었습니다! 먼저 인사를 건네보세요 👋
          </div>
        )}
        {messages.map((msg) => {
          if (msg.message === "SYSTEM:COMPLETION_REQUESTED") {
            return (
              <div key={msg.id} className="flex justify-center py-1">
                <span className="text-xs bg-gray-100 text-gray-500 px-3 py-1.5 rounded-full">
                  기사님이 운송 완료를 요청했습니다
                </span>
              </div>
            )
          }
          const isMe = msg.sender_id === currentUser.id
          return (
            <div key={msg.id} className={`flex items-end gap-2 ${isMe ? "justify-end" : "justify-start"}`}>
              {!isMe && (
                <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700 shrink-0">
                  {msg.sender?.name?.[0] || "?"}
                </div>
              )}
              <div className={`max-w-[72%] flex flex-col gap-1 ${isMe ? "items-end" : "items-start"}`}>
                {!isMe && (
                  <span className="text-xs text-gray-400 ml-1">{msg.sender?.name}</span>
                )}
                <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  isMe
                    ? "bg-orange-500 text-white rounded-br-sm"
                    : "bg-white border border-gray-100 text-gray-800 rounded-bl-sm shadow-sm"
                }`}>
                  {msg.message}
                </div>
                <span className="text-[10px] text-gray-400 px-1">
                  {new Date(msg.sent_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Cargo photos */}
      <CargoPhotoSection
        matchId={match.id}
        isDriver={!isShipper}
        matchStatus={match.status}
      />

      {/* Input */}
      <div className="bg-white border-t border-gray-100 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shrink-0">
        {match.status === "completed" ? (
          <div className="text-center text-sm text-gray-400 py-1">거래가 완료되었습니다</div>
        ) : (
          <form onSubmit={sendMessage} className="flex gap-2">
            <input
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-all bg-gray-50 min-h-[44px]"
              placeholder="메시지를 입력하세요..."
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={sending}
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              className="bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white px-5 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold disabled:opacity-40 transition-colors shrink-0"
            >
              전송
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
