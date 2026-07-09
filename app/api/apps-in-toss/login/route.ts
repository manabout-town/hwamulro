import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createServiceClient } from "@/lib/supabase/service"
import { exchangeTossCode, fetchTossUser } from "@/lib/apps-in-toss/tossLogin"
import { resolveUserByTossKey, shadowEmail } from "@/lib/apps-in-toss/identity"
import { mintSupabaseSession } from "@/lib/apps-in-toss/tossSession"
import { handleTossLogin } from "@/lib/apps-in-toss/loginFlow"
import { createMtlsFetch } from "@/lib/apps-in-toss/mtls"

export async function POST(request: NextRequest) {
  const env = {
    apiBase: process.env.TOSS_PARTNER_API_BASE,
    cert: process.env.TOSS_MTLS_CERT,
    key: process.env.TOSS_MTLS_KEY,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }
  if (!env.apiBase || !env.cert || !env.key || !env.supabaseUrl || !env.anonKey) {
    return NextResponse.json({ error: "server not configured" }, { status: 503 })
  }

  let body: { authorizationCode?: string; referrer?: string; role?: "shipper" | "driver" }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 })
  }
  if (!body.authorizationCode || !body.referrer) {
    return NextResponse.json({ error: "authorizationCode/referrer 필요" }, { status: 400 })
  }

  const mtlsFetch = createMtlsFetch(env.cert, env.key)
  const cfg = { apiBase: env.apiBase }
  const service = createServiceClient()
  const verifier = createClient(env.supabaseUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  try {
    const result = await handleTossLogin(
      {
        exchange: (code, ref) => exchangeTossCode(mtlsFetch, cfg, code, ref),
        fetchUser: (at) => fetchTossUser(mtlsFetch, cfg, at),
        resolve: (userKey, profile) => resolveUserByTossKey(service, userKey, profile),
        mint: (userKey) => mintSupabaseSession(service, verifier, shadowEmail(userKey)),
      },
      { authorizationCode: body.authorizationCode, referrer: body.referrer, role: body.role }
    )
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "login failed" },
      { status: 502 }
    )
  }
}
