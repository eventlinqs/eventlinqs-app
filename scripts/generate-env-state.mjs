/**
 * PART C: the handover record, GENERATED.
 *
 *   node scripts/generate-env-state.mjs
 *
 * Writes docs/verification/ENV-STATE.md from two inputs and nothing else: the
 * manifest in src/lib/env/manifest.mjs, and a LIVE read of the two configuration
 * stores performed by scripts/check-env-stores.mjs. Nothing in the output is
 * hand-typed, which is the whole point: a hand-written environment document is
 * correct on the day it is written and silently wrong the moment somebody edits
 * a dashboard. This one is regenerated, and the guards remain the authority.
 *
 * NEVER WRITES A VALUE. The document carries presence, scope, branch,
 * sensitivity, length and an 8-character SHA-256 fingerprint. A fingerprint is
 * recorded only where the store already reveals the value, so writing it down
 * discloses nothing that was not already readable, and it lets a future session
 * confirm a value has or has not moved.
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { ENV_MANIFEST, CROSS_RULES, policyFor, shapeFor } from '../src/lib/env/manifest.mjs'
import { evaluateStores } from '../src/lib/env/manifest-checks.mjs'

const OUT = 'docs/verification/ENV-STATE.md'
const SCOPES = ['production', 'preview', 'development']

const tmp = path.join(os.tmpdir(), `el-envstate-${crypto.randomBytes(5).toString('hex')}.json`)
let inventory
try {
  execFileSync('node', ['scripts/check-env-stores.mjs', '--mode=stores', `--json=${tmp}`], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
} catch {
  // A non-zero exit means the stores DISAGREE with the manifest, which is
  // exactly the state this document exists to record. The inventory is still
  // written, so the run continues.
}
if (!fs.existsSync(tmp)) {
  console.error(
    `Could not read the stores. ${OUT} was NOT regenerated, because a handover document that quietly ` +
      `reports a stale picture is worse than none. Check: npx vercel whoami, and gh auth status.`,
  )
  process.exit(1)
}
inventory = JSON.parse(fs.readFileSync(tmp, 'utf8'))
fs.rmSync(tmp, { force: true })

const verdict = evaluateStores(inventory)
const findingsFor = name => verdict.findings.filter(f => f.name === name)
const recordsFor = name => inventory.records.filter(r => r.name === name)
const ghSecrets = new Set(inventory.githubSecrets ?? [])

/** PRESENT AND CORRECT / PRESENT BUT WRONG SCOPE / MISSING, per the manifest. */
function statusFor(entry) {
  const f = findingsFor(entry.name)
  if (f.some(x => ['missing-scope', 'missing-github-secret'].includes(x.state))) return 'MISSING'
  if (f.some(x => ['forbidden-scope', 'wrong-branch-scope'].includes(x.state))) return 'PRESENT BUT WRONG SCOPE'
  if (f.some(x => x.state === 'readable-secret')) return 'PRESENT BUT READABLE'
  return 'PRESENT AND CORRECT'
}

function scopeCell(entry) {
  const rows = recordsFor(entry.name)
  if (rows.length === 0) return 'none'
  return rows
    .map(r => (r.gitBranch ? `${r.scope} (${r.gitBranch})` : r.scope))
    .sort()
    .join(', ')
}

function sensitivityCell(entry) {
  const rows = recordsFor(entry.name).filter(r => r.readable !== null)
  if (rows.length === 0) return entry.publicVar ? 'public by design' : 'unknown'
  const readable = rows.filter(r => r.readable)
  if (readable.length === 0) return 'withheld on read'
  return `READABLE on ${readable.map(r => r.scope).join(', ')}`
}

function fingerprintCell(entry) {
  const rows = recordsFor(entry.name).filter(r => r.fp)
  if (rows.length === 0) return '-'
  return [...new Set(rows.map(r => `${r.scope}:${r.fp}`))].join(' ')
}

const rows = ENV_MANIFEST.map(e => ({
  name: e.name,
  status: statusFor(e),
  required: SCOPES.filter(s => policyFor(e, s) === 'required').join(', ') || 'none',
  forbidden: SCOPES.filter(s => policyFor(e, s) === 'forbidden').join(', ') || 'none',
  scopes: scopeCell(e),
  sensitive: sensitivityCell(e),
  fp: fingerprintCell(e),
  payment: e.paymentCritical ? 'YES' : 'no',
  gh: e.githubActions ? (ghSecrets.has(e.name) ? 'required, present' : 'required, MISSING') : 'not required',
  shape: shapeFor(e, 'production').describe,
}))

