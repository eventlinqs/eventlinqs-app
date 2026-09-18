/**
 * GUARD: THE MONEY DRIVES CLICK THE BUTTON THEY NAME, AND ONLY THAT ONE.
 *
 * Close-out FO1, 18 September 2026. Every driven proof that a ticket can be
 * bought on this platform goes through one helper, `drivePurchase` in
 * scripts/verify/lib/refund-proof-fixture.mjs: the FO1 founding purchase, the
 * waived-fee proof, the R1 out-of-app refund proof and the orphan-inventory
 * drill all reach checkout by asking Playwright for a button and pressing it.
 *
 * WHAT HAPPENED, because the shape of the failure is the reason this exists.
 * That helper selected the quantity control with `/^(\+|increase|add)/i` and
 * took `.first()`. On 14 September an "Add to calendar" button shipped onto the
 * event page (SEO5, commit ee8d09da) ABOVE the ticket panel in the DOM, and its
 * accessible name begins with "Add". From that moment every drive opened a
 * calendar menu instead of adding a ticket, left the quantity at 0, and then
 * reported that the reserve button was ABSENT, because at zero tickets the
 * product correctly labels its call to action "Select tickets to continue"
 * rather than "Checkout · $x".
 *
 * The result was a run that said, at three viewports, that the ticket panel had
 * never rendered. It had rendered perfectly. A loose selector does not fail: it
 * quietly indicts the product for the harness's mistake, and the accusation is
 * detailed enough to be believed.
 *
 * WHAT IT CHECKS, in four parts.
 *
 *   1. THE PRODUCT STILL LABELS THE CONTROL THE DRIVES PRESS. The tier increase
 *      button in src/components/checkout/ticket-selector.tsx is found by its
 *      HANDLER, `setTierQty(tier.id, +1, tier)`, and it is that button's
 *      accessible name the selector is held to. Found by behaviour rather than
 *      by name, because this guard's own red drill walked through the first
 *      version: renaming the tier label left the ADD-ON label still saying
 *      "Increase", a count of labels stayed non-zero, and the guard passed while
 *      the button every money drive presses had become unreachable. The tier
 *      DECREASE control is found the same way and must NOT answer to the
 *      selector: a drive that presses minus removes the ticket it just added.
 *
 *   2. THE DRIVE'S SELECTOR IS ANCHORED AT BOTH ENDS. A prefix pattern is
 *      banned here by name. `^increase` matches "Increase quantity" on some
 *      other panel; no anchor at all matches anything containing the word.
 *      Only `^...$` says which button is meant.
 *
 *   3. THE SELECTOR ACTUALLY MATCHES THE PRODUCT'S LABEL. An anchored regex
 *      that matches nothing is worse than a loose one: it fails on the first
 *      wait rather than on the assertion, so the drive reports the panel
 *      missing all over again.
 *
 *   4. NOTHING ELSE ANSWERS TO IT, IN ANY DRIVE, NOT JUST THAT HELPER. Every
 *      <button> in src/ is read and its accessible name computed the way a
 *      browser would. Every `getByRole('button', { name: /../ })` in scripts/ is
 *      read as a real RegExp. Any selector that matches the tier increase
 *      control is one somebody wrote to add a ticket, and if it ALSO matches
 *      another button it fails: Playwright takes `.first()` in DOM order and the
 *      drive does not get to choose.
 *
 *      SCOPING THIS TO ONE FILE WAS THE FIRST VERSION'S MISTAKE, found minutes
 *      after it first went green. `drivePurchase` was fixed and the guard
 *      passed while paid-purchase-webhook-e2e, refund-dashboard-e2e and
 *      share-conversion-e2e were still carrying the identical
 *      `/^(\+|increase|add)/i`. A guard watching one door in a building with
 *      four reports that the building is secure.
 *
 *      A selector that does NOT reach the quantity control is out of scope and
 *      is left alone. The reserve selector legitimately accepts several labels
 *      because the product shows a different one per state.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not read a database, a network or a
 * running server, so it runs identically on a laptop, in CI and on the Vercel
 * build host. It reads only src/ and scripts/, both of which are uploaded. It
 * judges the QUANTITY control only: the reserve selector deliberately accepts
 * more than one label because the product shows a different one per viewport,
 * and pinning that is a different job with a different invariant.
 *
 * KNOWN LIMIT, stated rather than hidden: the accessible name of a button whose
 * label is entirely a JSX expression (`{isPending ? 'Reserving…' : 'Checkout'}`)
 * cannot be read statically, so such a button is counted as unnamed and cannot
 * collide here. That is the honest boundary of a static check.
 *
 * Proven red and green: see C:\\dev\\EVIDENCE\\FO1\\selector-guard-red.txt and
 * selector-guard-green.txt.
 *
 * Run: node scripts/guards/drive-quantity-control-selector.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { declareWork } from '../lib/work-report.mjs'
import { buttonsIn } from './lib/jsx-buttons.mjs'

const ROOT = process.cwd()
const TAG = '[drive-quantity-selector]'

const SELECTOR_FILE = 'scripts/verify/lib/refund-proof-fixture.mjs'
const PRODUCT_FILE = 'src/components/checkout/ticket-selector.tsx'
const SRC = 'src'
const SCRIPTS = 'scripts'

/* A name a real tier or add-on could carry, used to turn the product's label
 * TEMPLATE into a concrete accessible name the selector can be tested against. */
