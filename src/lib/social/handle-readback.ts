import { MetaRefusal, type GraphCall } from './meta-publisher'

/**
 * THE INSTAGRAM READ BACK (law 40 (c); the PM's 10:15 of 21 November 2026, ruling 8: "the Graph API read back is built
 * in AS ... No collaborator invite until read back"). A handle the organiser's own website links (written to the CRM with
 * that page as instagram_verified_source, 21 November 09:59) is verified only once Instagram itself shows the account.
 * Instagram's robots.txt forbids automated collection, so the read goes through Meta's Graph API with our own token:
 * GET /{ig-user-id}?fields=business_discovery.username(<handle>){id,username,website}, which "Returns data about another
 * Instagram Business or Creator IG User", needs instagram_basic, instagram_manage_insights and pages_read_engagement, and
 * returns nothing for age-gated accounts (developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/
 * ig-user/business_discovery, read 21 November 2026). A personal account is not described there, so a handle Instagram
 * does not return stays unverified, with Meta's own words as the reason; nothing is guessed.
 */

export type ReadBack =
  | { readonly handle: string; readonly found: true; readonly username: string; readonly website: string | null }
  | { readonly handle: string; readonly found: false; readonly reason: string }

const USERNAME = /^[a-z0-9._]{1,30}$/

export function normaliseHandle(handle: string): string {
  return handle.trim().replace(/^@/, '').toLowerCase()
}

export async function readBackHandle(call: GraphCall, igUserId: string, handle: string): Promise<ReadBack> {
  const h = normaliseHandle(handle)
  if (!USERNAME.test(h)) return { handle: h, found: false, reason: 'not an Instagram username' }
  try {
    const out = await call('GET', igUserId, { fields: `business_discovery.username(${h}){id,username,website}` })
    const bd = (out.business_discovery ?? null) as { username?: unknown; website?: unknown } | null
    const username = typeof bd?.username === 'string' ? bd.username.toLowerCase() : null
    if (!username) return { handle: h, found: false, reason: 'Instagram returned no account for it' }
    if (username !== h) return { handle: h, found: false, reason: `Instagram answered a different account (${username})` }
    return { handle: h, found: true, username, website: typeof bd?.website === 'string' ? bd.website : null }
  } catch (error) {
    return { handle: h, found: false, reason: error instanceof MetaRefusal ? error.message : 'the read failed' }
  }
}

/** Verified only when its own site's page is on record AND Instagram shows the same account (law 40 (c)). */
export function verifiedOnReadBack(r: ReadBack, sourceOnRecord: string | null | undefined): boolean {
  return r.found && typeof sourceOnRecord === 'string' && sourceOnRecord.startsWith('https://')
}
