import { describe, expect, test } from 'vitest'
import { join } from 'node:path'
import { readRepoFile } from '../../helpers/read-repo-file'

/**
 * A SEMANTIC COLOUR IS NOT A TEXT COLOUR ON ITS OWN TINT.
 *
 * On 21 September 2026 the tree held TWENTY-NINE class strings that painted a
 * semantic token as text on a tint of the same token, and not one of them
 * reached WCAG AA. The worst was amber on amber at 1.91:1, carrying the
 * "18+ only" age restriction on the public event page. Four surfaces had
 * already been corrected one at a time by hand over the preceding fortnight -
 * /tickets (57 failing badges on one screen), /t/[code], /artists and
 * /artists/[slug] - and each correction left a comment explaining the
 * arithmetic, and none of them could stop the next one.
 *
 * `scripts/guards/tinted-text-meets-contrast.mjs` clause 2 now refuses the
 * shape at build time. This test holds the three things a guard cannot:
 *
 *   1. THE ARITHMETIC IS RIGHT. The composite is checked against four figures
 *      globals.css carries in its own comments, each computed independently by
 *      a person after axe found a live failure. Agreement between two
 *      derivations is evidence; one derivation asserting itself is not.
 *   2. THE TOKENS THE FIX REACHES FOR STILL CLEAR AA. A change to
 *      --color-success-strong that quietly lightened it would leave every
 *      corrected surface failing with the guard still green, because the guard
 *      reads the same token it is judging.
 *   3. THE BORDER BASELINE NEVER HOLDS A PAIR THAT PASSES. Its five entries are
 *      permissions to ship a measured AA failure another lane owns. An entry
 *      naming a pair that is actually fine would be a permission with no
 *      failure behind it, which is how a list stops being read.
 *
 * The assertions are on class names, because a class name is what regresses.
 */
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readRepoFile(join(ROOT, rel))

const channel = (c: number) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
const luminance = (hex: string) =>
  0.2126 * channel(parseInt(hex.slice(1, 3), 16)) +
  0.7152 * channel(parseInt(hex.slice(3, 5), 16)) +
  0.0722 * channel(parseInt(hex.slice(5, 7), 16))
const contrast = (a: string, b: string) => {
  const hi = Math.max(luminance(a), luminance(b))
  const lo = Math.min(luminance(a), luminance(b))
  return (hi + 0.05) / (lo + 0.05)
}
/** Source-over compositing of an opaque token at `alpha` on an opaque surface. */
const composite = (hex: string, alpha: number, surface: string) => {
  const part = (i: number) =>
    Math.round(parseInt(hex.slice(i, i + 2), 16) * alpha + parseInt(surface.slice(i, i + 2), 16) * (1 - alpha))
      .toString(16)
      .padStart(2, '0')
      .toUpperCase()
  return `#${part(1)}${part(3)}${part(5)}`
}

const CSS = read('src/app/globals.css')
const token = (name: string) => {
  const hex = CSS.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1]
  expect(hex, `--color-${name} is missing from globals.css`).toBeTruthy()
  return hex!.toUpperCase()
}
const AA = 4.5
/** CLAUDE.md, Design system: no flat painted dark surfaces, so a tint lands here. */
const LIGHT_SURFACES = ['white', 'canvas', 'ink-100'] as const

