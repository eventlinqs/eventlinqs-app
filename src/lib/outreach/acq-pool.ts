import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { readPlatformOrganiserIds } from '@/lib/growth/platform-organiser'
import { organiserCitySlugs } from './organiser-city'
import { ACQ_GUIDE_CITIES } from './acq-target'

/**
 * THE ORGANISER MARKETING POOL AND THE DAY'S SHORTFALL (Lawal's 09:01 of 20 November 2026, item 5: "up to 20 a business day;
 * if fewer qualify, the shortfall is reported and discovery continues; never a fabricated or unsuitable recipient").
 *
 * The target is law 38's: at least ten qualified first contacts with organisers a business day, ACQ-FIRST only. The pool is every
 * real organiser (never the platform's own listings organisation, never a test organiser) in the four guide cities Lawal
 * named on 18 November (11:27), with an email contact whose consent basis is recorded, never yet sent a letter of any kind
 * on any contact. Read from production rows; it writes nothing. On 20 November 2026 it was seven (read by hand at 08:32).
 */
type Db = SupabaseClient<Database>

export async function readAcqPool(db: Db, now: Date): Promise<number> {
  const platform = await readPlatformOrganiserIds(db)
  const contacts = await db.from('organiser_contacts').select('id, organiser_id').eq('channel', 'email').neq('basis', 'none').limit(5000)
  if (contacts.error) throw new Error(`the contacts with a basis: ${contacts.error.message}`)
  const organiserIds = [...new Set((contacts.data ?? []).map((c) => c.organiser_id))].filter((id) => !platform.has(id))
  if (organiserIds.length === 0) return 0
  const everyContact = await db.from('organiser_contacts').select('id, organiser_id').in('organiser_id', organiserIds).limit(10000)
  if (everyContact.error) throw new Error(`their contacts: ${everyContact.error.message}`)
  const contactIds = (everyContact.data ?? []).map((c) => c.id)
  const written = new Set<string>()
  if (contactIds.length > 0) {
    const touches = await db.from('outreach_touches').select('contact_id').in('contact_id', contactIds).in('state', ['queued', 'sending', 'sent']).limit(10000)
    if (touches.error) throw new Error(`their letters: ${touches.error.message}`)
    const organiserOf = new Map((everyContact.data ?? []).map((c) => [c.id, c.organiser_id]))
    for (const t of touches.data ?? []) {
      const o = organiserOf.get(t.contact_id)
      if (o) written.add(o)
    }
  }
  const never = organiserIds.filter((id) => !written.has(id))
  if (never.length === 0) return 0
  const rows = await db.from('organisers').select('id, found_on, organisation_id').in('id', never)
  if (rows.error) throw new Error(`the organisers: ${rows.error.message}`)
  const cities = await organiserCitySlugs(db, rows.data ?? [], now)
  return (rows.data ?? []).filter((o) => ACQ_GUIDE_CITIES.includes(cities.get(o.id) ?? '')).length
}
