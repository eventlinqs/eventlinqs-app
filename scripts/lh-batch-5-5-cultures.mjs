// Batch 5.5 task 6 - Lighthouse 3-pass on production build for 6 culture routes.
// Founder-authorized localhost run (override of CLAUDE.md "no localhost
// performance" rule for this batch).
//
// Prereq: `npm run build` must have completed and `npm run start` must be
// listening on http://localhost:3000.
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'

const BASE = 'http://localhost:3002'
const OUT = 'docs/redesign/batch-5-evidence/lighthouse'

const routes = [
  ['culture-african',         '/culture/african'],
  ['culture-south-asian',     '/culture/south-asian'],
  ['culture-mediterranean',   '/culture/mediterranean'],
  ['culture-east-asian',      '/culture/east-asian'],
  ['culture-caribbean',       '/culture/caribbean'],
  ['culture-latin',           '/culture/latin'],
]

console.log('=== Warm-up: curl every route once ===')
for (const [, path] of routes) {
  try {
    execSync(`curl -s -o /dev/null "${BASE}${path}"`, { stdio: 'ignore', timeout: 60_000 })
  } catch {}
}

for (let pass = 1; pass <= 3; pass++) {
  const passDir = `${OUT}/run${pass}`
  if (!existsSync(passDir)) mkdirSync(passDir, { recursive: true })
  console.log(`\n=== Pass ${pass} of 3 ===`)
  for (const [label, path] of routes) {
    const url = BASE + path
    console.log(`\n--- pass ${pass}: ${label} ---`)
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
