import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * LAW 15, FULL PICTURES, NEVER CROPPED (Lawal, 2 November 2026, 14:51, C:\dev\CLAUDE.md): an event's photograph is shown
 * WHOLE at its own shape on every surface and width, never cropped or zoomed; on phones the title, date and buttons sit
 * BELOW it, and no dark wash lies over it. Round 2 item 13 (the CONTROLLER's 14:53 (2)) and its class: every place an
 * event page or an event card paints an event's photograph.
 */
const src = (f: string) => readFileSync(join(process.cwd(), f), 'utf8').replace(/\r\n/g, '\n')
const PAGE = 'src/app/events/[slug]/page.tsx'
const WALK_IN = 'src/components/events/walk-in/walk-in-event-page.tsx'

describe('the hero raster can show a photograph whole', () => {
  it("HeroMedia passes fit to HeroRaster, which contains on 'contain'", () => {
    expect(src('src/components/media/HeroMedia.tsx')).toMatch(/fit=\{fit\}/)
    expect(src('src/components/media/hero-raster.tsx')).toMatch(/fit === 'contain' \? 'object-contain' : 'object-cover'/)
  })
})

describe('the standard event page: the photograph whole, the words below it', () => {
  const page = src(PAGE)
  const hero = page.slice(page.indexOf('aria-label="Event hero"'), page.indexOf('</HeroWords>'))
  it('a night with a photograph draws it in its own box, contained, with no zoom', () => {
    expect(hero).toMatch(/data-hero-photo-whole className="relative aspect-\[3\/2\][^"]*lg:aspect-\[16\/7\]/)
    const media = hero.slice(hero.indexOf('<HeroMedia'), hero.indexOf('/>', hero.indexOf('<HeroMedia')))
    expect(media).toMatch(/fit="contain"/)
    expect(media).not.toMatch(/kenBurns/)
  })
  it('the band, the transparent header and the washes belong to the night with NO photograph only', () => {
    expect(hero).toMatch(/className=\{typographicHero \? 'hero-marketing [^']*' : 'bg-navy-950'\}/)
    expect(hero).toMatch(/\{typographicHero \? <HeroPresenceMarker \/> : null\}/)
    expect(hero).toMatch(/\{typographicHero \? \(\s*<div className="absolute inset-0">[\s\S]*HERO_HEADER_SCRIM[\s\S]*\) : null\}/)
    expect(hero).toMatch(/<HeroWords photo=\{!typographicHero\}/)
    expect(page).toMatch(/return photo \? <div className=\{className\}>\{children\}<\/div> : <HeroCaption/)
  })
})

describe('the class: every other place an event photograph is painted', () => {
  it('the walk-in hero contains its photograph at every width', () => {
    expect(src(WALK_IN)).toMatch(/<HeroMedia image=\{hero\.image\} alt=\{hero\.alt\} objectPosition="50% 50%" fit="contain" \/>/)
  })
  it('a gallery tile shows each photograph whole', () => {
    const g = src('src/components/media/GalleryImage.tsx')
    expect(g).toMatch(/card-media-img object-contain/)
    expect(g).not.toMatch(/object-cover/)
  })
  it('every EventCardMedia in the event components contains its photograph, and none zooms on hover', () => {
    const dir = 'src/components/features/events'
    const files = readdirSync(join(process.cwd(), dir)).filter((f) => f.endsWith('.tsx')).map((f) => `${dir}/${f}`)
    let seen = 0
    for (const f of files) {
      const s = src(f)
      for (const m of s.matchAll(/<EventCardMedia\b[\s\S]*?\/>/g)) {
        if (/alt=""/.test(m[0])) continue // the blurred backdrop behind a contained card photograph, not the photograph
        seen += 1
        expect(m[0], f).toMatch(/objectFit="contain"/)
        expect(m[0], f).not.toMatch(/scale-1\d\d/)
      }
    }
    expect(seen).toBeGreaterThanOrEqual(2)
  })
})
