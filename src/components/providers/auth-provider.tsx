'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js'

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
  const supabase = createClient()

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (data) setProfile(data as Profile)
  }

  const refreshProfile = async () => {
    if (user) await fetchProfile(user.id)
  }

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      if (user) await fetchProfile(user.id)
      setLoading(false)
    }

    type WinWithIdle = Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number
    }
    const w = window as WinWithIdle
    let handle = 0
    if (typeof w.requestIdleCallback === 'function') {
      handle = w.requestIdleCallback(() => { getUser() }, { timeout: 2500 })
    } else {
      handle = window.setTimeout(getUser, 200) as unknown as number
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
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

    return () => {
      subscription.unsubscribe()
      if (handle) {
        try { (window as unknown as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(handle) } catch {}
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
