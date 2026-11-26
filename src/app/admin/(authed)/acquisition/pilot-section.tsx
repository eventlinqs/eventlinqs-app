import { createAdminClient } from '@/lib/supabase/admin'
import { pilotLine, readPilotContacts, readPilotMeasures, type PilotContact, type PilotMeasures } from '@/lib/outreach/pilot-board'
import { openInApp } from '@/lib/outreach/daily-queue-math'
import type { ContactChannel } from '@/lib/outreach/crm'
import { recordPilotMessageAction } from './pilot-actions'

/**
 * THE SOCIAL PILOT, IN ADMIN (law 31 narrowed by Lawal at 23:01 on 26 November 2026; the PM's car K lean, items K3 and K4).
 * The organisers the PM qualified (at most 20), each with its business enquiry basis, its messages and the eight measures.
 * The one write: a person records a message they sent on Instagram or Facebook (./pilot-actions.ts). Nothing here sends.
 */
export async function PilotSection() {
  const db = createAdminClient()
  let contacts: PilotContact[] | null = null
  let measures: PilotMeasures | null = null
  try {
    contacts = await readPilotContacts(db)
    measures = await readPilotMeasures(db, contacts)
  } catch (err) {
    console.warn('[admin/acquisition] the social pilot could not be read', err instanceof Error ? err.message : String(err))
  }
  return (
    <section id="pilot" data-social-pilot aria-label="The social pilot" className="mb-8">
      <h2 className="font-display text-[11px] uppercase tracking-[0.18em] text-[var(--admin-muted)]">The social pilot</h2>
      <p className="mt-2 max-w-2xl text-sm text-[var(--admin-soft)]">
        Instagram and Facebook, to 24 December. Only the organisers qualified here may get a direct message, sent by a person from EventLinqs&apos; account. After
        you send one, paste it exactly as sent and press Record as sent.
      </p>
      {contacts === null || measures === null ? (
        <p className="mt-4 text-sm text-[var(--admin-ink)]">The pilot could not be read just now. Reload in a minute; nothing has been lost.</p>
      ) : (
        <>
          <p data-pilot-line className="mt-3 max-w-2xl text-sm text-[var(--admin-ink)]">{pilotLine(measures)}</p>
          {contacts.length === 0 ? null : (
            <ul className="mt-4 divide-y divide-[var(--admin-line)] rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] px-4">
              {contacts.map((c) => {
                const href = openInApp(c.channel as ContactChannel, c.address)
                return (
                  <li key={c.id} data-pilot-contact={c.id} className="py-4">
                    <p className="text-sm font-semibold text-[var(--admin-ink)]">
                      {c.organiserName}{' '}
                      <span className="font-normal text-[var(--admin-soft)]">
                        | {c.channel === 'instagram' ? 'Instagram' : 'Facebook'} | {c.sent === 0 ? 'not yet written to' : `${c.sent} sent`}
                        {c.positive ? ' | said yes' : ''}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-[var(--admin-soft)]">Basis: {c.basis}</p>
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-[44px] items-center text-sm underline underline-offset-2">
                        {c.channel === 'instagram' ? 'Open in Instagram' : 'Open their Page'}
                      </a>
                    ) : null}
                    <form action={recordPilotMessageAction} className="mt-2 space-y-2">
                      <input type="hidden" name="contact" value={c.id} />
                      <label className="block text-xs text-[var(--admin-soft)]" htmlFor={`pilot-body-${c.id}`}>
                        The message exactly as you sent it
                      </label>
                      <textarea
                        id={`pilot-body-${c.id}`}
                        name="body"
                        required
                        rows={5}
                        className="w-full rounded-md border border-[var(--admin-line)] bg-[var(--admin-paper)] px-3 py-2 text-sm text-[var(--admin-ink)]"
                      />
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex min-h-[44px] items-center gap-2 text-sm text-[var(--admin-ink)]">
                          <span>Which message</span>
                          <select name="step" defaultValue={c.sent === 0 ? '1' : '2'} className="min-h-[44px] rounded-md border border-[var(--admin-line)] bg-[var(--admin-paper)] px-2 text-sm text-[var(--admin-ink)]">
                            <option value="1">The first</option>
                            <option value="2">The day 4 follow up</option>
                          </select>
                        </label>
                        <button type="submit" className="inline-flex min-h-[44px] items-center rounded-full bg-[var(--brand-accent)] px-5 text-sm font-semibold text-[var(--color-navy-950)]">
                          Record as sent
                        </button>
                      </div>
                    </form>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
