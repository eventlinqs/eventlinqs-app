/**
 * FAMILY F, THE DAILY POSTER, DRAWN (the directive's acceptance: C:\dev\START-16OCT\EVENTLINQS-DAILY-POSTER-
 * DIRECTIVE-30OCT.md). The four originals' facts at every format, photo-led and type-led, through the real renderer,
 * with 390 px phone previews and one sheet of the four portrait posters side by side at 390.
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/verify/daily-poster-demonstration.mts <out dir> [--photo <url> --credit <words>]
 *
 * Draws only; writes nothing anywhere but <out dir>. Without --photo every poster is type-led. The originals' own
 * photographs are the venues' Instagram posts, which EventLinqs holds no licence for (the directive's correction 1), so
 * a preview's photo-led variant is drawn with a photograph whose register row is approved on TEST, named by --photo.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import type * as PosterModule from '@/lib/broadcast/daily-poster'
import type * as TreatmentsModule from '@/lib/broadcast/treatments'
import type * as LayoutModule from '@/lib/broadcast/treatment-layout'
import type * as CtaModule from '@/lib/events/cta'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) =>
  request === 'server-only' || request === 'client-only' ? EMPTY : resolveFilename(request, ...rest)
const pick = <T,>(mod: T & { default?: T }) => (mod.default ?? mod) as T
const poster = pick((await import('@/lib/broadcast/daily-poster')) as typeof PosterModule & { default?: typeof PosterModule })
const treatments = pick((await import('@/lib/broadcast/treatments')) as typeof TreatmentsModule & { default?: typeof TreatmentsModule })
const layout = pick((await import('@/lib/broadcast/treatment-layout')) as typeof LayoutModule & { default?: typeof LayoutModule })
const ctaMod = pick((await import('@/lib/events/cta')) as typeof CtaModule & { default?: typeof CtaModule })

const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(name)
  return i > -1 ? args.splice(i, 2)[1] : null
}
const photoUrl = flag('--photo')
const credit = flag('--credit') ?? 'EventLinqs'
const out = args[0] ?? 'daily-poster-demonstration'
mkdirSync(out, { recursive: true })

type Night = PosterModule.PosterNight
const base = (o: Partial<Night>): Night => ({
  title: '', startDate: '', endDate: null, timezone: 'Australia/Melbourne', cityName: 'Geelong', venueName: null, venueAddress: null,
  cta: ctaMod.ctaFor({ entryMode: 'walk_in' }), priceLine: null, isAgeRestricted: false, ageMin: null, photo: null,
  shortLink: 'eventlinqs.com.au/e/ab12cd', ...o,
})
// The four originals' facts (C:\dev\START-16OCT\DAILY-POSTER-REFERENCE-4-ORIGINALS.png), on next week's days, and a fifth with no photograph.
const NIGHTS: Record<string, Night> = {
  'creative-community-night': base({ title: 'Creative Community Night', startDate: '2026-11-05T06:00:00Z', endDate: '2026-11-05T09:00:00Z', venueName: 'The House', venueAddress: 'Centrepoint Arcade, Geelong VIC 3220' }),
  'jackpot-trivia': base({ title: 'Jackpot Trivia', startDate: '2026-11-05T08:00:00Z', venueName: 'Elephant & Castle', venueAddress: '158 McKillop St, Geelong VIC 3220' }),
  'friyay-at-beavs': base({ title: "Friyay at Beav's", startDate: '2026-11-06T10:30:00Z', venueName: "Beav's Bar", venueAddress: '77 Little Malop St, Geelong VIC 3220', isAgeRestricted: true, ageMin: 18 }),
  'wooshka-live': base({ title: 'Wooshka live', startDate: '2026-11-07T10:00:00Z', venueName: 'Elephant & Castle', venueAddress: '158 McKillop St, Geelong VIC 3220' }),
  'fifth-no-photograph': base({ title: 'Sunday Sessions on the Pier', startDate: '2026-11-08T03:00:00Z', endDate: '2026-11-08T07:00:00Z', venueName: 'Cunningham Pier', venueAddress: '10 Western Beach Rd, Geelong VIC 3220', cta: ctaMod.ctaFor({ isFree: null }) }),
}

const m = await treatments.treatmentMeasurers()
const report: unknown[] = []
const sheet: Buffer[] = []
for (const [slug, n] of Object.entries(NIGHTS)) {
  for (const variant of ['photo', 'type'] as const) {
    if (variant === 'photo' && (!photoUrl || slug === 'fifth-no-photograph')) continue
    const facts: Night = variant === 'photo' ? { ...n, photo: { url: photoUrl as string, credit, archival: false } } : { ...n, photo: null }
    for (const format of ['portrait', 'square', 'story'] as const) {
      const words = poster.posterWords(facts, format)
      const l = poster.layoutDailyPoster(format, words, m, facts.photo)
      const faults = layout.layoutFaults(l, m)
      const bytes = await treatments.renderLayout(l)
      const name = `${slug}-${variant}-${format}`
      writeFileSync(join(out, `${name}.jpg`), bytes)
      const phone = await sharp(Buffer.from(bytes)).resize({ width: 390 }).png().toBuffer()
      writeFileSync(join(out, `${name}-phone-390.png`), phone)
      if (format === 'portrait') sheet.push(phone)
      report.push({ name, words, faults })
      console.log(`${faults.length === 0 ? 'QA PASS' : `QA ${faults.length} FAULT(S)`}  ${name}${faults.length ? `: ${faults.join('; ')}` : ''}`)
    }
  }
}
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2))

// The portrait posters side by side at 390, as the reference lays out the four originals.
const gap = 24
const heights = await Promise.all(sheet.map(async (b) => (await sharp(b).metadata()).height ?? 0))
const width = sheet.length * 390 + (sheet.length + 1) * gap
const height = Math.max(...heights) + 2 * gap
await sharp({ create: { width, height, channels: 3, background: '#EDEAE4' } })
  .composite(sheet.map((input, i) => ({ input, left: gap + i * (390 + gap), top: gap })))
  .png()
  .toFile(join(out, 'side-by-side-portrait-390.png'))
const faulty = (report as { faults: string[] }[]).filter((r) => r.faults.length).length
console.log(`${report.length} poster(s) drawn into ${out}; ${faulty} with a QA fault`)
