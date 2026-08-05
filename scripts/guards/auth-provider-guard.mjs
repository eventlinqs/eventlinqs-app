/**
 * BUILD-FAILING GUARD: a provider button may never exist without a gate.
 *
 * The defect: on 2026-08-02 production rendered "Continue with Google" while
 * `google` was disabled on the production Supabase project, and every click
 * landed the user on a raw JSON error page. Nothing in CI was watching, because
 * the code compiled perfectly. It was a configuration state, not a code bug.
 *
 * This guard makes the CODE side of that pairing unskippable, so a future
 * change cannot reintroduce an ungated button. The CONFIGURATION side is
 * watched at runtime by the auth sentinel (src/app/api/cron/auth-sentinel).
 * Together they close the loop: the guard proves every button is gated, the
 * sentinel proves every gate is telling the truth.
 *
 * Five checks, each of which has been observed to fail. See
 * docs/hardening/auth/GUARD-PROOFS.md for the pasted output of every one.
 *
 * Run by `npm run guards`, which `prebuild` invokes, so `npm run build` fails.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { readSource, lineAt, sourceFiles } from './lib/source.mjs'

const ROOT = process.cwd()

/**
 * The registry. A provider is renderable only if it appears BOTH in
 * src/lib/auth/providers.ts and here, with a component that exists.
 */
const PROVIDER_COMPONENTS = {
  google: {
    component: 'GoogleButton',
    file: 'src/components/auth/google-button.tsx',
    /** The identifier that must gate every render of the component. */
    gateToken: 'googleEnabled',
  },
}

/**
 * Components that must be handed a resolved provider state by a server page,
 * keyed by the module they come from. The import path matters: the admin
 * console has its own unrelated `LoginForm` with no OAuth on it at all, and
 * matching on the bare component name flagged it as a false positive.
 */
const GATED_FORMS = [
  { component: 'LoginForm', module: '@/components/auth/login-form' },
  { component: 'SignupForm', module: '@/components/auth/signup-form' },
]

const failures = []
const fail = (msg) => failures.push(msg)

/**
 * Guards must read CODE, not prose. `code` blanks comments and string contents
 * so a doc comment describing a banned pattern cannot fail the build, and
 * `withStrings` keeps literals for the JSX attribute checks.
 */
function read(rel) {
  return readSource(join(ROOT, rel)).code
}

const FILES = sourceFiles(ROOT)

