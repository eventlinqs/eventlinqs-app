/**
 * THE VISITOR SENTINEL'S RUN (the controller's 16:43 of 1 November 2026). Reads the LIVE home page and every guide
 * city's page as a visitor would, as a named crawler, read only; reads the database's facts about every night those
 * pages link; judges each page (./visitor-sentinel.ts); and follows every internal link once. A page that does not
 * answer, or a read that fails, is itself a failure: the sentinel never reports a clean run it could not make.
 * The counted routes (/out, /e, /s, /go) are never fetched, so the sentinel never adds a visit or a click.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { HealthResult } from './result'
import { judgeVisitorPage, linksOnPage, type PageEventFacts } from './visitor-sentinel'
import { DEAD_TWICE_DAYS, deadNotYetHeld, everyLinkDead, holdRow, holdsToMake, holdsToRelease, hostOf, hostsDeadTwice, SENTINEL_HOLD_MARK, sourceStopReason, sourcesToStop, type NightLinks } from './dead-link-hold'

/** Every booking link the database holds, read in one pass; more is reported, never silently cut. */
const MOST_LINKS = 5000

/**
 * THE AUTOMATIC HOLD (./dead-link-hold.ts), run on the sentinel's own schedule: every published upcoming night's booking
 * links and the sentinel's own open holds, read at once; a public night whose every link was dead on the previous run is
 * held (private, one listing_holds night hold), a night it held with a link answering again is released (public again),
 * and both are named in the run's results, so its CRITICAL email says what was held and why. write false (the cron's
 * ?dry=1) judges and writes nothing. A failed read or write is itself a failure, never a clean run.
 */
