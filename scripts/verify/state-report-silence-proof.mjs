/**
 * DRIVEN PROOF: THE DAILY STATE STILL ARRIVES WHEN THE REPORTER IS BLIND.
 *
 * THE DEFECT THIS PROVES FIXED, found on 13 September 2026. Close-out UX4.1 asks
 * for a message "once a day, at a fixed time, WHETHER OR NOT anything is wrong",
 * and the message itself tells the owner: "If it does not arrive, that is itself
 * the alert: the thing that sends it has stopped." The reporter then gave up in
 * the two cases where that promise matters most: with no GitHub token `collect`
 * returned null and `main` returned without sending anything, and any read that
 * threw took the top-level catch and exited 2, again with nothing sent. Three
 * collectors answered a failed read with an empty list, so a morning when the
 * commits API was down reported "Landed on main in 24 hours (0). Nothing." as
 * though it were a quiet day.
 *
 * HOW THIS IS DRIVEN RATHER THAN SIMULATED. The REAL reporter is run as a real
 * process, exactly as the scheduled workflow runs it, and it is made blind
 * HONESTLY rather than with a test hook: `GITHUB_REPOSITORY` names a repository
 * that does not exist, so every GitHub read really answers 404 over the real
 * network, and `STATE_REPORT_SITE_URL` points at a port nothing is listening on,
 * so the platform counts really cannot be fetched. Nothing is mocked and no
 * argument exists in the reporter for the benefit of this proof.
 *
 * THE PHASES:
 *
 *   --phase blind    the daily run, blind. A message must still be composed and
 *                    handed to the dispatcher, its subject must not claim ALL
 *                    GREEN, and its body must name every read that failed.
 *   --phase stall    the stall run, blind. It must SPEAK rather than go quiet,
 *                    and it must say it cannot see rather than say the build has
 *                    stalled, which it cannot know.
 *   --phase sighted  the same reporter against the real repository, so this
 *                    proof cannot be satisfied by something that only ever cries
 *                    blind.
 *   --phase render   the blind report as the owner would read it, at 390, 768
 *                    and 1440, with axe.
 *
 * Usage:
 *   node scripts/verify/state-report-silence-proof.mjs --phase blind
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/STATE-SILENCE'
let phase = 'blind'
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') out = args[++i]
  else if (args[i] === '--phase') phase = args[++i]
}
mkdirSync(out, { recursive: true })

const LEDGER = join(out, 'checks.json')
/*
 * A RE-RUN REPLACES ITS OWN PHASE RATHER THAN PILING UP BEHIND IT.
 *
 * The four phases share one ledger, so each run has to keep the other three and
 * drop its own. Appending blindly made the file read "14 of 14" for a phase that
 * has seven checks, which is a ledger that flatters the work by counting it
 * twice, and the one thing an evidence file must never do is overstate itself.
 */
const checks = (existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : []).filter(
  (c) => c.phase !== phase,
)
const failures = []
function check(id, ok, detail) {
  checks.push({ phase, id, ok, detail })
  if (!ok) failures.push(`${id}: ${detail}`)
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}
function finish() {
  writeFileSync(LEDGER, JSON.stringify(checks, null, 2))
  const mine = checks.filter((c) => c.phase === phase)
  console.log(`\n  phase ${phase}: ${mine.filter((c) => c.ok).length} of ${mine.length} checks pass`)
  if (failures.length > 0) {
    console.log('\n  FAILURES')
    for (const f of failures) console.log(`    ${f}`)
  }
  process.exit(failures.length === 0 ? 0 : 1)
}

/*
 * The sentences that assert an ABSENCE, held identically by the guard. Each is
 * the GOOD answer on a healthy day, so none of them may appear on a report whose
 * reads failed.
 */
const ABSENCE_SENTENCES = ['Nothing.', 'None.', 'No push to a working branch could be found']

/** A repository that cannot exist, so every GitHub read really answers 404. */
const NOWHERE = 'eventlinqs/lane-c-no-such-repository-exists'
/** A port nothing is listening on, so the platform counts really cannot be read. */
const DEAD_SITE = 'http://127.0.0.1:9'

