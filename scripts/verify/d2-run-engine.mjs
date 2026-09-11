/**
 * RUN THE RECOVERY ENGINE FROM A SCRIPT, WITH A CLOCK THE DRIVE CHOOSES.
 *
 * The cron route `/api/cron/recovery-sweep` is the real caller and the drive
 * uses it for the first message, over real HTTP with the real secret. This
 * exists for the two things a real HTTP call cannot do on one afternoon:
 *
 *   1. ADVANCE THE CLOCK. The sequence is 2, 24 and 72 hours, and the route
 *      reads `new Date()` because a production cron must. Proving that message
 *      two is SUPPRESSED after somebody unsubscribes means being at hour 25,
 *      and waiting a day is not a proof strategy. The engine takes `now` as a
 *      parameter for exactly this, so the drive supplies one and says so.
 *      Nothing else about the call differs: same function, same adapter, same
 *      database, same mail transport.
 *
 *   2. ACTIVATE A WAITING LIST. `promoteWaitlist` is called from the Stripe
 *      webhook on a refund, from the squad expiry cron and from the waitlist
 *      expiry cron. A refund needs a Stripe TEST key, and there is none on this
 *      machine (both CLI keys answer api_key_expired and every Vercel record is
 *      sensitive), so the trigger cannot be pulled here. What it calls can be,
 *      and is: the same function, with the same arguments the webhook passes.
 *
 * Usage:
 *   node --import ./scripts/lib/src-alias-loader.mjs scripts/verify/d2-run-engine.mjs \
 *     sweep [--hours-ahead 25]
 *   node --import ./scripts/lib/src-alias-loader.mjs scripts/verify/d2-run-engine.mjs \
 *     promote --event <id> --tier <id> --units 1
 *
 * It prints ONE line of JSON on stdout so the caller parses a result rather
 * than a log.
 */
const args = process.argv.slice(2)
const command = args[0]
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : args[i + 1]
}

if (/gndnldyfudbytbboxesk/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')) {
  console.error('[d2-run-engine] REFUSING: this is the PRODUCTION project and this writes.')
  process.exit(1)
}

const { sweepAbandonedCheckouts, activateWaitlist } = await import('@/lib/fillrate/engine')
const { eventLinqsLinks } = await import('@/lib/recovery/links')
const { sendingRates } = await import('@/lib/fillrate/rates')

if (command === 'sweep') {
  const hoursAhead = Number(flag('hours-ahead', '0'))
  const now = new Date(Date.now() + hoursAhead * 3_600_000)
  /*
   * THE RATES MAY BE STATED, and a drive is the only caller that should.
   *
   * The reversal condition is a rate over what was actually sent, and a drive
   * that unsubscribes one person on every run manufactures its own bad rate:
   * after eight runs the engine correctly cut the sequence to one message, and
   * the drive read its own footprint as a product defect. So a caller can say
   * what rate it is exercising, which lets the drive prove BOTH directions,
   * the sequence under healthy rates and the cut under bad ones, instead of
   * tripping over whichever one it happens to have created.
   *
   * The cron route never passes them. It reads the real numbers, always.
   */
  const stated = flag('sent', null)
  const rates =
    stated === null
      ? await sendingRates()
      : {
          sent: Number(stated),
          unsubscribed: Number(flag('unsubscribed', '0')),
          complained: Number(flag('complained', '0')),
        }
  const result = await sweepAbandonedCheckouts(eventLinqsLinks, now, rates)
  console.log(JSON.stringify({ ok: true, at: now.toISOString(), rates, statedRates: stated !== null, ...result }))
  process.exit(0)
}

if (command === 'promote') {
  const { promoteWaitlist } = await import('@/lib/waitlist/promote')
  const eventId = flag('event')
  const tierId = flag('tier')
  const units = Number(flag('units', '1'))
  if (!eventId || !tierId) {
    console.error('[d2-run-engine] promote needs --event and --tier')
    process.exit(1)
  }
  const promoted = await promoteWaitlist(eventId, tierId, units)
  console.log(JSON.stringify({ ok: true, promoted }))
  process.exit(0)
}

if (command === 'activate') {
  /*
   * The engine half on its own, with a chosen clock, so the drive can be at the
   * moment a hold has just run out and watch the offer pass down the list.
   */
  const { slotById } = await import('@/lib/fillrate/read')
  const slotId = flag('slot')
  const units = Number(flag('units', '1'))
  const hoursAhead = Number(flag('hours-ahead', '0'))
  const inventoryClass = flag('class', null)
  const slot = await slotById(String(slotId))
  if (!slot) {
    console.error(`[d2-run-engine] no slot ${slotId}`)
    process.exit(1)
  }
  const now = new Date(Date.now() + hoursAhead * 3_600_000)
  const result = await activateWaitlist({ slot, unitsFree: units, inventoryClass }, eventLinqsLinks, now)
  console.log(JSON.stringify({ ok: true, at: now.toISOString(), ...result }))
  process.exit(0)
}

console.error(`[d2-run-engine] unknown command ${command}. Expected sweep, promote or activate.`)
process.exit(1)
