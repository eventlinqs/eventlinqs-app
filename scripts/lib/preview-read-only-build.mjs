/**
 * THE READ-ONLY PREVIEW BUILDS WITH NO SERVICE KEY (the CONTROLLER's ruling of 1 November 2026, 11:42 (2); Lawal 01:20,
 * 2 November: the preview of feat/w5-design-preview reads PRODUCTION by its URL and ANON key only, PREVIEW_READ_ONLY=1,
 * never a service key).
 *
 * WHY THIS EXISTS. On 2 November at 04:23 that preview's build stopped in prebuild, quoted from Vercel's log:
 * "pricing_rules could not be read (HTTP 401 read as service role)" then "[pricing-lock] BUILD BLOCKED." The branch's
 * Supabase URL had been pointed at production (01:39) while the preview scope still carries TEST's service-role key, so
 * every build-time reader that prefers the service key sent TEST's key to production and was refused. The runtime was
 * already right: the guide reads with the public anon client and the rights read is skipped under PREVIEW_READ_ONLY
 * (src/lib/events/featured-with-recorded-rights.ts). The build-time readers were not.
 *
 * WHAT IT DOES. Under PREVIEW_READ_ONLY=1, and only then, it removes both service-key variables from this process's
 * environment before any reader runs, so every reader (and every guard the runner spawns, whose env derives from this
 * process's) is in the shape the CI build already runs in: a URL and an anon key, no service key. A reader that can read
 * as anon does (the pricing lock's own documented anon read); one that needs the service key reports what that host
 * cannot judge, as it does on CI. Unset (production, every other preview), it changes nothing.
 */
export const SERVICE_KEY_NAMES = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY_PREVIEW']

/** @returns {string[]} the variable names withheld (empty when the switch is off or none was set) */
export function withholdServiceKeyOnReadOnlyPreview(env = process.env) {
  if (env.PREVIEW_READ_ONLY !== '1') return []
  const withheld = SERVICE_KEY_NAMES.filter((n) => typeof env[n] === 'string' && env[n] !== '')
  for (const n of SERVICE_KEY_NAMES) delete env[n]
  return withheld
}

export function announceWithheld(tag, withheld) {
  if (withheld.length) {
    console.log(`[${tag}] PREVIEW_READ_ONLY=1: ${withheld.join(' and ')} withheld from this read-only preview build; reading as anon`)
  }
}
