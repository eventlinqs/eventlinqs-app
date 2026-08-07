/**
 * BUILD-FAILING GUARD: credential-manager attributes on every auth form.
 *
 * The defect: Chrome offered no saved credential on sign-in, so the founder
 * could not tell whether an account existed. Cause: the email field carried
 * `autocomplete="email"` and no `name`.
 *
 * WHATWG HTML defines `current-password` as "the current password for the
 * account identified by THE USERNAME FIELD". With no field bearing the
 * `username` token there is no such field, so Chromium's password form parser
 * has nothing to pair the password with. `email` is a contact-information
 * token, not a credential-group one, and does not satisfy it. Chromium
 * additionally requires a stable `name` or `id` to store against.
 *
 * Attribute-level laws are the easiest thing in a codebase to lose to a
 * refactor and the hardest to notice: nothing renders differently, no test
 * fails, and the loss only shows up as users quietly not being offered their
 * password. That is why this is a build gate and not a code review note.
 *
 * Run by `npm run guards`, which `prebuild` invokes, so `npm run build` fails.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()

/**
 * The contract, per form. Each field names the tokens it must carry.
 * `hidden` marks a field that must exist but renders nothing.
 */
const CONTRACT = [
  {
    file: 'src/components/auth/login-form.tsx',
    label: 'sign-in',
    fields: [
      { id: 'email', autoComplete: 'username', name: 'email', type: 'email' },
      { id: 'password', autoComplete: 'current-password', name: 'password', type: 'password' },
    ],
    requiresForm: true,
  },
  {
    file: 'src/components/auth/signup-form.tsx',
    label: 'sign-up',
    fields: [
      { id: 'email', autoComplete: 'username', name: 'email', type: 'email' },
      { id: 'password', autoComplete: 'new-password', name: 'new-password', type: 'password' },
    ],
    requiresForm: true,
  },
  {
    file: 'src/components/auth/reset-password-form.tsx',
    label: 'reset-completion',
    fields: [
      // Chromium: a change-password form with no visible username field makes
      // the browser "autofill a username somewhere, but not always in the
      // actual username field". The hidden field is the documented fix.
      { id: 'username', autoComplete: 'username', name: 'username', type: 'hidden' },
      { id: 'password', autoComplete: 'new-password', name: 'new-password', type: 'password' },
      { id: 'confirm', autoComplete: 'new-password', name: 'confirm-new-password', type: 'password' },
    ],
    requiresForm: true,
  },
  {
    file: 'src/components/auth/forgot-password-form.tsx',
    label: 'reset-request',
    fields: [{ id: 'email', autoComplete: 'username', name: 'email', type: 'email' }],
    requiresForm: true,
  },
  {
    file: 'src/app/admin/login/login-form.tsx',
    label: 'admin sign-in',
    fields: [
      { id: 'email', autoComplete: 'username', name: 'email', type: 'email' },
      { id: 'password', autoComplete: 'current-password', name: 'password', type: 'password' },
      { id: 'totp', autoComplete: 'one-time-code', name: 'totp', type: 'text' },
    ],
    requiresForm: true,
  },
]

/** Tokens that must never appear on a credential field. */
const BANNED_ON_CREDENTIAL_FIELDS = [
  { token: 'autoComplete="email"', why: 'contact-information token; Chromium\'s password parser ignores it. Use "username".' },
  { token: 'autoComplete="off"', why: 'Chromium ignores it on password fields and it signals the wrong intent.' },
]

const failures = []

/** Pull the JSX attributes of the <input> whose id is `id`. */
function inputBlock(src, id) {
  const at = src.indexOf(`id="${id}"`)
  if (at === -1) return null
  const open = src.lastIndexOf('<input', at)
  if (open === -1) return null
  const close = src.indexOf('/>', at)
  const closeAlt = src.indexOf('>', at)
  const end = close !== -1 && close < closeAlt + 2 ? close : closeAlt
  return src.slice(open, end === -1 ? src.length : end + 2)
}

for (const form of CONTRACT) {
  let src
  try {
    src = readFileSync(join(ROOT, form.file), 'utf8')
  } catch {
    failures.push(`${form.file} is missing. The ${form.label} form is part of the auth contract.`)
    continue
  }

  if (form.requiresForm && !/<form[\s>]/.test(src)) {
    failures.push(
      `${form.file}: no <form> element. Chromium requires a real form with a submit\n` +
        `          button before it will offer to save a credential.`,
    )
  }

  for (const field of form.fields) {
    const block = inputBlock(src, field.id)
    if (!block) {
      failures.push(`${form.file}: no <input id="${field.id}"> found (${form.label}).`)
      continue
    }
    if (!block.includes(`autoComplete="${field.autoComplete}"`)) {
      failures.push(
        `${form.file}: input#${field.id} must carry autoComplete="${field.autoComplete}".\n` +
          `          Without it the credential manager cannot ${
            field.autoComplete === 'username' ? 'identify the account' : 'classify the password'
          }.`,
      )
    }
    if (!block.includes(`name="${field.name}"`)) {
      failures.push(
        `${form.file}: input#${field.id} must carry a stable name="${field.name}".\n` +
          `          Chromium stores autofill data against name or id and needs it stable.`,
      )
    }
    if (!block.includes(`type="${field.type}"`)) {
      failures.push(`${form.file}: input#${field.id} must be type="${field.type}".`)
    }
    for (const banned of BANNED_ON_CREDENTIAL_FIELDS) {
      if (block.includes(banned.token)) {
        failures.push(`${form.file}: input#${field.id} carries ${banned.token}. ${banned.why}`)
      }
    }
  }
}

if (failures.length > 0) {
  console.error('\n[auth-autocomplete-guard] FAILED\n')
  for (const f of failures) console.error(`  ${f}\n`)
  console.error(
    `  ${failures.length} violation(s). A missing autocomplete token is invisible on screen\n` +
      `  and shows up only as users never being offered their saved password.\n`,
  )
  process.exit(1)
}

const fieldCount = CONTRACT.reduce((n, f) => n + f.fields.length, 0)
console.log(
  `[auth-autocomplete-guard] PASS - ${CONTRACT.length} forms, ${fieldCount} fields match the WHATWG/Chromium contract.`,
)
