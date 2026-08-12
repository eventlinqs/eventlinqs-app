import { describe, expect, it } from 'vitest'
import {
  CAPTION_ORDER,
  buildCaptions,
  buildHashtags,
  captionTellCheck,
  eventFamily,
  type CaptionInput,
} from '@/lib/broadcast/captions'

/**
 * The captions are the half of the promise the kit never kept: the organiser
 * still wrote every word. These assert the two things that decide whether the
 * engine can ship at all: it never invents a fact, and it never sounds machine
 * made.
 */

const BASE: CaptionInput = {
  title: 'Sharp Tongue: Geelong Comedy Showcase',
  summary:
    'Six comics, one room, and a headline set from a name you already know off the telly. Doors at 7:30, first act at 8.',
  dateLabel: 'Friday 18 September',
  timeLabel: '8:00 pm',
  shortDateLabel: 'Fri 18 Sep',
  venueName: 'The Piano Bar',
  city: 'Geelong',
  priceLabel: 'From AUD $28',
  organiserName: 'Barwon Comedy Club',
  categorySlug: 'arts-culture',
  links: {
    instagram: 'https://eventlinqs.com/s/ig000001',
    facebook: 'https://eventlinqs.com/s/fb000001',
    whatsapp: 'https://eventlinqs.com/s/wa000001',
    x: 'https://eventlinqs.com/s/xx000001',
    linkedin: 'https://eventlinqs.com/s/li000001',
    email: 'https://eventlinqs.com/s/em000001',
    fallback: 'https://eventlinqs.com/events/sharp-tongue',
  },
}

const FIXTURES: { name: string; input: CaptionInput }[] = [
  { name: 'comedy night', input: BASE },
  {
    name: 'club night',
    input: {
      ...BASE,
      title: 'Basement 45: Warehouse Session',
      summary: 'Four hours of house and breaks across two rooms.',
      city: 'Melbourne',
      venueName: 'Sub Rosa',
      priceLabel: 'From AUD $35',
      categorySlug: 'nightlife',
      organiserName: 'Basement 45',
    },
  },
  {
    name: 'market',
    input: {
      ...BASE,
      title: 'Pakington Street Makers Market',
      summary: 'Sixty stalls of makers, growers and bakers along the park.',
      venueName: 'Johnstone Park',
      priceLabel: 'Free entry',
      categorySlug: 'food-drink',
      organiserName: 'Pako Traders',
    },
  },
  {
    name: 'workshop',
    input: {
      ...BASE,
      title: 'Screen Printing for Beginners',
      summary: null,
      venueName: 'Little Creatures Studio',
      priceLabel: 'From AUD $95',
      categorySlug: 'education',
      organiserName: 'Northern Press Studio',
    },
  },
  {
    name: 'fundraiser',
    input: {
      ...BASE,
      title: 'A Night for the Barwon Boat Shed Appeal',
      summary: 'Dinner on the water, a silent auction, and a short talk from the crew.',
      venueName: 'The Wharf Shed',
      priceLabel: 'From AUD $65',
      categorySlug: 'charity',
      organiserName: 'Friends of the Barwon',
    },
  },
  {
    name: 'kids birthday party',
    input: {
      ...BASE,
      title: 'Ivy Turns Six: Dinosaur Party',
      summary: 'Fossil dig in the sandpit and a dinosaur cake at half eleven.',
      venueName: 'Eastern Gardens Rotunda',
      priceLabel: 'Free entry',
      categorySlug: 'family',
      organiserName: 'The Whitfield Family',
    },
  },
]

describe('the caption set', () => {
  it('writes one caption per channel, in the order the kit shows them', () => {
    const captions = buildCaptions(BASE)
    expect(captions.map(caption => caption.platform)).toEqual([...CAPTION_ORDER])
  })

  it('gives every caption that channel own tracked link', () => {
    const captions = buildCaptions(BASE)
    for (const caption of captions) {
      const expected = BASE.links[caption.platform]
      expect(expected).toBeTruthy()
      expect(caption.text).toContain(expected)
    }
  })

  it('falls back to the event URL rather than shipping a caption with nowhere to buy', () => {
    const captions = buildCaptions({ ...BASE, links: { fallback: BASE.links.fallback } })
    for (const caption of captions) {
      expect(caption.text).toContain(BASE.links.fallback)
    }
  })

  it('writes six genuinely different registers, not one text six times', () => {
    const bodies = buildCaptions(BASE).map(caption => caption.text.replace(/https:\S+/g, ''))
    expect(new Set(bodies).size).toBe(bodies.length)
  })
})

