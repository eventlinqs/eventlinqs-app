/**
 * THE CAMPAIGN'S SLIDES, RENDERED TO BE LOOKED AT (the release checklist, J7 and J8): plans a week from fixture nights
 * (no database), renders every slide of every piece as the JPEG Instagram takes, and writes them to <out dir> with the
 * plan beside them. Slots, not looks: the compositions wait for Lawal's approval.
 *
 *   node node_modules/tsx/dist/cli.mjs scripts/verify/campaign-slides-render.mts <out dir>
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import Module from 'node:module'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type * as CampaignModule from '@/lib/social/campaign'
import type * as SlidesModule from '@/lib/broadcast/campaign-slides'
import type * as CtaModule from '@/lib/events/cta'

const EMPTY = fileURLToPath(new URL('../../tests/stubs/empty.ts', import.meta.url))
const cjs = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string }
const resolveFilename = cjs._resolveFilename
cjs._resolveFilename = (request: string, ...rest: unknown[]) =>
  request === 'server-only' || request === 'client-only' ? EMPTY : resolveFilename(request, ...rest)

const campaignMod = (await import('@/lib/social/campaign')) as typeof CampaignModule & { default?: typeof CampaignModule }
const slidesMod = (await import('@/lib/broadcast/campaign-slides')) as typeof SlidesModule & { default?: typeof SlidesModule }
const ctaMod = (await import('@/lib/events/cta')) as typeof CtaModule & { default?: typeof CtaModule }
const campaign = (campaignMod.default ?? campaignMod) as typeof CampaignModule
const slides = (slidesMod.default ?? slidesMod) as typeof SlidesModule
const { ctaFor, ctaPriceLine } = (ctaMod.default ?? ctaMod) as typeof CtaModule

const out = process.argv[2] ?? 'campaign-slides'
mkdirSync(out, { recursive: true })

let seq = 0
function night(at: string, title: string, venue: string, state: CtaModule.CtaInput, category: string, city = { slug: 'geelong', name: 'Geelong' }): CampaignModule.CampaignNight {
  seq += 1
  const cta = ctaFor(state)
  return {
    eventId: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    slug: `bp-render-${seq}`,
    title,
    startDate: at,
    timezone: 'Australia/Melbourne',
    citySlug: city.slug,
    cityName: city.name,
    venueName: venue,
    host: venue,
    categorySlug: category,
    summary: 'Local acts in the front bar, with food from the kitchen until late.',
    approvedPhotoUrl: null,
    photoCredit: null,
    cta,
    priceLine: ctaPriceLine(cta, { native: 'From $25', outsideChecked: null }),
  }
}

const nights = [
  night('2026-10-27T09:00:00Z', 'Fighters Of Foo', 'Barwon Club Hotel', { externalTicketUrl: 'https://www.oztix.com.au/x', providerName: 'Oztix' }, 'music'),
  night('2026-10-29T09:00:00Z', 'Geelong Open Mic Comedy', 'Here and Now Lounge', { entryMode: 'walk_in', isFree: true }, 'comedy'),
  night('2026-10-30T08:30:00Z', 'Kate Ceberano', 'Costa Hall', { tiers: [{ price: 6900 }] }, 'music'),
  night('2026-10-30T22:00:00Z', 'Geelong City Market', 'Little Malop Street Central', { entryMode: 'walk_in', isFree: true }, 'family'),
  night('2026-11-01T05:00:00Z', 'Spring Garden Festival', 'Geelong Botanic Gardens', { tiers: [], isFree: false }, 'festival'),
]
const { pieces, imageRequests } = campaign.planCampaign({ nights, cities: [{ slug: 'geelong', name: 'Geelong' }], weekStart: '2026-10-26', origin: 'https://www.eventlinqs.com.au' })
writeFileSync(join(out, 'plan.json'), JSON.stringify({ pieces, imageRequests }, null, 2))
let made = 0
for (const p of pieces) {
  for (const [i, s] of p.slides.entries()) {
    const bytes = await slides.renderCampaignSlide(p.format, s, i + 1, p.slides.length, null)
    const ok = bytes[0] === 0xff && bytes[1] === 0xd8
    const name = `${p.kind}-${p.city}${p.partnerName ? `-${p.partnerName.replace(/\W+/g, '-').toLowerCase()}` : ''}-${String(i + 1).padStart(2, '0')}.jpg`
    writeFileSync(join(out, name), bytes)
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name} (${bytes.byteLength} bytes)`)
    if (ok) made += 1
  }
}
console.log(`${pieces.length} pieces, ${made} slides rendered, ${imageRequests.length} image requests drafted`)
