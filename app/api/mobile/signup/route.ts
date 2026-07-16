import { NextResponse } from "next/server"
import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { createServiceClient } from "@/lib/supabase/service"
import { signupFlow, type SignupInput } from "@/lib/mobile/signupFlow"

export async function POST(req: Request) {
  let body: SignupInput
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return NextResponse.json({ error: "서버 설정 오류" }, { status: 503 })

  const anon = createSupabaseClient(url, anonKey, { auth: { persistSession: false } })
  const service = createServiceClient()

  const result = await signupFlow(body, {
    createAuthUser: async (email, password, meta) => {
      const { data, error } = await anon.auth.signUp({
        email, password,
        options: { data: meta, emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback` },
      })
      if (error) return { error: error.message }
      if (!data.user) return { error: "회원가입 실패" }
      return { userId: data.user.id, session: data.session ?? undefined }
    },
    insertUserRow: async (row) => {
      const { error } = await service.from("users").insert(row)
      if (error) throw new Error(error.message)
    },
    insertRoleProfile: async (userId, role) => {
      if (role === "driver") {
        await service.from("driver_profiles").insert({
          user_id: userId, vehicle_number: "", vehicle_type: "",
          is_verified: false, rating_avg: 0, rating_count: 0,
        })
      } else {
        await service.from("shipper_profiles").insert({ user_id: userId })
      }
    },
  }).catch((e: Error) => ({ ok: false as const, error: e.message }))

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json(result)
}
