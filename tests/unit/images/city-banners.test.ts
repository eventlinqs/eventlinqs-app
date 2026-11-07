import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getCityBanner } from '@/lib/images/city-photo'

/*
 * THE CITY BANNERS (Lawal, 3 November 2026, 01:44; the CONTROLLER's picks at 02:20 and 02:53, the focal points at 04:29):
 * Geelong's Eastern Beach, Ballarat's Robert Clark Conservatory and a Bendigo heritage tram, each a CC BY-SA 4.0
 * photograph from Wikimedia Commons. The licence asks for the author, the source and the licence wherever it is shown,
 * so the file, its record and its credit travel together: a banner without its record or its credit fails here.
 */
const root = process.cwd()
const attribution = JSON.parse(readFileSync(join(root, 'public/images/library/attribution.json'), 'utf8')).photos as Record<
  string,
  { photographer?: string; page?: string; licence?: string; file?: string }
>
const screen = readFileSync(join(root, 'src/components/features/city-guide/city-guide-screen.tsx'), 'utf8').replace(/\r\n/g, '\n')

describe('the city banners', () => {
  it('Geelong, Ballarat, Bendigo and Canberra have one; Melbourne keeps its own photograph', () => {
    for (const slug of ['geelong', 'ballarat', 'bendigo', 'canberra']) expect(getCityBanner(slug), slug).not.toBeNull()
    expect(getCityBanner('melbourne')).toBeNull()
  })

  it('every banner file exists, with its page and licence on record; a CC BY-SA photo carries its author, public domain none', () => {
    for (const slug of ['geelong', 'ballarat', 'bendigo', 'canberra']) {
      const b = getCityBanner(slug)!
      expect(existsSync(join(root, 'public', b.src)), b.src).toBe(true)
      const rec = attribution[`city-banner-${slug}`]
      expect(rec?.file).toBe(b.src)
      expect(rec?.page).toBe(b.page)
      expect(b.page).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
      expect(rec?.licence).toContain(b.licence)
      expect(b.position).toMatch(/^\d+% \d+%$/)
      if (b.licence === 'CC BY-SA 4.0') {
        expect(b.credit?.author).toBe(rec?.photographer)
        expect(b.credit?.licenceUrl).toBe('https://creativecommons.org/licenses/by-sa/4.0/')
      } else if (b.licence === 'CC0 1.0') {
        // Lawal's 07:05 of 8 November: a licensed banner "with its credit", so CC0 is credited though it asks for none.
        expect(b.credit?.author).toBe(rec?.photographer)
        expect(b.credit?.licenceUrl).toBe('https://creativecommons.org/publicdomain/zero/1.0/')
      } else {
        expect(b.credit).toBeNull()
      }
    }
    // The CONTROLLER's 07:12: Bendigo is A, central Bendigo from the Botanic Gardens, public domain.
    expect(getCityBanner('bendigo')?.licence).toBe('Public domain')
    expect(getCityBanner('bendigo')?.page).toContain('Central_bendigo_from_botanic_gardens')
  })

  it('the guide draws the banner first, at its focal point, its credit only where the licence asks, on the text-side wash', () => {
    expect(screen).toMatch(/const photo = banner\?\.src \?\? heroImage/)
    expect(screen).toMatch(/objectPosition=\{banner\?\.position \?\? '50% 45%'\}/)
    expect(screen).toMatch(/\{banner\?\.credit \? \(/)
    expect(screen).toMatch(/data-banner-credit/)
    expect(screen).toMatch(/href=\{banner\.page\}/)
    expect(screen).toMatch(/href=\{banner\.credit\.licenceUrl\} rel="license noopener"/)
    expect(screen).toMatch(/<HeroCaption wash="text-side" className="max-w-xl">/)
    // No band-wide gradient of its own: the caption's wash is the only one (hero-text-over-a-photograph clause 1).
    expect(screen).not.toMatch(/bg-gradient-to-t/)
  })
})
