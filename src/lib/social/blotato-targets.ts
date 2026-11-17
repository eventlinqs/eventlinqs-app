import { BLOTATO_BASE, blotatoConfigFrom } from './blotato-publisher'

/**
 * WHERE THE WEEK POSTS, READ ON PRODUCTION (the PM's 20:50 of 17 November 2026, item 3, route (b): "an admin read on
 * production after the redeploy shows the Blotato accounts and the Facebook Pages"). /admin/social asks Blotato, with the
 * key this runtime holds, for its connected accounts and the Facebook account's Pages (help.blotato.com/api/start:
 * GET /v2/users/me/accounts and /v2/users/me/accounts/{accountId}/subaccounts, the key in the blotato-api-key header),
 * and names what the publisher (./blotato-publisher.ts) would post to by the publisher's own rule: the first account of
 * each platform, and exactly one Page. It reads only; it never prints the key or any field named like a credential.
 */
export type BlotatoTarget = { readonly platform: string; readonly id: string; readonly label: string; readonly fields: string }

export type BlotatoTargets =
  | { readonly state: 'no-key' }
  | { readonly state: 'failed'; readonly words: string }
  | {
      readonly state: 'read'
      readonly accounts: readonly BlotatoTarget[]
      readonly facebookPages: readonly BlotatoTarget[] | null
      readonly postsTo: { readonly facebook: string | null; readonly instagram: string | null }
      readonly refusal: string | null
    }

const CREDENTIAL = /token|secret|key|password|cookie|auth/i
const LABEL_FIELDS = ['name', 'fullname', 'fullName', 'displayName', 'username', 'handle'] as const

function plain(o: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(o)
    .filter(([k, v]) => (typeof v === 'string' || typeof v === 'number') && !CREDENTIAL.test(k))
    .map(([k, v]) => [k, String(v)])
}

function targetOf(o: Record<string, unknown>, platform: string): BlotatoTarget {
  const fields = plain(o)
  const id = String(o.id ?? '')
  const named = LABEL_FIELDS.map((f) => o[f]).find((v): v is string => typeof v === 'string' && v.trim() !== '')
  return { platform, id, label: named?.trim() ?? id, fields: fields.map(([k, v]) => `${k}=${v}`).join(', ') }
}

export async function readBlotatoTargets(
  env: Readonly<Record<string, string | undefined>>,
  fetchImpl: typeof fetch = fetch,
): Promise<BlotatoTargets> {
  const config = blotatoConfigFrom(env)
  if (!config) return { state: 'no-key' }
  const get = async (path: string): Promise<Array<Record<string, unknown>>> => {
    const res = await fetchImpl(`${BLOTATO_BASE}${path}`, { headers: { 'blotato-api-key': config.apiKey }, signal: AbortSignal.timeout(8_000) })
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const words = typeof body.message === 'string' ? body.message : typeof body.error === 'string' ? body.error : 'no reason given'
      throw new Error(`Blotato answered ${res.status} to ${path}: ${words}`)
    }
    return Array.isArray(body.items) ? (body.items as Array<Record<string, unknown>>) : []
  }
  try {
    const raw = await get('/users/me/accounts')
    const accounts = raw.map((a) => targetOf(a, String(a.platform ?? '?').toLowerCase()))
    const facebook = accounts.find((a) => a.platform === 'facebook') ?? null
    const instagram = accounts.find((a) => a.platform === 'instagram') ?? null
    const facebookPages = facebook ? (await get(`/users/me/accounts/${encodeURIComponent(facebook.id)}/subaccounts`)).map((p) => targetOf(p, 'facebook page')) : null
    const refusals: string[] = []
    if (!facebook) refusals.push('No Facebook account is connected.')
    else if (facebookPages && facebookPages.length !== 1) {
      refusals.push(`Blotato's Facebook account has ${facebookPages.length} Pages; exactly one, the EventLinqs Page, is expected.`)
    }
    if (!instagram) refusals.push('No Instagram account is connected.')
    const page = facebookPages && facebookPages.length === 1 ? facebookPages[0] : null
    return {
      state: 'read',
      accounts,
      facebookPages,
      postsTo: { facebook: page ? `${page.label} (Page ${page.id})` : null, instagram: instagram ? instagram.label : null },
      refusal: refusals.length > 0 ? refusals.join(' ') : null,
    }
  } catch (error) {
    return { state: 'failed', words: error instanceof Error ? error.message : String(error) }
  }
}
