/**
 * BUILD-FAILING GUARD: no credential form may be submittable before hydration.
 *
 * THE DEFECT THIS EXISTS TO STOP RECURRING, measured on production 2026-08-08.
 *
 * Every auth form is `<form onSubmit={handler}>` with `e.preventDefault()`
 * inside the handler and NO `action` attribute. That is correct once React is
 * live and dangerous before it: the server sends complete markup, the browser
 * paints the inputs, and the person can type and press Enter while the
 * JavaScript is still arriving. A submit in that window is a NATIVE submit, and
 * a native submit with no action is a GET to the current URL carrying every
 * field as a query parameter.
 *
 * Observed, from a real submit against the deployed app:
 *
 *   /login?email=...&password=ArtistGate2026%21Drive
 *
 * The password then sits in browser history, in the Referer header of the next
 * request, and in any intermediary that records URLs. Three of the four forms
 * carried a password. It had been true for months and no gate said a word:
 * types passed, lint passed, the build passed, the route returned 200 and the
 * page rendered.
 *
 * The exposure window is not theoretical. Measured on production /login at 390
 * wide, from HTML arriving to the last script finishing:
 *
 *   fast connection      ~353 ms
 *   simulated 4G         ~871 ms
 *   simulated slow 3G   ~8301 ms
 *
 * THE RULE. A .tsx file that renders a password field inside a form with an
 * onSubmit handler and no action attribute must gate its submit control so it
 * cannot fire before hydration. In this codebase that is `useHydrated()` from
 * src/lib/hooks/use-hydrated.ts and a submit control disabled until it is true.
 *
 * An `action` attribute is also accepted: a form that posts somewhere real is
 * not doing an accidental GET of its own fields.
 *
 * Run by `npm run guards`, which `prebuild` invokes, so `npm run build` fails.
 */
import { readFileSync } from 'node:fs'
import { sourceFiles } from './lib/source.mjs'

const ROOT = process.cwd()

const PASSWORD_FIELD = /type=["']password["']/
const FORM_WITH_HANDLER = /<form[^>]*onSubmit=/
const FORM_WITH_ACTION = /<form[^>]*\saction=/
const HYDRATION_GATE = /useHydrated\s*\(/
/** A submit control still gated on loading alone is live in the window. */
const UNGATED_DISABLED = /disabled=\{\s*loading\s*\}/

const failures = []
let checked = 0

for (const file of sourceFiles(ROOT)) {
  if (!file.endsWith('.tsx')) continue
  const src = readFileSync(file, 'utf8')

  if (!PASSWORD_FIELD.test(src)) continue
  if (!FORM_WITH_HANDLER.test(src)) continue
  if (FORM_WITH_ACTION.test(src)) continue

  checked++
  const rel = file.replace(process.cwd(), '').replace(/^[\\/]/, '')

  if (!HYDRATION_GATE.test(src)) {
    failures.push(
      `${rel}\n    renders a password field in a handler-only form and never calls useHydrated().\n` +
        `    Before hydration a submit is a native GET and the password lands in the URL.`,
    )
    continue
  }
  if (UNGATED_DISABLED.test(src)) {
    failures.push(
      `${rel}\n    calls useHydrated() but still has a control reading disabled={loading}.\n` +
        `    That control is submittable in the pre-hydration window. Use disabled={loading || !hydrated}.`,
    )
  }
}

if (checked === 0) {
  // A guard that silently matches nothing is decoration. If the auth forms are
  // renamed or restructured, this fails loudly rather than passing vacuously.
  console.error(
    '[no-unguarded-credential-form] FAIL - found no credential form to check at all.\n' +
      '    Either the auth forms moved, or the detection below stopped matching.\n' +
      '    Update this guard deliberately; do not let it pass by checking nothing.',
  )
  process.exit(1)
}

if (failures.length > 0) {
  console.error(`[no-unguarded-credential-form] FAIL - ${failures.length} unguarded credential form(s):\n`)
  for (const f of failures) console.error(`  ${f}\n`)
  console.error('  See src/lib/hooks/use-hydrated.ts for why and how.')
  process.exit(1)
}

console.log(
  `[no-unguarded-credential-form] PASS - ${checked} credential form(s), every submit gated on hydration.`,
)
