/**
 * THE CANONICAL HOST GUARD. Build-failing.
 *
 * The canonical host is www.eventlinqs.com.au (founder ruling, 25 July 2026),
 * and there is exactly ONE definition of it: PRODUCTION_FALLBACK in
 * src/lib/site-url.ts, reached through getSiteUrl(), getAppUrl() or
 * canonicalHost(). Everything else resolves it; nothing else declares it.
 *
 * WHY THIS EXISTS. The same defect landed in place after place before anyone
 * joined them up: the Supabase site URL, the guides structured data, the Stripe
 * webhook origin fallback, the organisation slug hint, the waitlist email
 * fallback, and FOUR separate share-card generators that printed the wrong host
 * onto an artefact a stranger sees. Every one was found by accident. A grep in
 * CI finds all of them, every time, for nothing.
 *
 * WHAT COUNTS AS A URL POSITION. A bare host, or a scheme plus host, in code or
 * JSX text. Three things are deliberately NOT that:
 *
 * - An EMAIL ADDRESS at the domain. hello@eventlinqs.com is a real, deliverable
 *   mailbox and the mail domain is a different system from the web host. Those
 *   are stripped before the check runs.
 * - ANOTHER HOST on the same domain. send.eventlinqs.com is the mail domain,
 *   images.eventlinqs.com is the image CDN, resend._domainkey.eventlinqs.com is
 *   a DKIM record. The lookbehind refuses a match preceded by a dot, so none of
 *   them is swept up, and none of them moves when the web host moves.
 * - A COMMENT. A comment naming the host is documentation, often the very
 *   documentation explaining why the line beside it is the way it is. Failing a
 *   build over prose is how a guard gets switched off.
 *
 * Run standalone:  node scripts/guards/canonical-host.mjs
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const SEARCH_DIRS = ['src', 'scripts']
const EXTENSIONS = new Set(['.ts', '.tsx', '.mjs', '.js', '.jsx'])

/** The one file allowed to declare the host, because it IS the definition. */
const DEFINITION_FILE = 'src/lib/site-url.ts'

/**
 * Files allowed a literal host in a URL position, each with the reason on the
 * record. An entry here is a decision someone has to defend, not a wave-through.
 */
const ALLOWLIST = [
  {
    file: 'src/proxy.ts',
    reason:
      'the redirect table has to NAME the non-canonical hosts it 301s away from. Resolving them would defeat the purpose: this is the code that makes the canonical host canonical',
  },
  {
    file: 'src/app/legal/cookies/page.tsx',
    reason:
      'names the cookie domain scope in legal prose. That describes what a browser stores, not a link we generate, and it must not change with a deployment environment',
  },
  {
    file: 'src/app/layout.tsx',
    reason:
      'the Plausible SITE identifier, which is not a URL. It is the key historical analytics is filed under and changing it orphans that history. Founder is reviewing it and asked for it to be left alone',
  },
  {
    file: 'src/lib/analytics/plausible.ts',
    reason: 'the same Plausible site identifier and its server user agent. Same reason, same ruling',
  },
  {
    file: 'src/lib/email/sender.ts',
    reason:
      'the SENDING domain, pinned to the apex by the founder ruling of 3 August 2026 and verified at Resend. Mail and web are different systems and must not move together',
  },
  {
    file: 'src/lib/email/send.ts',
    reason: 'records the unverified send subdomain that the sender ruling fixed',
  },
  {
    file: 'src/lib/env/manifest.mjs',
    reason: 'declares the sender-address contract, which is the mail domain, not the web host',
  },
  {
    file: 'src/lib/env/destinations.ts',
    reason: 'describes how the mail domain and the web host relate',
  },
  {
    file: 'src/lib/health/checks.ts',
    reason: 'records the send-subdomain verification failure the sender ruling fixed',
  },
  {
    file: 'src/lib/storage/url.ts',
    reason: 'documents the images CDN host, a different host on the same domain',
  },
  {
    file: 'src/components/media/safe-image-src.ts',
    reason: 'allowlists the images CDN host for next/image, not the web host',
  },
  {
    file: 'scripts/guards/canonical-host.mjs',
    reason: 'this guard has to name the host it is guarding',
  },
  {
    file: 'scripts/guards/canonical-host-runtime.mjs',
    reason:
      'the runtime half of this guard. It PROVES the resolvers refuse the secondary host, so every ' +
      'scenario it runs has to name the wrong value it is feeding in. Same shape as ' +
      'env-locks-verify.mjs below: a proof that something is rejected must be allowed to name it',
  },
  // The three sweep journeys below build a throwaway EMAIL ADDRESS, not a URL:
  // `sweep.buyer.${stamp}@eventlinqs.com`. The guard matches the bare domain
  // wherever it appears, so an address in a template literal reads to it as a
  // host in a URL position. Resolving these through getSiteUrl() would be
  // wrong twice over: the recipient domain is not the web host, and it must
  // not follow a deployment environment or the sweep would post to a real
  // inbox. Found blocking `npm run build` on origin/main, so this unblocks
  // main as well as this branch.
  //
  // REPRODUCED FROM feat/public-composer, which hit this first and resolved it
  // the same way. The scripts live on origin/main and this guard lives here, so
  // the collision only exists once the two are merged, and every branch that
  // carries this guard meets it on merging main.
  {
    file: 'scripts/sweep/journey-buyer-full.mjs',
    reason: 'builds a throwaway test EMAIL address, not a URL; the recipient domain must not follow the deployment host',
  },
  {
    file: 'scripts/sweep/journey-buyer.mjs',
    reason: 'builds a throwaway test EMAIL address, not a URL; the recipient domain must not follow the deployment host',
  },
  {
    file: 'scripts/sweep/journey-organiser-signup.mjs',
    reason: 'builds a throwaway test EMAIL address, not a URL; the recipient domain must not follow the deployment host',
  },
  {
    file: 'scripts/batch-11.1-d3-3-link-audit.mjs',
    reason:
      'a historical audit script that crawled BOTH hosts on purpose, to find which pages differed between them',
  },
  {
    file: 'scripts/check-env-stores.mjs',
    reason: 'records which host was probed and that it 301s to the canonical one',
  },
  {
    file: 'scripts/email-brand-preview.mjs',
    reason: 'a sample token URL in a local email preview, never sent to anyone',
  },
  {
    file: 'scripts/generate-imagery-manifest.mjs',
    reason: 'documents the images CDN host',
  },
  {
    file: 'scripts/verify/funds-holding-integrated.mjs',
    reason:
      'the business_profile URL sent to Stripe in a TEST fixture. It is data posted to a third party in a proof script, not a link the platform hands a person',
  },
  {
    file: 'scripts/verify/funds-holding-proof.mjs',
    reason: 'the same Stripe TEST fixture business_profile URL',
  },
  {
    file: 'scripts/verify-mapbox-restriction.mjs',
    reason:
      'asserts which origins the Mapbox token accepts, so it has to name the origins that were registered with Mapbox',
  },
  {
    file: 'scripts/verify-upstash-sydney.mjs',
    reason: 'a default probe target overridable on the command line, never a generated link',
  },
  {
    file: 'scripts/verify/env-locks-verify.mjs',
    reason: 'asserts the guard REJECTS the unverified send subdomain, so it must name it',
  },
]

