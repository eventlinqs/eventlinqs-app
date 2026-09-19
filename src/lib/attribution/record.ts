import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { isFeatureEnabled } from '@/lib/flags/broadcast'
import { isPreviewCrawler } from '@/lib/broadcast/crawler'
import { deviceFromUserAgent, referringHost } from '@/lib/growth/visit-attribution'
import { captureException } from '@/lib/observability/sentry'
import { mintLinkCode, isValidLinkCode } from './codes'
import { readAttributionConfig } from './config'
import { eventTargetPath } from './route-config'

/**
 * WRITING THE SPINE: links, clicks and the order signal.
 *
 * Every function here is BEST EFFORT in one direction only. A click that cannot
 * be written must never stop a buyer reaching an event page, and an order
 * signal that cannot be written must never fail a purchase. But a write that
 * fails is REPORTED rather than swallowed: a silent drop is indistinguishable
 * from nobody having clicked, and this is the billing basis.
 *
 * NOTHING HERE TOUCHES THE PAYMENT PATH. The order signal is written from the
 * checkout action beside the consent record, which is where lane B already
 * writes, and the payment intent, the Stripe call and the refund path are
 * untouched.
 */

/** What the redirect needs back to finish, whether or not the click was booked. */
export interface BookedClick {
  clickId: string | null
  targetPath: string
  campaignId: string
  channelCode: string
  /** Set when the click was NOT booked, naming why. */
  degradedReason: string | null
}

function userAgentClass(userAgent: string | null): string {
  if (isPreviewCrawler(userAgent)) return 'bot'
  return deviceFromUserAgent(userAgent) ?? 'unknown'
}

/**
 * Mint a tracked link for an event.
 *
 * The code is generated, the target path is composed ONCE here and stored, and
 * a collision retries rather than throwing: a code space of 36^12 makes one
 * vanishingly unlikely and a single retry makes it impossible to care about.
 */
export async function mintTrackedLink(params: {
  campaignId: string
  channelCode: string
  eventSlug: string
  partnerId?: string | null
  recipientId?: string | null
}): Promise<{ code: string; targetPath: string }> {
  const admin = createAdminClient()
  const config = await readAttributionConfig()
  const targetPath = eventTargetPath(params.eventSlug)

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = mintLinkCode(config.linkCodeLength)
    const { error } = await admin.from('marketing_link').insert({
      code,
      campaign_id: params.campaignId,
      channel_code: params.channelCode,
      partner_id: params.partnerId ?? null,
      recipient_id: params.recipientId ?? null,
      target_path: targetPath,
    })
    if (!error) return { code, targetPath }
    // 23505 is a unique violation: the only retryable failure here.
    if (error.code !== '23505') throw new Error(`could not mint a tracked link: ${error.message}`)
  }
  throw new Error('could not mint a tracked link: three code collisions in a row')
}

/**
 * Resolve a code and book the click.
 *
 * FOUR THINGS IN ORDER, and the order is the requirement: load the link, write
 * the click, hand back the click id so the caller can set the cookie, and let
 * the caller redirect. The cookie is set by the caller because only a Route
 * Handler can set one, which is a Next.js constraint rather than a choice.
 */
