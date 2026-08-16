/**
 * THE CANONICAL HOST GUARD, PART TWO: THE RUNTIME. Build-failing.
 *
 * WHY A SECOND GUARD EXISTS, and why the first one could never have caught this.
 *
 * `scripts/guards/canonical-host.mjs` is a LITERAL SCANNER. It reads files and
 * fails when one of them TYPES a non-canonical host in a URL position. It is a
 * good guard and it works. It is also structurally incapable of catching the
 * defect that shipped on 13 August 2026, because the wrong host was never typed
 * into any file. It arrived from `VERCEL_PROJECT_PRODUCTION_URL`, which on this
 * project Vercel nominates as `eventlinqs.com`, and the resolvers in
 * src/lib/site-url.ts emitted it at runtime. Every generated link, every QR
 * payload, every Stripe Connect return url and every printed artefact carried a
 * host that 301s, while a full grep of the repository came back clean.
 *
 * A static scan cannot see a value that only exists in an environment variable.
 * So this guard does not scan. It EXECUTES the real resolvers, in a fresh
 * process, under a simulated production and a simulated preview, and compares
 * what they actually returned against what each environment must produce.
 *
 * THE SECOND GAP, closed here as well. Fixing the Vercel-nominated host left the
 * variable ABOVE it untouched. `NEXT_PUBLIC_SITE_URL` is already set on the
 * Vercel Production environment, it sits first in the resolution order, and the
 * env manifest's production shape (`brandedHttpsOrigin`) happily accepts
 * `https://eventlinqs.com`. So a correct-looking configuration could reintroduce
 * the whole defect without a single file changing. Scenarios B, C and D below
 * are that case, and they are the reason this guard is worth its runtime.
 *
 * WHAT IT DOES NOT DO. It does not touch preview. A preview deployment must keep
 * resolving links against its own host, because a preview kit's draft exists
 * only in the preview database and a link to production would 404. Scenarios F
 * and G pin that carve-out so a future tightening of the production rule cannot
 * quietly take it away.
 *
 * Run standalone:  node scripts/guards/canonical-host-runtime.mjs
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const PROBE = join(HERE, 'lib', 'canonical-host-probe.ts')

const CANONICAL_ORIGIN = 'https://www.eventlinqs.com.au'
const CANONICAL_HOST = 'www.eventlinqs.com.au'
const PREVIEW_HOST = 'eventlinqs-app-git-integration-launch-lawals-projects-c20c0be8.vercel.app'
const PREVIEW_ORIGIN = `https://${PREVIEW_HOST}`

/**
 * Every origin variable the resolver consults, cleared before each scenario.
 *
 * The parent's own environment is inherited so the child can find Node and its
 * modules, but any of these left over from a shell or a dotenv would make the
 * result depend on the machine it ran on, which is the opposite of a guard.
 */
const ORIGIN_VARS = [
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_APP_URL',
  'VERCEL_ENV',
  'VERCEL_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
]

/**
 * The scenarios. Each one is a deployment we can actually be in, with the exact
 * values that deployment can actually hold.
 *
 * `warns` is part of the contract, not decoration. A silent fallback is how the
 * original defect survived for as long as it did: everything downstream looked
 * correct and the wrong host was only ever visible in the finished artefact. A
 * misconfiguration must be legible in the build output, so scenarios that ignore
 * a variable are required to SAY they ignored it and to name it.
 */
