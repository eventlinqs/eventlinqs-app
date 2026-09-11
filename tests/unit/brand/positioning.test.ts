/**
 * THE POSITIONING LOCK, as tests.
 *
 * The owner's ruling of 7 September 2026 sets the category (EventLinqs is the
 * platform where events get made, never a ticketing platform), the promise, and
 * the tagline, which it restates UNCHANGED.
 *
 * These tests do two jobs the guard cannot. The guard proves no surface uses a
 * forbidden phrase; it cannot prove the RIGHT words reached the surfaces that
 * matter, and it cannot prove the tagline the ruling left alone is still the one
 * in the code. So this reads the shipped modules and asserts what they now say.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BANNED_SELF_DESCRIPTIONS,
  BRAND_CATEGORY_LINE,
  BRAND_POSITIONING_STATEMENT,
  BRAND_PROMISE,
  BRAND_STRAPLINE,
  BRAND_STRAPLINE_SHORT,
  BRAND_TAGLINE,
  BRAND_TAGLINE_PHRASE_BOUND,
} from '@/lib/brand/positioning'

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

describe('the locked strings', () => {
  it('keeps the tagline the ruling left unchanged', () => {
    expect(BRAND_TAGLINE).toBe('Every community. Every event. One platform.')
  })

  it('carries the promise in the owner’s own words', () => {
    expect(BRAND_PROMISE).toBe("You've got help.")
  })

  it('carries the positioning statement verbatim, including the competitor contrast', () => {
    expect(BRAND_POSITIONING_STATEMENT).toContain(
      'For anyone putting on an event in Australia, EventLinqs is the one place it gets made.',
    )
    expect(BRAND_POSITIONING_STATEMENT).toContain(
      'Find your suppliers, book them, sell your tickets, run your door, get paid.',
    )
    expect(BRAND_POSITIONING_STATEMENT).toContain(
      'Unlike ticketing platforms that stop at the checkout, EventLinqs helps you put the event on.',
    )
  })

  it('names both forbidden phrases, so the guard and the tests read one list', () => {
    expect([...BANNED_SELF_DESCRIPTIONS]).toEqual(['ticketing platform', 'ticket seller'])
  })

  /**
   * The strapline and its short form are what replace the retired sentence on
   * every surface. If either one ever describes the platform as a ticketing
   * platform again, every surface inherits it in one commit.
   */
  it('never describes the platform with a phrase it bans', () => {
    for (const phrase of BANNED_SELF_DESCRIPTIONS) {
      expect(BRAND_STRAPLINE.toLowerCase()).not.toContain(phrase)
      expect(BRAND_STRAPLINE_SHORT.toLowerCase()).not.toContain(phrase)
      expect(BRAND_CATEGORY_LINE.toLowerCase()).not.toContain(phrase)
      expect(BRAND_TAGLINE.toLowerCase()).not.toContain(phrase)
    }
  })

  /** CLAUDE.md, Copy and banned content: no em dashes, no en dashes, no exclamation marks. */
  it('obeys the copy laws', () => {
    for (const line of [
      BRAND_TAGLINE,
      BRAND_PROMISE,
      BRAND_STRAPLINE,
      BRAND_STRAPLINE_SHORT,
      BRAND_CATEGORY_LINE,
      BRAND_POSITIONING_STATEMENT,
    ]) {
      expect(line).not.toMatch(/[–—]/)
      expect(line).not.toContain('!')
      expect(line.toLowerCase()).not.toMatch(/\bcultur/)
    }
  })
})

/**
 * THE SURFACES. Each of these carried the retired strapline on 8 September 2026,
 * and each is named by the ruling: metadata, the homepage, the footer, the auth
 * shell, the social schema, and a transactional email.
 */
describe('the surfaces the ruling names', () => {
  const surfaces: Array<[string, string]> = [
    ['the root title and cards', 'src/app/layout.tsx'],
    ['the site footer', 'src/components/layout/site-footer.tsx'],
    ['the auth shell', 'src/components/auth/auth-shell.tsx'],
    ['the site JSON-LD', 'src/components/seo/site-schema-jsonld.tsx'],
    ['the order confirmation email', 'src/lib/email/order-confirmation.ts'],
    ['the payout email', 'src/lib/payouts/email.ts'],
    ['the waitlist confirmation email', 'src/lib/waitlist/confirmation-email.ts'],
    /*
     * The waiting-list promotion message moved into the recovery engine on
     * 11 September 2026 (close-out D2), so that one freed unit produces exactly
     * one message. The engine has no brand by design and may not import one, so
     * the line it signs with is SUPPLIED by the adapter, and the adapter is now
     * the surface that has to read it from the one source.
     */
    ['the recovery adapter, which signs every recovery message', 'src/lib/recovery/links.ts'],
  ]

  it.each(surfaces)('%s reads the strapline from the one source', (_name, file) => {
    const src = read(file)
    expect(src).toContain("from '@/lib/brand/positioning'")
    expect(src).toContain('BRAND_STRAPLINE')
  })

  it.each(surfaces)('%s no longer carries the retired strapline', (_name, file) => {
    expect(read(file).toLowerCase()).not.toContain('ticketing platform built for every community')
  })

  /**
   * THE HERO THAT ACTUALLY RENDERS. The first version of this test read
   * `src/components/features/home/home-hero.tsx`, and the drive then failed at
   * all three viewports with a different headline: nothing imports that file.
   * The live homepage hero is `FeaturedHero`, so that is what is pinned here.
   * A test that reads an unrendered file is the same defect as a control that
   * writes a column nothing reads.
   */
  it('reads the homepage hero headline from the one source', () => {
    const hero = read('src/components/features/home/FeaturedHero.tsx')
    expect(hero).toContain("from '@/lib/brand/positioning'")
    expect(hero).toContain('{BRAND_TAGLINE_PHRASE_BOUND}')
    expect(hero).toContain('id="home-hero-heading"')
  })

  /**
   * The phrase binding is a measured fix (close-out C17.4 saw "platform."
   * orphan at 390 and 768), so the derived constant must still carry it. Losing
   * it would silently undo that fix while every string comparison still passed.
   */
  it('keeps the hero tagline bound phrase by phrase so no word orphans', () => {
    expect(BRAND_TAGLINE_PHRASE_BOUND.replace(/\u00A0/g, ' ')).toBe(BRAND_TAGLINE)
    expect([...BRAND_TAGLINE_PHRASE_BOUND].filter(c => c === '\u00A0')).toHaveLength(3)
  })

  /**
   * "Never lead with fees or a price comparison." The homepage metadata sold on
   * "No hidden fees, verified organisers, fair refund policy", which is a
   * ticketing company's pitch, and the retired hero subhead opened with
   * "All-in pricing from the first click."
   */
  it('does not sell the homepage on fees', () => {
    const homepage = read('src/app/page.tsx')
    expect(homepage).not.toContain('No hidden fees')
    expect(homepage).toContain('where events get made')
    expect(read('src/components/features/home/FeaturedHero.tsx')).not.toContain(
      'All-in pricing from the first click',
    )
  })
})
