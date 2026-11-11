import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrganiserRecord, RecordReadError } from '@/lib/crm/timeline'
import { CRM_STAGE_WORDS } from '@/lib/crm/stages'

/**
 * ONE ORGANISER'S RECORD (the Growth OS directive of 11 November 2026, Release 1: "one organiser record shows everything
 * that happened, everything pending and the next action"). Built for the phone first (390), the way Lawal reads admin.
 * The stage is read from proof and the ticketing records (src/lib/crm/stages.ts); the history and the pending list are
 * gathered from every source by src/lib/crm/timeline.ts. Nothing on this page is typed by a person, and nothing here
 * writes or sends. Staff only, never indexed.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Organiser record | EventLinqs Admin',
  robots: { index: false, follow: false },
}

const when = (iso: string) =>
  new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

export default async function OrganiserRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) redirect('/admin')
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  await recordAuditEvent({ action: 'admin.crm.organiser.view', targetType: 'organiser', targetId: id, session })

  let read: Awaited<ReturnType<typeof readOrganiserRecord>>
  try {
    read = await readOrganiserRecord(createAdminClient(), id)
  } catch (e) {
    const what = e instanceof RecordReadError ? e.message : 'the record could not be read'
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <p className="font-display text-sm text-red-300">This record could not be shown: {what}. Nothing is missing from it; the read failed. Reload to try again.</p>
      </main>
    )
  }
  if (!read) notFound()
  const { sources: s, record: r } = read

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <Link href="/admin/acquisition" className="font-display text-xs text-white/60 hover:text-white">Organiser pipeline</Link>
      <h1 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">{s.organiser.name}</h1>
      <p className="mt-2 font-display text-sm">
        <span className="rounded-md bg-white/10 px-2 py-0.5 font-semibold">{CRM_STAGE_WORDS[r.stage]}</span>
        <span className="ml-2 text-white/60">{r.mayWrite ? 'May be written to' : 'No message may reach them'}</span>
      </p>

      <section aria-label="Next action" className="mt-5 rounded-xl border border-white/15 p-4">
        <h2 className="font-display text-[11px] uppercase tracking-[0.18em] text-white/50">Next action</h2>
        <p className="mt-1 font-display text-base">{r.nextAction}</p>
      </section>

      <section aria-label="Pending" className="mt-5">
        <h2 className="font-display text-[11px] uppercase tracking-[0.18em] text-white/50">Pending ({r.pending.length})</h2>
        {r.pending.length === 0 ? (
          <p className="mt-1 font-display text-sm text-white/60">Nothing is waiting on this record.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {r.pending.map((p, i) => (
              <li key={i} className="rounded-lg bg-white/5 p-3 font-display text-sm">
                {p.href ? <Link href={p.href} className="underline-offset-2 hover:underline">{p.words}</Link> : p.words}
                <span className="block text-xs text-white/50">since {when(p.since)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Contacts" className="mt-5">
        <h2 className="font-display text-[11px] uppercase tracking-[0.18em] text-white/50">Contacts ({s.contacts.length})</h2>
        <ul className="mt-2 space-y-2">
          {s.contacts.map((c) => (
            <li key={c.id} className="font-display text-sm">
              <span className="font-semibold">{c.role}</span> <span className="text-white/60">{c.channel}</span>
              <span className="block break-all text-white/80">{c.address}</span>
              <span className="block text-xs text-white/50">{c.basis === 'none' ? 'No lawful basis recorded: not to be written to' : `Lawful basis: ${c.basis.replace(/_/g, ' ')}`}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Ticketing" className="mt-5">
        <h2 className="font-display text-[11px] uppercase tracking-[0.18em] text-white/50">Ticketing on EventLinqs</h2>
        <p className="mt-1 font-display text-sm">
          {s.ticketing.ticketingActivated ? 'A night ahead is on sale on EventLinqs.' : 'No night ahead is on sale on EventLinqs.'} {s.ticketing.paidOrders} paid order{s.ticketing.paidOrders === 1 ? '' : 's'}.
        </p>
      </section>

      <section aria-label="Nights" className="mt-5">
        <h2 className="font-display text-[11px] uppercase tracking-[0.18em] text-white/50">Nights ({s.nights.length})</h2>
        <ul className="mt-2 space-y-1">
          {s.nights.slice(0, 12).map((n) => (
            <li key={n.id} className="font-display text-sm">
              <Link href={`/events/${n.slug}`} className="hover:underline">{n.title}</Link> <span className="text-white/50">{n.start_date.slice(0, 10)}, {n.status}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="History" className="mt-5 pb-10">
        <h2 className="font-display text-[11px] uppercase tracking-[0.18em] text-white/50">Everything that happened ({r.lines.length})</h2>
        <ol className="mt-2 space-y-2 border-l border-white/15 pl-3">
          {r.lines.map((l, i) => (
            <li key={i} className="font-display text-sm">
              <span className="block text-xs text-white/50">{when(l.at)}</span>
              {l.href ? <Link href={l.href} className="hover:underline">{l.words}</Link> : l.words}
            </li>
          ))}
        </ol>
      </section>
    </main>
  )
}
