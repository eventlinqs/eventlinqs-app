import { describe, expect, it } from 'vitest'
import { recheckRefusal, recheckUnticked, type RecheckStore, type UntickedContact } from '@/lib/outreach/engine-recheck'

/*
 * THE ENGINE READS AGAIN WHAT IT HAS NOT CLEARED (the PM's 15:48 of 22 November 2026, F5 (d)): a contact recorded before
 * the pool's own check is ticked by the engine on the next turn with its page saved; a page with a statement against
 * messages is refused with that statement quoted; robots.txt is honoured; a Gmail address an organiser publishes is kept
 * (Lawal's directive, section 4); one contact's failed read never stops the next. Stand-in store and fetcher, real rules.
 */

const contact = (over: Partial<UntickedContact> = {}): UntickedContact => ({
  contactId: 'c-before-op',
  organiserId: 'o1',
  website: 'https://www.thevenue.com.au',
  address: 'bookings@thevenue.com.au',
  pageUrl: 'https://www.thevenue.com.au/contact',
  inGuideCity: true,
  ...over,
})

function fakeStore(rows: UntickedContact[]) {
  const checked: { address: string; pageHtml: string; kind: string; quote: string }[] = []
  const notes: { contactId: string; note: string; day: string }[] = []
  const store: RecheckStore = {
    unticked: async () => rows,
    check: async (r) => (checked.push({ address: r.address, pageHtml: r.pageHtml, kind: r.kind, quote: r.quote }), 'checked'),
    note: async (contactId, note, day) => {
      notes.push({ contactId, note, day })
    },
  }
  return { store, checked, notes }
}

type Pages = Record<string, { status: number; body: string } | Error>
const fetcherOf = (pages: Pages) =>
  (async (url: string) => {
    const p = pages[url] ?? { status: 404, body: '' }
    if (p instanceof Error) throw p
    return { status: p.status, text: async () => p.body } as Response
  }) as never

const ALLOW = { status: 200, body: 'User-agent: *\nAllow: /' }
const NOW = new Date('2026-11-22T12:45:00Z') // Sunday 22 November, 23:45 in Melbourne
const far = () => Date.now() + 60_000

describe('the engine clears an address recorded before its own check', () => {
  it('reads the page again, saves it through engineCheck and records that it cleared it', async () => {
    const { store, checked, notes } = fakeStore([contact()])
    const page = '<html><body><h1>Contact</h1><p>Venue hire and event bookings: bookings@thevenue.com.au</p></body></html>'
    const out = await recheckUnticked(store, fetcherOf({ 'https://www.thevenue.com.au/robots.txt': ALLOW, 'https://www.thevenue.com.au/contact': { status: 200, body: page } }), NOW, far(), { pauseMs: 0 })
    expect(out).toEqual([{ contactId: 'c-before-op', address: 'bookings@thevenue.com.au', outcome: 'checked' }])
    expect(checked).toHaveLength(1)
    expect(checked[0]).toMatchObject({ address: 'bookings@thevenue.com.au', pageHtml: page, kind: 'own domain' })
    expect(checked[0].quote).toContain('bookings@thevenue.com.au')
    expect(notes).toEqual([{ contactId: 'c-before-op', note: 'cleared by the engine: its page saved with its sha256', day: '2026-11-22' }])
  })

  it('a Gmail address the organiser publishes on its own site is kept and cleared, never rejected for its domain', async () => {
    const gmail = contact({ contactId: 'c-gmail', address: 'thevenuebookings@gmail.com' })
    const { store, checked } = fakeStore([gmail])
    const page = '<p>For bookings email thevenuebookings@gmail.com</p>'
    const out = await recheckUnticked(store, fetcherOf({ 'https://www.thevenue.com.au/robots.txt': ALLOW, 'https://www.thevenue.com.au/contact': { status: 200, body: page } }), NOW, far(), { pauseMs: 0 })
    expect(out[0].outcome).toBe('checked')
    expect(checked[0].kind).toBe('free mail')
  })
})

describe('the engine refuses what it cannot clear, with the exact reason, and reads it again next turn', () => {
  it('a statement against messages is quoted as it reads, and nothing is ticked', async () => {
    const { store, checked, notes } = fakeStore([contact()])
    const page = '<p>Bookings: bookings@thevenue.com.au. Please do not send marketing emails to this address.</p>'
    const out = await recheckUnticked(store, fetcherOf({ 'https://www.thevenue.com.au/robots.txt': ALLOW, 'https://www.thevenue.com.au/contact': { status: 200, body: page } }), NOW, far(), { pauseMs: 0 })
    expect(out[0].outcome).toBe('a statement against messages on its page: "do not send marketing"')
    expect(checked).toEqual([])
    expect(notes[0].note).toBe('a statement against messages on its page: "do not send marketing"')
  })

  it("robots.txt that disallows the page is honoured: the page is never read", async () => {
    const { store, checked } = fakeStore([contact()])
    const out = await recheckUnticked(store, fetcherOf({ 'https://www.thevenue.com.au/robots.txt': { status: 200, body: 'User-agent: *\nDisallow: /contact' } }), NOW, far(), { pauseMs: 0 })
    expect(out[0].outcome).toBe('its robots.txt does not allow the page to be read')
    expect(checked).toEqual([])
  })

  it("an address at another organisation's domain, a page that no longer publishes it, and no guide city are each said", () => {
    const html = '<p>info@someoneelse.com.au</p>'
    expect(recheckRefusal(contact({ address: 'info@someoneelse.com.au' }), html)).toBe("another organisation's domain (someoneelse.com.au), not theirs")
    expect(recheckRefusal(contact(), html)).toBe('its page no longer publishes the address')
    expect(recheckRefusal(contact({ inGuideCity: false }), '<p>bookings@thevenue.com.au</p>')).toBe('no road places the organiser in a guide city yet')
  })

  it("one contact's failed read is its own outcome, and the next contact is still cleared", async () => {
    const second = contact({ contactId: 'c-two', website: 'https://www.other.com.au', address: 'hello@other.com.au', pageUrl: 'https://www.other.com.au/about' })
    const { store, checked } = fakeStore([contact(), second])
    const out = await recheckUnticked(
      store,
      fetcherOf({
        'https://www.thevenue.com.au/robots.txt': ALLOW,
        'https://www.thevenue.com.au/contact': new Error('socket hang up'),
        'https://www.other.com.au/robots.txt': ALLOW,
        'https://www.other.com.au/about': { status: 200, body: '<p>Say hello: hello@other.com.au</p>' },
      }),
      NOW,
      far(),
      { pauseMs: 0 },
    )
    expect(out.map((o) => [o.contactId, o.outcome])).toEqual([
      ['c-before-op', 'the page answered nothing'],
      ['c-two', 'checked'],
    ])
    expect(checked.map((c) => c.address)).toEqual(['hello@other.com.au'])
  })
})
