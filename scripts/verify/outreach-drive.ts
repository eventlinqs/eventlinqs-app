/**
 * THE OUTREACH DRIVE ON TEST, END TO END, IN TEST MODE (window 6, 28 October 2026).
 *
 *   load C:\dev\EventLinqs\eventlinqs-app\.env.local (TEST), then
 *   scripts\ops\with-supabase-token.ps1 npx tsx scripts/verify/outreach-drive.ts
 *
 * TEST ONLY: the Supabase URL must name the TEST ref, and the cleanup runs through the Management API against that ref
 * alone. NOTHING LEAVES: the sender is in test mode with no Graph credentials, so the transport is the recorded sink,
 * and the drive's only contact is at the test domain.
 *
 * One organiser with a real curated venue and a whole basis; a play approved over the stored templates; then the real
 * planner, sender and reply handler: message 1 drafted from verified facts and sent; their yes logged and message 5
 * sent in their thread; their stop suppressed at once with one confirmation; the one-click link finding it done. Every
 * row the drive made is then removed (the append-only triggers are disabled for the cleanup statement only) and TEST is
 * read back as found.
 */
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { planDms, planPlays, planRelationship } from '@/lib/outreach/planner'
import { clearRecordedOutreachMail, recordedOutreachMail, runOutreachSender } from '@/lib/outreach/sender'
import { handleInbox } from '@/lib/outreach/replies'

const TEST_REF = 'vkapkibzokmfaxqogypq'
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const token = process.env.SUPABASE_ACCESS_TOKEN ?? ''
if (!url.includes(TEST_REF)) throw new Error(`refused: the drive runs on TEST (${TEST_REF}) only`)
if (!key || !token) throw new Error('the drive needs the TEST service key and the Supabase access token')
const db = createClient<Database>(url, key, { auth: { persistSession: false } })
const ORIGIN = 'https://www.eventlinqs.com.au'
const ADDRESS = 'w6-drive@eventlinqs.com'

async function sql(query: string): Promise<unknown> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${TEST_REF}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const body = await r.text()
  if (!r.ok) throw new Error(`TEST sql ${r.status}: ${body.slice(0, 400)}`)
  return JSON.parse(body)
}

