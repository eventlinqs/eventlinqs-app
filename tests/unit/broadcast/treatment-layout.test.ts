import { beforeAll, describe, expect, it } from 'vitest'
import { contrast, FitError, GEOMETRY, layoutBrand, layoutFaults, layoutNight, layoutOffer, rgbOf, type Layout, type Measurers, type NightWords, type TreatmentFormat } from '@/lib/broadcast/treatment-layout'
import { enlargement, formatsOf, MAX_ENLARGEMENT } from '@/lib/broadcast/campaign-slides'
import { treatmentMeasurers } from '@/lib/broadcast/treatments'

/*
 * THE THREE APPROVED TREATMENTS (Lawal's final creative approval, 28 October 2026 19:52; the references in
 * C:\dev\EVIDENCE\CREATIVE-APPROVED-28OCT). Measured with the real vendored faces, every layout at every format keeps
 * every word inside its box, the margins and the story's safe area, at a size that reads on a phone, with its contrast
 * (WCAG 4.5:1, 3:1 for large type), nothing overlapping; a title that cannot fit is refused, never cut; a photograph
 * enlarged past 1.5 times is held.
 */

let m: Measurers
beforeAll(async () => {
  m = await treatmentMeasurers()
})

const FORMATS: TreatmentFormat[] = ['portrait', 'square', 'story']
const PHOTO = 'https://example.supabase.co/storage/v1/object/public/event-images/organisers/bp-approved.jpg'

const base: NightWords = {
  title: 'Kate Ceberano',
  eyebrow: 'Live at Costa Hall',
  date: 'Sat 31 Oct',
  time: '7pm',
  entry: null,
  action: 'View tickets at Geelong Arts Centre',
  label: 'eventlinqs.com.au',
  city: 'Geelong',
  line: 'Australian Made Tour 2026, with Kathleen Halloran and Dusty Lee.',
  photo: null,
  credit: null,
  accent: '#E8B738',
  composition: 'concert',
}

const NIGHTS: Record<string, NightWords> = {
  'a short name in type': base,
  'the AMCF night with its photograph': {
    ...base,
    title: 'African Music and Cultural Festival 2026',
    eyebrow: 'At Fed Square',
    date: 'Fri 20 to Sun 22 Nov',
    time: 'From 11am',
    entry: 'Free, no ticket needed',
    action: 'View event details',
    city: 'Melbourne',
    line: null,
    photo: PHOTO,
    credit: 'AMCF, past festival',
    accent: '#F08A24',
    composition: 'festival',
  },
  'a long name and a long provider': {
    ...base,
    title: 'The Geelong Folk and Acoustic Songwriters Night at the Wool Exchange Ballroom',
    eyebrow: 'At The National Wool Museum Courtyard',
    date: 'Fri 30 Oct 2026 to Sun 1 Nov 2026',
    action: 'View tickets at Geelong Performing Arts Centre Box Office',
    entry: 'From $35 plus booking fee',
  },
  'a long name with its photograph': {
    ...base,
    title: 'The Geelong Folk and Acoustic Songwriters Night at the Wool Exchange Ballroom',
    photo: PHOTO,
    credit: 'The Wool Exchange',
    line: null,
  },
  'a family day, price unknown': { ...base, title: 'Little Malop Street Market', eyebrow: 'At Little Malop Street', composition: 'family', accent: '#6FC3C0', action: 'View event details', line: null },
  'a free night': { ...base, title: 'Open Mic Comedy', eyebrow: 'At Here & Now Lounge', composition: 'free', accent: '#E8B738', entry: 'Free, no ticket needed', action: 'View event details' },
}

function expectClean(l: Layout) {
  expect(layoutFaults(l, m)).toEqual([])
}

describe('every night, every format', () => {
  for (const [name, words] of Object.entries(NIGHTS)) {
    for (const f of FORMATS) {
      it(`${name}, ${f}: fits, reads and holds its contrast`, () => {
        const l = layoutNight(f, words, m)
        expect(l.treatment).toBe(words.photo ? 'photo' : 'type')
        expectClean(l)
        expect(l.runs.find((r) => r.role === 'title')?.lines.join(' ')).toBe(words.title.replace(/\s+/g, ' '))
        expect(l.runs.find((r) => r.role === 'action')?.lines.join(' ')).toBe(words.action)
      })
    }
  }

  it('lays each format out natively: the boxes differ, never one poster scaled', () => {
    const a = layoutNight('portrait', NIGHTS['the AMCF night with its photograph'], m)
    const b = layoutNight('square', NIGHTS['the AMCF night with its photograph'], m)
    const c = layoutNight('story', NIGHTS['the AMCF night with its photograph'], m)
    expect(new Set([a.photo?.h, b.photo?.h, c.photo?.h]).size).toBe(3)
    expect(a.runs.find((r) => r.role === 'title')?.size).not.toBe(b.runs.find((r) => r.role === 'title')?.size)
  })

  it("keeps a story's words out of the top and bottom 250 px Meta's own controls cover", () => {
    for (const words of Object.values(NIGHTS)) {
      const l = layoutNight('story', words, m)
      for (const r of l.runs) {
        expect(r.y).toBeGreaterThanOrEqual(250)
        expect(r.y + r.lines.length * r.size * r.lineHeight).toBeLessThanOrEqual(1920 - 250)
      }
    }
  })

  it('shows the credit beside a photograph, and none without one', () => {
    expect(layoutNight('portrait', NIGHTS['the AMCF night with its photograph'], m).runs.find((r) => r.role === 'credit')?.lines[0]).toBe('Photo: AMCF, past festival')
    expect(layoutNight('portrait', base, m).runs.some((r) => r.role === 'credit')).toBe(false)
  })

  it('draws a label, never a pretend link: the domain, and the action as words', () => {
    const l = layoutNight('portrait', base, m)
    expect(l.runs.find((r) => r.role === 'label')?.lines).toEqual(['eventlinqs.com.au'])
  })
})