export async function holdDeadNights(
  db: SupabaseClient,
  now: Date,
  write: boolean,
  deps: { reread?: (hosts: ReadonlySet<string>) => Promise<unknown> } = {},
): Promise<HealthResult[]> {
  type Night = NightLinks & { links: { url: string; availability: string | null; updatedAt: string }[] }
  const readNights = async (): Promise<Map<string, Night> | string> => {
    const { data: rows, error } = await db
      .from('event_booking_links')
      .select('url, availability, updated_at, events!inner(id, slug, listing_series_id, visibility, status, end_date)')
      .eq('events.status', 'published')
      .gte('events.end_date', now.toISOString())
      .limit(MOST_LINKS)
    if (error) return error.message
    type Row = { url: string; availability: string | null; updated_at: string; events: { id: string; slug: string; listing_series_id: string | null; visibility: string } | { id: string; slug: string; listing_series_id: string | null; visibility: string }[] }
    const out = new Map<string, Night>()
    for (const r of (rows ?? []) as Row[]) {
      const e = Array.isArray(r.events) ? r.events[0] : r.events
      if (!e) continue
      const n = out.get(e.id) ?? { id: e.id, slug: e.slug, seriesId: e.listing_series_id, visibility: e.visibility, links: [] }
      n.links.push({ url: r.url, availability: r.availability, updatedAt: r.updated_at })
      out.set(e.id, n)
    }
    return out
  }
  let nights = await readNights()
  if (typeof nights === 'string') return [fail('visitor-dead-booking-everywhere', 'Every upcoming night\'s booking links', `could not be read: ${nights}`, 'Check the database answers; no night could be judged or held.')]
  const { data: holdRows, error: holdError } = await db.from('listing_holds').select('id, event_id, readings').is('released_at', null).eq('scope', 'night').limit(2000)
  if (holdError) return [fail('visitor-held-dead-booking', 'The sentinel\'s holds', `could not be read: ${holdError.message}`, 'Check the database answers; no night was held or released.')]
  const openHeld = new Set((holdRows ?? []).map((h) => h.event_id as string))
  const mine = (holdRows ?? []).filter((h) => Array.isArray(h.readings) && (h.readings as { by?: string }[]).some((x) => x.by === SENTINEL_HOLD_MARK)).map((h) => ({ id: h.id as string, eventId: h.event_id as string }))
  // ONE DEAD NIGHT, ITS WHOLE SOURCE RE-READ AT ONCE (the PM's 12:25 item 1 of 16 November 2026): every upcoming night's
  // link on the host of a night found dead is read again now through the polite link check, then every night is judged
  // on what it reads, so a sibling night gone the same way is held this run, not a day later.
  let reread: string[] = []
  if (write && deps.reread) {
    const dead = [...nights.values()].filter((n) => n.visibility === 'public' && !openHeld.has(n.id) && everyLinkDead(n))
    const hosts = new Set(
      dead.flatMap((n) =>
        n.links.flatMap((l) => {
          try {
            return [new URL(l.url).host]
          } catch {
            return []
          }
        }),
      ),
    )
    if (hosts.size > 0) {
      reread = [...hosts]
      await deps.reread(hosts)
      const again = await readNights()
      if (typeof again === 'string') return [fail('visitor-dead-booking-everywhere', 'Every upcoming night\'s booking links', `could not be read again after the re-read: ${again}`, 'Check the database answers; no night was held.')]
      nights = again
    }
  }
  const known = nights
  const all = [...known.values()]
  const toHold = holdsToMake(all, openHeld, now)
  const toRelease = holdsToRelease(mine, all)
  const named = deadNotYetHeld(all, openHeld, now)
  const failures: string[] = []
  if (write) {
    for (const n of toHold) {
      const { error: ie } = await db.from('listing_holds').insert(holdRow(n, now))
      const { error: ue } = ie ? { error: null } : await db.from('events').update({ visibility: 'private' }).eq('id', n.id).eq('visibility', 'public')
      if (ie || ue) failures.push(`${n.slug}: ${(ie ?? ue)?.message}`)
    }
    for (const h of toRelease) {
      const { error: re } = await db.from('listing_holds').update({ released_at: now.toISOString(), released_by: 'visitor-sentinel: a booking link answers again' }).eq('id', h.id).is('released_at', null)
      const others = (holdRows ?? []).filter((x) => x.event_id === h.eventId && x.id !== h.id).length
      const { error: ve } = re || others > 0 ? { error: null } : await db.from('events').update({ visibility: 'public' }).eq('id', h.eventId).eq('visibility', 'private')
      if (re || ve) failures.push(`release ${h.eventId}: ${(re ?? ve)?.message}`)
    }
  }
  // THE SOURCE THAT PUBLISHES DEAD LINKS IS SWITCHED OFF (the PM's 12:25 item 3; law 19 (d)): a host on which the sentinel
  // held two different nights within a week has its automatically read sources set back to 'ask', the stop and its reason
  // written (a person re-opens it), and the email says so. Only a source still read is stopped; nothing is deleted.
  const stoppedSources: string[] = []
  if (write) {
    const since = new Date(now.getTime() - DEAD_TWICE_DAYS * 24 * 3_600_000).toISOString()
    const { data: recent, error: re } = await db.from('listing_holds').select('event_id, readings, held_at').eq('scope', 'night').gte('held_at', since).limit(2000)
    if (re) failures.push(`the week's holds could not be read: ${re.message}`)
    else {
      const ours = (recent ?? [])
        .filter((h) => Array.isArray(h.readings) && (h.readings as { by?: string }[]).some((x) => x.by === SENTINEL_HOLD_MARK))
        .map((h) => ({ eventId: h.event_id as string, heldAt: h.held_at as string, urls: (h.readings as { url?: string }[]).map((x) => x.url ?? '').filter(Boolean) }))
      const dead = hostsDeadTwice(ours, now)
      if (dead.size > 0) {
        const { data: sources, error: se } = await db.from('listing_sources').select('id, name, page_url, collection').eq('collection', 'read').limit(1000)
        if (se) failures.push(`the sources could not be read: ${se.message}`)
        for (const s of sourcesToStop(dead, (sources ?? []) as { id: string; name: string; page_url: string; collection: string }[])) {
          const nightsOn = dead.get(hostOf(s.page_url) ?? '') ?? []
          const because = sourceStopReason(nightsOn.length)
          const { error: ue } = await db.from('listing_sources').update({ collection: 'ask', stopped_at: now.toISOString(), stopped_because: because, updated_at: now.toISOString() }).eq('id', s.id).eq('collection', 'read')
          if (ue) failures.push(`${s.name} could not be stopped: ${ue.message}`)
          else stoppedSources.push(s.name)
        }
      }
    }
  }
  const slugOf = (id: string) => known.get(id)?.slug ?? id
  const list = (xs: string[]) => `${xs.length}: ${xs.slice(0, 12).join(', ')}${xs.length > 12 ? ' and more' : ''}`
  return [
    {
      id: 'visitor-dead-booking-everywhere',
      label: 'Nights with every booking link dead (every published upcoming night)',
      severity: 'critical',
      ok: named.length === 0,
      detail: named.length === 0 ? `none among ${all.length} nights with a booking link` : list(named.map((n) => n.slug)),
      probableCause: named.length === 0 ? undefined : 'the daily link check read every booking link of these nights as gone (404 or 410)',
      action: named.length === 0 ? undefined : 'Held by the sentinel on its next run if still dead; give the night its new booking link first if the seller moved it.',
    },
    {
      id: 'visitor-held-dead-booking',
      label: write ? 'Nights held this run: every booking link dead on two runs' : 'Nights the sentinel would hold (a dry run, nothing written)',
      severity: 'critical',
      ok: toHold.length === 0 && failures.length === 0,
      detail:
        toHold.length === 0 && failures.length === 0
          ? `none held${toRelease.length > 0 ? `; released, a link answers again: ${toRelease.map((h) => slugOf(h.eventId)).join(', ')}` : ''}`
          : `${toHold.length > 0 ? `held, private until a link answers: ${list(toHold.map((n) => n.slug))}` : ''}${failures.length > 0 ? `${toHold.length > 0 ? '; ' : ''}not written: ${failures.join('; ')}` : ''}${toRelease.length > 0 ? `; released: ${toRelease.map((h) => slugOf(h.eventId)).join(', ')}` : ''}`,
      probableCause: toHold.length === 0 ? undefined : 'every booking link of each was gone (404 or 410) on this run and the one before',
      action: toHold.length === 0 ? undefined : 'Nothing to do unless the seller moved the night: then give it its new link and the next run releases it.',
    },
    {
      id: 'visitor-source-stopped-dead-links',
      label: 'Sources switched off: dead booking links on two nights within a week',
      severity: 'critical',
      ok: stoppedSources.length === 0,
      detail:
        stoppedSources.length === 0
          ? `none${reread.length > 0 ? `; re-read at once, every upcoming night on ${reread.join(', ')}` : ''}`
          : `stopped, publishing nothing new until a person re-opens it: ${stoppedSources.join(', ')}${reread.length > 0 ? `; re-read at once, every upcoming night on ${reread.join(', ')}` : ''}`,
      probableCause: stoppedSources.length === 0 ? undefined : 'the source keeps listing nights whose booking pages are gone',
      action: stoppedSources.length === 0 ? undefined : 'Read the source on /admin/collected; re-open it once its pages answer.',
    },
  ]
}

