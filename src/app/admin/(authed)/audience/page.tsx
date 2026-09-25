import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { AdminStatTile } from '@/components/admin/admin-stat-tile'
import { getAudienceDashboard, type AudienceCount } from '@/lib/audience/read'
import { priceBandLabel, recencyBandLabel } from '@/lib/audience/segments'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { formatMoneyDisplay } from '@/lib/money/format'
import { createAdminClient } from '@/lib/supabase/admin'
import { readSubjectHistory } from '@/lib/consent/ledger'
import { normaliseSubjectEmail } from '@/lib/consent/purposes'
import { consentEventSentence, suppressionSentence } from '@/lib/consent/sentences'
import { readCaptureConversion } from '@/lib/consent/capture-conversion'
import {
  conversionSentence,
  formatRate,
  CAPTURE_CONVERSION_FALL_LIMIT_POINTS,
  CONVERSION_VERDICT_WORDS,
} from '@/lib/consent/capture-conversion-math'
import {
  CAPTURE_PLACEMENTS,
  DEFAULT_CAPTURE_PLACEMENT,
  type CapturePlacement,
} from '@/lib/consent/capture-placement-math'
import { moveCaptureAskAction } from './actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Audience | EventLinqs Admin',
  robots: { index: false, follow: false },
}

/**
 * THE AUDIENCE ASSET, READ ONLY, COUNTS ONLY. Close-out GA1 point 6.
 *
 * Everything on this page is a number the database produced. Nothing here is
 * typed: the cities, communities and categories listed are whatever the rows
 * actually carry, so an axis with nobody behind it does not appear rather than
 * appearing as a zero somebody has to interpret.
 *
 * NO ADDRESS IS SHOWN AND NOTHING CAN BE EXPORTED OR SENT. GA1 point 7 is that
 * this item ships no way to contact anybody, and a screen that lists the
 * addresses is a sender in everything but name. Sending is GA2 and it does not
 * start until this item is closed.
 */

