/**
 * SEARCH CONSOLE, IN ONE COMMAND (close-out SEO2 step 2, Law 10).
 *
 * WHAT THIS IS FOR. Nothing on this platform has ever told Google who owns it,
 * so nobody has ever been able to read what Google thinks of it. C19 was fought
 * entirely from five exclusion reasons the owner read off a screen and pasted
 * into a document. This connects the property once, and after that the weekly
 * indexing check asks Google the question and the daily digest carries the
 * answer as one line.
 *
 * LAW 10, SPLIT HONESTLY. Exactly one act here is the founder's, and it is his
 * because a machine cannot do it rather than because it is his to do:
 *
 *   RESERVED    signing in to a Google account and pressing VERIFY. The token
 *               does not exist until Search Console mints it for a signed-in
 *               person, so there is nothing for a script to fetch.
 *   SCRIPTED    everything else. Storing the token on all three Vercel scopes,
 *               keeping the local file in step, and then OBSERVING the live page
 *               to say whether the tag is actually being served.
 *
 * IT NEVER PRINTS THE VALUE. The token is not a secret in any meaningful sense,
 * because its whole purpose is to be published in the homepage HTML, but the
 * house rule for a script that handles configuration is that it reports length
 * and fingerprint and never the value, and a rule with an exception is a rule
 * nobody follows.
 *
 * IT IS IDEMPOTENT. Run it with the same token twice and the second run stores
 * the same value and reports the same state. Run it with no token and it only
 * looks.
 *
 *   npm run seo2:verify-property                      observe, change nothing
 *   npm run seo2:verify-property -- --token <token>   store it and observe
 *   npm run seo2:verify-property -- --token <token> --dry-run
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  SITE_VERIFICATION_ENV,
  GOOGLE_VERIFICATION_META,
  readVerificationToken,
} from '@/lib/seo/site-verification'
import { fingerprint } from '@/lib/env/manifest-checks.mjs'
import { resolveVercelToken } from '../lib/vercel-login.mjs'

const ROOT = process.cwd()
const TAG = '[search-console]'
const argv = process.argv.slice(2)
const argOf = flag => {
  const i = argv.indexOf(flag)
  return i >= 0 && typeof argv[i + 1] === 'string' ? argv[i + 1] : null
}
const DRY_RUN = argv.includes('--dry-run')
const SITE = (argOf('--site') || process.env.INDEXING_SITE || 'https://www.eventlinqs.com.au').replace(/\/$/, '')
const RAW_TOKEN = argOf('--token')
const SCOPES = ['production', 'preview', 'development']
const ENV_LOCAL = join(ROOT, '.env.local')

const say = m => console.log(`${TAG} ${m}`)
/**
 * A refusal sets the exit code and unwinds; it never calls process.exit().
 *
 * On Windows a hard exit while the socket from the observation below is still
 * open aborts inside libuv with "Assertion failed: !(handle->flags &
 * UV_HANDLE_CLOSING)", which reads as a crash in a script that did exactly what
 * it was asked.
 */
class Refusal extends Error {}
const fail = m => {
  throw new Refusal(m)
}

/*
 * THE LOGIN IS RESOLVED, NEVER ASSUMED. `vercel env ls` with no token answers
 * with an error that reads much like "nothing here", and this script would then
 * report an unset variable on a project that holds it. The shared resolver reads
 * VERCEL_TOKEN, then the CLI's own stored login, and says which it used, so a
 * run with no credential says THAT rather than inventing an answer.
 */
const LOGIN = resolveVercelToken()

/*
 * THE REST API RATHER THAN THE CLI, and the reason is this repository's own
 * shape. The CLI refuses every project command with "Your codebase isn't linked
 * to a project on Vercel" unless `.vercel/project.json` is present, and that
 * file is gitignored and per-checkout: this build runs in three git worktrees
 * and on CI, and only one of those has ever been linked. The API needs the
 * token and the project id and nothing else, which is exactly what
 * scripts/ops/production-parity.mjs already does to read the same store.
 */
const PROJECT_NAME = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).name

