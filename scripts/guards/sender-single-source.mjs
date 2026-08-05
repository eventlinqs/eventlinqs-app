/**
 * BUILD-FAILING GUARD: exactly one definition of who EventLinqs mail is from.
 *
 * Before 2026-08-03 the sending identity was a string literal in five separate
 * files: src/lib/email/send.ts, src/lib/email/order-confirmation.ts,
 * src/lib/waitlist/promote.ts, src/lib/payouts/email.ts and the Stripe webhook.
 * A sending-domain move was therefore a five-file archaeology exercise with no
 * way to prove it was complete, and the founder had a live decision pending on
 * exactly that move.
 *
 * Now every `from:` and `replyTo:` resolves through src/lib/email/sender.ts,
 * and this guard keeps it that way: a sender address literal anywhere else
 * fails the build.
 *
 * SCOPE. This guards SENDER identity, which is what the mail transport uses.
 * Contact addresses rendered in page copy (careers@, legal@, privacy@, press@,
 * support@, organisers@ on the legal and marketing pages) are deliberately out
 * of scope: they are user-facing copy under the design lock, not transport
 * configuration, and are listed in docs/hardening/auth/DOMAIN-DECISION.md.
 *
 * Run by `npm run guards`, which `prebuild` invokes, so `npm run build` fails.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sourceFiles } from './lib/source.mjs'

const ROOT = process.cwd()

/** The one file allowed to contain a sender address. */
const SINGLE_SOURCE = 'src/lib/email/sender.ts'

/**
 * A sender literal is an email address appearing as the value of a `from` or
 * `replyTo` property, or assigned to a FROM-ish constant. Matching on the
 * property rather than on the address alone keeps `mailto:` links in page copy
 * and `VAPID_SUBJECT` out of scope.
 */
const PATTERNS = [
  {
    // from: 'EventLinqs <noreply@eventlinqs.com>'   /   from: "x@y.z"
    re: /\b(from|replyTo|reply_to)\s*:\s*['"`][^'"`]*@[^'"`]+['"`]/gi,
    what: 'a literal sender address on a from/replyTo property',
  },
  {
    // const FROM = 'EventLinqs <noreply@...>'
    re: /\b(?:const|let|var)\s+[A-Z_]*FROM[A-Z_]*\s*=\s*['"`][^'"`]*@[^'"`]+['"`]/g,
    what: 'a literal sender address assigned to a FROM constant',
  },
]

const failures = []

for (const file of sourceFiles(ROOT)) {
  if (file === SINGLE_SOURCE) continue
  const src = readFileSync(join(ROOT, file), 'utf8')
  for (const { re, what } of PATTERNS) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(src)) !== null) {
      const line = src.slice(0, m.index).split('\n').length
      failures.push(
        `${file}:${line} contains ${what}:\n` +
          `            ${m[0].trim()}\n` +
          `          Use getEmailFrom(), getNoReplyFrom() or getReplyToAddress()\n` +
          `          from ${SINGLE_SOURCE} instead.`,
      )
    }
  }
}

if (failures.length > 0) {
  console.error('\n[sender-single-source] FAILED\n')
  for (const f of failures) console.error(`  ${f}\n`)
  console.error(
    `  ${failures.length} violation(s). Every sender address must derive from\n` +
      `  ${SINGLE_SOURCE} so a domain move is a one-line change.\n`,
  )
  process.exit(1)
}

console.log(`[sender-single-source] PASS - every sender derives from ${SINGLE_SOURCE}.`)
