// Preview-density prebuild step (runs automatically before `npm run build`).
//
// When HOMEPAGE_SEED_FIXTURE=1 is set (a PREVIEW-only Vercel env var, or local),
// regenerate the homepage density fixture (the 55-event catalogue) at build
// time so PREVIEW deployments render the full catalogue. The generated file is
// traced into the serverless bundle via next.config outputFileTracingIncludes.
//
// HARD GUARD: this flag must NEVER be set on a Production deployment. If it is,
// we abort the build loudly rather than risk shipping fixture data to prod.
// The runtime path in loadHomeUpcoming carries the same VERCEL_ENV guard as a
// second line of defence.
import { spawnSync } from 'node:child_process'

const enabled = process.env.HOMEPAGE_SEED_FIXTURE === '1'
const isProduction = process.env.VERCEL_ENV === 'production'

if (!enabled) {
  console.log('[prebuild] HOMEPAGE_SEED_FIXTURE not set - skipping density fixture (normal/production build).')
  process.exit(0)
}

if (isProduction) {
  console.error(
    '[prebuild] ABORT: HOMEPAGE_SEED_FIXTURE must NEVER be set on a Production deployment.\n' +
      '           It is a Preview-only env var (see .env.example). Remove it from the Production environment.',
  )
  process.exit(1)
}

console.log('[prebuild] HOMEPAGE_SEED_FIXTURE=1 (preview/local) - generating the 55-event density fixture...')
const result = spawnSync(process.execPath, ['scripts/seed-events-catalogue.mjs', '--fixture'], {
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
