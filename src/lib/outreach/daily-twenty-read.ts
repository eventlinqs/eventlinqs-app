import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { readPlatformOrganiserIds, withoutPlatformOrganisers } from '@/lib/growth/platform-organiser'
import { isAcquisitionState, STATE_WORDS } from './acquisition-states'
import { contactRefusal } from './crm'
import { buildDailyTwenty, contactFor, EXPIRED_REFUSAL, groupOf, type DailyCandidate, type DailyTwenty, type StoredContact } from './daily-twenty'
import { readOrganiserScores } from './organiser-score-read'

/**
 * THE DAILY TWENTY FROM PRODUCTION'S OWN ROWS (V3 item 5; the rules are ./daily-twenty.ts, pure). Reads, writes nothing:
 * each organiser's stored acquisition state, the cadence's next due day (outreach_pipeline), the organiser score
 * (./organiser-score-read.ts), their contacts with the database's own refusal for each (outreach_contact_refusal), and
 * the contact their last sent message went to. A failed read throws, so a screen says the day could not be read rather
 * than showing an empty day. Nothing is drafted or sent; the sender stays on 'hold' and Lawal sends every message.
 */

type Admin = SupabaseClient<Database>

/**
 * ORGANISERS ALREADY WRITTEN TO OUTSIDE THE CRM (Lawal's 11:11 of 12 November 2026: "Only organisers not already
 * contacted (dedupe against every recorded touch, including the 20 he sent ... if they can be identified)"). The CRM has
 * recorded no send yet (production, 12 November 11:43: 0 sent); of the 31 addresses known to be written to from his own
 * mailbox, these organisers' contacts are in the CRM. Named by id, never by address. Each comes off this list once its
 * real touch is recorded in the CRM, which then dedupes it by itself.
 */
export const WRITTEN_OUTSIDE_THE_CRM: ReadonlySet<string> = new Set([
  'e65ba437-cc9f-4b87-84d9-54b64559a4b1', // African Music and Cultural Festival (Lawal's own correspondence since October)
  'd55b0beb-eb52-4ae6-bb89-e72a6e95bcc8', // Nigerian Society of VIC
])

export async function readDailyTwenty(db: Admin, now: Date = new Date()): Promise<DailyTwenty> {
  const todayInMelbourne = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(now)

  // The platform's own listings organisation is never one of the day's twenty (src/lib/growth/platform-organiser.ts).
  const organisers = withoutPlatformOrganisers(
    await readEveryRow<{ id: string; name: string; acquisition_state: string; instagram_handle: string | null }>('the organisers', (a, b) =>
      db.from('organisers').select('id, name, acquisition_state, instagram_handle').order('id', { ascending: true }).range(a, b),
    ),
    await readPlatformOrganiserIds(db),
  )
  const pipeline = await readEveryRow<{ organiser_id: string | null; next_due_on: string | null }>('the outreach pipeline', (a, b) =>
    db.from('outreach_pipeline').select('organiser_id, next_due_on').order('organiser_id', { ascending: true }).range(a, b),
  )
  const dueOn = new Map(pipeline.filter((p) => p.organiser_id).map((p) => [p.organiser_id as string, p.next_due_on]))

  const grouped = organisers.flatMap((o) => {
    if (WRITTEN_OUTSIDE_THE_CRM.has(o.id)) return []
    if (!isAcquisitionState(o.acquisition_state)) return []
    const group = groupOf(o.acquisition_state, dueOn.get(o.id) ?? null, todayInMelbourne)
    return group ? [{ ...o, state: o.acquisition_state, group }] : []
  })
  if (grouped.length === 0) return buildDailyTwenty([])

  const scores = new Map<string, number | 'stopped'>()
  const cities = new Map<string, string | null>()
  for (const s of await readOrganiserScores(db, now)) {
    scores.set(s.id, s.state === 'scored' ? s.score : 'stopped')
    cities.set(s.id, s.city)
  }

  const contacts = await readEveryRow<{ id: string; organiser_id: string; channel: string; address: string; person_name: string | null }>('their contacts', (a, b) =>
    db.from('organiser_contacts').select('id, organiser_id, channel, address, person_name').order('id', { ascending: true }).range(a, b),
  )
  const sent = await readEveryRow<{ contact_id: string; sent_at: string | null }>('the messages sent', (a, b) =>
    db.from('outreach_touches').select('contact_id, sent_at').eq('state', 'sent').order('id', { ascending: true }).range(a, b),
  )
  const organiserOfContact = new Map(contacts.map((c) => [c.id, c.organiser_id]))
  const lastContact = new Map<string, { contactId: string; at: string }>()
  for (const t of sent) {
    const org = organiserOfContact.get(t.contact_id)
    if (!org || !t.sent_at) continue
    const seen = lastContact.get(org)
    if (!seen || t.sent_at > seen.at) lastContact.set(org, { contactId: t.contact_id, at: t.sent_at })
  }

  const candidates: DailyCandidate[] = []
  for (const o of grouped) {
    const score = scores.get(o.id)
    if (score === 'stopped') continue
    const theirs: StoredContact[] = []
    for (const c of contacts.filter((x) => x.organiser_id === o.id)) {
      const refusal = o.state === 'expired' ? EXPIRED_REFUSAL : await contactRefusal(db, c.id)
      theirs.push({ id: c.id, channel: c.channel, address: c.address, personName: c.person_name, refusal })
    }
    const due = dueOn.get(o.id)
    candidates.push({
      organiserId: o.id,
      organiserName: o.name,
      group: o.group,
      score: score ?? 0,
      city: cities.get(o.id) ?? null,
      why: o.group === 'follow_up' && o.state === 'contacted' && due ? `${STATE_WORDS[o.state]}; next step due ${due}` : STATE_WORDS[o.state],
      contact: contactFor(theirs, lastContact.get(o.id)?.contactId ?? null),
      socialHandle: o.instagram_handle ? `@${o.instagram_handle.replace(/^@/, '')}` : null,
    })
  }
  return buildDailyTwenty(candidates)
}
