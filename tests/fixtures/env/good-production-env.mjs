/**
 * THE ONE KNOWN-GOOD PRODUCTION ENVIRONMENT. Both proof harnesses read it here.
 *
 *   tests/unit/security/env-manifest.test.ts   the CI-blocking half
 *   scripts/verify/env-locks-verify.mjs        the by-hand break-restore half
 *
 * WHY THIS FILE EXISTS. Each harness used to carry its own copy of this object,
 * and the two copies were only equal by habit. On 2026-08-12 the manifest gained
 * a variable REQUIRED on production, one copy was updated and the other was not,
 * and the baseline case "a complete, correct production environment passes"
 * started failing against the very manifest it is supposed to satisfy. The
 * harness was not wrong and the manifest was not wrong: the second fixture was
 * simply invisible to whoever changed the first.
 *
 * That is a class, not an incident, and a second copy is what makes it possible.
 * So there is now ONE copy. Adding a variable REQUIRED on production means
 * adding it HERE, once, and both harnesses see it in the same commit. They can
 * no longer disagree about what a correct production environment looks like.
 *
 * NO SECRETS ANYWHERE. Every value is synthetic, built from repeated characters
 * or from a value that is public by design. Nothing here is or resembles a real
 * credential, and the evaluators these fixtures drive return findings, never
 * values.
 */

/** Build a synthetic value of a given length: `rep('a', 60)`. */
export const rep = (ch, n) => ch.repeat(n)

/** 15 characters, the shape of a Stripe account id. Shared so the pairing and
 *  mode-family cases in both harnesses compare the SAME account against itself. */
export const ACCOUNT = 'T8WBhGuiZ9cvxuu'

/**
 * A synthetic PRODUCTION environment that satisfies the whole manifest.
 *
 * The return type is declared OPEN on purpose. Every breakage case adds a key
 * this object does not carry (a forbidden variable, a preview override) or
 * deletes one it does, and a closed object-literal type rejects both under
 * `tsc --noEmit` in the TypeScript consumer.
 *
 * @returns {Record<string, string>}
 */
export function goodProductionEnv() {
  return {
    VERCEL_ENV: 'production',

    NEXT_PUBLIC_SUPABASE_URL: 'https://gndnldyfudbytbboxesk.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: `eyJ${rep('a', 60)}`,
    SUPABASE_SERVICE_ROLE_KEY: `eyJ${rep('b', 60)}`,

    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: `pk_live_51${ACCOUNT}${rep('P', 30)}`,
    STRIPE_SECRET_KEY: `sk_live_51${ACCOUNT}${rep('S', 30)}`,
    STRIPE_WEBHOOK_SECRETS: `whsec_${rep('w', 32)},whsec_${rep('x', 32)}`,

    CRON_SECRET: rep('c', 64),
    QUEUE_SECRET: rep('q', 64),

    RESEND_API_KEY: `re_${rep('r', 24)}`,
    EMAIL_FROM: 'EventLinqs <hello@eventlinqs.com>',
    // Both became REQUIRED on production when the manifest stopped leaving them
    // with no opinion, and both were SET on production on 2026-08-03. Each has
    // an in-code fallback, so nothing was ever lost, but the destination for a
    // support escalation and for every payment and health alert was a literal
    // in a source file rather than a value anyone could see or change.
    //
    // NOT alerts@eventlinqs.com, which this fixture used to carry: that address
    // was tested on 2026-08-03 and HARD BOUNCED (550 5.4.1, Exchange Online).
    // A fixture that models a bouncing address as the good case teaches the
    // wrong thing to whoever copies it next.
    PAYMENT_ALERT_EMAIL: 'hello@eventlinqs.com',
    SUPPORT_INBOX_EMAIL: 'hello@eventlinqs.com',

    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: `AIza${rep('G', 35)}`,
    GOOGLE_MAPS_API_KEY: `AIza${rep('g', 35)}`,
    // Required since the AdvancedMarkerElement migration: a map built without
    // a Map ID renders no advanced markers at all.
    NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: '8a97afecec3a7c6d7a3d4e35',

    UPSTASH_REDIS_REST_URL: 'https://apt-mudfish-12345.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: rep('u', 40),
    ADMIN_TOTP_ENC_KEY: rep('k', 44),

    NEXT_PUBLIC_VAPID_PUBLIC_KEY: rep('V', 87),
    VAPID_PRIVATE_KEY: rep('v', 43),
    VAPID_SUBJECT: 'mailto:hello@eventlinqs.com',

    ANTHROPIC_API_KEY: `sk-ant-${rep('A', 40)}`,
  }
}
