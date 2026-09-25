import 'server-only'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { captureException } from '@/lib/observability/sentry'

/**
 * API1. ORGANISER SCOPED API KEYS: MINTING THEM, READING THEM BACK, AND
 * TURNING A BEARER TOKEN INTO THE ONE ORGANISATION IT MAY SEE.
 *
 * Scope v5 section 11.1 asks for organiser scoped API keys, revocable, hashed
 * at rest. All three of those words are decisions and each one is made here.
 *
 * HASHED AT REST, WITH SHA256 AND NOT A PASSWORD HASH. The token is 32 bytes
 * from `randomBytes`, which is 256 bits of entropy the platform chose. A work
 * factor exists to make a DICTIONARY expensive, and there is no dictionary for
 * a value nobody picked; what it would buy instead is a per request cost on the
 * hot path of an API rated at a thousand calls a minute. So: one sha256, one
 * indexed lookup, nothing cached.
 *
 * NOTHING CACHED IS THE REVOCATION GUARANTEE. "A revoked key is refused within
 * one request" is only true if the next request re-reads the row, so
 * `authenticateApiKey` reads the database every time and there is deliberately
 * no memo, no module-level map and no short lived cache in this file. The cost
 * is one indexed equality on a unique index.
 *
 * THE TOKEN IS SHOWN ONCE. `mintApiKey` is the only function that has ever held
 * the plain token, it returns it to its caller once, and nothing here writes it
 * anywhere. What the database keeps is the digest and a short prefix for the
 * screen to display.
 */

/** Four characters of scheme, so a leaked token is recognisable in a log. */
const TOKEN_SCHEME = 'elq_'
/** How much of the token is kept in the clear, for the organiser to tell keys apart. */
const PREFIX_BODY_LENGTH = 8
/** Bytes of entropy behind each token. */
const TOKEN_ENTROPY_BYTES = 32

