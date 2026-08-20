// No shebang on this file. Vite does not strip one when a test imports the module, and the whole
// suite then dies at collection with "SyntaxError: Invalid or unexpected token" and no line number,
// reporting "no tests" and passing vacuously. Every caller runs this as `node <path>`.
/**
 * No tracked file may contain a plaintext credential.
 *
 * THE INCIDENT. On 2026-08-08 GitGuardian reported a Company Email Password
 * exposed in this repository, pushed that day. The search found it in ELEVEN
 * committed automation scripts as `const PASSWORD = '<literal>'`, and reproduced
 * into THREE security documents, including one written by this very hardening
 * pass: the audit quoted the leaking URL from the brief verbatim, and the URL
 * contained the password.
 *
 * That last part is the reason this guard exists rather than a note in a runbook.
 * The person most alert to the defect still committed it, because quoting evidence
 * feels like documentation rather than disclosure. A guard does not get tired and
 * does not feel that distinction.
 *
 * WHAT THIS CANNOT DO, said plainly. It protects the WORKING TREE. It cannot
 * un-expose a credential already in git history: the password above sat in 11
 * commits and had already reached a third party's systems by the time it was
 * found. Removing a secret from HEAD is housekeeping. ROTATION is the fix. If this
 * guard ever fires, rotate first and edit second.
 *
 * WHAT IT LOOKS FOR. Assignment of a literal to a credential-named identifier, and
 * well-known secret prefixes with a high-entropy body. Deliberately NOT a generic
 * entropy scan: this repository is full of hashes, ids and base64 rasters, and a
 * guard that cries wolf gets disabled, which is worse than no guard.
 *
 * Exit 0 = clean. Exit 1 = a credential is committed. Build gate.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'coverage',
  'test-results', 'playwright-report', '.vercel', 'design-assets',
])
const SCAN_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.md', '.json', '.sql',
  '.yml', '.yaml', '.txt', '.sh', '.ps1', '.env.example',
])

/**
 * A credential-named identifier assigned a LITERAL.
 *
 * `requireEnv('X')`, `process.env.X` and template reads are all fine, which is the
 * whole point: the fix for a hit is to read the value at runtime.
 */