describe('the composite arithmetic agrees with what globals.css worked out by hand', () => {
  /*
   * Each of these four numbers was computed by a person, on a different day,
   * after axe reported a failure, and written into a comment beside the fix.
   * They are quoted here from those comments, not recalculated to match.
   */
  test.each([
    ['success', 0.15, 'white', 'success', 2.94],
    ['success', 0.15, 'canvas', 'success', 2.83],
    ['success', 0.15, 'white', 'success-strong', 5.2],
    ['success', 0.15, 'canvas', 'success-strong', 5.0],
  ])('bg-%s/%d over %s reads %s at %f:1', (tint, alpha, surface, ink, expected) => {
    const wash = composite(token(tint), alpha as number, token(surface))
    expect(contrast(token(ink), wash)).toBeCloseTo(expected as number, 1)
  })

  test('the error tint agrees too, from the note that added --color-error-strong', () => {
    // globals.css: "#DC2626 on the bg-error/10 wash (#FCE9E9) measures 4.13:1"
    const wash = composite(token('error'), 0.1, token('white'))
    expect(wash).toBe('#FCE9E9')
    expect(contrast(token('error'), wash)).toBeCloseTo(4.13, 1)
  })
})

describe('every token the correction reaches for clears AA where it is used', () => {
  test.each([
    ['success-strong', 'success', 0.1],

    ['error-strong', 'error', 0.05],
    ['error-strong', 'error', 0.1],
    ['ink-900', 'warning', 0.1],
    ['ink-900', 'warning', 0.15],
    ['ink-900', 'success', 0.15],
    ['ink-900', 'error', 0.1],
  ])('text-%s on bg-%s/%d clears 4.5:1 on all three light surfaces', (ink, tint, alpha) => {
    for (const surface of LIGHT_SURFACES) {
      const wash = composite(token(tint), alpha as number, token(surface))
      expect(contrast(token(ink as string), wash), `over ${surface}`).toBeGreaterThanOrEqual(AA)
    }
  })

  test('text-success-strong clears AA on bare white, canvas and ink-100 as well', () => {
    // /queue and the resend-verification line paint it with no tint behind it.
    for (const surface of LIGHT_SURFACES) {
      expect(contrast(token('success-strong'), token(surface)), `on ${surface}`).toBeGreaterThanOrEqual(AA)
    }
  })

  test('--color-success is under AA on every light surface, which is why it is never text', () => {
    for (const surface of LIGHT_SURFACES) {
      expect(contrast(token('success'), token(surface))).toBeLessThan(AA)
    }
  })
})

/**
 * The corrected sites. The tint stays; only the ink moves, so the status colour
 * still carries the meaning and the text is readable.
 */
const CORRECTED: [string, RegExp][] = [
  ['src/app/(dashboard)/dashboard/gigs/[id]/page.tsx', /booked: 'bg-success\/15 text-ink-900'/],
  ['src/app/(dashboard)/dashboard/gigs/[id]/page.tsx', /declined: 'bg-error\/10 text-ink-900'/],
  ['src/app/artist/dashboard/page.tsx', /\? 'bg-success\/15 text-ink-900'/],
  ['src/app/artist/dashboard/page.tsx', /\? 'bg-error\/10 text-ink-900'/],
  ['src/app/events/[slug]/page.tsx', /bg-warning\/15 px-3 py-1\.5 text-xs font-semibold text-ink-900/],
  ['src/app/events/[slug]/page.tsx', /bg-warning\/10 px-4 py-3 text-sm text-ink-900/],
  ['src/app/gigs/[id]/page.tsx', /bg-success\/10 px-3 py-2 text-sm text-success-strong/],
  ['src/app/queue/[slug]/queue-room.tsx', /text-xl font-semibold text-success-strong/],
  ['src/components/ai/assistant-panel.tsx', /bg-error\/5 px-4 py-3 text-xs text-error-strong/],
  ['src/components/auth/login-form.tsx', /bg-success\/10 px-4 py-3 text-sm text-success-strong/],
  ['src/components/auth/resend-verification-button.tsx', /text-center text-xs text-success-strong/],
  ['src/components/features/tickets/transfer-ticket-form.tsx', /'bg-success\/10 text-success-strong' : 'bg-error\/10 text-error-strong'/],
  ['src/components/marketplace/applicant-actions.tsx', /'bg-success\/10 text-success-strong' : 'bg-error\/10 text-error-strong'/],
  ['src/components/marketplace/create-profile-form.tsx', /bg-error\/10 px-3 py-2 text-sm text-error-strong/],
  ['src/components/marketplace/gig-apply-form.tsx', /'bg-success\/10 text-success-strong' : 'bg-error\/10 text-error-strong'/],
  ['src/components/marketplace/post-gig-form.tsx', /'bg-success\/10 text-success-strong' : 'bg-error\/10 text-error-strong'/],
  ['src/components/marketplace/requests-panel.tsx', /'bg-success\/15 text-ink-900' : 'bg-ink-100 text-ink-600'/],
  ['src/components/marketplace/showcase-editor.tsx', /'bg-success\/10 text-success-strong' : 'bg-error\/10 text-error-strong'/],
  ['src/components/marketplace/structured-request-button.tsx', /'bg-success\/10 text-success-strong' : 'bg-error\/10 text-error-strong'/],
  ['src/components/organisation/organisation-profile-form.tsx', /bg-success\/10 px-3 py-2 text-sm text-success-strong/],
]