function CountList({ title, counts, label }: { title: string; counts: AudienceCount[]; label?: (k: string) => string }) {
  const max = Math.max(1, ...counts.map(c => c.count))
  return (
    <section className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
      <h2 className="font-display text-lg font-semibold text-white">{title}</h2>
      {counts.length === 0 ? (
        <p className="mt-3 text-sm text-white/60">
          Nobody in the audience carries this yet.
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {counts.map(c => (
            <li key={c.key} className="flex items-center gap-3">
              <span className="w-40 shrink-0 truncate text-[11px] uppercase tracking-[0.12em] text-white/50">
                {label ? label(c.key) : c.key}
              </span>
              <span className="relative h-6 flex-1 overflow-hidden rounded bg-white/[0.04]">
                <span
                  className="absolute inset-y-0 left-0 rounded bg-[var(--brand-accent)]/70"
                  style={{ width: `${Math.max(2, Math.round((c.count / max) * 100))}%` }}
                />
              </span>
              <span className="w-12 shrink-0 text-right text-sm tabular-nums text-white">{c.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

type Props = { searchParams: Promise<{ subject?: string; placement?: string }> }

export default async function AdminAudiencePage({ searchParams }: Props) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) redirect('/admin')

  await recordAuditEvent({ action: 'admin.audience.view', session })

  const { subject, placement: placementStatus } = await searchParams
  const lookupEmail = normaliseSubjectEmail(subject ?? '')

  const [dashboard, capturing, history, conversion] = await Promise.all([
    getAudienceDashboard(),
    isFeatureEnabled('audience_capture'),
    lookupEmail ? readSubjectHistory(createAdminClient(), lookupEmail) : Promise.resolve(null),
    readCaptureConversion(createAdminClient()),
  ])

  const placementNow = conversion.currentPlacement ?? DEFAULT_CAPTURE_PLACEMENT
  const placementDecision = conversion.decisions[conversion.decisions.length - 1] ?? null
  const arriving = conversion.theQuestionArriving
  /*
   * When the rule says move, the reason is written for the owner rather than
   * left to them. A placement row's whole value six months from now is being
   * able to ask why the question moved, and "because conversion fell 3.1
   * points, 466 of 1120 against 512 of 1100" answers that where "moving it"
   * does not. They can still type over it.
   */
  const suggestedReason =
    arriving.verdict === 'move'
      ? `Conversion fell ${Math.abs(arriving.deltaPoints ?? 0).toFixed(1)} points once the question ` +
        `was asked at checkout (${arriving.before.converted} of ${arriving.before.settled} before, ` +
        `${arriving.after.converted} of ${arriving.after.settled} after), past the ` +
        `${CAPTURE_CONVERSION_FALL_LIMIT_POINTS} point limit, so the capture moves to the ticket page.`
      : ''

  /*
   * A LOOKUP IS A READ OF SOMEBODY'S RECORD, SO IT IS AUDITED AS ONE.
   *
   * The page view is already logged above; this second entry names the address
   * that was looked at. A screen that can produce one person's whole consent
   * history is exactly the screen whose use should be reconstructable later.
   */
  if (lookupEmail) {
    await recordAuditEvent({
      action: 'admin.audience.subject_lookup',
      session,
      metadata: { subject: lookupEmail },
    })
  }

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Growth</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Audience</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Buyers who have both a confirmed order and a granted marketing consent. A row cannot
          exist here without that consent: the database refuses it. Counts only, no addresses,
          and nothing on this platform sends to this list yet.
        </p>
      </header>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AdminStatTile
          label="In the audience"
          value={dashboard.total}
          hint="Consented buyers"
          status={dashboard.total > 0 ? 'ok' : 'pending'}
        />
        <AdminStatTile
          label="Opt-in rate"
          value={dashboard.optInRate.percent === null ? 'Not asked yet' : `${dashboard.optInRate.percent}%`}
          hint={`${dashboard.optInRate.granted} of ${dashboard.optInRate.asked} answered`}
          status={dashboard.optInRate.percent !== null && dashboard.optInRate.percent < 25 ? 'warn' : 'ok'}
        />
        <AdminStatTile
          label="Lifetime spend behind it"
          value={formatMoneyDisplay(dashboard.lifetimeSpendCents, 'AUD')}
          status="ok"
        />
        <AdminStatTile
          label="Awaiting re-confirmation"
          value={dashboard.consent.awaitingReconfirmation}
          hint={`Granted over ${dashboard.consent.maxAgeMonths} months ago`}
          status={dashboard.consent.awaitingReconfirmation > 0 ? 'warn' : 'ok'}
        />
        <AdminStatTile
          label="Capturing"
          value={capturing ? 'On' : 'Off'}
          hint="Feature flags, audience_capture"
          status={capturing ? 'ok' : 'warn'}
        />
        {/*
          AQ1's rule, in the row a person reads first.
          The verdict is computed and spelled out further down the page, but a
          rule nobody remembers to scroll to is a rule that never fires. When it
          says move, this tile says move, and the control below carries the
          measurement into its own reason so the click is evidenced.
        */}
        <div data-capture-verdict-tile={conversion.theQuestionArriving.verdict}>
          <AdminStatTile
            label="Does asking cost sales"
            value={CONVERSION_VERDICT_WORDS[conversion.theQuestionArriving.verdict]}
            hint={`The ${CAPTURE_CONVERSION_FALL_LIMIT_POINTS} point rule, asked at checkout`}
            status={conversion.theQuestionArriving.verdict === 'move' ? 'warn' : 'ok'}
          />
        </div>
      </div>

      <section className="mb-8 rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
        <h2 className="font-display text-lg font-semibold text-white">Consent state</h2>
        <p className="mt-1 text-sm text-white/60">
          Every answer the platform holds, including the people who were asked and said no. A
          decline is never marketing consent and never enters the audience; it is kept so that
          &ldquo;asked and declined&rdquo; can be told apart from &ldquo;never asked&rdquo;.
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            ['Granted', dashboard.consent.granted],
            ['Withdrawn', dashboard.consent.withdrawn],
            ['Declined', dashboard.consent.declined],
            ['Granted, no purchase yet', dashboard.consent.grantedWithoutPurchase],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4">
              <dt className="text-[11px] uppercase tracking-[0.16em] text-white/50">{label}</dt>
              <dd className="mt-1 font-display text-2xl font-semibold tabular-nums text-white">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        className="mb-8 rounded-xl border border-white/[0.08] bg-[#131A2A] p-6"
        data-capture-placement={placementNow}
      >
        <h2 className="font-display text-lg font-semibold text-white">
          Where the question is asked, and what it costs
        </h2>
        <p className="mt-1 text-sm text-white/60">
          AQ1 puts the discovery question on the surface that sells tickets, so the platform has
          to be able to say whether that costs the organiser sales. Every number here is counted
          off public.reservations: a reservation is one buyer reaching the payment step, and it
          is counted once its outcome is settled.
        </p>

        <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { label: 'Before the question existed', rate: conversion.beforeTheQuestion },
            { label: 'Asked at checkout', rate: conversion.underCheckout },
            { label: 'Asked on the ticket page', rate: conversion.underTicketPage },
          ].map(({ label, rate }) => {
            const r = rate
            return (
              <div
                key={label}
                className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-4"
                data-conversion-cell={label}
              >
                <dt className="text-[11px] uppercase tracking-[0.16em] text-white/50">{label}</dt>
                <dd className="mt-1 font-display text-2xl font-semibold tabular-nums text-white">
                  {formatRate(r.percent)}
                </dd>
                <dd className="mt-1 text-xs text-white/50 tabular-nums">
                  {r.converted} of {r.settled} settled
                </dd>
              </div>
            )
          })}
        </dl>

        <p className="mt-5 text-sm text-white/80" data-conversion-verdict={conversion.theQuestionArriving.verdict}>
          {conversionSentence(conversion.theQuestionArriving, {
            before: 'Before the question existed',
            after: 'Asked at checkout',
          })}
        </p>
        <p className="mt-2 text-sm text-white/70" data-conversion-move-verdict={conversion.theMove.verdict}>
          {conversionSentence(conversion.theMove, {
            before: 'Asked at checkout',
            after: 'Asked on the ticket page',
          })}
        </p>
        {conversion.theQuestionArriving.standardErrorPoints !== null && (
          <p className="mt-2 text-xs text-white/40 tabular-nums">
            Standard error of that difference: {conversion.theQuestionArriving.standardErrorPoints.toFixed(2)} points.
            {conversion.theQuestionArriving.deltaRelativePercent !== null &&
              ` Read as a relative change instead: ${conversion.theQuestionArriving.deltaRelativePercent.toFixed(1)}%.`}
            {` ${conversion.inFlight} reservation${conversion.inFlight === 1 ? '' : 's'} not settled yet, so in neither half.`}
          </p>
        )}

        <div className="mt-6 rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-white/50">
            In force now
          </p>
          <p className="mt-1 text-sm text-white/80">
            The question is asked {placementNow === 'checkout' ? 'at the payment step' : 'on the ticket page'}
            {placementDecision ? `, since ${placementDecision.effectiveFrom.slice(0, 10)}.` : '.'}
          </p>
          {placementDecision && (
            <p className="mt-2 text-xs text-white/50">{placementDecision.reason}</p>
          )}

          <form action={moveCaptureAskAction} className="mt-5 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="placement" className="block text-[11px] uppercase tracking-[0.16em] text-white/50">
                Move it to
              </label>
              <select
                id="placement"
                name="placement"
                defaultValue={placementNow === 'checkout' ? 'ticket_page' : 'checkout'}
                className="mt-1 h-11 rounded-lg border border-white/[0.12] bg-white/[0.04] px-3 text-sm text-white focus:border-[var(--brand-accent)] focus:outline-none"
              >
                {CAPTURE_PLACEMENTS.map((value: CapturePlacement) => (
                  <option key={value} value={value} className="text-[#0A1628]">
                    {value === 'checkout' ? 'The payment step' : 'The ticket page'}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label htmlFor="reason" className="block text-[11px] uppercase tracking-[0.16em] text-white/50">
                Why
              </label>
              <input
                id="reason"
                name="reason"
                type="text"
                required
                minLength={10}
                defaultValue={suggestedReason}
                placeholder="Conversion fell past the limit, so the capture moves"
                className="mt-1 h-11 w-full min-w-[18rem] rounded-lg border border-white/[0.12] bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/30 focus:border-[var(--brand-accent)] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-11 items-center rounded-lg bg-[var(--brand-accent)] px-5 text-sm font-semibold text-[#0A1628] transition-opacity hover:opacity-90"
            >
              Move the question
            </button>
          </form>
          <p className="mt-3 text-xs text-white/40">
            Appending a decision, never editing one. The rule is a fall of more than
            {` ${CAPTURE_CONVERSION_FALL_LIMIT_POINTS} `}
            percentage points, and moving the question never removes it: the buyer is still asked,
            one screen earlier.
          </p>
          {placementStatus === 'moved' && (
            <p className="mt-3 text-sm text-[var(--brand-accent)]">The decision is recorded and is in force now.</p>
          )}
          {placementStatus === 'error' && (
            <p className="mt-3 text-sm text-red-300">The decision could not be written. Nothing changed.</p>
          )}
          {placementStatus === 'invalid' && (
            <p className="mt-3 text-sm text-red-300">A placement needs a known surface and a reason of at least ten characters.</p>
          )}
        </div>
      </section>

      <section className="mb-8 rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
        <h2 className="font-display text-lg font-semibold text-white">Look one person up</h2>
        <p className="mt-1 text-sm text-white/60">
          The screen a complaint is answered from. Type the address the person wrote in with and
          this returns everything the ledger holds for them, in sentences, exactly as they would
          read it on their own preferences page. Every lookup is written to the audit log.
        </p>
        <form method="get" className="mt-5 flex flex-wrap items-center gap-3">
          <label htmlFor="subject" className="sr-only">
            Email address
          </label>
          <input
            id="subject"
            name="subject"
            type="email"
            defaultValue={lookupEmail}
            placeholder="someone@example.com"
            className="h-11 min-w-[18rem] flex-1 rounded-lg border border-white/[0.12] bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/30 focus:border-[var(--brand-accent)] focus:outline-none"
          />
          <button
            type="submit"
            className="inline-flex h-11 items-center rounded-lg bg-[var(--brand-accent)] px-5 text-sm font-semibold text-[#0A1628] transition-opacity hover:opacity-90"
          >
            Look up
          </button>
        </form>

        {history && (
          <div className="mt-6 rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
            {history.consents.length === 0 && history.suppressions.length === 0 ? (
              <p className="text-sm text-white/70">
                Nothing is recorded for {history.email}. That is a real answer: this platform has
                never asked that address for marketing consent.
              </p>
            ) : (
              <>
                <p className="text-[11px] uppercase tracking-[0.16em] text-white/50">
                  {history.email}
                </p>
                <ul className="mt-4 space-y-3 text-sm text-white/80">
                  {history.consents.map(row => (
                    <li key={row.id} className="border-l-2 border-[var(--brand-accent)]/60 pl-3">
                      {consentEventSentence(row)}
                    </li>
                  ))}
                  {history.suppressions.map(row => (
                    <li key={row.id} className="border-l-2 border-white/20 pl-3">
                      {suppressionSentence(row)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CountList title="By city" counts={dashboard.byCity} />
        <CountList title="By community" counts={dashboard.byCommunity} />
        <CountList title="By category" counts={dashboard.byCategory} />
        <CountList title="By price band" counts={dashboard.byPriceBand} label={priceBandLabel} />
        <CountList title="By recency" counts={dashboard.byRecency} label={recencyBandLabel} />
      </div>
    </div>
  )
}
