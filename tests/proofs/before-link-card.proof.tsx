/* eslint-disable @next/next/no-img-element -- satori rasterises this tree
   itself inside an ImageResponse; next/image is a browser-side component and
   has no meaning here. The shipped link card at
   src/app/events/[slug]/opengraph-image.tsx carries the same exemption. */
import { describe, it } from 'vitest'
import { ImageResponse } from 'next/og'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * THE BEFORE.
 *
 * A faithful reproduction of the ONE social artefact the kit shipped before
 * this branch: the 1200 x 630 Open Graph link preview at
 * src/app/events/[slug]/opengraph-image.tsx. The composition, the colours, the
 * type sizes and the system font stack are copied from that file verbatim so
 * the founder is comparing the real thing, not a strawman.
 *
 * It is reproduced rather than imported because the shipped version is a Next
 * metadata route that reads its event straight from Supabase.
 */

const OUT = join(process.cwd(), 'docs', 'design', 'launch-kit-artefacts', 'before')
const HERO = join(process.cwd(), 'public', 'images', 'hero')

const NAVY = '#0A1628'
const GOLD = '#D4A017'
const GOLD_BRIGHT = '#E8B738'

const CASES: { key: string; title: string; meta: string; cover: string | null }[] = [
  {
    key: '01-comedy-night',
    title: 'Sharp Tongue: Geelong Comedy Showcase',
    meta: 'Fri, 18 September 2026  ·  The Piano Bar, Geelong',
    cover: 'comedy.jpg',
  },
  {
    key: '02-club-night',
    title: 'Basement 45: Warehouse Session',
    meta: 'Sat, 26 September 2026  ·  Sub Rosa, Melbourne',
    cover: 'homepage-festival-night.jpg',
  },
  {
    key: '03-market',
    title: 'Pakington Street Makers Market',
    meta: 'Sun, 5 October 2026  ·  Johnstone Park, Geelong',
    cover: 'homepage-day-festival.jpg',
  },
  {
    key: '04-workshop',
    title: 'Screen Printing for Beginners',
    meta: 'Sat, 11 October 2026  ·  Little Creatures Studio, Geelong',
    cover: null,
  },
  {
    key: '05-fundraiser',
    title: 'A Night for the Barwon Boat Shed Appeal',
    meta: 'Thu, 23 October 2026  ·  The Wharf Shed, Geelong',
    cover: 'homepage-rooftop.jpg',
  },
  {
    key: '06-kids-birthday',
    title: 'Ivy Turns Six: Dinosaur Party',
    meta: 'Sun, 2 November 2026  ·  Eastern Gardens Rotunda, Geelong',
    cover: null,
  },
]

describe('the artefact the kit shipped before this branch', () => {
  it('renders the 1200x630 link preview for the same six events', async () => {
    await mkdir(OUT, { recursive: true })

    for (const item of CASES) {
      const cover = item.cover
        ? `data:image/jpeg;base64,${(await readFile(join(HERO, item.cover))).toString('base64')}`
        : null

      const response = new ImageResponse(
        (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              position: 'relative',
              background: NAVY,
              fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
            }}
          >
            {cover ? (
              <img
                src={cover}
                alt=""
                width={1200}
                height={630}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  background: NAVY,
                  backgroundImage: `radial-gradient(ellipse 70% 55% at 100% 0%, ${GOLD_BRIGHT}33 10%, transparent 55%)`,
                }}
              />
            )}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                background:
                  'linear-gradient(to top, rgba(10,22,40,0.92) 0%, rgba(10,22,40,0.72) 30%, rgba(10,22,40,0.25) 62%, rgba(10,22,40,0.10) 100%)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 72,
                right: 72,
                bottom: 64,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  color: GOLD_BRIGHT,
                  fontSize: 24,
                  fontWeight: 700,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                }}
              >
                You are invited
              </div>
              <div
                style={{
                  marginTop: 18,
                  display: 'flex',
                  color: 'white',
                  fontSize: item.title.length > 60 ? 52 : 64,
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.08,
                  maxWidth: 1000,
                }}
              >
                {item.title}
              </div>
              <div
                style={{
                  marginTop: 20,
                  display: 'flex',
                  color: 'rgba(255,255,255,0.88)',
                  fontSize: 28,
                  fontWeight: 500,
                }}
              >
                {item.meta}
              </div>
              <div
                style={{
                  marginTop: 34,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    color: 'white',
                    fontSize: 30,
                    fontWeight: 800,
                    letterSpacing: '-0.01em',
                  }}
                >
                  EVENTLINQS
                  <span style={{ color: GOLD, marginLeft: 2 }}>.</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    color: 'rgba(255,255,255,0.62)',
                    fontSize: 22,
                    fontWeight: 500,
                  }}
                >
                  Tickets at eventlinqs.com
                </div>
              </div>
            </div>
          </div>
        ),
        { width: 1200, height: 630 },
      )

      // JPEG, not the PNG ImageResponse hands back: these are review artefacts
      // committed to the repository, and six full-bleed PNGs are six megabytes.
      const { default: sharp } = await import('sharp')
      const jpeg = await sharp(Buffer.from(await response.arrayBuffer()))
        .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
        .toBuffer()
      await writeFile(join(OUT, `${item.key}-link-card.jpg`), jpeg)
    }
  })
})
