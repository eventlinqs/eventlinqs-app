import { postState } from '@/lib/social/post-state'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatPlatformDateTime } from '@/lib/dates/event-time'
import { cadenceFor, lastPosted, readAssets, readCampaign, readImageRequests, readPosts, type AssetRow, type PieceRow, type PostRow } from '@/lib/social/store'
import { imageRightsLine, readImageRights, type ImageRightsReport } from '@/lib/media/image-rights'
import { readBlotatoTargets, type BlotatoTargets } from '@/lib/social/blotato-targets'
import { CopyLinkButton } from '@/components/launch-kit/copy-link-button'
import { FORMAT_NAME, cadenceLine, nextAllowed, type CadenceRule, type SocialFormat } from '@/lib/social/cadence'
import {
  addAssetAction,
  withdrawAssetAction,
  approveAction,
  approvePieceAction,
  approveWeekAction,
  decideAssetAction,
  editPieceAction,
  excludeNightAction,
  planWeekAction,
  recordPieceAction,
  recordPostedAction,
  regeneratePieceAction,
  rejectPieceAction,
  writeWordsAction,
} from './actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = {
  title: 'Social posts | EventLinqs Admin',
  robots: { index: false, follow: false },
}

/**
 * EVENTLINQS' OWN POSTS, PLANNED, APPROVED AND COUNTED (item 11, the social engine; docs/SOCIAL-ENGINE.md).
 *
 * First what the posts brought in the last 30 days: tickets and money, then people who arrived and pressed out to the
 * organiser's page, each through a post's own link. Then the week's posts by city, each a Launch Kit card with the
 * night's own photo and the kit's own words: change the words, approve the newest, post it on Instagram by hand, and
 * paste its address here. Then the posts that went, each with what it brought. Likes are never shown.
 */

const BUTTON =
  'inline-flex min-h-[44px] items-center rounded-full bg-[var(--brand-accent)] px-5 text-sm font-semibold text-[var(--color-navy-950)]'
const QUIET =
  'inline-flex min-h-[44px] items-center rounded-full border border-[var(--admin-line)] px-5 text-sm font-semibold text-[var(--admin-soft)] hover:border-[var(--admin-line-strong)] hover:text-[var(--admin-ink)]'
const FIELD = 'block w-full rounded-lg border border-[var(--admin-line)] bg-[var(--admin-tint)] p-3 text-[13px] text-[var(--admin-ink)]'

const money = (cents: number): string => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100)

function ruleLine(format: SocialFormat, rule: CadenceRule, next: Date, now: Date): string {
  const when = next.getTime() <= now.getTime() ? 'one may go now' : `the next may go ${formatPlatformDateTime(next.toISOString())}`
  return cadenceLine(format, rule, when)
}

function Results({ r }: { r: PostRow['result'] }) {
  return (
    <p className="text-sm text-[var(--admin-soft)]" data-result>
      {r.tickets} ticket{r.tickets === 1 ? '' : 's'}, {money(r.cents)}. {r.arrived} arrived, {r.pressedOut} pressed out to book.
    </p>
  )
}

