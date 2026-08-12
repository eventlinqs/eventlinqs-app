'use server'

import { cookies } from 'next/headers'
import { KIT_DRAFT_COOKIE, isKitDraftToken } from '@/lib/growth/kit-draft'
import { actionRateLimit } from '@/lib/rate-limit/action'
import { composeFromText } from '@/lib/launch/compose'
import {
  mintKitCode,
  mintKitToken,
  countSessionCompose,
  readDraftByToken,
  saveDraft,
  type KitDraftPayload,
} from '@/lib/launch/draft-store'
import { listCategoryNames, listCommunitySlugs } from '@/lib/launch/taxonomy'
import { isPlausibleEmail, sendKitEmail } from '@/lib/launch/kit-email'
import { getSiteUrl } from '@/lib/site-url'
import { buildDraftContext } from '@/lib/launch/draft-artefacts'
import { toCaptionInput } from '@/lib/broadcast/kit-artefacts'
import { buildCaptions, type Caption } from '@/lib/broadcast/captions'

/**
 * The public composer's server actions. No auth on any of them, by design.
 *
 * COST POSTURE (founder ruling 9 August 2026, 0.2b): this path is
 * DETERMINISTIC. It spends no model tokens, so there is no volume at which an
 * anonymous visitor becomes a bill, and the rate limits below exist to bound
 * database writes and render CPU rather than an API spend. They therefore fail
 * OPEN: a Redis blip must never stop a stranger building a kit.
 */

export type ComposeState = {
  ok: boolean
  code: string | null
  payload: KitDraftPayload | null
  recurringNote: string | null
  reachFraming: 'tickets' | 'attendance'
  questions: string[]
  /** True when the draft store is unavailable, so persistence is degraded. */
  ephemeral: boolean
  /**
   * All six per-channel captions, rendered by the same deterministic engine the
   * published kit uses. Ruling 0.2a says a stranger sees EVERY caption, so they
   * travel with the state rather than sitting behind a control.
   */
  captions: Caption[]
}

/**
 * The captions for a payload. Pure, deterministic, no model call, no network.
 *
 * The origin only ever reaches the caption text as the kit link, which is a
 * real URL that resolves for thirty days.
 */
function captionsFor(payload: KitDraftPayload, code: string | null): Caption[] {
  const context = buildDraftContext({
    payload,
    code: code ?? 'preview',
    origin: getSiteUrl(),
    organiserName: '',
  })
  return buildCaptions(toCaptionInput(context))
}

/**
 * Build a kit from one paragraph and persist it.
 *
 * Returns a complete kit in EVERY branch. There is no failure mode that hands
 * the visitor an error instead of artefacts: a rate limit, a missing table, or
 * an unparseable sentence all still produce a draft, because the composition
 * itself is local and cannot fail on the network.
 */
export async function composeKit(text: string): Promise<ComposeState> {
  // Bound the write and render volume. Fail-open by policy (see policies.ts):
  // there is no model spend on this path, so a Redis blip must never stop a
  // stranger building a kit.
  const [hourly, daily] = await Promise.all([
    actionRateLimit('launch-compose'),
    actionRateLimit('launch-compose-daily'),
  ])
  const limited = !hourly.ok || !daily.ok

  const [categoryNames, communitySlugs] = await Promise.all([
    listCategoryNames(),
    listCommunitySlugs(),
  ])

  const result = composeFromText({
    text,
    categoryNames,
    communitySlugs,
    nowIso: new Date().toISOString(),
  })

  // Over the cap the kit still renders from the payload in this request: the
  // title, the questions, the visibility decision, the event page preview and
  // all six captions are all local computation and cannot fail.
  //
  // BE ACCURATE ABOUT WHAT IS LOST, because this comment used to say "only the
  // bookmarkable link", and that was wrong. The cards and the poster are
  // addressed by draft CODE, so with nothing persisted there is no code and
  // those artefacts are not shown either. KitArtefacts states that plainly
  // rather than drawing empty frames. It is still a designed state and still
  // needs no error message, but it is a materially thinner kit and pretending
  // otherwise is how a limit gets set too low and nobody notices.
  if (limited) {
    return {
      ok: true,
      code: null,
      payload: result.payload,
      recurringNote: result.recurringNote,
      reachFraming: result.reachFraming,
      questions: result.questions,
      ephemeral: true,
      captions: captionsFor(result.payload, null),
    }
  }

  const jar = await cookies()
  const existing = jar.get(KIT_DRAFT_COOKIE)?.value
  const token = isKitDraftToken(existing) ? existing : mintKitToken()

  // The per-session half of "IP plus a per-session cap". It bounds one browser
  // without caring how many people share an address, which is what lets the IP
  // limits stay generous enough not to break a promoter on carrier NAT.
  const session = await countSessionCompose(token)
  if (!session.ok) {
    return {
      ok: true,
      code: null,
      payload: result.payload,
      recurringNote: result.recurringNote,
      reachFraming: result.reachFraming,
      questions: result.questions,
      ephemeral: true,
      captions: captionsFor(result.payload, null),
    }
  }

  // Reuse this browser's existing draft rather than minting a second one, so a
  // visitor who edits their description keeps one stable, shareable link.
  const prior = await readDraftByToken(token)
  const code = prior?.code ?? mintKitCode()

  const saved = await saveDraft({ code, token, payload: result.payload })

  if (saved) {
    // Set only AFTER a kit exists for this visitor, which is the contract the
    // activation metric email_captured_after_render depends on.
    jar.set(KIT_DRAFT_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })
  }

  return {
    ok: true,
    code: saved?.code ?? null,
    payload: result.payload,
    recurringNote: result.recurringNote,
    reachFraming: result.reachFraming,
    questions: result.questions,
    ephemeral: !saved,
    captions: captionsFor(result.payload, saved?.code ?? null),
  }
}

