/**
 * PHASE 3.3: the credential-manager contract, verified in a REAL BROWSER
 * against the RENDERED DOM.
 *
 * WHAT THIS CHECKS, AND WHY IT IS THE RIGHT CHECK.
 *
 * `scripts/guards/auth-autocomplete-guard.mjs` reads the TSX source. That
 * catches a developer deleting an attribute, but it cannot prove the attribute
 * survives React, the build, SSR and hydration and is actually present in the
 * document Chrome parses. This runs real Chrome, loads the real pages, and
 * reads the live DOM after hydration. Source and browser are different claims
 * and both are worth making.
 *
 * WHAT THIS DELIBERATELY DOES NOT CLAIM, AND THE DEAD END THAT PROVED IT.
 *
 * The obvious automated route is Chrome's `--show-autofill-type-predictions`,
 * which annotates inputs with an `autofill-prediction` attribute. It looks like
 * the password manager's own opinion. It is not, and it is useless here. Run on
 * 2026-08-03 against two static fixtures, one with the OLD broken markup and
 * one with the NEW correct markup:
 *
 *   BEFORE  <input id=email autocomplete="email">            -> EMAIL_ADDRESS
 *           <input id=password autocomplete="current-password"> -> PASSWORD
 *   AFTER   <input id=email name=email autocomplete="username"> -> EMAIL_ADDRESS
 *           <input id=password name=password autocomplete="current-password"> -> PASSWORD
 *
 * IDENTICAL. That flag exposes the ADDRESS autofill classifier, which types any
 * email input as EMAIL_ADDRESS regardless of its credential role. It cannot
 * tell the broken form from the fixed one, so it can neither pass nor fail this
 * work, and an earlier version of this script that trusted it was reporting
 * meaningless verdicts.
 *
 * Chrome's actual save and fill prompts are browser UI outside the page, and
 * Chrome suppresses the save bubble under automation, so they cannot be
 * asserted from Playwright. That gap is reported honestly rather than papered
 * over, and the founder's 60-second manual check is in
 * docs/hardening/auth/FOUNDER-STEPS.md.
 *
 * Usage: node scripts/verify/auth-credential-manager-proof.mjs [baseUrl]
 */
import { chromium } from 'playwright'

const BASE = process.argv[2] ?? 'http://127.0.0.1:3132'

/**
 * The contract, from WHATWG HTML (autofill field names) and the Chromium
 * "Create Amazing Password Forms" guidance.
 */
const CONTRACT = [
  {
    page: '/login',
    label: 'sign-in',
    fields: [
      { id: 'email', autocomplete: 'username', name: 'email', type: 'email' },
      { id: 'password', autocomplete: 'current-password', name: 'password', type: 'password' },
    ],
  },
  {
    page: '/signup',
    label: 'sign-up',
    fields: [
      { id: 'email', autocomplete: 'username', name: 'email', type: 'email' },
      { id: 'password', autocomplete: 'new-password', name: 'new-password', type: 'password' },
    ],
  },
  {
    page: '/forgot-password',
    label: 'reset request',
    fields: [{ id: 'email', autocomplete: 'username', name: 'email', type: 'email' }],
  },
  {
    page: '/auth/reset-password',
    label: 'reset completion',
    // The recovery page only mounts its form once it has a session, so the
    // fields are asserted only when present; the guard and the unit tests cover
    // the source unconditionally.
    optional: true,
    fields: [
      { id: 'username', autocomplete: 'username', name: 'username', type: 'hidden' },
      { id: 'password', autocomplete: 'new-password', name: 'new-password', type: 'password' },
      { id: 'confirm', autocomplete: 'new-password', name: 'confirm-new-password', type: 'password' },
    ],
  },
]

const results = []
function check(label, ok, detail) {
  results.push({ label, ok, detail })
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `\n          ${detail}` : ''}`)
}

const browser = await chromium.launch({
  channel: process.env.CHROME_CHANNEL ?? 'chrome',
  headless: false,
})

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()

  console.log('\n=== CREDENTIAL CONTRACT IN THE LIVE DOM (real Chrome) ===\n')

  for (const spec of CONTRACT) {
    await page.goto(`${BASE}${spec.page}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(spec.page.includes('reset-password') ? 5000 : 800)

    const dom = await page.evaluate(() => ({
      hasForm: Boolean(document.querySelector('form')),
      hasSubmit: Boolean(document.querySelector('form button[type="submit"], form input[type="submit"]')),
      inputs: Array.from(document.querySelectorAll('input')).map((el) => ({
        id: el.id,
        // `.name` and `.autocomplete` are the PARSED IDL values, which is what
        // the browser itself acts on. Reading the raw attribute would not prove
        // the parser accepted it.
        name: el.name,
        autocomplete: el.autocomplete,
        type: el.type,
      })),
    }))

    console.log(`--- ${spec.label} (${spec.page}) ---`)
    for (const i of dom.inputs) {
      console.log(
        `  input#${i.id || '(none)'}  name="${i.name}"  type="${i.type}"  autocomplete="${i.autocomplete}"`,
      )
    }

    const present = spec.fields.filter((f) => dom.inputs.some((i) => i.id === f.id))
    if (spec.optional && present.length === 0) {
      console.log('  (form not mounted without a recovery session; covered by the guard and unit tests)\n')
      continue
    }

    check(`${spec.label}: a real <form> with a submit control`, dom.hasForm && dom.hasSubmit, `form ${dom.hasForm}, submit ${dom.hasSubmit}`)

    for (const field of spec.fields) {
      const live = dom.inputs.find((i) => i.id === field.id)
      if (!live) {
        check(`${spec.label}: input#${field.id} present in the DOM`, false, 'not found')
        continue
      }
      check(
        `${spec.label}: input#${field.id} autocomplete="${field.autocomplete}"`,
        live.autocomplete === field.autocomplete,
        `browser parsed autocomplete as "${live.autocomplete}"`,
      )
      check(
        `${spec.label}: input#${field.id} name="${field.name}"`,
        live.name === field.name,
        `browser parsed name as "${live.name}"`,
      )
      check(
        `${spec.label}: input#${field.id} type="${field.type}"`,
        live.type === field.type,
        `browser parsed type as "${live.type}"`,
      )
    }
    console.log('')
  }

  await context.close()
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`=== ${results.length - failed.length}/${results.length} live-DOM assertions passed ===`)
console.log(
  '\nNOT PROVEN HERE: Chrome\'s save and fill prompts are browser UI outside the\n' +
    'page and are suppressed under automation. The manual 60-second check is in\n' +
    'docs/hardening/auth/FOUNDER-STEPS.md. See this file\'s header for why the\n' +
    'autofill-type-predictions route was rejected as an invalid instrument.\n',
)
if (failed.length > 0) process.exit(1)