export async function bookClick(params: {
  code: string
  userAgent: string | null
  referrer: string | null
  ownHost: string | null
  cookieWasPresent: boolean
}): Promise<BookedClick | null> {
  if (!isValidLinkCode(params.code)) return null

  const admin = createAdminClient()
  const { data: link, error: linkError } = await admin
    .from('marketing_link')
    .select('code, campaign_id, channel_code, recipient_id, target_path, is_active')
    .eq('code', params.code)
    .maybeSingle()

  if (linkError) {
    // A read failure is NOT "no such link". Answering 404 to a real link
    // because the database hiccupped is the failure this platform has already
    // been bitten by once, so it is reported and the caller decides.
    captureException(new Error(`marketing_link read failed for ${params.code}: ${linkError.message}`))
    return null
  }
  if (!link || !link.is_active) return null

  const result: BookedClick = {
    clickId: null,
    targetPath: link.target_path,
    campaignId: link.campaign_id,
    channelCode: link.channel_code,
    degradedReason: null,
  }

  try {
    if (!(await isFeatureEnabled('marketing_attribution_capture_enabled'))) {
      result.degradedReason = 'capture_switched_off'
      return result
    }

    const agentClass = userAgentClass(params.userAgent)
    /*
     * A PREVIEW CRAWLER IS NOT A PERSON. Every messaging platform fetches a
     * link the moment it is pasted, and booking those would credit a campaign
     * for a click nobody made. The existing share system learned this the same
     * way; the rule is applied here rather than borrowed, because the two
     * subsystems are kept apart.
     */
    if (agentClass === 'bot') {
      result.degradedReason = 'preview_crawler_not_counted'
      return result
    }

    /*
     * FORWARDED SUSPICION, and it is a SUSPICION rather than a finding. A link
     * minted for one person, opened by a browser that had never seen it, having
     * arrived from a messaging host, is the shape of a forwarded message. It is
     * recorded as a flag on the click and is never on its own the reason a
     * recipient loses credit: the resolver decides that from the buyer's
     * identity, which is evidence rather than a guess.
     */
    const referrerHost = referringHost(params.referrer, params.ownHost)
    const forwardedSuspected = Boolean(link.recipient_id) && !params.cookieWasPresent

    const { data: click, error: clickError } = await admin
      .from('marketing_click')
      .insert({
        link_code: link.code,
        // The trigger overwrites these from the link. They are sent so the
        // insert satisfies the not-null columns before the trigger runs.
        campaign_id: link.campaign_id,
        channel_code: link.channel_code,
        user_agent_class: agentClass,
        cookie_was_present: params.cookieWasPresent,
        referrer_host: referrerHost,
        forwarded_suspected: forwardedSuspected,
      })
      .select('id')
      .single()

    if (clickError || !click) {
      result.degradedReason = 'click_write_failed'
      captureException(new Error(`marketing_click write failed for ${link.code}: ${clickError?.message ?? 'no row returned'}`))
      return result
    }

    result.clickId = click.id
    return result
  } catch (error) {
    result.degradedReason = 'click_write_threw'
    captureException(error)
    return result
  }
}

/**
 * The order signal: what the buyer's browser carried when the order id first
 * existed. Called from the checkout action, beside the consent record.
 *
 * Never throws. A purchase does not fail because attribution could not be
 * recorded, and the resolver still has the identity rung to fall back on.
 */
export async function recordOrderSignal(params: {
  orderId: string
  clickIdFromCookie: string | null
  clickIdFromQuery: string | null
  campaignIdFromQuery: string | null
  linkCode: string | null
  cookiePresent: boolean
}): Promise<void> {
  try {
    if (!(await isFeatureEnabled('marketing_attribution_capture_enabled'))) return
    const clickId = params.clickIdFromCookie ?? params.clickIdFromQuery
    const hasAnything =
      clickId !== null || params.campaignIdFromQuery !== null || params.linkCode !== null || params.cookiePresent
    if (!hasAnything) return

    const admin = createAdminClient()
    /*
     * The click id is verified to EXIST before it is stored. A cookie is
     * user writable, so an unverified value would let anybody attach their
     * purchase to any campaign by editing a cookie, which on a billing basis is
     * not a theoretical concern. A forged id simply stores nothing and the
     * resolver falls to the identity rung.
     */
    let verifiedClickId: string | null = null
    let campaignId: string | null = null
    if (clickId) {
      /*
       * THE ERROR IS BOUND BECAUSE A FORGED ID AND AN UNREADABLE ONE LOOK
       * IDENTICAL HERE, AND ONLY ONE OF THEM IS THE BUYER DOING SOMETHING.
       *
       * A click id that verifies is the difference between a sale credited to
       * the message that produced it and a sale credited to nobody. The comment
       * above is right that a FORGED id should store nothing; a read that failed
       * is not a forgery, and silently treating it as one loses real attribution
       * with no trace anywhere. It is recorded, and the checkout still proceeds:
       * refusing a purchase over an attribution read would be the worse trade by
       * a distance.
       */
      const { data: click, error: clickError } = await admin
        .from('marketing_click')
        .select('id, campaign_id')
        .eq('id', clickId)
        .maybeSingle()
      if (clickError) {
        captureException(clickError, {
          where: 'lib/attribution/record:checkout signal',
          note: 'the click this order names could not be read, so the sale is recorded with no verified click',
        })
      }
      if (click) {
        verifiedClickId = click.id
        campaignId = click.campaign_id
      }
    }

    const { error } = await admin.from('marketing_order_signal').upsert(
      {
        order_id: params.orderId,
        click_id: verifiedClickId,
        link_code: params.linkCode,
        campaign_id: campaignId,
        cookie_present: params.cookiePresent,
        query_identifiers: {
          click: params.clickIdFromQuery,
          campaign: params.campaignIdFromQuery,
        },
      },
      { onConflict: 'order_id' },
    )
    if (error) captureException(new Error(`marketing_order_signal write failed for ${params.orderId}: ${error.message}`))
  } catch (error) {
    captureException(error)
  }
}