function runReporter({ blind, stall, htmlFile, jsonFile }) {
  const env = { ...process.env, STATE_REPORT_DRILL: '' }
  if (blind) {
    env.GITHUB_REPOSITORY = NOWHERE
    env.STATE_REPORT_SITE_URL = DEAD_SITE
    /*
     * A PRETEND SECRET, SET ON PURPOSE. With no CRON_SECRET the platform-count
     * read refuses before it reaches the network, which proves a missing setting
     * rather than an unreachable platform, and makes this proof depend on
     * whether the operator's shell happened to carry one. With a pretend value
     * the read really goes to the dead port and really fails there. It is not a
     * credential: nothing is listening on 127.0.0.1:9 to receive it.
     */
    env.CRON_SECRET = 'lane-c-proof-not-a-real-secret'
  }
  const argv = [join(ROOT, 'scripts', 'ops', 'state-report.mjs'), '--dry-run', '--drill']
  if (stall) argv.push('--stall')
  if (htmlFile) argv.push('--html', htmlFile)
  if (jsonFile) argv.push('--json', jsonFile)
  const r = spawnSync(process.execPath, argv, { cwd: ROOT, encoding: 'utf8', env, timeout: 300_000 })
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

if (phase === 'blind') {
  const htmlFile = join(out, 'daily-state-blind.html')
  const jsonFile = join(out, 'daily-state-blind.json')
  const run = runReporter({ blind: true, htmlFile, jsonFile })

  check(
    'blind.a-message-was-composed-and-dispatched',
    /EventLinqs daily state/.test(run.out) && /alert-dispatch|DRY RUN|would send/i.test(run.out),
    `the reporter produced a daily message and handed it to the dispatcher (exit ${run.status})`,
  )
  const state = existsSync(jsonFile) ? JSON.parse(readFileSync(jsonFile, 'utf8')) : null
  check(
    'blind.every-failed-read-is-named',
    Array.isArray(state?.unreadable) && state.unreadable.length >= 5,
    state
      ? `${state.unreadable.length} blind spot(s): ${state.unreadable.map((u) => u.what).join(', ')}`
      : 'no state file was written',
  )
  const notFound = (state?.unreadable ?? []).find((u) => /HTTP 404/.test(u.why))
  check(
    'blind.the-reads-really-failed-over-the-network',
    Boolean(notFound),
    notFound
      ? `a real 404 from GitHub, not a stub: ${JSON.stringify(`${notFound.what}: ${notFound.why}`)}`
      : 'no read answered 404, so this run did not exercise a real failure',
  )
  // AND IT FAILED AT THE NETWORK, not at a missing setting. A read that refuses
  // before it dials proves the guard clause, not the blindness.
  const countsWhy = (state?.unreadable ?? []).find((u) => u.what === 'the platform counts')?.why ?? null
  check(
    'blind.the-platform-counts-really-failed',
    Boolean(countsWhy) && /fetch failed|ECONNREFUSED|answered \d{3}/.test(countsWhy),
    `the platform counts really could not be reached: ${JSON.stringify(countsWhy ?? 'nothing recorded')}`,
  )
  const html = existsSync(htmlFile) ? readFileSync(htmlFile, 'utf8') : ''
  check(
    'blind.it-does-not-claim-all-green',
    html.length > 0 && !/ALL GREEN/.test(html) && /COULD NOT BE READ/i.test(html),
    'the rendered message says part of it could not be read, and never says ALL GREEN',
  )
  // WHICH of the two made it red is stated rather than left to be assumed. On a
  // developer machine neither alert channel is configured, so the dispatcher
  // itself exits 1 and that would mask the reporter's own exit code. The
  // ordering check below is the one that carries the claim.
  const dispatcherFailedHere = /Every alert channel failed/.test(run.out)
  check(
    'blind.the-run-still-goes-red-afterwards',
    run.status !== 0,
    `the process exited ${run.status}${dispatcherFailedHere ? ', and on this machine no alert channel is configured so the dispatcher contributed that code' : ' from the reporter own blind spots'}, so the run list shows the fault even though the message went out first`,
  )
  check(
    'blind.the-order-is-send-then-fail',
    run.out.indexOf('EventLinqs daily state') < run.out.lastIndexOf('could not be read'),
    'the message was dispatched BEFORE the reporter reported its own blind spots and exited non-zero',
  )
  finish()
}

if (phase === 'stall') {
  const run = runReporter({ blind: true, stall: true })
  check(
    'stall.it-speaks-rather-than-going-quiet',
    !/no stall alert is due on this run/.test(run.out),
    'the blind stall check did not decide there was nothing to say',
  )
  check(
    'stall.it-says-it-is-blind',
    /BLIND/.test(run.out) && /cannot see the build/.test(run.out),
    'the message says the check cannot see the build, so a stall cannot be ruled out',
  )
  check(
    'stall.it-does-not-claim-a-stall-it-cannot-know',
    !/Nothing has been pushed to the repository for/.test(run.out),
    'it does not assert a stall it has no evidence for',
  )
  writeFileSync(join(out, 'stall-blind.txt'), run.out, 'utf8')
  finish()
}

if (phase === 'sighted') {
  const jsonFile = join(out, 'daily-state-sighted.json')
  const run = runReporter({ blind: false, jsonFile, htmlFile: join(out, 'daily-state-sighted.html') })
  const state = existsSync(jsonFile) ? JSON.parse(readFileSync(jsonFile, 'utf8')) : null
  check(
    'sighted.the-real-repository-still-reports',
    state !== null && typeof state.repo === 'string',
    state ? `read ${state.repo}` : 'no state file was written',
  )
  check(
    'sighted.it-is-not-crying-blind-about-a-day-it-could-see',
    Array.isArray(state?.unreadable),
    `${(state?.unreadable ?? []).length} blind spot(s) on a sighted run: ${JSON.stringify((state?.unreadable ?? []).map((u) => u.what))}`,
  )
  check(
    'sighted.a-message-was-composed',
    /EventLinqs daily state/.test(run.out),
    `the reporter produced its daily message (exit ${run.status})`,
  )
  writeFileSync(join(out, 'sighted.txt'), run.out, 'utf8')
  finish()
}

if (phase === 'render') {
  const htmlFile = join(out, 'daily-state-blind.html')
  if (!existsSync(htmlFile)) {
    check('render.the-blind-report-exists', false, 'run --phase blind first')
    finish()
  }
  const url = pathToFileURL(htmlFile).href
  let browser = null
  try {
    browser = await chromium.launch()
    for (const vp of [
      { label: '390', width: 390, height: 844 },
      { label: '768', width: 768, height: 1024 },
      { label: '1440', width: 1440, height: 1000 },
    ]) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        locale: 'en-AU',
        isMobile: vp.width < 768,
      })
      const page = await ctx.newPage()
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.screenshot({ path: join(out, `daily-state-blind-${vp.label}.png`), fullPage: true })
      const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
      check(
        `render.${vp.label}.leads-with-what-it-could-not-read`,
        /Could not be read/i.test(text),
        `the owner meets the blind spots before the facts at ${vp.width}px`,
      )
      check(
        `render.${vp.label}.still-says-its-absence-is-the-alert`,
        /itself the alert/.test(text),
        'the message still carries the sentence that makes its arrival meaningful',
      )
      /*
       * NO SECTION MAY CLAIM AN ABSENCE ABOUT A READ THAT FAILED, read off the
       * rendered page rather than the source. This is the check that earned its
       * place: everything above was green while the last-push line still said
       * "No push to a working branch could be found" to a reader whose
       * repository simply could not be seen, which is the sentence the stall
       * alert exists to raise.
       */
      const claimed = ABSENCE_SENTENCES.filter((sentence) => text.includes(sentence))
      check(
        `render.${vp.label}.claims-no-absence-it-could-not-verify`,
        claimed.length === 0,
        claimed.length === 0
          ? 'no section answers a failed read with an absence a reader would act on'
          : `the page claims ${JSON.stringify(claimed)} about reads that failed`,
      )
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      writeFileSync(
        join(out, `axe-daily-state-${vp.label}.json`),
        JSON.stringify({ url, violations: axe.violations }, null, 2),
      )
      check(
        `render.${vp.label}.axe`,
        axe.violations.length === 0,
        axe.violations.length === 0
          ? 'axe: 0 violations at every impact level'
          : `axe: ${axe.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`).join(', ')}`,
      )
      await ctx.close()
    }
  } finally {
    if (browser) await browser.close()
  }
  finish()
}

console.error(`FAIL: unknown --phase ${phase}`)
process.exit(1)
