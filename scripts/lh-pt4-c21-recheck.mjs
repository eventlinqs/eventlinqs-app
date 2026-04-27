// Phase D — focused re-sweep after C.2.1 (HEAD f60224b).
// Only the two Suspense-rail routes are affected by the priority drop:
//   /events                        — main Recommended rail in Suspense
//   /events/browse/melbourne       — same rail pattern under city surface
// Other 9 routes are unaffected so this is a tight verification, not a full sweep.
// Output: docs/sprint1/phase-1b/iter-9-pt4-c21-recheck/
import { execSync } from 'node:child_process'

const PREVIEW = 'https://eventlinqs-53u64e0zc-lawals-projects-c20c0be8.vercel.app'
const OUT = 'docs/sprint1/phase-1b/iter-9-pt4-c21-recheck'

const routes = [
  ['events', '/events'],
  ['city',   '/events/browse/melbourne'],
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
