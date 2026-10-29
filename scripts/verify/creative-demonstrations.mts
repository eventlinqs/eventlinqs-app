/**
 * DEMONSTRATIONS A, B AND C (Lawal's final directive of 28 October 2026, section 27), drawn by the real renderer through
 * the same slide path the weekly planner uses, at the three native formats, each with its phone preview at the width a
 * phone shows it (390 px), its source data, rights class, call to action and destination checks, the automated visual
 * QA, its workflow status and its exceptions.
 *
 *   node --env-file=<a TEST env file> node_modules/tsx/dist/cli.mjs scripts/verify/creative-demonstrations.mts <out dir>
 *
 * A  AMCF 2026: the organiser's own photographs. The night is read from TEST. Its image is the register's row when
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
if (!url.includes('vkapkibzokmfaxqogypq')) throw new Error('reads TEST only: pass a TEST env file')
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', { auth: { persistSession: false } })

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
    const r = await fetch(target, { redirect: 'follow' })
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
  const { data: ev, error } = await db
    .from('events')
    .select('id, slug, title, start_date, end_date, timezone, venue_name, venue_city, is_free, entry_mode, status, category:event_categories(slug)')
    .eq('slug', manifest.eventSlug)
    .single()
  if (error || !ev) throw new Error(`AMCF could not be read on TEST: ${error?.message}`)
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
    categorySlug: (ev.category as unknown as { slug: string } | null)?.slug ?? null,
    summary: null,
    approvedPhotoUrl: null,
    photoCredit: null,
    cta,
    priceLine: ctaPriceLine(cta),
  }
  const exceptions: string[] = []
  const { data: usable, error: uerr } = await db.rpc('social_usable_images', { p_events: [night.eventId], p_at: new Date().toISOString() })
  let image: SlidesModule.SlideImage
  let credit = manifest.attribution
  if (!uerr && usable?.[0]) {
    const u = usable[0] as { asset_url: string; attribution_text: string; focal_x: number | null; focal_y: number | null; source_width: number | null; source_height: number | null }
    image = { url: u.asset_url, focal: u.focal_x === null ? null : { x: Number(u.focal_x), y: Number(u.focal_y) }, width: u.source_width, height: u.source_height }
    credit = u.attribution_text
  } else {
    const hero = manifest.photos[0]
    const meta = await sharp(readFileSync(join(PHOTOS, hero.file))).metadata()
    image = { url: `http://localhost:47124/${hero.file}`, focal: { x: hero.focal[0], y: hero.focal[1] }, width: meta.width ?? null, height: meta.height ?? null }
    exceptions.push(`The register rows are not on TEST yet (${uerr ? `social_usable_images: ${uerr.code}` : 'no usable row'}): drawn from the same file, ${hero.file}, served on this machine with the manifest's focal point. scripts/ops/amcf-media-rights.mjs --apply enters them once 20261028205501 is on TEST.`)
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
    photo: image.url,
    credit,
    words: campaign.nightWords(night),
  }
  const dest = await page(`/events/${night.slug}`, [night.title, night.venueName as string, 'Free'])
  if (dest.status !== 200) exceptions.push(`Its page ${dest.url} answers ${dest.status ?? 'nothing'} on production, so the piece is not approvable yet (J15).`)
  demos.push({
    key: 'a-amcf',
    name: 'A. AMCF 2026, the organiser\u2019s own photographs',
    treatmentExpected: 'photo',
    slide,
    image,
    source: { table: 'events (TEST)', id: night.eventId, slug: night.slug, title: night.title, start: night.startDate, end: night.endDate, venue: night.venueName, city: night.cityName, entry_mode: ev.entry_mode, is_free: ev.is_free, status: ev.status },
    rights: `Organiser authorised (rights holder AMCF; evidence the Outlook thread of 2, 23 and 26 October 2026; uses: listing and social promotion of AMCF 2026 only; credit "${credit}", archival, a past festival)`,
    cta: `${cta.state}: "${cta.action}", entry line "${slide.words?.entry}"; the image shows the domain as a label, never a button`,
    destination: dest,
    workflow: 'Drafted by the renderer; approval is Lawal\u2019s in /admin/social once the rows are on the register; not posted',
    exceptions,
  })
}

/* B: Kate Ceberano at Costa Hall, editorial type. From window 4's research row; no listing exists yet. */
{
  const cta = ctaFor({ externalTicketUrl: 'https://geelongartscentre.org.au/whats-on/all-events/kate-ceberano/', providerName: 'Geelong Arts Centre' })
  const night: CampaignModule.CampaignNight = {
    eventId: '00000000-0000-4000-8000-00000000ce0b',
    slug: 'kate-ceberano-australian-made-tour-2026-geelong',
    title: 'Kate Ceberano: Australian Made Tour 2026',
    startDate: '2026-10-31T08:00:00Z',
    endDate: '2026-10-31T10:30:00Z',
    timezone: 'Australia/Melbourne',
    citySlug: 'geelong',
    cityName: 'Geelong',
    venueName: 'Costa Hall',
    host: 'Geelong Arts Centre',
    categorySlug: 'music',
    summary: 'Kate Ceberano sings her own hits and reworked Australian classics at Costa Hall, with guests Kathleen Halloran and Dusty Lee.',
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
  const provider = await fetch('https://geelongartscentre.org.au/whats-on/all-events/kate-ceberano/', { redirect: 'follow' })
    .then(async (r) => ({ status: r.status, body: await r.text() }))
    .catch(() => ({ status: null as number | null, body: '' }))
  const exceptions = [
    'No EventLinqs listing exists for this night (window 6, 15:03), so the post has no landing page and is NOT approvable: it waits for window 4\u2019s 43-row ticketed import (design\\listings\\import-2026-10-27-wi3-ticketed-43.csv).',
    'No authorised artist photograph or official tour artwork is recorded, so the treatment is editorial type, as the directive asks.',
    'Facts from window 4\u2019s research of 27 October (design\\listings): Sat 31 October 2026, 7pm to 9.30pm, Costa Hall at Geelong Arts Centre, with Kathleen Halloran and Dusty Lee; to be re-read against the listing when it exists.',
  ]
  demos.push({
    key: 'b-ceberano',
    name: 'B. Kate Ceberano, editorial type',
    treatmentExpected: 'type',
    slide,
    image: null,
    source: { table: 'none yet: design\\listings\\import-2026-10-27-wi3-ticketed-43.csv (window 4 research, 27 October)', title: 'Kate Ceberano: Australian Made Tour 2026', start: '2026-10-31 19:00 Melbourne', end: '21:30', venue: 'Geelong Arts Centre (Costa Hall)', ticketing: 'https://geelongartscentre.org.au/whats-on/all-events/kate-ceberano/' },
    rights: 'Original EventLinqs design (no image of anyone else\u2019s used)',
    cta: `${cta.state}: "${cta.action}"; no price said (none checked on our side); the provider named, never EventLinqs ticketing`,
    destination: { url: 'https://geelongartscentre.org.au/whats-on/all-events/kate-ceberano/ (the provider; no EventLinqs page yet)', status: provider.status, found: { 'Kate Ceberano': provider.body.includes('Kate Ceberano'), 'Costa Hall': provider.body.includes('Costa Hall') } },
    workflow: 'Rendered; held: no listing',
    exceptions,
  })
}

/* C: the weekend brand piece, EventLinqs' own art (no licensed photograph is recorded). */
{
  const { data: brand } = await db.rpc('social_brand_images', { p_at: new Date().toISOString() })
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
