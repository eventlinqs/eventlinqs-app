import type { SupabaseClient } from '@supabase/supabase-js'
import { providerOf } from '@/lib/events/booking-links'
import { CAPTURE_RULE_CITIES, type CaptureCity } from './capture-rule'
import type { ScoutCandidate, ScoutRegistration, ScoutStore } from './scout-engine'

/**
 * THE NIGHTLY SCOUT'S DATABASE (./scout-engine.ts). Candidates are sites EventLinqs already holds: venues in the guide
 * cities and organisers in the CRM, each with its own website, whose host is no source yet. A ticketing platform's page
 * is never a candidate (the one table of platform names, src/lib/events/booking-links.ts providerOf; Eventbrite's pages
 * are never read), and nor is a social or link page, which is not the site's own.
 */

const NOT_ITS_OWN_SITE = /(^|\.)(facebook\.com|instagram\.com|linktr\.ee|x\.com|twitter\.com|tiktok\.com|youtube\.com|google\.com|bit\.ly)$/i

/** The host of an address, lower case and without www; '' when it is not one. Pure. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

/** A website the scout may try: https or http, its own site, not a platform's or a social page. Pure. */
export function scoutable(website: string): boolean {
  const host = hostOf(website)
  if (!host || !/^https?:\/\//i.test(website)) return false
  if (NOT_ITS_OWN_SITE.test(host)) return false
  return providerOf(website) === 'other'
}

export function scoutStore(db: SupabaseClient): ScoutStore {
  return {
    async candidates(): Promise<ScoutCandidate[]> {
      const { data: sources, error: sErr } = await db.from('listing_sources').select('page_url')
      if (sErr) throw new Error(`the register could not be read: ${sErr.message}`)
      const held = new Set((sources ?? []).map((s) => hostOf(s.page_url as string)).filter(Boolean))
      const { data: venues, error: vErr } = await db
        .from('venues')
        .select('id, name, website_url, city_slug, listing_source, claimed_at')
        .is('removed_at', null)
        .not('website_url', 'is', null)
        .in('city_slug', [...CAPTURE_RULE_CITIES])
      if (vErr) throw new Error(`venues could not be read: ${vErr.message}`)
      const { data: organisers, error: oErr } = await db.from('organisers').select('name, website_url').not('website_url', 'is', null)
      if (oErr) throw new Error(`the CRM could not be read: ${oErr.message}`)
      const out: ScoutCandidate[] = []
      const seen = new Set<string>()
      const add = (c: ScoutCandidate) => {
        const host = hostOf(c.website)
        if (!scoutable(c.website) || held.has(host) || seen.has(host)) return
        seen.add(host)
        out.push(c)
      }
      for (const v of venues ?? []) {
        /* A venue that lists its own nights, or has claimed itself, is never listed for. */
        if (v.listing_source === 'organiser' || v.claimed_at) continue
        add({ name: String(v.name), kind: 'venue', website: String(v.website_url).trim(), citySlug: v.city_slug as CaptureCity, venueId: v.id as string })
      }
      for (const o of organisers ?? []) add({ name: String(o.name), kind: 'organiser', website: String(o.website_url).trim(), citySlug: null, venueId: null })
      return out
    },

    async knownVenueNames(citySlug: string): Promise<readonly string[]> {
      const { data, error } = await db.from('venues').select('name, listing_source, claimed_at').eq('city_slug', citySlug).is('removed_at', null)
      if (error) throw new Error(`venues could not be read: ${error.message}`)
      return (data ?? []).filter((v) => v.listing_source !== 'organiser' && !v.claimed_at).map((v) => String(v.name ?? '').trim()).filter(Boolean)
    },

    async register(r: ScoutRegistration): Promise<boolean> {
      const { data: already, error: aErr } = await db.from('listing_sources').select('id').eq('page_url', r.pageUrl).limit(1)
      if (aErr) throw new Error(`the register could not be read: ${aErr.message}`)
      if ((already ?? []).length > 0) return false
      const notes =
        `Registered ${r.day} by the nightly scout (src/lib/listings/scout-engine.ts; Lawal's 10:42 of 13 November 2026): ` +
        `${r.adapter === 'ics' ? 'its calendar feed' : "its page's own schema.org Event data"}, robots allowing, its terms judged by the fixed words. ` +
        `${r.kind === 'venue' ? 'Venue' : 'Organiser'}: ${r.name}.`
      const { error } = await db.from('listing_sources').insert({
        name: r.name.slice(0, 200),
        /* listing_sources.kind allows venue, promoter, council, festival, tourism, ticketing: an organiser is a promoter. */
        kind: r.kind === 'venue' ? 'venue' : 'promoter',
        city_slug: r.citySlug,
        page_url: r.pageUrl,
        source_type: 'manual_research',
        collection: 'read',
        changes: 'weekly',
        refresh_interval_hours: 24,
        permits_facts: true,
        permits_descriptions: false,
        permits_images: false,
        permits_links: true,
        verification: 'verified',
        verified_on: r.day,
        may_scrape: 'yes',
        may_scrape_quote: r.robotsQuote,
        may_scrape_url: r.robotsUrl,
        may_scrape_read_on: r.day,
        terms_url: r.termsUrl,
        terms_quote: r.termsQuote.slice(0, 2000),
        terms_read_on: r.day,
        licence_owner: r.name.slice(0, 200),
        venue_id: r.venueId,
        notes,
      })
      if (error) throw new Error(`the source could not be registered: ${error.message}`)
      return true
    },
  }
}
