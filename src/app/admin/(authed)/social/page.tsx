import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/lib/admin/auth'
import { can } from '@/lib/admin/rbac'
import { recordAuditEvent } from '@/lib/admin/audit'
import { createAdminClient } from '@/lib/supabase/admin'
import { formatPlatformDateTime } from '@/lib/dates/event-time'
import { cadenceFor, lastPosted, readAssets, readCampaign, readImageRequests, readPosts, type AssetRow, type PieceRow, type PostRow } from '@/lib/social/store'
import { CopyLinkButton } from '@/components/launch-kit/copy-link-button'
import { FORMAT_NAME, cadenceLine, nextAllowed, type CadenceRule, type SocialFormat } from '@/lib/social/cadence'
import {
  addAssetAction,
  approveAction,
  approvePieceAction,
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
  'inline-flex min-h-[44px] items-center rounded-full border border-white/15 px-5 text-sm font-semibold text-white/70 hover:border-white/40 hover:text-white'
const FIELD = 'block w-full rounded-lg border border-white/[0.08] bg-white/[0.02] p-3 text-[13px] text-white'

const money = (cents: number): string => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(cents / 100)

function ruleLine(format: SocialFormat, rule: CadenceRule, next: Date, now: Date): string {
  const when = next.getTime() <= now.getTime() ? 'one may go now' : `the next may go ${formatPlatformDateTime(next.toISOString())}`
  return cadenceLine(format, rule, when)
}

function Results({ r }: { r: PostRow['result'] }) {
  return (
    <p className="text-sm text-white/70" data-result>
      {r.tickets} ticket{r.tickets === 1 ? '' : 's'}, {money(r.cents)}. {r.arrived} arrived, {r.pressedOut} pressed out to book.
    </p>
  )
}

function Post({ p }: { p: PostRow }) {
  const card = `/admin/social/card/${p.id}`
  return (
    <li data-post={p.id} data-format={p.format} className="grid grid-cols-1 gap-4 rounded-xl border border-white/[0.08] bg-[#131A2A] p-4 md:grid-cols-[180px_minmax(0,1fr)]">
      {/* eslint-disable-next-line @next/next/no-img-element -- a staff preview of a rendered card, never a public image */}
      <img src={card} alt={`${FORMAT_NAME[p.format].one} for ${p.eventTitle}`} loading="lazy" className="w-full max-w-[180px] rounded-lg border border-white/[0.08]" />
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.18em] text-white/50">
          Instagram {FORMAT_NAME[p.format].one.toLowerCase()}, {formatPlatformDateTime(p.eventStart)}
        </p>
        <h3 className="mt-1 font-display text-base font-semibold text-white">{p.eventTitle}</h3>
        {p.draft === null ? (
          <p data-state="no-words" className="mt-2 text-sm text-white/70">
            No words are kept for this post yet. Write them below.
          </p>
        ) : null}
        {p.postedAt === null ? (
          <>
            <form action={writeWordsAction} className="mt-3">
              <input type="hidden" name="post" value={p.id} />
              <label className="text-[11px] uppercase tracking-[0.18em] text-white/50" htmlFor={`words-${p.id}`}>
                The words{p.draft === null ? '' : `, version ${p.draft.version}${p.draft.writtenBy === 'kit' ? ', the Launch Kit’s' : ', yours'}`}
              </label>
              <textarea id={`words-${p.id}`} name="caption" data-words defaultValue={p.draft?.caption ?? `\n\n${p.link}`} rows={9} className={`mt-1 ${FIELD}`} />
              <p className="mt-1 text-xs text-white/50">Keep the link {p.link}. Every number must be one the listing holds.</p>
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
                <label className="min-w-0 flex-1 text-sm text-white/70">
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
            <p className="text-sm text-white/70">
              Went {formatPlatformDateTime(p.postedAt)}.{' '}
              {p.postUrl === null ? null : (
                <a href={p.postUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-white/30 underline-offset-4 hover:decoration-white">
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
}
const AUDIENCE_NAME: Record<PieceRow['audience'], string> = { attendees: 'Attendees', organisers: 'Organisers and promoters', venues: 'Venues', partners: 'Community partners' }
const OBJECTIVE_NAME: Record<PieceRow['objective'], string> = { audience_growth: 'Audience growth', organiser_growth: 'Organiser growth' }
const MODE_NAME: Record<PieceRow['revision']['mode'], string> = { photo_led: 'Photo led, with an approved image', graphic_led: 'Graphic led, original EventLinqs design', type_led: 'Type led, original EventLinqs design' }
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
    <li data-piece={p.id} data-kind={p.kind} data-state={p.state} data-version={r.version} className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-semibold text-white">
          {KIND_NAME[p.kind]}
          {p.partnerName ? `: ${p.partnerName}` : ''} <span className="text-white/50">· {p.city}</span>
        </h3>
        <span className="text-xs uppercase tracking-[0.14em] text-white/60">
          {STATE_NAME[p.state]} · version {r.version}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-[150px_minmax(0,1fr)]">
        <dt className="text-white/50">Audience</dt>
        <dd data-audience className="text-white">{AUDIENCE_NAME[p.audience]}</dd>
        <dt className="text-white/50">Objective</dt>
        <dd data-objective className="text-white">{OBJECTIVE_NAME[p.objective]}</dd>
        <dt className="text-white/50">Purpose</dt>
        <dd className="text-white">{p.purpose}</dd>
        <dt className="text-white/50">Call to action</dt>
        <dd className="text-white">{p.nextStep}</dd>
        <dt className="text-white/50">Measured by</dt>
        <dd className="text-white">{p.outcome}</dd>
        <dt className="text-white/50">Look</dt>
        <dd data-mode={r.mode} className="text-white">{MODE_NAME[r.mode]}</dd>
      </dl>
      {r.picks.length === 0 ? null : (
        <div data-picks className="mt-3">
          <p className="text-xs uppercase tracking-[0.14em] text-white/50">Why each night is in it</p>
          <ul className="mt-1 space-y-2">
            {r.picks.map((pick) => (
              <li key={pick.eventId} data-pick={pick.eventId} className="flex flex-wrap items-center justify-between gap-2 text-sm text-white/80">
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
              <img src={`/admin/social/piece/${p.id}/${i + 1}?v=${r.version}`} alt={`Slide ${i + 1} of ${r.slides.length}`} loading="lazy" className="w-[120px] rounded-lg border border-white/[0.08]" />
              <span className="mt-1 block text-center text-xs text-white/60">Download {i + 1}</span>
            </a>
          </li>
        ))}
      </ol>
      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
        {(['instagram', 'facebook'] as const).map((platform) => (
          <form key={platform} action={editPieceAction} data-version={platform}>
            <input type="hidden" name="piece" value={p.id} />
            <input type="hidden" name="platform" value={platform} />
            <label className="text-xs uppercase tracking-[0.14em] text-white/50" htmlFor={`words-${p.id}-${platform}`}>
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
          <p className="text-xs uppercase tracking-[0.14em] text-white/50">The message to send {p.partnerName}</p>
          <textarea readOnly rows={9} defaultValue={r.message} className={`mt-1 ${FIELD}`} aria-label={`Message to ${p.partnerName}`} />
          <div className="mt-2">
            <CopyLinkButton url={r.message} label="Copy the message" variant="dark" />
          </div>
        </div>
      ) : p.kind === 'partner_kit' ? (
        <p data-message="waiting" className="mt-4 text-sm text-white/60">
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
        {p.state === 'gone' && p.postUrl ? <span className="text-sm text-white/70">{p.postUrl === 'sent' ? 'Sent.' : p.postUrl}</span> : null}
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
        <details data-history className="mt-3 text-sm text-white/60">
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
        <h2 className="font-display text-lg font-semibold text-white">This week&apos;s campaign</h2>
        <form action={planWeekAction}>
          <button type="submit" data-press="plan-campaign" className={QUIET}>
            Plan this week
          </button>
        </form>
      </div>
      <p className="mb-4 max-w-2xl text-sm text-white/60">
        One campaign a week: the week ahead and the weekend guide for each city, a Discovery Reel, a venue spotlight, the organiser campaign, and a
        partner kit for every organiser featured. Each piece says why each night is in it. A night is always told in original EventLinqs design; an
        image of someone else&apos;s is used only where it is approved below. Nothing is approved until its nights, links, admission, images and
        page are checked again, and nothing goes until you post it.
      </p>
      {campaign === null || campaign.pieces.length === 0 ? (
        <p data-state="no-campaign" className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6 text-sm text-white/70">
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
          <h3 className="mb-3 font-display text-base font-semibold text-white">Nights to ask organisers an image for</h3>
          <ul className="space-y-4">
            {requests.map((q) => (
              <li key={`${q.hostName}${q.eventTitle}`} className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-4">
                <p className="text-sm text-white">
                  {q.eventTitle} <span className="text-white/50">· {q.hostName}</span>
                </p>
                {q.message ? (
                  <>
                    <textarea readOnly rows={7} defaultValue={q.message} className={`mt-2 ${FIELD}`} aria-label={`Image request to ${q.hostName}`} />
                    <div className="mt-2">
                      <CopyLinkButton url={q.message} label="Copy the request" variant="dark" />
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-white/60">Shown in EventLinqs design until they send an image. The words to ask wait for the project manager&apos;s text in your own voice.</p>
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
      <h2 className="mb-2 font-display text-lg font-semibold text-white">Images and their rights</h2>
      <p className="mb-4 max-w-2xl text-sm text-white/60">
        Talking about a night needs no permission; using someone else&apos;s image does. An image is used only from an approved row here: organiser
        authorised, separately licensed, or a native share of their own post, with its source, rights holder, credit, scope, and any expiry or
        restriction. Being public, credited or redesigned is never permission.
      </p>
      <form action={addAssetAction} className="mb-6 grid grid-cols-1 gap-3 rounded-xl border border-white/[0.08] bg-[#131A2A] p-4 md:grid-cols-2">
        <label className="text-sm text-white/70">
          Its state
          <select name="assetState" defaultValue="organiser_authorised" className={`mt-1 ${FIELD}`}>
            <option value="organiser_authorised">Organiser authorised</option>
            <option value="separately_licensed">Separately licensed</option>
            <option value="native_share">Native share of their own post</option>
          </select>
        </label>
        <label className="text-sm text-white/70">
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
        ] as const).map(([name, label, type, required]) => (
          <label key={name} className="text-sm text-white/70">
            {label}
            <input name={name} type={type} required={required} className={`mt-1 ${FIELD}`} />
          </label>
        ))}
        <label className="text-sm text-white/70 md:col-span-2">
          The permission or licence, in its own words (needed unless it is a native share)
          <textarea name="permissionEvidence" rows={3} className={`mt-1 ${FIELD}`} />
        </label>
        <label className="text-sm text-white/70">
          Where it may be used
          <select name="scope" defaultValue="social" className={`mt-1 ${FIELD}`}>
            <option value="social">Social posts</option>
            <option value="site">The site only</option>
            <option value="both">Both</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input name="archival" type="checkbox" value="yes" /> An earlier edition&apos;s image (labelled archival)
        </label>
        <div className="md:col-span-2">
          <button type="submit" data-press="add-asset" className={BUTTON}>
            Keep as pending
          </button>
        </div>
      </form>
      {assets.length === 0 ? (
        <p className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6 text-sm text-white/70">No images recorded yet, so every night is told in original EventLinqs design.</p>
      ) : (
        <ul className="space-y-3">
          {assets.map((a) => (
            <li key={a.id} data-asset={a.id} data-status={a.approvalStatus} className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-4 text-sm text-white/80">
              <p className="text-white">
                {a.eventTitle ?? 'Any night'} · {ASSET_STATE_NAME[a.assetState] ?? a.assetState} · {a.assetType} · {a.rightsHolder} ·{' '}
                <span className="uppercase tracking-[0.12em] text-white/60">{a.approvalStatus}</span>
              </p>
              <p className="mt-1">
                Credit: {a.attributionText}. Scope: {a.scope}
                {a.archival ? ', archival' : ''}
                {a.expiresAt ? `, until ${formatPlatformDateTime(a.expiresAt)}` : ''}
                {a.restrictions ? `. Restrictions: ${a.restrictions}` : ''}.
              </p>
              {a.permissionEvidence ? <p className="mt-1 text-white/60">&ldquo;{a.permissionEvidence}&rdquo;</p> : null}
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

export default async function AdminSocialPage({ searchParams }: { searchParams: Promise<{ said?: string }> }) {
  const session = await requireAdminSession()
  if (!can(session, 'admin.network.manage')) redirect('/admin')
  await recordAuditEvent({ action: 'admin.social.view', session })
  const { said } = await searchParams

  const db = createAdminClient()
  const now = new Date()
  const posts = await readPosts(db, now)
  const [campaign, requests, assets] = await Promise.all([readCampaign(db, now), readImageRequests(db, now), readAssets(db)])
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
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-white/50">Growth</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Social posts</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/60">
          Our own Instagram posts: this week&apos;s campaign, and one feed card and one story for each night, made from the night&apos;s own details,
          with a photo only where its rights are approved. Each carries its own link, so the tickets it sells and the people it sends are counted as
          its own.
        </p>
      </header>

      {said === undefined ? null : (
        <p role="status" data-said className="mb-6 max-w-2xl rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 text-sm text-white">
          {said}
        </p>
      )}

      <CampaignSection campaign={campaign} requests={requests} />

      <section data-section="brought" className="mb-8 rounded-xl border border-white/[0.08] bg-[#131A2A] p-6">
        <h2 className="font-display text-lg font-semibold text-white">What our posts brought</h2>
        {gone.length === 0 ? (
          <p data-state="none-gone" className="mt-2 text-sm text-white/70">
            No post has gone yet, so nothing is counted. The first one you record starts the count.
          </p>
        ) : (
          <p data-total className="mt-2 text-sm text-white">
            {total.tickets} ticket{total.tickets === 1 ? '' : 's'} sold, {money(total.cents)}, from {gone.length} post{gone.length === 1 ? '' : 's'}.{' '}
            <span className="text-white/70">
              {total.arrived} people arrived through them and {total.pressedOut} pressed on to book with the organiser.
            </span>
          </p>
        )}
        <ul className="mt-4 space-y-1 text-sm text-white/60">
          {rules.map((r) => (
            <li key={r.format} data-rule={r.format} data-basis={r.rule.basis}>
              {ruleLine(r.format, r.rule, r.next, now)}
            </li>
          ))}
        </ul>
      </section>

      <section data-section="to-post" className="mb-8">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-white">To post this week</h2>
          <form action={planWeekAction}>
            <button type="submit" data-press="plan" className={QUIET}>
              Plan this week&apos;s posts
            </button>
          </form>
        </div>
        {waiting.length === 0 ? (
          <p data-state="none-waiting" className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6 text-sm text-white/70">
            Nothing is waiting. Plan this week&apos;s posts to make one for every published night in the next seven days.
          </p>
        ) : (
          cities.map((city) => (
            <div key={city} data-city={city} className="mb-6">
              <h3 className="mb-3 text-[11px] uppercase tracking-[0.18em] text-white/50">{city}</h3>
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
        <h2 className="mb-4 font-display text-lg font-semibold text-white">Gone, and what each brought</h2>
        {gone.length === 0 ? (
          <p className="rounded-xl border border-white/[0.08] bg-[#131A2A] p-6 text-sm text-white/70">None yet.</p>
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