const SAMPLE_NAMES = ['General Admission', 'Early bird', 'Table of 8', 'Cloakroom']

const faults = []
const checks = {}

function read(rel) {
  const path = join(ROOT, rel)
  if (!existsSync(path)) {
    faults.push(`${rel} does not exist, so the drives that import it cannot buy a ticket at all`)
    return null
  }
  return readFileSync(path, 'utf8')
}

/* The JSX button reader and the accessible-name rules live in their own file,
 * scripts/guards/lib/jsx-buttons.mjs, with their own tests in
 * tests/unit/guards/jsx-buttons.test.ts. They are the DETECTOR this guard
 * depends on, and a detector that silently misses a button turns a guard into a
 * green light: the first draft of it missed "Add to calendar", the very button
 * that had broken every money drive four days earlier. */
function tsxFiles(dir, acc = []) {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) tsxFiles(rel, acc)
    else if (entry.name.endsWith('.tsx')) acc.push(rel)
  }
  return acc
}

/* ------------------------------------------- 2 and 3. the drive's own selector */

const driveSource = read(SELECTOR_FILE)
let selector = null
if (driveSource) {
  const assignment = driveSource.match(/const quantityControl\s*=\s*\(\)\s*=>[\s\S]{0,400}?getByRole\(\s*'button'\s*,\s*\{\s*name:\s*(\/(?:\\.|[^/\\])+\/[a-z]*)/)
  if (!assignment) {
    faults.push(
      `${SELECTOR_FILE} no longer declares \`const quantityControl = () => page.getByRole('button', { name: /.../ })\`. ` +
        `This guard cannot read what the drives click, so it cannot promise they click the right thing`,
    )
  } else {
    const literal = assignment[1]
    const lastSlash = literal.lastIndexOf('/')
    const body = literal.slice(1, lastSlash)
    const flags = literal.slice(lastSlash + 1)
    checks['drive selector read'] = 1
    if (!body.startsWith('^') || !body.endsWith('$')) {
      faults.push(
        `${SELECTOR_FILE} selects the quantity control with /${body}/${flags}, which is not anchored at both ends. ` +
          `A prefix pattern is banned here by name: /^(\\+|increase|add)/i took .first() and pressed the ` +
          `"Add to calendar" button that shipped above the ticket panel on 14 September 2026, at which point ` +
          `three viewports reported a panel that had rendered perfectly as missing`,
      )
    }
    try {
      selector = new RegExp(body, flags)
    } catch (err) {
      faults.push(`${SELECTOR_FILE} carries a quantity selector that is not a valid regular expression: ${err.message}`)
    }
  }
}

/* --------------------------------------- 1. the product still names its control
 *
 * THE CONTROL IS FOUND BY WHAT IT DOES, NOT BY WHAT IT IS CALLED, and that is
 * the whole point. The first version of this guard looked for any
 * `aria-label={`Increase ...`}` in the file and required at least one. Its own
 * red drill walked straight through it: renaming the TIER button to "Add one"
 * left the ADD-ON button still called "Increase", the count was still non-zero,
 * and the guard passed while the button every money drive presses had become
 * unreachable. A check that counts labels cannot tell which label matters.
 *
 * So the tier increase control is identified by its handler,
 * `onClick={() => setTierQty(tier.id, +1, tier)}`, and it is that button's name
 * the selector is held to. The decrease control is found the same way and must
 * NOT answer to the selector, because a drive that presses minus removes the
 * ticket it just added and then reports that checkout refused an empty cart.
 */

const productSource = read(PRODUCT_FILE)
const labelTemplates = []
let tierIncrease = null
if (productSource) {
  const productButtons = buttonsIn(productSource)
  const byHandler = sign =>
    productButtons.filter(b => new RegExp(`setTierQty\\([^)]*,\\s*${sign}\\s*[,)]`).test(b.openTag))
  const increases = byHandler('\\+1')
  const decreases = byHandler('-1')

  checks['tier quantity control found by its handler'] = increases.length + decreases.length

  if (increases.length !== 1) {
    faults.push(
      `${PRODUCT_FILE} has ${increases.length} button(s) whose handler is setTierQty(..., +1, ...), and this ` +
        `guard needs exactly one: that button IS the handle every money drive uses to add a ticket. ` +
        `Zero means no drive can buy; more than one means Playwright's .first() decides which, silently`,
    )
  } else {
    tierIncrease = increases[0]
    if (!/aria-label=/.test(tierIncrease.openTag)) {
      faults.push(
        `${PRODUCT_FILE}:${tierIncrease.line} is the tier increase control and carries no aria-label. Its ` +
          `accessible name would fall back to its text, "+", which no anchored selector can safely name`,
      )
    }
    labelTemplates.push(tierIncrease.name)
  }

  if (decreases.length === 1) {
    const concrete = decreases[0].name.replace(/\$\{[^}]*\}/g, SAMPLE_NAMES[0])
    if (selector && selector.test(concrete)) {
      faults.push(
        `${PRODUCT_FILE}:${decreases[0].line} is the tier DECREASE control and its name "${decreases[0].name}" ` +
          `also answers to the quantity selector. A drive that presses minus takes the ticket back off and then ` +
          `reports that checkout refused an empty cart`,
      )
    }
  }
}

if (selector && labelTemplates.length > 0) {
  let matched = 0
  for (const template of labelTemplates) {
    for (const sample of SAMPLE_NAMES) {
      const concrete = template.replace(/\$\{[^}]*\}/g, sample)
      if (selector.test(concrete)) matched += 1
      else {
        faults.push(
          `${SELECTOR_FILE}'s selector ${selector} does not match "${concrete}", which is exactly what ` +
            `${PRODUCT_FILE} puts on the button. An anchored selector that matches nothing fails on the wait ` +
            `rather than the assertion, and reports the panel missing all over again`,
        )
      }
    }
  }
  checks['product label tested against the selector'] = matched
}

