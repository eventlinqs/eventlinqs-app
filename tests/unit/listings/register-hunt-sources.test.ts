import { describe, expect, it } from 'vitest'
// A plain .mjs ops script, imported the way the suite imports others.
import { starDisallows, starGroup } from '../../../scripts/ops/register-hunt-sources.mjs'

/* Car 44: a hunt source is registered only on its robots.txt read today, its lines for every agent quoted. */
describe("the hunt register's robots reading", () => {
  const mop = 'User-agent: *\nAllow: /\nDisallow: /*?\n\nUser-agent: BadBot\nDisallow: /'
  it('quotes the group for every agent and no other', () => {
    expect(starGroup(mop)).toBe('User-agent: * / Allow: / / Disallow: /*?')
  })
  it('lets the list page be read and refuses a page every agent is barred from', () => {
    expect(starDisallows(mop, '/events/')).toBe(false)
    expect(starDisallows('User-agent: *\nDisallow: /events', '/events/')).toBe(true)
    expect(starDisallows('User-agent: *\ndisallow: /kirby/\nallow: /media/', '/events')).toBe(false)
  })
})
