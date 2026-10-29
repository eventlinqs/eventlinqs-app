'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { actionRateLimit } from '@/lib/rate-limit/action'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  addAsset,
  approveDraft,
  approvePieceChecked,
  decideAsset,
  editPiece,
  excludeNight,
  planCampaignWeek,
  planWeek,
  recordPiecePosting,
  recordPosting,
  regeneratePiece,
  rejectPiece,
  replaceAsset,
  withdrawAsset,
  writeDraft,
} from '@/lib/social/store'
import { fetchImageBytes } from '@/lib/media/fetch-image'
import { captureException } from '@/lib/observability/sentry'

/**
 * THE PRESSES ON /admin/social (item 11, the social engine; docs/SOCIAL-ENGINE.md): plan the week, change a post's
 * words, approve the newest words, and record the post once it has gone. Every rule is the database's too
 * (20261027233001); a refusal comes back in its own words. Nothing here posts to any network: the post goes by hand
 * until Meta's review allows publishing by its API, and is recorded with its address.
 */

const back = (said: string): never => redirect(`/admin/social?said=${encodeURIComponent(said)}`)

async function staff() {
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) back('Your role cannot plan or approve posts.')
  /* The release checklist F4: every press is limited by the admin's own id (policies.ts admin-social-press). */
  const limited = await actionRateLimit('admin-social-press', session.userId)
  if (!limited.ok) back(`Too many presses in a few minutes. Try again in ${Math.ceil(limited.retryAfterSeconds / 60)} minute${limited.retryAfterSeconds > 60 ? 's' : ''}.`)
  return session
}

export async function planWeekAction(): Promise<void> {
  const session = await staff()
  const limited = await actionRateLimit('admin-social-plan', session.userId)
  if (!limited.ok) back(`The week was planned a few times just now. Plan again in ${Math.ceil(limited.retryAfterSeconds / 60)} minute${limited.retryAfterSeconds > 60 ? 's' : ''}.`)
  const now = new Date()
  const done = await planWeek(createAdminClient(), { plannedBy: session.userId, now })
  /* The week's campaign (the release checklist, A1 and F7): found again on a second press, never doubled; nothing is
     approved or published here (F9). */
  const campaign = await planCampaignWeek(createAdminClient(), { plannedBy: session.userId, now })
  await recordAuditEvent({ action: 'admin.social.plan', session, metadata: { planned: done.planned, held: done.held.length, pieces: campaign.created, piecesExisting: campaign.existing, imageRequests: campaign.requests } })
  revalidatePath('/admin/social')
  const posts =
    done.planned === 0 && done.held.length === 0
      ? 'Every event this week already has its posts.'
      : `${done.planned} post${done.planned === 1 ? '' : 's'} planned.${done.held.length === 0 ? '' : ` Held: ${done.held.map((h) => h.reason).join(' ')}`}`
  const pieces =
    campaign.created === 0
      ? ` This week's campaign is planned already (${campaign.kept} pieces).`
      : ` This week's campaign: ${campaign.created} piece${campaign.created === 1 ? '' : 's'}, ${campaign.requests} image request${campaign.requests === 1 ? '' : 's'} drafted.`
  back(`${posts}${pieces}${campaign.held.length === 0 ? '' : ` Held: ${campaign.held.join(' ')}`}`)
}

const WordsSchema = z.object({ post: z.string().uuid(), caption: z.string().min(1).max(2200) })

export async function writeWordsAction(formData: FormData): Promise<void> {
  const session = await staff()
  const parsed = WordsSchema.safeParse({ post: formData.get('post'), caption: formData.get('caption') })
  if (!parsed.success) back('Those words could not be read.')
  const { post, caption } = parsed.data as z.infer<typeof WordsSchema>
  const done = await writeDraft(createAdminClient(), { postId: post, caption, by: session.userId, now: new Date() })
  if (done.state === 'refused') back(done.reason)
  await recordAuditEvent({ action: 'admin.social.words', targetType: 'social_post', targetId: post, session })
  revalidatePath('/admin/social')
  back('Your words are kept as the newest version. Approve them when they are right.')
}

const ApproveSchema = z.object({ draft: z.string().uuid() })

