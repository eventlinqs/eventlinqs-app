import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { withStandInCredit } from '@/lib/broadcast/campaign-slides'
import type { Slide } from '@/lib/social/campaign'

/*
 * A STAND-IN IS MARKED ILLUSTRATIVE WHEN IT IS DRAWN, WHATEVER WORDS WERE STORED (WINDOW 5A, 17 November 2026, on
 * Lawal's D1 and D2 of 16 November, 23:08: "stand-in images must never be presented as photographs of the actual
 * event"). D1 and D2 worded a stand-in's credit when a piece is PLANNED (stand-ins.ts standInCredit), so the week's 49
 * pieces, drawn on 16 November and by the sweep until 14:40 on 17 November, still stored 'Photo: Maor Attias / Pexels';
 * drawn with #292's code at 22:19 they printed it so. The renderer now takes the credit of any stand-in from the
 * photograph itself, so no stored slide, kit or post can print a stand-in as the night's own photograph.
 */
const ORIGIN = 'https://www.eventlinqs.com.au'
const STAND_IN = `${ORIGIN}/social/stand-ins/1763067.jpg`
const OWN = 'https://example.supabase.co/storage/v1/object/public/event-images/organiser-supplied/own.jpg'

const days = (photo: string | null, credit: string | null): Slide =>
  ({ t: 'days', composition: 'contents_cover', day: 'Saturday', date: '21 Nov', rows: [], photo, credit }) as unknown as Slide

describe('withStandInCredit', () => {
  it("a stand-in stored with the old words prints 'Illustrative photo' and its photographer", () => {
    expect((withStandInCredit(days(STAND_IN, 'Photo: Maor Attias / Pexels')) as { credit: string }).credit).toBe('Illustrative photo: Sebastian Ervi / Pexels')
  })

  it('a stand-in stored with no credit is credited all the same', () => {
    expect((withStandInCredit(days(STAND_IN, null)) as { credit: string }).credit).toBe('Illustrative photo: Sebastian Ervi / Pexels')
  })

  it("a night's own photograph and a slide in type are left exactly as they are", () => {
    const own = days(OWN, 'Photo: African Music and Cultural Festival')
    expect(withStandInCredit(own)).toBe(own)
    const type = days(null, null)
    expect(withStandInCredit(type)).toBe(type)
  })

  it('every slide the renderer builds passes through it first', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/broadcast/campaign-slides.tsx'), 'utf8')
    const body = src.slice(src.indexOf('export async function buildCampaignSlide'), src.indexOf('export async function renderCampaignSlide'))
    expect(body).toMatch(/const slide = withStandInCredit\(given\)/)
    expect(body.indexOf('withStandInCredit(given)')).toBeLessThan(body.indexOf('isLocked(slide)'))
  })
})
