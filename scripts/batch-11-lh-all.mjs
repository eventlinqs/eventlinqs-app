// Batch 11 - Lighthouse mobile + desktop pass on production build,
// 5 pages. Founder-authorised localhost run for the verification gate.
//
// Prereq: `npm run build` then `npm run start -- -p 3007` listening on
// http://localhost:3007.
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'

const BASE = 'http://localhost:3007'
const OUT = 'docs/redesign/batch-11-evidence/lighthouse'

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const routes = [
  ['home',             '/'],
  ['events',           '/events'],
  ['culture-african',  '/culture/african'],
  ['city-sydney',      '/city/sydney'],
  ['event-detail',     '/events/diwali-festival-melbourne-festival-of-lights'],
]

console.log('=== Warm-up: curl every route twice ===')
for (let i = 0; i < 2; i++) {
  for (const [, path] of routes) {
    try {
      execSync(`curl -s -o /dev/null "${BASE}${path}"`, { stdio: 'ignore', timeout: 60_000 })
    } catch {}
  }
}

function run(label, path, form) {
  const url = BASE + path
  const isMobile = form === 'mobile'
  const cmd = [
    'npx --yes lighthouse',
    `"${url}"`,
    '--quiet --output=json',
    `--output-path="${OUT}/${label}-${form}.json"`,
    '--chrome-flags="--headless=new --no-sandbox --disable-gpu"',
    isMobile
      ? [
          '--form-factor=mobile',
          '--screenEmulation.mobile=true',
          '--screenEmulation.width=412',
          '--screenEmulation.height=823',
          '--screenEmulation.deviceScaleFactor=1.75',
          `--emulated-user-agent="Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36"`,
        ].join(' ')
      : '--preset=desktop',
    '--throttling-method=simulate',
  ].join(' ')
  console.log(`\n--- ${label} ${form} ---`)
  try {
    execSync(cmd, { stdio: 'inherit', timeout: 240_000 })
  } catch (e) {
    console.log(`(non-fatal: ${e.message?.slice(0, 200)})`)
  }
}

console.log('\n=== Mobile pass ===')
for (const [label, path] of routes) run(label, path, 'mobile')
console.log('\n=== Desktop pass ===')
for (const [label, path] of routes) run(label, path, 'desktop')

console.log('\nDone.')