export const VISITOR_SENTINEL_AGENT = 'EventLinqs-visitor-sentinel/1.0 (crawler; read only)'
/** Enough for every link on the home page and four guide cities, with room; more is reported, never silently cut. */
const MAX_INTERNAL_LINKS = 600

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

const fail = (id: string, label: string, detail: string, action: string): HealthResult => ({
  id, label, severity: 'critical', ok: false, detail, action,
})

/**
 * How each venue stands to the page's city, by public.venue_city_relation (20261101160001), ten at a time. An empty map
 * where the database does not have that function yet (PostgREST PGRST202), so the label judges until it lands; any
 * other failure is thrown and reported, never read as clean.
 */
async function relationsFor(db: SupabaseClient, citySlug: string, venueIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (let i = 0; i < venueIds.length; i += 10) {
    const answers = await Promise.all(
      venueIds.slice(i, i + 10).map(async (id) => ({ id, ...(await db.rpc('venue_city_relation', { p_city: citySlug, p_venue: id })) })),
    )
    for (const a of answers) {
      if (a.error?.code === 'PGRST202') return new Map()
      if (a.error) throw new Error(`a venue's placement could not be read: ${a.error.message}`)
      if (typeof a.data === 'string') out.set(a.id, a.data)
    }
  }
  return out
}

