import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "./supabase"

type Role = "shipper" | "driver" | null

type AuthState = { session: Session | null; role: Role; loading: boolean }

const AuthContext = createContext<AuthState>({ session: null, role: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<Role>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) { setRole(null); return }
    supabase.from("users").select("role").eq("id", session.user.id).single()
      .then(({ data }) => {
        if (data?.role === "shipper" || data?.role === "driver") setRole(data.role)
      })
  }, [session?.user?.id])

  return <AuthContext.Provider value={{ session, role, loading }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