const checks: string[] = []
let failures = 0
function check(label: string, ok: boolean, detail = '') {
  checks.push(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`)
  if (!ok) failures++
}

/** The next weekday at 10:00 in Melbourne, so the sender's business hours are open. */
function nextBusinessMorning(): Date {
  const d = new Date()
  for (let i = 1; i <= 7; i++) {
    const day = new Date(d.getTime() + i * 86_400_000)
    const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit' }).format(day)
    const weekday = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Melbourne', weekday: 'short' }).format(day)
    if (!['Sat', 'Sun'].includes(weekday)) return new Date(`${ymd}T10:00:00+11:00`)
  }
  throw new Error('no weekday in seven days')
}

const made: { organiser?: string; contact?: string; play?: string; dmOrganiser?: string; dmContact?: string; nightReport?: string } = {}
let senderBefore: Record<string, unknown> | null = null

async function drive() {
  senderBefore = (await sql('select mode, changed_by, changed_at, dns_ok, dns_checked_at, dns_result from public.outreach_sender where id') as Record<string, unknown>[])[0]
  const user = (await sql('select id from auth.users order by created_at limit 1') as { id: string }[])[0].id
  const venueRow = (await sql(`select v.id, v.name, v.city_slug from public.venues v join public.event_series s on s.venue_id = v.id and s.status = 'active' and s.rule = 'weekly'
                                where v.listing_source = 'eventlinqs' and v.removed_at is null and v.city_slug is not null
                                  and not exists (select 1 from public.organiser_venues ov where ov.venue_id = v.id) order by v.name limit 1`) as { id: string; name: string; city_slug: string }[])[0]
  check('a curated venue with a weekly series and no organiser yet on TEST', Boolean(venueRow), venueRow ? `${venueRow.name} (${venueRow.city_slug})` : 'none')
  const templates = (await sql(`select key, id from public.outreach_templates where version = 1 and key in ('first_invitation', 'day4_follow_up', 'day10_close')`) as { key: string; id: string }[])
  const t = Object.fromEntries(templates.map((r) => [r.key, r.id]))
  check('the stored templates are on TEST', templates.length === 3)

  const org = await db.from('organisers').insert({ name: 'W6 Drive Organiser', created_by: user }).select('id').single()
  made.organiser = org.data?.id
  const linked = await db.from('organiser_venues').insert({ venue_id: venueRow.id, organiser_id: made.organiser!, linked_by: user })
  check('the drive organiser runs that venue', !linked.error, linked.error?.message ?? '')
  const contact = await db
    .from('organiser_contacts')
    .insert({
      organiser_id: made.organiser!, person_name: 'Sam Drive', role: 'Venue manager', channel: 'email', address: ADDRESS,
      basis: 'conspicuous_publication', published_on_url: 'https://www.eventlinqs.com.au/about', seen_on: new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10),
      no_marketing_statement_checked: true, relevance: 'Runs the weekly night named on the venue page.', basis_recorded_by: user, basis_recorded_at: new Date().toISOString(), created_by: user,
    })
    .select('id, unsubscribe_token')
    .single()
  made.contact = contact.data?.id
  check('organiser, venue link and contact with a whole basis', Boolean(made.contact), contact.error?.message ?? '')

  const play = await db
    .from('outreach_plays')
    .insert({ name: 'W6 drive play', cohort_rule: { cities: [venueRow.city_slug], organisers: [made.organiser!] }, step1_template_id: t.first_invitation, step2_template_id: t.day4_follow_up, step3_template_id: t.day10_close, created_by: user })
    .select('id')
    .single()
  made.play = play.data?.id
  await db.from('outreach_plays').update({ state: 'approved', approved_by: user, approved_at: new Date().toISOString() }).eq('id', made.play!)
  const mode = await db.from('outreach_sender').update({ mode: 'test', changed_by: user }).eq('id', true)
  check('a play approved once; the sender in test mode', !mode.error && Boolean(made.play), mode.error?.message ?? '')

  const now = nextBusinessMorning()
  const plan = await planPlays(db, { now, origin: ORIGIN, actingUser: user })
  const mine = plan.find((p) => p.playId === made.play)
  check('the planner drafted message 1 for the cohort, queued, no rule failed', mine?.queued === 1 && (mine?.held.length ?? 1) === 0, JSON.stringify({ queued: mine?.queued, held: mine?.held, refused: mine?.refused }))

  clearRecordedOutreachMail()
  const first = await runOutreachSender(db, { now, origin: ORIGIN, graph: null })
  const mail1 = recordedOutreachMail()[0]
  check('the sender claimed and sent it into the recorded sink', first.sent.length === 1 && Boolean(mail1), JSON.stringify({ sent: first.sent.length, failed: first.failed, refused: first.refused }))
  const mime1 = mail1 ? Buffer.from(mail1.base64Mime, 'base64').toString('utf8') : ''
  const body1 = mime1 ? Buffer.from(mime1.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString('utf8') : ''
  check('the message carries the one-click pair to this contact', mime1.includes(`List-Unsubscribe: <${ORIGIN}/api/outreach/one-click-unsubscribe/${contact.data?.unsubscribe_token}>`) && mime1.includes('List-Unsubscribe-Post: List-Unsubscribe=One-Click'))
  check('the message opens Hi Sam, carries the true line and the claim link', body1.startsWith('Hi Sam,') && body1.includes(venueRow.name) && body1.includes('/claim'), body1.split('\n').slice(0, 3).join(' / '))
  const row1 = await db.from('outreach_touches').select('state, internet_message_id, basis_at_send').eq('contact_id', made.contact!).eq('step', 1).single()
  check('the row is sent, with our Message-ID and the basis relied on', row1.data?.state === 'sent' && row1.data?.internet_message_id === mail1?.messageId && Boolean(row1.data?.basis_at_send))

  const yes = await handleInbox(
    db,
    [{ graphId: 'g1', internetMessageId: '<w6-drive-yes@venue.example>', subject: `Re: ${venueRow.name}`, fromAddress: ADDRESS, fromName: 'Sam Drive', receivedAt: new Date().toISOString(), text: `Yes please, sounds great.\n\nOn Thu, Lawal Adams wrote:\n> Would that work for you?`, headers: { 'in-reply-to': mail1?.messageId ?? '' } }],
    { mailbox: 'hello@eventlinqs.com', origin: ORIGIN, actingUser: user, now },
  )
  check('their yes is logged and message 5 drafted', yes.replies[0]?.outcome === 'yes' && yes.replies[0]?.action.startsWith('thank_you queued'), JSON.stringify(yes.replies))
  const second = await runOutreachSender(db, { now, origin: ORIGIN, graph: null })
  const mail2 = recordedOutreachMail()[1]
  const mime2 = mail2 ? Buffer.from(mail2.base64Mime, 'base64').toString('utf8') : ''
  check('message 5 sent in their thread', second.sent.length === 1 && mime2.includes('In-Reply-To: <w6-drive-yes@venue.example>'), JSON.stringify({ sent: second.sent.length, failed: second.failed, refused: second.refused }))

  // Message 9 on its trigger (29 October): not while a night is listed in the next 30 days; drafted once when none is.
  const in30 = new Date(now.getTime() + 30 * 86_400_000).toISOString()
  const ahead = (await sql(`select count(*)::int as n from public.events where venue_id = '${venueRow.id}' and status = 'published' and visibility = 'public'
                              and coalesce(end_date, start_date) >= '${now.toISOString()}' and start_date < '${in30}'`) as { n: number }[])[0].n
  const partners = { organisers: [made.organiser!] }
  const first9 = await planRelationship(db, { now, origin: ORIGIN, actingUser: user, ...partners })
  if (ahead > 0) {
    check(`message 9 waits while the venue has ${ahead} night(s) listed in the next 30 days`, first9.queued === 0 && first9.notDue.some((n) => /nights? listed/.test(n.why)), JSON.stringify(first9))
    const quiet = (await sql(`select v.id, v.name from public.venues v join public.event_series s on s.venue_id = v.id and s.status = 'active'
                                where v.listing_source = 'eventlinqs' and v.removed_at is null and v.id <> '${venueRow.id}'
                                  and not exists (select 1 from public.organiser_venues ov where ov.venue_id = v.id)
                                  and not exists (select 1 from public.events e where e.venue_id = v.id and e.status = 'published' and e.visibility = 'public'
                                                  and coalesce(e.end_date, e.start_date) >= '${now.toISOString()}' and e.start_date < '${in30}')
                                order by v.name limit 1`) as { id: string; name: string }[])[0]
    check('a venue with an active series and nothing on the guide in the next 30 days on TEST', Boolean(quiet), quiet?.name ?? 'none')
    await db.from('organiser_venues').delete().eq('organiser_id', made.organiser!)
    const moved = await db.from('organiser_venues').insert({ venue_id: quiet.id, organiser_id: made.organiser!, linked_by: user })
    check('the partner now runs only that venue', !moved.error, moved.error?.message ?? '')
  }
  const due9 = ahead > 0 ? await planRelationship(db, { now, origin: ORIGIN, actingUser: user, ...partners }) : first9
  check('with nothing listed in the next 30 days, message 9 is drafted and queued after their yes', due9.queued === 1 && due9.held.length === 0 && due9.refused.length === 0, JSON.stringify(due9))
  const fourth = await runOutreachSender(db, { now, origin: ORIGIN, graph: null })
  const mail9 = recordedOutreachMail()[2]
  const mime9 = mail9 ? Buffer.from(mail9.base64Mime, 'base64').toString('utf8') : ''
  const body9 = mime9 ? Buffer.from(mime9.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString('utf8') : ''
  check('message 9 goes: Hi Sam, anything coming up at the venue, with the one-click pair', fourth.sent.length === 1 && body9.startsWith('Hi Sam,') && /Subject: Anything coming up at /.test(mime9) && mime9.includes('List-Unsubscribe-Post: List-Unsubscribe=One-Click'), body9.split('\n').slice(0, 3).join(' / '))
  const again9 = await planRelationship(db, { now, origin: ORIGIN, actingUser: user, ...partners })
  check('message 9 is not asked again within 30 days', again9.queued === 0 && again9.notDue.some((n) => n.why.startsWith('asked on')), JSON.stringify(again9))

  // Message 8 on its trigger (29 October): window 5's report of a night that ended three to five days ago, at a venue the
  // partner runs, is sent once with its counted figures, and never twice.
  const night = (await sql(`select e.id, e.title, e.venue_id, e.organisation_id, e.end_date from public.events e
                              where e.status = 'published' and e.venue_id is not null
                                and e.end_date between now() - interval '5 days' and now() - interval '3 days'
                                and not exists (select 1 from public.organiser_night_reports r where r.event_id = e.id)
                                and not exists (select 1 from public.organiser_venues ov where ov.venue_id = e.venue_id and ov.organiser_id <> '${made.organiser}')
                              order by e.end_date desc limit 1`) as { id: string; title: string; venue_id: string; organisation_id: string; end_date: string }[])[0]
  check('a published night that ended three to five days ago on TEST', Boolean(night), night ? `${night.title} (${night.end_date})` : 'none')
  const runsIt = await db.from('organiser_venues').select('venue_id').eq('venue_id', night.venue_id).eq('organiser_id', made.organiser!)
  if ((runsIt.data ?? []).length === 0) await db.from('organiser_venues').insert({ venue_id: night.venue_id, organiser_id: made.organiser!, linked_by: user })
  const planted = (await sql(`insert into public.organiser_night_reports (event_id, organisation_id, figures, night_ended_at, read_at)
                                values ('${night.id}', '${night.organisation_id}', '{"version": 1, "viewers": 57, "pressesOut": {"people": 8, "bySite": []}, "ownLink": {"arrivals": 3}}'::jsonb, '${night.end_date}', now())
                                returning id`) as { id: string }[])[0]
  made.nightReport = planted?.id
  check('window 5\'s report of that night, planted for the drive', Boolean(made.nightReport))
  const due8 = await planRelationship(db, { now, origin: ORIGIN, actingUser: user, ...partners })
  check('message 8 is drafted and queued from the report, after their yes', due8.afterNight.queued === 1 && due8.afterNight.held.length === 0 && due8.afterNight.refused.length === 0, JSON.stringify(due8.afterNight))
  const fifth = await runOutreachSender(db, { now, origin: ORIGIN, graph: null })
  const mail8 = recordedOutreachMail()[3]
  const mime8 = mail8 ? Buffer.from(mail8.base64Mime, 'base64').toString('utf8') : ''
  const body8 = mime8 ? Buffer.from(mime8.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString('utf8') : ''
  check('message 8 goes with the counted figures: 57 viewed, 8 clicked through, 3 by their own link', fifth.sent.length === 1 && body8.startsWith('Hi Sam,') && body8.includes('57 people viewed your listing') && body8.includes('8 clicked through') && body8.includes('3 came through your own share link'), body8.split('\n').slice(0, 5).join(' / '))
  const row8 = await db.from('outreach_touches').select('state').eq('night_report_id', made.nightReport!).single()
  check('the message names its report and is sent', row8.data?.state === 'sent', JSON.stringify(row8.data ?? row8.error))
  const again8 = await planRelationship(db, { now, origin: ORIGIN, actingUser: user, ...partners })
  check('message 8 is never drafted twice for one night', again8.afterNight.queued === 0 && again8.afterNight.held.length === 0, JSON.stringify(again8.afterNight))
  // A second message for the same night, whole in every other way (the sent one's own words), so only the index can refuse it.
  const sent8 = await db.from('outreach_touches').select('subject, body, template_id').eq('night_report_id', made.nightReport!).single()
  const twice = await db.from('outreach_touches').insert({ contact_id: made.contact!, purpose: 'relationship', template_id: sent8.data?.template_id ?? null, subject: sent8.data?.subject ?? null, body: sent8.data?.body ?? '', drafted_by: user, state: 'held', held_because: ['drive: a second message for one night'], night_report_id: made.nightReport! })
  check('the database refuses a second live message for the same night', Boolean(twice.error) && /outreach_touches_one_per_night_report|duplicate/.test(twice.error?.message ?? ''), twice.error?.message ?? 'inserted')

  const stop = await handleInbox(
    db,
    [{ graphId: 'g2', internetMessageId: '<w6-drive-stop@venue.example>', subject: 'Re: Thank you', fromAddress: ADDRESS, fromName: 'Sam Drive', receivedAt: new Date().toISOString(), text: 'Please unsubscribe me.', headers: {} }],
    { mailbox: 'hello@eventlinqs.com', origin: ORIGIN, actingUser: user, now },
  )
  const suppressed = await db.from('outreach_unsubscribes').select('id').eq('email', ADDRESS)
  check('their stop is suppressed at once', stop.replies[0]?.outcome === 'stop' && (suppressed.data?.length ?? 0) === 1, JSON.stringify(stop.replies))
  const third = await runOutreachSender(db, { now, origin: ORIGIN, graph: null })
  check('exactly one confirmation goes', third.sent.length === 1 && recordedOutreachMail().length === 5, JSON.stringify({ sent: third.sent.length, refused: third.refused }))
  const again = await handleInbox(
    db,
    [{ graphId: 'g2', internetMessageId: '<w6-drive-stop@venue.example>', subject: 'Re: Thank you', fromAddress: ADDRESS, fromName: 'Sam Drive', receivedAt: new Date().toISOString(), text: 'Please unsubscribe me.', headers: {} }],
    { mailbox: 'hello@eventlinqs.com', origin: ORIGIN, actingUser: user, now },
  )
  check('the same message read again changes nothing', again.replies.length === 0)
  const oneClick = await db.rpc('outreach_unsubscribe_by_token', { p_token: contact.data!.unsubscribe_token })
  check('the one-click link finds it already done', oneClick.data === 'already')
  const replan = await planPlays(db, { now, origin: ORIGIN, actingUser: user })
  check('the planner drafts nothing more for them', (replan.find((p) => p.playId === made.play)?.queued ?? 1) === 0)

  // DMs: drafted and held for Lawal, never queued; his send by hand is recorded.
  const dmOrg = await db.from('organisers').insert({ name: 'W6 Drive DM Organiser', created_by: user }).select('id').single()
  made.dmOrganiser = dmOrg.data?.id
  const otherVenue = (await sql(`select v.id from public.venues v join public.event_series s on s.venue_id = v.id and s.status = 'active' and s.rule = 'weekly'
                                  where v.listing_source = 'eventlinqs' and v.removed_at is null and v.id <> '${venueRow.id}'
                                    and not exists (select 1 from public.organiser_venues ov where ov.venue_id = v.id) order by v.name limit 1`) as { id: string }[])[0]
  const dmLinked = await db.from('organiser_venues').insert({ venue_id: otherVenue.id, organiser_id: made.dmOrganiser!, linked_by: user })
  check('the DM organiser runs another venue', !dmLinked.error, dmLinked.error?.message ?? '')
  const dm = await db
    .from('organiser_contacts')
    .insert({
      organiser_id: made.dmOrganiser!, person_name: 'Dee Drive', role: 'Instagram account', channel: 'instagram', address: 'w6.drive.dm',
      basis: 'conspicuous_publication', published_on_url: 'https://www.eventlinqs.com.au/about', seen_on: new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10),
      no_marketing_statement_checked: true, relevance: 'Runs the weekly night named on the venue page.', basis_recorded_by: user, basis_recorded_at: new Date().toISOString(), created_by: user,
    })
    .select('id')
    .single()
  made.dmContact = dm.data?.id
  const dms = await planDms(db, { now, origin: ORIGIN, actingUser: user, organisers: [made.dmOrganiser!] })
  const dmRow = await db.from('outreach_touches').select('id, state, body, provider').eq('contact_id', made.dmContact!).eq('step', 1).single()
  check('a first DM is drafted and HELD for Lawal, never queued', dms.drafted >= 1 && dmRow.data?.state === 'held' && dmRow.data?.provider === null && (dmRow.data?.body ?? '').includes("reply stop and I won't message again"), JSON.stringify({ drafted: dms.drafted, held: dms.held, refused: dms.refused, state: dmRow.data?.state }))
  const handSent = await db.from('outreach_touches').update({ state: 'sent', sent_at: new Date().toISOString(), sent_by: user, provider: 'by_hand' }).eq('id', dmRow.data!.id).eq('state', 'held').select('id').single()
  check('his send by hand is recorded, with the basis kept', !handSent.error, handSent.error?.message ?? '')
  const after = await runOutreachSender(db, { now, origin: ORIGIN, graph: null })
  check('the sender never touches a DM', !after.sent.includes(dmRow.data!.id))
}

async function cleanup() {
  const c = made.contact ? `'${made.contact}'` : 'null'
  const d = made.dmContact ? `'${made.dmContact}'` : 'null'
  const dmo = made.dmOrganiser ? `'${made.dmOrganiser}'` : 'null'
  await sql(`begin;
    alter table public.outreach_touches disable trigger user;
    alter table public.outreach_replies disable trigger user;
    alter table public.outreach_unsubscribes disable trigger user;
    alter table public.outreach_delivery_events disable trigger user;
    delete from public.outreach_delivery_events where touch_id in (select id from public.outreach_touches where contact_id = ${c});
    delete from public.outreach_replies where contact_id = ${c};
    delete from public.outreach_touches where contact_id = ${c};
    delete from public.outreach_touches where contact_id = ${d};
    delete from public.outreach_unsubscribes where email = '${ADDRESS}';
    alter table public.organiser_night_reports disable trigger user;
    delete from public.organiser_night_reports where id = ${made.nightReport ? `'${made.nightReport}'` : 'null'};
    alter table public.organiser_night_reports enable trigger user;
    alter table public.outreach_touches enable trigger user;
    alter table public.outreach_replies enable trigger user;
    alter table public.outreach_unsubscribes enable trigger user;
    alter table public.outreach_delivery_events enable trigger user;
    delete from public.organiser_contacts where id in (${c}, ${d});
    delete from public.organiser_venues where organiser_id = ${dmo};
    delete from public.organisers where id = ${dmo};
    delete from public.organiser_venues where organiser_id = ${made.organiser ? `'${made.organiser}'` : 'null'};
    delete from public.organisers where id = ${made.organiser ? `'${made.organiser}'` : 'null'};
    delete from public.outreach_plays where id = ${made.play ? `'${made.play}'` : 'null'};
    commit;`)
  if (senderBefore) {
    const v = (x: unknown) => (x === null || x === undefined ? 'null' : `'${String(typeof x === 'object' ? JSON.stringify(x) : x).replace(/'/g, "''")}'`)
    await sql(`begin;
      alter table public.outreach_sender disable trigger user;
      update public.outreach_sender set mode = ${v(senderBefore.mode)}, changed_by = ${v(senderBefore.changed_by)}, changed_at = ${v(senderBefore.changed_at)},
        dns_ok = ${v(senderBefore.dns_ok)}, dns_checked_at = ${v(senderBefore.dns_checked_at)}, dns_result = ${v(senderBefore.dns_result)} where id;
      alter table public.outreach_sender enable trigger user;
      commit;`)
  }
  const left = (await sql(`select
      (select count(*) from public.organisers where name like 'W6 Drive%')::int as organisers,
      (select count(*) from public.organiser_contacts where address in ('${ADDRESS}', 'w6.drive.dm'))::int as contacts,
      (select count(*) from public.outreach_touches where contact_id in (${c}, ${d}))::int as touches,
      (select count(*) from public.outreach_unsubscribes where email = '${ADDRESS}')::int as unsubscribes,
      (select count(*) from public.outreach_plays where name = 'W6 drive play')::int as plays,
      (select count(*) from public.organiser_night_reports where id = ${made.nightReport ? `'${made.nightReport}'` : 'null'})::int as night_reports,
      (select mode from public.outreach_sender where id) as mode,
      (select changed_by from public.outreach_sender where id) as changed_by,
      (select count(*) from pg_trigger where tgrelid = 'public.outreach_touches'::regclass and tgenabled = 'D')::int as disabled_triggers`) as Record<string, unknown>[])[0]
  return left
}

async function main() {
  try {
    await drive()
  } catch (error) {
    check('the drive ran to its end', false, (error as Error).message)
  }
  const left = await cleanup()
  check('TEST left as found', left.organisers === 0 && left.contacts === 0 && left.touches === 0 && left.unsubscribes === 0 && left.plays === 0 && left.night_reports === 0 && left.mode === (senderBefore?.mode ?? 'hold') && left.changed_by === (senderBefore?.changed_by ?? null) && left.disabled_triggers === 0, JSON.stringify(left))
  console.log(`OUTREACH DRIVE ${failures === 0 ? 'PASSED' : 'FAILED'} (${failures} failure(s)) on TEST ${TEST_REF}`)
  for (const line of checks) console.log(`  ${line}`)
  process.exitCode = failures === 0 ? 0 : 1
}

void main()