async function factsFor(db: SupabaseClient, slugs: string[], citySlug: string | null): Promise<PageEventFacts[]> {
  const out: PageEventFacts[] = []
  for (let i = 0; i < slugs.length; i += 100) {
    const chunk = slugs.slice(i, i + 100)
    const { data: events, error } = await db
      .from('events')
      .select('id, slug, venue_id, city_primary, start_date, end_date, timezone, status')
      .in('slug', chunk)
      .limit(chunk.length)
    if (error) throw new Error(`the nights could not be read: ${error.message}`)
    const ids = (events ?? []).map((e) => e.id as string)
    const { data: links, error: linkError } = ids.length
      ? await db.from('event_booking_links').select('event_id, availability').in('event_id', ids).limit(ids.length * 20)
      : { data: [], error: null }
    if (linkError) throw new Error(`the booking links could not be read: ${linkError.message}`)
    const venueIds = [...new Set((events ?? []).map((e) => e.venue_id as string | null).filter((v): v is string => !!v))]
    const relation = citySlug ? await relationsFor(db, citySlug, venueIds) : new Map<string, string>()
    for (const e of events ?? []) {
      const own = (links ?? []).filter((l) => l.event_id === e.id)
      out.push({
        slug: e.slug as string,
        citySlug: (e.city_primary as string | null) ?? null,
        startDate: e.start_date as string,
        endDate: (e.end_date as string | null) ?? null,
        timezone: (e.timezone as string | null) ?? null,
        status: e.status as string,
        deadBookingLinks: own.filter((l) => l.availability === 'dead').length,
        liveBookingLinks: own.filter((l) => l.availability !== 'dead').length,
        cityRelation: e.venue_id ? (relation.get(e.venue_id as string) ?? null) : null,
      })
    }
  }
  return out
}

export async function runVisitorSentinel(opts: { db: SupabaseClient; base: string; fetcher?: Fetcher; now?: Date; write?: boolean; reread?: (hosts: ReadonlySet<string>) => Promise<unknown> }): Promise<HealthResult[]> {
  const { db, base } = opts
  const fetcher: Fetcher = opts.fetcher ?? ((url, init) => fetch(url, init))
  const now = opts.now ?? new Date()
  const headers = { 'user-agent': VISITOR_SENTINEL_AGENT }
  const results: HealthResult[] = []

  const { data: cities, error } = await db.from('cities').select('slug').eq('free_guide', true).eq('is_active', true).limit(50)
  if (error) return [fail('visitor-cities', 'Guide cities', `could not be read: ${error.message}`, 'Check the database answers; nothing else could be judged.')]
  const pages = [{ path: '/', citySlug: null as string | null }, ...(cities ?? []).map((c) => ({ path: `/city/${c.slug as string}`, citySlug: c.slug as string }))]

  const internal = new Set<string>()
  for (const page of pages) {
    let html: string
    try {
      const res = await fetcher(`${base}${page.path}`, { headers })
      if (!res.ok) {
        results.push(fail(`visitor-page:${page.path}`, `Public page ${page.path}`, `answered ${res.status}`, 'A visitor cannot open this page; check the deployment and its logs.'))
        continue
      }
      html = await res.text()
    } catch (err) {
      results.push(fail(`visitor-page:${page.path}`, `Public page ${page.path}`, `did not answer: ${err instanceof Error ? err.message : String(err)}`, 'A visitor cannot open this page.'))
      continue
    }
    const links = linksOnPage(html)
    for (const l of links.internal) internal.add(l)
    try {
      const facts = await factsFor(db, links.events, page.citySlug)
      results.push(...judgeVisitorPage({ path: page.path, citySlug: page.citySlug, html, facts, now }))
    } catch (err) {
      results.push(fail(`visitor-facts:${page.path}`, `Facts behind ${page.path}`, err instanceof Error ? err.message : String(err), 'The page could not be judged; check the database answers.'))
    }
  }

  const toCheck = [...internal].slice(0, MAX_INTERNAL_LINKS)
  const dead: string[] = []
  for (let i = 0; i < toCheck.length; i += 6) {
    await Promise.all(
      toCheck.slice(i, i + 6).map(async (path) => {
        try {
          const res = await fetcher(`${base}${path}`, { headers, method: 'GET' })
          if (res.status >= 400) dead.push(`${path} (${res.status})`)
        } catch {
          dead.push(`${path} (no answer)`)
        }
      }),
    )
  }
  results.push({
    id: 'visitor-dead-internal',
    label: 'Internal links a visitor can follow',
    severity: 'critical',
    ok: dead.length === 0 && internal.size <= MAX_INTERNAL_LINKS,
    detail:
      dead.length === 0
        ? `${toCheck.length} followed, none dead${internal.size > MAX_INTERNAL_LINKS ? `; ${internal.size - MAX_INTERNAL_LINKS} not followed (over the cap)` : ''}`
        : `${dead.length} of ${toCheck.length} dead: ${dead.slice(0, 12).join(', ')}`,
    action: dead.length === 0 ? undefined : 'Each dead link is a page a visitor reaches as an error; fix the link or the page.',
  })
  results.push(...(await holdDeadNights(db, now, opts.write === true, { reread: opts.reread })))
  return results
}
