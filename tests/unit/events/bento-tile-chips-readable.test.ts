import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

/**
 * The phone test on live, 31 October 2026 (WINDOW 5's 05:05, C:\dev\EVIDENCE\PHONE-TEST-31OCT\): the category chips on
 * the event tiles of /events, /this-weekend, /free/<city>/this-week and /events/browse/<city> measured 10px, under the
 * 12px floor that test holds every phone text to. Every chip on the tile is set at text-xs (12px) or larger.
 */
describe('the event tile chips are readable on a phone', () => {
  test('no chip on the event tile is set below 12px', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/features/events/event-bento-tile.tsx'), 'utf8')
    expect(src.match(/text-\[(?:[0-9]|1[01])px\]/g) ?? []).toEqual([])
  })
})
