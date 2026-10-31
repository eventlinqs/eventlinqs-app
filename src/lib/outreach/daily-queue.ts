import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { melbourneDayStart } from '@/lib/listings/horizon'
import { contactRefusal, type ContactChannel } from './crm'
import { buildDailyQueue, type QueueChannel, type QueueTouch } from './daily-queue-math'
import { touchVoiceMessage } from './touch-voice'
import { readVoicePolicy, voiceContentHash, voiceProblems, type VoiceMessage } from './voice-gate'

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
  organiser_contacts: { channel: string; address: string; person_name: string | null; organisers: { name: string } | null } | null
}

export async function readDailyQueue(db: Admin, now: Date): Promise<QueueChannel[]> {
  // The communication gateway's policy; unreadable means the queue is not shown at all (POLICY_UNAVAILABLE, stop).
  const policy = readVoicePolicy()
  const dayStart = melbourneDayStart(now, 0).toISOString()
  const [held, sent] = await Promise.all([
    readEveryRow<HeldRow>('the held outreach drafts', (from, to) =>
      db
        .from('outreach_touches')
        .select('id, contact_id, step, purpose, held_because, subject, body, tracked_link, drafted_at, organiser_contacts!inner(channel, address, person_name, organisers(name))')
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
  // A follow up continues a thread: the first message's id is the thread it answers.
  const following = [...new Set(held.filter((r) => (r.step ?? 1) > 1).map((r) => r.contact_id))]
  const firsts = new Map<string, string>()
  if (following.length > 0) {
    const f = await db.from('outreach_touches').select('id, contact_id').in('contact_id', following).eq('step', 1).eq('state', 'sent')
    if (f.error) throw new Error(`the first messages of the threads: ${f.error.message}`)
    for (const row of f.data ?? []) firsts.set(row.contact_id, row.id)
  }

  const touches: QueueTouch[] = []
  for (const r of held) {
    const c = r.organiser_contacts
    if (!c) continue
    const voice = touchVoiceMessage({
      channel: c.channel as ContactChannel,
      address: c.address,
      personName: c.person_name,
      organiserName: c.organisers?.name ?? null,
      purpose: r.purpose,
      step: r.step,
      subject: r.subject,
      body: r.body,
      firstTouchId: firsts.get(r.contact_id) ?? null,
    })
    touches.push({
      touchId: r.id,
      step: r.step,
      purpose: r.purpose,
      heldBecause: r.held_because ?? [],
      refusal: refusals.get(r.contact_id) ?? null,
      voiceProblems: voiceProblems(voice, policy),
      contentHash: voiceContentHash(voice),
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

/** One held message as the gateway reads it, from what is stored now: the Sent press judges these words, never the page's. */
export async function readTouchVoice(db: Admin, touchId: string): Promise<VoiceMessage | null> {
  const t = await db
    .from('outreach_touches')
    .select('id, contact_id, step, purpose, subject, body, organiser_contacts!inner(channel, address, person_name, organisers(name))')
    .eq('id', touchId)
    .eq('state', 'held')
    .maybeSingle()
  if (t.error) throw new Error(`the message: ${t.error.message}`)
  if (!t.data) return null
  const row = t.data as unknown as HeldRow
  const c = row.organiser_contacts
  if (!c) return null
  let firstTouchId: string | null = null
  if ((row.step ?? 1) > 1) {
    const f = await db.from('outreach_touches').select('id').eq('contact_id', row.contact_id).eq('step', 1).eq('state', 'sent').maybeSingle()
    if (f.error) throw new Error(`the first message of the thread: ${f.error.message}`)
    firstTouchId = f.data?.id ?? null
  }
  return touchVoiceMessage({
    channel: c.channel as ContactChannel,
    address: c.address,
    personName: c.person_name,
    organiserName: c.organisers?.name ?? null,
    purpose: row.purpose,
    step: row.step,
    subject: row.subject,
    body: row.body,
    firstTouchId,
  })
}
