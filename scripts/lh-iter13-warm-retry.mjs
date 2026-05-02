// Warm-retry: re-run the regressed routes from iter-13 first pass with the
// preview cache now warmed by the initial sweep, to separate cold-start
// variance from actual regressions.
import { execSync } from 'node:child_process'

const PREVIEW = 'https://eventlinqs-app-git-feat-sprint1-28e87b-lawals-projects-c20c0be8.vercel.app'
const OUT = 'docs/sprint1/phase-1b/iter-13-pt5-surgical-fixes/warm-retry'

const routes = [
  ['home',          '/'],
  ['events',        '/events'],
  ['city',          '/events/browse/melbourne'],
  ['event-detail',  '/events/afrobeats-melbourne-summer-sessions'],
  ['pricing',       '/pricing'],
  ['legal-terms',   '/legal/terms'],
  ['login',         '/login'],
]

for (const [label, path] of routes) {
  const url = PREVIEW + path
  console.log(`\n=== ${label} : ${path} ===`)
  const cmd = [
    'npx --yes lighthouse',
    `"${url}"`,
    '--quiet --output=json --output=html',
    `--output-path="${OUT}/${label}"`,
    '--chrome-flags="--headless=new --no-sandbox --disable-gpu"',
    '--form-factor=mobile',
    '--screenEmulation.mobile=true',
    '--screenEmulation.width=412',
    '--screenEmulation.height=823',
    '--screenEmulation.deviceScaleFactor=1.75',
    `--emulated-user-agent="Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36"`,
    '--throttling-method=simulate',
  ].join(' ')
  try {
    execSync(cmd, { stdio: 'inherit', timeout: 240_000 })
  } catch (e) {
    console.log(`(non-fatal: ${e.message?.slice(0, 100)})`)
  }
}
