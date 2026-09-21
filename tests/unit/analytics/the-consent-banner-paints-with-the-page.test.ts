import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { stripNonCode } from '../../../scripts/guards/lib/source.mjs'
import {
  CONSENT_ASK_ATTRIBUTE,
  CONSENT_ASK_FLAG_SCRIPT,
  CONSENT_ASK_VALUE,
  CONSENT_BANNER_HEIGHT_VAR,
  CONSENT_INTENT_ACCEPT,
  CONSENT_INTENT_ATTRIBUTE,
  CONSENT_INTENT_REFUSE,
  CONSENT_INTENT_WINDOW_KEY,
  CONSENT_SHELL_BOOTSTRAP_SCRIPT,
  CONSENT_SHELL_ID,
} from '@/lib/analytics/consent-first-paint'
import {
  CONSENT_COOKIE,
  CONSENT_VERSION,
  allGranted,
  allRefused,
  decodeConsent,
  encodeConsent,
  hasDecided,
  NO_CONSENT,
} from '@/lib/analytics/consent'

/**
 * THE BANNER PAINTS WITH THE PAGE, AND THE SCRIPT THAT DECIDES SO AGREES WITH
 * THE MODULE THAT DECIDES EVERYTHING ELSE.
 *
 * The consent strip is server rendered and hidden by default; a pre-paint
 * inline script reveals it for a visitor who has not answered. That script is a
 * SECOND READER of the consent cookie, and `consent-provider.tsx` warns in
 * terms about what two readers of one cookie costs. The answer to that warning
 * is this file: the script is executed here, against the same table of stored
 * values the real decoder is given, and any disagreement fails the build.
 *
 * The scripts are strings, so they are run rather than described. A fake
 * document is enough because the whole surface each one touches is a handful of
 * methods, and faking them exactly is what makes the check exhaustive.
 */

interface FakeRoot {
  attributes: Map<string, string>
  properties: Map<string, string>
}

function fakeDocument(cookie: string | (() => never), element: unknown = null) {
  const attributes = new Map<string, string>()
  const properties = new Map<string, string>()
  const documentElement = {
    setAttribute: (name: string, value: string) => attributes.set(name, value),
    getAttribute: (name: string) => attributes.get(name) ?? null,
    removeAttribute: (name: string) => void attributes.delete(name),
    style: {
      setProperty: (name: string, value: string) => properties.set(name, value),
      removeProperty: (name: string) => void properties.delete(name),
    },
  }
  const document = {
    documentElement,
    getElementById: (id: string) => (id === CONSENT_SHELL_ID ? element : null),
  }
  Object.defineProperty(document, 'cookie', typeof cookie === 'function' ? { get: cookie } : { value: cookie })
  return { document, root: { attributes, properties } satisfies FakeRoot }
}

/** Runs the pre-paint flag and answers whether it decided to ask. */
function asksFor(cookie: string | (() => never)): boolean {
  const { document, root } = fakeDocument(cookie)
  new Function('document', CONSENT_ASK_FLAG_SCRIPT)(document)
  return root.attributes.get(CONSENT_ASK_ATTRIBUTE) === CONSENT_ASK_VALUE
}

const stored = (value: string) => `${CONSENT_COOKIE}=${value}`

