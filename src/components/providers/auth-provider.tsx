'use client'

import { createContext, useContext, useEffect, useRef, useState } from 'react'
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

  const refreshProfile = async () => {
    const sb = supabaseRef.current
    if (!user || !sb) return
    const { data } = await sb.from('profiles').select('*').eq('id', user.id).single()
    if (data) setProfile(data as Profile)
  }

  useEffect(() => {
    let mounted = true
    let cleanup: (() => void) | null = null

    // Dynamic-import @/lib/supabase/client so the ~60KB @supabase/ssr bundle
    // is split out of the root-layout chunk. Every attendee page ships that
    // chunk; PSI showed 49KB of it unused on first render (0__2v_92rhldn.js
    // was 81% unused on owambe-mobile). Moving it behind import() lets Next.js
    // emit it as its own async chunk that only downloads after the idle
    // callback fires — out of the Speed Index measurement window entirely.
    const boot = async () => {
      const { createClient } = await import('@/lib/supabase/client')
      if (!mounted) return
      const supabase = createClient()
      supabaseRef.current = supabase

      const { data: { user: initialUser } } = await supabase.auth.getUser()
      if (!mounted) return
      setUser(initialUser)
      if (initialUser) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', initialUser.id)
          .single()
        if (mounted && data) setProfile(data as Profile)
      }
      setLoading(false)

      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (_event: AuthChangeEvent, session: Session | null) => {
          if (!mounted) return
          setUser(session?.user ?? null)
          if (session?.user) {
            const { data } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single()
            if (mounted && data) setProfile(data as Profile)
          } else {
            setProfile(null)
          }
          setLoading(false)
        },
      )
      cleanup = () => subscription.unsubscribe()
    }

    type WinWithIdle = Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number
      cancelIdleCallback?: (h: number) => void
    }
    const w = window as WinWithIdle
    let handle = 0
    if (typeof w.requestIdleCallback === 'function') {
      handle = w.requestIdleCallback(() => { boot() }, { timeout: 2500 })
    } else {
      handle = window.setTimeout(boot, 200) as unknown as number
    }

    return () => {
      mounted = false
      cleanup?.()
      if (handle) {
        try { (window as WinWithIdle).cancelIdleCallback?.(handle) } catch {}
        try { window.clearTimeout(handle) } catch {}
      }
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
