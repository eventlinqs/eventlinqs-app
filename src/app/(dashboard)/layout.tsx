import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { DashboardTopbar } from '@/components/dashboard/dashboard-topbar'
import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const cookieStore = await cookies()
  const collapsed = cookieStore.get('el_sidebar_collapsed')?.value === '1'

  return (
    <div className="min-h-screen bg-canvas">
      <DashboardTopbar user={user} profile={profile} />
      <div className="flex">
        <DashboardSidebar profile={profile} initialCollapsed={collapsed} />
        {/*
          min-w-0, found on the B1 drive at 768 (5 September 2026): a flex item's
          minimum width is its content's, so the attendees table (seven columns,
          nowrap dates, long emails) widened this column past the viewport and
          pushed the panel's Mark resolved button off screen, where nothing could
          click it. With min-w-0 the column stays the viewport's width and the
          table scrolls inside its own overflow-x-auto wrapper, as designed.
        */}
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-8">
          {/* Canonical container (1400px). The old max-w-6xl silently capped
              the whole dashboard below the sitewide standard. */}
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
