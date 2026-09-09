/**
 * DRIVEN PROOF: editing an event must not destroy its ticket tiers.
 *
 * THE DEFECT THIS EXISTS TO CATCH, found on 10 September 2026 while reading the
 * write paths a slot ledger would have to hook into. `updateEvent` in
 * src/app/(dashboard)/dashboard/events/actions.ts did this, unconditionally, on
 * every save of every event:
 *
 *     await admin.from('ticket_tiers').delete().eq('event_id', input.eventId)
 *     ... then re-insert the tiers from the form
 *
 * The form drops the tier id before it posts, so the server had no way to know
 * which submitted tier was which and replaced the lot. Every one of those rows
 * is a foreign key somebody else holds:
 *
 *     tickets.ticket_tier_id               ON DELETE SET NULL
 *     order_items.ticket_tier_id           ON DELETE SET NULL
 *     seats.ticket_tier_id                 ON DELETE SET NULL
 *     ticket_price_history.ticket_tier_id  ON DELETE SET NULL
 *     waitlist.ticket_tier_id              ON DELETE CASCADE
 *     squads.ticket_tier_id                ON DELETE CASCADE
 *     tier_access_codes.ticket_tier_id     ON DELETE CASCADE
 *     dynamic_pricing_rules.ticket_tier_id ON DELETE CASCADE
 *
 * So one organiser fixing a typo in their own description silently unlinked
 * every ticket they had already sold from the tier it was sold at, reset
 * sold_count to zero on the replacement row, and DELETED their waitlist, their
 * squads, their access codes and their pricing rules. Nothing told them.
 *
 * WHY IT IS DRIVEN RATHER THAN ARGUED. Reading the code proves the delete runs.
 * It does not prove what a person loses, and this repository's standing rule is
 * that a claim about behaviour is worth nothing until something has executed it.
 * So this signs up a real organiser through /signup, builds and publishes a real
 * event through the wizard, has a real attendee take a real free ticket through
 * the public event page, and then opens the edit form and presses Save Changes.
 * Every assertion afterwards is a READ of what the database actually holds.
 *
 * Usage (the shell must not carry the production Supabase URL):
 *   BASE=http://localhost:3311 node --env-file=.env.local \
 *     scripts/verify/tier-identity-proof.mjs --out C:/dev/EVIDENCE/D0
 *
 * JOURNEY_VIEWPORT=mobile-390|tablet-768|desktop-1440 selects the viewport and
 * namespaces the output, so three runs do not overwrite one another.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  chromium,
  BASE,
  makeJourney,
  note,
  attach,
  clickText,
  fillIf,
  messagesOnScreen,
  signUpAndConfirm,
  createEventThroughWizard,
} from '../journeys/harness.mjs'

const args = process.argv.slice(2)
let out = 'C:/dev/EVIDENCE/D0'
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--out') out = args[++i]
}
const viewport = process.env.JOURNEY_VIEWPORT ?? 'desktop-1440'
out = join(out, viewport)
mkdirSync(out, { recursive: true })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (/gndnldyfudbytbboxesk/.test(SUPABASE_URL)) {
  console.error('[tier-identity] REFUSING: this is the PRODUCTION Supabase project. This drive writes.')
  process.exit(1)
}
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('[tier-identity] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const stamp = Date.now().toString(36)
const rand = randomBytes(3).toString('hex')
const ORGANISER = { name: 'Nadia Okonkwo', email: `d0.org.${stamp}.${rand}@example.com`, password: 'Journey!2026Test' }
const ATTENDEE = { name: 'Sam Whitlock', email: `d0.att.${stamp}.${rand}@example.com`, password: 'Journey!2026Test' }
const TITLE = `Tier Identity Night ${stamp}`
const ORG_NAME = `Okonkwo Presents ${stamp}`

const checks = []
function check(id, pass, detail) {
  checks.push({ id, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${detail}`)
}

/** Everything about this event's inventory that a person would lose. */
async function snapshot(eventId) {
  const { data: tiers } = await db
    .from('ticket_tiers')
    .select('id, name, price, total_capacity, sold_count, reserved_count, created_at')
    .eq('event_id', eventId)
    .order('sort_order')
  const { data: tickets } = await db.from('tickets').select('id, ticket_code, ticket_tier_id').eq('event_id', eventId)
  const { data: orders } = await db.from('orders').select('id').eq('event_id', eventId)
  const orderIds = (orders ?? []).map((o) => o.id)
  const { data: items } = orderIds.length
    ? await db.from('order_items').select('id, item_name, ticket_tier_id, order_id').in('order_id', orderIds)
    : { data: [] }
  const { data: waitlist } = await db.from('waitlist').select('id, ticket_tier_id').eq('event_id', eventId)
  const { data: history } = await db.from('ticket_price_history').select('id, ticket_tier_id').eq('event_id', eventId)
  return {
    tierIds: (tiers ?? []).map((t) => t.id),
    tiers: tiers ?? [],
    tickets: tickets ?? [],
    items: items ?? [],
    waitlist: waitlist ?? [],
    history: history ?? [],
  }
}

