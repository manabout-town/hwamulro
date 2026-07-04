import { createServiceClient } from "@/lib/supabase/service"

// 경량 자체 관측성 — 에러를 error_logs에 기록. 로깅 자체는 절대 throw하지 않는다.
export async function logError(source: string, message: string, context?: Record<string, unknown>) {
  try {
    const service = createServiceClient()
    await service.from("error_logs").insert({ source, message, context: context ?? null })
  } catch (e) {
    console.error("[logError] failed to persist error log:", e)
  }
  console.error(`[${source}] ${message}`, context ?? "")
}
