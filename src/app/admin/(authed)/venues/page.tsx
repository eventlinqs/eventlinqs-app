import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Venue revenue | EventLinqs Admin',
  robots: { index: false, follow: false },
}

/**
 * Venue Revenue Sharing Program: REMOVED by founder decision, 2026-07-05.
 *
 * Standard ticketing economics apply platform-wide: the organiser receives
 * face value, EventLinqs keeps its full fee, and no partner share accrues.
 * The single-source rate row in pricing_rules was zeroed by an append-only
 * version (migration 20260705000005), enrolments were ended, and the
 * accrual, refund-reversal and disbursement call sites were removed. The
 * historical ledger tables remain untouched as history. This page stays as
 * the audit-visible record of the decision behind the same capability gate.
 */
export default async function AdminVenuesPage() {
  const session = await requireAdminSession()
  if (!can(session, 'admin.venues.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.venues.view', session })

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-3xl font-bold tracking-tight text-white">Venue revenue</h1>
      <div className="mt-6 rounded-xl border border-white/15 bg-[#131A2A] p-6">
        <p className="text-sm font-semibold text-white">
          The Venue Revenue Sharing Program was removed by founder decision on
          5 July 2026.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-white/70">
          Standard ticketing economics apply: organisers receive face value,
          EventLinqs keeps its full fee, and no venue share accrues or is paid.
          The pricing_rules rate row is zeroed (append-only version, migration
          20260705000005) and the historical ledger tables are preserved
          untouched. Venue records themselves are unaffected and continue to
          power seating charts and event locations.
        </p>
        <Link
          href="/admin"
          className="mt-5 inline-flex rounded-md bg-white/90 px-4 py-2 text-sm font-semibold text-[#0A0F1A] hover:bg-white"
        >
          Back to admin
        </Link>
      </div>
    </div>
  )
}
