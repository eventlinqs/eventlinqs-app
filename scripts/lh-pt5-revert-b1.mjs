// PT5 iter-11 — local Lighthouse sweep on the post-revert build (ae44066).
// Runs against `npm run start` on localhost:3000 with the same 11 URLs and
// settings as lighthouserc.json. Output: docs/sprint1/phase-1b/iter-11-pt5-revert-b1/.
import { execSync } from 'node:child_process'

const OUT = 'docs/sprint1/phase-1b/iter-11-pt5-revert-b1'
const BASE = 'http://localhost:3000'

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
  const url = BASE + path
  console.log(`\n=== ${label} : ${path} ===`)
  const cmd = [
    'npx --yes lighthouse',
    `"${url}"`,
    '--quiet --output=json --output=html',
    `--output-path="${OUT}/${label}"`,
    '--chrome-flags="--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage"',
    '--form-factor=mobile',
    '--screenEmulation.mobile=true',
    '--screenEmulation.width=412',
    '--screenEmulation.height=823',
    '--screenEmulation.deviceScaleFactor=1.75',
    `--emulated-user-agent="Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36"`,
    '--throttling-method=simulate',
    '--extra-headers="{\\"Cookie\\":\\"el-audit=1\\"}"',
  ].join(' ')
  try {
    execSync(cmd, { stdio: 'inherit', timeout: 240_000 })
  } catch (e) {
    console.log(`(non-fatal: ${e.message?.slice(0, 100)})`)
  }
}
