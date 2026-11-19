import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { readPlatformOrganiserIds, withoutPlatformOrganisers } from '@/lib/growth/platform-organiser'
import { pipelineBoard, ticketingFromOrders } from '@/lib/crm/pipeline-board'
import { NO_TICKETING, type TicketingFacts } from '@/lib/crm/stages'

/**
 * THE ORGANISER PIPELINE AS A BOARD, /admin/acquisition?view=board (the CRM standard of 19 November 2026, section 2
 * item 3; the PM's 22:14 item 2). Lawal's stages in his order, each organiser a card with the state its records
 * prove and the next action its stage asks for (src/lib/crm/pipeline-board.ts). First sale and Recurring are read
 * from paid orders on the organiser's organisation; the organiser's own record (/admin/crm/organisers/[id]) reads
 * every road in full, ticketing activated included. A view of the pipeline page, not a route of its own: it adds no
 * client code. Nothing here writes.
 */
/** The board itself; the page that renders it has already checked the session and written the audit row. */
export async function PipelineBoardView() {
  const db = createAdminClient()
  const organisers = await db.from('organisers').select('id, name, acquisition_state, organisation_id')
  if (organisers.error) throw new Error(`organisers: ${organisers.error.message}`)
  const rows = withoutPlatformOrganisers(
    (organisers.data ?? []) as { id: string; name: string; acquisition_state: string; organisation_id: string | null }[],
    await readPlatformOrganiserIds(db),
  )

  // Paid orders (confirmed or partially refunded, above $0), the scorecard's own reading (migration 20261101044501),
  // matched to each organisation through its events.
  const orders = await db.from('orders').select('event_id, confirmed_at').in('status', ['confirmed', 'partially_refunded']).gt('total_cents', 0)
  if (orders.error) throw new Error(`orders: ${orders.error.message}`)
  const paid = (orders.data ?? []) as { event_id: string; confirmed_at: string | null }[]
  const eventIds = [...new Set(paid.map((o) => o.event_id))]
  const orgOfEvent = new Map<string, string>()
  if (eventIds.length > 0) {
    const events = await db.from('events').select('id, organisation_id').in('id', eventIds)
    if (events.error) throw new Error(`events: ${events.error.message}`)
    for (const e of (events.data ?? []) as { id: string; organisation_id: string | null }[]) if (e.organisation_id) orgOfEvent.set(e.id, e.organisation_id)
  }
  const confirmedByOrg = new Map<string, (string | null)[]>()
  for (const o of paid) {
    const org = orgOfEvent.get(o.event_id)
    if (org) confirmedByOrg.set(org, [...(confirmedByOrg.get(org) ?? []), o.confirmed_at])
  }
  const orgOf = new Map(rows.map((r) => [r.id, r.organisation_id]))
  const factsOf = (id: string): TicketingFacts => {
    const org = orgOf.get(id)
    const confirmed = org ? confirmedByOrg.get(org) : undefined
    return confirmed ? ticketingFromOrders(confirmed) : NO_TICKETING
  }
  const board = pipelineBoard(
    rows.map((r) => ({ id: r.id, name: r.name, acquisitionState: r.acquisition_state })),
    factsOf,
  )
  const total = rows.length - board.unread

  return (
    <div>
      <header className="mb-6">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-[var(--admin-muted)]">Growth</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Pipeline board</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--admin-soft)]">
          {total} {total === 1 ? 'organiser' : 'organisers'} on Lawal&apos;s stages, each where its own records place it. A card moves when the proof moves it: a reply, a claim, a
          first sale. Open a card for the whole record.
        </p>
        <p className="mt-2 text-sm">
          <Link prefetch={false} href="/admin/acquisition" className="underline underline-offset-2">
            The pipeline as a list, with scores and today&apos;s queue
          </Link>
        </p>
      </header>

      <div className="-mx-6 overflow-x-auto px-6 pb-4 lg:-mx-10 lg:px-10" data-pipeline-board>
        <ol className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {board.columns.map((c) => (
            <li
              key={c.stage}
              data-stage={c.stage}
              className={`w-full shrink-0 rounded-xl border border-[var(--admin-line)] p-3 sm:w-64 ${c.side ? 'bg-[var(--admin-tint)]' : 'bg-[var(--admin-paper)]'}`}
            >
              <h2 className="flex items-baseline justify-between gap-2 font-display text-[11px] uppercase tracking-[0.18em] text-[var(--admin-muted)]">
                <span>{c.words}</span>
                <span className="text-sm font-semibold normal-case tracking-normal text-[var(--admin-ink)]">{c.cards.length}</span>
              </h2>
              {c.cards.length === 0 ? (
                <p className="mt-3 text-xs text-[var(--admin-muted)]">None at this stage.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {c.cards.map((card) => (
                    <li key={card.id}>
                      <Link
                        prefetch={false}
                        href={`/admin/crm/organisers/${card.id}`}
                        className="block min-h-11 rounded-lg border border-[var(--admin-line)] bg-[var(--admin-canvas)] p-3 text-sm transition hover:border-[var(--brand-accent)]"
                      >
                        <span className="block font-medium text-[var(--admin-ink)]">{card.name}</span>
                        <span className="mt-1 block text-xs text-[var(--admin-muted)]">{card.stateWords}</span>
                        <span className="mt-1 block text-xs text-[var(--admin-soft)]">Next: {card.nextAction}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </div>
      {board.unread > 0 ? (
        <p className="mt-4 text-sm text-[var(--admin-soft)]">{board.unread} {board.unread === 1 ? 'organiser carries' : 'organisers carry'} a state this board does not know; the record shows it.</p>
      ) : null}
    </div>
  )
}
