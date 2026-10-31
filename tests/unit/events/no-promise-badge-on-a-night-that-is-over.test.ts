import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * NO SALES BADGE ON A NIGHT THAT IS OVER. On live at 390, 1 November 2026, a cancelled night's page said 'This event
 * has been cancelled' above a 'Just Listed' badge (C:\dev\EVIDENCE\JOURNEYS-1NOV\run-03h29\J9-payment-verification-
 * test-x12-.png). The page already decides once whether the night is over (ended, archived or cancelled:
 * nightIsOver); the badge row, with its 'N people going' pill, is drawn only when it is not.
 */

const page = readFileSync(join(process.cwd(), 'src/app/events/[slug]/page.tsx'), 'utf8').replace(/\r\n/g, '\n')

describe('the event page badge row', () => {
  test('is drawn only for a night that is not over', () => {
    expect(page).toMatch(/\{availabilityAndAccessOn && eventInventory && !nightIsOver && \(\s*<div[^>]*>\s*<SocialProofBadge/)
  })

  test('nightIsOver covers ended, archived and cancelled', () => {
    expect(page).toMatch(/const nightIsOver = eventBannerState === 'past' \|\| eventBannerState === 'archived' \|\| eventBannerState === 'cancelled'/)
  })
})
