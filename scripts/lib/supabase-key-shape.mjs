/**
 * A VALUE SHAPED LIKE A SUPABASE KEY (14 November 2026). `vercel env pull` never decrypts a sensitive variable: for
 * production's SUPABASE_SERVICE_ROLE_KEY it writes an 11 character stand-in (read that morning by shape only, no value
 * printed: 'SUPABASE_SERVICE_ROLE_KEY: length 11, shape other'; 'NEXT_PUBLIC_SUPABASE_ANON_KEY: length 208, shape jwt').
 * scripts/ops/verify-production-schema.mjs took the service-role key first, sent the stand-in, and every probe of Lawal's
 * database step answered '401 Invalid API key'. A key is a three-part JWT or a publishable or secret key; anything else
 * is not one, whatever its name.
 *
 * @param {unknown} v
 * @returns {boolean}
 */
export function keyShaped(v) {
  return typeof v === 'string' && /^(?:eyJ[\w-]+\.[\w-]+\.[\w-]+|sb_(?:publishable|secret)_[\w-]{10,})$/.test(v.trim())
}

/**
 * The key a read-only probe uses: the public anon key first (a table the anon role may not read still answers
 * 'permission denied', which proves it exists), else a service-role key that is really one (a --env-file run on TEST).
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string | null}
 */
export function probeKey(env) {
  const found = [env.NEXT_PUBLIC_SUPABASE_ANON_KEY, env.SUPABASE_SERVICE_ROLE_KEY].find(keyShaped)
  return found ? found.trim() : null
}
