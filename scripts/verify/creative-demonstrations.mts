/**
 * DEMONSTRATIONS A, B AND C (Lawal's final directive of 28 October 2026, section 27), drawn by the real renderer through
 * the same slide path the weekly planner uses, at the three native formats, each with its phone preview at the width a
 * phone shows it (390 px), its source data, rights class, call to action and destination checks, the automated visual
 * QA, its workflow status and its exceptions.
 *
 *   node --env-file=<a TEST env file> node_modules/tsx/dist/cli.mjs scripts/verify/creative-demonstrations.mts <out dir>
 *   scripts\ops\with-supabase-token.ps1 node node_modules/tsx/dist/cli.mjs scripts/verify/creative-demonstrations.mts <out dir> --production
 *     (PRODUCTION, read only: SUPABASE_ACCESS_TOKEN from the wrapper, every read a read_only query; no photograph without an APPROVED row)
 *
 * A  AMCF 2026: the organiser's own photographs. The night is read from TEST (or production). Its image is the register's row when
 *    20261028205501 and the AMCF rows are on TEST; until then the same file from C:\dev\design\amcf-21oct\photos,
 *    served on this machine, with the manifest's focal point, and the report says so.
 * B  Kate Ceberano at Costa Hall: no authorised artist photograph exists, so editorial type; from window 4's research
 *    row (design\listings, 27 October), as the night has no listing yet, which the report names as the exception.
 * C  The weekend brand piece: no licensed photograph is recorded, so EventLinqs' own art; to /events.
 * Reads only; writes the images and the report to <out dir>.
 */
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import type * as SlidesModule from '@/lib/broadcast/campaign-slides'
import type * as LayoutModule from '@/lib/broadcast/treatment-layout'
import type * as TreatmentsModule from '@/lib/broadcast/treatments'
import type * as CampaignModule from '@/lib/social/campaign'
import type * as CtaModule from '@/lib/events/cta'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) =>
  request === 'server-only' || request === 'client-only' ? EMPTY : resolveFilename(request, ...rest)

const pick = <T,>(mod: T & { default?: T }) => (mod.default ?? mod) as T
const slides = pick((await import('@/lib/broadcast/campaign-slides')) as typeof SlidesModule & { default?: typeof SlidesModule })
const layout = pick((await import('@/lib/broadcast/treatment-layout')) as typeof LayoutModule & { default?: typeof LayoutModule })
const treatments = pick((await import('@/lib/broadcast/treatments')) as typeof TreatmentsModule & { default?: typeof TreatmentsModule })
const campaign = pick((await import('@/lib/social/campaign')) as typeof CampaignModule & { default?: typeof CampaignModule })
const { ctaFor, ctaPriceLine } = pick((await import('@/lib/events/cta')) as typeof CtaModule & { default?: typeof CtaModule })

const out = process.argv[2] ?? 'creative-demonstrations'
mkdirSync(out, { recursive: true })
const SITE = 'https://www.eventlinqs.com.au'
const PHOTOS = 'C:/dev/design/amcf-21oct/photos'
const manifest = JSON.parse(readFileSync(new URL('../ops/amcf-media-rights.manifest.json', import.meta.url), 'utf8')) as {
  eventSlug: string
  attribution: string
  photos: { file: string; focal: [number, number] }[]
}

/*
 * --production: the same reads on PRODUCTION, each inside a read-only transaction the database itself enforces (the
 * management API, each read opened as begin read only, run through scripts\ops\with-supabase-token.ps1); no service key, nothing written.
 * Without it, TEST through a TEST env file, as before.
 */
