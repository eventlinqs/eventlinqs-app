import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'KYC review | EventLinqs Admin',
  robots: { index: false, follow: false },
}

const REVIEW_STATUSES = ['on_hold', 'restricted'] as const

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso))
}

interface KycRow {
  id: string
  name: string
  payout_status: string
  stripe_charges_enabled: boolean
  stripe_account_id: string | null
  created_at: string
}

async function listOrganisationsNeedingReview(): Promise<KycRow[]> {
  const db = createAdminClient()
  const { data, error } = await db
    .from('organisations')
    .select('id, name, payout_status, stripe_charges_enabled, stripe_account_id, created_at')
    .in('payout_status', REVIEW_STATUSES as unknown as string[])
    .order('created_at', { ascending: false })
    .returns<KycRow[]>()
  if (error) throw new Error(`listOrganisationsNeedingReview: ${error.message}`)
  return data ?? []
}

export default async function AdminKycPage() {
  const session = await requireAdminSession()
  if (!can(session, 'admin.users.manage')) redirect('/admin')

  await recordAuditEvent({ action: 'admin.kyc.view', session })

  const rows = await listOrganisationsNeedingReview()

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Operations</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">KYC review</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Organisers whose payouts are on hold or restricted. Open the organiser to review their Stripe verification and
          lift or keep the hold. This queue mirrors the KYC depth on the dashboard.
        </p>
      </header>

      <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[#131A2A]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-white/[0.03] text-[11px] uppercase tracking-[0.18em] text-white/50">
            <tr>
              <th className="px-4 py-3 font-medium">Organiser</th>
              <th className="px-4 py-3 font-medium">Payout status</th>
              <th className="px-4 py-3 font-medium">Charges enabled</th>
              <th className="px-4 py-3 font-medium">Stripe account</th>
              <th className="px-4 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-white/50">
                  No organisers need review. Every organiser is verified and clear to be paid out.
                </td>
              </tr>
            ) : (
              rows.map(o => (
                <tr key={o.id} className="border-t border-white/[0.06] hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <Link href={`/admin/organisers/${o.id}`} className="text-[var(--brand-accent)] hover:underline">
                      {o.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-block rounded bg-amber-400/15 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
                      {o.payout_status.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white/70">{o.stripe_charges_enabled ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-3 text-white/60">{o.stripe_account_id ? 'Connected' : 'Not connected'}</td>
                  <td className="px-4 py-3 text-white/50">{formatDate(o.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
