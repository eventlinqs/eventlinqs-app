import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NEWEST_EVENT_SELECT } from '@/lib/organisers/newest-published-event'

/**
 * THE /organisers PROOF BLOCK SHOWS ONLY A NIGHT THAT SELLS HERE. It is headed 'Live now, real event, real sales' and
 * says 'This is on sale right now, on the platform you are reading about'. On live, 1 November 2026 at 390
 * (C:\dev\EVIDENCE\VISUAL-QA-31OCT\run-06h05\sheets\organisers.png), it showed 'Saturday Live Music at Hop Temple', a
 * free walk-in night, while production held 0 upcoming nights selling through EventLinqs. A walk-in night or one
 * ticketed elsewhere is not a sale here (revenue truth: an outside ticket click is not a sale), so the block reads
 * only nights with EventLinqs ticket tiers, no outside ticket link and the tickets entry mode. With none, it renders
 * nothing, which the block already does for an empty catalogue.
 */

const source = readFileSync(join(process.cwd(), 'src/lib/organisers/newest-published-event.ts'), 'utf8').replace(/\r\n/g, '\n')

describe('the live proof block on /organisers', () => {
  test('reads only nights that sell through EventLinqs', () => {
    expect(NEWEST_EVENT_SELECT).toContain('ticket_tiers!inner(')
    expect(source).toMatch(/\.is\('external_ticket_url', null\)/)
    expect(source).toMatch(/\.eq\('entry_mode', 'tickets'\)/)
  })
})
