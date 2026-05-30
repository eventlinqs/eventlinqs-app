import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { hasCapability } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { readAdminPricingMatrix } from '@/lib/admin/pricing'
import { updateScopePricingAction } from './actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Pricing and fees | EventLinqs Admin',
  robots: { index: false, follow: false },
}

type SearchParams = Promise<{ status?: string; scope?: string; changed?: string }>

/**
 * Pricing and fees control (scope 3.18 / 3.18.1).
 *
 * Edits the live pricing_rules the fee calculator reads, so changes take
 * effect for new transactions with no code deploy. Each save writes a new
 * version row (history preserved) and is audit-logged.
 */
export default async function AdminPricingPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireAdminSession()
  if (!hasCapability(session.admin.role, 'admin.pricing.manage')) {
    redirect('/admin')
  }
  await recordAuditEvent({ action: 'admin.pricing.view', session })

  const { status, scope, changed } = await searchParams
  const matrix = await readAdminPricingMatrix()

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Money</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Pricing and fees</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Edit the platform fee, fixed fee per ticket, and processing-fee treatment per region.
          Saving writes a new version that takes effect for new transactions immediately. Past
          orders keep their original fees.
        </p>
      </header>

      {status === 'saved' && (
        <div role="status" className="mb-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Saved {scope}. {Number(changed ?? 0)} field{Number(changed ?? 0) === 1 ? '' : 's'} updated. New transactions use the new fees now.
        </div>
      )}
      {status === 'invalid' && (
        <div role="alert" className="mb-6 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Those values were not valid. Check the percentage is 0 to 100 and the fixed fee is in cents.
        </div>
      )}
      {status === 'error' && (
        <div role="alert" className="mb-6 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Could not save {scope}. Try again.
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
        <table className="w-full min-w-[680px] text-sm">
          <thead>
            <tr className="border-b border-white/[0.08] text-left text-white/50">
              <th scope="col" className="px-4 py-3 font-medium">Region</th>
              <th scope="col" className="px-4 py-3 font-medium">Platform fee percent</th>
              <th scope="col" className="px-4 py-3 font-medium">Fixed fee per ticket (cents)</th>
              <th scope="col" className="px-4 py-3 font-medium">Processing fee</th>
              <th scope="col" className="px-4 py-3 font-medium">Version</th>
              <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">Save</span></th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => {
              const id = `${row.scope.countryCode}-${row.scope.currency}`
              const ver = Math.max(
                row.platformFeePercentage.version ?? 0,
                row.platformFeeFixedCents.version ?? 0,
                row.processingTreatment.version ?? 0,
              )
              return (
                <tr key={id} className="border-b border-white/[0.05] align-middle">
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{row.scope.label}</div>
                    <div className="text-[11px] uppercase tracking-wider text-white/40">
                      {row.scope.countryCode} {row.scope.currency}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <form action={updateScopePricingAction} id={`form-${id}`} className="contents">
                      <input type="hidden" name="countryCode" value={row.scope.countryCode} />
                      <input type="hidden" name="currency" value={row.scope.currency} />
                      <label className="sr-only" htmlFor={`pct-${id}`}>Platform fee percent for {row.scope.label}</label>
                      <input
                        id={`pct-${id}`}
                        name="platform_fee_percentage"
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        defaultValue={row.platformFeePercentage.value ?? 0}
                        className="w-24 rounded-md border border-white/15 bg-white/[0.04] px-2 py-1.5 text-white focus:border-white/40 focus:outline-none"
                      />
                    </form>
                  </td>
                  <td className="px-4 py-3">
                    <label className="sr-only" htmlFor={`fixed-${id}`}>Fixed fee per ticket in cents for {row.scope.label}</label>
                    <input
                      form={`form-${id}`}
                      id={`fixed-${id}`}
                      name="platform_fee_fixed"
                      type="number"
                      step="1"
                      min="0"
                      max="100000"
                      defaultValue={row.platformFeeFixedCents.value ?? 0}
                      className="w-24 rounded-md border border-white/15 bg-white/[0.04] px-2 py-1.5 text-white focus:border-white/40 focus:outline-none"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <label className="sr-only" htmlFor={`treat-${id}`}>Processing fee treatment for {row.scope.label}</label>
                    <select
                      form={`form-${id}`}
                      id={`treat-${id}`}
                      name="processing_fee_pass_through"
                      defaultValue={String(row.processingTreatment.value ?? 1)}
                      className="rounded-md border border-white/15 bg-white/[0.04] px-2 py-1.5 text-white focus:border-white/40 focus:outline-none"
                    >
                      <option value="1">Pass to buyer</option>
                      <option value="0">Absorb</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-white/50">v{ver || 1}</td>
                  <td className="px-4 py-3">
                    <button
                      form={`form-${id}`}
                      type="submit"
                      className="rounded-md bg-white/90 px-3 py-1.5 text-sm font-semibold text-[#0A0F1A] transition hover:bg-white"
                    >
                      Save
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-white/40">
        Processing fee: pass to buyer adds it on top at checkout; absorb takes it from the organiser. Per-event organiser overrides still win where set.
      </p>
    </div>
  )
}