function Post({ p }: { p: PostRow }) {
  const card = `/admin/social/card/${p.id}`
  return (
    <li id={`post-${p.id}`} data-post={p.id} data-format={p.format} className="scroll-mt-24 grid grid-cols-1 gap-4 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-4 md:grid-cols-[180px_minmax(0,1fr)]">
      {/* eslint-disable-next-line @next/next/no-img-element -- a staff preview of a rendered card, never a public image */}
      <img src={card} alt={`${FORMAT_NAME[p.format].one} for ${p.eventTitle}`} loading="lazy" className="w-full max-w-[180px] rounded-lg border border-[var(--admin-line)]" />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--admin-muted)]">
          Instagram {FORMAT_NAME[p.format].one.toLowerCase()}, {formatPlatformDateTime(p.eventStart)}
        </p>
        <h3 className="mt-1 font-display text-base font-semibold text-[var(--admin-ink)]">{p.eventTitle}</h3>
        {p.draft === null ? (
          <p data-state="no-words" className="mt-2 text-sm text-[var(--admin-soft)]">
            No words are kept for this post yet. Write them below.
          </p>
        ) : null}
        {p.postedAt === null ? (
          <>
            <form action={writeWordsAction} className="mt-3">
              <input type="hidden" name="post" value={p.id} />
              <label className="text-[11px] uppercase tracking-[0.18em] text-[var(--admin-muted)]" htmlFor={`words-${p.id}`}>
                The words{p.draft === null ? '' : `, version ${p.draft.version}${p.draft.writtenBy === 'kit' ? ', the Launch Kit’s' : ', yours'}`}
              </label>
              <textarea id={`words-${p.id}`} name="caption" data-words defaultValue={p.draft?.caption ?? `\n\n${p.link}`} rows={9} className={`mt-1 ${FIELD}`} />
              <p className="mt-1 text-xs text-[var(--admin-muted)]">Keep the link {p.link}. Every number must be one the listing holds.</p>
              <button type="submit" data-press="words" className={`mt-2 ${QUIET}`}>
                Keep these words
              </button>
            </form>
            <div className="mt-3 flex flex-wrap gap-3">
              <a href={`${card}?download=1`} className={QUIET} data-press="download">
                Download the card
              </a>
              {p.draft !== null && p.approvedAt === null ? (
                <form action={approveAction}>
                  <input type="hidden" name="draft" value={p.draft.id} />
                  <button type="submit" data-press="approve" className={BUTTON}>
                    Approve version {p.draft.version}
                  </button>
                </form>
              ) : null}
            </div>
            {p.approvedAt !== null ? (
              <form action={recordPostedAction} className="mt-3 flex flex-wrap items-end gap-3">
                <input type="hidden" name="post" value={p.id} />
                <label className="min-w-0 flex-1 text-sm text-[var(--admin-soft)]">
                  Approved {formatPlatformDateTime(p.approvedAt)}. Posted? Paste its address
                  <input name="url" type="url" required placeholder="https://www.instagram.com/p/" data-posted-url className={`mt-1 ${FIELD}`} />
                </label>
                <button type="submit" data-press="posted" className={BUTTON}>
                  Record it
                </button>
              </form>
            ) : null}
          </>
        ) : (
          <div className="mt-2">
            <p className="text-sm text-[var(--admin-soft)]">
              Went {formatPlatformDateTime(p.postedAt)}.{' '}
              {p.postUrl === null ? null : (
                <a href={p.postUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-[var(--admin-muted)] underline-offset-4 hover:decoration-[var(--admin-muted)]">
                  See the post
                </a>
              )}
            </p>
            <Results r={p.result} />
          </div>
        )}
      </div>
    </li>
  )
}

const KIND_NAME: Record<PieceRow['kind'], string> = {
  week_ahead: 'Monday · The week ahead',
  discovery_reel: 'Wednesday · Discovery Reel frames',
  weekend_carousel: 'Thursday · The weekend guide',
  venue_spotlight: 'Friday · Venue spotlight',
  organiser_campaign: 'Organiser campaign',
  partner_kit: 'Partner kit',
  brand_campaign: 'The weekend brand piece',
  tonight_tomorrow: 'Friday · Tonight and Tomorrow',
  category_spotlight: 'Category Spotlight',
  coming_up: 'Sunday · Coming up',
  daily_poster: 'Daily poster',
  free_week: 'Wednesday and Sunday · Free this week',
  tonight: 'Tonight · a story on its own evening',
}
const AUDIENCE_NAME: Record<PieceRow['audience'], string> = { attendees: 'Attendees', organisers: 'Organisers and promoters', venues: 'Venues', partners: 'Community partners' }
const OBJECTIVE_NAME: Record<PieceRow['objective'], string> = { audience_growth: 'Audience growth', organiser_growth: 'Organiser growth' }
const MODE_NAME: Record<PieceRow['revision']['mode'], string> = {
  photo_led: "Treatment A, the owner's own photograph through an approved row",
  graphic_led: "Treatment C, EventLinqs' own art",
  type_led: 'Treatment B, editorial type, no image needed',
}
const STATE_NAME: Record<PieceRow['state'], string> = { drafted: 'Drafted', rejected: 'Rejected', approved: 'Approved', gone: 'Gone' }
const ASSET_STATE_NAME: Record<string, string> = {
  organiser_authorised: 'Organiser authorised',
  separately_licensed: 'Separately licensed',
  native_share: 'Native share of their own post',
  original_design: 'Original EventLinqs design',
}

