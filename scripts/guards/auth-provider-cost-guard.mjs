/**
 * BUILD-FAILING GUARD: the provider gate may only be paid for where it is used.
 *
 * WHAT THIS PROTECTS. `getEnabledProviders()` is a network call to
 * `{SUPABASE_URL}/auth/v1/settings` behind a five minute in-instance memo. On
 * the two auth pages that render a "Continue with Google" button, that is the
 * price of never showing a button that leads to a raw JSON error page, and it
 * is worth paying. Anywhere else it is pure cost: a cold serverless instance
 * pays real latency (measured at a 65ms median against the TEST project by
 * scripts/verify/auth-provider-cache-cost.mjs) for an answer nothing renders.
 *
 * WHY A GUARD AND NOT A COMMENT. The existing auth-provider-guard enforces one
 * direction, that every button has a gate. Nothing enforced the other, that
 * every gate has a button. Both failures are invisible: an ungated button looks
 * fine until a provider is disabled, and a stray gate call looks fine forever,
 * because it is merely slow and correct. The second is exactly the kind of
 * defect that arrives by copy-paste, when someone starts a new page from
 * login/page.tsx and keeps the resolver call they do not need. It would never
 * fail a test, never show in review, and would quietly put a Supabase round
 * trip on a cold render of a page that has no OAuth on it at all.
 *
 * FOUR CHECKS.
 *
 *   1. A gate call only in a file that renders a gated form.
 *   2. The resolver unreachable from a root layout, middleware or template,
 *      any of which would make every route on the platform pay.
 *   3. The resolver never imported into a Client Component. That would move the
 *      fetch into the browser, reopening the render-before-answer window the
 *      server resolution exists to close, and turning a per-instance memo into
 *      a per-tab one.
 *   4. No call site may hardcode the gate to a literal true. The fail-safe is
 *      only worth having if a caller cannot step around it.
 *
 * Checks 1, 2 and 3 are about cost. Check 4 is about the fail-safe surviving,
 * and it lives here rather than in auth-provider-guard because that guard
 * already proves the page CALLS the resolver; this one proves it USES the
 * answer. Every one is drilled in scripts/verify/guard-failure-drills.mjs.
 *
 * Run by `npm run guards`, which `prebuild` invokes, so `npm run build` fails.
 */
import { readSource, lineAt, sourceFiles } from './lib/source.mjs'
import {
  PROVIDER_COMPONENTS,
  GATED_FORMS,
  RESOLVER_MODULE,
  GATE_CALLS,
} from './lib/provider-registry.mjs'
import { join } from 'node:path'

const ROOT = process.cwd()
const failures = []
const fail = (msg) => failures.push(msg)

/** Guards read CODE. `code` blanks comments and string contents so prose is safe. */
const read = (rel) => readSource(join(ROOT, rel)).code
const readWithStrings = (rel) => readSource(join(ROOT, rel)).withStrings

const FILES = sourceFiles(ROOT)

/**
 * Files permitted to import the resolver module WITHOUT calling a gate. The
 * auth sentinel imports `RENDERABLE_PROVIDERS` to check the live dashboard
 * state against the registry, which is the constant and costs no fetch.
 */
const CONSTANT_ONLY_CONSUMERS = new Set(['src/app/api/cron/auth-sentinel/route.ts'])

/** Does this file render one of the forms that carries a provider button? */
function rendersGatedForm(rel) {
  const src = read(rel)
  const withStrings = readWithStrings(rel)
  return GATED_FORMS.some((f) => src.includes(`<${f.component}`) && withStrings.includes(f.module))
}

/** Does this file call the resolver in a way that costs a settings fetch? */
function callsGate(rel) {
  const src = read(rel)
  return GATE_CALLS.some((call) => src.includes(call))
}