/* -------- 4. EVERY drive in scripts/, not just the one helper, and the rule is
 *             the same for all of them.
 *
 * SCOPING THIS TO ONE FILE WAS THE FIRST VERSION'S MISTAKE AND IT WAS FOUND
 * MINUTES AFTER IT WENT GREEN. `drivePurchase` was fixed, the guard passed, and
 * three MORE drives were still carrying the identical `/^(\+|increase|add)/i`:
 * paid-purchase-webhook-e2e, refund-dashboard-e2e and share-conversion-e2e. A
 * guard that watches one door in a building with four is a guard that reports
 * the building is secure.
 *
 * THE RULE, stated so it needs no list of files and no list of buttons. Read
 * every accessible name in src/. Read every `getByRole('button', { name: /../ })`
 * in scripts/. A selector is IN SCOPE if it matches the tier increase control,
 * because that is a selector somebody wrote to add a ticket. An in-scope
 * selector that ALSO matches any other name is a fault, because Playwright
 * takes `.first()` in DOM order and the drive does not get to choose.
 *
 * Selectors that do not match the quantity control are none of this guard's
 * business and are left alone. That is deliberate: the reserve selector
 * legitimately accepts several labels because the product shows a different one
 * per state, and pinning it is a different invariant.
 */

const QUANTITY_SAMPLE = labelTemplates[0]
  ? labelTemplates[0].replace(/\$\{[^}]*\}/g, SAMPLE_NAMES[0])
  : null

/** Every statically readable button name in src/, as `{ where, name }`. */
const productButtonNames = []
{
  let buttonsRead = 0
  for (const file of tsxFiles(SRC)) {
    const src = readFileSync(join(ROOT, file), 'utf8')
    for (const button of buttonsIn(src)) {
      buttonsRead += 1
      const isTheQuantityControl =
        file.split('/').join(sep) === PRODUCT_FILE.split('/').join(sep) && /^Increase /.test(button.name)
      productButtonNames.push({
        where: `${file}:${button.line}`,
        name: button.name.replace(/\$\{[^}]*\}/g, SAMPLE_NAMES[0]),
        raw: button.name,
        isTheQuantityControl,
      })
    }
  }
  checks['button in src read for its accessible name'] = buttonsRead
}