describe('the twenty corrected sites keep the readable ink', () => {
  test.each(CORRECTED)('%s carries %s', (rel, pattern) => {
    expect(read(rel)).toMatch(pattern)
  })

  test('no corrected file paints the semantic token as text on its own tint again', () => {
    for (const rel of new Set(CORRECTED.map(([r]) => r))) {
      const src = read(rel)
      for (const m of src.matchAll(/(?:^|["'`\s])((?:bg|text)-(?:success|error|warning|info)[^"'`\n]*)/g)) {
        const cls = m[1]
        const bg = cls.match(/bg-(success|error|warning|info)\/(\d{1,3})/)
        const fg = cls.match(/(?:^|\s)text-(success|error|warning|info)(?:\s|$|["'`])/)
        expect(bg && fg, `${rel} still pairs bg-${bg?.[1]} with text-${fg?.[1]}`).toBeFalsy()
      }
    }
  })
})

/**
 * THE BORDER BASELINE, read out of the guard rather than restated, so the two
 * cannot drift apart. Five permissions to ship a measured AA failure that lane
 * B is not permitted to fix: the three-lane protocol gives lane A refunds, the
 * money chain and connected accounts, and a one-token className change is not
 * worth a merge conflict that costs three lanes a 48 minute push.
 */
describe('every border baseline entry names a pair that really does fail', () => {
  const guard = read('scripts/guards/tinted-text-meets-contrast.mjs')
  const block = guard.slice(guard.indexOf('const BORDER_BASELINE = ['), guard.indexOf('/** The token table'))
  const entries = [...block.matchAll(/file: '([^']+)',\s*\n\s*fg: '([^']+)',\s*\n\s*bg: '([^']+)',/g)].map((m) => ({
    file: m[1],
    fg: m[2],
    tint: m[3].split('/')[0],
    alpha: Number(m[3].split('/')[1]) / 100,
  }))

  test('the guard carries exactly the five that were measured on 21 September 2026', () => {
    expect(entries).toHaveLength(5)
  })

  test.each(entries.map((e) => [e.file, e.fg, e.tint, e.alpha] as const))(
    '%s: text-%s on bg-%s/%d is under AA even on the most favourable light surface',
    (file, fg, tint, alpha) => {
      const best = Math.max(
        ...LIGHT_SURFACES.map((s) => contrast(token(fg), composite(token(tint), alpha, token(s)))),
      )
      expect(best, `${file} would pass, so it needs no permission`).toBeLessThan(AA)
    },
  )

  test('each bordered file still contains the pair its entry names', () => {
    for (const e of entries) {
      const src = read(e.file)
      expect(src, `${e.file} no longer pairs them; delete the baseline entry`).toMatch(
        new RegExp(`bg-${e.tint}\\/${Math.round(e.alpha * 100)}[^"'\`\\n]*text-${e.fg}\\b`),
      )
    }
  })
})
