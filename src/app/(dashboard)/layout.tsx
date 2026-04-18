import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { DashboardTopbar } from '@/components/dashboard/dashboard-topbar'
import { DashboardSidebar } from '@/components/dashboard/dashboard-sidebar'

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
        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