const SCENARIOS = [
  {
    id: 'A',
    name: 'production, with Vercel nominating the secondary host',
    why: 'the original defect: VERCEL_PROJECT_PRODUCTION_URL is eventlinqs.com on this project',
    env: { VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'eventlinqs.com' },
    expect: {
      getSiteUrl: CANONICAL_ORIGIN,
      getAppUrl: CANONICAL_ORIGIN,
      printableHost: CANONICAL_HOST,
      canonicalHost: CANONICAL_HOST,
    },
    warns: null,
  },
  {
    id: 'B',
    name: 'production, with NEXT_PUBLIC_SITE_URL holding the secondary host',
    why: 'the variable sits ABOVE the production fallback, so whatever it holds is what every link was built on',
    env: { VERCEL_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://eventlinqs.com' },
    expect: {
      getSiteUrl: CANONICAL_ORIGIN,
      getAppUrl: CANONICAL_ORIGIN,
      printableHost: CANONICAL_HOST,
      canonicalHost: CANONICAL_HOST,
    },
    warns: 'NEXT_PUBLIC_SITE_URL',
  },
  {
    id: 'C',
    name: 'production, with NEXT_PUBLIC_SITE_URL holding www on the secondary domain',
    why: 'the near miss: it looks canonical, it passes the env shape guard, and it still 301s',
    env: { VERCEL_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://www.eventlinqs.com' },
    expect: {
      getSiteUrl: CANONICAL_ORIGIN,
      getAppUrl: CANONICAL_ORIGIN,
      printableHost: CANONICAL_HOST,
      canonicalHost: CANONICAL_HOST,
    },
    warns: 'NEXT_PUBLIC_SITE_URL',
  },
  {
    id: 'D',
    name: 'production, with NEXT_PUBLIC_APP_URL holding the secondary host',
    why: 'getAppUrl feeds the Stripe Connect return url, and Stripe does not follow redirects',
    env: { VERCEL_ENV: 'production', NEXT_PUBLIC_APP_URL: 'https://eventlinqs.com' },
    expect: {
      getSiteUrl: CANONICAL_ORIGIN,
      getAppUrl: CANONICAL_ORIGIN,
      printableHost: CANONICAL_HOST,
      canonicalHost: CANONICAL_HOST,
    },
    warns: 'NEXT_PUBLIC_APP_URL',
  },
  {
    id: 'E',
    name: 'production, with the variable already canonical',
    why: 'a correct configuration must pass through untouched and in silence',
    env: { VERCEL_ENV: 'production', NEXT_PUBLIC_SITE_URL: CANONICAL_ORIGIN },
    expect: {
      getSiteUrl: CANONICAL_ORIGIN,
      getAppUrl: CANONICAL_ORIGIN,
      printableHost: CANONICAL_HOST,
      canonicalHost: CANONICAL_HOST,
    },
    warns: null,
  },
  {
    id: 'F',
    name: 'preview resolves links against its own deployment',
    why: 'a preview kit draft exists only in the preview database; a link to production would 404',
    env: {
      VERCEL_ENV: 'preview',
      VERCEL_URL: PREVIEW_HOST,
      VERCEL_PROJECT_PRODUCTION_URL: 'eventlinqs.com',
    },
    expect: {
      getSiteUrl: PREVIEW_ORIGIN,
      getAppUrl: PREVIEW_ORIGIN,
      // The split that makes an artefact work: the poster READS the canonical
      // host, the QR and the caption links RESOLVE against the deployment.
      printableHost: CANONICAL_HOST,
      canonicalHost: PREVIEW_HOST,
    },
    warns: null,
  },
  {
    id: 'G',
    name: 'preview still honours an explicit origin, unchanged',
    why: 'proves the production rule did not leak into preview and break a working surface',
    env: {
      VERCEL_ENV: 'preview',
      VERCEL_URL: PREVIEW_HOST,
      NEXT_PUBLIC_SITE_URL: 'https://eventlinqs.com',
    },
    expect: {
      getSiteUrl: 'https://eventlinqs.com',
      getAppUrl: 'https://eventlinqs.com',
      printableHost: CANONICAL_HOST,
      canonicalHost: 'eventlinqs.com',
    },
    warns: null,
  },
]

if (!existsSync(PROBE)) {
  console.error(`canonical-host-runtime: the probe is missing at ${PROBE}`)
  process.exit(1)
}

/**
 * The resolver is TypeScript, so the probe runs under `tsx`, a committed
 * devDependency. Absent, that is a broken install rather than a missing
 * credential, so this FAILS rather than skipping: a guard that quietly stops
 * checking is worse than no guard, because the silence reads as health.
 */
if (!existsSync(join(ROOT, 'node_modules', 'tsx'))) {
  console.error(
    'canonical-host-runtime: tsx is not installed, so the resolver cannot be executed.\n' +
      '  It is a devDependency. Run `npm install` and try again.',
  )
  process.exit(1)
}

function runScenario(scenario) {
  const env = { ...process.env }
  for (const key of ORIGIN_VARS) delete env[key]
  Object.assign(env, scenario.env)

  const result = spawnSync(process.execPath, ['--import', 'tsx', PROBE], {
    cwd: ROOT,
    env,
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    return { crashed: true, detail: (result.stderr || result.stdout || '').trim() }
  }
  try {
    return { crashed: false, resolved: JSON.parse(result.stdout), stderr: result.stderr || '' }
  } catch {
    return { crashed: true, detail: `the probe printed something that is not JSON:\n${result.stdout}` }
  }
}

const failures = []

for (const scenario of SCENARIOS) {
  const outcome = runScenario(scenario)

  if (outcome.crashed) {
    failures.push({ scenario, lines: [`the probe did not complete: ${outcome.detail}`] })
    continue
  }

  const lines = []
  for (const [fn, want] of Object.entries(scenario.expect)) {
    const got = outcome.resolved[fn]
    if (got !== want) lines.push(`${fn}() returned ${got}\n        it must return ${want}`)
  }

  const warned = /^\[site-url\] IGNORING /m.test(outcome.stderr)
  if (scenario.warns) {
    if (!warned) {
      lines.push(
        `no warning was printed, so ignoring ${scenario.warns} would be silent.\n` +
          '        A misconfiguration nobody can see is how this defect survived the first time.',
      )
    } else if (!outcome.stderr.includes(scenario.warns)) {
      lines.push(`the warning did not name ${scenario.warns}, so nobody knows which variable to fix`)
    }
  } else if (warned) {
    lines.push(
      `a warning was printed for a correct configuration:\n        ${outcome.stderr.trim().split('\n')[0]}`,
    )
  }

  if (lines.length > 0) failures.push({ scenario, lines })
}

if (failures.length > 0) {
  console.error(
    `\ncanonical-host-runtime: ${failures.length} of ${SCENARIOS.length} environment(s) resolve wrongly.\n` +
      `The canonical host is ${CANONICAL_HOST} and production resolves to it whatever any\n` +
      'variable holds. Fix src/lib/site-url.ts, never the expectation below.\n',
  )
  for (const { scenario, lines } of failures) {
    console.error(`  [${scenario.id}] ${scenario.name}`)
    console.error(`      because: ${scenario.why}`)
    console.error(`      env: ${JSON.stringify(scenario.env)}`)
    for (const line of lines) console.error(`      ${line}`)
    console.error('')
  }
  process.exit(1)
}

console.log(
  `canonical-host-runtime: clean (${SCENARIOS.length} environments executed; production resolves to ${CANONICAL_HOST})`,
)
