import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrganiserRefunds, getRefundStatistics } from '@/lib/refunds/queries'
import { RefundStatsCards } from '@/components/dashboard/refunds/refund-stats-cards'
import { RefundsHistoryTable } from '@/components/dashboard/refunds/refunds-history-table'

export const metadata = {
  title: 'Refunds | EventLinqs Dashboard',
  alternates: {
    canonical: '/dashboard/refunds',
  },
}

export const dynamic = 'force-dynamic'

export default async function RefundsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/dashboard/refunds')

  const admin = createAdminClient()
  const { data: org } = await admin
    .from('organisations')
    .select('id, name')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!org) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-ink-900">Refunds</h1>
        <div className="rounded-2xl border border-ink-100 bg-white p-8 text-center">
          <p className="text-sm text-ink-600">
            Create your organisation to start managing refunds.
          </p>
        </div>
      </div>
    )
  }

  const orgId = (org as { id: string }).id

  const [stats, page] = await Promise.all([
    getRefundStatistics(orgId),
    getOrganiserRefunds(orgId, { limit: 20 }),
  ])

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink-900">Refunds</h1>
        <p className="mt-1 text-sm text-ink-600">
          Review buyer refund requests and process refunds against original payments. All approvals issue refunds through your connected Stripe account.
        </p>
      </header>

      <RefundStatsCards stats={stats} />

      <RefundsHistoryTable initial={page} />
    </div>
  )
}
