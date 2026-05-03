// PT5 iter-14 — 3 warm-retry passes per route to eliminate single-run
// lantern variance. First an unrecorded warm-up curl pass, then three
// scored Lighthouse runs per route. Reports land in run1/, run2/, run3/.
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'

const PREVIEW = 'https://eventlinqs-app-git-feat-sprint1-28e87b-lawals-projects-c20c0be8.vercel.app'
const OUT = 'docs/sprint1/phase-1b/iter-14-pt5-image-preload'

const routes = [
  ['home',          '/'],
  ['events',        '/events'],
  ['city',          '/events/browse/melbourne'],
  ['category',      '/categories/afrobeats'],
  ['event-detail',  '/events/afrobeats-melbourne-summer-sessions'],
  ['organisers',    '/organisers'],
  ['pricing',       '/pricing'],
  ['help',          '/help'],
  ['legal-terms',   '/legal/terms'],
  ['login',         '/login'],
  ['signup',        '/signup'],
]

console.log('=== Edge warm-up: hit every route once with curl ===')
for (const [, path] of routes) {
  try {
    execSync(`curl -s -o /dev/null "${PREVIEW}${path}"`, { stdio: 'ignore', timeout: 30_000 })
  } catch {}
}

for (let pass = 1; pass <= 3; pass++) {
  const passDir = `${OUT}/run${pass}`
  if (!existsSync(passDir)) mkdirSync(passDir, { recursive: true })
  console.log(`\n========================================`)
  console.log(`=== Pass ${pass} of 3 ===`)
  console.log(`========================================`)
  for (const [label, path] of routes) {
    const url = PREVIEW + path
    console.log(`\n--- pass ${pass}: ${label} : ${path} ---`)
    const cmd = [
      'npx --yes lighthouse',
      `"${url}"`,
      '--quiet --output=json --output=html',
      `--output-path="${passDir}/${label}"`,
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
}
