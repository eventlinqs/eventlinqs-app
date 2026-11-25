import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type Admin = SupabaseClient<Database>

/**
 * MESSAGES PER CONTACT, THE LAST SEVEN DAYS, IN THE 08:00 REPORT (Lawal, 26 November 2026, 00:01: "it's better than just
 * bombarding the user with too many emails"; the PM's 00:02, item A: "The 08:00 report counts messages per contact per
 * week"). Every message sent in the last seven days, of every purpose, counted by the contact it went to: how many
 * contacts were written to, how many once, twice, three times or more, and the businesses written to most (law 25:
 * business names). One message carrying every goal (./goals.ts) and one open message at a time (./contact-policy.ts)
 * should keep almost every contact at once; this line shows whether they do.
 */
export type SentToContact = { readonly contactId: string; readonly business: string | null }

/** The line, from one row per message sent. Pure. */
export function messagesPerContactLine(sent: readonly SentToContact[]): string {
  if (sent.length === 0) return 'no messages sent in the last 7 days.'
  const per = new Map<string, { business: string; count: number }>()
  for (const s of sent) {
    const was = per.get(s.contactId)
    per.set(s.contactId, { business: was?.business ?? s.business ?? 'a contact with no business recorded', count: (was?.count ?? 0) + 1 })
  }
  const counts = [...per.values()]
  const once = counts.filter((c) => c.count === 1).length
  const twice = counts.filter((c) => c.count === 2).length
  const more = counts.filter((c) => c.count >= 3).length
  const most = counts
    .filter((c) => c.count >= 2)
    .sort((a, b) => b.count - a.count || a.business.localeCompare(b.business))
    .slice(0, 3)
    .map((c) => `${c.business} ${c.count}`)
  const contacts = counts.length === 1 ? '1 contact' : `${counts.length} contacts`
  return `${sent.length} sent to ${contacts}: ${once} once, ${twice} twice, ${more} three times or more${most.length > 0 ? `; most: ${most.join(', ')}` : ''}.`
}

const DAY = 86_400_000

/** The last seven days' line, read from production; a read that fails throws, and the report says so. */
export async function readMessagesPerContact(db: Admin, now: Date): Promise<string> {
  const since = new Date(now.getTime() - 7 * DAY).toISOString()
  const sent = await db.from('outreach_touches').select('contact_id').eq('state', 'sent').gte('sent_at', since).limit(5000)
  if (sent.error) throw new Error(`the messages sent could not be read: ${sent.error.message}`)
  const rows = (sent.data ?? []) as { contact_id: string }[]
  if (rows.length >= 5000) throw new Error('5000 or more messages in the week; not counted on a part')
  const ids = [...new Set(rows.map((r) => r.contact_id))]
  const contacts = ids.length > 0 ? await db.from('organiser_contacts').select('id, organisers(name)').in('id', ids) : { data: [], error: null }
  if (contacts.error) throw new Error(`the contacts written to could not be read: ${contacts.error.message}`)
  const business = new Map(((contacts.data ?? []) as unknown as { id: string; organisers: { name: string | null } | null }[]).map((c) => [c.id, c.organisers?.name ?? null]))
  return messagesPerContactLine(rows.map((r) => ({ contactId: r.contact_id, business: business.get(r.contact_id) ?? null })))
}
