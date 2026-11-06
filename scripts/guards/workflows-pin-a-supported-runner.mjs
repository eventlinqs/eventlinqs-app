/**
 * workflows-pin-a-supported-runner.mjs
 *
 * FAILS when a workflow runs on 'ubuntu-latest', or on an Ubuntu image the installed Playwright's own support list does not
 * name (the CONTROLLER's 23:23 of 6 November 2026, read from the run's own log). The scheduled engine verifier on main failed
 * at 23:20 (run 42216739826), step 'Install the browser': 'BEWARE: your OS is not officially supported by Playwright;
 * installing dependencies for ubuntu26.04-x64 as a fallback.' then 'Error: ERROR: Playwright does not support chromium on
 * ubuntu26.04-x64'. GitHub had moved ubuntu-latest to Ubuntu 26.04 between two runs, and every workflow here named latest, so
 * the image changed under eight workflows without a line of ours changing. A workflow names its image.
 *
 * THE SUPPORT LIST is read from the INSTALLED playwright-core, never typed here: the Ubuntu releases its native dependency
 * table names (node_modules/playwright-core/lib/server/registry/nativeDeps.js, the table `playwright install --with-deps`
 * installs from). Playwright 1.59.1 names 20.04, 22.04 and 24.04. A Playwright bump that adds 26.04 lets 26.04 pass with no
 * edit here; a bump that drops an image fails the workflow still on it, which is the warning we want.
 *
 * WHAT IT READS. `.github/workflows/*.yml`, each `runs-on:` line, with no YAML library (the same reason as
 * workflows-skip-drafts.mjs: the files are plain, and a dependency here is one more thing to move under us).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { declareWork } from '../lib/work-report.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const WORKFLOWS = '.github/workflows'
const NATIVE_DEPS = 'node_modules/playwright-core/lib/server/registry/nativeDeps.js'

/** The Ubuntu releases the installed Playwright installs dependencies for, as 'ubuntu24.04'. Empty if it cannot be read. */
export function playwrightUbuntus(root = ROOT) {
  const file = join(root, NATIVE_DEPS)
  if (!existsSync(file)) return new Set()
  return new Set(readFileSync(file, 'utf8').match(/\bubuntu\d{2}\.\d{2}\b/g) ?? [])
}

/** Every runs-on that is latest or an Ubuntu image the list does not name, as 'file:line runs on ...'. Pure. */
export function judgeRunners(texts, supported) {
  const problems = []
  for (const [file, text] of Object.entries(texts)) {
    text.split('\n').forEach((line, i) => {
      const m = /^\s*runs-on:\s*['"]?([^'"\s#]+)['"]?/.exec(line)
      if (!m) return
      const image = m[1]
      if (/latest/i.test(image)) {
        problems.push(`${file}:${i + 1} runs on '${image}': name the image, never latest (it moved to Ubuntu 26.04 under us on 6 November 2026)`)
        return
      }
      const u = /^ubuntu-(\d{2}\.\d{2})(?:-arm)?$/.exec(image)
      if (u && !supported.has(`ubuntu${u[1]}`)) {
        problems.push(`${file}:${i + 1} runs on '${image}', which the installed Playwright does not support (it names ${[...supported].sort().join(', ')})`)
      }
    })
  }
  return problems
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const dir = join(ROOT, WORKFLOWS)
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)) : []
  const supported = playwrightUbuntus()
  const problems = []
  if (supported.size === 0) problems.push(`${NATIVE_DEPS} could not be read, so the runners cannot be judged against Playwright's own list`)
  const texts = Object.fromEntries(files.map((f) => [`${WORKFLOWS}/${f}`, readFileSync(join(dir, f), 'utf8')]))
  problems.push(...judgeRunners(texts, supported))
  const runsOn = Object.values(texts).reduce((n, t) => n + (t.match(/^\s*runs-on:/gm) ?? []).length, 0)
  console.log(`[workflows-pin-a-supported-runner] Playwright's own list: ${[...supported].sort().join(', ') || 'unread'}`)
  declareWork('workflows-pin-a-supported-runner', {
    did: { 'workflow read': files.length, 'runs-on line judged': runsOn },
    found: { 'runner on latest or unsupported': problems.length },
  })
  if (problems.length > 0) {
    console.error('\n[workflows-pin-a-supported-runner] FAIL:')
    for (const p of problems) console.error(`  - ${p}`)
    process.exit(1)
  }
  console.log(`[workflows-pin-a-supported-runner] PASS - ${runsOn} runs-on line(s) across ${files.length} workflow(s), each a named image Playwright supports.`)
}
