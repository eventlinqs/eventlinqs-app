/**
 * NO SILENT SUBMIT: a control the user operates must never complete with
 * neither a visible result nor a visible error.
 *
 * ---------------------------------------------------------------------------
 * WHY. Two of these have now cost real time, and they look identical from the
 * outside: the user acts, nothing happens, and nothing says why.
 *
 *   PAID PUBLISH (fixed earlier). The publish path could return without
 *   surfacing its refusal.
 *
 *   THE DISCOUNT FORM, 29 August 2026, journey 8. "Create Code" made no
 *   request, showed no error, and wrote no row. The cause was not in any
 *   handler: #discounts-value carried min="0.01" with step="1", and HTML steps
 *   from `min`, not from zero. So 20 was a stepMismatch sitting between 19.01
 *   and 20.01, form.checkValidity() was false, and the browser refused the
 *   submit BEFORE React saw the event. onSubmit never fired. Two sessions
 *   looked at the handler and the server action; the defect was four
 *   attributes above them.
 *
 *   The same file also had handleToggle doing `if (!result.error) { ...apply }`
 *   with no else, so a refused toggle changed nothing and said nothing.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS CAN AND CANNOT JUDGE, stated so the scope is not mistaken for
 * completeness.
 *
 * It CANNOT decide in general whether a UI "shows something". That would need
 * to model rendering, and a guard that tries produces noise, gets muted, and
 * protects nothing.
 *
 * What it CAN decide is three shapes that are silent by construction, where no
 * amount of surrounding code can rescue them:
 *
 *   A. NATIVE VALIDATION CAN NEVER PASS. A number input whose `min` is not an
 *      exact multiple of its `step`, so no round value a person types is
 *      submittable and the browser refuses the whole form. This is arithmetic,
 *      not judgement.
 *
 *   B. THE REFUSAL IS NEVER READ. A server action returning a result whose
 *      `error` the caller discards entirely, or destructures without taking
 *      `error`. If it is never read it cannot be shown.
 *
 *   C. THE REFUSAL IS READ AND DROPPED. `if (!x.error) { ...success }` with no
 *      `else`. The error branch is, literally, empty.
 *
 * A guard that prints nothing proves nothing, so this prints what it scanned
 * and FAILS when it scanned nothing.
 */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { gitEnv } from '../lib/git-env.mjs'

const NAME = '[no-silent-submit]'

function tracked(pattern) {
  return execFileSync('git', ['ls-files', pattern], { encoding: 'utf8', env: gitEnv() })
    .split('\n')
    .filter(Boolean)
}

/* ------------------------------------------------------------------ *
 * A. A number input whose min and step disagree.
 * ------------------------------------------------------------------ */

/** Every literal a `step={...}` or `step="..."` can evaluate to. */
function stepLiterals(tag) {
  const out = []
  const literal = tag.match(/\bstep=["']([^"']+)["']/)
  if (literal) out.push(literal[1])
  const expr = tag.match(/\bstep=\{([^}]*)\}/)
  if (expr) for (const m of expr[1].matchAll(/'([^']*)'|"([^"]*)"/g)) out.push(m[1] ?? m[2])
  return out
}

/** Every literal a `min={...}` or `min="..."` can evaluate to. */
function minLiterals(tag) {
  const out = []
  const literal = tag.match(/\bmin=["']([^"']+)["']/)
  if (literal) out.push(literal[1])
  const expr = tag.match(/\bmin=\{([^}]*)\}/)
  if (expr) for (const m of expr[1].matchAll(/'([^']*)'|"([^"]*)"/g)) out.push(m[1] ?? m[2])
  return out
}

