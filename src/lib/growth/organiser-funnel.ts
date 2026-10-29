import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { readOrThrow } from '@/lib/supabase/read-or-throw'
import { readEveryRow } from '@/lib/supabase/read-every-row'
import { PUBLIC_EVENT_MATCH } from '@/lib/events/public-visibility'
import { listingWindowOrPredicate } from '@/lib/events/listing-window'
import { PLATFORM_TIME_ZONE } from '@/lib/dates/event-time'
import { LISTINGS_ORGANISATION_SLUG } from '@/lib/listings/shown-organiser'
import { eventsPerActiveOrganiser, funnelOf, monthOf, type FunnelStage, type FunnelStep, type MonthFigure, type OrganiserNight } from './organiser-funnel-math'

/**
 * The organiser funnel and events per active organiser, read from the tables each stage's owner keeps (the rules are in
 * ./organiser-funnel-math.ts), for /admin/growth. Read only.
 *
 * WHO IS AT EACH STAGE, by its owner's own table:
 *   found        window 6's organisers, one row per real host
 *   qualified    a contact of theirs whose lawful basis is recorded (organiser_contacts.basis_recorded_at)
 *   invited      a message sent to a contact of theirs (outreach_touches.sent_at)
 *   claimed      their organisers.organisation_id, which a verified listing claim sets
 *   yes          a permission their organisation gave and has not withdrawn (organiser_permissions, window 2's claim)
 *   photos       an approved, current image under that permission (social_assets, window 3's register)
 *   publishing   a public night of their organisation in the next 90 days
 *   reported     an after-the-night report sent to them in the last 30 days: message 8 on outreach_touches, or one
 *                sent by hand (organiser_night_reports.sent_at)
 * Each stage counts the organisers recorded at it, so an organiser who claimed without an invitation counts at
 * claimed and not at invited, and a step can read over 100 percent. A table not on this database is NOT COUNTED.
 *
 * EVENTS PER ACTIVE ORGANISER counts organisations that hold their own nights: the EventLinqs listings account, which
 * holds every curated night whatever its host, and seed listings are left out, and the page says so.
 */

type Admin = ReturnType<typeof createAdminClient>

const PUBLISHING_DAYS = 90
const REPORTED_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
/** The months shown: this one and the three before it. */
const MONTHS_SHOWN = 4

const isNotLanded = (message: string) => /PGRST205|42P01|Could not find the table|does not exist/i.test(message)

/** What a read returns, or null when its table is not on this database. */
async function stage<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (isNotLanded(message)) return null
    throw err
  }
}

export interface OrganiserFunnel {
  readonly steps: FunnelStep[]
  readonly months: MonthFigure[]
  readonly readAt: string
}

async function readOrganisers(admin: Admin) {
  return readEveryRow<{ id: string; organisation_id: string | null }>('the organisers', (f, t) =>
    admin.from('organisers').select('id, organisation_id').order('id', { ascending: true }).range(f, t),
  )
}

async function readContacts(admin: Admin) {
  return readEveryRow<{ id: string; organiser_id: string; basis_recorded_at: string | null }>('the organiser contacts', (f, t) =>
    admin.from('organiser_contacts').select('id, organiser_id, basis_recorded_at').order('id', { ascending: true }).range(f, t),
  )
}

/** The organisers whose organisation is in the set. */
function byOrganisation(organisers: readonly { id: string; organisation_id: string | null }[], orgs: ReadonlySet<string>): Set<string> {
  return new Set(organisers.filter((o) => o.organisation_id !== null && orgs.has(o.organisation_id)).map((o) => o.id))
}