export async function approveAction(formData: FormData): Promise<void> {
  const session = await staff()
  const parsed = ApproveSchema.safeParse({ draft: formData.get('draft') })
  if (!parsed.success) back('That post could not be read.')
  const { draft } = parsed.data as z.infer<typeof ApproveSchema>
  const done = await approveDraft(createAdminClient(), { draftId: draft, by: session.userId, now: new Date() })
  if (done.state === 'refused') back(done.reason)
  await recordAuditEvent({ action: 'admin.social.approve', targetType: 'social_draft', targetId: draft, session })
  revalidatePath('/admin/social')
  back('Approved. Post it within the day, then record its address here.')
}

const PostedSchema = z.object({ post: z.string().uuid(), url: z.string().min(1).max(500) })

export async function recordPostedAction(formData: FormData): Promise<void> {
  const session = await staff()
  const parsed = PostedSchema.safeParse({ post: formData.get('post'), url: formData.get('url') })
  if (!parsed.success) back('Paste the post’s address from Instagram or Facebook.')
  const { post, url } = parsed.data as z.infer<typeof PostedSchema>
  const now = new Date()
  const done = await recordPosting(createAdminClient(), { postId: post, postUrl: url, postedAt: now, by: session.userId, now })
  if (done.state === 'refused') back(done.reason)
  await recordAuditEvent({ action: 'admin.social.posted', targetType: 'social_post', targetId: post, session })
  revalidatePath('/admin/social')
  back('Recorded. What it brings is counted from now.')
}

/* ------------------------------------------------------------------ the weekly campaign (the release checklist, B, C, F7 to F9, J, K) */

/** The deployment these presses run on, so a TEST plan is checked against TEST's own pages (J15). */
async function siteOrigin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'www.eventlinqs.com.au'
  const proto = h.get('x-forwarded-proto') ?? (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? 'http' : 'https')
  return `${proto}://${host}`
}

const PieceSchema = z.object({ piece: z.string().uuid() })
const ReasonSchema = z.object({ piece: z.string().uuid(), reason: z.string().trim().min(3).max(500) })

export async function approvePieceAction(formData: FormData): Promise<void> {
  const session = await staff()
  const parsed = PieceSchema.safeParse({ piece: formData.get('piece') })
  if (!parsed.success) back('That piece could not be read.')
  const { piece } = parsed.data as z.infer<typeof PieceSchema>
  const done = await approvePieceChecked(createAdminClient(), { pieceId: piece, by: session.userId, now: new Date(), siteOrigin: await siteOrigin() })
  if (done.state === 'refused') back(done.reason)
  await recordAuditEvent({ action: 'admin.social.piece.approve', targetType: 'social_piece', targetId: piece, session })
  revalidatePath('/admin/social')
  back('Approved. Post it, then record where it went.')
}

export async function rejectPieceAction(formData: FormData): Promise<void> {
  const session = await staff()
  const parsed = ReasonSchema.safeParse({ piece: formData.get('piece'), reason: formData.get('reason') })
  if (!parsed.success) back('Say in a few words why it is rejected.')
  const { piece, reason } = parsed.data as z.infer<typeof ReasonSchema>
  const done = await rejectPiece(createAdminClient(), { pieceId: piece, reason, by: session.userId, now: new Date() })
  if (done.state === 'refused') back(done.reason)
  await recordAuditEvent({ action: 'admin.social.piece.reject', targetType: 'social_piece', targetId: piece, session, metadata: { reason } })
  revalidatePath('/admin/social')
  back('Rejected, with your reason kept. Edit or regenerate it to bring it back.')
}

const EditSchema = z.object({ piece: z.string().uuid(), platform: z.enum(['instagram', 'facebook']), caption: z.string().trim().min(1).max(2200) })

export async function editPieceAction(formData: FormData): Promise<void> {
  const session = await staff()
  const parsed = EditSchema.safeParse({ piece: formData.get('piece'), platform: formData.get('platform'), caption: formData.get('caption') })
  if (!parsed.success) back('Those words could not be read.')
  const { piece, platform, caption } = parsed.data as z.infer<typeof EditSchema>
  const done = await editPiece(createAdminClient(), { pieceId: piece, platform, caption, by: session.userId, now: new Date() })
  if (done.state === 'refused') back(done.reason)
  await recordAuditEvent({ action: 'admin.social.piece.edit', targetType: 'social_piece', targetId: piece, session, metadata: { platform } })
  revalidatePath('/admin/social')
  back('Your words are kept as a new version. Check and approve it when it is right.')
}