function checkNumberInputs() {
  const files = tracked('src/**/*.tsx')
  let filesWithNumberInputs = 0
  let inputs = 0
  const findings = []

  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    if (!src.includes('type="number"')) continue
    filesWithNumberInputs++

    for (const part of src.split(/<input\b/).slice(1)) {
      const close = part.indexOf('/>')
      const rawTag = close === -1 ? part.slice(0, 600) : part.slice(0, close + 2)
      /*
       * STRIP COMMENTS BEFORE MATCHING. The first version of this guard read a
       * block comment INSIDE the very JSX tag that documents the defect, and
       * reported the fixed input as still broken. A guard that cannot tell code
       * from prose about code is a guard that fires on its own explanation.
       */
      const tag = rawTag.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
      if (!/type=["']number["']/.test(tag)) continue
      inputs++

      const mins = minLiterals(tag)
      const steps = stepLiterals(tag)
      if (!mins.length || !steps.length) continue

      const id = tag.match(/\bid=["']([^"']+)["']/)?.[1] ?? '(no id)'
      const line = src.slice(0, src.indexOf(tag.slice(0, 60))).split('\n').length

      for (const rawMin of mins) {
        for (const rawStep of steps) {
          if (rawStep === 'any') continue
          const min = Number(rawMin)
          const step = Number(rawStep)
          if (!Number.isFinite(min) || !Number.isFinite(step) || step <= 0) continue
          // HTML validates value against min + n*step. When min is not an exact
          // multiple of step, no whole number is ever a valid value.
          const ratio = min / step
          if (Math.abs(ratio - Math.round(ratio)) < 1e-9) continue
          findings.push({
            file,
            line,
            detail:
              `#${id} has min="${rawMin}" with step="${rawStep}". HTML steps from min, ` +
              `so the valid values are ${rawMin}, ${min + step}, ${min + 2 * step}, ... ` +
              `A round number is a stepMismatch, form.checkValidity() is false, and the ` +
              `browser refuses the submit before any handler runs. Use step="any", or ` +
              `make min an exact multiple of step.`,
          })
        }
      }
    }
  }

  return { scanned: filesWithNumberInputs, units: inputs, unitLabel: 'number input(s)', findings }
}

/* ------------------------------------------------------------------ *
 * B + C. A refusal that is never read, or read and dropped.
 * ------------------------------------------------------------------ */

const ACTION_MODULE = /^(@\/app\/actions\/|\.{1,2}\/.*actions?$|\.{1,2}\/actions)/

function actionNamesImportedBy(src) {
  const names = new Set()
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    if (!ACTION_MODULE.test(m[2])) continue
    for (const raw of m[1].split(',')) {
      const name = raw.trim().split(/\s+as\s+/).pop().trim()
      if (name && /^[a-z][\w$]*$/.test(name)) names.add(name)
    }
  }
  return names
}

function checkActionResults() {
  const files = tracked('src/**/*.tsx')
  let clientFiles = 0
  let callSites = 0
  const findings = []

  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    if (!/^['"]use client['"]/m.test(src)) continue
    const actions = actionNamesImportedBy(src)
    if (!actions.size) continue
    clientFiles++

    for (const action of actions) {
      const esc = action.replace(/[$]/g, '\\$')

      /*
       * THE RULE, AND WHY IT IS THIS NARROW.
       *
       * The first version demanded that every call site read `.error`. It
       * produced nine false positives out of thirteen findings, because
       * surfacing a refusal has several correct shapes this project already
       * uses: handing the WHOLE result to a state setter that renders it
       * (setResult(r)), reading a different refusal field on a query that has
       * no `error` at all (pos.found, gate.ok), or branching on `res.ok` and
       * showing `res.error` in the else. A guard that calls nine correct
       * things broken is a guard somebody turns off.
       *
       * So it flags only what is silent BY CONSTRUCTION, where no surrounding
       * code can rescue it:
       *   1. the result is never referenced again, anywhere;
       *   2. the call is awaited with the result discarded outright;
       *   3. `if (!x.error) { ...success }` with no else, so the refusal
       *      branch is literally empty.
       */

      // const x = await action(...)
      for (const m of src.matchAll(new RegExp(`(?:const|let)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*await\\s+${esc}\\s*\\(`, 'g'))) {
        callSites++
        const v = m[1]
        const rest = src.slice(m.index + m[0].length)
        const line = src.slice(0, m.index).split('\n').length

        // 1. Never referenced again: the refusal cannot reach anything.
        const usedAgain = new RegExp(`\\b${v}\\b`).test(rest)
        if (!usedAgain) {
          findings.push({
            file, line,
            detail: `the result of ${action}() is assigned to "${v}" and never referenced again, so a refusal cannot reach the user.`,
          })
          continue
        }

        // 3. if (!v.error…) { … } with no else.
        const dropped = new RegExp(`if\\s*\\(\\s*!\\s*${v}\\s*\\??\\.\\s*error\\b[^)]*\\)\\s*\\{`).exec(rest)
        if (dropped) {
          const body = matchBrace(rest, dropped.index + dropped[0].length - 1)
          const tail = rest.slice(body.end + 1, body.end + 40)
          if (!/^\s*else\b/.test(tail)) {
            findings.push({
              file,
              line: line + rest.slice(0, dropped.index).split('\n').length - 1,
              detail: `"if (!${v}.error) { ... }" has no else, so a refusal from ${action}() changes nothing on screen and says nothing.`,
            })
          }
        }
      }

      // await action(...) with the result thrown away entirely
      for (const m of src.matchAll(new RegExp(`(^|[;{}\\n]\\s*)await\\s+${esc}\\s*\\(`, 'gm'))) {
        callSites++
        const line = src.slice(0, m.index).split('\n').length
        findings.push({
          file, line,
          detail: `${action}() is awaited and its result discarded, so a refusal is invisible by construction.`,
        })
      }
    }
  }

  return { scanned: clientFiles, units: callSites, unitLabel: 'server-action call site(s)', findings }
}

/** Index of the matching close brace for the open brace at `open`. */
function matchBrace(s, open) {
  let depth = 0
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++
    else if (s[i] === '}') {
      depth--
      if (depth === 0) return { end: i }
    }
  }
  return { end: s.length - 1 }
}

