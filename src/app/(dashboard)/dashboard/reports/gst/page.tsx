import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  organisationIdFromParams,
  resolveOrganisationScope,
} from '@/lib/organisations/scope'
import { OrganisationSwitcher } from '@/components/organisations/organisation-switcher'
import { buildGstReport } from '@/lib/tax/gst-report'
import { formatAbn } from '@/lib/tax/abn'

/**
 * THE GST REPORT: what this organiser collected, per BAS quarter.
 *
 * An organiser who issues tax invoices has to lodge a Business Activity
 * Statement, and until now this platform gave them nothing to lodge it from.
 * The figures come from the confirmed orders and the reconciled refunds, not
 * from a stored total, and the reason is written in src/lib/tax/gst-report.ts:
 * a number an organiser copies onto a tax form is the last figure on this
 * platform that should be a second copy of something.
 *
 * SCOPED, LIKE EVERY ORGANISER SURFACE. `resolveOrganisationScope` is the
 * shared gate; this page shows one organiser their own sales and nobody
 * else's.
 */
export const dynamic = 'force-dynamic'

function money(cents: number, currency: string) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency }).format(cents / 100)
}

export default async function GstReportPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const scope = await resolveOrganisationScope(organisationIdFromParams(await searchParams))
  if (!scope.ok) redirect('/dashboard/organisation')

  const report = await buildGstReport(scope.active.id, new Date())

  return (
    <div className="max-w-3xl">
      <OrganisationSwitcher
        organisations={scope.organisations}
        activeId={scope.active.id}
        basePath="/dashboard/reports/gst"
      />

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink-900">GST report</h1>
        <p className="mt-1 text-sm text-ink-400">
          Ticket sales and the GST included in them, by BAS quarter, computed from your confirmed
          orders and reconciled refunds.
        </p>
      </div>

      {!report ? (
        <div className="rounded-xl border border-ink-200 bg-white p-6">
          <p className="text-sm text-ink-600">
            This report could not be built right now. Nothing is wrong with your sales; try again in
            a moment.
          </p>
        </div>
      ) : report.notApplicableReason ? (
        <div className="rounded-xl border border-ink-200 bg-white p-6">
          <p className="text-sm text-ink-900">{report.notApplicableReason}</p>
          <p className="mt-3 text-sm text-ink-500">
            If that is wrong, record your ABN and tick GST registration on your{' '}
            <Link href="/dashboard/organisation" className="text-gold-700 underline">
              business details
            </Link>
            . Your buyers then receive tax invoices instead of receipts.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6 rounded-xl border border-ink-200 bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Reported for</p>
            <p className="mt-1 text-sm font-medium text-ink-900">{report.organisationName}</p>
            {report.abn ? (
              <p className="mt-1 text-sm text-ink-600">ABN {formatAbn(report.abn)}</p>
            ) : null}
          </div>

          <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white">
            <table className="w-full text-sm">
              <caption className="sr-only">GST collected by quarter</caption>
              <thead>
                <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400">
                  <th scope="col" className="px-4 py-3 font-semibold">Quarter</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Orders</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Ticket sales</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Refunds</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">GST included</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {report.periods.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-ink-500">
                      No confirmed sales yet. Your first sale will appear here in its quarter.
                    </td>
                  </tr>
                ) : (
                  report.periods.map(p => (
                    <tr key={p.label}>
                      <td className="px-4 py-3 text-ink-900">{p.label}</td>
                      <td className="px-4 py-3 text-right text-ink-600">{p.orderCount}</td>
                      <td className="px-4 py-3 text-right text-ink-900">
                        {money(p.salesCents, report.currency)}
                      </td>
                      <td className="px-4 py-3 text-right text-ink-600">
                        {p.refundsCents > 0 ? `-${money(p.refundsCents, report.currency)}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-ink-900">
                        {money(p.gstCents, report.currency)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {report.periods.length > 0 ? (
                <tfoot>
                  <tr className="border-t border-ink-200 font-semibold">
                    <td className="px-4 py-3 text-ink-900">All time</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right text-ink-900">
                      {money(report.totalSalesCents, report.currency)}
                    </td>
                    <td className="px-4 py-3 text-right text-ink-600">
                      {report.totalRefundsCents > 0
                        ? `-${money(report.totalRefundsCents, report.currency)}`
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-right text-ink-900">
                      {money(report.totalGstCents, report.currency)}
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>

          <p className="mt-4 text-xs text-ink-400">
            GST is one eleventh of the GST-inclusive ticket price, rounded to the nearest cent. The
            EventLinqs fee is our supply to you, not part of what you sold, so it is not in these
            figures. This report is a record of your sales on EventLinqs, not tax advice.
          </p>
        </>
      )}
    </div>
  )
}
