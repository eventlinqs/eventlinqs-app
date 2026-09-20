/**
 * LB-ATTENDEEWHOLE, THE COUNTER-PROOF: PUT THE DEFECT BACK AND WATCH THE DRIVE
 * REFUSE.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS. A drive that has only ever passed has proved nothing. It may
 * be asserting something the defective code also satisfied, and the only way to
 * know is to reintroduce the defect and require a FAILURE.
 *
 * So this restores the four reads exactly as they shipped before 20 September
 * 2026, unbounded and ordered for display, runs the same drive against the same
 * fixture, and REQUIRES a non-zero exit. Then it puts every file back and
 * verifies each one byte for byte, because a counter-proof that leaves the
 * defect in the tree is a very expensive way to cause one.
 *
 * It patches SOURCE, so the dev server on 3100 recompiles between the patch and
 * the drive. That wait is deliberate and is not a timing hack: `next dev` is
 * what serves the drive, and a drive that ran before the recompile would be
 * measuring the code this script is trying to remove.
 *
 * Run (dev server on 3100 against TEST):
 *   node --env-file=.env.local scripts/verify/lb-attendeewhole-counter-proof.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { resolve, join } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..', '..')
const RECOMPILE_WAIT_MS = 12_000

const ATTENDEES = 'src/lib/reporting/attendees.ts'
const ORDERS_PAGE = 'src/app/(dashboard)/dashboard/events/[id]/orders/page.tsx'

/**
 * Each entry is one read put back exactly as it was. `find` must appear exactly
 * once: a replacement that matched twice, or zero times, would leave a tree
 * nobody intended and a result nobody could interpret.
 */
const REGRESSIONS = [
  {
    what: 'the attendee list reads its tickets unbounded, oldest first',
    file: ATTENDEES,
    find:
      "  const rows = (await readEveryRow<RawTicket>('the event attendee list', (from, to) =>\n" +
      '    admin\n' +
      "      .from('tickets')\n" +
      '      .select(\n' +
      "        'created_at, ticket_code, holder_name, holder_email, status, first_scanned_at, ticket_tier:ticket_tiers(name), order:orders(order_number, created_at)'\n" +
      '      )\n' +
      "      .eq('event_id', eventId)\n" +
      "      .order('id', { ascending: true })\n" +
      '      .range(from, to) as unknown as PromiseLike<{ data: RawTicket[] | null; error: { message: string } | null }>,\n' +
      '  )).sort(byTicketReadingOrder)',
    replace:
      '  const { data: rawTickets } = await admin\n' +
      "    .from('tickets')\n" +
      '    .select(\n' +
      "      'created_at, ticket_code, holder_name, holder_email, status, first_scanned_at, ticket_tier:ticket_tiers(name), order:orders(order_number, created_at)'\n" +
      '    )\n' +
      "    .eq('event_id', eventId)\n" +
      "    .order('created_at', { ascending: true })\n" +
      '  const rows = (rawTickets ?? []) as unknown as RawTicket[]',
  },
  {
    what: 'the marketing consents are read unbounded',
    file: ATTENDEES,
    find:
      "    const consentRows = await readEveryRow<ConsentRow>('the organiser marketing consents', (from, to) =>\n" +
      '      admin\n' +
      "        .from('organiser_marketing_consents')\n" +
      "        .select('email, status, unsubscribe_token')\n" +
      "        .eq('organisation_id', eventRow.organisation_id)\n" +
      "        .order('id', { ascending: true })\n" +
      '        .range(from, to) as unknown as PromiseLike<{ data: ConsentRow[] | null; error: { message: string } | null }>,\n' +
      '    )\n' +
      '    const built = buildConsentIndex(consentRows)',
    replace:
      '    const { data: rawConsents } = await admin\n' +
      "      .from('organiser_marketing_consents')\n" +
      "      .select('email, status, unsubscribe_token')\n" +
      "      .eq('organisation_id', eventRow.organisation_id)\n" +
      '    const built = buildConsentIndex((rawConsents ?? []) as ConsentRow[])',
  },
  {
    what: 'the orders report reads unbounded, newest first',
    file: ATTENDEES,
    find:
      "  const orders = (await readEveryRow<RawOrder>('the event orders report', (from, to) =>\n" +
      '    admin\n' +
      "      .from('orders')\n" +
      '      .select(\n' +
      "        'order_number, created_at, status, currency, subtotal_cents, discount_cents, platform_fee_cents, processing_fee_cents, total_cents, user_id, guest_name, guest_email, order_items(item_type, quantity)'\n" +
      '      )\n' +
      "      .eq('event_id', eventId)\n" +
      "      .order('id', { ascending: true })\n" +
      '      .range(from, to) as unknown as PromiseLike<{ data: RawOrder[] | null; error: { message: string } | null }>,\n' +
      '  )).sort(byOrderReadingOrder)',
    replace:
      '  const { data: rawOrders } = await admin\n' +
      "    .from('orders')\n" +
      '    .select(\n' +
      "      'order_number, created_at, status, currency, subtotal_cents, discount_cents, platform_fee_cents, processing_fee_cents, total_cents, user_id, guest_name, guest_email, order_items(item_type, quantity)'\n" +
      '    )\n' +
      "    .eq('event_id', eventId)\n" +
      "    .order('created_at', { ascending: false })\n" +
      '  const orders = (rawOrders ?? []) as unknown as RawOrder[]',
  },
  {
    what: 'the orders screen reads unbounded, newest first',
    file: ORDERS_PAGE,
    find:
      "  const orders = (await readEveryRow<OrderSummaryRow>('the event orders', (from, to) =>\n" +
      '    adminClient\n' +
      "      .from('orders')\n" +
      '      .select(ORDER_SUMMARY_SELECT)\n' +
      "      .eq('event_id', eventId)\n" +
      "      .order('id', { ascending: true })\n" +
      '      .range(from, to) as unknown as PromiseLike<{ data: OrderSummaryRow[] | null; error: { message: string } | null }>,\n' +
      '  )).sort(byOrderReadingOrder)',
    replace:
      '  const { data: rawOrders } = await adminClient\n' +
      "    .from('orders')\n" +
      '    .select(ORDER_SUMMARY_SELECT)\n' +
      "    .eq('event_id', eventId)\n" +
      "    .order('created_at', { ascending: false })\n" +
      '  const orders = (rawOrders ?? []) as unknown as OrderSummaryRow[]',
  },
]

