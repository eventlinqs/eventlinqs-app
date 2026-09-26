'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/send'
import { getSiteUrl } from '@/lib/site-url'
import { createFoundingInvite, isFoundingCity } from '@/lib/founding/invites'
import {
  FOUNDING_OFFER_SCOPE,
  FOUNDING_REFERRAL_MONTHS,
  FOUNDING_TERMS,
  extendWaiver,
  initialWaiverUntil,
  isWaiverActive,
} from '@/lib/payments/founding-waiver'
import { getCity } from '@/lib/cities/data'

/**
 * The waitlist-to-invite bridge. From the demand-signal view the founder marks
 * a waitlist entry as invited: this mints a founder-issued
 * founding invite for that person and emails them the warm link.
 *
 * Spam Act posture: the recipient already consented on the waitlist to hear
 * "about Founding Organiser invitations" (recorded in their consent_text), so
 * this invitation email is within the consent they gave, and it carries the
 * one-click leave link. A withdrawn (unsubscribed) entry is never emailed.
 */
export async function inviteWaitlistEntry(signupId: string): Promise<{ ok?: true; error?: string }> {
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) return { error: 'Not authorised.' }

  const admin = createAdminClient()
  // A READ THAT FAILED IS NOT AN ENTRY THAT IS ABSENT. This dropped `error` and
  // answered "Waitlist entry not found.", so a database hiccup told the founder
  // that a person he was looking at on the same screen did not exist.
  const { data: entry, error: entryError } = await admin
    .from('city_waitlist_signups')
    .select('id, city_slug, full_name, email, role, unsubscribe_token, unsubscribed_at')
    .eq('id', signupId)
    .maybeSingle()

  if (entryError) {
    console.error('[admin/network] could not read waitlist entry %s:', signupId, entryError)
    return { error: 'Could not read that waitlist entry. Nothing was sent. Try again.' }
  }
  if (!entry) return { error: 'Waitlist entry not found.' }
  if (!isFoundingCity(entry.city_slug)) return { error: 'That entry has no valid Australian city recorded.' }
  if (entry.unsubscribed_at) return { error: 'This person has left the waitlist and cannot be emailed.' }

  // One founder invite per waitlist email: reuse an existing pending invite.
  //
  // THE ERROR IS FATAL HERE RATHER THAN IGNORED, because this read is the only
  // thing standing between one invitation and two. Dropping it left `existing`
  // undefined, which falls through to the `else` below and mints a SECOND
  // founding code for somebody who already holds a pending one: two warm
  // emails, two links, one fee-free window, and the person deciding whether to
  // trust a new platform receiving both.
  const { data: existing, error: existingError } = await admin
    .from('founding_invites')
    .select('code, status')
    .eq('invitee_email', entry.email.toLowerCase())
    .eq('inviter_kind', 'founder')
    .maybeSingle()

  if (existingError) {
    console.error('[admin/network] could not check for an existing invite for %s:', entry.email, existingError)
    return { error: 'Could not check whether they already hold an invite. Nothing was sent. Try again.' }
  }

  let code: string
  if (existing?.status === 'pending') {
    code = existing.code
  } else if (existing?.status === 'accepted') {
    return { error: 'This person has already accepted a founding invitation.' }
  } else {
    const result = await createFoundingInvite({
      inviterKind: 'founder',
      inviterOrgId: null,
      inviterName: 'EventLinqs',
      citySlug: entry.city_slug,
      inviteeEmail: entry.email,
    })
    if ('error' in result) return { error: result.error }
    code = result.code
  }

  const origin = getSiteUrl()
  const cityName = getCity(entry.city_slug)?.name ?? entry.city_slug
  const inviteUrl = `${origin}/join/${code}`
  const unsubscribeUrl = `${origin}/waitlist/unsubscribe/${entry.unsubscribe_token}`
  const firstName = entry.full_name.split(' ')[0] || entry.full_name

  try {
    await sendEmail({
      to: entry.email,
      subject: `EventLinqs is open in ${cityName}`,
      messageType: 'founding_invitation',
      recipientRole: 'prospect',
      // LAW 24 as ruled (26 September 2026): the offer is rendered from the one
      // module that holds it, and nothing here says the recipient needs this
      // email to receive it. "Founding Organisers also get their first event
      // set up with the founder" was removed: it cannot hold for every organiser.
      text: [
        `Hi ${firstName},`,
        '',
        `EventLinqs is open in ${cityName}, and everywhere else in ${FOUNDING_OFFER_SCOPE}.`,
        '',
        `${FOUNDING_TERMS.initial} ${FOUNDING_TERMS.badge}`,
        '',
        `${FOUNDING_TERMS.referral} ${FOUNDING_TERMS.after}`,
        '',
        `Create your organiser account: ${inviteUrl}`,
        '',
        `You are receiving this because you joined the ${cityName} waitlist as an organiser. Leave the waitlist any time: ${unsubscribeUrl}`,
        '',
        'EventLinqs',
      ].join('\n'),
      html: `<p>Hi ${firstName},</p><p><strong>EventLinqs is open in ${cityName}</strong>, and everywhere else in ${FOUNDING_OFFER_SCOPE}.</p><p>${FOUNDING_TERMS.initial} ${FOUNDING_TERMS.badge}</p><p>${FOUNDING_TERMS.referral} ${FOUNDING_TERMS.after}</p><p><a href="${inviteUrl}" style="display:inline-block;background:#D4A017;color:#0A1628;padding:11px 22px;border-radius:999px;font-weight:bold;text-decoration:none;">Create your organiser account</a></p><p style="font-size:12px;color:#888;">You are receiving this because you joined the ${cityName} waitlist as an organiser. <a href="${unsubscribeUrl}">Leave the waitlist</a> any time.</p><p>EventLinqs</p>`,
    })
  } catch (err) {
    console.error('[admin/network] invite email failed:', err)
    return { error: 'The invite was created but the email could not be sent. Try again shortly.' }
  }

  await recordAuditEvent({ action: 'admin.network.invite_waitlist', session, targetType: 'waitlist_signup', targetId: signupId })
  revalidatePath('/admin/network')
  return { ok: true }
}

