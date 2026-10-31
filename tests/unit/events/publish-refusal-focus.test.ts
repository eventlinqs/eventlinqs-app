import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

/**
 * A REFUSED PUBLISH IS SEEN WHERE IT IS SAID (the CONTROLLER's 12:58 of 31 October 2026, on WINDOW 5's organiser drive:
 * after Publish was refused the page's focus went to its top, the 'Skip to main content' link showed, and the refusal
 * sat half under the sticky header). The refusal takes the focus itself, scrolled into view clear of the sticky header,
 * and a screen reader hears it (role alert). Read from the source, as the form's other contracts are.
 */
const SRC = readFileSync('src/components/features/events/event-form.tsx', 'utf8')

describe('the refused publish', () => {
  test('its box can take the focus, says itself to a screen reader, and stops clear of the sticky header', () => {
    expect(SRC).toMatch(/<div\s+ref=\{refusalRef\}\s+tabIndex=\{-1\}\s+role="alert"[^>]*scroll-mt-24/)
  })

  test('when a refusal appears, the focus goes to it and it is scrolled into view, never to the top of the page', () => {
    expect(SRC).toMatch(/const refusalRef = useRef<HTMLDivElement>\(null\)/)
    const effect = SRC.slice(SRC.indexOf('// A refused publish is seen where it is said'))
    expect(effect).toMatch(/refusalRef\.current\.focus\(\{ preventScroll: true \}\)/)
    expect(effect).toMatch(/refusalRef\.current\.scrollIntoView\(\{ block: 'start'/)
    expect(effect.slice(0, 600)).toMatch(/\[error\]\)/)
  })
})
