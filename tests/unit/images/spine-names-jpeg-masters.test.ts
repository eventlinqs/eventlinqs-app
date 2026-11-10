/**
 * EVERY SPINE PHOTOGRAPH IS NAMED BY ITS JPEG MASTER, NEVER AN AVIF (WINDOW 5A, 10 November 2026; Lawal's law of
 * 13:30: every page's main content in one second on a phone).
 *
 * Vercel's optimiser serves an AVIF source byte for byte whatever width a page asks (Melbourne's hero: 200,228 bytes at
 * w=640 and at w=828, the source's own size), and sizes a JPEG source per request (the same hero from its JPEG master:
 * 29,460 bytes at w=640). A slot that named an AVIF again would hand every phone the 1,200 to 1,920 pixel original as
 * its LCP image. The masters are made and read back by scripts/ops/spine-jpeg-masters.mjs.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/env', () => ({ getSupabaseUrl: () => 'https://example-ref.supabase.co' }))

import { getSpineCity, getSpineScene, getSpineHero, getSpineCategoryHero } from '@/lib/images/spine'

const map = JSON.parse(readFileSync(join(process.cwd(), 'supabase', 'seed', 'imagery-map.json'), 'utf8')) as {
  images: { role: string; slot: string; sizes: { width: number }[] }[]
}

describe('the spine names JPEG masters', () => {
  it("Melbourne's guide hero names the 1,200 pixel JPEG master", () => {
    expect(getSpineCity('melbourne')?.src).toBe(
      'https://example-ref.supabase.co/storage/v1/object/public/event-images/stock/cities/melbourne/skyline-sunrise-1200.jpg',
    )
  })

  it('no spine source in the module is built as an AVIF', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'lib', 'images', 'spine.ts'), 'utf8')
    expect(src).toMatch(/return `\$\{base\}\/\$\{path\}-\$\{width\}\.jpg`/)
    expect(src).not.toMatch(/return `\$\{base\}\/\$\{path\}-\$\{width\}\.avif`/)
  })

  it('every slot the module resolves names a .jpg at a width its AVIF renditions were made at', () => {
    const urls = [getSpineCity('melbourne'), getSpineCity('geelong'), getSpineScene('latin'), getSpineHero('home' as never), getSpineCategoryHero('music')]
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .map((x) => x.src)
    expect(urls.length).toBeGreaterThan(0)
    for (const url of urls) {
      expect(url.endsWith('.jpg')).toBe(true)
      const m = url.match(/\/stock\/(.+)-(\d+)\.jpg$/)
      expect(m).not.toBeNull()
      const entry = map.images.find((e) => e.slot === m![1])
      expect(entry, `${m![1]} is in imagery-map.json`).toBeDefined()
      expect(entry!.sizes.map((s) => s.width)).toContain(Number(m![2]))
    }
  })
})
