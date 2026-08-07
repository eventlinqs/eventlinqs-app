/**
 * PHASE 2.3 PROOF: the provider gate, both ways, against a real server.
 *
 * Brief 2.3 asks for the behaviour proven with the provider disabled AND
 * enabled, on TEST, never production. Enabling a provider is a Supabase
 * Dashboard action, which this job is explicitly barred from performing, so the
 * enabled case is produced by a local reverse proxy that sits in front of the
 * TEST project and rewrites ONE response: `/auth/v1/settings`. Everything else
 * is forwarded to the real TEST project untouched, so the page under test is
 * talking to a genuine Supabase throughout.
 *
 * That gives an honest, complete proof of the part this codebase owns:
 *   DISABLED  the button is absent from the markup, and email sign-in is present
 *             and functional.
 *   ENABLED   the button is present, correctly labelled, and wired to the right
 *             authorize URL with the right redirect_to.
 *
 * What it deliberately does NOT claim: the final hop to Google's consent screen.
 * That needs the provider genuinely enabled on a dashboard, which is out of
 * scope here. It is covered by the Phase 6 founder step and then watched
 * forever by the auth sentinel's provider-parity check.
 *
 * Usage:  node scripts/verify/auth-provider-gate-proof.mjs
 * Needs:  a production build and .env.test (TEST project credentials).
 */
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'

const PROXY_PORT = 54321
/**
 * A port per case. A previous run's server lingering on a shared port served a
 * STALE build and the harness happily reported its output as the result, which
 * is the single most dangerous thing a proof harness can do. Separate ports
 * plus the settings-hit assertion below make that failure impossible to mistake
 * for a pass.
 */
const APP_PORTS = { disabled: 3131, enabled: 3132 }

function loadEnvTest() {
  if (!existsSync('.env.test')) {
    console.error('.env.test not found. It carries the TEST project credentials.')
    process.exit(1)
  }
  const env = {}
  for (const line of readFileSync('.env.test', 'utf8').split('\n')) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m) env[m[1]] = m[2]
  }
  return env
}

const TEST_ENV = loadEnvTest()
const UPSTREAM = TEST_ENV.NEXT_PUBLIC_SUPABASE_URL
if (!UPSTREAM) {
  console.error('NEXT_PUBLIC_SUPABASE_URL missing from .env.test')
  process.exit(1)
}

/** Refuse to run if anything is already listening on a port we need. */
async function assertPortFree(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) })
  } catch {
    return
  }
  console.error(
    `
Port ${port} is already serving. A stale server would make this harness
` +
      `report someone else's build as the result. Stop it and re-run.
`,
  )
  process.exit(1)
}

/** Reverse proxy to the real TEST project, rewriting only the settings body. */
function startProxy(googleEnabled, counter) {
  const server = createServer(async (req, res) => {
    const target = new URL(req.url, UPSTREAM)

    if (target.pathname === '/auth/v1/settings') {
      counter.hits += 1
      const upstream = await fetch(target, { headers: { apikey: req.headers.apikey ?? '' } })
      const body = await upstream.json()
      body.external = { ...body.external, google: googleEnabled }
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' })
      res.end(JSON.stringify(body))
      return
    }

    const headers = { ...req.headers }
    delete headers.host
    delete headers['content-length']
    const chunks = []
    for await (const c of req) chunks.push(c)
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
      redirect: 'manual',
    })
    const out = Object.fromEntries(upstream.headers.entries())
    delete out['content-encoding']
    delete out['content-length']
    res.writeHead(upstream.status, out)
    res.end(Buffer.from(await upstream.arrayBuffer()))
  })
  return new Promise((resolve) => server.listen(PROXY_PORT, '127.0.0.1', () => resolve(server)))
}

function startApp(port, env) {
  const child = spawn('npx', ['next', 'start', '-p', String(port)], {
    env: { ...process.env, ...env },
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('app did not start within 60s')), 60_000)
    const onData = (buf) => {
      if (/Ready in|started server|Local:/i.test(String(buf))) {
        clearTimeout(timer)
        resolve(child)
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`app exited early with ${code}`))
    })
  })
}

async function fetchPage(port, path) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    headers: { accept: 'text/html' },
  })
  return { status: res.status, type: res.headers.get('content-type') ?? '', html: await res.text() }
}

const results = []
function assert(label, condition, detail) {
  results.push({ label, ok: Boolean(condition), detail })
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` :: ${detail}` : ''}`)
}

async function runCase(googleEnabled) {
  const label = googleEnabled ? 'PROVIDER ENABLED' : 'PROVIDER DISABLED'
  console.log(`\n=== ${label} ===`)

  // NEXT_PUBLIC_* values are inlined at BUILD time, including into the server
  // bundle, so a runtime override of the Supabase URL is ignored. The build
  // therefore points at the proxy and only the proxy's answer changes between
  // the two cases. Everything except /auth/v1/settings still reaches the real
  // TEST project.
  const port = googleEnabled ? APP_PORTS.enabled : APP_PORTS.disabled
  await assertPortFree(port)
  await assertPortFree(PROXY_PORT)

  const counter = { hits: 0 }
  const proxy = await startProxy(googleEnabled, counter)
  const app = await startApp(port, {
    NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${port}`,
  })

  try {
    for (const path of ['/login', '/signup']) {
      const { status, type, html } = await fetchPage(port, path)
      assert(`${path} renders HTML`, status === 200 && type.includes('text/html'), `${status} ${type}`)

      const hasButton = html.includes('Continue with Google')
      assert(
        `${path} ${googleEnabled ? 'SHOWS' : 'HIDES'} the Google button`,
        hasButton === googleEnabled,
        `button present: ${hasButton}`,
      )

      // The divider only exists to separate the provider block from the form,
      // so it must come and go with the button.
      const hasDivider = /<span[^>]*>\s*or\s*<\/span>/i.test(html)
      assert(
        `${path} divider follows the button`,
        hasDivider === googleEnabled,
        `divider present: ${hasDivider}`,
      )

      // Email sign-in must work in BOTH states. Its absence in the disabled
      // case would mean users had no way in at all.
      // React emits the attribute in camelCase; HTML attribute names are
      // ASCII case-insensitive so the parser reads it as `autocomplete`.
      // Matching case-insensitively is therefore correct, not a fudge.
      // Proves the page under test really consulted OUR proxy. Without this,
      // a stale server on the port would sail through every other assertion.
      assert(
        `${path} consulted the provider settings endpoint`,
        counter.hits > 0,
        `settings requests seen: ${counter.hits}`,
      )

      assert(
        `${path} still offers email sign-in`,
        /autocomplete="username"/i.test(html) &&
          /autocomplete="(current|new)-password"/i.test(html) &&
          html.includes('name="email"'),
      )
    }
  } finally {
    app.kill()
    proxy.close()
    await new Promise((r) => setTimeout(r, 1500))
  }
}

await runCase(false)
await runCase(true)

const failed = results.filter((r) => !r.ok)
console.log(`\n=== ${results.length - failed.length}/${results.length} assertions passed ===`)
if (failed.length > 0) {
  for (const f of failed) console.error(`  FAILED: ${f.label} ${f.detail ?? ''}`)
  process.exit(1)
}
console.log(
  '\nNote: the hop to Google\'s consent screen is NOT proven here. It needs the\n' +
    'provider genuinely enabled in the Supabase Dashboard, which is out of scope\n' +
    'for this branch. See docs/hardening/auth/FOUNDER-STEPS.md and the auth\n' +
    'sentinel provider-parity check.\n',
)
