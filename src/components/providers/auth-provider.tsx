'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { User, AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js'

type Profile = {
  id: string
  email: string
  full_name: string | null
  display_name: string | null
  avatar_url: string | null
  role: 'attendee' | 'organiser' | 'admin' | 'super_admin'
  is_verified: boolean
  onboarding_completed: boolean
}

type AuthContextType = {
  user: User | null
  profile: Profile | null
  loading: boolean
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const supabaseRef = useRef<SupabaseClient | null>(null)

  const fetchProfile = useCallback(async (userId: string) => {
    const supabase = supabaseRef.current
    if (!supabase) return
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (data) setProfile(data as Profile)
  }, [])

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id)
  }

  useEffect(() => {
    type WinWithIdle = Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number
    }
    const w = window as WinWithIdle
    let handle = 0
    let subscription: { unsubscribe: () => void } | null = null
    let cancelled = false

    const bootstrap = async () => {
      // Dynamic import keeps the 218 KB Supabase client out of the initial
      // bundle on every route. The chunk loads only after first paint, after
      // hydration, after requestIdleCallback fires.
      const { createClient } = await import('@/lib/supabase/client')
      if (cancelled) return
      const supabase = createClient()
      supabaseRef.current = supabase

      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return
      setUser(user)
      if (user) await fetchProfile(user.id)
      setLoading(false)

      const sub = supabase.auth.onAuthStateChange(
        async (_event: AuthChangeEvent, session: Session | null) => {
          setUser(session?.user ?? null)
          if (session?.user) {
            await fetchProfile(session.user.id)
          } else {
            setProfile(null)
          }
          setLoading(false)
        }
      )
      const sub2 = sub.data.subscription
      subscription = sub2
      if (cancelled) sub2.unsubscribe()
    }

    if (typeof w.requestIdleCallback === 'function') {
      handle = w.requestIdleCallback(() => { bootstrap() }, { timeout: 2500 })
    } else {
      handle = window.setTimeout(bootstrap, 200) as unknown as number
    }

    return () => {
      cancelled = true
      subscription?.unsubscribe()
      if (handle) {
        try { (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(handle) } catch {}
        try { window.clearTimeout(handle) } catch {}
      }
    }
  }, [fetchProfile])

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