const PRODUCTION = process.argv.includes('--production')
const WHERE = PRODUCTION ? 'production' : 'TEST'
const PRODUCTION_REF = 'gndnldyfudbytbboxesk'
type EventRow = { id: string; slug: string; title: string; start_date: string; end_date: string; timezone: string | null; venue_name: string; venue_city: string; is_free: boolean; entry_mode: string; status: string; category_slug: string | null; summary: string | null; external_ticket_url: string | null }
type UsableRow = { asset_url: string; attribution_text: string; focal_x: number | null; focal_y: number | null; source_width: number | null; source_height: number | null }
type Reader = { event: (slug: string) => Promise<EventRow | null>; eventLike: (title: string) => Promise<EventRow | null>; usable: (id: string) => Promise<UsableRow[]>; brand: () => Promise<{ asset_url: string; attribution_text: string }[]> }
const EVENT_COLUMNS = 'e.id, e.slug, e.title, e.start_date, e.end_date, e.timezone, e.venue_name, e.venue_city, e.is_free, e.entry_mode, e.status, e.summary, e.external_ticket_url, c.slug as category_slug'
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`
let reader: Reader
if (PRODUCTION) {
  const token = process.env.SUPABASE_ACCESS_TOKEN
  if (!token) throw new Error('--production runs through scripts\\ops\\with-supabase-token.ps1')
  const read = async <T,>(sql: string): Promise<T[]> => {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PRODUCTION_REF}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      /*
       * A READ-ONLY TRANSACTION the database enforces: the API's read-only role may not execute the register's functions
       * (production, 29 October: 'permission denied for function social_brand_images'), so each read opens
       * 'begin read only'; drilled the same day, an update inside it answered '25006: cannot execute UPDATE in a
       * read-only transaction'.
       */
      body: JSON.stringify({ query: `begin read only; ${sql}`, read_only: false }),
    })
    if (!res.ok) throw new Error(`production read refused (${res.status}): ${(await res.text()).slice(0, 200)}`)
    return (await res.json()) as T[]
  }
  const one = (where: string) => read<EventRow>(`select ${EVENT_COLUMNS} from public.events e left join public.event_categories c on c.id = e.category_id where ${where} order by e.start_date limit 1`).then((r) => r[0] ?? null)
  reader = {
    event: (slug) => one(`e.slug = ${lit(slug)}`),
    eventLike: (title) => one(`e.title ilike ${lit(`${title}%`)} and e.status = 'published'`),
    usable: (id) => read<UsableRow>(`select * from public.social_usable_images(array[${lit(id)}]::uuid[], now())`),
    brand: () => read<{ asset_url: string; attribution_text: string }>('select * from public.social_brand_images(now())'),
  }
} else {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  if (!url.includes('vkapkibzokmfaxqogypq')) throw new Error('reads TEST only: pass a TEST env file (or --production)')
  const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })
  const select = 'id, slug, title, start_date, end_date, timezone, venue_name, venue_city, is_free, entry_mode, status, summary, external_ticket_url, category:event_categories(slug)'
  const flat = (ev: Record<string, unknown> | null): EventRow | null => (ev ? ({ ...ev, category_slug: (ev.category as { slug: string } | null)?.slug ?? null } as unknown as EventRow) : null)
  reader = {
    event: async (slug) => flat((await db.from('events').select(select).eq('slug', slug).maybeSingle()).data as Record<string, unknown> | null),
    eventLike: async (title) => flat((await db.from('events').select(select).ilike('title', `${title}%`).eq('status', 'published').order('start_date').limit(1).maybeSingle()).data as Record<string, unknown> | null),
    usable: async (id) => {
      const { data, error } = await db.rpc('social_usable_images', { p_events: [id], p_at: new Date().toISOString() })
      if (error) throw new Error(`social_usable_images: ${error.code} ${error.message}`)
      return (data ?? []) as UsableRow[]
    },
    brand: async () => ((await db.rpc('social_brand_images', { p_at: new Date().toISOString() })).data ?? []) as { asset_url: string; attribution_text: string }[],
  }
}

const server = createServer((req, res) => {
  try {
    res.end(readFileSync(join(PHOTOS, decodeURIComponent((req.url ?? '/').slice(1)))))
  } catch {
    res.statusCode = 404
    res.end()
  }
}).listen(47124)

async function page(path: string, expect: string[]): Promise<{ url: string; status: number | null; found: Record<string, boolean> }> {
  const target = `${SITE}${path}`
  try {
    /* A page view is never counted for a check: a crawler by name, and never /out, /e, /s or /go (only /events pages here). */
    const r = await fetch(target, { redirect: 'follow', headers: { 'user-agent': 'EventLinqs-QA-crawler (creative-demonstrations)' } })
    const body = await r.text()
    return { url: target, status: r.status, found: Object.fromEntries(expect.map((e) => [e, body.includes(e)])) }
  } catch {
    return { url: target, status: null, found: Object.fromEntries(expect.map((e) => [e, false])) }
  }
}

type Demo = {
  key: string
  name: string
  treatmentExpected: 'photo' | 'type' | 'graphic'
  slide: CampaignModule.Slide
  image: SlidesModule.SlideImage | null
  source: Record<string, unknown>
  rights: string
  cta: string
  destination: { url: string; status: number | null; found: Record<string, boolean> }
  workflow: string
  exceptions: string[]
}

const m = await treatments.treatmentMeasurers()
const demos: Demo[] = []

/* A: AMCF 2026, the organiser's own photographs. */
{
  const ev = await reader.event(manifest.eventSlug)
  if (!ev) throw new Error(`AMCF could not be read on ${WHERE}`)
  const cta = ctaFor({ entryMode: ev.entry_mode as string, isFree: ev.is_free as boolean })
  const night: CampaignModule.CampaignNight = {
    eventId: ev.id as string,
    slug: ev.slug as string,
    title: ev.title as string,
    startDate: ev.start_date as string,
    endDate: ev.end_date as string,
    timezone: (ev.timezone as string | null) ?? null,
    citySlug: 'melbourne',
    cityName: ev.venue_city as string,
    venueName: ev.venue_name as string,
    host: null,
    categorySlug: ev.category_slug,
    summary: null,
    approvedPhotoUrl: null,
    photoCredit: null,
    cta,
    priceLine: ctaPriceLine(cta),
  }
  const exceptions: string[] = []
  const usable = await reader.usable(night.eventId).catch((e: Error) => { exceptions.push(e.message); return [] as UsableRow[] })
  let image: SlidesModule.SlideImage | null
  let credit: string | null = manifest.attribution
  if (usable[0]) {
    const u = usable[0]
    image = { url: u.asset_url, focal: u.focal_x === null ? null : { x: Number(u.focal_x), y: Number(u.focal_y) }, width: u.source_width, height: u.source_height }
    credit = u.attribution_text
  } else if (PRODUCTION) {
    /* J1: a photograph with no APPROVED register row is never drawn on production; the night is told in type until Lawal approves. */
    image = null
    credit = null
    exceptions.push('HELD FOR LAWAL: no AMCF photograph is approved on production yet (social_usable_images returns none: the five rows are pending, or not yet entered by window 4), so the night is drawn in editorial type; it is drawn photo-led from the register the moment he presses Approve in /admin/social.')
  } else {
    const hero = manifest.photos[0]
    const meta = await sharp(readFileSync(join(PHOTOS, hero.file))).metadata()
    image = { url: `http://localhost:47124/${hero.file}`, focal: { x: hero.focal[0], y: hero.focal[1] }, width: meta.width ?? null, height: meta.height ?? null }
    exceptions.push(`The register rows are not on TEST yet (no usable row): drawn from the same file, ${hero.file}, served on this machine with the manifest's focal point.`)
  }
  const slide: CampaignModule.Slide = {
    t: 'night',
    composition: campaign.compositionFor(night),
    eventId: night.eventId,
    chip: cta.chip,
    when: campaign.whenOf(night),
    day: campaign.dayOf(night),
    title: night.title,
    meta: `${night.venueName}, ${night.cityName}`,
    why: null,
    photo: image?.url ?? null,
    credit,
    words: campaign.nightWords(night),
  }
  const dest = await page(`/events/${night.slug}`, [night.title, night.venueName as string, 'Free'])
  if (dest.status !== 200) exceptions.push(`Its page ${dest.url} answers ${dest.status ?? 'nothing'} on production, so the piece is not approvable yet (J15).`)
  demos.push({
    key: 'a-amcf',
    name: 'A. AMCF 2026, the organiser\u2019s own photographs',
    treatmentExpected: image ? 'photo' : 'type',
    slide,
    image,
    source: { table: `events (${WHERE})`, id: night.eventId, slug: night.slug, title: night.title, start: night.startDate, end: night.endDate, venue: night.venueName, city: night.cityName, entry_mode: ev.entry_mode, is_free: ev.is_free, status: ev.status },
    rights: `Organiser authorised (rights holder AMCF; evidence the Outlook thread of 2, 23 and 26 October 2026; uses: listing and social promotion of AMCF 2026 only; credit "${credit ?? 'none drawn: no photograph'}", archival, a past festival)`,
    cta: `${cta.state}: "${cta.action}", entry line "${slide.words?.entry}"; the image shows the domain as a label, never a button`,
    destination: dest,
    workflow: 'Drafted by the renderer; approval is Lawal\u2019s in /admin/social once the rows are on the register; not posted',
    exceptions,
  })
}

