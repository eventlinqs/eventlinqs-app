import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  GUIDES,
  GUIDE_CATEGORIES,
  allGuideShots,
  applyLiveValues,
  getGuide,
  populatedCategories,
  searchGuides,
} from '@/lib/guides'

/**
 * The guide library is content, so its gates are content gates. These assert
 * the constitution's copy laws, the Definition of Done (no placeholders, every
 * cross-link resolves), and the founder's brief (every guide illustrated with a
 * screenshot that actually exists on disk, no competitor named).
 */

const PUBLIC_DIR = path.join(process.cwd(), 'public')

/** The eight guides the brief names, by slug. */
const REQUIRED_SLUGS = [
  'creating-your-first-event',
  'building-a-seating-chart',
  'mapping-ticket-tiers-to-seats',
  'publishing-and-sharing-your-promo-kit',
  'tracking-your-reach',
  'getting-paid-and-payout-timing',
  'refunds-and-transfers',
  'running-the-door-with-the-qr-scanner',
]

/** Collects every user-facing string in a guide. */
function guideStrings(slug: string): string[] {
  const guide = getGuide(slug)
  if (!guide) return []
  const out: string[] = [guide.title, guide.summary, guide.hero.alt, guide.hero.caption]
  for (const block of guide.blocks) {
    switch (block.kind) {
      case 'para':
      case 'heading':
        out.push(block.text)
        break
      case 'note':
      case 'pitfall':
        out.push(block.title, block.text)
        break
      case 'list':
        out.push(...block.items)
        break
      case 'steps':
        for (const item of block.items) out.push(item.title, item.text)
        break
      case 'shot':
        out.push(block.shot.alt, block.shot.caption)
        break
    }
  }
  return out
}

const ALL_STRINGS = GUIDES.flatMap(g => guideStrings(g.slug))

describe('guide library: the launch set', () => {
  it('publishes exactly the eight guides the brief names', () => {
    expect(GUIDES.map(g => g.slug).sort()).toEqual([...REQUIRED_SLUGS].sort())
  })

  it('gives every guide a body with real substance, not a stub', () => {
    for (const guide of GUIDES) {
      const words = guideStrings(guide.slug).join(' ').split(/\s+/).filter(Boolean).length
      expect(words, `${guide.slug} is too thin to be a guide`).toBeGreaterThan(500)
    }
  })

  it('gives every guide a category that exists in the taxonomy', () => {
    const ids = new Set(GUIDE_CATEGORIES.map(c => c.id))
    for (const guide of GUIDES) expect(ids.has(guide.category)).toBe(true)
  })

  it('resolves every related-guide cross-link, so the hub has no dead links', () => {
    for (const guide of GUIDES) {
      for (const slug of guide.related) {
        expect(getGuide(slug), `${guide.slug} links to missing guide ${slug}`).not.toBeNull()
        expect(slug, `${guide.slug} links to itself`).not.toEqual(guide.slug)
      }
    }
  })

  it('only surfaces categories that hold a guide', () => {
    for (const entry of populatedCategories()) expect(entry.guides.length).toBeGreaterThan(0)
  })
})

