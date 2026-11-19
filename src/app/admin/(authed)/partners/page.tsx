import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { PARTNER_KINDS, PARTNER_KIND_WORDS, enquiriesOf, partnersOf } from '@/lib/partners/partners'
import { formatPlatformDateTime } from '@/lib/dates/event-time'
import { enquiryStatusAction, partnerStatusAction, savePartnerAction } from './actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Partners | EventLinqs Admin',
  robots: { index: false, follow: false },
}

/**
 * PARTNERS IN ADMIN (Train C, row 14): the enquiries from /partners, newest first, and the partner records, each made
 * here as a draft and put live by one press, when its public page goes up labelled Partner.
 */

const FIELD = 'mt-1 block min-h-[44px] w-full rounded-lg border border-[var(--admin-line)] bg-[var(--admin-tint)] px-3 text-sm text-[var(--admin-ink)]'
const BUTTON = 'inline-flex min-h-[44px] items-center rounded-full bg-[var(--brand-accent)] px-5 text-sm font-semibold text-[var(--color-navy-950)]'
const QUIET = 'inline-flex min-h-[44px] items-center rounded-full border border-[var(--admin-line)] px-4 text-sm font-semibold text-[var(--admin-soft)] hover:border-[var(--admin-line-strong)] hover:text-[var(--admin-ink)]'

export default async function AdminPartnersPage({ searchParams }: { searchParams: Promise<{ said?: string }> }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.partners.view', session })
  const { said } = await searchParams
  const admin = createAdminClient()
  const [enquiries, partners] = await Promise.all([enquiriesOf(admin).catch(() => null), partnersOf(admin, 'all').catch(() => null)])
  if (enquiries === null || partners === null) {
    return (
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Partners</h1>
        <p data-state="refusal" className="mt-4 max-w-2xl text-sm text-[var(--admin-soft)]">
          The enquiries and partner records could not be read. If migration 20261027140501 is not yet applied, this page reads nothing until it is.
        </p>
      </div>
    )
  }

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-[var(--admin-muted)]">Growth</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Partners</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--admin-soft)]">Enquiries from the partner form, and the partners whose pages are public, each labelled Partner.</p>
      </header>

      {said === undefined ? null : (
        <p role="status" data-said className="mb-6 max-w-2xl rounded-lg border border-[var(--admin-line)] bg-[var(--admin-tint)] p-4 text-sm text-[var(--admin-ink)]">
          {said}
        </p>
      )}

      <section data-section="enquiries" className="mb-8 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-6">
        <h2 className="font-display text-lg font-semibold text-[var(--admin-ink)]">Enquiries</h2>
        {enquiries.length === 0 ? (
          <p data-state="empty" className="mt-3 text-sm text-[var(--admin-soft)]">
            No enquiries yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-4">
            {enquiries.map((e) => (
              <li key={e.id} data-enquiry={e.id} data-status={e.status} className="rounded-lg border border-[var(--admin-line)] p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-[var(--admin-ink)]">
                    {e.organisation} <span className="font-normal text-[var(--admin-soft)]">({PARTNER_KIND_WORDS[e.kind]})</span>
                  </p>
                  <p className="text-xs text-[var(--admin-muted)]">{formatPlatformDateTime(e.createdAt)}</p>
                </div>
                <p className="mt-1 text-sm text-[var(--admin-soft)]">
                  {e.name},{' '}
                  <a href={`mailto:${e.email}`} className="underline underline-offset-2">
                    {e.email}
                  </a>
                </p>
                <p className="mt-2 whitespace-pre-line break-words text-sm text-[var(--admin-ink)]">{e.message}</p>
                {e.status === 'new' ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action={enquiryStatusAction}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="status" value="answered" />
                      <button type="submit" className={QUIET}>
                        Mark answered
                      </button>
                    </form>
                    <form action={enquiryStatusAction}>
                      <input type="hidden" name="id" value={e.id} />
                      <input type="hidden" name="status" value="closed" />
                      <button type="submit" className={QUIET}>
                        Close
                      </button>
                    </form>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-[var(--admin-muted)]">{e.status === 'answered' ? 'Answered' : 'Closed'}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section data-section="partners" className="mb-8 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-6">
        <h2 className="font-display text-lg font-semibold text-[var(--admin-ink)]">Partner records</h2>
        {partners.length === 0 ? (
          <p data-state="empty" className="mt-3 text-sm text-[var(--admin-soft)]">
            No partners yet. Make the first below.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {partners.map((p) => (
              <li key={p.id} data-partner={p.slug} data-status={p.status} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--admin-line)] p-4">
                <div>
                  <p className="font-semibold text-[var(--admin-ink)]">{p.name}</p>
                  <p className="text-sm text-[var(--admin-soft)]">
                    {PARTNER_KIND_WORDS[p.kind]}, {p.status === 'live' ? 'live' : 'draft'}
                    {p.status === 'live' ? (
                      <>
                        {', '}
                        <Link prefetch={false} href={`/partners/${p.slug}`} className="underline underline-offset-2">
                          its page
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
                <form action={partnerStatusAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="status" value={p.status === 'live' ? 'draft' : 'live'} />
                  <button type="submit" data-press={p.status === 'live' ? 'draft' : 'live'} className={p.status === 'live' ? QUIET : BUTTON}>
                    {p.status === 'live' ? 'Back to draft' : 'Put live'}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <form action={savePartnerAction} data-form="partner" className="mt-6 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="text-sm text-[var(--admin-soft)]">
            Name
            <input name="name" required className={FIELD} />
          </label>
          <label className="text-sm text-[var(--admin-soft)]">
            Address on EventLinqs
            <input name="slug" required placeholder="beavs-bar" className={FIELD} />
          </label>
          <label className="text-sm text-[var(--admin-soft)]">
            Kind
            <select name="kind" className={FIELD}>
              {PARTNER_KINDS.map((k) => (
                <option key={k} value={k}>
                  {PARTNER_KIND_WORDS[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-[var(--admin-soft)]">
            Website
            <input name="website" type="url" placeholder="https://" className={FIELD} />
          </label>
          <label className="text-sm text-[var(--admin-soft)] sm:col-span-2">
            Who they are, in a line
            <input name="summary" required className={FIELD} />
          </label>
          <div>
            <button type="submit" className={BUTTON}>
              Save as a draft
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
