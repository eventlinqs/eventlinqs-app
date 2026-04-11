'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

type Props = {
  user: User
  profile: {
    full_name: string | null
    avatar_url: string | null
    role: string
  } | null
}

export function DashboardNav({ user, profile }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/dashboard" className="text-xl font-bold text-blue-600">
              EVENTLINQS
            </Link>
            <div className="hidden md:flex md:gap-6">
              <Link href="/dashboard" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                Dashboard
              </Link>
              <Link href="/dashboard/events" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                My Events
              </Link>
              <Link href="/dashboard/tickets" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                My Tickets
              </Link>
              <Link href="/dashboard/my-waitlists" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                My Waitlists
              </Link>
              <Link href="/dashboard/my-squads" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                My Squads
              </Link>
              {(profile?.role === 'organiser' || profile?.role === 'admin' || profile?.role === 'super_admin') && (
                <Link href="/dashboard/organisation" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                  Organisation
                </Link>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              {profile?.full_name || user.email}
            </span>
            <button
              onClick={handleSignOut}
              className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