/* ------------------------------------------------------------------ *
 * Reviewed admissions. Each names the call site and why silence is correct
 * there. An entry that stops matching is reported, so the list cannot rot.
 * ------------------------------------------------------------------ */
const ADMITTED = [
  {
    file: 'src/app/squad/[token]/pay/[member_id]/squad-pay-form.tsx',
    line: 73,
    why:
      'Recording marketing consent, deliberately best-effort and explicitly caught: it sits between the card ' +
      'submission and stripe.confirmPayment, and the buyer is mid-payment. A consent-ledger fault must never ' +
      'interrupt a payment or put a scary message in front of someone whose card is being charged. The consent ' +
      'itself is not a control the user is waiting on a result from; the payment is, and that one speaks.',
  },
]

/* ------------------------------------------------------------------ */

const numbers = checkNumberInputs()
const results = checkActionResults()

console.log(
  `${NAME} scanned ${numbers.scanned} file(s) carrying a number input (${numbers.units} ${numbers.unitLabel}) ` +
    `and ${results.scanned} client file(s) importing a server action (${results.units} ${results.unitLabel}).`,
)

if (numbers.units === 0 || results.units === 0) {
  console.error(
    `${NAME} FAIL - this guard scanned nothing, so it proved nothing. ` +
      `Either the file layout moved or the matchers are broken. A guard that finds zero units is a broken guard, not a pass.`,
  )
  process.exit(1)
}

const admittedKeys = new Set(ADMITTED.map(a => `${a.file}:${a.line}`))
const all = [...numbers.findings, ...results.findings]
const live = all.filter(f => !admittedKeys.has(`${f.file}:${f.line}`))

for (const entry of ADMITTED) {
  const stillThere = all.some(f => `${f.file}:${f.line}` === `${entry.file}:${entry.line}`)
  console.log(`    ${stillThere ? 'matched     ' : 'no match now'} ${entry.file}:${entry.line}`)
  console.log(`        ${entry.why}`)
}

if (live.length) {
  console.error(`\n${NAME} FAIL - ${live.length} control(s) can complete in silence:\n`)
  for (const f of live) console.error(`  ${f.file}:${f.line}\n      ${f.detail}\n`)
  console.error(
    'A user who acts and is told nothing assumes the product is broken, and is right. ' +
      'Show the result or show the refusal.',
  )
  process.exit(1)
}

console.log(`${NAME} PASS - every scanned control either shows its result or names its refusal.`)