export async function regeneratePieceAction(formData: FormData): Promise<void> {
  const session = await staff()
  const parsed = ReasonSchema.safeParse({ piece: formData.get('piece'), reason: formData.get('reason') })
  if (!parsed.success) back('Say in a few words why it is regenerated.')
  const { piece, reason } = parsed.data as z.infer<typeof ReasonSchema>
  const done = await regeneratePiece(createAdminClient(), { pieceId: piece, reason, by: session.userId, now: new Date() })
  if (done.state === 'refused') back(done.reason)
  await recordAuditEvent({ action: 'admin.social.piece.regenerate', targetType: 'social_piece', targetId: piece, session, metadata: { reason } })
  revalidatePath('/admin/social')
  back('Regenerated from this week’s nights as a new version; the earlier ones are kept.')
}

const ExcludeSchema = z.object({ event: z.string().uuid(), reason: z.string().trim().min(3).max(300) })

export async function excludeNightAction(formData: FormData): Promise<void> {
  const session = await staff()
  const parsed = ExcludeSchema.safeParse({ event: formData.get('event'), reason: formData.get('reason') })
  if (!parsed.success) back('Say in a few words why that night is left out.')
  const { event, reason } = parsed.data as z.infer<typeof ExcludeSchema>
  const done = await excludeNight(createAdminClient(), { eventId: event, reason, by: session.userId, now: new Date() })
  if (done.state === 'refused') back(done.reason)
  await recordAuditEvent({ action: 'admin.social.night.exclude', targetType: 'event', targetId: event, session, metadata: { reason } })
  revalidatePath('/admin/social')
  back('Left out of this week. Regenerate a piece to take it out of its set.')
}

const PieceGoneSchema = z.object({ piece: z.string().uuid(), url: z.string().min(1).max(500) })

export async function recordPieceAction(formData: FormData): Promise<void> {
  const session = await staff()
  const parsed = PieceGoneSchema.safeParse({ piece: formData.get('piece'), url: formData.get('url') })
  if (!parsed.success) back('Paste the post’s address from Instagram or Facebook, or press I sent it for a partner kit.')
  const { piece, url } = parsed.data as z.infer<typeof PieceGoneSchema>
  const done = await recordPiecePosting(createAdminClient(), { pieceId: piece, postUrl: url.trim(), by: session.userId, now: new Date() })
  if (done.state === 'refused') back(done.reason)
  await recordAuditEvent({ action: 'admin.social.piece.posted', targetType: 'social_piece', targetId: piece, session })
  revalidatePath('/admin/social')
  back('Recorded. What it brings is counted from now.')
}

const AssetSchema = z.object({
  assetState: z.enum(['organiser_authorised', 'separately_licensed', 'native_share']),
  assetType: z.enum(['photo', 'artwork', 'video', 'post']),
  assetUrl: z.string().url().max(800),
  sourceUrl: z.string().min(8).max(800),
  rightsHolder: z.string().min(2).max(200),
  permissionEvidence: z.string().max(4000).optional(),
  evidenceFile: z.string().max(800).optional(),
  eventSlug: z.string().max(200).optional(),
  attributionText: z.string().min(2).max(200),
  scope: z.enum(['social', 'site', 'both']),
  archival: z.enum(['yes']).optional(),
  expiresAt: z.string().max(40).optional(),
  restrictions: z.string().max(1000).optional(),
  originalFile: z.string().min(2).max(500).optional(),
  receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  permittedUses: z.string().min(5).max(1000).optional(),
  focalX: z.coerce.number().min(0).max(100).optional(),
  focalY: z.coerce.number().min(0).max(100).optional(),
  leadRank: z.coerce.number().int().min(1).max(99).optional(),
})

/** A photograph's own pixel size, read from the stored file so nobody types it (Law 10); null when it cannot be read. */
async function pixelSize(url: string): Promise<{ width: number; height: number } | null> {
  const fetched = await fetchImageBytes(url)
  if (!fetched) return null
  try {
    const { default: sharp } = await import('sharp')
    const meta = await sharp(Buffer.from(fetched.bytes)).metadata()
    const width = meta.autoOrient?.width ?? meta.width
    const height = meta.autoOrient?.height ?? meta.height
    return width && height ? { width, height } : null
  } catch (error) {
    captureException(error, { where: 'admin/social/actions:pixelSize' })
    return null
  }
}

