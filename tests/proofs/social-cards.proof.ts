import { describe, it } from 'vitest'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import QRCode from 'qrcode'
import {
  prepareCardCover,
  prepareLogo,
  renderSocialCard,
  type SocialCardInput,
} from '@/lib/broadcast/social-cards'
import { SOCIAL_CARD_ORDER } from '@/lib/broadcast/social-card-spec'
import { buildCaptions, type CaptionInput } from '@/lib/broadcast/captions'

/**
 * Renders the artefact set for six real event shapes so the founder can judge
 * the output rather than read a claim about it. Writes to
 * docs/design/launch-kit-artefacts/.
 *
 *   npx vitest run --config vitest.proof.config.ts
 */

const OUT = join(process.cwd(), 'docs', 'design', 'launch-kit-artefacts')
const HERO = join(process.cwd(), 'public', 'images', 'hero')

type Fixture = {
  key: string
  cover: string | null
  logo?: string | null
  card: Omit<SocialCardInput, 'cover' | 'qr'>
  caption: CaptionInput
}

const SHORT = 'https://www.eventlinqs.com.au/e/'

function fixtures(): Fixture[] {
  return [
    {
      key: '01-comedy-night',
      cover: 'comedy.jpg',
      card: {
        title: 'Sharp Tongue: Geelong Comedy Showcase',
        dateLabel: 'Friday 18 September',
        timeLabel: '8:00 pm',
        placeLabel: 'The Piano Bar, Geelong',
        priceLabel: 'From $28',
        shortUrl: `${SHORT}sharp-tongue-ig`,
        eyebrow: 'Comedy · Geelong',
        organiserName: 'Barwon Comedy Club',
      },
      caption: {
        title: 'Sharp Tongue: Geelong Comedy Showcase',
        summary:
          'Six comics, one room, and a headline set from a name you already know off the telly. Doors at 7:30, first act at 8.',
        dateLabel: 'Friday 18 September',
        timeLabel: '8:00 pm',
        shortDateLabel: 'Fri 18 Sep',
        venueName: 'The Piano Bar',
        city: 'Geelong',
        priceLabel: 'From $28',
        organiserName: 'Barwon Comedy Club',
        categorySlug: 'arts-culture',
        links: { fallback: `${SHORT}sharp-tongue-ig` },
      },
    },
    {
      key: '02-club-night',
      cover: 'homepage-festival-night.jpg',
      card: {
        title: 'Basement 45: Warehouse Session',
        dateLabel: 'Saturday 26 September',
        timeLabel: '10:00 pm',
        placeLabel: 'Sub Rosa, Melbourne',
        priceLabel: 'From $35',
        shortUrl: `${SHORT}basement-45-ig`,
        eyebrow: 'Nightlife · Melbourne',
        organiserName: 'Basement 45',
      },
      caption: {
        title: 'Basement 45: Warehouse Session',
        summary:
          'Four hours of house and breaks across two rooms, with a local B2B opening and a Naarm headliner from midnight.',
        dateLabel: 'Saturday 26 September',
        timeLabel: '10:00 pm',
        shortDateLabel: 'Sat 26 Sep',
        venueName: 'Sub Rosa',
        city: 'Melbourne',
        priceLabel: 'From $35',
        organiserName: 'Basement 45',
        categorySlug: 'nightlife',
        links: { fallback: `${SHORT}basement-45-ig` },
      },
    },
    {
      key: '03-market',
      cover: 'homepage-day-festival.jpg',
      card: {
        title: 'Pakington Street Makers Market',
        dateLabel: 'Sunday 5 October',
        timeLabel: '9:00 am',
        placeLabel: 'Johnstone Park, Geelong',
        priceLabel: 'Free entry',
        shortUrl: `${SHORT}pakington-street-ig`,
        eyebrow: 'Food and drink · Geelong',
        organiserName: 'Pako Traders',
      },
      caption: {
        title: 'Pakington Street Makers Market',
        summary:
          'Sixty stalls of makers, growers and bakers along the park, with coffee from eight and live acoustic sets from ten.',
        dateLabel: 'Sunday 5 October',
        timeLabel: '9:00 am',
        shortDateLabel: 'Sun 5 Oct',
        venueName: 'Johnstone Park',
        city: 'Geelong',
        priceLabel: 'Free entry',
        organiserName: 'Pako Traders',
        categorySlug: 'food-drink',
        links: { fallback: `${SHORT}pakington-street-ig` },
      },
    },
    {
      key: '04-workshop',
      cover: null,
      card: {
        title: 'Screen Printing for Beginners',
        dateLabel: 'Saturday 11 October',
        timeLabel: '10:00 am',
        placeLabel: 'Little Creatures Studio, Geelong',
        priceLabel: 'From $95',
        shortUrl: `${SHORT}screen-printing-for-ig`,
        eyebrow: 'Education · Geelong',
        organiserName: 'Northern Press Studio',
      },
      caption: {
        title: 'Screen Printing for Beginners',
        summary:
          'A three hour session on a real press. You leave with two printed tees and the confidence to book the studio on your own.',
        dateLabel: 'Saturday 11 October',
        timeLabel: '10:00 am',
        shortDateLabel: 'Sat 11 Oct',
        venueName: 'Little Creatures Studio',
        city: 'Geelong',
        priceLabel: 'From $95',
        organiserName: 'Northern Press Studio',
        categorySlug: 'education',
        links: { fallback: `${SHORT}screen-printing-for-ig` },
      },
    },
    {
      key: '05-fundraiser',
      cover: 'homepage-rooftop.jpg',
      card: {
        title: 'A Night for the Barwon Boat Shed Appeal',
        dateLabel: 'Thursday 23 October',
        timeLabel: '6:30 pm',
        placeLabel: 'The Wharf Shed, Geelong',
        priceLabel: 'From $65',
        shortUrl: `${SHORT}a-night-for-the-ig`,
        eyebrow: 'Charity · Geelong',
        organiserName: 'Friends of the Barwon',
      },
      caption: {
        title: 'A Night for the Barwon Boat Shed Appeal',
        summary:
          'Dinner on the water, a silent auction, and a short talk from the crew rebuilding the shed. Every ticket goes to the rebuild.',
        dateLabel: 'Thursday 23 October',
        timeLabel: '6:30 pm',
        shortDateLabel: 'Thu 23 Oct',
        venueName: 'The Wharf Shed',
        city: 'Geelong',
        priceLabel: 'From $65',
        organiserName: 'Friends of the Barwon',
        categorySlug: 'charity',
        links: { fallback: `${SHORT}a-night-for-the-ig` },
      },
    },
    {
      key: '06-kids-birthday',
      cover: null,
      card: {
        title: 'Ivy Turns Six: Dinosaur Party',
        dateLabel: 'Sunday 2 November',
        timeLabel: '10:30 am',
        placeLabel: 'Eastern Gardens Rotunda, Geelong',
        priceLabel: 'Free entry',
        shortUrl: `${SHORT}ivy-turns-six-ig`,
        eyebrow: 'Family · Geelong',
        organiserName: 'The Whitfield Family',
      },
      caption: {
        title: 'Ivy Turns Six: Dinosaur Party',
        summary:
          'Fossil dig in the sandpit, a dinosaur cake at half eleven, and a picnic after. Please let us know numbers so we can cut enough cake.',
        dateLabel: 'Sunday 2 November',
        timeLabel: '10:30 am',
        shortDateLabel: 'Sun 2 Nov',
        venueName: 'Eastern Gardens Rotunda',
        city: 'Geelong',
        priceLabel: 'Free entry',
        organiserName: 'The Whitfield Family',
        categorySlug: 'family',
        links: { fallback: `${SHORT}ivy-turns-six-ig` },
      },
    },
  ]
}