const sha = text => createHash('sha1').update(text).digest('hex')
const read = file => readFileSync(join(ROOT, file), 'utf8')
const write = (file, text) => writeFileSync(join(ROOT, file), text, 'utf8')

const touched = [...new Set(REGRESSIONS.map(r => r.file))]
const original = new Map(touched.map(f => [f, read(f)]))
const originalHash = new Map(touched.map(f => [f, sha(original.get(f))]))

let exitCode = 0

function restore() {
  for (const file of touched) write(file, original.get(file))
  for (const file of touched) {
    const now = sha(read(file))
    const was = originalHash.get(file)
    console.log(`  ${now === was ? 'RESTORED' : 'NOT RESTORED'}  ${file}  ${now === was ? was : `${was} -> ${now}`}`)
    if (now !== was) exitCode = 1
  }
}

console.log('=== LB-ATTENDEEWHOLE COUNTER-PROOF ===\n')
console.log('Putting four reads back exactly as they shipped, then requiring the drive to FAIL.\n')

try {
  for (const regression of REGRESSIONS) {
    const before = read(regression.file)
    const occurrences = before.split(regression.find).length - 1
    if (occurrences !== 1) {
      throw new Error(
        `"${regression.what}": the text to replace appears ${occurrences} time(s) in ${regression.file}, ` +
          'and it must appear exactly once. The file has moved on; update this script rather than ' +
          'running it against a tree it no longer describes.',
      )
    }
    write(regression.file, before.replace(regression.find, regression.replace))
    console.log(`  PLANTED  ${regression.what}`)
  }

  console.log(`\nwaiting ${RECOMPILE_WAIT_MS / 1000}s for next dev on 3100 to recompile the patched tree\n`)
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RECOMPILE_WAIT_MS)

  const drive = spawnSync(
    process.execPath,
    [
      '--env-file=.env.local',
      join(ROOT, 'scripts/verify/lb-attendeewhole-drive.mjs'),
      '--out',
      'C:/dev/EVIDENCE/LB-ATTENDEEWHOLE/counter-proof',
    ],
    { encoding: 'utf8', cwd: ROOT, maxBuffer: 64 * 1024 * 1024 },
  )
  const output = `${drive.stdout ?? ''}${drive.stderr ?? ''}`
  console.log(output.split('\n').filter(l => /FAIL|PASS|checks passed|FATAL/.test(l)).join('\n'))

  console.log(`\ndrive exited ${drive.status}`)
  if (drive.status === 0) {
    console.error(
      '\nCOUNTER-PROOF FAILED: the drive PASSED against the defective code, so it is not testing ' +
        'what it claims to test. Every assertion it makes is satisfied by a read capped at 1,000 ' +
        'rows, which means none of them is about the ceiling.',
    )
    exitCode = 1
  } else {
    console.log('\nCOUNTER-PROOF HELD: the drive refused the defective tree.')
  }
} catch (error) {
  console.error(`\nFATAL ${error.stack ?? error}`)
  exitCode = 1
} finally {
  console.log('\n--- restoring ---')
  restore()
}

process.exit(exitCode)
