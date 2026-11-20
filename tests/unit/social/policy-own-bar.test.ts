// THE STANDING POLICY'S OWN BAR (the PM's 03:42 of 20 November 2026, item 4). The policy approves in the founder's name with
// no person reading the piece, so it approves only a piece the code in force would not draw again and whose drawn image
// prints no photo credit; everything else waits for a person's press, its reasons said (src/lib/social/store.ts).
import { PIECE_RULES_SINCE } from '@/lib/social/piece-quality'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Slide } from '@/lib/social/campaign'
import { POLICY_READ_FILES, policyRefusals } from '@/lib/social/store'

const APPROVED = 'https://www.eventlinqs.com.au/social/approved/'
const LINK = 'https://www.eventlinqs.com.au/events/amcf-2026?utm_source=facebook&utm_medium=social&utm_campaign=week_16_nov&utm_content=21-amcf-facebook'
const BODY = [
  '\u{1F941} Starts today at Fed Square, 11am to 10pm, and on Saturday and Sunday. Free entry.',
  'The African Music and Cultural Festival 2026.',
  '\u{1F4CD} Fed Square, Melbourne',
  '\u{1F4C5} Friday 20 to Sunday 22 November',
  '\u{1F39F}\u{FE0F} Free, no ticket needed',
]
const instagram = [...BODY, "Send this to who you're going with. Link in bio.", '', '#Melbourne #FedSquare #AfricanMusic'].join('\n')
const facebook = [...BODY, `Send this to who you're going with: ${LINK}`, '', '#Melbourne #FedSquare #AfricanMusic'].join('\n')
const versions = { instagram: { caption: instagram }, facebook: { caption: facebook } } as never
const fileSlide = (name: string) => ({ t: 'file', composition: 'close', url: `${APPROVED}${name}`, format: 'feed', eventId: '5d664060-a175-4b07-9c07-5e3c4a934c69', startDate: '2026-11-20T00:00:00Z' }) as Slide
// Fresh: drawn after the rules in force (piece-quality.ts PIECE_RULES_SINCE), as piece-quality.test.ts reads it.
const FRESH = new Date(Date.parse(PIECE_RULES_SINCE) + 60_000).toISOString()

describe("the standing policy's own bar", () => {
  it("passes AMCF's feed piece as written on production at 03:14:50 (version 3: the clean file, the gated captions)", () => {
    expect(policyRefusals({ slides: [fileSlide('amcf-feed-ig45-clean.jpg')], caption: instagram, versions }, FRESH)).toEqual([])
  })

  it('refuses an approved file not looked at and passed, such as the master that prints its credit', () => {
    const out = policyRefusals({ slides: [fileSlide('amcf-feed-ig45.jpg')], caption: instagram, versions }, FRESH)
    expect(out).toEqual(['Slide 1 is the approved file amcf-feed-ig45.jpg, not yet looked at and passed as printing no photo credit.'])
  })

  it('refuses a photographed slide that would print its credit under the photograph, and only for the credit', () => {
    const slide = { t: 'brand', composition: 'close', headline: 'Free this weekend', line: 'Fed Square', action: "See what's on", photo: 'https://example.org/p.jpg', credit: 'Photo: AMCF' } as Slide
    const withCredit = policyRefusals({ slides: [slide], caption: instagram, versions }, FRESH)
    expect(withCredit.some((r) => r === "Slide 1 prints the photo credit 'Photo: AMCF' under its photograph.")).toBe(true)
    const without = policyRefusals({ slides: [{ ...slide, credit: null } as Slide], caption: instagram, versions }, FRESH)
    expect(without.some((r) => r.includes('prints the photo credit'))).toBe(false)
  })

  it('refuses a piece drawn before the rules in force, as the code in force would draw it again', () => {
    const out = policyRefusals({ slides: [fileSlide('amcf-feed-ig45-clean.jpg')], caption: instagram, versions }, '2026-11-17T00:00:00.000Z')
    expect(out.some((r) => r.startsWith('The code in force would draw it again: [stale]'))).toBe(true)
  })

  it('refuses a caption the code in force would correct (no emoji)', () => {
    const plain = 'Three days at Fed Square. Link in bio.'
    const out = policyRefusals({ slides: [fileSlide('amcf-feed-ig45-clean.jpg')], caption: plain, versions: { instagram: { caption: plain }, facebook: { caption: plain } } as never }, FRESH)
    expect(out.some((r) => r.includes('carries no emoji'))).toBe(true)
  })

  it('every file it passes is in the site, at an approved address', () => {
    for (const name of POLICY_READ_FILES) expect(existsSync(join(process.cwd(), 'public/social/approved', name)), name).toBe(true)
  })

  it('the policy and its dry run both read the bar before the checked approval', () => {
    const store = readFileSync(join(process.cwd(), 'src/lib/social/store.ts'), 'utf8').replace(/\r\n/g, '\n')
    const policy = store.slice(store.indexOf('export async function approveUnderStandingPolicy('), store.indexOf('export type Redrawn'))
    expect(policy.indexOf('policyRefusals(')).toBeGreaterThan(0)
    expect(policy.indexOf('policyRefusals(')).toBeLessThan(policy.indexOf('approvePieceChecked('))
    const dry = store.slice(store.indexOf('export async function standingPolicyDryRun('), store.indexOf('export function policyRefusals('))
    expect(dry.indexOf('policyRefusals(')).toBeGreaterThan(0)
    expect(dry.indexOf('policyRefusals(')).toBeLessThan(dry.indexOf('pieceDependencies('))
  })
})
