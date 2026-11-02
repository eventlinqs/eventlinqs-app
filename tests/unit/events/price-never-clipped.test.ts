import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * A LONG SELLER'S NAME WRAPS, NEVER CLIPPED (the CONTROLLER's look at the preview, 22:39 on 1 November 2026: Macbeth's
 * price column read 'Tickets on geelongartscentre' cut off at the right edge), and ON A PHONE THE PRICE OR SOURCE SITS ON
 * ITS OWN LINE UNDER THE VENUE (the Geelong reference directive of 2 November 2026, section C). jsdom cannot measure
 * layout; the proof on the page is the screens at 320 and 390 and the sideways check. This pins the rules.
 */
describe('a price or ticket source is never clipped', () => {
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
  const guide = readFileSync(join(process.cwd(), 'src/components/features/city-guide/city-guide.tsx'), 'utf8')
  const rule = (name: string) => css.slice(css.indexOf(`@utility ${name} {`), css.indexOf('}', css.indexOf(`@utility ${name} {`)))
  const lineWith = (needle: string) => guide.split('\n').find((l) => l.includes(needle)) ?? ''

  it('the card price, the row price and the row source break anywhere and never refuse to wrap', () => {
    for (const name of ['ledger-price', 'event-row-price', 'event-row-source']) {
      expect(rule(name)).toContain('[overflow-wrap:anywhere]')
      expect(rule(name)).not.toContain('whitespace-nowrap')
    }
  })

  it('the guide row’s price and booking words break anywhere; on a phone the booking sits on its own line', () => {
    // Since 2 November 09:00 (refinement 4) the price is said once, in the row's one meta line.
    expect(lineWith('text-xs font-semibold text-[var(--text-muted)]')).toContain('[overflow-wrap:anywhere]')
    expect(lineWith('inline-flex items-start gap-1')).toContain('[overflow-wrap:anywhere]')
    // Round 3 (Lawal 17:00): the booking sits on its own line under the row at every width, said once.
    expect(guide).toContain('mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">{booking}</span>')
    expect(guide.split('>{booking}</span>').length - 1).toBe(1)
  })

  it('a venue name wraps, never cut with an ellipsis (the directive, C)', () => {
    const venue = lineWith('text-sm font-medium text-[var(--text-secondary)]')
    expect(venue).toContain('[overflow-wrap:anywhere]')
    expect(venue).not.toContain('truncate')
  })
})