/* B: Kate Ceberano, editorial type. Drawn from its listing where one exists (J15: the slide says what the page says); else from window 4's research row, held. */
{
  /* Whether a listing has arrived (window 4's ticketed import): then its own facts are the slide's, and its page the check. */
  const listed = await reader.eventLike('Kate Ceberano')
  const bookAt = listed?.external_ticket_url ?? 'https://geelongartscentre.org.au/whats-on/all-events/kate-ceberano/'
  const cta = ctaFor({ externalTicketUrl: bookAt, providerName: /geelongartscentre\.org\.au/.test(bookAt) ? 'Geelong Arts Centre' : null })
  const research = {
    title: 'Kate Ceberano: Australian Made Tour 2026',
    startDate: '2026-10-31T08:00:00Z',
    endDate: '2026-10-31T10:30:00Z',
    venueName: 'Costa Hall',
    cityName: 'Geelong',
    summary: 'Kate Ceberano sings her own hits and reworked Australian classics at Costa Hall, with guests Kathleen Halloran and Dusty Lee.',
  }
  const night: CampaignModule.CampaignNight = {
    eventId: listed?.id ?? '00000000-0000-4000-8000-00000000ce0b',
    slug: listed?.slug ?? 'kate-ceberano-australian-made-tour-2026-geelong',
    title: listed?.title ?? research.title,
    startDate: listed?.start_date ?? research.startDate,
    endDate: listed?.end_date ?? research.endDate,
    timezone: listed?.timezone ?? 'Australia/Melbourne',
    citySlug: 'geelong',
    cityName: listed?.venue_city ?? research.cityName,
    venueName: listed?.venue_name ?? research.venueName,
    host: 'Geelong Arts Centre',
    categorySlug: listed?.category_slug ?? 'music',
    summary: listed ? listed.summary : research.summary,
    approvedPhotoUrl: null,
    photoCredit: null,
    cta,
    priceLine: ctaPriceLine(cta),
  }
  const slide: CampaignModule.Slide = {
    t: 'night',
    composition: campaign.compositionFor(night),
    eventId: night.eventId,
    chip: cta.chip,
    when: campaign.whenOf(night),
    day: campaign.dayOf(night),
    title: night.title,
    meta: `${night.venueName}, ${night.cityName}`,
    why: night.summary,
    photo: null,
    credit: null,
    words: campaign.nightWords(night),
  }
  const exceptions = ['No authorised artist photograph or official tour artwork is recorded, so the treatment is editorial type, as the directive asks.']
  let destination: Demo['destination']
  let workflow: string
  if (listed) {
    destination = await page(`/events/${listed.slug}`, [listed.title, listed.venue_name])
    const agree = destination.status === 200 && Object.values(destination.found).every(Boolean)
    workflow = agree ? 'Rendered from its listing; its page answers and carries its title and venue, so approvable by Lawal (J15)' : 'Rendered from its listing; held until its page answers with its title and venue (J15)'
    exceptions.push(`Drawn from its listing on ${WHERE}, /events/${listed.slug} (${listed.status}): title, start, end, venue, city and description as the listing holds them.`)
  } else {
    const provider = await fetch(bookAt, { redirect: 'follow' })
      .then(async (r) => ({ status: r.status, body: await r.text() }))
      .catch(() => ({ status: null as number | null, body: '' }))
    destination = { url: `${bookAt} (the provider; no EventLinqs page yet)`, status: provider.status, found: { 'Kate Ceberano': provider.body.includes('Kate Ceberano'), 'Costa Hall': provider.body.includes('Costa Hall') } }
    workflow = 'Rendered; held: no listing'
    exceptions.push(`No EventLinqs listing exists for this night on ${WHERE}, so the post has no landing page and is NOT approvable: it waits for window 4\u2019s ticketed import.`)
    exceptions.push('Facts from window 4\u2019s research of 27 October (design\listings): Sat 31 October 2026, 7pm to 9.30pm, Costa Hall at Geelong Arts Centre; to be re-read against the listing when it exists.')
  }
  demos.push({
    key: 'b-ceberano',
    name: 'B. Kate Ceberano, editorial type',
    treatmentExpected: 'type',
    slide,
    image: null,
    source: listed
      ? { table: `events (${WHERE})`, id: listed.id, slug: listed.slug, title: listed.title, start: listed.start_date, end: listed.end_date, venue: listed.venue_name, city: listed.venue_city, status: listed.status, booking: bookAt }
      : { table: 'none yet: design\listings\import-2026-10-27-wi3-ticketed-43.csv (window 4 research, 27 October)', title: research.title, start: '2026-10-31 19:00 Melbourne', end: '21:30', venue: 'Costa Hall, Geelong Arts Centre' },
    rights: 'Original EventLinqs design (no image of anyone else\u2019s used)',
    cta: `${cta.state}: "${cta.action}"; no price said (none checked on our side); the provider named, never EventLinqs ticketing`,
    destination,
    workflow,
    exceptions,
  })
}