describe('a title is a fact', () => {
  it('is refused, never cut, when it cannot fit at the smallest size', () => {
    const long = Array.from({ length: 40 }, (_, i) => `Word${i}`).join(' ')
    expect(() => layoutNight('square', { ...base, title: long }, m)).toThrow(FitError)
  })
})

describe('the brand piece and the organiser campaign', () => {
  const brand = { headline: 'Say yes to this weekend.', line: 'Gigs, festivals, markets and free nights across Melbourne, Geelong, Ballarat and Bendigo, in one place.', action: "See what's on", label: 'eventlinqs.com.au', photo: null, credit: null }
  for (const f of FORMATS) {
    it(`the brand piece is EventLinqs' own art with no licensed photograph, and the photograph with one (${f})`, () => {
      const c = layoutBrand(f, brand, m)
      expect(c.treatment).toBe('graphic')
      expect(c.art.length).toBeGreaterThan(0)
      expectClean(c)
      const a = layoutBrand(f, { ...brand, photo: PHOTO, credit: 'Licensed for EventLinqs' }, m)
      expect(a.treatment).toBe('photo')
      expectClean(a)
    })
    it(`the organiser campaign fits (${f})`, () => {
      expectClean(
        layoutOffer(f, { eyebrow: 'For venues and organisers', headline: 'Run regular nights in Victoria?', points: ['List them on EventLinqs for free.', 'We put them in front of people looking for something to do this week.', 'Each week we send you a post of your own to share, with a link that counts who it sends.'], url: 'eventlinqs.com.au/for-organisers' }, m),
      )
    })
  }
})

describe('the checks themselves fail when they should (drilled red)', () => {
  it('catches words wider than their box', () => {
    const l = layoutNight('portrait', base, m)
    const title = l.runs.find((r) => r.role === 'title')!
    const broken = { ...l, runs: l.runs.map((r) => (r === title ? { ...r, w: 200 } : r)) }
    expect(layoutFaults(broken, m).some((f) => f.startsWith('title:'))).toBe(true)
  })
  it('catches low contrast', () => {
    const l = layoutNight('portrait', base, m)
    const broken = { ...l, runs: l.runs.map((r) => (r.role === 'eyebrow' ? { ...r, color: '#3A2030' } : r)) }
    expect(layoutFaults(broken, m).some((f) => f.startsWith('eyebrow: contrast'))).toBe(true)
  })
  it('catches words in the story safe area and overlapping words', () => {
    const l = layoutNight('story', base, m)
    const broken = { ...l, runs: l.runs.map((r) => (r.role === 'wordmark' ? { ...r, y: 100 } : r.role === 'eyebrow' ? { ...r, y: l.runs.find((x) => x.role === 'title')!.y } : r)) }
    const faults = layoutFaults(broken, m)
    expect(faults.some((f) => f.startsWith('wordmark: outside the safe area'))).toBe(true)
    expect(faults.some((f) => f.includes('overlaps'))).toBe(true)
  })
  it('measures contrast as WCAG does', () => {
    expect(contrast(rgbOf('#FFFFFF'), rgbOf('#000000'))).toBeCloseTo(21, 5)
    expect(contrast(rgbOf('#777777'), rgbOf('#FFFFFF'))).toBeCloseTo(4.48, 1)
  })
})

describe('resolution', () => {
  it("holds a photograph enlarged past 1.5 times at the size the platform shows it: AMCF's 1100 by 733 copies", () => {
    const amcf = { url: PHOTO, focal: null, width: 1100, height: 733 }
    const portrait = enlargement(layoutNight('portrait', NIGHTS['the AMCF night with its photograph'], m), amcf)!
    const story = enlargement(layoutNight('story', NIGHTS['the AMCF night with its photograph'], m), amcf)!
    expect(portrait).toBeGreaterThan(1)
    expect(portrait).toBeLessThanOrEqual(MAX_ENLARGEMENT)
    expect(story).toBeGreaterThan(MAX_ENLARGEMENT)
    expect(enlargement(layoutNight('portrait', NIGHTS['the AMCF night with its photograph'], m), { ...amcf, width: 4000, height: 2667 })!).toBeLessThan(1)
  })
  it('makes a feed piece in the portrait and the square, a story piece as a story', () => {
    expect(formatsOf('feed')).toEqual(['feed', 'square'])
    expect(formatsOf('story')).toEqual(['story'])
    expect(GEOMETRY.story.safeTop).toBe(250)
  })
})
