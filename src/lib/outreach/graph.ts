/**
 * MICROSOFT GRAPH FOR THE OUTREACH MAILBOX, hello@eventlinqs.com (window 6, 28 October 2026).
 *
 * Three calls, each from Microsoft's own page, read 28 October 2026:
 *
 *   token   POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token, form encoded client_id, client_secret,
 *           scope https://graph.microsoft.com/.default, grant_type client_credentials; the answer carries access_token
 *           and expires_in in seconds.
 *           https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-client-creds-grant-flow
 *   send    POST /users/{mailbox}/sendMail with Content-Type text/plain and the base64 MIME as the body; 202 Accepted
 *           means accepted, not delivered. Application permission Mail.Send.
 *           https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0
 *   read    GET /users/{mailbox}/mailFolders/inbox/messages; $top from 1 to 1000; the next page is @odata.nextLink; the
 *           header Prefer: outlook.body-content-type="text" returns text bodies. Application permission Mail.Read (the
 *           least privileged that returns bodies is Mail.ReadBasic.All, which omits them, so Mail.Read).
 *           https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0
 *
 * The application is limited to the one mailbox by an Exchange application access policy, Lawal's GO-LIVE step with
 * the consent. The network is injected (fetchImpl) so every test runs without Microsoft. A secret is never logged.
 */

export type GraphConfig = { tenantId: string; clientId: string; clientSecret: string; mailbox: string }
type Fetch = (input: string, init?: RequestInit) => Promise<Response>

const GRAPH = 'https://graph.microsoft.com/v1.0'

/** The Graph settings from the environment, or null while Lawal's consent has not been given. */
export function graphConfigFromEnv(mailbox: string, env: Record<string, string | undefined> = process.env): GraphConfig | null {
  const tenantId = env.OUTREACH_GRAPH_TENANT_ID
  const clientId = env.OUTREACH_GRAPH_CLIENT_ID
  const clientSecret = env.OUTREACH_GRAPH_CLIENT_SECRET
  if (!tenantId || !clientId || !clientSecret) return null
  return { tenantId, clientId, clientSecret, mailbox }
}

export class GraphError extends Error {
  constructor(
    readonly step: 'token' | 'send' | 'read',
    readonly status: number,
    detail: string,
  ) {
    super(`Graph ${step} answered ${status}: ${detail.slice(0, 300)}`)
    this.name = 'GraphError'
  }
}

let cached: { key: string; token: string; until: number } | null = null

/** A bearer token, reused until a minute before it expires. */
export async function graphToken(cfg: GraphConfig, fetchImpl: Fetch = fetch, now = Date.now()): Promise<string> {
  const key = `${cfg.tenantId}/${cfg.clientId}`
  if (cached && cached.key === key && cached.until > now) return cached.token
  const res = await fetchImpl(`https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }).toString(),
  })
  const text = await res.text()
  if (!res.ok) {
    // The error body names the cause (an AADSTS code) and never echoes the secret.
    throw new GraphError('token', res.status, text)
  }
  const json = JSON.parse(text) as { access_token?: string; expires_in?: number }
  if (!json.access_token) throw new GraphError('token', res.status, 'no access_token in the answer')
  cached = { key, token: json.access_token, until: now + Math.max(0, (json.expires_in ?? 0) - 60) * 1000 }
  return json.access_token
}

/** For tests: forget the cached token. */
export function forgetGraphToken(): void {
  cached = null
}

/** Send one message given as base64 MIME. Resolves on 202 Accepted; anything else throws with Graph's answer. */
export async function graphSendMime(cfg: GraphConfig, base64Mime: string, fetchImpl: Fetch = fetch): Promise<void> {
  const token = await graphToken(cfg, fetchImpl)
  const res = await fetchImpl(`${GRAPH}/users/${encodeURIComponent(cfg.mailbox)}/sendMail`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'text/plain' },
    body: base64Mime,
  })
  if (res.status !== 202) throw new GraphError('send', res.status, await res.text())
}

export type InboundMessage = {
  graphId: string
  internetMessageId: string
  subject: string
  fromAddress: string
  fromName: string
  receivedAt: string
  text: string
  /** Header name, lower case, to its value: in-reply-to, references, auto-submitted and the like. */
  headers: Record<string, string>
}

type GraphMessage = {
  id: string
  internetMessageId?: string
  subject?: string
  receivedDateTime: string
  from?: { emailAddress?: { address?: string; name?: string } }
  body?: { content?: string }
  internetMessageHeaders?: { name: string; value: string }[]
}

/** Inbox messages received at or after `sinceIso`, oldest first, at most `maxPages` pages of 100. */
export async function graphReadInbox(cfg: GraphConfig, sinceIso: string, fetchImpl: Fetch = fetch, maxPages = 5): Promise<InboundMessage[]> {
  const token = await graphToken(cfg, fetchImpl)
  const params = new URLSearchParams({
    $filter: `receivedDateTime ge ${sinceIso}`,
    $orderby: 'receivedDateTime asc',
    $top: '100',
    $select: 'id,internetMessageId,subject,from,receivedDateTime,body,internetMessageHeaders',
  })
  let url: string | null = `${GRAPH}/users/${encodeURIComponent(cfg.mailbox)}/mailFolders/inbox/messages?${params.toString()}`
  const out: InboundMessage[] = []
  for (let page = 0; url && page < maxPages; page++) {
    const res: Response = await fetchImpl(url, { headers: { authorization: `Bearer ${token}`, prefer: 'outlook.body-content-type="text"' } })
    if (!res.ok) throw new GraphError('read', res.status, await res.text())
    const json = (await res.json()) as { value: GraphMessage[]; '@odata.nextLink'?: string }
    for (const m of json.value) {
      const headers: Record<string, string> = {}
      for (const h of m.internetMessageHeaders ?? []) headers[h.name.toLowerCase()] = h.value
      out.push({
        graphId: m.id,
        internetMessageId: m.internetMessageId ?? '',
        subject: m.subject ?? '',
        fromAddress: (m.from?.emailAddress?.address ?? '').toLowerCase(),
        fromName: m.from?.emailAddress?.name ?? '',
        receivedAt: m.receivedDateTime,
        text: m.body?.content ?? '',
        headers,
      })
    }
    url = json['@odata.nextLink'] ?? null
  }
  return out
}
