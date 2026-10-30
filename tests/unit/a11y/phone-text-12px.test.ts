// The phone test on live (window 5, 31 October 2026, 05:05; the controller's 05:32 (4) gave them to window 6): text
// under 12px on a phone. Each line below rendered at 11px at 360 to 430 wide: the Founding Organiser badge on event and
// organiser pages, the event count or 'Be the first' under each tile on /cities and /communities, the 'this weekend'
// and count lines in a city page's sticky bar, and the caption under each guide screenshot. 12px is the floor window 3
// set for the card chips the same morning. Pinned by reading each source: none may set 10px or 11px text.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

const SOURCES = [
  'src/components/features/organisers/founding-organiser-badge.tsx',
  'src/app/cities/page.tsx',
  'src/app/communities/page.tsx',
  'src/components/features/city/mobile-sticky-bar.tsx',
  'src/components/guides/guide-body.tsx',
  'src/app/guides/[slug]/page.tsx',
]

describe('no text under 12px where the phone test found it', () => {
  test.each(SOURCES)('%s sets no 10px or 11px text', (source) => {
    const text = readFileSync(resolve(process.cwd(), source), 'utf8')
    expect(text).not.toMatch(/text-\[1[01]px\]/)
  })
})
