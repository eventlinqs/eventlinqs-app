'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { GoogleButton } from './google-button'
import { AuthDivider } from './auth-divider'

type Props = {
  role?: 'attendee' | 'organiser'
}

export function SignupForm({ role = 'attendee' }: Props) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const isOrganiser = role === 'organiser'

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      setLoading(false)
      return
    }

    const emailRedirectTo = isOrganiser
      ? `${window.location.origin}/auth/callback?role=organiser`
      : `${window.location.origin}/auth/callback`

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, intended_role: role },
        emailRedirectTo,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    const nextParam = isOrganiser ? '&next=/dashboard' : ''
    router.push(`/verify-email-sent?email=${encodeURIComponent(email)}${nextParam}`)
  }

  return (
    <div className="space-y-5">
      {isOrganiser && (
        <div className="rounded-lg border border-gold-400/40 bg-gold-100/60 px-4 py-3 text-sm text-ink-900">
          <p className="font-semibold">You are signing up as an organiser.</p>
          <p className="mt-0.5 text-xs text-ink-600">
            After your email is verified, you will be taken to your dashboard to create your first event.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error" role="alert">
          {error}
        </div>
      )}

      <GoogleButton label="Continue with Google" />

      <AuthDivider label="or" />

      <form onSubmit={handleSignup} className="space-y-4">
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-ink-900">
            Full name
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            className="mt-1.5 block h-11 w-full rounded-lg border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20"
            placeholder="Your full name"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-ink-900">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1.5 block h-11 w-full rounded-lg border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-ink-900">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="mt-1.5 block h-11 w-full rounded-lg border border-ink-200 bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-gold-400 focus:outline-none focus:ring-2 focus:ring-gold-400/20"
            placeholder="At least 8 characters"
          />
          <p className="mt-1.5 text-xs text-ink-400">
            Use 8 or more characters with a mix of letters and numbers.
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-gold-400 px-4 text-sm font-semibold text-ink-900 shadow-md transition-all hover:-translate-y-0.5 hover:bg-gold-500 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading
            ? 'Creating account'
            : isOrganiser
              ? 'Create organiser account'
              : 'Create account'}
        </button>

        <p className="text-center text-xs text-ink-400">
          By signing up you agree to our{' '}
          <a href="/legal/terms" className="underline hover:text-gold-600">Terms</a>
          {' '}and{' '}
          <a href="/legal/privacy" className="underline hover:text-gold-600">Privacy Policy</a>.
        </p>
      </form>
    </div>
  )
}
