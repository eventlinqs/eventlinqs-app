import { createAdminClient } from '@/lib/supabase/admin'
import { Resend } from 'resend'

/**
 * Calls the promote_waitlist RPC, then sends Resend emails to everyone
 * whose status just changed to 'notified'.
 *
 * Returns the number of entries promoted (0 if none available or no inventory).
 */
export async function promoteWaitlist(
  eventId: string,
  tierId: string,
  quantityAvailable: number,
  windowMinutes = 15
): Promise<number> {
  if (quantityAvailable <= 0) return 0

  const adminClient = createAdminClient()

  // 1. Call RPC — atomically finds waiting entries, sets status = 'notified',
  //    creates waitlist_notifications rows with expires_at = NOW() + windowMinutes.
  const { data: promotedCount, error: rpcError } = await adminClient.rpc('promote_waitlist', {
    p_event_id: eventId,
    p_ticket_tier_id: tierId,
    p_quantity_available: quantityAvailable,
    p_notification_window_minutes: windowMinutes,
  })

  if (rpcError) {
    console.error('[waitlist] promote_waitlist RPC error:', rpcError)
    return 0
  }

  const count = (promotedCount as number) ?? 0
  if (count === 0) return 0

  console.log(`[waitlist] promoted ${count} entries for event ${eventId} tier ${tierId}`)

  // 2. Fetch the newly-notified entries so we can send emails
  const { data: notifiedEntries, error: fetchError } = await adminClient
    .from('waitlist')
    .select(`
      id,
      quantity_requested,
      user_id,
      events!event_id ( id, title, slug, start_date, timezone, venue_name, venue_city ),
      ticket_tiers!ticket_tier_id ( name ),
      waitlist_notifications ( id, expires_at, email_sent )
    `)
    .eq('event_id', eventId)
    .eq('ticket_tier_id', tierId)
    .eq('status', 'notified')

  if (fetchError || !notifiedEntries || notifiedEntries.length === 0) {
    console.error('[waitlist] failed to fetch notified entries for email:', fetchError)
    return count
  }

  // 3. For each notified entry without an email sent, resolve email and send
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    console.warn('[waitlist] RESEND_API_KEY not set - skipping promotion emails')
    return count
  }
  const resend = new Resend(resendKey)

  type EventShape = { id: string; title: string; slug: string; start_date: string; timezone: string; venue_name: string | null; venue_city: string | null }
  type TierShape = { name: string }
  type NotifShape = { id: string; expires_at: string; email_sent: boolean }

  function pickOne<T>(v: T | T[] | null): T | null {
    if (!v) return null
    return Array.isArray(v) ? (v[0] ?? null) : v
  }

  for (const entry of notifiedEntries as unknown[]) {
    const row = entry as {
      id: string
      quantity_requested: number
      user_id: string
      events: EventShape | EventShape[] | null
      ticket_tiers: TierShape | TierShape[] | null
      waitlist_notifications: NotifShape | NotifShape[] | null
    }

    const notification = pickOne(row.waitlist_notifications)
    if (!notification || notification.email_sent) continue

    const eventData = pickOne(row.events)
    const tierData = pickOne(row.ticket_tiers)
    if (!eventData) continue

    // Resolve buyer email via profiles
    const { data: profile } = await adminClient
      .from('profiles')
      .select('email')
      .eq('id', row.user_id)
      .single()

    const buyerEmail = profile?.email
    if (!buyerEmail) continue

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://eventlinqs.com'
    const checkoutUrl = `${appUrl}/events/${eventData.slug}?waitlist_token=${row.id}`
    const expiresAt = new Date(notification.expires_at)
    const expiresFormatted = expiresAt.toLocaleString('en-AU', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: eventData.timezone ?? 'UTC',
      timeZoneName: 'short',
    })

    const eventDate = new Date(eventData.start_date).toLocaleString('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: eventData.timezone ?? 'UTC',
    })

    try {
      await resend.emails.send({
        from: 'EventLinqs <noreply@eventlinqs.com>',
        to: buyerEmail,
        subject: `A spot opened up. Claim it before ${expiresFormatted}`,
        html: buildPromotionEmailHtml({
          eventTitle: eventData.title,
          eventDate,
          tierName: tierData?.name ?? 'General Admission',
          quantity: row.quantity_requested,
          venueName: eventData.venue_name,
          venueCity: eventData.venue_city,
          checkoutUrl,
          expiresFormatted,
          windowMinutes,
        }),
      })

      // Mark email as sent
      await adminClient
        .from('waitlist_notifications')
        .update({ email_sent: true })
        .eq('id', notification.id)
    } catch (emailErr) {
      console.error(`[waitlist] failed to send promotion email for waitlist ${row.id}:`, emailErr)
    }
  }

  return count
}

interface EmailParams {
  eventTitle: string
  eventDate: string
  tierName: string
  quantity: number
  venueName: string | null
  venueCity: string | null
  checkoutUrl: string
  expiresFormatted: string
  windowMinutes: number
}

function buildPromotionEmailHtml(p: EmailParams): string {
  const location = [p.venueName, p.venueCity].filter(Boolean).join(', ')

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h1 style="color:#1A1A2E;font-size:22px;margin-bottom:4px;">A spot just opened up 🎟</h1>
      <p style="color:#6B7280;margin-top:0;font-size:14px;">
        Good news: a <strong>${p.tierName}</strong> ticket for <strong>${p.eventTitle}</strong> is now available for you.
      </p>

      <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:16px;margin:20px 0;">
        <p style="margin:0;font-size:14px;color:#92400E;">
          ⏱ <strong>You have ${p.windowMinutes} minutes</strong> to complete your purchase. Offer expires at <strong>${p.expiresFormatted}</strong>.
        </p>
      </div>

      <h2 style="color:#1A1A2E;font-size:16px;margin-bottom:4px;">${p.eventTitle}</h2>
      <p style="color:#374151;font-size:14px;margin:4px 0;">${p.eventDate}</p>
      ${location ? `<p style="color:#6B7280;font-size:14px;margin:4px 0;">${location}</p>` : ''}
      <p style="color:#374151;font-size:14px;margin:4px 0;">
        <strong>${p.quantity} × ${p.tierName}</strong>
      </p>

      <div style="margin:28px 0;">
        <a href="${p.checkoutUrl}"
           style="display:inline-block;background:#1A1A2E;color:white;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;">
          Claim Your Ticket Now →
        </a>
      </div>

      <p style="color:#9CA3AF;font-size:12px;">
        If you no longer want this ticket, simply ignore this email and your spot will be passed to the next person.
      </p>
      <p style="color:#9CA3AF;font-size:12px;">The EventLinqs Team</p>
    </div>
  `
}
