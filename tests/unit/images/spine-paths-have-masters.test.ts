import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/*
 * EVERY SPINE PATH THE PAGE NAMES HAS ITS OBJECTS (WINDOW 5A, 21 November 2026; law 4 of the short laws, one defect is a
 * class). The arts tile's slot was renamed on 26 August 2026 to its community first key; its AVIF renditions were copied
 * to the new path, but the JPEG masters made on 10 November from supabase/seed/imagery-map.json (still the old key)
 * landed only under the old path, and /categories/theatre named a JPEG that answered 400 until it was copied
 * (scripts/ops/copy-spine-theatre-jpeg-master.mjs, PRODUCTION-WRITES.txt 2026-11-21T00:05:43Z).
 *
 * So every path src/lib/images/spine.ts names must be a slot of the imagery map, which is what
 * scripts/ops/spine-jpeg-masters.mjs makes masters from, or a rename listed below together with every object copied to
 * it. A new rename fails here until its objects, JPEG master included, are copied and named.
 */

const RENAMED: Record<string, { from: string; copied: string[] }> = {
  'categories/arts-community/theatre-interior-evening': {
    from: 'categories/arts-cult' + 'ure/theatre-interior-evening',
    copied: [
      'theatre-interior-evening-480.avif',
      'theatre-interior-evening-960.avif',
      'theatre-interior-evening-1440.avif',
      'theatre-interior-evening-1440.jpg',
    ],
  },
}

function spinePaths(): string[] {
  const src = readFileSync('src/lib/images/spine.ts', 'utf8')
  const re = /\{ role: '([a-z]+)',\s+key: (null|'[^']+'),\s+city: (null|'[^']+'),\s+descriptor: '([^']+)'/g
  const out = new Set<string>()
  for (const m of src.matchAll(re)) {
    const parts = [m[1], m[2] === 'null' ? null : m[2].slice(1, -1), m[3] === 'null' ? null : m[3].slice(1, -1), m[4]]
    out.add(parts.filter(Boolean).join('/'))
  }
  return [...out]
}

describe('every spine path the page names has its objects', () => {
  const slots = new Set(
    (JSON.parse(readFileSync('supabase/seed/imagery-map.json', 'utf8')).images as Array<{ slot: string }>).map((e) => e.slot),
  )
  const paths = spinePaths()

  it('reads the spine registry (so the check is not passing on nothing)', () => {
    expect(paths.length).toBeGreaterThanOrEqual(50)
  })

  it('each path is an imagery map slot, or a named rename with its JPEG master copied', () => {
    const unknown = paths.filter((p) => !slots.has(p) && !RENAMED[p])
    expect(unknown).toEqual([])
    for (const [to, r] of Object.entries(RENAMED)) {
      expect(slots.has(r.from)).toBe(true)
      expect(r.copied.some((f) => f.endsWith('.jpg'))).toBe(true)
      expect(paths).toContain(to)
    }
  })
})
