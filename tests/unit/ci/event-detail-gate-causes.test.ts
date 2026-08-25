// THE THREE THINGS THAT FAILED THE EVENT-DETAIL LIGHTHOUSE GATE, PINNED.
//
// On 2026-08-21 the mobile gate failed /events/<slug> on three deterministic
// signals, identical across all three runs:
//
//   accessibility               0.97 against a required 1.00
//   cumulative-layout-shift     0.186 against 0.1
//   resource-summary:script:size 534,565 bytes against 491,520
//
// None of the three was the seat map, which is what the page happened to be a
// proof fixture for. Each was a shared component, so each was live on far more
// than the one page the gate measures:
//
//   1. `opacity-80` on the sold-out ticket-tier card. A container opacity
//      composites every descendant toward the page behind it. The Join
//      Waitlist control inside rendered #ac6230 on #fffcef - 4.48:1 against
//      the 4.5:1 floor - while its own tokens (amber-800 on amber-50) are
//      6.84:1. Every event with a sold-out or not-yet-on-sale tier carried it.
//   2. The first-run coach mounting as a flex child of a bottom-anchored fixed
//      container, so the container's box grew after paint and the browser
//      scored it. Worth 0.151 on its own.
//   3. The waitlist button resolving the signed-in user in a `useEffect`,
//      pulling 54,778 bytes of Supabase client on mount to feed a line of text
//      inside a modal that is closed.
//
// The gate can only see these on the single URL it measures. These assertions
// see them in the source, on every route that renders these components.
//
// EVERY ASSERTION BELOW IS AN ABSENCE, so every detector is first shown
// FAILING on a sample that does contain what it looks for. A detector that
// quietly stopped matching would otherwise report the same PASS as a fixed
// codebase.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

const TICKET_SELECTOR = 'src/components/checkout/ticket-selector.tsx'
const SURFACE_GUIDANCE = 'src/components/guidance/surface-guidance.tsx'
const WAITLIST_BUTTON = 'src/components/waitlist/join-waitlist-button.tsx'

/**
 * Block comments are removed before scanning, because the comment that explains
 * WHY a class must not come back names that class, and a detector that cannot
 * tell prose from code fails on its own documentation.
 */
const stripBlockComments = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, ' ')

/** Any Tailwind opacity utility applied to an element (not a colour's /50 alpha). */
const findOpacityUtilities = (source: string): string[] =>
  Array.from(stripBlockComments(source).matchAll(/(?:^|[\s'"`])(opacity-\[?[\d.]+%?\]?)/g), (m) => m[1])

/** A `useEffect` (or effect-shaped mount hook) that pulls the Supabase client. */
const findOnMountSupabaseImport = (source: string): string[] => {
  const out: string[] = []
  for (const m of source.matchAll(/useEffect\(\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\n\s*\}\s*,\s*\[/g)) {
    if (/import\(\s*['"]@\/lib\/supabase\/client['"]\s*\)/.test(m[1])) out.push(m[1].slice(0, 80))
  }
  return out
}

describe('detectors can fail (negative controls)', () => {
  it('findOpacityUtilities matches a card that does carry one', () => {
    expect(findOpacityUtilities("className={`rounded-xl border p-4 opacity-80 ${x}`}")).toEqual(['opacity-80'])
    expect(findOpacityUtilities('className="opacity-[0.65] p-4"')).toEqual(['opacity-[0.65]'])
  })

  it('findOpacityUtilities does NOT match a colour alpha, which is a different thing', () => {
    expect(findOpacityUtilities('className="bg-ink-100/50 border-ink-200/50"')).toEqual([])
  })

  it('findOpacityUtilities ignores the class named inside a comment, but not beside one', () => {
    expect(findOpacityUtilities('/* never put opacity-80 back here */ className="p-4"')).toEqual([])
    expect(findOpacityUtilities('/* never do this */ className="p-4 opacity-80"')).toEqual(['opacity-80'])
  })

  it('findOnMountSupabaseImport matches the shape that shipped the 54KB chunk', () => {
    const sample = `
      useEffect(() => {
        import('@/lib/supabase/client').then(({ createClient }) => {
          createClient().auth.getUser()
        })
      }, [])
    `
    expect(findOnMountSupabaseImport(sample)).toHaveLength(1)
  })

  it('findOnMountSupabaseImport ignores the same import outside an effect', () => {
    const sample = `
      const resolve = () => { import('@/lib/supabase/client').then(() => {}) }
      useEffect(() => { document.addEventListener('keydown', onKey) }, [])
    `
    expect(findOnMountSupabaseImport(sample)).toHaveLength(0)
  })
})

describe('cause 1: no container opacity over the ticket tiers', () => {
  const source = read(TICKET_SELECTOR)

  it('reads a ticket selector that actually renders tiers', () => {
    expect(source).toContain('soldOut || salePending')
  })

  it('carries no opacity utility at all', () => {
    expect(
      findOpacityUtilities(source),
      'A container `opacity-*` lowers the contrast of every descendant, ' +
        'including a 44px interactive control, below what its own tokens pass. ' +
        'Express an unavailable tier with surface tokens (border + wash), never ' +
        'by fading the whole card.',
    ).toEqual([])
  })
})

describe('cause 2: the guidance coach cannot resize its own container', () => {
  const source = read(SURFACE_GUIDANCE)

  it('reads the component that mounts the coach', () => {
    expect(source).toContain('FirstRunCoach')
  })

  it('holds the coach and the panel out of flow', () => {
    expect(
      /absolute bottom-full/.test(source),
      'The coach and panel must be positioned against the fixed launcher ' +
        'container, not laid out inside it. As flex children they grow a ' +
        'bottom-anchored box after paint, which is a layout shift.',
    ).toBe(true)
  })

  it('leaves the launcher as the only thing that can size that container', () => {
    const container = source.match(/pointer-events-none fixed bottom-16[^`"]*/)?.[0] ?? ''
    expect(container, 'the fixed guidance container was not found').not.toBe('')
    const afterContainer = source.slice(source.indexOf(container))
    const wrapperAt = afterContainer.indexOf('absolute bottom-full')
    const coachAt = afterContainer.indexOf('<FirstRunCoach')
    expect(wrapperAt).toBeGreaterThan(-1)
    expect(
      coachAt > wrapperAt,
      'the coach must render INSIDE the out-of-flow wrapper, not before it',
    ).toBe(true)
  })
})

describe('cause 3: the waitlist button resolves identity on intent, not on mount', () => {
  const source = read(WAITLIST_BUTTON)

  it('reads the button that opens the waitlist modal', () => {
    expect(source).toContain('JoinWaitlistModal')
  })

  it('never pulls the Supabase client from a mount effect', () => {
    expect(
      findOnMountSupabaseImport(source),
      'Loading the Supabase browser client on mount costs ~54KB of script on ' +
        'every event page with a sold-out tier, to fill in a line of text inside ' +
        'a closed modal. Resolve it when someone reaches for the control.',
    ).toEqual([])
  })

  it('still resolves identity from real user intent, so the modal is not left blank', () => {
    for (const handler of ['onPointerEnter', 'onFocus', 'onClick']) {
      expect(source.includes(handler), `${handler} must start identity resolution`).toBe(true)
    }
    expect(/import\(\s*['"]@\/lib\/supabase\/client['"]\s*\)/.test(source)).toBe(true)
  })
})
