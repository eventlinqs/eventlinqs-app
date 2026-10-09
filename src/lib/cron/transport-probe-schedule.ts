/**
 * WHEN THE AUTH SENTINEL MAY SEND ITS TRANSPORT PROBE.
 *
 * The auth sentinel runs every ten minutes (vercel.json, `*\/10 * * * *`), and
 * its check C used to send one real email to `delivered@resend.dev` on EVERY
 * run: 144 a day. Resend counts those sends against the account quota:
 *
 *   "Test emails count against your account's sending quota."
 *   https://resend.com/docs/dashboard/emails/send-test-emails (read 2026-10-02)
 *
 * and the free plan allows "100 emails/day" and "3,000 emails/month", with the
 * daily limit resetting "at midnight UTC"
 *   https://resend.com/docs/knowledge-base/account-quotas-and-limits (read 2026-10-02)
 *
 * So the probe alone exhausted the daily quota every night (Resend's own
 * notice, "You have reached 100% of your daily quota for the team eventlinqs",
 * 1 October 2026, 15:40 UTC), after which every ticket confirmation, sign in
 * link and alert email failed until midnight UTC. At 144 a day it would also
 * exhaust the monthly quota by about day 21 of every month.
 *
 * The rule: the probe sends ONCE per UTC day, on the first sentinel run inside
 * the 21:00 UTC hour (07:00 or 08:00 in Melbourne), the same hour as the daily
 * heartbeat. Check D (sender domain verified) still runs every ten minutes,
 * and it is a read that sends nothing, so a revoked key or an unverified
 * domain is still caught within ten minutes.
 *
 * `?probe=transport` on an authorised request forces the probe, for drills.
 *
 * Reversal: if a transport failure is ever first discovered by a failed real
 * send rather than by the daily probe or check D, move the window to every
 * hour (24 a day, still inside the quota) and record why here.
 */

/** The UTC hour in which the daily transport probe is sent. */
export const TRANSPORT_PROBE_UTC_HOUR = 21

/**
 * The sentinel runs every ten minutes, so the first ten minutes of the hour
 * contain exactly one scheduled run.
 */
export const TRANSPORT_PROBE_WINDOW_MINUTES = 10

/** True when this sentinel run should send the one daily transport probe. */
export function shouldSendTransportProbe(now: Date, forced: boolean): boolean {
  if (forced) return true
  return (
    now.getUTCHours() === TRANSPORT_PROBE_UTC_HOUR &&
    now.getUTCMinutes() < TRANSPORT_PROBE_WINDOW_MINUTES
  )
}
