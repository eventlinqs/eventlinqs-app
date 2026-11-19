import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { createAdminClient } from '@/lib/supabase/admin'
import { graphConfigFromEnv } from '@/lib/outreach/graph'
import { graphIdOf, graphPhotoBytes, graphPhotosOf } from '@/lib/comms/inbound-attachments'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * ONE PHOTOGRAPH AN ORGANISER ATTACHED, SHOWN TO LAWAL IN THE COMMUNICATIONS CENTRE (law 30, section 4 A). Staff only
 * (admin.network.manage). It answers only an attachment of the message the named reply came in, and only an image that
 * is no inline logo (src/lib/comms/inbound-attachments.ts isShownPhoto), read from the outreach mailbox at the moment
 * of asking and never cached or stored: private to the admin, gone from his browser when he leaves.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ replyId: string; attachmentId: string }> }): Promise<NextResponse> {
  const session = await getAdminSession()
  if (!session) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  if (!can(session, 'admin.network.manage')) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { replyId, attachmentId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(replyId) || attachmentId.length < 8 || attachmentId.length > 1024) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const db = createAdminClient()
  const [reply, sender] = await Promise.all([
    db.from('outreach_replies').select('source_message_id').eq('id', replyId).maybeSingle(),
    db.from('outreach_sender').select('from_address').eq('id', true).single(),
  ])
  if (reply.error || sender.error) return NextResponse.json({ error: 'the reply or the mailbox could not be read' }, { status: 503 })
  const theirs = reply.data?.source_message_id as string | null | undefined
  const cfg = sender.data ? graphConfigFromEnv(sender.data.from_address as string) : null
  if (!theirs || !cfg) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  try {
    const graphId = await graphIdOf(cfg, theirs)
    if (!graphId) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    const photo = (await graphPhotosOf(cfg, graphId)).find((a) => a.id === attachmentId)
    if (!photo) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    const bytes = await graphPhotoBytes(cfg, graphId, attachmentId)
    return new NextResponse(bytes, {
      status: 200,
      headers: { 'content-type': photo.contentType, 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex', 'content-disposition': `inline; filename="${photo.name.replace(/["\\\r\n]/g, '')}"` },
    })
  } catch {
    return NextResponse.json({ error: 'the photograph could not be read from the mailbox' }, { status: 502 })
  }
}