/**
 * THE OWNER'S HAND ON A FOUNDING WINDOW. Close-out FO1 requires that the owner
 * can grant, revoke and extend by hand, and that the change reaches checkout on
 * the next order with no deploy.
 *
 * It reaches checkout because nothing caches it: the charge authority reads
 * organisations.founding_fee_free_until directly on every calculate()
 * (getFoundingWaiver in src/lib/payments/founding-waiver.ts), so the next order
 * priced after this action sees the new date. There is no cache to invalidate
 * here and adding one would be the thing that breaks the promise.
 *
 * THE DATES ARE COMPUTED HERE, IN TYPESCRIPT, by the same two helpers the
 * automatic path uses, and the database is told the answer rather than asked to
 * work it out. That keeps one definition of "six months from now" and one of
 * "three more months from where you are".
 *
 * THERE IS NO CAP (LAW 24, founder ruling of 20 September 2026: "Not a cap of
 * 50. Every organiser."). Every organisation already holds six months from its
 * own registration, stamped by the database at insert; this is the owner's hand
 * on top of that, and every outcome is audit-logged. The fifty-window count,
 * its refusal and its override were removed with the database trigger that
 * enforced them (migration 20260926000001).
 */
export type FoundingWaiverAction = 'grant' | 'extend' | 'revoke'

export async function setFoundingWaiver(input: {
  organisationId: string
  action: FoundingWaiverAction
  months?: number
}): Promise<{ ok?: true; feeFreeUntil?: string | null; error?: string }> {
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) return { error: 'Not authorised.' }

  const admin = createAdminClient()
  const { data: org, error: readError } = await admin
    .from('organisations')
    .select('id, name, founding_fee_free_until, is_founding')
    .eq('id', input.organisationId)
    .maybeSingle()

  if (readError) {
    console.error('[admin/network] could not read organisation %s:', input.organisationId, readError)
    return { error: 'Could not read that organisation. Try again.' }
  }
  if (!org) return { error: 'Organisation not found.' }

  const previous = org.founding_fee_free_until ?? null
  const months = Number.isFinite(input.months) ? Math.trunc(input.months as number) : undefined
  if (months !== undefined && (months < 1 || months > 36)) {
    return { error: 'Months must be between 1 and 36.' }
  }

  let next: string | null
  if (input.action === 'revoke') {
    next = null
  } else if (input.action === 'grant') {
    next = initialWaiverUntil()
  } else {
    next = extendWaiver(previous, months ?? FOUNDING_REFERRAL_MONTHS)
  }

  // Membership moves with the terms. Granting by hand IS admitting an organiser
  // to the programme, and revoking is removing them from it, so is_founding and
  // founding_since travel in the same statement rather than in a second write
  // that can fail on its own and leave a badge with no window behind it.
  // Extending changes the date and nothing about membership.
  const membership = input.action === 'grant' ? 'grant' : input.action === 'revoke' ? 'revoke' : 'none'

  const { data: applied, error: rpcError } = await admin.rpc('admin_set_founding_waiver', {
    p_org_id: org.id,
    p_until: next,
    p_override: false,
    p_membership: membership,
  })

  if (rpcError) {
    console.error('[admin/network] founding waiver write failed for %s:', org.id, rpcError)
    await recordAuditEvent({
      action: 'admin.founding.waiver.failed',
      session,
      targetType: 'organisation',
      targetId: org.id,
      metadata: { requested: input.action, error: rpcError.message },
    })
    return { error: 'The database refused that change. Nothing was altered.' }
  }

  const feeFreeUntil = (applied as string | null) ?? null

  await recordAuditEvent({
    action: `admin.founding.waiver.${input.action}`,
    session,
    targetType: 'organisation',
    targetId: org.id,
    metadata: {
      organisation_name: org.name ?? null,
      previous_fee_free_until: previous,
      new_fee_free_until: feeFreeUntil,
      months_added: input.action === 'extend' ? months ?? null : null,
      membership: membership,
      active_now: isWaiverActive(feeFreeUntil),
    },
  })

  revalidatePath('/admin/network')
  return { ok: true, feeFreeUntil }
}