describe('the pre-paint consent flag', () => {
  /**
   * EVERY ONE OF THESE IS A REAL STORED VALUE OR A REAL WAY OF GETTING A BAD
   * ONE. The cookie is user-writable and arrives from a public browser, so the
   * cases that matter are the malformed ones.
   */
  const table: Array<{ name: string; value: string | null }> = [
    { name: 'nobody has ever been asked', value: null },
    { name: 'a consent that was granted', value: encodeConsent(allGranted(new Date('2026-09-14T00:00:00.000Z'))) },
    { name: 'a refusal that was recorded', value: encodeConsent(allRefused(new Date('2026-09-14T00:00:00.000Z'))) },
    { name: 'the empty decision, which nobody has answered', value: encodeConsent(NO_CONSENT) },
    { name: 'an empty cookie value', value: '' },
    { name: 'a value that is not JSON at all', value: 'zzzzzzzz' },
    { name: 'JSON that is not an object', value: encodeURIComponent('"yes"') },
    { name: 'the JSON null', value: encodeURIComponent('null') },
    { name: 'an array', value: encodeURIComponent('[1,2,3]') },
    {
      name: 'a decision stored against an older provider list',
      value: encodeURIComponent(JSON.stringify({ v: CONSENT_VERSION + 1, a: 1, d: 1, t: '2026-09-14T00:00:00.000Z' })),
    },
    {
      name: 'a decision with no timestamp, so nobody has actually answered',
      value: encodeURIComponent(JSON.stringify({ v: CONSENT_VERSION, a: 1, d: 1, t: null })),
    },
    {
      name: 'a timestamp that is a number rather than a string',
      value: encodeURIComponent(JSON.stringify({ v: CONSENT_VERSION, a: 1, d: 1, t: 1757808000000 })),
    },
  ]

  for (const row of table) {
    it(`agrees_with_the_decoder_when_${row.name.replace(/[^a-z]+/gi, '_')}`, () => {
      const decoderSaysDecided = hasDecided(decodeConsent(row.value))
      const scriptAsks = asksFor(row.value === null ? 'other=1' : stored(row.value))
      expect(
        scriptAsks,
        `the pre-paint script and decodeConsent disagree about "${row.name}". They read the same cookie and ` +
          'must reach the same verdict, or the strip is shown to somebody who answered or withheld from somebody who did not.',
      ).toBe(!decoderSaysDecided)
    })
  }

  it('a_sweep_that_finds_nothing_proves_nothing', () => {
    const decided = table.filter((r) => hasDecided(decodeConsent(r.value)))
    const undecided = table.filter((r) => !hasDecided(decodeConsent(r.value)))
    expect(decided.length, 'the table holds no decided value, so it never exercises the hide direction').toBeGreaterThanOrEqual(2)
    expect(undecided.length, 'the table holds no undecided value, so it never exercises the ask direction').toBeGreaterThanOrEqual(5)
  })

  it('finds_the_cookie_among_others_and_takes_the_first_match', () => {
    const granted = encodeConsent(allGranted())
    expect(asksFor(`ph_x=1; ${stored(granted)}; el-audit=1`)).toBe(false)
    // The provider takes the first match (`find`), so this must too: a second
    // copy of the cookie must not be able to overturn the first.
    expect(asksFor(`${stored(granted)}; ${stored('zzzz')}`)).toBe(false)
  })

  it('asks_when_the_browser_cannot_be_read_at_all', () => {
    // A sandboxed document throws on `document.cookie`. Somebody who cannot be
    // read has not been shown to have decided, so the failure direction is to
    // ask. Nothing loads either way: the provider still starts at NO_CONSENT.
    const asks = asksFor(() => {
      throw new Error('cookies are blocked in this context')
    })
    expect(asks).toBe(true)
  })

  it('never_writes_a_cookie', () => {
    expect(CONSENT_ASK_FLAG_SCRIPT).not.toContain('document.cookie=')
    expect(CONSENT_ASK_FLAG_SCRIPT.includes('cookie =')).toBe(false)
  })
})