/** Every `getByRole('button', { name: /../ })` in scripts/, as a real RegExp. */
function driveSelectors() {
  const found = []
  const SELECTOR = /getByRole\(\s*'button'\s*,\s*\{\s*name:\s*(\/(?:\\.|[^/\\\n])+\/[a-z]*)/g
  for (const file of mjsFiles(SCRIPTS)) {
    /*
     * TWO FILES QUOTE A SELECTOR AS DATA RATHER THAN USING ONE, and neither is
     * a drive. Skipping them is the same judgement made twice, not an exception
     * list that can grow: a file qualifies only if it never opens a browser.
     *
     *   1. THIS GUARD, which quotes the banned prefix pattern in its prose and
     *      in the sentence it prints when it catches one.
     *   2. THE DRILL HARNESS, which must write the loose selector into a drill
     *      to prove this guard still catches it. Found on 18 September 2026 by
     *      writing that drill: the entry went into the tree, and this guard
     *      immediately failed the UNMUTATED tree, naming a drill entry as a
     *      drive that presses the wrong button. The drill was correct and the
     *      reading was not.
     */
    if (file.endsWith('drive-quantity-control-selector.mjs')) continue
    if (file.endsWith('guard-failure-drills.mjs')) continue
    const src = readFileSync(join(ROOT, file), 'utf8')
    let m
    while ((m = SELECTOR.exec(src))) {
      const literal = m[1]
      const lastSlash = literal.lastIndexOf('/')
      try {
        found.push({
          file,
          line: src.slice(0, m.index).split('\n').length,
          literal,
          regex: new RegExp(literal.slice(1, lastSlash), literal.slice(lastSlash + 1)),
        })
      } catch {
        /* An unparseable literal is a different fault and is not this guard's. */
      }
    }
  }
  return found
}

function mjsFiles(dir, acc = []) {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) mjsFiles(rel, acc)
    else if (entry.name.endsWith('.mjs') || entry.name.endsWith('.js')) acc.push(rel)
  }
  return acc
}

if (QUANTITY_SAMPLE) {
  const selectors = driveSelectors()
  checks['button selector in scripts read'] = selectors.length
  let inScope = 0
  for (const candidate of selectors) {
    if (!candidate.regex.test(QUANTITY_SAMPLE)) continue
    inScope += 1
    const alsoMatches = productButtonNames.filter(b => !b.isTheQuantityControl && candidate.regex.test(b.name))
    if (alsoMatches.length === 0) continue
    const named = alsoMatches.slice(0, 6).map(b => `${b.where} "${b.raw}"`).join('; ')
    const more = alsoMatches.length > 6 ? ` and ${alsoMatches.length - 6} more` : ''
    faults.push(
      `${candidate.file}:${candidate.line} selects the quantity control with ${candidate.literal}, which also ` +
        `matches ${alsoMatches.length} other button(s): ${named}${more}. Playwright takes .first() in DOM order, ` +
        `so this drive presses whichever sits higher on the page, and then reports the ticket panel as missing`,
    )
  }
  checks['selector that reaches the quantity control judged'] = inScope
  if (inScope === 0) {
    faults.push(
      `no selector anywhere in ${SCRIPTS}/ matches "${QUANTITY_SAMPLE}". Either every drive lost its ability to ` +
        `add a ticket, or this guard has lost its ability to find them; both are worth stopping for`,
    )
  }
}

/* ------------------------------------------------------------------ verdict */

/* THE FAULTS ARE PRINTED BEFORE THE WORK IS DECLARED, deliberately. When part 1
 * fails, the number of labels tested against the selector is legitimately zero,
 * and declareWork exits on a zero count. Declaring first swallowed the twelve
 * lines saying WHY, and a red drill that prints only "did nothing" teaches the
 * reader nothing about the defect it just caught. */
if (faults.length > 0) {
  console.error(`${TAG} FAIL: ${faults.length} problem(s) between what the drives click and what the product renders.`)
  for (const fault of faults) console.error(`${TAG}   - ${fault}`)
}

declareWork('drive-quantity-control-selector', {
  did: checks,
  found: { 'way a money drive could press the wrong button': faults.length },
  zeroIsFine:
    faults.length > 0
      ? { 'product label tested against the selector': 'part 1 already failed, so there was no label to test' }
      : {},
})

if (faults.length > 0) process.exit(1)

console.log(
  `${TAG} PASS - ${labelTemplates.length} quantity label(s) in ${relative('.', PRODUCT_FILE)}, ` +
    `selector ${selector}, and no other button in src/ answers to it.`,
)
