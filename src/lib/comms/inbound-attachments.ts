import 'server-only'
import { graphToken, GraphError, type GraphConfig } from '@/lib/outreach/graph'

/**
 * AN ORGANISER'S ATTACHED PHOTOGRAPHS, SEEN IN THE CRM (law 30, the CRM directive's section 4 A: "Do not require me to
 * download and upload photographs manually"). A reply the inbox run classes as 'photographs' is held for Lawal; the
 * Communications centre lists its attachments and shows each image from the outreach mailbox itself, read through Graph
 * with the app's Mail.Read on that one mailbox, so he looks at them without opening Outlook. Nothing is copied or
 * published here: placing a photograph on a night is a separate decision with its permission recorded.
 *
 * Graph, from Microsoft's own pages:
 *   find   GET /users/{mailbox}/messages?$filter=internetMessageId eq '<id>'&$select=id
 *          https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0
 *   list   GET /users/{mailbox}/messages/{id}/attachments?$select=id,name,contentType,size,isInline
 *          https://learn.microsoft.com/en-us/graph/api/message-list-attachments?view=graph-rest-1.0
 *   bytes  GET /users/{mailbox}/messages/{id}/attachments/{attachmentId}/$value
 *          https://learn.microsoft.com/en-us/graph/api/attachment-get?view=graph-rest-1.0
 */

type Fetch = (input: string, init?: RequestInit) => Promise<Response>
const GRAPH = 'https://graph.microsoft.com/v1.0'

export type InboundAttachment = { readonly id: string; readonly name: string; readonly contentType: string; readonly size: number }

/** Only a photograph is shown: an image that is not inline (a signature logo is inline), at most 25 MB. */
export function isShownPhoto(a: { contentType?: string; isInline?: boolean; size?: number }): boolean {
  return /^image\/(jpeg|png|webp|gif|heic|heif)$/i.test(a.contentType ?? '') && a.isInline !== true && (a.size ?? 0) > 0 && (a.size ?? 0) <= 25 * 1024 * 1024
}

/** The Graph id of a message in the mailbox by its internet message id, or null. */
export async function graphIdOf(cfg: GraphConfig, internetMessageId: string, fetchImpl: Fetch = fetch): Promise<string | null> {
  if (!/^<[^<>\s']+>$/.test(internetMessageId)) return null
  const token = await graphToken(cfg, fetchImpl)
  const params = new URLSearchParams([
    ['$filter', `internetMessageId eq '${internetMessageId}'`],
    ['$select', 'id'],
    ['$top', '1'],
  ])
  const res = await fetchImpl(`${GRAPH}/users/${encodeURIComponent(cfg.mailbox)}/messages?${params.toString()}`, { headers: { authorization: `Bearer ${token}` } })
  if (!res.ok) throw new GraphError('read', res.status, await res.text().catch(() => ''))
  const json = (await res.json()) as { value?: { id: string }[] }
  return json.value?.[0]?.id ?? null
}

export async function graphPhotosOf(cfg: GraphConfig, graphId: string, fetchImpl: Fetch = fetch): Promise<InboundAttachment[]> {
  const token = await graphToken(cfg, fetchImpl)
  const url = `${GRAPH}/users/${encodeURIComponent(cfg.mailbox)}/messages/${encodeURIComponent(graphId)}/attachments?$select=id,name,contentType,size,isInline`
  const res = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } })
  if (!res.ok) throw new GraphError('read', res.status, await res.text().catch(() => ''))
  const json = (await res.json()) as { value?: { id: string; name?: string; contentType?: string; size?: number; isInline?: boolean }[] }
  return (json.value ?? []).filter(isShownPhoto).map((a) => ({ id: a.id, name: a.name ?? 'image', contentType: (a.contentType ?? '').toLowerCase(), size: a.size ?? 0 }))
}

export async function graphPhotoBytes(cfg: GraphConfig, graphId: string, attachmentId: string, fetchImpl: Fetch = fetch): Promise<ArrayBuffer> {
  const token = await graphToken(cfg, fetchImpl)
  const url = `${GRAPH}/users/${encodeURIComponent(cfg.mailbox)}/messages/${encodeURIComponent(graphId)}/attachments/${encodeURIComponent(attachmentId)}/$value`
  const res = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` } })
  if (!res.ok) throw new GraphError('read', res.status, await res.text().catch(() => ''))
  return res.arrayBuffer()
}
