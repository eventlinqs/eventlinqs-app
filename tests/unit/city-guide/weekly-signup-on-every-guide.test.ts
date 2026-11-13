/*
 * EVERY CITY GUIDE ASKS FOR ITS WEEKLY EMAIL (the PM's 18:16 of 13 November 2026, item 3, on WINDOW 5A's finding of 18:03:
 * the sign-up lived only on the community city pages, so /city/melbourne, the guide itself, had no way to get its weekly
 * email). The same block the community pages use is placed after the guide's sections on every city guide, and never on
 * a state page, whose guide is not one city's. The block's own heading and line are the consent wording recorded
 * (src/lib/consent/wording.ts), pinned by tests/unit/consent/newsletter-capture.test.ts.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

/* CRLF read as LF, so the test reads the same on a tree checked out either way. */
const SCREEN = readFileSync(resolve(process.cwd(), 'src/components/features/city-guide/city-guide-screen.tsx'), 'utf8').replace(/\r\n/g, '\n')

describe('the weekly guide sign-up on the city guide', () => {
  test('the guide screen renders the community pages\' own block, light, with the city\'s name', () => {
    expect(SCREEN).toContain("import { CityNewsletterCapture } from '@/components/features/city/city-newsletter-capture'")
    expect(SCREEN).toContain('<CityNewsletterCapture cityName={city.name} tone="light" />')
  })

  test('it comes after the guide\'s sections and before what a page adds after the guide', () => {
    const guide = SCREEN.indexOf('<CityGuide\n')
    const more = SCREEN.indexOf('aria-label={`More of ${city.name}`}')
    const block = SCREEN.indexOf('<CityNewsletterCapture')
    const after = SCREEN.lastIndexOf('{after}')
    expect(guide).toBeGreaterThan(-1)
    expect(block).toBeGreaterThan(guide)
    expect(block).toBeGreaterThan(more)
    expect(block).toBeLessThan(after)
  })

  test('a state page does not carry it: the weekly guide is one city\'s', () => {
    const section = SCREEN.slice(SCREEN.lastIndexOf('{!onState ? (', SCREEN.indexOf('<CityNewsletterCapture')), SCREEN.indexOf('<CityNewsletterCapture'))
    expect(section).toContain('{!onState ? (')
    expect(section).toContain("aria-label={`${city.name}'s weekly guide`}")
  })
})