// ---------------------------------------------------------------------------
// CHECK 1: every signInWithOAuth call site is a registered provider button.
// A new provider button dropped into an arbitrary component is the exact shape
// of the regression this exists to stop.
// ---------------------------------------------------------------------------
{
  const registered = new Set(Object.values(PROVIDER_COMPONENTS).map((p) => p.file))
  for (const file of FILES) {
    if (!read(file).includes('signInWithOAuth')) continue
    if (!registered.has(file)) {
      fail(
        `CHECK 1: ${file} calls signInWithOAuth but is not a registered provider button.\n` +
          `          Add it to PROVIDER_COMPONENTS in scripts/guards/auth-provider-guard.mjs\n` +
          `          and to RENDERABLE_PROVIDERS in src/lib/auth/providers.ts, then gate it.`,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// CHECK 2: the runtime registry and this guard's registry agree, and every
// registered component actually exists on disk.
// ---------------------------------------------------------------------------
{
  const providersSrc = readSource(join(ROOT, 'src/lib/auth/providers.ts')).withStrings
  const match = /RENDERABLE_PROVIDERS\s*=\s*\[([^\]]*)\]/.exec(providersSrc)
  if (!match) {
    fail('CHECK 2: could not find RENDERABLE_PROVIDERS in src/lib/auth/providers.ts')
  } else {
    const runtime = [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
    const guard = Object.keys(PROVIDER_COMPONENTS).sort()
    if (runtime.join(',') !== guard.join(',')) {
      fail(
        `CHECK 2: provider registries disagree.\n` +
          `          src/lib/auth/providers.ts: [${runtime.join(', ')}]\n` +
          `          this guard:                [${guard.join(', ')}]`,
      )
    }
    for (const [name, spec] of Object.entries(PROVIDER_COMPONENTS)) {
      if (!existsSync(join(ROOT, spec.file))) {
        fail(`CHECK 2: provider "${name}" names ${spec.file}, which does not exist.`)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// CHECK 3: every render of a provider button sits inside its gate.
//
// Structural rather than clever: find each `<Component` usage outside the
// component's own definition file, then require the gate identifier followed by
// `&&` in the enclosing JSX expression that opens before it. That is precisely
// the `{googleEnabled && (<GoogleButton .../>)}` shape, and an unconditional
// `<GoogleButton />` cannot satisfy it.
// ---------------------------------------------------------------------------
{
  for (const [name, spec] of Object.entries(PROVIDER_COMPONENTS)) {
    for (const file of FILES) {
      if (file === spec.file) continue
      const src = read(file)
      let index = src.indexOf(`<${spec.component}`)
      while (index !== -1) {
        // Walk back to the nearest unclosed JSX expression opener.
        const before = src.slice(0, index)
        const openerAt = before.lastIndexOf('{')
        const enclosing = openerAt === -1 ? '' : before.slice(openerAt)
        const gated = new RegExp(`\\b${spec.gateToken}\\s*&&`).test(enclosing)
        if (!gated) {
          const line = lineAt(src, index)
          fail(
            `CHECK 3: ${file}:${line} renders <${spec.component}> without the ` +
              `"${spec.gateToken} &&" gate.\n` +
              `          An ungated provider button sends the user to a raw JSON error page ` +
              `when "${name}" is disabled.`,
          )
        }
        index = src.indexOf(`<${spec.component}`, index + 1)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// CHECK 4: any page rendering a gated form must resolve the provider state
// server-side. Without this a form could take the prop and every caller could
// quietly pass a literal.
// ---------------------------------------------------------------------------
{
  for (const file of FILES) {
    const src = read(file)
    const withStrings = readSource(join(ROOT, file)).withStrings
    const rendersForm = GATED_FORMS.some(
      (f) => src.includes(`<${f.component}`) && withStrings.includes(f.module),
    )
    if (!rendersForm) continue
    if (!src.includes('isProviderEnabled(') && !src.includes('getEnabledProviders(')) {
      fail(
        `CHECK 4: ${file} renders a gated auth form but never calls ` +
          `isProviderEnabled() or getEnabledProviders().\n` +
          `          The provider state must be resolved on the server, not assumed.`,
      )
    }
  }
}

// ---------------------------------------------------------------------------
// CHECK 5: the gate prop is REQUIRED on every gated form. An optional prop
// silently defaults to undefined, which is falsey today and could be defaulted
// to true by a later edit.
// ---------------------------------------------------------------------------
{
  const formFiles = {
    LoginForm: 'src/components/auth/login-form.tsx',
    SignupForm: 'src/components/auth/signup-form.tsx',
  }
  for (const [form, file] of Object.entries(formFiles)) {
    const src = read(file)
    for (const spec of Object.values(PROVIDER_COMPONENTS)) {
      if (new RegExp(`${spec.gateToken}\\s*\\?\\s*:`).test(src)) {
        fail(
          `CHECK 5: ${form} declares "${spec.gateToken}" as OPTIONAL in ${file}.\n` +
            `          It must be required so no caller can omit the gate.`,
        )
      }
      if (!new RegExp(`${spec.gateToken}\\s*:\\s*boolean`).test(src)) {
        fail(
          `CHECK 5: ${form} does not declare a required "${spec.gateToken}: boolean" prop in ${file}.`,
        )
      }
    }
  }
}

if (failures.length > 0) {
  console.error('\n[auth-provider-guard] FAILED\n')
  for (const f of failures) console.error(`  ${f}\n`)
  console.error(
    `  ${failures.length} violation(s). A provider button that is not gated by a\n` +
      `  server-resolved enabled check is the 2026-08-02 production defect.\n`,
  )
  process.exit(1)
}

console.log('[auth-provider-guard] PASS - every provider button is gated (5 checks).')