/** One piece of the week's campaign, phone ready, with its picks, its history and every decision on it (A6, B4, K6, K7). */
function Piece({ p }: { p: PieceRow }) {
  const r = p.revision
  return (
    <li id={`piece-${p.id}`} data-piece={p.id} data-kind={p.kind} data-state={p.state} data-version={r.version} className="scroll-mt-24 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-semibold text-[var(--admin-ink)]">
          {KIND_NAME[p.kind]}
          {p.partnerName ? `: ${p.partnerName}` : ''} <span className="text-[var(--admin-muted)]">· {p.city}</span>
        </h3>
        <span className="text-xs uppercase tracking-[0.14em] text-[var(--admin-soft)]">
          {STATE_NAME[p.state]} · version {r.version}
        </span>
      </div>
      {p.schedule.length > 0 && p.state !== 'gone' ? (
        <p data-schedule className="mt-2 text-sm text-[var(--admin-soft)]">
          {p.schedule
            .map((s) =>
              // Each post's state by its provider's own id (src/lib/social/post-state.ts): submitted is never called published.
              postState(s).state === 'scheduled'
                ? `${s.platform === 'instagram' ? 'Instagram' : 'Facebook'}: scheduled for ${formatPlatformDateTime(s.goAt)}`
                : `${s.platform === 'instagram' ? 'Instagram' : 'Facebook'}: ${postState(s).words}`,
            )
            .join('. ')}
          . A post goes by itself only while publishing is switched on, and is called published only once its public address is read back.
        </p>
      ) : null}
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-[150px_minmax(0,1fr)]">
        <dt className="text-[var(--admin-muted)]">Audience</dt>
        <dd data-audience className="text-[var(--admin-ink)]">{AUDIENCE_NAME[p.audience]}</dd>
        <dt className="text-[var(--admin-muted)]">Objective</dt>
        <dd data-objective className="text-[var(--admin-ink)]">{OBJECTIVE_NAME[p.objective]}</dd>
        <dt className="text-[var(--admin-muted)]">Purpose</dt>
        <dd className="text-[var(--admin-ink)]">{p.purpose}</dd>
        <dt className="text-[var(--admin-muted)]">Call to action</dt>
        <dd className="text-[var(--admin-ink)]">{p.nextStep}</dd>
        <dt className="text-[var(--admin-muted)]">Measured by</dt>
        <dd className="text-[var(--admin-ink)]">{p.outcome}</dd>
        <dt className="text-[var(--admin-muted)]">Look</dt>
        <dd data-mode={r.mode} className="text-[var(--admin-ink)]">{MODE_NAME[r.mode]}</dd>
      </dl>
      {r.picks.length === 0 ? null : (
        <div data-picks className="mt-3">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--admin-muted)]">Why each night is in it</p>
          <ul className="mt-1 space-y-2">
            {r.picks.map((pick) => (
              <li key={pick.eventId} data-pick={pick.eventId} className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--admin-ink)]">
                <span>{pick.reason}</span>
                {p.state === 'gone' ? null : (
                  <form action={excludeNightAction} className="flex items-center gap-2">
                    <input type="hidden" name="event" value={pick.eventId} />
                    <label className="sr-only" htmlFor={`out-${p.id}-${pick.eventId}`}>
                      Why leave it out
                    </label>
                    <input id={`out-${p.id}-${pick.eventId}`} name="reason" required minLength={3} placeholder="Why leave it out" className={`${FIELD} max-w-[180px]`} />
                    <button type="submit" data-press="leave-out" className={QUIET}>
                      Leave out
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ol className="relative mt-4 flex gap-3 overflow-x-auto pb-2" aria-label="Slides">
        {r.slides.map((_, i) => (
          <li key={i} className="shrink-0">
            <a href={`/admin/social/piece/${p.id}/${i + 1}?download=1`} data-press="slide" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element -- an admin route behind the session cookie, which the image optimiser cannot fetch */}
              <img src={`/admin/social/piece/${p.id}/${i + 1}?v=${r.version}`} alt={`Slide ${i + 1} of ${r.slides.length}`} loading="lazy" className="w-[120px] rounded-lg border border-[var(--admin-line)]" />
              <span className="mt-1 block text-center text-xs text-[var(--admin-soft)]">Download {i + 1}</span>
            </a>
            {p.format === 'feed' ? (
              <a href={`/admin/social/piece/${p.id}/${i + 1}?format=square&download=1`} data-press="slide-square" className="mt-1 flex min-h-[44px] items-center justify-center text-xs text-[var(--admin-soft)] underline">
                Square
              </a>
            ) : null}
          </li>
        ))}
      </ol>
      {p.kind === 'discovery_reel' ? (
        <a href={`/admin/social/piece/${p.id}/reel?download=1&v=${r.version}`} className={`${QUIET} mt-2`} data-press="reel-mp4">
          Download the Reel (MP4)
        </a>
      ) : null}
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
        {(['instagram', 'facebook'] as const).map((platform) => (
          <form key={platform} action={editPieceAction} data-version={platform}>
            <input type="hidden" name="piece" value={p.id} />
            <input type="hidden" name="platform" value={platform} />
            <label className="text-xs uppercase tracking-[0.14em] text-[var(--admin-muted)]" htmlFor={`words-${p.id}-${platform}`}>
              {platform === 'instagram' ? 'Instagram' : 'Facebook'} · {r.versions[platform].crop}
            </label>
            <textarea id={`words-${p.id}-${platform}`} name="caption" rows={7} defaultValue={r.versions[platform].caption} className={`mt-1 ${FIELD}`} />
            <div className="mt-2 flex flex-wrap gap-2">
              <CopyLinkButton url={r.versions[platform].caption} label={`Copy the ${platform === 'instagram' ? 'Instagram' : 'Facebook'} words`} variant="dark" />
              {p.state === 'gone' ? null : (
                <button type="submit" data-press="edit-words" className={QUIET}>
                  Keep my edit
                </button>
              )}
            </div>
          </form>
        ))}
      </div>
      {r.message ? (
        <div className="mt-4" data-message>
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--admin-muted)]">The message to send {p.partnerName}</p>
          <textarea readOnly rows={9} defaultValue={r.message} className={`mt-1 ${FIELD}`} aria-label={`Message to ${p.partnerName}`} />
          <div className="mt-2">
            <CopyLinkButton url={r.message} label="Copy the message" variant="dark" />
          </div>
        </div>
      ) : p.kind === 'partner_kit' ? (
        <p data-message="waiting" className="mt-4 text-sm text-[var(--admin-soft)]">
          The message to {p.partnerName} waits for the project manager&apos;s words in your own voice. Their story card and their own link are ready.
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <a href={p.link} target="_blank" rel="noopener" data-press="open" className={QUIET}>
          Open its page
        </a>
        {p.state === 'drafted' ? (
          <form action={approvePieceAction}>
            <input type="hidden" name="piece" value={p.id} />
            <button type="submit" data-press="approve-piece" className={BUTTON}>
              Check and approve
            </button>
          </form>
        ) : null}
        {p.state === 'approved' ? (
          <form action={recordPieceAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="piece" value={p.id} />
            {p.kind === 'partner_kit' ? (
              <>
                <input type="hidden" name="url" value="sent" />
                <button type="submit" data-press="sent" className={BUTTON}>
                  I sent it
                </button>
              </>
            ) : (
              <>
                <label className="sr-only" htmlFor={`gone-${p.id}`}>
                  The post&apos;s address
                </label>
                <input id={`gone-${p.id}`} name="url" type="url" required placeholder="https://www.instagram.com/p/" className={`${FIELD} max-w-xs`} />
                <button type="submit" data-press="piece-posted" className={BUTTON}>
                  Record it
                </button>
              </>
            )}
          </form>
        ) : null}
        {p.state === 'gone' && p.postUrl ? <span className="text-sm text-[var(--admin-soft)]">{p.postUrl === 'sent' ? 'Sent.' : p.postUrl}</span> : null}
      </div>
      {p.state === 'gone' ? null : (
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {([
            [rejectPieceAction, 'reject-piece', 'Reject', 'Why reject it'],
            [regeneratePieceAction, 'regenerate-piece', 'Regenerate', 'Why regenerate it'],
          ] as const).map(([action, press, label, placeholder]) => (
            <form key={press} action={action} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="piece" value={p.id} />
              <label className="sr-only" htmlFor={`${press}-${p.id}`}>
                {placeholder}
              </label>
              <input id={`${press}-${p.id}`} name="reason" required minLength={3} placeholder={placeholder} className={`${FIELD} max-w-[220px]`} />
              <button type="submit" data-press={press} className={QUIET}>
                {label}
              </button>
            </form>
          ))}
        </div>
      )}
      {p.history.length > 1 || p.decisions.length > 0 ? (
        <details data-history className="mt-3 text-sm text-[var(--admin-soft)]">
          <summary className="cursor-pointer">History</summary>
          <ul className="mt-2 space-y-1">
            {p.history.map((h) => (
              <li key={`v${h.version}`}>
                Version {h.version}: {h.madeBy === 'planner' ? 'planned' : h.madeBy === 'edit' ? 'edited' : 'regenerated'}, {formatPlatformDateTime(h.madeAt)}
              </li>
            ))}
            {p.decisions.map((d) => (
              <li key={`${d.at}${d.decision}`}>
                Version {d.revision}: {d.decision}, &ldquo;{d.reason}&rdquo;
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  )
}

function CampaignSection({ campaign, requests }: { campaign: { weekStart: string; pieces: PieceRow[]; excluded: string[] } | null; requests: { eventTitle: string; hostName: string; message: string | null }[] }) {
  return (
    <section data-section="campaign" className="mb-8">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-[var(--admin-ink)]">This week&apos;s campaign</h2>
        <div className="flex flex-wrap items-center gap-2">
          <form action={planWeekAction}>
            <button type="submit" data-press="plan-campaign" className={QUIET}>
              Plan this week
            </button>
          </form>
          {campaign !== null && campaign.pieces.some((p) => p.state === 'drafted') ? (
            <form action={approveWeekAction}>
              <button type="submit" data-press="approve-week" className={BUTTON}>
                Check and approve every piece waiting
              </button>
            </form>
          ) : null}
        </div>
      </div>
      <p className="mb-4 max-w-2xl text-sm text-[var(--admin-soft)]">
        One campaign a week: the week ahead and the weekend guide for each city, a Discovery Reel, a venue spotlight, the organiser campaign, and a
        partner kit for every organiser featured. Each piece says why each night is in it. A night is always told in original EventLinqs design; an
        image of someone else&apos;s is used only where it is approved below. Nothing is approved until its nights, links, admission, images and
        page are checked again, and nothing goes until you post it.
      </p>
      {campaign === null || campaign.pieces.length === 0 ? (
        <p data-state="no-campaign" className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-6 text-sm text-[var(--admin-soft)]">
          No campaign for this week yet. Plan this week to build it from the published nights.
        </p>
      ) : (
        <ul className="space-y-4">
          {campaign.pieces.map((p) => (
            <Piece key={p.id} p={p} />
          ))}
        </ul>
      )}
      {requests.length === 0 ? null : (
        <div data-section="image-requests" className="mt-6">
          <h3 className="mb-3 font-display text-base font-semibold text-[var(--admin-ink)]">Nights to ask organisers an image for</h3>
          <ul className="space-y-4">
            {/* One ask per show (the admin sweep of 15 November 2026: a weekly night, 'Laugh Lab' at La La Land CBD, was listed
                once per session under one React key, so its organiser would have been asked twice). */}
            {[...new Map(requests.map((q) => [`${q.hostName} | ${q.eventTitle}`, q])).values()].map((q) => (
              <li key={`${q.hostName} | ${q.eventTitle}`} className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-4">
                <p className="text-sm text-[var(--admin-ink)]">
                  {q.eventTitle} <span className="text-[var(--admin-muted)]">· {q.hostName}</span>
                </p>
                {q.message ? (
                  <>
                    <textarea readOnly rows={7} defaultValue={q.message} className={`mt-2 ${FIELD}`} aria-label={`Image request to ${q.hostName}`} />
                    <div className="mt-2">
                      <CopyLinkButton url={q.message} label="Copy the request" variant="dark" />
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-[var(--admin-soft)]">Shown in EventLinqs design until they send an image. The words to ask wait for the project manager&apos;s text in your own voice.</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function RegisterSection({ assets }: { assets: AssetRow[] }) {
  return (
    <section data-section="asset-register" className="mt-10">
      <h2 className="mb-2 font-display text-lg font-semibold text-[var(--admin-ink)]">Images and their rights</h2>
      <p className="mb-4 max-w-2xl text-sm text-[var(--admin-soft)]">
        Talking about a night needs no permission; using someone else&apos;s image does. An image is used only from an approved row here: organiser
        authorised, separately licensed, or a native share of their own post, with its source, rights holder, credit, scope, and any expiry or
        restriction. Being public, credited or redesigned is never permission.
      </p>
      <form action={addAssetAction} className="mb-6 grid grid-cols-1 gap-3 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-4 md:grid-cols-2">
        <label className="text-sm text-[var(--admin-soft)]">
          Its state
          <select name="assetState" defaultValue="organiser_authorised" className={`mt-1 ${FIELD}`}>
            <option value="organiser_authorised">Organiser authorised</option>
            <option value="separately_licensed">Separately licensed</option>
            <option value="native_share">Native share of their own post</option>
          </select>
        </label>
        <label className="text-sm text-[var(--admin-soft)]">
          Its type
          <select name="assetType" defaultValue="photo" className={`mt-1 ${FIELD}`}>
            <option value="photo">Photo</option>
            <option value="artwork">Artwork</option>
            <option value="video">Video</option>
            <option value="post">Their post</option>
          </select>
        </label>
        {([
          ['assetUrl', 'The stored asset, or their post (https)', 'url', true],
          ['sourceUrl', 'Where it came from (https or mailto)', 'text', true],
          ['rightsHolder', 'Who holds the rights', 'text', true],
          ['attributionText', 'The credit it needs', 'text', true],
          ['eventSlug', 'The night it belongs to (its address)', 'text', false],
          ['evidenceFile', 'Where the evidence is kept', 'text', false],
          ['expiresAt', 'Expires on (optional)', 'date', false],
          ['restrictions', 'Restrictions (optional)', 'text', false],
          ['originalFile', 'The original file as they sent it (its name or where it is kept)', 'text', false],
          ['receivedOn', 'The day they sent it', 'date', false],
          ['permittedUses', 'What they allowed it to be used for, in plain words', 'text', false],
          ['focalX', 'Where the subject is across, 0 to 100 (optional)', 'number', false],
          ['focalY', 'Where the subject is down, 0 to 100 (optional)', 'number', false],
          ['leadRank', 'Which leads for its night, 1 first (optional)', 'number', false],
        ] as const).map(([name, label, type, required]) => (
          <label key={name} className="text-sm text-[var(--admin-soft)]">
            {label}
            <input name={name} type={type} required={required} className={`mt-1 ${FIELD}`} />
          </label>
        ))}
        <label className="text-sm text-[var(--admin-soft)] md:col-span-2">
          The permission or licence, in its own words (needed unless it is a native share)
          <textarea name="permissionEvidence" rows={3} className={`mt-1 ${FIELD}`} />
        </label>
        <label className="text-sm text-[var(--admin-soft)]">
          Where it may be used
          <select name="scope" defaultValue="social" className={`mt-1 ${FIELD}`}>
            <option value="social">Social posts</option>
            <option value="site">The site only</option>
            <option value="both">Both</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--admin-soft)]">
          <input name="archival" type="checkbox" value="yes" /> An earlier edition&apos;s image (labelled archival)
        </label>
        <div className="md:col-span-2">
          <button type="submit" data-press="add-asset" className={BUTTON}>
            Keep as pending
          </button>
        </div>
      </form>
      {assets.length === 0 ? (
        <p className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-6 text-sm text-[var(--admin-soft)]">No images recorded yet, so every night is told in original EventLinqs design.</p>
      ) : (
        <ul className="space-y-3">
          {assets.map((a) => (
            <li key={a.id} data-asset={a.id} data-status={a.approvalStatus} className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-4 text-sm text-[var(--admin-ink)]">
              <p className="text-[var(--admin-ink)]">
                {a.eventTitle ?? 'Any night'} · {ASSET_STATE_NAME[a.assetState] ?? a.assetState} · {a.assetType} · {a.rightsHolder} ·{' '}
                <span className="uppercase tracking-[0.12em] text-[var(--admin-soft)]">{a.approvalStatus}</span>
              </p>
              <p className="mt-1">
                Credit: {a.attributionText}. Scope: {a.scope}
                {a.archival ? ', archival' : ''}
                {a.expiresAt ? `, until ${formatPlatformDateTime(a.expiresAt)}` : ''}
                {a.restrictions ? `. Restrictions: ${a.restrictions}` : ''}.
              </p>
              {a.permissionEvidence ? <p className="mt-1 text-[var(--admin-soft)]">&ldquo;{a.permissionEvidence}&rdquo;</p> : null}
              <p className="mt-1 text-[var(--admin-soft)]">
                {a.originalFile ? `Original: ${a.originalFile}. ` : ''}
                {a.receivedOn ? `Received ${a.receivedOn}. ` : ''}
                {a.permittedUses ? `Allowed: ${a.permittedUses} ` : ''}
                {a.size ? `${a.size.width} by ${a.size.height} pixels.` : ''}
              </p>
              {a.withdrawalStatus !== 'current' ? (
                <p className="mt-1 text-[var(--admin-ink)]" data-withdrawn={a.withdrawalStatus}>
                  {a.withdrawalStatus === 'withdrawn' ? 'Withdrawn' : 'Replaced'}: {a.withdrawalReason}. Used for nothing.
                </p>
              ) : (
                <form action={withdrawAssetAction} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="asset" value={a.id} />
                  <label className="text-xs text-[var(--admin-soft)]">
                    Why it is withdrawn
                    <input name="reason" required minLength={3} className={`mt-1 ${FIELD}`} />
                  </label>
                  <label className="text-xs text-[var(--admin-soft)]">
                    Replaced by (optional)
                    <select name="replacement" defaultValue="" className={`mt-1 ${FIELD}`}>
                      <option value="">Not replaced</option>
                      {assets
                        .filter((o) => o.id !== a.id && o.eventId === a.eventId && o.withdrawalStatus === 'current')
                        .map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.attributionText}, {o.assetUrl.split('/').pop()}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button type="submit" data-press="asset-withdraw" className={QUIET}>
                    Withdraw
                  </button>
                </form>
              )}
              {a.approvalStatus === 'pending' ? (
                <div className="mt-3 flex gap-2">
                  {(['approved', 'refused'] as const).map((d) => (
                    <form key={d} action={decideAssetAction}>
                      <input type="hidden" name="asset" value={a.id} />
                      <input type="hidden" name="decision" value={d} />
                      <button type="submit" data-press={`asset-${d}`} className={d === 'approved' ? BUTTON : QUIET}>
                        {d === 'approved' ? 'Approve' : 'Refuse'}
                      </button>
                    </form>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/*
 * Every image a public night shows, with its rights (Lawal's master mandate of 29 October 2026, section 5). The
 * database derives the rows; this says what needs the founder: an image whose rights are not on record, or a library
 * photograph standing on a night it is not of.
 */
const RIGHTS_WORDS = { platform_library: 'Library photograph, not of this night', unrecorded: 'Rights not on record' } as const

/**
 * WHERE THE WEEK POSTS (the PM's 20:50 of 17 November 2026, item 3): the Facebook Page and the Instagram account the
 * publisher would post to, read from Blotato with this deployment's own key at each visit, before Approve week.
 */
function TargetsSection({ targets }: { targets: BlotatoTargets }) {
  return (
    <section data-section="posts-to" className="mb-8 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-6">
      <h2 className="font-display text-lg font-semibold text-[var(--admin-ink)]">Where the week posts</h2>
      {targets.state === 'no-key' ? (
        <p data-state="no-key" className="mt-2 text-sm text-[var(--admin-soft)]">
          This deployment holds no Blotato key, so nothing can post. A key stored in Vercel takes effect with the next deploy.
        </p>
      ) : targets.state === 'failed' ? (
        <p data-state="failed" className="mt-2 text-sm text-[var(--admin-soft)]">
          Blotato could not be read just now: {targets.words}
        </p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
            <dt className="text-[var(--admin-soft)]">Facebook Page</dt>
            <dd data-posts-to="facebook" className="font-semibold text-[var(--admin-ink)]">
              {targets.postsTo.facebook ?? 'None the publisher would use'}
            </dd>
            <dt className="text-[var(--admin-soft)]">Instagram</dt>
            <dd data-posts-to="instagram" className="font-semibold text-[var(--admin-ink)]">
              {targets.postsTo.instagram ?? 'None connected'}
            </dd>
          </dl>
          {targets.refusal === null ? null : (
            <p data-state="refusal" className="mt-3 text-sm text-[var(--admin-ink)]">
              {targets.refusal}
            </p>
          )}
          <details className="mt-4 text-xs text-[var(--admin-soft)]">
            <summary className="cursor-pointer">
              What Blotato holds: {targets.accounts.length} account{targets.accounts.length === 1 ? '' : 's'}
              {targets.facebookPages === null ? '' : `, ${targets.facebookPages.length} Facebook Page${targets.facebookPages.length === 1 ? '' : 's'}`}
            </summary>
            <ul className="mt-2 space-y-1">
              {[...targets.accounts, ...(targets.facebookPages ?? [])].map((t, i) => (
                <li key={`${i}|${t.platform}|${t.id}`} data-blotato={t.platform}>
                  {t.platform}: {t.fields || t.label}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  )
}

function ImageRightsSection({ report }: { report: ImageRightsReport }) {
  return (
    <section data-section="image-rights" className="mb-8 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-6">
      <h2 className="font-display text-lg font-semibold text-[var(--admin-ink)]">Images on public nights</h2>
      <p data-image-rights-line className="mt-2 text-sm text-[var(--admin-ink)]">
        {imageRightsLine(report.counts)}
      </p>
      {report.exceptionsTotal === 0 ? null : (
        <>
          <p className="mt-4 text-sm text-[var(--admin-soft)]">
            {report.exceptions.length < report.exceptionsTotal
              ? `The first ${report.exceptions.length} of ${report.exceptionsTotal}, soonest night first.`
              : `All ${report.exceptionsTotal}, soonest night first.`}{' '}
            Each one is replaced by its typographic cover, or kept once its owner&apos;s permission is recorded in the media register above.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {report.exceptions.map((e, i) => (
              <li key={`${i}|${e.slug}|${e.role}`} data-image-exception={e.state} className="text-[var(--admin-ink)]">
                <a href={`/events/${e.slug}`} className="font-semibold text-[var(--admin-ink)] underline-offset-2 hover:underline">
                  {e.title}
                </a>{' '}
                <span className="text-[var(--admin-soft)]">
                  ({e.role}): {RIGHTS_WORDS[e.state as keyof typeof RIGHTS_WORDS] ?? e.state}. {e.provenance}.
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

export default async function AdminSocialPage({ searchParams }: { searchParams: Promise<{ said?: string }> }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.social.view', session })
  const { said } = await searchParams

  const db = createAdminClient()
  const now = new Date()
  const posts = await readPosts(db, now)
  const [campaign, requests, assets, imageRights, targets] = await Promise.all([
    readCampaign(db, now),
    readImageRequests(db, now),
    readAssets(db),
    readImageRights(db),
    readBlotatoTargets(process.env),
  ])
  const rules = await Promise.all(
    (['feed', 'story'] as const).map(async (format) => {
      const rule = await cadenceFor(db, 'instagram', format, now)
      return { format, rule, next: nextAllowed(rule, await lastPosted(db, 'instagram', format), now) }
    }),
  )
  const gone = posts.filter((p) => p.postedAt !== null).sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''))
  const waiting = posts.filter((p) => p.postedAt === null).sort((a, b) => a.eventStart.localeCompare(b.eventStart) || a.format.localeCompare(b.format))
  const total = gone.reduce(
    (t, p) => ({ tickets: t.tickets + p.result.tickets, cents: t.cents + p.result.cents, arrived: t.arrived + p.result.arrived, pressedOut: t.pressedOut + p.result.pressedOut }),
    { tickets: 0, cents: 0, arrived: 0, pressedOut: 0 },
  )
  const cities = [...new Set(waiting.map((p) => p.city ?? 'Elsewhere'))]

  return (
    <div>
      <header className="mb-8">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-[var(--admin-muted)]">Growth</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Social posts</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--admin-soft)]">
          Our own Instagram posts: this week&apos;s campaign, and one feed card and one story for each night, made from the night&apos;s own details,
          with a photo only where its rights are approved. Each carries its own link, so the tickets it sells and the people it sends are counted as
          its own.
        </p>
      </header>

      {said === undefined ? null : (
        <p role="status" data-said className="mb-6 max-w-2xl rounded-lg border border-[var(--admin-line)] bg-[var(--admin-tint)] p-4 text-sm text-[var(--admin-ink)]">
          {said}
        </p>
      )}

      <TargetsSection targets={targets} />

      <CampaignSection campaign={campaign} requests={requests} />

      <ImageRightsSection report={imageRights} />

      <section data-section="brought" className="mb-8 rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-6">
        <h2 className="font-display text-lg font-semibold text-[var(--admin-ink)]">What our posts brought</h2>
        {gone.length === 0 ? (
          <p data-state="none-gone" className="mt-2 text-sm text-[var(--admin-soft)]">
            No post has gone yet, so nothing is counted. The first one you record starts the count.
          </p>
        ) : (
          <p data-total className="mt-2 text-sm text-[var(--admin-ink)]">
            {total.tickets} ticket{total.tickets === 1 ? '' : 's'} sold, {money(total.cents)}, from {gone.length} post{gone.length === 1 ? '' : 's'}.{' '}
            <span className="text-[var(--admin-soft)]">
              {total.arrived} arrivals through them and {total.pressedOut} presses on to book with the organiser.
            </span>
          </p>
        )}
        <ul className="mt-4 space-y-1 text-sm text-[var(--admin-soft)]">
          {rules.map((r) => (
            <li key={r.format} data-rule={r.format} data-basis={r.rule.basis}>
              {ruleLine(r.format, r.rule, r.next, now)}
            </li>
          ))}
        </ul>
      </section>

      <section data-section="to-post" className="mb-8">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-[var(--admin-ink)]">To post this week</h2>
          <form action={planWeekAction}>
            <button type="submit" data-press="plan" className={QUIET}>
              Plan this week&apos;s posts
            </button>
          </form>
        </div>
        {waiting.length === 0 ? (
          <p data-state="none-waiting" className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-6 text-sm text-[var(--admin-soft)]">
            Nothing is waiting. Plan this week&apos;s posts to make one for every published night in the next seven days.
          </p>
        ) : (
          cities.map((city) => (
            <div key={city} data-city={city} className="mb-6">
              <h3 className="mb-3 text-[11px] uppercase tracking-[0.18em] text-[var(--admin-muted)]">{city}</h3>
              <ul className="space-y-4">
                {waiting
                  .filter((p) => (p.city ?? 'Elsewhere') === city)
                  .map((p) => (
                    <Post key={p.id} p={p} />
                  ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section data-section="gone">
        <h2 className="mb-4 font-display text-lg font-semibold text-[var(--admin-ink)]">Gone, and what each brought</h2>
        {gone.length === 0 ? (
          <p className="rounded-xl border border-[var(--admin-line)] bg-[var(--admin-paper)] p-6 text-sm text-[var(--admin-soft)]">None yet.</p>
        ) : (
          <ul className="space-y-4">
            {gone.map((p) => (
              <Post key={p.id} p={p} />
            ))}
          </ul>
        )}
      </section>

      <RegisterSection assets={assets} />
    </div>
  )
}