export type EmailKitState = { ok: boolean; message: string }

/**
 * "Send this kit to myself" (founder ruling 0.2c). Offered, never required.
 *
 * THE ONE ACTION ON THIS SURFACE THAT COSTS SOMETHING REAL, so it is the one
 * that is strict. Three gates, in cheapest-first order:
 *
 *   1. A plausible address, or nothing happens.
 *   2. A rate limit that FAILS CLOSED, unlike every other launch policy. The
 *      others protect CPU; this one protects a sending domain, and a domain
 *      burned by an open relay is not recoverable by tightening a limit later.
 *   3. AN OWNED DRAFT. The kit is read from this browser's own cookie token,
 *      never from a code in the request, so this cannot be pointed at somebody
 *      else's kit or used to mail an arbitrary link from our domain.
 */
export async function emailKitToSelf(email: string): Promise<EmailKitState> {
  if (!isPlausibleEmail(email)) {
    return { ok: false, message: 'That address does not look right. Have another look.' }
  }

  const limit = await actionRateLimit('launch-email')
  if (!limit.ok) {
    return { ok: false, message: 'That has been sent a few times already. Try again a bit later.' }
  }

  const jar = await cookies()
  const token = jar.get(KIT_DRAFT_COOKIE)?.value
  if (!isKitDraftToken(token)) {
    return { ok: false, message: 'Your kit is on this screen. Build it again to send yourself a link.' }
  }

  const draft = await readDraftByToken(token)
  if (!draft) {
    return { ok: false, message: 'Your kit is on this screen. Build it again to send yourself a link.' }
  }

  try {
    await sendKitEmail({
      to: email,
      title: draft.payload.title,
      url: `${getSiteUrl()}/launch/k/${draft.code}`,
    })
  } catch {
    // A transport failure is not the visitor's problem and their kit is
    // unaffected, so it is stated plainly and without an apology.
    return { ok: false, message: 'That did not send. Your kit is still here on this link.' }
  }

  return { ok: true, message: 'Sent. Check your inbox.' }
}

/** Update the fields the organiser corrected. Ownership proved by the cookie. */
export async function updateKit(patch: Partial<KitDraftPayload>): Promise<ComposeState | null> {
  const jar = await cookies()
  const token = jar.get(KIT_DRAFT_COOKIE)?.value
  if (!isKitDraftToken(token)) return null

  const prior = await readDraftByToken(token)
  if (!prior) return null

  const payload: KitDraftPayload = { ...prior.payload, ...patch }
  const saved = await saveDraft({ code: prior.code, token, payload })

  return {
    ok: true,
    code: saved?.code ?? prior.code,
    payload,
    recurringNote: null,
    reachFraming:
      payload.isFree || payload.visibility !== 'public' ? 'attendance' : 'tickets',
    questions: [],
    ephemeral: !saved,
    captions: captionsFor(payload, saved?.code ?? prior.code),
  }
}
