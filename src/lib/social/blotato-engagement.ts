/**
 * WHAT PEOPLE SAID BACK, READ ONLY (the PM's 12:28 of 18 November 2026: "for 20 minutes after each feed post, read its
 * comments and DMs through the platform read, and write each one to the package for an answer in Lawal's voice ...
 * no automated replies"). Blotato reads Instagram and Facebook Page comments and direct messages
 * (https://help.blotato.com/rest-api-reference/comments.md, https://help.blotato.com/rest-api-reference/messages.md):
 * GET /v2/comments takes since, limit (1 to 250) and cursor, and each comment carries isAuthor (true for our own);
 * GET /v2/messages takes limit and cursor, and each message carries direction (incoming or outgoing). Blotato keeps
 * both for 45 days and does not backfill comments. This NEVER posts: it calls GET only, and nothing here can reply.
 */
const BASE = 'https://backend.blotato.com/v2'
const PAGES = 4

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>

export type EngagementItem = {
  readonly kind: 'comment' | 'message'
  readonly platform: string
  readonly text: string
  readonly at: string
  readonly who: string | null
  /** The platform's own id of the post a comment is on (Blotato's platformPostId); null for a message. */
  readonly onPost: string | null
}

export type Engagement = { readonly items: readonly EngagementItem[]; readonly unread: readonly string[] }

async function pages(fetcher: Fetcher, apiKey: string, path: string, query: Record<string, string>): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  let cursor: string | null = null
  for (let i = 0; i < PAGES; i += 1) {
    const q = new URLSearchParams({ ...query, limit: '250', ...(cursor ? { cursor } : {}) })
    const res = await fetcher(`${BASE}${path}?${q}`, { method: 'GET', headers: { 'blotato-api-key': apiKey } })
    if (!res.ok) throw new Error(`Blotato answered ${res.status} to GET ${path}`)
    const json = (await res.json().catch(() => ({}))) as { items?: unknown; cursor?: unknown }
    if (Array.isArray(json.items)) out.push(...(json.items as Record<string, unknown>[]))
    cursor = typeof json.cursor === 'string' && json.cursor ? json.cursor : null
    if (!cursor) break
  }
  return out
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

/** Every comment and direct message other people sent since `since`, newest first; a failed read is named, never hidden. */
export async function readEngagement(apiKey: string, since: Date, fetcher: Fetcher = fetch): Promise<Engagement> {
  const items: EngagementItem[] = []
  const unread: string[] = []
  try {
    for (const c of await pages(fetcher, apiKey, '/comments', { since: since.toISOString() })) {
      if (c.isAuthor === true) continue
      const author = (c.author ?? {}) as { username?: unknown; name?: unknown }
      items.push({ kind: 'comment', platform: String(c.platform ?? ''), text: String(c.text ?? ''), at: String(c.createdAt ?? ''), who: str(author.username) ?? str(author.name), onPost: str(c.platformPostId) })
    }
  } catch (e) {
    unread.push(`comments: ${e instanceof Error ? e.message : String(e)}`)
  }
  try {
    for (const m of await pages(fetcher, apiKey, '/messages', {})) {
      if (m.direction !== 'incoming') continue
      const at = String(m.createdAt ?? '')
      if (!(Date.parse(at) >= since.getTime())) continue
      items.push({ kind: 'message', platform: String(m.platform ?? ''), text: String(m.text ?? ''), at, who: str(m.senderId), onPost: null })
    }
  } catch (e) {
    unread.push(`messages: ${e instanceof Error ? e.message : String(e)}`)
  }
  items.sort((a, b) => b.at.localeCompare(a.at))
  return { items, unread }
}
