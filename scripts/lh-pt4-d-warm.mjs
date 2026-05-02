// Phase D — full 11-route mobile sweep on the WARMED f60224b preview.
// Iter-8 ran on a cold preview right after deploy; this re-run distinguishes
// genuine code regression from cold-cache variance.
// Output: docs/sprint1/phase-1b/iter-10-pt4-d-warm/
import { execSync } from 'node:child_process'

const PREVIEW = 'https://eventlinqs-53u64e0zc-lawals-projects-c20c0be8.vercel.app'
const OUT = 'docs/sprint1/phase-1b/iter-10-pt4-d-warm'

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