describe('launch kit artefact proofs', () => {
  it('renders the card set and the captions for six event shapes', async () => {
    await mkdir(OUT, { recursive: true })
    const captionLog: string[] = []

    for (const fixture of fixtures()) {
      const raw = fixture.cover ? new Uint8Array(await readFile(join(HERO, fixture.cover))) : null
      const logo = fixture.logo
        ? await prepareLogo(new Uint8Array(await readFile(fixture.logo)))
        : null

      for (const format of SOCIAL_CARD_ORDER) {
        const cover = raw ? await prepareCardCover(raw, format) : null
        const qr = await QRCode.toDataURL(fixture.card.shortUrl, {
          errorCorrectionLevel: 'M',
          margin: 0,
          width: 420,
          color: { dark: '#0A1628', light: '#FFFFFF' },
        })
        const bytes = await renderSocialCard(format, {
          ...fixture.card,
          summary: fixture.caption.summary,
          organiserLogo: logo,
          cover,
          qr,
        })
        const file = join(OUT, `${fixture.key}-${format}.jpg`)
        await writeFile(file, bytes)
        captionLog.push(`${fixture.key} ${format}: ${Math.round(bytes.byteLength / 1024)} KB`)
      }

      const captions = buildCaptions(fixture.caption)
      captionLog.push('')
      captionLog.push(`### ${fixture.key}`)
      for (const caption of captions) {
        captionLog.push('')
        captionLog.push(`--- ${caption.label} (${caption.characters} characters) ---`)
        if (caption.subject) captionLog.push(`Subject: ${caption.subject}`)
        captionLog.push(caption.text)
      }
      captionLog.push('')
    }

    await writeFile(join(OUT, 'captions.txt'), captionLog.join('\n'), 'utf8')
  })
})
