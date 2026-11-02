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
  it('Geelong, Ballarat and Bendigo have one; Melbourne keeps its own photograph', () => {
    for (const slug of ['geelong', 'ballarat', 'bendigo']) expect(getCityBanner(slug), slug).not.toBeNull()
    expect(getCityBanner('melbourne')).toBeNull()
  })

  it('every banner file exists, with its author, page and licence on record matching the credit the page draws', () => {
    for (const slug of ['geelong', 'ballarat', 'bendigo']) {
      const b = getCityBanner(slug)!
      expect(existsSync(join(root, 'public', b.src)), b.src).toBe(true)
      const rec = attribution[`city-banner-${slug}`]
      expect(rec?.file).toBe(b.src)
      expect(rec?.photographer).toBe(b.author)
      expect(rec?.page).toBe(b.page)
      expect(rec?.licence).toContain('CC BY-SA 4.0')
      expect(b.page).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
      expect(b.licenceUrl).toBe('https://creativecommons.org/licenses/by-sa/4.0/')
      expect(b.position).toMatch(/^\d+% \d+%$/)
    }
  })

  it('the guide draws the banner first, at its focal point, and its credit with links to the source and the licence', () => {
    expect(screen).toMatch(/const photo = banner\?\.src \?\? heroImage/)
    expect(screen).toMatch(/objectPosition=\{banner\?\.position \?\? '50% 45%'\}/)
    expect(screen).toMatch(/data-banner-credit/)
    expect(screen).toMatch(/href=\{banner\.page\}/)
    expect(screen).toMatch(/href=\{banner\.licenceUrl\} rel="license noopener"/)
  })
})
