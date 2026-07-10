'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/send'
import { getSiteUrl } from '@/lib/site-url'
import { createFoundingInvite, isFoundingCity } from '@/lib/founding/invites'
import { getCity } from '@/lib/cities/data'

/**
 * The waitlist-to-invite bridge. From the demand-signal view the founder marks
 * a Geelong or Melbourne waitlist entry as invited: this mints a founder-issued
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
  const { data: entry } = await admin
    .from('city_waitlist_signups')
    .select('id, city_slug, full_name, email, role, unsubscribe_token, unsubscribed_at')
    .eq('id', signupId)
    .maybeSingle()

  if (!entry) return { error: 'Waitlist entry not found.' }
  if (!isFoundingCity(entry.city_slug)) return { error: 'Invites are only open for Geelong and Melbourne.' }
  if (entry.unsubscribed_at) return { error: 'This person has left the waitlist and cannot be emailed.' }

  // One founder invite per waitlist email: reuse an existing pending invite.
  const { data: existing } = await admin
    .from('founding_invites')
    .select('code, status')
    .eq('invitee_email', entry.email.toLowerCase())
    .eq('inviter_kind', 'founder')
    .maybeSingle()

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
      subject: `Your founding invitation for ${cityName}`,
      text: [
        `Hi ${firstName},`,
        '',
        `${cityName} is opening on EventLinqs, and you are invited to join as one of the first 50 Founding Organisers.`,
        '',
        'Founding Organisers pay no platform fee for 6 months, get their first event set up with the founder, and earn 3 more fee-free months for every organiser they refer.',
        '',
        `Claim your spot: ${inviteUrl}`,
        '',
        `You are receiving this because you joined the ${cityName} waitlist and asked to hear about Founding Organiser invitations. Leave the waitlist any time: ${unsubscribeUrl}`,
        '',
        'EventLinqs',
      ].join('\n'),
      html: `<p>Hi ${firstName},</p><p><strong>${cityName} is opening on EventLinqs</strong>, and you are invited to join as one of the first 50 Founding Organisers.</p><p>Founding Organisers pay no platform fee for 6 months, get their first event set up with the founder, and earn 3 more fee-free months for every organiser they refer.</p><p><a href="${inviteUrl}" style="display:inline-block;background:#D4A017;color:#0A1628;padding:11px 22px;border-radius:999px;font-weight:bold;text-decoration:none;">Claim your founding spot</a></p><p style="font-size:12px;color:#888;">You are receiving this because you joined the ${cityName} waitlist and asked to hear about Founding Organiser invitations. <a href="${unsubscribeUrl}">Leave the waitlist</a> any time.</p><p>EventLinqs</p>`,
    })
  } catch (err) {
    console.error('[admin/network] invite email failed:', err)
    return { error: 'The invite was created but the email could not be sent. Try again shortly.' }
  }

  await recordAuditEvent({ action: 'admin.network.invite_waitlist', session, targetType: 'waitlist_signup', targetId: signupId })
  revalidatePath('/admin/network')
  return { ok: true }
}
