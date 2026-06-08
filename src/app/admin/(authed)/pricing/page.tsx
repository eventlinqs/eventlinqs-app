import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { hasCapability } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { readAdminPricingMatrix, readActiveOverrides, ADMIN_PRICING_SCOPES } from '@/lib/admin/pricing'
import { ConfirmSubmitButton } from '@/components/admin/confirm-submit-button'
import { updateScopePricingAction, updateOverridePricingAction } from './actions'

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
  const [matrix, overrides] = await Promise.all([readAdminPricingMatrix(), readActiveOverrides()])
  const currencyOptions = ADMIN_PRICING_SCOPES.filter((s) => s.countryCode !== 'GLOBAL')

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Money</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Pricing and fees</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Edit the platform fee, fixed fee per ticket, and processing-fee treatment per region,
          or set a per-organiser or per-event override below. Precedence is event, then
          organiser, then region. The same value drives the displayed fee, the checkout charge,
          and the payout. Saving writes a new version that takes effect for new transactions
          immediately. Past orders keep their original fees.
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
      {status === 'override_saved' && (
        <div role="status" className="mb-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Override saved for this {scope}. {Number(changed ?? 0)} field{Number(changed ?? 0) === 1 ? '' : 's'} updated. New transactions for it use the override now.
        </div>
      )}
      {status === 'override_invalid' && (
        <div role="alert" className="mb-6 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Override not saved. Check the target ID is a valid UUID, the percentage is 0 to 100, and the fixed fee is in cents.
        </div>
      )}
      {status === 'override_error' && (
        <div role="alert" className="mb-6 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Could not save the {scope} override. Check the {scope} ID exists, then try again.
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
                    {/* Confirmation step (WCAG-safe native confirm): changing
                        fees affects what every new transaction is charged, so a
                        save is gated behind an explicit confirm. */}
                    <ConfirmSubmitButton
                      form={`form-${id}`}
                      confirmMessage={`Update live ${row.scope.label} (${row.scope.countryCode} ${row.scope.currency}) fees? New transactions will use the new fees immediately. Past orders are unchanged.`}
                      className="rounded-md bg-white/90 px-3 py-1.5 text-sm font-semibold text-[#0A0F1A] transition hover:bg-white"
                    >
                      Save
                    </ConfirmSubmitButton>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-white/40">
        Processing fee: pass to buyer adds it on top at checkout; absorb takes it from the organiser. Overrides below win over these regional defaults.
      </p>

      {/* ---- Per-organiser and per-event overrides ---------------------- */}
      <section className="mt-12">
        <header className="mb-4">
          <h2 className="font-display text-2xl font-bold tracking-tight">Overrides</h2>
          <p className="mt-2 max-w-2xl text-sm text-white/60">
            Set a fee for one organiser or one event. Precedence is event first, then
            organiser, then the regional default above. The same value drives the displayed
            fee, the checkout charge, and the payout, so an override is what the buyer sees and
            is charged. Each save is a new version, audit-logged.
          </p>
        </header>

        {overrides.length > 0 ? (
          <div className="mb-6 overflow-x-auto rounded-lg border border-white/[0.08]">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-left text-white/50">
                  <th scope="col" className="px-4 py-3 font-medium">Scope</th>
                  <th scope="col" className="px-4 py-3 font-medium">Target ID</th>
                  <th scope="col" className="px-4 py-3 font-medium">Platform fee percent</th>
                  <th scope="col" className="px-4 py-3 font-medium">Fixed fee (cents)</th>
                  <th scope="col" className="px-4 py-3 font-medium">Version</th>
                </tr>
              </thead>
              <tbody>
                {overrides.map((o) => (
                  <tr key={`${o.kind}-${o.targetId}`} className="border-b border-white/[0.05] align-middle">
                    <td className="px-4 py-3 capitalize text-white">{o.kind}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-white/70">{o.targetId}</td>
                    <td className="px-4 py-3 text-white">{o.percentage.value ?? '-'}{o.percentage.value !== null ? '%' : ''}</td>
                    <td className="px-4 py-3 text-white">{o.fixed.value ?? '-'}</td>
                    <td className="px-4 py-3 text-white/50">v{Math.max(o.percentage.version ?? 0, o.fixed.version ?? 0) || 1}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mb-6 text-sm text-white/40">No overrides set. Every organiser and event uses the regional default above.</p>
        )}

        <form action={updateOverridePricingAction} className="grid max-w-3xl grid-cols-1 gap-4 rounded-lg border border-white/[0.08] p-5 sm:grid-cols-2 lg:grid-cols-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ov-scope" className="text-[11px] uppercase tracking-wider text-white/50">Scope</label>
            <select
              id="ov-scope"
              name="scopeKind"
              defaultValue="organisation"
              className="rounded-md border border-white/15 bg-white/[0.04] px-2 py-1.5 text-white focus:border-white/40 focus:outline-none"
            >
              <option value="organisation">Organisation</option>
              <option value="event">Event</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <label htmlFor="ov-target" className="text-[11px] uppercase tracking-wider text-white/50">Target ID (UUID)</label>
            <input
              id="ov-target"
              name="targetId"
              type="text"
              required
              placeholder="organisation or event UUID"
              className="rounded-md border border-white/15 bg-white/[0.04] px-2 py-1.5 font-mono text-[12px] text-white focus:border-white/40 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ov-currency" className="text-[11px] uppercase tracking-wider text-white/50">Currency</label>
            <select
              id="ov-currency"
              name="currency"
              defaultValue="AUD"
              className="rounded-md border border-white/15 bg-white/[0.04] px-2 py-1.5 text-white focus:border-white/40 focus:outline-none"
            >
              {currencyOptions.map((s) => (
                <option key={s.currency} value={s.currency}>{s.currency}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ov-pct" className="text-[11px] uppercase tracking-wider text-white/50">Platform fee percent</label>
            <input
              id="ov-pct"
              name="platform_fee_percentage"
              type="number"
              step="0.01"
              min="0"
              max="100"
              defaultValue={0}
              className="w-full rounded-md border border-white/15 bg-white/[0.04] px-2 py-1.5 text-white focus:border-white/40 focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ov-fixed" className="text-[11px] uppercase tracking-wider text-white/50">Fixed fee (cents)</label>
            <input
              id="ov-fixed"
              name="platform_fee_fixed"
              type="number"
              step="1"
              min="0"
              max="100000"
              defaultValue={0}
              className="w-full rounded-md border border-white/15 bg-white/[0.04] px-2 py-1.5 text-white focus:border-white/40 focus:outline-none"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-5">
            <ConfirmSubmitButton
              confirmMessage="Save this override? New transactions for the target organiser or event will use it immediately. Past orders are unchanged."
              className="rounded-md bg-white/90 px-3 py-1.5 text-sm font-semibold text-[#0A0F1A] transition hover:bg-white"
            >
              Save override
            </ConfirmSubmitButton>
          </div>
        </form>
      </section>
    </div>
  )
}