/* C: the weekend brand piece, EventLinqs' own art (no licensed photograph is recorded). */
{
  const brand = await reader.brand()
  const photo = (brand?.[0] as { asset_url: string; attribution_text: string } | undefined) ?? null
  const slide: CampaignModule.Slide = {
    t: 'brand',
    composition: 'close',
    headline: 'Say yes to this weekend.',
    line: 'Gigs, festivals, markets and free nights across Melbourne, Geelong, Ballarat and Bendigo, in one place.',
    action: "See what's on",
    photo: photo?.asset_url ?? null,
    credit: photo?.attribution_text ?? null,
  }
  const dest = await page('/events', ['events'])
  demos.push({
    key: 'c-brand',
    name: 'C. The weekend brand piece',
    treatmentExpected: photo ? 'photo' : 'graphic',
    slide,
    image: photo ? { url: photo.asset_url, focal: null, width: null, height: null } : null,
    source: { piece: 'brand_campaign, planned weekly when the week has nights', link: `${SITE}/events` },
    rights: photo ? 'Separately licensed for EventLinqs\u2019 own promotion, naming no night' : 'Original EventLinqs design: no licensed photograph is recorded (the reference\u2019s crowd photograph has no licence on file)',
    cta: '"See what\u2019s on", to /events, every night in one place; the image shows the domain as a label',
    destination: dest,
    workflow: 'Planned by the planner every week with nights; approval is Lawal\u2019s',
    exceptions: photo ? [] : ['The approved reference used a crowd photograph (CREATIVE-APPROVED-28OCT\\ref\\crowd_hi.png) with no licence on file, so it is not used; the piece is EventLinqs\u2019 own art until a licence is recorded in the register (separately licensed, naming no night).'],
  })
}