async function api(path, init = {}) {
  const res = await fetch(`https://api.vercel.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${LOGIN.token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  const body = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, body }
}

/**
 * The project and team to act on: the environment first, then a link file if
 * this checkout happens to have one, and failing both, the project list matched
 * on the name in package.json. The last path is a convenience and it refuses
 * rather than guesses when the name matches none or more than one.
 */
async function resolveProject() {
  let projectId = process.env.VERCEL_PROJECT_ID
  let teamId = process.env.VERCEL_ORG_ID
  const file = join(ROOT, '.vercel', 'project.json')
  if ((!projectId || !teamId) && existsSync(file)) {
    try {
      const cfg = JSON.parse(readFileSync(file, 'utf8'))
      projectId = projectId || cfg.projectId
      teamId = teamId || cfg.orgId
    } catch (error) {
      // NOT SILENT. An unreadable link file and an absent one lead to the same
      // fallback, and the reader needs to know which happened: a corrupt
      // .vercel/project.json looks exactly like a worktree that was never
      // linked, and only one of those is worth fixing.
      say(`${file} could not be read (${error instanceof Error ? error.message : String(error)}); resolving the project by name instead`)
    }
  }
  if (projectId && teamId) return { projectId, teamId, how: 'VERCEL_PROJECT_ID/.vercel/project.json' }
  const listed = await api('/v9/projects?limit=100')
  if (!listed.ok) return { error: `the project list could not be read: HTTP ${listed.status}` }
  const matches = (listed.body.projects ?? []).filter(p => p.name === PROJECT_NAME)
  if (matches.length !== 1) {
    return { error: `${matches.length} Vercel project(s) are named ${PROJECT_NAME}; set VERCEL_PROJECT_ID and VERCEL_ORG_ID` }
  }
  return { projectId: matches[0].id, teamId: matches[0].accountId, how: `the project named ${PROJECT_NAME}` }
}

/* ------------------------------------------------------------- 1. observe first */

async function observe() {
  say(`property: ${SITE}`)
  let liveTag = null
  let liveStatus = 0
  try {
    const res = await fetch(`${SITE}/`, { headers: { 'User-Agent': 'eventlinqs-search-console-verify' } })
    liveStatus = res.status
    const html = await res.text()
    const meta = new RegExp(`<meta[^>]+name=["']${GOOGLE_VERIFICATION_META}["'][^>]*>`, 'i').exec(html)
    liveTag = meta ? (/content=["']([^"']+)["']/i.exec(meta[0])?.[1] ?? null) : null
  } catch (e) {
    say(`the live homepage could not be read (${e instanceof Error ? e.message : String(e)}), so what it serves is unknown`)
  }
  say(`live homepage: HTTP ${liveStatus}, ${GOOGLE_VERIFICATION_META} tag ${liveTag ? `PRESENT (fp ${fingerprint(liveTag)})` : 'ABSENT'}`)

  if (!LOGIN.token) {
    say(`the Vercel store cannot be read: ${LOGIN.reason}. What it holds is UNKNOWN, which is not the same as empty.`)
  } else {
    const project = await resolveProject()
    if (project.error) {
      say(`the Vercel store could not be reached even with ${LOGIN.source}: ${project.error}`)
    } else {
      const held = await storedTargets(project)
      if (held.error) say(`the Vercel store could not be listed: ${held.error}`)
      else {
        say(
          `Vercel store (${LOGIN.source}, ${project.how}): ${SITE_VERIFICATION_ENV} is ` +
            (held.targets.length > 0 ? `SET on ${held.targets.join(', ')}` : 'NOT SET on any scope'),
        )
      }
    }
  }

  say('robots.txt already names the sitemap, which is one of the four submission methods Google documents')
  say('  (https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap, fetched 2026-09-14)')
  return liveTag
}

/* ------------------------------------------------- 2. no token: say what is left */

function printTheFounderStep(liveTag) {
  console.log('')
  if (liveTag) {
    say('the tag is live. If Search Console still shows the property unverified, press VERIFY there: the tag is what it reads.')
    return
  }
  say('THE ONE STEP A MACHINE CANNOT DO, and then one command that finishes it:')
  console.log('')
  console.log('  1. Open https://search.google.com/search-console and sign in.')
  console.log(`  2. Add a property. Choose URL PREFIX and enter exactly: ${SITE}`)
  console.log('     (A Domain property is the other option and is verified by DNS only, which')
  console.log('      needs the registrar. The URL-prefix property needs nothing but the tag.)')
  console.log('  3. Choose the HTML TAG method and copy the whole line it shows you.')
  console.log('  4. Come back and run:')
  console.log('')
  console.log("       npm run seo2:verify-property -- --token '<paste the whole tag, or just the token>'")
  console.log('')
  console.log('     That stores it on every Vercel scope, keeps .env.local in step, and tells you')
  console.log('     what is left. Then press VERIFY in Search Console and submit the sitemap')
  console.log(`     ${SITE}/sitemap.xml in the Sitemaps report.`)
  console.log('')
  console.log('  THE DNS ALTERNATIVE, if a Domain property is wanted instead. At the registrar for')
  console.log('  eventlinqs.com.au add one TXT record:')
  console.log('')
  console.log('       Host/Name   @   (or leave it blank)')
  console.log('       Type        TXT')
  console.log('       Value       google-site-verification=<the string Search Console shows>')
  console.log('')
  console.log('  (https://support.google.com/webmasters/answer/9008080, fetched 2026-09-14)')
}

/* -------------------------------------------------------------------- 3. store it */

/** Which scopes already carry the variable. The value is never requested. */
async function storedTargets(project) {
  const listed = await api(`/v10/projects/${project.projectId}/env?teamId=${project.teamId}`)
  if (!listed.ok) return { error: `HTTP ${listed.status} ${JSON.stringify(listed.body).slice(0, 160)}` }
  const row = (listed.body.envs ?? []).find(e => e.key === SITE_VERIFICATION_ENV)
  return { targets: row ? [...(row.target ?? [])].sort() : [] }
}

async function store(token) {
  if (!LOGIN.token) fail(`${LOGIN.reason}, so nothing can be stored on Vercel from this machine`)
  const project = await resolveProject()
  if (project.error) fail(project.error)

  /*
   * ONE IDEMPOTENT CALL FOR ALL THREE SCOPES. `upsert=true` is documented as
   * "a new environment variable will not be created if it already exists but,
   * the existing variable's value will be updated"
   * (https://vercel.com/docs/rest-api/reference/endpoints/projects/create-one-or-more-environment-variables,
   * fetched 2026-09-14), which is exactly what re-running this command should
   * mean. `type: 'plain'` because the value is published in the HTML by design;
   * marking it sensitive would make it unreadable in the dashboard and protect
   * nothing (see the manifest entry).
   */
  const created = await api(`/v10/projects/${project.projectId}/env?upsert=true&teamId=${project.teamId}`, {
    method: 'POST',
    body: JSON.stringify({
      key: SITE_VERIFICATION_ENV,
      value: token,
      type: 'plain',
      target: SCOPES,
      comment: 'Search Console ownership token (close-out SEO2). Set by npm run seo2:verify-property.',
    }),
  })
  if (!created.ok) fail(`Vercel refused the write: HTTP ${created.status} ${JSON.stringify(created.body).slice(0, 200)}`)
  const failedRows = created.body.failed ?? []
  if (failedRows.length > 0) fail(`Vercel refused ${failedRows.length} row(s): ${JSON.stringify(failedRows).slice(0, 200)}`)
  say(`stored on ${SCOPES.join(', ')} (${project.how})`)

  /*
   * The local file, kept in step so a local build emits the same tag. Rewritten
   * in place when the key is already there, appended when it is not, and never
   * echoed.
   */
  if (!existsSync(ENV_LOCAL)) {
    say('.env.local does not exist on this machine, so nothing local was written')
  } else {
    const before = readFileSync(ENV_LOCAL, 'utf8')
    const line = `${SITE_VERIFICATION_ENV}=${token}`
    const pattern = new RegExp(`^${SITE_VERIFICATION_ENV}=.*$`, 'm')
    const after = pattern.test(before) ? before.replace(pattern, line) : `${before.replace(/\s*$/, '')}\n${line}\n`
    if (after === before) say('.env.local already held this value')
    else {
      writeFileSync(ENV_LOCAL, after)
      say('.env.local updated')
    }
  }

  // OBSERVE THE RESULT rather than trusting the call that produced it.
  const after = await storedTargets(project)
  if (after.error) fail(`the store could not be read back after the write: ${after.error}`)
  const missing = SCOPES.filter(scope => !after.targets.includes(scope))
  if (missing.length > 0) {
    fail(`${SITE_VERIFICATION_ENV} is not on ${missing.join(', ')} after the write; the store says ${after.targets.join(', ') || 'no scope'}`)
  }
  say(`observed: the variable is on ${after.targets.join(', ')}`)

  console.log('')
  say('WHAT IS LEFT, and both halves are named:')
  console.log('  1. The tag reaches the live site on the NEXT PRODUCTION DEPLOY. Metadata is')
  console.log('     composed at build time, so storing the value does not change the page being')
  console.log('     served now. Re-run this command with no arguments after the deploy and it')
  console.log('     will tell you whether the tag is live.')
  console.log('  2. Then press VERIFY in Search Console, and submit the sitemap')
  console.log(`     ${SITE}/sitemap.xml in the Sitemaps report.`)
  console.log('')
  say('After that, `npm run seo2:indexing-check` can ask Google what it indexed, once a')
  say('service-account key for the property is in GOOGLE_SEARCH_CONSOLE_KEY.')
}

/* ------------------------------------------------------------------------- main */

try {
  const liveTag = await observe()
  if (!RAW_TOKEN) {
    printTheFounderStep(liveTag)
  } else {
    const { token, reason } = readVerificationToken(RAW_TOKEN)
    if (!token) fail(reason ?? 'no token was given')
    if (liveTag && liveTag === token) {
      say(`the live homepage already serves this exact token (fp ${fingerprint(token)}); storing it again is a no-op`)
    }
    say(`token accepted: length ${token.length}, fp ${fingerprint(token)}`)
    if (DRY_RUN) say('dry run: nothing stored, nothing deployed.')
    else await store(token)
  }
} catch (error) {
  if (error instanceof Refusal) console.error(`${TAG} REFUSED: ${error.message}`)
  else console.error(`${TAG} threw: ${error instanceof Error ? error.stack : String(error)}`)
  process.exitCode = 1
}
