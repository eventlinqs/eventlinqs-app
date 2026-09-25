import { afterEach, describe, expect, it } from 'vitest'
import { AUDIT_FLAG, isAuditRun } from '@/lib/ui/audit-mode'

/**
 * THE AUDIT PREDICATE READS THE ELEMENT THE FLAG IS WRITTEN TO.
 *
 * `src/app/layout.tsx` sets the flag on `documentElement` in a
 * `beforeInteractive` script and says so in its own comment. Six client
 * components read it off `document.body`, which never carries it, so the Google
 * map, the venue map, the event video, the hero carousel's rotation, its
 * enhancer and the hero's ken-burns layer all mounted inside every Lighthouse
 * run this platform has taken. It was found by counting optimiser requests in a
 * real browser with the audit cookie set: two per event page, the second being
 * the ken-burns copy of the hero photograph.
 *
 * `scripts/guards/audit-flag-is-read-where-it-is-written.mjs` is what stops a
 * component reading the dataset itself again. THIS is the other half, and it is
 * the half a static guard cannot do: it asserts the predicate's ANSWER, with the
 * flag on each element in turn, so a future edit that flips the element fails on
 * behaviour rather than on a pattern.
 *
 * Both cases are asserted, and the negative one is the point. A test that only
 * set documentElement would pass against a predicate that read either.
 */
afterEach(() => {
  delete document.documentElement.dataset[AUDIT_FLAG]
  delete document.body.dataset[AUDIT_FLAG]
})

describe('isAuditRun', () => {
  it('is false on an ordinary page', () => {
    expect(isAuditRun()).toBe(false)
  })

  it('is true when the flag is on documentElement, which is where the layout writes it', () => {
    document.documentElement.dataset[AUDIT_FLAG] = '1'
    expect(isAuditRun()).toBe(true)
  })

  it('is FALSE when the flag is only on body, which is the defect this replaced', () => {
    document.body.dataset[AUDIT_FLAG] = '1'
    expect(isAuditRun()).toBe(false)
  })

  it('names the key the layout writes and globals.css selects on', () => {
    // html[data-headless="1"] appears in src/app/globals.css and in the
    // beforeInteractive script; a rename that misses either is a dead flag.
    expect(AUDIT_FLAG).toBe('headless')
  })
})