describe('the in-body bootstrap', () => {
  function shellElement(height: number) {
    const listeners: Array<(event: unknown) => void> = []
    return {
      listeners,
      getBoundingClientRect: () => ({ height }),
      addEventListener: (type: string, handler: (event: unknown) => void) => {
        if (type === 'click') listeners.push(handler)
      },
    }
  }

  function boot(cookie: string, height = 285.2) {
    const element = shellElement(height)
    const { document, root } = fakeDocument(cookie, element)
    new Function('document', CONSENT_ASK_FLAG_SCRIPT)(document)
    const held: Record<string, unknown> = {}
    new Function('document', 'window', CONSENT_SHELL_BOOTSTRAP_SCRIPT)(document, held)
    return { element, root, held }
  }

  it('reserves_the_measured_height_at_first_paint', () => {
    const { root } = boot('other=1')
    expect(root.attributes.get(CONSENT_ASK_ATTRIBUTE)).toBe(CONSENT_ASK_VALUE)
    // Rounded UP, because a strip reserved one pixel short still covers a
    // control by one pixel.
    expect(root.properties.get(CONSENT_BANNER_HEIGHT_VAR)).toBe('286px')
  })

  it('does_nothing_at_all_for_somebody_who_has_already_answered', () => {
    const { element, root } = boot(stored(encodeConsent(allRefused())))
    expect(root.attributes.has(CONSENT_ASK_ATTRIBUTE)).toBe(false)
    expect(root.properties.has(CONSENT_BANNER_HEIGHT_VAR)).toBe(false)
    expect(element.listeners.length, 'it attached a listener to a strip nobody can see').toBe(0)
  })

  for (const answer of [CONSENT_INTENT_ACCEPT, CONSENT_INTENT_REFUSE]) {
    it(`holds_a_${answer}_pressed_before_the_chunk_arrives_and_takes_the_strip_down`, () => {
      const { element, root, held } = boot('other=1')
      expect(element.listeners.length).toBe(1)
      element.listeners[0]({
        target: { closest: (selector: string) => (selector === `[${CONSENT_INTENT_ATTRIBUTE}]` ? { getAttribute: () => answer } : null) },
      })
      expect(held[CONSENT_INTENT_WINDOW_KEY]).toBe(answer)
      expect(root.attributes.has(CONSENT_ASK_ATTRIBUTE), 'the strip stayed up after it was answered').toBe(false)
      expect(root.properties.has(CONSENT_BANNER_HEIGHT_VAR), 'the reserved space was not given back').toBe(false)
    })
  }

  it('a_press_on_the_strip_that_is_not_an_answer_changes_nothing', () => {
    const { element, root, held } = boot('other=1')
    element.listeners[0]({ target: { closest: () => null } })
    expect(held[CONSENT_INTENT_WINDOW_KEY]).toBeUndefined()
    expect(root.attributes.get(CONSENT_ASK_ATTRIBUTE)).toBe(CONSENT_ASK_VALUE)
  })

  it('never_writes_a_cookie_either', () => {
    expect(CONSENT_SHELL_BOOTSTRAP_SCRIPT).not.toContain('document.cookie=')
    expect(CONSENT_SHELL_BOOTSTRAP_SCRIPT.includes('cookie =')).toBe(false)
  })
})

describe('the strip itself', () => {
  const SHELL = 'src/components/analytics/consent-banner-shell.tsx'
  const CLIENT = 'src/components/analytics/consent-banner.tsx'
  const shell = readFileSync(SHELL, 'utf8')

  it('is_a_server_component_so_it_is_in_the_html', () => {
    expect(/['"]use client['"]/.test(shell), `${SHELL} became a client component, which is the defect this whole shape exists to fix`).toBe(false)
  })

  it('carries_both_answers_as_pressable_controls', () => {
    expect(shell).toContain(`${CONSENT_INTENT_ATTRIBUTE}="${CONSENT_INTENT_REFUSE}"`)
    expect(shell).toContain(`${CONSENT_INTENT_ATTRIBUTE}="${CONSENT_INTENT_ACCEPT}"`)
    // The refusal is first in the document, so a keyboard and a thumb reach the
    // safe answer first.
    expect(shell.indexOf(`${CONSENT_INTENT_ATTRIBUTE}="${CONSENT_INTENT_REFUSE}"`)).toBeLessThan(
      shell.indexOf(`${CONSENT_INTENT_ATTRIBUTE}="${CONSENT_INTENT_ACCEPT}"`),
    )
  })

  /**
   * THE WORDING IS EVIDENCE OF WHAT A PERSON WAS SHOWN, and the obvious way to
   * stop this strip being the largest element on a page is to shorten it. That
   * would be a change to consent wording made to move a performance number,
   * which is not a trade this platform makes. It is asserted here so the choice
   * has to be made deliberately, with the version bumped, rather than reached
   * for as an optimisation.
   */
  it('still_says_exactly_what_it_said', () => {
    for (const sentence of [
      'We count how the site is used so we can make it better',
      'we measure which of our own',
      'None of it runs until you say yes',
      'buying a ticket and running an event work exactly the same',
      'What we would load',
    ]) {
      expect(shell, `the consent wording lost "${sentence}"`).toContain(sentence)
    }
  })

  it('the_deferred_client_half_renders_nothing', () => {
    // CODE, NEVER PROSE: this file's own doc comment describes the strip it no
    // longer renders, and a naive match would read that as markup.
    const client = stripNonCode(readFileSync(CLIENT, 'utf8'))
    expect(client).toContain('return null')
    expect(
      /<\s*[a-z][a-z0-9]*[\s/>]/.test(client),
      `${CLIENT} renders markup again; two copies of the strip is two banners on one screen`,
    ).toBe(false)
  })
})