describe('nothing invented', () => {
  it('drops the venue clause when there is no venue rather than guessing one', () => {
    const captions = buildCaptions({ ...BASE, venueName: null, city: null })
    for (const caption of captions) {
      expect(caption.text).not.toContain('undefined')
      expect(caption.text).not.toContain('null')
      expect(caption.text).not.toMatch(/\bat\s*[,.]/)
    }
  })

  it('quotes the organiser summary rather than rewriting it', () => {
    const captions = buildCaptions(BASE)
    const facebook = captions.find(caption => caption.platform === 'facebook')
    expect(facebook?.text).toContain(BASE.summary as string)
  })

  it('says nothing at all where there is no summary', () => {
    const captions = buildCaptions({ ...BASE, summary: null })
    for (const caption of captions) {
      expect(caption.text.length).toBeGreaterThan(40)
      expect(caption.text).not.toContain('  ')
    }
  })
})

describe('the published limits', () => {
  it('keeps an X post inside the 280 characters X publishes', () => {
    for (const fixture of FIXTURES) {
      const caption = buildCaptions(fixture.input).find(c => c.platform === 'x')
      expect(caption?.characters, fixture.name).toBeLessThanOrEqual(280)
    }
  })

  it('keeps an X post inside 280 even with a title nobody should have written', () => {
    const caption = buildCaptions({
      ...BASE,
      title:
        'The Very Long Annual Geelong and Surrounds Community Comedy Showcase and Late Night Variety Hour Featuring Everyone',
      venueName: 'The Extremely Long Named Community Hall and Function Centre',
    }).find(c => c.platform === 'x')
    expect(caption?.characters).toBeLessThanOrEqual(280)
    expect(caption?.text).toContain(BASE.links.x)
  })
})

describe('the copy laws', () => {
  it('never ships a dash, a bang, the banned word, or a competitor name', () => {
    for (const fixture of FIXTURES) {
      const captions = buildCaptions(fixture.input)
      for (const caption of captions) {
        const body = `${caption.subject ?? ''}\n${caption.text}`
        expect(body, fixture.name).not.toMatch(/[—–]/)
        expect(body, fixture.name).not.toContain('!')
        expect(body.toLowerCase(), fixture.name).not.toMatch(/\bcultur(e|es|al|ally)\b/)
      }
    }
  })

  it('passes the platform own tell lexicon on every fixture', () => {
    for (const fixture of FIXTURES) {
      const captions = buildCaptions(fixture.input)
      expect(captionTellCheck(captions, fixture.input.summary), fixture.name).toEqual([])
    }
  })
})

describe('hashtags', () => {
  it('are few, lowercase, and built from real fields', () => {
    const tags = buildHashtags(BASE)
    expect(tags.length).toBeLessThanOrEqual(3)
    expect(tags).toEqual(['#geelong', '#geelongevents', '#whatson'])
    for (const tag of tags) expect(tag).toMatch(/^#[a-z0-9]+$/)
  })

  it('cannot reach the banned word through a category slug', () => {
    for (const fixture of FIXTURES) {
      for (const tag of buildHashtags(fixture.input)) {
        expect(tag.toLowerCase()).not.toContain('cultur')
      }
    }
  })

  it('drops the city tags when there is no city', () => {
    expect(buildHashtags({ ...BASE, city: null })).toEqual(['#whatson'])
  })
})

describe('register selection', () => {
  it('maps the live taxonomy onto the right voice', () => {
    expect(eventFamily('nightlife')).toBe('music')
    expect(eventFamily('food-drink')).toBe('market')
    expect(eventFamily('education')).toBe('workshop')
    expect(eventFamily('charity')).toBe('fundraiser')
    expect(eventFamily('family')).toBe('family')
    expect(eventFamily(null)).toBe('general')
    expect(eventFamily('something-new')).toBe('general')
  })

  it('does not tell a free event to buy a ticket', () => {
    const free = FIXTURES.find(fixture => fixture.name === 'market')!.input
    for (const caption of buildCaptions(free)) {
      expect(caption.text).not.toContain('Free entry. Entry:')
      expect(caption.text).not.toContain('opened ticket sales')
    }
  })

  it('does tell a paid event where the tickets are', () => {
    const captions = buildCaptions(BASE)
    expect(captions.find(c => c.platform === 'instagram')?.text).toContain('Tickets:')
    expect(captions.find(c => c.platform === 'linkedin')?.text).toContain('opened ticket sales')
  })
})
