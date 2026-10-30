import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { melbourneDayStart } from '@/lib/listings/horizon'
import { contactRefusal, type ContactChannel } from './crm'
import { buildDailyQueue, type QueueChannel, type QueueTouch } from './daily-queue-math'

/**
 * The rows behind Lawal's daily outreach queue (the rules are ./daily-queue-math.ts): every held draft with its contact
 * and organiser, whether the database will let that contact be written to now, and what was already marked sent today
 * on each channel, so the day's cap counts both. A failed read throws: the page says the queue could not be read rather
 * than showing an empty day.
 */

type Admin = SupabaseClient<Database>

type HeldRow = {
  id: string
  step: number | null
  purpose: string
  held_because: string[] | null
  contact_id: string
  subject: string | null
  body: string
  tracked_link: string | null
  drafted_at: string
  organiser_contacts: { channel: string; address: string; organisers: { name: string } | null } | null
}

export async function readDailyQueue(db: Admin, now: Date): Promise<QueueChannel[]> {
  const dayStart = melbourneDayStart(now, 0).toISOString()
  const [held, sent] = await Promise.all([
    readEveryRow<HeldRow>('the held outreach drafts', (from, to) =>
      db
        .from('outreach_touches')
        .select('id, contact_id, step, purpose, held_because, subject, body, tracked_link, drafted_at, organiser_contacts!inner(channel, address, organisers(name))')
        .eq('state', 'held')
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: HeldRow[] | null; error: { message: string } | null }>,
    ),
    readEveryRow<{ id: string; organiser_contacts: { channel: string } | null }>('the outreach marked sent today', (from, to) =>
      db
        .from('outreach_touches')
        .select('id, organiser_contacts!inner(channel)')
        .eq('state', 'sent')
        .gte('sent_at', dayStart)
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: { id: string; organiser_contacts: { channel: string } | null }[] | null; error: { message: string } | null }>,
    ),
  ])

  // Suppression is the database's (a stop, an unsubscribe, a no, a lapsed basis): asked once per contact held for.
  const contacts = [...new Set(held.map((r) => r.contact_id))]
  const refusals = new Map(await Promise.all(contacts.map(async (id) => [id, await contactRefusal(db, id)] as const)))

  const touches: QueueTouch[] = []
  for (const r of held) {
    const c = r.organiser_contacts
    if (!c) continue
    touches.push({
      touchId: r.id,
      step: r.step,
      purpose: r.purpose,
      heldBecause: r.held_because ?? [],
      refusal: refusals.get(r.contact_id) ?? null,
      subject: r.subject,
      body: r.body,
      trackedLink: r.tracked_link,
      draftedAt: r.drafted_at,
      channel: c.channel as ContactChannel,
      address: c.address,
      organiserName: c.organisers?.name ?? 'An organiser with no name on file',
    })
  }
  const sentToday: Partial<Record<ContactChannel, number>> = {}
  for (const r of sent) {
    const ch = r.organiser_contacts?.channel as ContactChannel | undefined
    if (ch) sentToday[ch] = (sentToday[ch] ?? 0) + 1
  }
  return buildDailyQueue(touches, sentToday)
}
