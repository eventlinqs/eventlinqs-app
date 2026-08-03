/**
 * BUILD-FAILING GUARD: no auth flow may depend on Supabase Auth's mailer.
 *
 * Supabase's built-in email provider is capped at TWO emails per hour,
 * project-wide (supabase.com/docs/guides/auth/rate-limits). Every flow that
 * routes through it is one busy afternoon away from silently failing. That cap
 * is what answered the founder "Error sending recovery email" on 2026-08-02.
 *
 * Configuring custom SMTP in the Supabase dashboard raises the cap, but leaves
 * the platform's mail depending on a dashboard toggle that no code owns, no
 * test covers and no gate can see. The permanent fix is to own the transport:
 * every auth email is minted with `admin.auth.admin.generateLink()` (which
 * sends nothing) and dispatched through Resend by
 * src/lib/auth/dispatch-auth-link.ts.
 *
 * This guard is what stops the dependency creeping back in. The three banned
 * calls below are precisely the ones that were still live in August 2026 after
 * being parked as "follow-ups" in May.
 *
 * Run by `npm run guards`, which `prebuild` invokes, so `npm run build` fails.
 */
import { globSync } from 'node:fs'
import { join } from 'node:path'
import { readSource, lineAt } from './lib/source.mjs'

const ROOT = process.cwd()

/** Client-side calls that make Supabase Auth send the email itself. */
const BANNED = [
  {
    pattern: /\.auth\s*\.\s*resetPasswordForEmail\s*\(/,
    call: 'auth.resetPasswordForEmail()',
    instead: 'POST /api/auth/recover (dispatchPasswordReset)',
  },
  {
    pattern: /\.auth\s*\.\s*signInWithOtp\s*\(/,
    call: 'auth.signInWithOtp()',
    instead: 'POST /api/auth/magic-link (dispatchMagicLink)',
  },
  {
    pattern: /\.auth\s*\.\s*resend\s*\(/,
    call: 'auth.resend()',
    instead: 'POST /api/auth/resend-verification (dispatchVerificationResend)',
  },
  {
    pattern: /\.auth\s*\.\s*admin\s*\.\s*inviteUserByEmail\s*\(/,
    call: 'auth.admin.inviteUserByEmail()',
    instead: 'a generateLink + Resend dispatch in src/lib/auth/dispatch-auth-link.ts',
  },
]

const failures = []

for (const rel of globSync('src/**/*.{ts,tsx}', { cwd: ROOT })) {
  const file = rel.replace(/\\/g, '/')
  // `code` has comments AND string contents blanked, so this guard's own
  // explanations, and the comments in the fixed code recording which call was
  // removed and why, cannot trip it.
  const { code } = readSource(join(ROOT, file))
  for (const banned of BANNED) {
    const re = new RegExp(banned.pattern.source, 'g')
    let m
    while ((m = re.exec(code)) !== null) {
      failures.push(
        `${file}:${lineAt(code, m.index)} calls ${banned.call}, which sends through Supabase\n` +
          `          Auth's built-in mailer and its 2-per-hour project-wide cap.\n` +
          `          Use ${banned.instead} instead.`,
      )
    }
  }
}

if (failures.length > 0) {
  console.error('\n[no-supabase-smtp] FAILED\n')
  for (const f of failures) console.error(`  ${f}\n`)
  console.error(
    `  ${failures.length} violation(s). An auth flow on Supabase's built-in mailer is\n` +
      `  capped at 2 emails per hour and will fail silently under real traffic.\n`,
  )
  process.exit(1)
}

console.log(`[no-supabase-smtp] PASS - no auth flow depends on Supabase's mailer (${BANNED.length} patterns).`)
