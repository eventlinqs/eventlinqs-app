import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

/**
 * PHASE 3, LOCKED IN THE TEST SUITE.
 *
 * The same contract the build guard enforces, asserted again here so a change
 * fails `npm test` and not only `npm run build`. Attribute-level laws are the
 * easiest thing in a codebase to lose to a refactor and the hardest to notice:
 * nothing renders differently, nothing throws, and the only symptom is users
 * quietly never being offered their saved password.
 *
 * WHATWG HTML defines `current-password` as "the current password for the
 * account identified by THE USERNAME FIELD". Without a field carrying the
 * `username` token there is no such field, so Chromium's password form parser
 * has nothing to pair the password with. `email` is a contact-information
 * token, not a credential-group one. That single wrong token is why Chrome
 * offered the founder no saved credential on 2026-08-02.
 */

type Field = {
  id: string
  autoComplete: string
  name: string
  type: string
}

type Form = {
  file: string
  label: string
  fields: Field[]
}

const FORMS: Form[] = [
  {
    file: 'src/components/auth/login-form.tsx',
    label: 'sign-in',
    fields: [
      { id: 'email', autoComplete: 'username', name: 'email', type: 'email' },
      { id: 'password', autoComplete: 'current-password', name: 'password', type: 'password' },
    ],
  },
  {
    file: 'src/components/auth/signup-form.tsx',
    label: 'sign-up',
    fields: [
      { id: 'email', autoComplete: 'username', name: 'email', type: 'email' },
      { id: 'password', autoComplete: 'new-password', name: 'new-password', type: 'password' },
    ],
  },
  {
    file: 'src/components/auth/reset-password-form.tsx',
    label: 'reset completion',
    fields: [
      { id: 'username', autoComplete: 'username', name: 'username', type: 'hidden' },
      { id: 'password', autoComplete: 'new-password', name: 'new-password', type: 'password' },
      { id: 'confirm', autoComplete: 'new-password', name: 'confirm-new-password', type: 'password' },
    ],
  },
  {
    file: 'src/components/auth/forgot-password-form.tsx',
    label: 'reset request',
    fields: [{ id: 'email', autoComplete: 'username', name: 'email', type: 'email' }],
  },
  {
    file: 'src/app/admin/login/login-form.tsx',
    label: 'admin sign-in',
    fields: [
      { id: 'email', autoComplete: 'username', name: 'email', type: 'email' },
      { id: 'password', autoComplete: 'current-password', name: 'password', type: 'password' },
      { id: 'totp', autoComplete: 'one-time-code', name: 'totp', type: 'text' },
    ],
  },
]

function inputBlock(src: string, id: string): string | null {
  const at = src.indexOf(`id="${id}"`)
  if (at === -1) return null
  const open = src.lastIndexOf('<input', at)
  if (open === -1) return null
  const selfClose = src.indexOf('/>', at)
  const plain = src.indexOf('>', at)
  const end = selfClose !== -1 && selfClose < plain + 2 ? selfClose : plain
  return src.slice(open, end === -1 ? src.length : end + 2)
}

describe.each(FORMS)('$label form ($file)', (form) => {
  const src = readFileSync(form.file, 'utf8')

  test('uses a real <form> element, which Chromium requires before it will save', () => {
    expect(src).toMatch(/<form[\s>]/)
  })

  test.each(form.fields)('input#$id carries the full credential contract', (field) => {
    const block = inputBlock(src, field.id)
    expect(block, `no <input id="${field.id}"> in ${form.file}`).not.toBeNull()
    expect(block).toContain(`autoComplete="${field.autoComplete}"`)
    expect(block).toContain(`name="${field.name}"`)
    expect(block).toContain(`type="${field.type}"`)
  })

  test('no credential field carries autocomplete="email" or "off"', () => {
    for (const field of form.fields) {
      const block = inputBlock(src, field.id) ?? ''
      expect(block, `input#${field.id} still uses the contact-group token`).not.toContain(
        'autoComplete="email"',
      )
      expect(block).not.toContain('autoComplete="off"')
    }
  })
})

describe('the reset-completion form specifically', () => {
  const src = readFileSync('src/components/auth/reset-password-form.tsx', 'utf8')

  test('carries a HIDDEN username field, per Chromium change-password guidance', () => {
    // "On change password forms that might not have a visible username field,
    // Chrome will autofill a username somewhere, but not always in the actual
    // username field." The documented fix is a hidden username input.
    const block = inputBlock(src, 'username') ?? ''
    expect(block).toContain('type="hidden"')
    expect(block).toContain('autoComplete="username"')
  })

  test('the hidden field is populated from the recovery session, not left empty', () => {
    // An empty username field associates the new password with nothing.
    expect(src).toContain('value={accountEmail}')
    expect(src).toContain('setAccountEmail(')
  })

  test('being type="hidden" it renders nothing, so the design lock holds', () => {
    const block = inputBlock(src, 'username') ?? ''
    expect(block).not.toContain('className=')
  })
})

describe('both password fields on a new-password form share the token', () => {
  test('reset completion marks password and confirm as new-password', () => {
    const src = readFileSync('src/components/auth/reset-password-form.tsx', 'utf8')
    const matches = src.match(/autoComplete="new-password"/g) ?? []
    expect(matches.length).toBe(2)
  })
})
