export type SignupInput = {
  email: string; password: string; name: string; phone: string; role: "shipper" | "driver"
}

export type SignupDeps = {
  createAuthUser: (email: string, password: string, meta: { name: string; role: string }) =>
    Promise<{ userId?: string; session?: unknown; error?: string }>
  insertUserRow: (row: {
    id: string; email: string; name: string; phone: string
    role: string; status: string; verification_status: string
  }) => Promise<void>
  insertRoleProfile: (userId: string, role: "shipper" | "driver") => Promise<void>
}

export type SignupResult = { ok: true; needsEmailVerify: boolean } | { ok: false; error: string }

const SPECIAL_CHAR_RE = /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\/~`]/
const PHONE_RE = /^01[0-9]\d{7,8}$/

export async function signupFlow(input: SignupInput, deps: SignupDeps): Promise<SignupResult> {
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()
  const phone = input.phone.replace(/-/g, "").trim()
  const { password, role } = input

  if (!email || !password || !name || !phone) return { ok: false, error: "모든 필수 항목을 입력해주세요" }
  if (password.length < 8) return { ok: false, error: "비밀번호는 8자 이상이어야 합니다" }
  if (!SPECIAL_CHAR_RE.test(password)) return { ok: false, error: "비밀번호에 특수문자를 1개 이상 포함해야 합니다" }
  if (!PHONE_RE.test(phone)) return { ok: false, error: "올바른 휴대폰 번호를 입력해주세요 (예: 010-1234-5678)" }
  if (role !== "shipper" && role !== "driver") return { ok: false, error: "역할을 선택해주세요" }

  const created = await deps.createAuthUser(email, password, { name, role })
  if (created.error || !created.userId) return { ok: false, error: created.error ?? "회원가입 실패" }

  await deps.insertUserRow({
    id: created.userId, email, name, phone, role,
    status: "active", verification_status: "unverified",
  })
  await deps.insertRoleProfile(created.userId, role)

  return { ok: true, needsEmailVerify: !created.session }
}