const ASSIGNED_LITERAL =
  /\b(?:const|let|var)\s+[A-Za-z_$][\w$]*(?:PASSWORD|PASSWD|PASS|SECRET|TOKEN|APIKEY|API_KEY|CREDENTIAL)[\w$]*\s*=\s*(['"`])([^'"`\n]{6,})\1/gi

/** Key shapes that are only ever real if the body is long and random-looking. */
const PREFIXED_SECRET =
  /\b(sk_live_|sk_test_|rk_live_|whsec_|re_[A-Za-z0-9]|SG\.[A-Za-z0-9]|xox[baprs]-|ghp_|github_pat_|AIza)[A-Za-z0-9_-]{16,}/g

/** A JWT, which is how a Supabase service-role key looks. */
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g

/**
 * Locations REVIEWED and confirmed not to be a live credential, each with the
 * reason. Printed on every run, exactly like the RLS baseline, so the list stays
 * arguable instead of rotting into an unexamined allowlist.
 *
 * Adding a line here is a security decision and belongs in review. A test asserts
 * every entry carries a reason.
 */
export const REVIEWED = {
  'src/lib/queue/tokens.ts':
    'DEV_FALLBACK_SECRET is a deliberate dev-only constant. resolveSecret() returns ' +
    'null in production when QUEUE_SECRET is absent, so the fallback is unreachable ' +
    'there, and the file documents the exact attack it would otherwise enable ' +
    '(minting an admission token to walk past the queue gate in src/proxy.ts). ' +
    'Verified by reading resolveSecret, not assumed.',
  'tests/unit/payments/sentinel-probes-every-secret.test.ts':
    'Synthetic six-character fixture strings used to prove the payment sentinel ' +
    'probes every secret name. Not credentials to anything.',
  'tests/unit/observability/pii-scrub.test.ts':
    'A synthetic JWT-shaped string, present so the scrubber can be proven to remove ' +
    'it. Redacting it would delete the test.',
  'tests/unit/security/pii-egress.test.ts':
    'Synthetic sk_live_ and JWT-shaped strings for the same reason: the test asserts ' +
    'the scrubber strips them.',
  'tests/unit/queue/tokens.test.ts':
    'PUBLIC_DEV_SECRET mirrors the dev-only constant from src/lib/queue/tokens.ts so ' +
    'the signing behaviour can be tested. It signs nothing in any deployed ' +
    'environment, because resolveSecret refuses the fallback in production.',
  'tests/unit/tickets/transfer.test.ts':
    'UUID-shaped fixtures (rotated-secret-N-0000-...) proving the transfer RPC rotates ' +
    'a ticket secret so the old QR dies. Obviously synthetic by construction.',
  // A PREFIX COLLISION, not a credential. `re_` is the Resend API key prefix,
  // which is what this guard is looking for, and it is ALSO the prefix of a Stripe
  // REFUND id (re_3U5mGQ...). These two files are the recorded evidence of the
  // 2026-08-18 refund proofs, and the refund id is the whole point of the record:
  // it is the identifier that ties the in-app refunds row to the Stripe object, it
  // is not secret, and it authenticates nothing. Kept in the baseline rather than
  // stripped from the artefact, because deleting the identifier to satisfy a
  // prefix match would make the evidence unverifiable.
  'docs/verification/refund-dashboard-2026-08-18/refund-dashboard-e2e.json':
    'Stripe REFUND ids (re_...), not Resend API keys. Same prefix, different system. ' +
    'A refund id is a public object identifier and is the link between the in-app ' +
    'refunds row and the Stripe refund; it grants nothing.',
  'docs/verification/refund-dashboard-2026-08-18/refund-orphan-drill.json':
    'Stripe REFUND id (re_...) from the orphan-refund drill, for the same reason. ' +
    'Also note this file deliberately records NO ticket bearer secret: /t/[code] is ' +
    'bearer-authenticated, so the secret is the credential and is never written out.',
  'tests/unit/payments/webhook-multi-secret.test.ts':
    'Synthetic whsec_ and sk_test_ fixtures proving the Stripe webhook tries every ' +
    'configured signing secret. Testing signature verification requires strings of ' +
    'that shape; none is a real key.',
  'src/lib/env/refs.mjs':
    'A doc comment showing the SHAPE of a Stripe key so the fingerprinting helper ' +
    'can be explained. No key material.',
  'docs/modules/M1-foundation.md':
    'Labelled placeholders, and the one JWT present was decoded before redaction: ' +
    'role claim was anon (public by design) and the project ref matched neither ' +
    'PROD nor TEST, so it belonged to an abandoned module-1 scaffold. Redacted ' +
    'anyway to keep the guard honest.',
}

/** Values that are obviously not secrets. */
function isPlaceholder(v) {
  const s = v.toLowerCase()
  return (
    /^[x._*-]+$/.test(s) ||
    s.includes('placeholder') ||
    s.includes('your-') ||
    s.includes('your_') ||
    s.includes('example') ||
    s.includes('redacted') ||
    s.includes('changeme') ||
    s.includes('dummy') ||
    s.includes('fake') ||
    s.includes('notreal') ||
    s.includes('shouldnotappear') ||
    s.includes('<') ||
    s.startsWith('test-') ||
    s === 'password' ||
    /^\$\{/.test(v) ||
    /^process\.env/.test(v)
  )
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = path.join(dir, entry)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) walk(full, out)
    else if (SCAN_EXT.has(path.extname(entry)) || entry === '.env.example') out.push(full)
  }
  return out
}

const findings = []
const reviewedHit = new Set()

for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/')
  // This guard necessarily contains the patterns it hunts for.
  if (rel === 'scripts/guards/no-plaintext-credential.mjs') continue
  if (REVIEWED[rel]) { reviewedHit.add(rel); continue }

  let src
  try {
    src = readFileSync(file, 'utf8')
  } catch {
    continue
  }

  for (const m of src.matchAll(ASSIGNED_LITERAL)) {
    if (isPlaceholder(m[2])) continue
    findings.push({
      rel,
      line: src.slice(0, m.index).split('\n').length,
      why: 'credential-named identifier assigned a literal',
    })
  }
  for (const m of src.matchAll(PREFIXED_SECRET)) {
    findings.push({
      rel,
      line: src.slice(0, m.index).split('\n').length,
      why: `well-known secret prefix with a high-entropy body (${m[1].replace(/[A-Za-z0-9]$/, '')}...)`,
    })
  }
  for (const m of src.matchAll(JWT)) {
    findings.push({
      rel,
      line: src.slice(0, m.index).split('\n').length,
      why: 'JWT, which is the shape of a Supabase service-role key',
    })
  }
}

// Always printed. A baseline nobody reads is an allowlist that rots.
if (reviewedHit.size) {
  console.log(`[no-plaintext-credential] ${reviewedHit.size} reviewed location(s), skipped with a stated reason:`)
  for (const r of [...reviewedHit].sort()) console.log(`    ${r}: ${REVIEWED[r]}`)
  console.log('')
}

const staleReviewed = Object.keys(REVIEWED).filter((r) => !reviewedHit.has(r))
if (staleReviewed.length) {
  console.log(`[no-plaintext-credential] ${staleReviewed.length} reviewed entry(ies) no longer match anything - delete the line:`)
  for (const r of staleReviewed) console.log(`    ${r}`)
  console.log('')
}

if (findings.length) {
  console.error(`[no-plaintext-credential] FAIL - ${findings.length} possible credential(s) in tracked files.`)
  console.error('Values are NOT printed. Open each location.\n')
  for (const f of findings) console.error(`  ${f.rel}:${f.line}\n    ${f.why}`)
  console.error(
    '\nROTATE FIRST, EDIT SECOND. If this is a real credential it is already in git\n' +
      'history and removing it from the working tree does not un-expose it.\n' +
      'Then replace the literal with a runtime read that fails closed, as the drive\n' +
      'scripts now do:\n' +
      "  const PASSWORD = requireEnv('EL_DRIVE_PASSWORD')\n",
  )
  process.exit(1)
}

console.log('[no-plaintext-credential] PASS - no plaintext credential in tracked files.')