export type OrganiserApiKeyRecord = {
  id: string
  name: string
  tokenPrefix: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

/** What the caller of a v1 route turned out to be, once the key checked out. */
export type ApiKeyScope = {
  keyId: string
  organisationId: string
}

export type AuthenticateResult =
  | { ok: true; scope: ApiKeyScope }
  | { ok: false; reason: 'missing_key' | 'malformed_key' | 'unknown_key' | 'revoked_key' }

export function hashApiToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/**
 * The opening of a token, in the clear.
 *
 * Deliberately derived from the token rather than stored separately, so the
 * prefix on screen can never drift from the key it labels.
 */
export function tokenPrefix(token: string): string {
  return token.slice(0, TOKEN_SCHEME.length + PREFIX_BODY_LENGTH)
}

/**
 * A new token. Base36 over random bytes, so the whole token is lowercase
 * alphanumerics and survives being copied out of a terminal, pasted into a
 * YAML file, or typed into an integration's settings box by hand.
 */
export function generateApiToken(): string {
  let body = ''
  while (body.length < 40) {
    body += BigInt('0x' + randomBytes(TOKEN_ENTROPY_BYTES).toString('hex')).toString(36)
  }
  return TOKEN_SCHEME + body.slice(0, 40)
}

/** The shape a token must have before a single byte of it reaches the database. */
export function looksLikeApiToken(token: string): boolean {
  return new RegExp(`^${TOKEN_SCHEME}[a-z0-9]{40}$`).test(token)
}

/**
 * `Authorization: Bearer <token>`, and nothing else.
 *
 * A query string is not accepted on purpose: query strings are written into
 * access logs, browser history and referrer headers, and a credential that
 * lands in any of those has already leaked. Vercel's own logs do not record
 * query strings, which is exactly the kind of platform detail that changes.
 */
export function bearerToken(headerValue: string | null): string | null {
  if (!headerValue) return null
  const match = /^Bearer\s+(\S+)$/i.exec(headerValue.trim())
  return match ? match[1] : null
}

/**
 * Turn a bearer token into the one organisation it may read.
 *
 * Reads the database on every call. See the note at the top of this file: the
 * absence of a cache IS the "refused within one request" guarantee.
 */
export async function authenticateApiKey(headerValue: string | null): Promise<AuthenticateResult> {
  const token = bearerToken(headerValue)
  if (!token) return { ok: false, reason: 'missing_key' }
  if (!looksLikeApiToken(token)) return { ok: false, reason: 'malformed_key' }

  const digest = hashApiToken(token)
  const { data, error } = await createAdminClient()
    .from('organiser_api_keys')
    .select('id, organisation_id, token_hash, revoked_at')
    .eq('token_hash', digest)
    .maybeSingle()

  if (error || !data) return { ok: false, reason: 'unknown_key' }

  /*
   * The digest is compared a second time in constant time.
   *
   * The equality that found the row was the DATABASE's, on an indexed unique
   * column, and an index lookup's timing is a function of the tree rather than
   * of how many leading characters two values share. This second comparison
   * costs nothing measurable and means the decision this function returns was
   * made here, on bytes this process holds, rather than delegated.
   */
  const stored = Buffer.from(String(data.token_hash), 'utf8')
  const offered = Buffer.from(digest, 'utf8')
  if (stored.length !== offered.length || !timingSafeEqual(stored, offered)) {
    return { ok: false, reason: 'unknown_key' }
  }

  if (data.revoked_at) return { ok: false, reason: 'revoked_key' }

  return { ok: true, scope: { keyId: data.id, organisationId: data.organisation_id } }
}

/**
 * Note that a key was used.
 *
 * Best effort and never awaited by the request it describes: an organiser
 * should be able to see that an integration has gone quiet, and no API call
 * should ever fail because that column could not be written.
 */
export async function noteApiKeyUsed(keyId: string): Promise<void> {
  try {
    await createAdminClient()
      .from('organiser_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyId)
  } catch (error) {
    /*
     * BEST EFFORT IS NOT THE SAME AS SILENT. The request this describes has
     * already been answered and must not be failed by this line, so the error
     * is not rethrown; but a discarded error is a defect nobody ever learns
     * about, so it is reported. It can only fire when the database is
     * unreachable AFTER the authentication read on the same request succeeded,
     * which is a narrow and genuinely interesting window rather than noise.
     */
    captureException(error, { where: 'lib/api/v1/keys:noteApiKeyUsed', keyId })
  }
}

/**
 * Mint a key for one organisation. Returns the plain token exactly once.
 *
 * Ownership is the CALLER's to establish, before this is reached: every call
 * site sits behind `resolveOrganisationScope`, which verifies that the signed
 * in person owns the organisation being named.
 */
export async function mintApiKey(input: {
  organisationId: string
  name: string
  createdBy: string
}): Promise<{ ok: true; token: string; record: OrganiserApiKeyRecord } | { ok: false; reason: string }> {
  const name = input.name.trim()
  if (name.length === 0 || name.length > 80) return { ok: false, reason: 'name_length' }

  const token = generateApiToken()
  const { data, error } = await createAdminClient()
    .from('organiser_api_keys')
    .insert({
      organisation_id: input.organisationId,
      name,
      token_prefix: tokenPrefix(token),
      token_hash: hashApiToken(token),
      created_by: input.createdBy,
    })
    .select('id, name, token_prefix, created_at, last_used_at, revoked_at')
    .single()

  if (error || !data) return { ok: false, reason: error?.message ?? 'insert_failed' }
  return { ok: true, token, record: toRecord(data) }
}

/** Every key this organisation has, revoked ones included, newest first. */
export async function listApiKeys(organisationId: string): Promise<OrganiserApiKeyRecord[]> {
  const { data } = await createAdminClient()
    .from('organiser_api_keys')
    .select('id, name, token_prefix, created_at, last_used_at, revoked_at')
    .eq('organisation_id', organisationId)
    .order('created_at', { ascending: false })
  return (data ?? []).map(toRecord)
}

/**
 * Revoke one key.
 *
 * Scoped by organisation as well as by id, so an id belonging to somebody else
 * changes nothing rather than changing their key: the same rule the read path
 * follows, applied to the one write this feature has.
 */
export async function revokeApiKey(input: {
  organisationId: string
  keyId: string
  revokedBy: string
}): Promise<{ ok: boolean }> {
  const { data } = await createAdminClient()
    .from('organiser_api_keys')
    .update({ revoked_at: new Date().toISOString(), revoked_by: input.revokedBy })
    .eq('id', input.keyId)
    .eq('organisation_id', input.organisationId)
    .is('revoked_at', null)
    .select('id')
  return { ok: (data ?? []).length === 1 }
}

type KeyRow = {
  id: string
  name: string
  token_prefix: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
}

function toRecord(row: KeyRow): OrganiserApiKeyRecord {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.token_prefix,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  }
}
