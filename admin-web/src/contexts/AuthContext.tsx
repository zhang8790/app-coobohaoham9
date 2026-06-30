import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'

interface AuthCtx {
  profile: Profile | null
  loading: boolean
  signInWithEmail: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx>({
  profile: null, loading: true,
  signInWithEmail: async () => null,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = async (uid: string) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    setProfile(data ?? null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loadProfile(session.user.id).finally(() => setLoading(false))
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) loadProfile(session.user.id)
      else setProfile(null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const signInWithEmail = async (email: string, password: string): Promise<string | null> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return error.message
    if (!data.user) return '登录失败'
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
    if (prof?.role !== 'admin') {
      await supabase.auth.signOut()
      return '无权限：该账号不是管理员'
    }
    return null
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }

  return <Ctx.Provider value={{ profile, loading, signInWithEmail, signOut }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