const j = makeJourney('tier-identity', 'Editing an event must not destroy its ticket tiers')
const browser = await chromium.launch({ headless: true })
const organiserCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
const page = await organiserCtx.newPage()
await attach(j, page)

let eventId = null
let slug = null

try {
  /* ---------------------------------------------------------- 1. organiser */
  const signedUp = await signUpAndConfirm(j, page, ORGANISER)
  check('d0.organiser.signup', Boolean(signedUp), signedUp ? `signed in as ${ORGANISER.email}` : 'signup refused')
  if (!signedUp) throw new Error('organiser signup refused')

  const review = await createEventThroughWizard(j, page, {
    title: TITLE,
    summary: 'One room, one night, everyone welcome.',
    description: 'A free community night. Doors at seven, first act at eight, and a late set for whoever stays.',
    capacity: '100',
    orgName: ORG_NAME,
  })
  await page.screenshot({ path: join(out, '01-review.png'), fullPage: false }).catch(() => {})
  check(
    'd0.event.review',
    Boolean(review?.reachedReview) && review?.publishDisabled === false,
    review?.reachedReview ? `Review offers Publish, disabled=${review.publishDisabled}` : 'never reached Review',
  )
  if (!review?.reachedReview || review.publishDisabled !== false) throw new Error('could not reach a publishable review')

  await review.publishButton.click()
  await page.waitForTimeout(12000)
  await page.screenshot({ path: join(out, '02-published.png'), fullPage: false }).catch(() => {})

  const { data: created } = await db.from('events').select('id, slug, status').eq('title', TITLE).maybeSingle()
  eventId = created?.id ?? null
  slug = created?.slug ?? null
  check('d0.event.published', created?.status === 'published' && Boolean(slug), `status=${created?.status} slug=${slug}`)
  if (!eventId || !slug) throw new Error('the event did not publish')

  /* ------------------------------------------------- 2. a real free ticket */
  const attendeeCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-AU' })
  const buyer = await attendeeCtx.newPage()
  await attach(j, buyer)
  const buyerSignedUp = await signUpAndConfirm(j, buyer, ATTENDEE)
  check('d0.attendee.signup', Boolean(buyerSignedUp), buyerSignedUp ? ATTENDEE.email : 'attendee signup refused')

  await buyer.goto(`${BASE}/events/${slug}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await buyer.waitForTimeout(3000)
  for (const el of await buyer.$$('button, a')) {
    const t = ((await el.innerText().catch(() => '')) || '').trim()
    if (/^(get tickets|register|book now|select tickets)/i.test(t) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {})
      break
    }
  }
  await buyer.waitForTimeout(2500)
  for (const b of await buyer.$$('button')) {
    if (((await b.innerText().catch(() => '')) || '').trim() === '+') {
      await b.click().catch(() => {})
      break
    }
  }
  await buyer.waitForTimeout(2000)
  await buyer.screenshot({ path: join(out, '03-ticket-selected.png'), fullPage: false }).catch(() => {})
  let started = false
  for (const el of await buyer.$$('button, a')) {
    const t = ((await el.innerText().catch(() => '')) || '').trim()
    if (/^(checkout|register|confirm|get free)/i.test(t) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {})
      started = true
      break
    }
  }
  await buyer.waitForTimeout(9000)
  const landed = buyer.url().replace(BASE, '')
  check(
    'd0.attendee.registered',
    started && /\/orders\/[0-9a-f-]{36}\/confirmation/.test(landed),
    `landed on ${landed.slice(0, 90)} :: ${(await messagesOnScreen(buyer)).join(' // ').slice(0, 160) || 'no message'}`,
  )
  await buyer.screenshot({ path: join(out, '04-confirmation.png'), fullPage: false }).catch(() => {})
  await attendeeCtx.close()

  /* ------------------------------------------------------ 3. snapshot BEFORE */
  const before = await snapshot(eventId)
  check(
    'd0.before.sold',
    before.tickets.length === 1 && before.tickets.every((t) => t.ticket_tier_id) && before.tiers[0]?.sold_count === 1,
    `${before.tiers.length} tier(s) id=${before.tierIds.join(',')} sold_count=${before.tiers[0]?.sold_count} ` +
      `tickets=${before.tickets.length} linked=${before.tickets.filter((t) => t.ticket_tier_id).length} ` +
      `order_items linked=${before.items.filter((i) => i.ticket_tier_id).length}/${before.items.length} ` +
      `price_history=${before.history.length}`,
  )
  writeFileSync(join(out, 'snapshot-before.json'), JSON.stringify(before, null, 2))

  /* --------------------------------------- 4. the organiser edits the event */
  /**
   * Walk the edit wizard to the end and press Save Changes, reporting exactly
   * what was on screen afterwards. `shot` names the screenshot for this pass.
   */
  const saveTheEdit = async (shot) => {
    let pressed = false
    for (let i = 0; i < 10; i += 1) {
      if (await page.$('button:has-text("Save Changes")')) {
        await clickText(page, 'Save Changes')
        await page.waitForTimeout(10000)
        pressed = true
        break
      }
      if (!(await clickText(page, 'Continue'))) break
      await page.waitForTimeout(2500)
    }
    await page.screenshot({ path: join(out, shot), fullPage: false }).catch(() => {})
    const messages = await messagesOnScreen(page)
    return { pressed, messages, text: messages.join(' // ') }
  }

  /** A message that reads like a fault rather than like the page's own controls. */
  const faultLike = (messages) =>
    messages.filter((m) => /failed|error|duplicate key|constraint|violates|could not/i.test(m))

  await page.goto(`${BASE}/dashboard/events/${eventId}/edit`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(4000)
  await page.screenshot({ path: join(out, '05-edit-open.png'), fullPage: false }).catch(() => {})
  const NEW_SUMMARY = 'One room, one night, everyone welcome. Doors at seven.'
  const NEW_CAPACITY = '120'
  const changed = await fillIf(page, 'input[placeholder^="A brief one-line"]', NEW_SUMMARY)
  check('d0.edit.form', changed, changed ? 'changed the one-line summary' : 'could not find the summary field')

  // The ticket capacity as well as the event body, because the half of this
  // defect that a person notices is that their TICKET edits are discarded.
  let capacityChanged = false
  for (let i = 0; i < 10; i += 1) {
    if (await page.$('#tier-capacity-0')) {
      capacityChanged = await fillIf(page, '#tier-capacity-0', NEW_CAPACITY)
      break
    }
    if (!(await clickText(page, 'Continue'))) break
    await page.waitForTimeout(2500)
  }
  check('d0.edit.capacity_typed', capacityChanged, capacityChanged ? `set the capacity to ${NEW_CAPACITY}` : 'never reached the ticket capacity field')

  const firstSave = await saveTheEdit('06-after-save.png')
  check('d0.edit.saved', firstSave.pressed, firstSave.pressed ? `pressed Save Changes; ${firstSave.text || 'no message'}` : 'never reached Save Changes')

  /*
   * THE CHECK THAT SEPARATES THE FIXED TREE FROM THE BROKEN ONE. Before the fix
   * this same drive left the tier ids intact, because the database REFUSED the
   * delete. What it also did was show the organiser
   *   Failed to update ticket tiers: duplicate key value violates unique
   *   constraint "ticket_tiers_event_id_name_key"
   * and discard every ticket edit. So the identity checks alone would pass on a
   * broken tree; this one does not.
   */
  check(
    'd0.edit.no_fault_shown',
    faultLike(firstSave.messages).length === 0,
    faultLike(firstSave.messages).length === 0
      ? 'the save showed nothing that reads like a fault'
      : `the organiser was shown: ${faultLike(firstSave.messages).join(' // ').slice(0, 200)}`,
  )

  const { data: afterEvent } = await db.from('events').select('summary').eq('id', eventId).maybeSingle()
  check(
    'd0.edit.persisted',
    afterEvent?.summary === NEW_SUMMARY,
    `summary is now ${JSON.stringify((afterEvent?.summary ?? '').slice(0, 60))}`,
  )

  const { data: capacityAfter } = await db
    .from('ticket_tiers')
    .select('id, total_capacity')
    .eq('event_id', eventId)
    .order('sort_order')
  check(
    'd0.edit.capacity_persisted',
    capacityAfter?.[0]?.total_capacity === Number(NEW_CAPACITY),
    `the ticket capacity is now ${capacityAfter?.[0]?.total_capacity}, and the organiser typed ${NEW_CAPACITY}`,
  )

  /* ------------------------------------------------------- 5. snapshot AFTER */
  const after = await snapshot(eventId)
  writeFileSync(join(out, 'snapshot-after.json'), JSON.stringify(after, null, 2))

  const sameTierIds =
    before.tierIds.length === after.tierIds.length && before.tierIds.every((id) => after.tierIds.includes(id))
  check(
    'd0.tier.identity',
    sameTierIds,
    sameTierIds
      ? `the tier kept its id: ${after.tierIds.join(',')}`
      : `the tier was REPLACED: before ${before.tierIds.join(',')} -> after ${after.tierIds.join(',')}`,
  )
  check(
    'd0.tier.sold_count',
    after.tiers[0]?.sold_count === before.tiers[0]?.sold_count,
    `sold_count ${before.tiers[0]?.sold_count} -> ${after.tiers[0]?.sold_count}`,
  )
  const ticketsLinked = after.tickets.length > 0 && after.tickets.every((t) => t.ticket_tier_id)
  check(
    'd0.ticket.link',
    ticketsLinked,
    `${after.tickets.filter((t) => t.ticket_tier_id).length} of ${after.tickets.length} sold tickets still name their tier`,
  )
  const itemsLinked = after.items.length > 0 && after.items.every((i) => i.ticket_tier_id)
  check(
    'd0.order_item.link',
    itemsLinked,
    `${after.items.filter((i) => i.ticket_tier_id).length} of ${after.items.length} order items still name their tier`,
  )
  check(
    'd0.price_history.link',
    after.history.length > 0 && after.history.every((h) => h.ticket_tier_id),
    `${after.history.filter((h) => h.ticket_tier_id).length} of ${after.history.length} price-history rows still name their tier`,
  )

  /* ---------------------------------- 6. a SECOND ticket type, then remove it */
  // Adding one is ordinary, and it is also what makes the Remove control appear
  // at all: the form offers it only when more than one ticket type exists.
  await page.goto(`${BASE}/dashboard/events/${eventId}/edit`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(4000)
  let addedTier = false
  for (let i = 0; i < 10; i += 1) {
    if (await page.$('button:has-text("Add Ticket Tier")')) {
      await clickText(page, 'Add Ticket Tier')
      await page.waitForTimeout(1500)
      await fillIf(page, '#tier-name-1', 'Late release')
      const type1 = await page.$('#tier-type-1')
      if (type1) await type1.selectOption('free').catch(() => {})
      await fillIf(page, '#tier-capacity-1', '50')
      await page.waitForTimeout(800)
      addedTier = true
      break
    }
    if (!(await clickText(page, 'Continue'))) break
    await page.waitForTimeout(2500)
  }
  check('d0.second_tier.added', addedTier, addedTier ? 'added a second ticket type through the form' : 'no Add Ticket Tier control')
  const secondSave = await saveTheEdit('07-second-tier.png')
  const twoTiers = await snapshot(eventId)
  check(
    'd0.second_tier.saved',
    secondSave.pressed && twoTiers.tiers.length === 2 && twoTiers.tierIds.includes(before.tierIds[0]),
    `${twoTiers.tiers.length} ticket type(s): ${twoTiers.tiers.map((t) => `${t.name}(sold ${t.sold_count})`).join(', ')}` +
      `${faultLike(secondSave.messages).length ? ` :: shown ${faultLike(secondSave.messages).join(' // ').slice(0, 160)}` : ''}`,
  )

  /* ---------------- 6b. two ticket types may not be called the same thing */
  // Judged case-insensitively on purpose: the price-history recorder keys on
  // lower(tier_name), so "VIP" beside "vip" would silently share one history.
  // Without this refusal the organiser reaches the same duplicate-key message by
  // a different road.
  await page.goto(`${BASE}/dashboard/events/${eventId}/edit`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(4000)
  let renamed = false
  for (let i = 0; i < 10; i += 1) {
    if (await page.$('#tier-name-1')) {
      renamed = await fillIf(page, '#tier-name-1', 'General Admission')
      break
    }
    if (!(await clickText(page, 'Continue'))) break
    await page.waitForTimeout(2500)
  }
  const clashSave = renamed ? await saveTheEdit('08-name-clash.png') : { pressed: false, messages: [], text: '' }
  const clash = clashSave.messages.find((m) => /more than one of your ticket types/i.test(m)) ?? ''
  check(
    'd0.repeated_name.refused',
    Boolean(clash) && !/constraint|duplicate key/i.test(clash),
    clash ? `the organiser was told: ${clash.slice(0, 180)}` : `nothing refused it; on screen: ${clashSave.text.slice(0, 180) || 'no message'}`,
  )
  const afterClash = await snapshot(eventId)
  check(
    'd0.repeated_name.nothing_written',
    afterClash.tiers.length === 2 && afterClash.tiers.filter((t) => /^General admission$/i.test(t.name)).length === 1,
    `ticket types are still ${afterClash.tiers.map((t) => t.name).join(', ')}`,
  )

  /*
   * NOW REMOVE THE ONE SOMEBODY HAS ALREADY BOUGHT. This is the refusal the
   * database function answers and the action turns into a sentence. Before this
   * item there was no refusal at all: the delete simply failed and the organiser
   * read a constraint name.
   */
  await page.goto(`${BASE}/dashboard/events/${eventId}/edit`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(4000)
  let removed = false
  for (let i = 0; i < 10; i += 1) {
    const removeButtons = await page.$$('button:has-text("Remove")')
    if (removeButtons.length > 0) {
      await removeButtons[0].click().catch(() => {})
      await page.waitForTimeout(1200)
      removed = true
      break
    }
    if (!(await clickText(page, 'Continue'))) break
    await page.waitForTimeout(2500)
  }
  check('d0.remove.offered', removed, removed ? 'pressed Remove on the ticket type that has a sale' : 'no Remove control appeared')
  const removeSave = await saveTheEdit('09-remove-refused.png')
  const refusal = removeSave.messages.find((m) => /cannot be removed/i.test(m)) ?? ''
  check(
    'd0.remove.refused_in_words',
    Boolean(refusal) && /General admission/i.test(refusal) && !/constraint|duplicate key/i.test(refusal),
    refusal ? `the organiser was told: ${refusal.slice(0, 200)}` : `nothing refused it; on screen: ${removeSave.text.slice(0, 200) || 'no message'}`,
  )

  const afterRefusal = await snapshot(eventId)
  check(
    'd0.remove.nothing_lost',
    afterRefusal.tiers.length === 2 &&
      afterRefusal.tierIds.includes(before.tierIds[0]) &&
      afterRefusal.tickets.every((t) => t.ticket_tier_id),
    `${afterRefusal.tiers.length} ticket type(s) still there, ` +
      `${afterRefusal.tickets.filter((t) => t.ticket_tier_id).length} of ${afterRefusal.tickets.length} tickets still linked`,
  )

  /* ------------------- 7. removing the ticket type nobody has bought DOES work */
  // The refusal above must not have turned into a blanket refusal. Removing a
  // ticket type that has sold nothing is an ordinary thing an organiser does,
  // and it is the only branch of the reconciliation that still deletes a row.
  await page.goto(`${BASE}/dashboard/events/${eventId}/edit`, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(4000)
  let removedUnsold = false
  for (let i = 0; i < 10; i += 1) {
    const removeButtons = await page.$$('button:has-text("Remove")')
    if (removeButtons.length > 1) {
      await removeButtons[1].click().catch(() => {})
      await page.waitForTimeout(1200)
      removedUnsold = true
      break
    }
    if (!(await clickText(page, 'Continue'))) break
    await page.waitForTimeout(2500)
  }
  const unsoldSave = removedUnsold ? await saveTheEdit('10-unsold-removed.png') : { pressed: false, messages: [], text: '' }
  const afterUnsold = await snapshot(eventId)
  check(
    'd0.remove.unsold_goes',
    removedUnsold &&
      unsoldSave.pressed &&
      afterUnsold.tiers.length === 1 &&
      afterUnsold.tierIds.includes(before.tierIds[0]) &&
      afterUnsold.tickets.every((t) => t.ticket_tier_id),
    `${afterUnsold.tiers.length} ticket type(s) left: ${afterUnsold.tiers.map((t) => t.name).join(', ')}` +
      `${faultLike(unsoldSave.messages).length ? ` :: shown ${faultLike(unsoldSave.messages).join(' // ').slice(0, 160)}` : ''}`,
  )

  /* --------------------------------- 8. what the OLD save did, replayed here */
  /*
   * THE RED DIRECTION, EXECUTED RATHER THAN REMEMBERED.
   *
   * Everything above passes on the fixed tree. A reader is entitled to ask what
   * it would have done on the broken one, and the honest answer costs a full
   * rebuild of deleted code. So instead the two statements the old save ran are
   * replayed HERE, against the event this drive just built, and what the
   * database answers is recorded.
   *
   * It is safe by construction: the event has a sale, so the delete is refused,
   * which is the entire point. Nothing is written. On an event with no sale this
   * would genuinely remove the ticket types, which is why it is never pointed at
   * anything but the event this file created two minutes ago.
   */
  const replayDelete = await db.from('ticket_tiers').delete().eq('event_id', eventId)
  const replayInsert = replayDelete.error
    ? await db.from('ticket_tiers').insert([
        {
          event_id: eventId,
          name: 'General admission',
          tier_type: 'free',
          access_mode: 'in_person',
          price: 0,
          currency: 'AUD',
          total_capacity: 120,
          min_per_order: 1,
          max_per_order: 10,
          sort_order: 0,
        },
      ])
    : { error: null }
  const stillThere = await snapshot(eventId)
  writeFileSync(
    join(out, 'old-save-replayed.txt'),
    [
      'WHAT THE OLD SAVE DID, REPLAYED ON THIS EVENT',
      '=============================================',
      '',
      "  await admin.from('ticket_tiers').delete().eq('event_id', eventId)",
      `      -> ${replayDelete.error ? `${replayDelete.error.code} ${replayDelete.error.message}` : 'no error, every ticket type removed'}`,
      '      and the old code never read this error.',
      '',
      "  await admin.from('ticket_tiers').insert(tiers)",
      `      -> ${replayInsert.error ? `${replayInsert.error.code} ${replayInsert.error.message}` : 'inserted'}`,
      '      which is the sentence the organiser was shown, word for word.',
      '',
      `  ticket types still on the event afterwards: ${stillThere.tiers.length}`,
      `  sold tickets still naming their ticket type: ${stillThere.tickets.filter((t) => t.ticket_tier_id).length} of ${stillThere.tickets.length}`,
    ].join('\n') + '\n',
  )
  check(
    'd0.old_save.replayed',
    Boolean(replayDelete.error) && Boolean(replayInsert.error),
    `the old delete answered ${replayDelete.error?.code ?? 'nothing'} and the old insert answered ` +
      `${replayInsert.error?.code ?? 'nothing'}: ${(replayInsert.error?.message ?? 'no error').slice(0, 120)}`,
  )
} catch (err) {
  note(j, 'THREW', String(err).slice(0, 240))
  check('d0.run', false, `threw: ${String(err).slice(0, 200)}`)
} finally {
  const passed = checks.filter((c) => c.pass).length
  const verdict = `${passed} of ${checks.length} checks pass`
  const report = [
    'TIER IDENTITY PROOF',
    '===================',
    `viewport      ${viewport}`,
    `base          ${BASE}`,
    `supabase      ${SUPABASE_URL}`,
    `event         ${eventId ?? '(none)'}  ${slug ?? ''}`,
    `organiser     ${ORGANISER.email}`,
    `attendee      ${ATTENDEE.email}`,
    '',
    ...checks.map((c) => `${c.pass ? 'PASS' : 'FAIL'}  ${c.id.padEnd(26)} ${c.detail}`),
    '',
    verdict,
  ].join('\n')
  writeFileSync(join(out, 'report.txt'), report + '\n')
  console.log('\n' + verdict)
  console.log(`evidence: ${out}`)
  await browser.close()
  process.exit(checks.every((c) => c.pass) ? 0 : 1)
}
