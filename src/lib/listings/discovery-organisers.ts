import type { SupabaseClient } from '@supabase/supabase-js'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { founderAccount } from '@/lib/outreach/twenty-drafts'
import { listingWindowOrPredicate } from '@/lib/events/listing-window'
import { readPlatformOrganiserIds } from '@/lib/growth/platform-organiser'

/**
 * EVERY LISTING'S HOST IS A CRM ORGANISER (the Event Discovery Engine, part (d); Lawal's 18:28 of 13 November 2026:
 * "attaches the organiser to every night and enters new organisers into the CRM, so they feed the daily twenty's pool").
 * A listing names its host, the venue whose night it is (ruling A of 23 October 2026, src/lib/listings/shown-organiser.ts),
 * and the CRM holds a venue's organiser through organiser_venues. Each collection turn the engine takes the venues of
 * upcoming published listings that carry no CRM organiser and, for each: links the CRM organiser already named for that
 * venue (the same name, or the same website), or enters one (the venue's name and its own website, made by the founder
 * account as every engine row is), then links it. Never a contact: an address becomes a basis only from its own page (the
 * basis tool). At most PER_TURN a turn, oldest listing first; the rest are taken by the next turns.
 */
export const ORGANISERS_PER_TURN = 40

export const ENGINE_ORGANISER_NOTE = 'Entered by the Event Discovery Engine'

/** The CRM's name key, as organisers.name_key is generated (lower, trimmed, single spaces). Pure. */
export function crmNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** A venue's website as the CRM keeps one: https only, or none. Pure. */
export function crmWebsite(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname.includes('.') ? u.origin : null
  } catch {
    return null
  }
}

export type AttachOutcome = { attached: number; entered: number; failed: string[]; left: number }

export async function attachOrganisers(
  db: SupabaseClient,
  now: Date,
  perTurn = ORGANISERS_PER_TURN,
  /** No venue is started after it (the collection run's own end, less a margin). */
  deadline = Number.POSITIVE_INFINITY,
): Promise<AttachOutcome> {
  const listings = await readEveryRow<{ venue_id: string | null; start_date: string }>('the upcoming listings', (a, b) =>
    db.from('events').select('venue_id, start_date').eq('status', 'published').eq('listing_source', 'eventlinqs')
      .or(listingWindowOrPredicate(now)).order('start_date').range(a, b) as never,
  )
  const venues = [...new Set(listings.map((l) => l.venue_id).filter((v): v is string => !!v))]
  const linked = new Set<string>()
  for (let i = 0; i < venues.length; i += 200) {
    const { data, error } = await db.from('organiser_venues').select('venue_id').in('venue_id', venues.slice(i, i + 200))
    if (error) throw new Error(`the CRM's venues could not be read: ${error.message}`)
    for (const r of data ?? []) linked.add(r.venue_id as string)
  }
  const missing = venues.filter((v) => !linked.has(v))
  const out: AttachOutcome = { attached: 0, entered: 0, failed: [], left: Math.max(0, missing.length - perTurn) }
  if (missing.length === 0) return out
  const by = await founderAccount(db as unknown as Parameters<typeof founderAccount>[0])
  if (by.id === null) {
    out.failed.push(by.why)
    return out
  }
  const taken = missing.slice(0, perTurn)
  /* The platform's own listings organisation is never a venue's organiser (src/lib/growth/platform-organiser.ts). */
  const platform = await readPlatformOrganiserIds(db as never)
  for (const [i, venueId] of taken.entries()) {
    if (Date.now() >= deadline) {
      out.left += taken.length - i
      break
    }
    const { data: venue, error: vErr } = await db.from('venues').select('id, name, website_url').eq('id', venueId).maybeSingle()
    if (vErr || !venue) {
      out.failed.push(`venue ${venueId}: ${vErr?.message ?? 'not found'}`)
      continue
    }
    const name = String(venue.name ?? '').trim()
    if (name.length < 2) {
      out.failed.push(`venue ${venueId}: no name to enter`)
      continue
    }
    const website = crmWebsite(venue.website_url as string | null)
    /* The CRM organiser already named for this venue: by its name, else by its website. */
    let organiserId: string | null = null
    const byName = await db.from('organisers').select('id').eq('name_key', crmNameKey(name)).maybeSingle()
    if (byName.error) {
      out.failed.push(`${name}: the CRM could not be read: ${byName.error.message}`)
      continue
    }
    organiserId = (byName.data?.id as string | undefined) ?? null
    if (organiserId && platform.has(organiserId)) organiserId = null
    if (!organiserId && website) {
      const host = new URL(website).hostname.replace(/^www\./, '').toLowerCase()
      const bySite = await db.from('organisers').select('id').eq('website_key', host).maybeSingle()
      if (!bySite.error) organiserId = (bySite.data?.id as string | undefined) ?? null
      if (organiserId && platform.has(organiserId)) organiserId = null
    }
    if (!organiserId) {
      const { data: made, error: mErr } = await db
        .from('organisers')
        .insert({
          name: name.slice(0, 200),
          website_url: website,
          found_on: website,
          notes: `${ENGINE_ORGANISER_NOTE} on ${now.toISOString().slice(0, 10)}: the host of its listed nights at ${name.slice(0, 120)}.`,
          created_by: by.id,
        })
        .select('id')
        .single()
      if (mErr || !made) {
        out.failed.push(`${name}: could not enter the CRM: ${mErr?.message ?? 'no row'}`)
        continue
      }
      organiserId = made.id as string
      out.entered += 1
    }
    const { error: lErr } = await db.from('organiser_venues').insert({ venue_id: venueId, organiser_id: organiserId, linked_by: by.id })
    if (lErr) {
      out.failed.push(`${name}: could not be linked: ${lErr.message}`)
      continue
    }
    out.attached += 1
  }
  return out
}