const report: unknown[] = []
for (const d of demos) {
  const files: Record<string, unknown>[] = []
  for (const f of ['feed', 'square', 'story'] as const) {
    const l = slides.layoutOfSlide(f, d.slide, d.image, m)!
    const faults = layout.layoutFaults(l, m)
    const k = d.image ? slides.enlargement(l, d.image) : null
    if (k !== null && k > slides.MAX_ENLARGEMENT) faults.push(`the photograph is enlarged ${k.toFixed(2)} times; ask its owner for the original file`)
    const bytes = await slides.renderCampaignSlide(f, d.slide, 1, 1, null, d.image)
    const shape = f === 'feed' ? 'portrait' : f
    const full = `${d.key}-${shape}.jpg`
    writeFileSync(join(out, full), bytes)
    const phone = `${d.key}-${shape}-phone-390.png`
    await sharp(Buffer.from(bytes)).resize({ width: 390 }).png().toFile(join(out, phone))
    const meta = await sharp(Buffer.from(bytes)).metadata()
    files.push({ format: shape, file: full, size: `${meta.width} x ${meta.height}`, phone, treatment: l.treatment, treatmentAsExpected: l.treatment === d.treatmentExpected, qa: faults.length === 0 ? 'PASS' : faults, enlargement: k === null ? null : Number(k.toFixed(2)) })
  }
  report.push({ demonstration: d.name, files, source: d.source, rights: d.rights, cta: d.cta, destination: d.destination, workflow: d.workflow, exceptions: d.exceptions })
}
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
server.close()