/**
 * Every first path segment the app already owns, read from the app directory
 * rather than typed out, so it cannot drift. Any link namespace must avoid all
 * of these, and any new top-level route must avoid the link namespaces.
 */
export function topLevelRoutes() {
  const appDir = path.join(ROOT, 'src', 'app')
  const found = new Set()
  const walk = (dir, depth) => {
    if (depth > 1) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const name = entry.name
      // Route groups and parallel routes do not own a URL segment.
      if (name.startsWith('(') || name.startsWith('@') || name.startsWith('_')) {
        walk(path.join(dir, name), depth)
        continue
      }
      if (name.startsWith('[')) continue
      found.add(name)
    }
  }
  walk(appDir, 0)
  return [...found].sort()
}

function* walkFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue
      yield* walkFiles(full)
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      yield full
    }
  }
}

const EMAIL_AT_DOMAIN = /[A-Za-z0-9._%+-]+@eventlinqs\.com(?:\.au)?/g
const WRONG_HOST = /(?<![\w.-])(?:https?:\/\/)?(?:www\.)?eventlinqs\.com(?!\.au)/

/** Blank out comments, keeping line numbers intact. */
function stripComments(source) {
  const out = []
  let inBlock = false
  for (const raw of source.split('\n')) {
    let line = raw
    if (inBlock) {
      const close = line.indexOf('*/')
      if (close === -1) {
        out.push('')
        continue
      }
      line = line.slice(close + 2)
      inBlock = false
    }
    for (;;) {
      const open = line.indexOf('/*')
      if (open === -1) break
      const close = line.indexOf('*/', open + 2)
      if (close === -1) {
        line = line.slice(0, open)
        inBlock = true
        break
      }
      line = line.slice(0, open) + line.slice(close + 2)
    }
    const lineComment = line.indexOf('//')
    // Not a comment when it is the // of a scheme.
    if (lineComment !== -1 && !/https?:$/.test(line.slice(0, lineComment))) {
      line = line.slice(0, lineComment)
    }
    out.push(line)
  }
  return out
}

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join('/')
}

export function findViolations() {
  const violations = []
  for (const dir of SEARCH_DIRS) {
    const abs = path.join(ROOT, dir)
    if (!fs.existsSync(abs)) continue
    for (const file of walkFiles(abs)) {
      const rel = relative(file)
      if (rel === DEFINITION_FILE) continue
      if (ALLOWLIST.some(entry => entry.file === rel)) continue

      const lines = stripComments(fs.readFileSync(file, 'utf8'))
      lines.forEach((line, index) => {
        const withoutEmails = line.replace(EMAIL_AT_DOMAIN, '')
        if (WRONG_HOST.test(withoutEmails)) {
          violations.push({ file: rel, line: index + 1, text: line.trim().slice(0, 140) })
        }
      })
    }
  }
  return violations
}

const invokedDirectly =
  process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]).replace(/\\/g, '/'))

if (invokedDirectly) {
  const violations = findViolations()
  if (violations.length > 0) {
    console.error(
      `canonical-host: ${violations.length} literal host(s) in a URL position.\n` +
        'The canonical host is www.eventlinqs.com.au and it lives once, in ' +
        `${DEFINITION_FILE}. Read it through getSiteUrl(), getAppUrl() or ` +
        'canonicalHost() rather than typing it. If a literal is genuinely ' +
        'required, add an allowlist entry with the reason.\n',
    )
    for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.text}`)
    process.exit(1)
  }
  console.log('canonical-host: clean (one definition, every URL position resolves it)')
}