const counts = {
  correct: rows.filter(r => r.status === 'PRESENT AND CORRECT').length,
  wrongScope: rows.filter(r => r.status === 'PRESENT BUT WRONG SCOPE').length,
  readable: rows.filter(r => r.status === 'PRESENT BUT READABLE').length,
  missing: rows.filter(r => r.status === 'MISSING').length,
}

const table = [
  '| Variable | State | Required on | Forbidden on | Scopes present | Read-back | Fingerprint | Real payment | GitHub Actions |',
  '|---|---|---|---|---|---|---|---|---|',
  ...rows.map(r =>
    `| \`${r.name}\` | ${r.status} | ${r.required} | ${r.forbidden} | ${r.scopes} | ${r.sensitive} | ${r.fp} | ${r.payment} | ${r.gh} |`,
  ),
].join('\n')

const shapes = [
  '| Variable | Expected shape |',
  '|---|---|',
  ...rows.map(r => `| \`${r.name}\` | ${r.shape} |`),
].join('\n')

const openFindings = verdict.findings.length
  ? verdict.findings.map(f => `- **${f.name}** [${f.scope}]: ${f.reason}`).join('\n')
  : '_None. Every manifest expectation holds across both stores._'

const ghList = [...ghSecrets].sort().map(n => `- \`${n}\``).join('\n') || '_none_'

const doc = `# Environment state

> **THIS FILE IS GENERATED. DO NOT EDIT IT.**
>
> It is written from two inputs and nothing else: the manifest in
> \`src/lib/env/manifest.mjs\`, and a live read of the Vercel scopes and the
> GitHub Actions secret list. Editing it changes nothing, and a hand-typed
> environment document is correct on the day it is written and silently wrong the
> moment somebody edits a dashboard, which is the exact failure this machinery
> exists to prevent.
>
> **The manifest and the guards are the authority, not this page.** This is a
> snapshot for a human to read. The enforcement lives in:
>
> | Lock | Where | What it does |
> |---|---|---|
> | 1 | \`src/lib/env/manifest.mjs\` | declares the contract for every variable |
> | 2 | \`scripts/check-public-env.mjs\` (prebuild) | FAILS THE BUILD on a violation |
> | 3 | \`scripts/check-env-stores.mjs\` | fails on cross-store disagreement |
> | 4 | \`src/lib/health/checks.ts\` (check \`manifest\`) | alerts at runtime, on the sentinel schedule |
>
> Regenerate with:
>
> \`\`\`
> node scripts/generate-env-state.mjs
> \`\`\`
>
> It needs an authenticated Vercel CLI (\`npx vercel whoami\`) and an
> authenticated \`gh\`. If either is unavailable the file is left untouched rather
> than rewritten from a partial read.

Manifest: **${ENV_MANIFEST.length} variables**, **${CROSS_RULES.length} cross-variable rules**.
Store records read: **${inventory.records.length}**.

- PRESENT AND CORRECT: **${counts.correct}**
- PRESENT BUT WRONG SCOPE: **${counts.wrongScope}**
- PRESENT BUT READABLE (must be sensitive, is not): **${counts.readable}**
- MISSING: **${counts.missing}**

## Every variable

"Real payment" means production cannot take, or cannot complete, a genuine
purchase without it.

"Read-back" is the property that actually matters for a secret: can anyone with
project access pull the value out of the store in plain text. \`withheld on read\`
means the store refuses to return it. A withheld record is either sensitive
(correct) or empty (a defect), and Lock 2 and Lock 4 settle which, because a
build and a serving deployment can both see the real value.

${table}

## Expected shapes

${shapes}

## Open findings

${openFindings}

## GitHub Actions repository secrets

Read live via \`gh secret list\`. Only names are ever listed; GitHub does not
reveal a secret value to anyone, including its owner.

${ghList}

## Cross-variable rules

${CROSS_RULES.map(r => `### ${r.id}\n\n${r.describe}\n\nApplies to: ${r.appliesTo.join(', ')}. Needs: ${r.needs === 'value' ? 'the real values, so it runs in the build and in the serving deployment' : 'both stores, so it runs in the store checker'}.`).join('\n\n')}
`

fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, doc)
console.log(`${OUT} regenerated: ${rows.length} variables, ${verdict.findings.length} open finding(s).`)
