import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * A LONG SELLER'S NAME WRAPS, NEVER CLIPPED (the CONTROLLER's look at the preview, 22:39 on 1 November 2026: Macbeth's
 * price column read 'Tickets on geelongartscentre' cut off at the right edge). The domain is one word that cannot break
 * at a space, so every place a price or ticket source is printed allows a break anywhere. jsdom cannot measure layout;
 * the proof on the page is the preview's screens at 320 and 390 and the sweep's sideways check. This pins the rule.
 */
describe('a price or ticket source is never clipped', () => {
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
  const guide = readFileSync(join(process.cwd(), 'src/components/features/city-guide/city-guide.tsx'), 'utf8')
  const rule = (name: string) => css.slice(css.indexOf(`@utility ${name} {`), css.indexOf('}', css.indexOf(`@utility ${name} {`)))

  it('the card price, the row price and the row source break anywhere and never refuse to wrap', () => {
    for (const name of ['ledger-price', 'event-row-price', 'event-row-source']) {
      expect(rule(name)).toContain('[overflow-wrap:anywhere]')
      expect(rule(name)).not.toContain('whitespace-nowrap')
    }
  })

  it('the city guide row’s price column breaks anywhere and holds a width at every size', () => {
    const line = guide.split('\n').find((l) => l.includes('{r.price}</span>')) ?? ''
    expect(line).toContain('[overflow-wrap:anywhere]')
    expect(line).not.toContain('whitespace-nowrap')
    expect(line).toMatch(/max-w-28/)
  })
})
