/**
 * EVERY ROUTE next.config.ts HANDS VERCEL IS ONE VERCEL ACCEPTS (21 November 2026; the PM's 22:40 item 2 and 23:03).
 *
 * Train AV's gate went green on a redirect with 26 'missing' conditions and Vercel refused the preview after the build,
 * quoted: 'Builder returned invalid routes: should NOT have more than 16 items'. next build accepts it; only Vercel's
 * builder checks its schema. This guard loads next.config.ts as the build does (through the alias loader), calls its
 * redirects(), rewrites() and headers(), and judges every item against Vercel's own published limits
 * (./lib/vercel-route-limits.mjs, https://openapi.vercel.sh/vercel.json). A config it cannot load fails loudly.
 * Drilled red in scripts/verify/guard-failure-drills.mjs on tonight's shape: a header rule given 26 conditions.
 */
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VERCEL_ROUTE_LIMITS, routeLimitFaults } from './lib/vercel-route-limits.mjs'

const TAG = '[vercel-route-limits]'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const STAND_IN = 'https://route-limits-stand-in.supabase.co'
const script = [
  "const m = await import('./next.config.ts')",
  "const cfg = typeof m.default === 'function' ? await m.default('phase-production-build', { defaultConfig: {} }) : m.default",
  'const [redirects, rewrites, headers] = await Promise.all([cfg.redirects ? cfg.redirects() : [], cfg.rewrites ? cfg.rewrites() : [], cfg.headers ? cfg.headers() : []])',
  "console.log('ROUTES ' + JSON.stringify({ redirects, rewrites, headers }))",
].join('\n')
const r = spawnSync(
  process.execPath,
  ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--import', './scripts/lib/src-alias-loader.mjs', '--input-type=module', '-e', script],
  // next.config.ts refuses to load without a Supabase address (its /cdn rewrite). The routes' shape and counts do not
  // depend on it, so a host without one (a bare checkout) is given a stand in, said below; CI and the gate carry the real one.
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || STAND_IN } },
)
const line = (r.stdout ?? '').split('\n').find((l) => l.startsWith('ROUTES '))
if (r.status !== 0 || !line) {
  console.error(`${TAG} FAIL - next.config.ts could not be loaded to read its routes: ${((r.stderr || r.stdout) ?? '').trim().slice(0, 600)}`)
  process.exit(1)
}
const routes = JSON.parse(line.slice('ROUTES '.length))
const rewriteCount = Array.isArray(routes.rewrites) ? routes.rewrites.length : ['beforeFiles', 'afterFiles', 'fallback'].reduce((n, k) => n + (routes.rewrites[k]?.length ?? 0), 0)
const most = Math.max(0, ...[...routes.redirects, ...(Array.isArray(routes.rewrites) ? routes.rewrites : []), ...routes.headers].flatMap((i) => [i.has?.length ?? 0, i.missing?.length ?? 0]))
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) console.log(`${TAG} note: no NEXT_PUBLIC_SUPABASE_URL here, so next.config.ts was loaded with ${STAND_IN}; the routes' counts and shapes do not depend on it`)
console.log(`${TAG} what this guard read: next.config.ts returned ${routes.redirects.length} redirects, ${rewriteCount} rewrites, ${routes.headers.length} header rules; the most conditions on one item: ${most} (Vercel allows ${VERCEL_ROUTE_LIMITS.conditions})`)
const faults = routeLimitFaults(routes)
if (faults.length > 0) {
  console.error(`${TAG} FAIL - ${faults.length} route(s) Vercel would refuse:`)
  for (const f of faults) console.error(`  - ${f}`)
  process.exit(1)
}
console.log(`${TAG} PASS - every route next.config.ts hands Vercel is within Vercel's published limits.`)