export async function addAssetAction(formData: FormData): Promise<void> {
  const session = await staff()
  const parsed = AssetSchema.safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => v !== '')))
  if (!parsed.success) back('The asset needs its state, type, address, source, rights holder, credit and scope.')
  const a = parsed.data as z.infer<typeof AssetSchema>
  if ((a.focalX === undefined) !== (a.focalY === undefined)) back('Give the subject both across and down, or neither.')
  const size = a.assetType === 'photo' || a.assetType === 'artwork' ? await pixelSize(a.assetUrl) : null
  const done = await addAsset(createAdminClient(), {
    assetState: a.assetState,
    assetType: a.assetType,
    assetUrl: a.assetUrl,
    sourceUrl: a.sourceUrl,
    rightsHolder: a.rightsHolder,
    permissionEvidence: a.permissionEvidence ?? null,
    evidenceFile: a.evidenceFile ?? null,
    eventSlug: a.eventSlug ?? null,
    attributionText: a.attributionText,
    scope: a.scope,
    archival: a.archival === 'yes',
    expiresAt: a.expiresAt ? new Date(a.expiresAt).toISOString() : null,
    restrictions: a.restrictions ?? null,
    originalFile: a.originalFile ?? null,
    receivedOn: a.receivedOn ?? null,
    permittedUses: a.permittedUses ?? null,
    focal: a.focalX !== undefined && a.focalY !== undefined ? { x: a.focalX / 100, y: a.focalY / 100 } : null,
    sourceWidth: size?.width ?? null,
    sourceHeight: size?.height ?? null,
    leadRank: a.leadRank ?? null,
    by: session.userId,
  })
  if (done.state === 'refused') back(done.reason)
  await recordAuditEvent({ action: 'admin.social.asset.add', session, metadata: { state: a.assetState } })
  revalidatePath('/admin/social')
  back('Kept as pending. It is used only once it is approved.')
}

const DecideSchema = z.object({ asset: z.string().uuid(), decision: z.enum(['approved', 'refused']) })

const WithdrawSchema = z.object({
  asset: z.string().uuid(),
  reason: z.string().min(3).max(500),
  replacement: z.string().uuid().optional(),
})

/**
 * The rights holder withdraws an image, or replaces it with another of the same night (part D). It is never used again,
 * and within the hour every piece that has not gone and carries it is drawn again in type (the image sweep).
 */
export async function withdrawAssetAction(formData: FormData): Promise<void> {
  const session = await staff()
  const parsed = WithdrawSchema.safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => v !== '')))
  if (!parsed.success) back('Say why it is withdrawn, in a few words.')
  const { asset, reason, replacement } = parsed.data as z.infer<typeof WithdrawSchema>
  const db = createAdminClient()
  const now = new Date()
  const done = replacement ? await replaceAsset(db, { id: asset, replacementId: replacement, reason, now }) : await withdrawAsset(db, { id: asset, reason, now })
  if (done.state === 'refused') back(done.reason)
  await recordAuditEvent({ action: replacement ? 'admin.social.asset.replaced' : 'admin.social.asset.withdrawn', targetType: 'social_asset', targetId: asset, session, metadata: { reason } })
  revalidatePath('/admin/social')
  back('Withdrawn. It is used for nothing from now, and any piece not yet gone that carries it is drawn again in type within the hour.')
}

export async function decideAssetAction(formData: FormData): Promise<void> {
  const session = await staff()
  const parsed = DecideSchema.safeParse({ asset: formData.get('asset'), decision: formData.get('decision') })
  if (!parsed.success) back('That asset could not be read.')
  const { asset, decision } = parsed.data as z.infer<typeof DecideSchema>
  const done = await decideAsset(createAdminClient(), { id: asset, decision, by: session.userId, now: new Date() })
  if (done.state === 'refused') back(done.reason)
  await recordAuditEvent({ action: `admin.social.asset.${decision}`, targetType: 'social_asset', targetId: asset, session })
  revalidatePath('/admin/social')
  back(decision === 'approved' ? 'Approved for its scope until it expires.' : 'Refused. It is used for nothing.')
}
