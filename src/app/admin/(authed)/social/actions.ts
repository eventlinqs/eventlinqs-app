'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { approveDraft, planWeek, recordPosting, writeDraft } from '@/lib/social/store'

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
  return session
}

export async function planWeekAction(): Promise<void> {
  const session = await staff()
  const done = await planWeek(createAdminClient(), { plannedBy: session.userId, now: new Date() })
  await recordAuditEvent({ action: 'admin.social.plan', session, metadata: { planned: done.planned, held: done.held.length } })
  revalidatePath('/admin/social')
  back(
    done.planned === 0 && done.held.length === 0
      ? 'Every event this week already has its posts.'
      : `${done.planned} post${done.planned === 1 ? '' : 's'} planned.${done.held.length === 0 ? '' : ` Held: ${done.held.map((h) => h.reason).join(' ')}`}`,
  )
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
