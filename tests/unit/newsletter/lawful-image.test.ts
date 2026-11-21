import { describe, expect, it, vi } from 'vitest'
import { forTheNewsletter, type ReadNight } from '@/lib/newsletter/edition'
import { buildWhatsOn, type NlPick } from '@/lib/newsletter/whats-on'

/*
 * LAW 46 (f) (Lawal, 21 November 2026, 09:16, through the PM: "he does not handle permissions; we do it right"): every
 * image has a recorded lawful basis. In the newsletter the event page's own photograph is used only where the database's
 * own rule (social_asset_usable) says it may be used on an owned channel; otherwise the licensed category picture stands
 * in and says 'Illustrative photo'. A failed read never shows the page photograph on a guess.
 */
const ORIGIN = 'https://www.eventlinqs.com.au'
const NOW = new Date('2026-11-20T22:30:00Z')
const night = (over: Partial<ReadNight> = {}): ReadNight =>
  ({
    id: 'e1',
    slug: 'amcf-2026',
    title: 'African Music and Cultural Festival 2026',
    startDate: '2026-11-20T00:00:00Z',
    endDate: '2026-11-22T09:00:00Z',
    venue: 'Federation Square',
    categorySlug: 'festivals',
    categoryName: 'Festival',
    isFree: true,
    ticketed: false,
    ticketedHere: false,
    image: 'https://x.supabase.co/storage/v1/object/public/event-images/amcf.jpg',
    ownPhoto: true,
    listedAt: null,
    summary: null,
    citySlug: 'melbourne',
    pageImage: 'https://x.supabase.co/storage/v1/object/public/event-images/amcf.jpg',
    stockImage: '/images/spine/festivals.jpg',
    pick: { slug: 'amcf-2026', title: 'African Music and Cultural Festival 2026', categoryLabel: 'Festival', categorySlug: 'festivals', whenLabel: 'Until Sun 22 Nov, 8pm', venue: 'Federation Square', priceLabel: 'Free entry', image: 'https://x.supabase.co/storage/v1/object/public/event-images/amcf.jpg', imageAlt: 'AMCF, at Federation Square' },
    ...over,
  }) as ReadNight
const answering = (answer: () => Promise<{ data: unknown; error: unknown }>) => ({ rpc: vi.fn(answer) }) as never

describe("the night's own photograph in an email only with its recorded basis", () => {
  it('the database says usable: the page photograph stays, unlabelled', async () => {
    const db = answering(async () => ({ data: true, error: null }))
    const out = await forTheNewsletter(db, night(), NOW, ORIGIN)
    expect(out.image).toBe(night().image)
    expect(out.ownPhoto).toBe(true)
    expect(out.pick.illustrative).toBeUndefined()
    expect((db as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith('social_asset_usable', { p_url: night().pageImage, p_event: 'e1', p_at: NOW.toISOString() })
  })
  it('no basis (a grant for the listing only): the licensed category picture, labelled illustrative', async () => {
    const out = await forTheNewsletter(answering(async () => ({ data: false, error: null })), night(), NOW, ORIGIN)
    expect(out.image).toBe(`${ORIGIN}/images/spine/festivals.jpg`)
    expect(out.pick.image).toBe(`${ORIGIN}/images/spine/festivals.jpg`)
    expect(out.ownPhoto).toBe(false)
    expect(out.pick.illustrative).toBe(true)
    expect(out.pick.imageAlt).toBe('Festival, an illustrative photo')
  })
  it('a failed read never shows the page photograph on a guess', async () => {
    const out = await forTheNewsletter(answering(async () => { throw new Error('timeout') }), night(), NOW, ORIGIN)
    expect(out.ownPhoto).toBe(false)
    expect(out.pick.illustrative).toBe(true)
  })
  it('a night already on its stock picture is labelled without a read', async () => {
    const db = answering(async () => ({ data: true, error: null }))
    const out = await forTheNewsletter(db, night({ ownPhoto: false }), NOW, ORIGIN)
    expect(out.pick.illustrative).toBe(true)
    expect((db as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).not.toHaveBeenCalled()
  })
})

describe('only a photograph looked at, with no face its subject, stands in for a night', () => {
  // THE IMAGE LOCK (Lawal, 21 November 2026): no picture by category exists any more; a night stands on its OWN
  // stand in (tests/unit/images/image-lock.test.ts) or takes the brand panel, below.
  it('a night of a kind with none takes the brand panel: no picture and no label', async () => {
    const out = await forTheNewsletter(answering(async () => ({ data: false, error: null })), night({ stockImage: null }), NOW, ORIGIN)
    expect(out.image).toBeNull()
    expect(out.pick.image).toBeNull()
    expect(out.pick.illustrative).toBe(false)
  })
})

describe("an illustrative picture says so in the email", () => {
  const pick = (over: Partial<NlPick> = {}): NlPick => ({ slug: 'comedy-republic', title: 'Comedy Republic Main Stage', categoryLabel: 'Comedy', categorySlug: 'comedy', whenLabel: 'Sat 21 Nov, 8pm', venue: 'Comedy Republic', priceLabel: 'Tickets at comedyrepublic.com.au', image: 'https://img.example/c.jpg', imageAlt: 'Comedy, an illustrative photo', ...over })
  const build = (illustrative: boolean) =>
    buildWhatsOn({
      edition: 'weekend',
      editionId: 'weekend-melbourne-2026-11-21',
      cityName: 'Melbourne',
      citySlug: 'melbourne',
      datesLabel: 'Sat 21 to Sun 22 Nov 2026',
      subjectDates: 'Sat 21 to Sun 22 Nov',
      areaLabel: 'Melbourne & Surrounds',
      heroImage: { desktop: 'https://img.example/hero-d.jpg', mobile: 'https://img.example/hero-m.jpg' },
      intro: 'Here is the best of this weekend in Melbourne: comedy. Our top picks to help you plan it.',
      featured: { ...pick({ slug: 'amcf-2026', title: 'African Music and Cultural Festival 2026', illustrative }), blurb: null, featImage: { desktop: 'https://img.example/f-d.jpg', mobile: 'https://img.example/f-m.jpg' } },
      highlights: [pick({ illustrative })],
      free: null,
      gem: null,
      drive: null,
      alerts: [],
      origin: ORIGIN,
      unsubscribeUrl: `${ORIGIN}/newsletter/unsubscribe?t=x`,
      manageUrl: `${ORIGIN}/newsletter/manage?t=x`,
      referUrl: `${ORIGIN}/newsletter?ref=x`,
    })
  it('the featured night and each card carry the label; own photographs carry none', () => {
    const marked = build(true).html.split('Illustrative photo').length - 1
    expect(marked).toBeGreaterThanOrEqual(3) // the featured night on both widths, and the card
    expect(build(false).html).not.toContain('Illustrative photo')
  })
})
