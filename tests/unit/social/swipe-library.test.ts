import { describe, expect, it } from 'vitest'
import { OURS, REFERENCES, swipeRefusals, type Reference } from '@/lib/social/swipe/library'

/*
 * THE SWIPE LIBRARY (EL-M2, the PM's 01:30 of 16 November 2026). Acceptance: the library exists with the 22 and the first
 * five references, each reference held as link, date and notes only, never a copy of an image.
 */
describe('the swipe library', () => {
  it('holds our 22 locked posts, numbered 1 to 22 in their folders, each with why it works', () => {
    expect(OURS).toHaveLength(22)
    expect(OURS.map((p) => p.n)).toEqual(Array.from({ length: 22 }, (_, i) => i + 1))
    for (const p of OURS) expect(p.folder.startsWith(String(p.n).padStart(2, '0') + '-')).toBe(true)
  })

  it('holds at least five references of the leaders, every one passing', () => {
    expect(REFERENCES.length).toBeGreaterThanOrEqual(5)
    expect(swipeRefusals()).toEqual([])
  })

  it('refuses a reference with no link, no date, no notes or an image file', () => {
    const good: Reference = REFERENCES[0]
    expect(swipeRefusals([], [{ ...good, link: '' }])).toEqual([`${good.leader}, ${good.title}: no link`])
    expect(swipeRefusals([], [{ ...good, seen: 'last week' }])).toEqual([`${good.leader}, ${good.title}: no date`])
    expect(swipeRefusals([], [{ ...good, take: '' }])).toEqual([`${good.leader}, ${good.title}: no notes`])
    expect(swipeRefusals([], [{ ...good, link: 'https://example.com/their-post.jpg' }])).toEqual([`${good.leader}, ${good.title}: an image file, never kept`])
  })

  it('refuses one of ours without its line on why, or twice', () => {
    expect(swipeRefusals([{ ...OURS[0], why: '' }], [])).toEqual(['our 1: no line on why it works'])
    expect(swipeRefusals([OURS[0], OURS[0]], [])).toEqual(['our 1: its folder twice'])
  })
})