describe('guide library: illustrated with real screenshots', () => {
  it('gives every guide a hero screenshot and at least one more in the body', () => {
    for (const guide of GUIDES) {
      expect(guide.hero.src).toMatch(/^\/guides\/.+\.png$/)
      const inline = guide.blocks.filter(b => b.kind === 'shot')
      expect(inline.length, `${guide.slug} has no screenshot in its body`).toBeGreaterThanOrEqual(1)
    }
  })

  it('points every screenshot at a file that exists on disk', () => {
    const missing = allGuideShots()
      .map(shot => shot.src)
      .filter(src => !fs.existsSync(path.join(PUBLIC_DIR, src.replace(/^\//, ''))))
    expect(missing, `captures missing from /public: ${missing.join(', ')}`).toEqual([])
  })

  it('gives every screenshot descriptive alt text and a caption', () => {
    for (const shot of allGuideShots()) {
      expect(shot.alt.length).toBeGreaterThan(20)
      expect(shot.caption.length).toBeGreaterThan(20)
    }
  })
})

describe('guide library: the copy laws', () => {
  it('uses no em-dash or en-dash anywhere', () => {
    const offenders = ALL_STRINGS.filter(s => /[–—]/.test(s))
    expect(offenders).toEqual([])
  })

  it('uses no exclamation marks in user-facing copy', () => {
    const offenders = ALL_STRINGS.filter(s => s.includes('!'))
    expect(offenders).toEqual([])
  })

  it('never uses the banned community word in any form', () => {
    const offenders = ALL_STRINGS.filter(s => /cultur/i.test(s))
    expect(offenders).toEqual([])
  })

  it('never names a competitor in public copy', () => {
    const competitors = /\b(ticketmaster|eventbrite|humanitix|trybooking|ticketek|dice|moshtix|oztix)\b/i
    const offenders = ALL_STRINGS.filter(s => competitors.test(s))
    expect(offenders).toEqual([])
  })

  it('carries no placeholder copy', () => {
    const placeholders = /\b(lorem ipsum|coming soon|TODO|FIXME|sample event|tbd|placeholder)\b/i
    const offenders = ALL_STRINGS.filter(s => placeholders.test(s))
    expect(offenders).toEqual([])
  })

  it('uses Australian spelling for the words this library actually uses', () => {
    // Only assert on forms the guides genuinely contain, so the test fails on a
    // real regression rather than on a word nobody wrote.
    const americanisms = /\b(organiz\w*|customiz\w*|color|colors|center|centers|canceled|analyze\w*)\b/i
    const offenders = ALL_STRINGS.filter(s => americanisms.test(s))
    expect(offenders).toEqual([])
  })

  it('hardcodes no fee number, deferring to the live pricing resolver', () => {
    // The fee is rendered from {{fee}}; a literal percentage-plus-amount in the
    // prose would be a second source of truth and would drift.
    const hardcodedFee = /\d+(\.\d+)?\s?%\s?\+\s?(AUD|A\$|\$)/i
    const offenders = ALL_STRINGS.filter(s => hardcodedFee.test(s))
    expect(offenders).toEqual([])
  })
})

describe('guide library: live values', () => {
  it('substitutes the fee and payout window from the resolver', () => {
    const out = applyLiveValues('fee is {{fee}} and funds release {{payoutDays}} days after', {
      fee: '3.5% + AUD 0.99',
      payoutDays: 3,
    })
    expect(out).toBe('fee is 3.5% + AUD 0.99 and funds release 3 days after')
  })

  it('leaves an unknown token visible rather than blanking the sentence', () => {
    const out = applyLiveValues('a {{mystery}} token', { fee: 'x', payoutDays: 1 })
    expect(out).toBe('a {{mystery}} token')
  })

  it('uses the fee token only where a fee is actually discussed', () => {
    const usesFee = GUIDES.filter(g => guideStrings(g.slug).some(s => s.includes('{{fee}}')))
    expect(usesFee.map(g => g.slug)).toEqual(['getting-paid-and-payout-timing'])
  })
})

describe('guide library: search', () => {
  it('returns everything for an empty query', () => {
    expect(searchGuides('   ')).toHaveLength(GUIDES.length)
  })

  it('ranks a title match above a body mention', () => {
    const results = searchGuides('refund')
    expect(results[0].slug).toBe('refunds-and-transfers')
    expect(results.length).toBeGreaterThan(1)
  })

  it('narrows as terms are added rather than widening', () => {
    const broad = searchGuides('seat')
    const narrow = searchGuides('seat ticket tiers')
    expect(narrow.length).toBeLessThanOrEqual(broad.length)
    expect(narrow.map(g => g.slug)).toContain('mapping-ticket-tiers-to-seats')
  })

  it('finds a guide by a phrase written in its body, not just its title', () => {
    expect(searchGuides('barcode').length + searchGuides('door team').length).toBeGreaterThan(0)
    expect(searchGuides('door team')[0].slug).toBe('running-the-door-with-the-qr-scanner')
  })

  it('returns nothing for a term the library does not contain', () => {
    expect(searchGuides('zzzznotathing')).toEqual([])
  })
})