// ---------------------------------------------------------------------------
// CHECK 1: a gate call only where a gated form is rendered.
// ---------------------------------------------------------------------------
for (const file of FILES) {
  if (file === 'src/lib/auth/providers.ts') continue // the definition itself
  if (!callsGate(file)) continue
  if (rendersGatedForm(file)) continue

  const src = read(file)
  const call = GATE_CALLS.find((c) => src.includes(c))
  fail(
    `CHECK 1: ${file}:${lineAt(src, src.indexOf(call))} calls ${call}) but renders no\n` +
      `          provider button. That is a Supabase settings fetch on a cold instance for an\n` +
      `          answer nothing displays. Either render a gated form here, or delete the call.`,
  )
}

// ---------------------------------------------------------------------------
// CHECK 2: never from a root layout, middleware or template. These run on
// every route, so a gate call in one is not a cost on an auth page, it is a
// cost on the whole platform.
// ---------------------------------------------------------------------------
{
  const PLATFORM_WIDE = FILES.filter((f) =>
    /^src\/(middleware|app\/layout|app\/template)\.(ts|tsx)$/.test(f) ||
    /^src\/app\/[^/]*\/(layout|template)\.tsx$/.test(f) ||
    /^middleware\.(ts|tsx)$/.test(f),
  )
  for (const file of PLATFORM_WIDE) {
    if (!callsGate(file) && !readWithStrings(file).includes(RESOLVER_MODULE)) continue
    fail(
      `CHECK 2: ${file} reaches the provider resolver. A layout, template or\n` +
        `          middleware runs on every route, so this puts the settings fetch in front of\n` +
        `          pages that render no provider button. Resolve it in the auth page instead.`,
    )
  }
}

// ---------------------------------------------------------------------------
// CHECK 3: never from a Client Component.
// ---------------------------------------------------------------------------
for (const file of FILES) {
  const raw = readWithStrings(file)
  if (!/^\s*['"]use client['"]/m.test(raw.slice(0, 400))) continue
  if (!raw.includes(RESOLVER_MODULE)) continue
  fail(
    `CHECK 3: ${file} is a Client Component and imports ${RESOLVER_MODULE}.\n` +
      `          Resolving in the browser puts a network round trip in front of the button,\n` +
      `          so the page renders before the answer arrives, which is the window the\n` +
      `          server-side resolution exists to close. Pass the resolved boolean as a prop.`,
  )
}

// ---------------------------------------------------------------------------
// CHECK 4: no call site may hardcode the gate to a literal true.
//
// A page could satisfy auth-provider-guard CHECK 4 by calling the resolver and
// then ignoring it. That is the fail-safe defeated while every guard is green.
// ---------------------------------------------------------------------------
for (const file of FILES) {
  const src = read(file)
  for (const spec of Object.values(PROVIDER_COMPONENTS)) {
    const patterns = [
      // <LoginForm googleEnabled={true} />
      new RegExp(`${spec.gateToken}\\s*=\\s*\\{\\s*true\\s*\\}`),
      // const googleEnabled = true
      new RegExp(`\\b${spec.gateToken}\\s*=\\s*true\\b`),
      // { googleEnabled: true }
      new RegExp(`${spec.gateToken}\\s*:\\s*true\\b`),
    ]
    const hit = patterns.find((p) => p.test(src))
    if (!hit) continue
    fail(
      `CHECK 4: ${file}:${lineAt(src, src.search(hit))} hardcodes "${spec.gateToken}" to true.\n` +
        `          The fail-safe only works if the rendered state comes from the resolver. A\n` +
        `          literal true renders the button while the provider is disabled, which is\n` +
        `          precisely the 2026-08-02 production defect with the guard still green.`,
    )
  }
}

if (failures.length > 0) {
  console.error('\n[auth-provider-cost-guard] FAILED\n')
  for (const f of failures) console.error(`  ${f}\n`)
  console.error(
    `  ${failures.length} violation(s). The provider gate is worth its cost on the two\n` +
      `  pages that render a button, and is pure cost everywhere else.\n`,
  )
  process.exit(1)
}

console.log(
  '[auth-provider-cost-guard] PASS - the provider gate is paid for only where it is used (4 checks).',
)