export async function readOrganiserFunnel(now: Date = new Date()): Promise<OrganiserFunnel> {
  const admin = createAdminClient()
  const nowIso = now.toISOString()

  const organisers = await stage(() => readOrganisers(admin))
  const organiserRows = organisers ?? []
  const contacts = await stage(() => readContacts(admin))
  const contactRows = contacts ?? []
  const organiserOfContact = new Map(contactRows.map((c) => [c.id, c.organiser_id]))

  const reached: Record<FunnelStage, Set<string> | null> = {
    found: organisers === null ? null : new Set(organiserRows.map((o) => o.id)),
    qualified: contacts === null ? null : new Set(contactRows.filter((c) => c.basis_recorded_at !== null).map((c) => c.organiser_id)),
    invited: contacts === null ? null : await stage(async () => {
      const sent = await readEveryRow<{ id: string; contact_id: string }>('the sent messages', (f, t) =>
        admin.from('outreach_touches').select('id, contact_id').not('sent_at', 'is', null).order('id', { ascending: true }).range(f, t),
      )
      return new Set(sent.flatMap((s) => (organiserOfContact.has(s.contact_id) ? [organiserOfContact.get(s.contact_id) as string] : [])))
    }),
    claimed: organisers === null ? null : new Set(organiserRows.filter((o) => o.organisation_id !== null).map((o) => o.id)),
    yes: organisers === null ? null : await stage(async () => {
      const given = await readEveryRow<{ id: string; organisation_id: string | null }>('the permissions given', (f, t) =>
        admin.from('organiser_permissions').select('id, organisation_id').is('withdrawn_at', null).not('organisation_id', 'is', null).order('id', { ascending: true }).range(f, t),
      )
      return byOrganisation(organiserRows, new Set(given.flatMap((p) => (p.organisation_id ? [p.organisation_id] : []))))
    }),
    photos: organisers === null ? null : await stage(async () => {
      const assets = await readEveryRow<{ id: string; permission_id: string | null }>('the approved photos', (f, t) =>
        admin
          .from('social_assets')
          .select('id, permission_id')
          .eq('approval_status', 'approved')
          .eq('withdrawal_status', 'current')
          .not('permission_id', 'is', null)
          .order('id', { ascending: true })
          .range(f, t),
      )
      const permissionIds = [...new Set(assets.flatMap((a) => (a.permission_id ? [a.permission_id] : [])))]
      if (permissionIds.length === 0) return new Set<string>()
      const permissions = await readOrThrow('the permissions behind the photos', () =>
        admin.from('organiser_permissions').select('id, organisation_id').in('id', permissionIds).limit(permissionIds.length),
      )
      return byOrganisation(organiserRows, new Set((permissions ?? []).flatMap((p) => (p.organisation_id ? [p.organisation_id] : []))))
    }),
    publishing: organisers === null ? null : await stage(async () => {
      const until = new Date(now.getTime() + PUBLISHING_DAYS * DAY_MS).toISOString()
      const nights = await readEveryRow<{ id: string; organisation_id: string }>('the nights in the next 90 days', (f, t) =>
        admin.from('events').select('id, organisation_id').match(PUBLIC_EVENT_MATCH).or(listingWindowOrPredicate(now)).lte('start_date', until).order('id', { ascending: true }).range(f, t),
      )
      return byOrganisation(organiserRows, new Set(nights.map((n) => n.organisation_id)))
    }),
    reported: organisers === null ? null : await stage(async () => {
      const since = new Date(now.getTime() - REPORTED_DAYS * DAY_MS).toISOString()
      const sent = await readEveryRow<{ id: string; contact_id: string }>('the reports sent as message 8', (f, t) =>
        admin.from('outreach_touches').select('id, contact_id').not('night_report_id', 'is', null).gte('sent_at', since).order('id', { ascending: true }).range(f, t),
      )
      const byHand = await readEveryRow<{ id: string; organisation_id: string }>('the reports sent by hand', (f, t) =>
        admin.from('organiser_night_reports').select('id, organisation_id').gte('sent_at', since).order('id', { ascending: true }).range(f, t),
      )
      const ids = byOrganisation(organiserRows, new Set(byHand.map((r) => r.organisation_id)))
      for (const s of sent) {
        const who = organiserOfContact.get(s.contact_id)
        if (who) ids.add(who)
      }
      return ids
    }),
  }

  const counts = Object.fromEntries(Object.entries(reached).map(([k, v]) => [k, v === null ? null : v.size])) as Record<FunnelStage, number | null>

  // Events per active organiser: this month and the three before it, on the platform's clock.
  // The months by YYYY-MM arithmetic on this month as the platform's clock reads it; no date is built in UTC.
  const [year, month] = monthOf(nowIso, PLATFORM_TIME_ZONE).split('-').map(Number)
  const months: string[] = []
  for (let i = MONTHS_SHOWN - 1; i >= 0; i -= 1) {
    const index = year * 12 + (month - 1) - i
    months.push(`${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`)
  }
  // Read from a day before the earliest month can begin in any zone; each night is then placed in its month.
  const from = new Date(now.getTime() - (MONTHS_SHOWN * 31 + 1) * DAY_MS)
  const listings = await readOrThrow('the listings account', () => admin.from('organisations').select('id').eq('slug', LISTINGS_ORGANISATION_SLUG).limit(1))
  const listingsId = listings?.[0]?.id ?? null
  const monthNights = await readEveryRow<{ id: string; organisation_id: string; start_date: string; is_seed_data: boolean | null }>('the nights of the months shown', (f, t) =>
    admin
      .from('events')
      .select('id, organisation_id, start_date, is_seed_data')
      .match(PUBLIC_EVENT_MATCH)
      .gte('start_date', from.toISOString())
      .lte('start_date', nowIso)
      .order('id', { ascending: true })
      .range(f, t),
  )
  const nights: OrganiserNight[] = monthNights
    .filter((n) => n.organisation_id !== listingsId && n.is_seed_data !== true)
    .map((n) => ({ organiser: n.organisation_id, startDate: n.start_date, isPublic: true }))

  return { steps: funnelOf(counts), months: eventsPerActiveOrganiser(nights, months, PLATFORM_TIME_ZONE), readAt: nowIso }
}
