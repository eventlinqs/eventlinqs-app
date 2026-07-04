import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { TransferTicketForm } from '@/components/features/tickets/transfer-ticket-form'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'My tickets | EventLinqs',
  robots: { index: false, follow: false },
}

interface MyTicketRow {
  id: string
  ticket_code: string
  secret: string
  status: string
  event: {
    title: string
    start_date: string
    venue_name: string | null
    venue_city: string | null
  } | null
  order_item: { item_name: string } | null
}

function formatAuDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

const STATUS_TONE: Record<string, string> = {
  valid: 'bg-success/15 text-success',
  scanned: 'bg-ink-200 text-ink-700',
  refunded: 'bg-error/15 text-error',
  void: 'bg-error/15 text-error',
  transferred: 'bg-ink-200 text-ink-700',
}

export default async function MyTicketsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirect=/tickets')

  // RLS policy "Holders can view their own tickets" scopes this to the
  // signed-in buyer's orders, so a session-scoped select is sufficient
  // (no admin client). secret is the holder's own row, readable by them.
  const { data } = await supabase
    .from('tickets')
    .select(
      'id, ticket_code, secret, status, created_at, event:events(title, start_date, venue_name, venue_city), order_item:order_items(item_name)',
    )
    .order('created_at', { ascending: false })

  const tickets = (data ?? []) as unknown as MyTicketRow[]

  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-canvas px-4 py-10">
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink-900">
        My tickets
      </h1>
      <p className="mt-2 text-sm text-ink-600">
        Open a ticket to show its QR code at entry.
      </p>

      {tickets.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-ink-200 bg-white p-8 text-center">
          <p className="font-display text-lg font-bold text-ink-900">No tickets yet</p>
          <p className="mt-2 text-sm text-ink-600">
            When you book an event, your tickets appear here.
          </p>
          <Link
            href="/events"
            className="mt-5 inline-flex rounded-full bg-gold-500 px-5 py-2.5 text-sm font-semibold text-ink-900 hover:bg-gold-600"
          >
            Browse events
          </Link>
        </div>
      ) : (
        <ul role="list" className="mt-8 space-y-3">
          {tickets.map(t => {
            const tone = STATUS_TONE[t.status] ?? STATUS_TONE.valid
            return (
              <li key={t.ticket_code}>
                <Link
                  href={`/t/${encodeURIComponent(t.ticket_code)}?k=${encodeURIComponent(t.secret)}`}
                  className="block rounded-2xl border border-ink-200 bg-white p-5 transition-colors hover:border-[var(--brand-accent)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate font-display text-base font-bold text-ink-900">
                        {t.event?.title ?? 'Event'}
                      </p>
                      {t.event?.start_date && (
                        <p className="mt-0.5 text-sm text-ink-700">
                          {formatAuDate(t.event.start_date)}
                        </p>
                      )}
                      {(t.event?.venue_name || t.event?.venue_city) && (
                        <p className="text-sm text-ink-600">
                          {[t.event?.venue_name, t.event?.venue_city].filter(Boolean).join(', ')}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-ink-500">
                        {t.order_item?.item_name ?? 'Admission'} · {t.ticket_code}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${tone}`}>
                      {t.status === 'scanned' ? 'Checked in' : t.status.charAt(0).toUpperCase() + t.status.slice(1)}
                    </span>
                  </div>
                </Link>
                {t.status === 'valid' && (
                  <TransferTicketForm ticketId={t.id} eventTitle={t.event?.title ?? 'this event'} />
                )}
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
