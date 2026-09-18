/**
 * ANSWER THE CONSENT BANNER, ONCE, FOR EVERY DRIVE.
 *
 * WHY THIS IS SHARED RATHER THAN COPIED, written from what the copies did. On
 * 15 September 2026 seven lane B drives each carried their own
 * `answerTheCookieBanner`, in five different versions, and THREE OF THEM COULD
 * NOT DISMISS THE BANNER AT ALL:
 *
 *   ga3-attribution-drive   matched /accept/, /allow/, /^ok$/
 *   ga4-campaigner-drive    matched /accept/, /allow/, /^ok$/
 *   (ga5 had the same matcher until it was fixed in ga5 alone)
 *
 * The banner's two buttons read "That is fine" and "No thanks", so those
 * matchers matched nothing, every call returned false, no caller read the
 * answer, and the banner stayed across the bottom of every capture. GA5's own
 * header records the consequence in full: "at 390 it covered the half of the
 * page the state was being photographed for. The evidence was a picture of a
 * cookie notice."
 *
 * That fix was applied to ONE of the five copies. Six weeks of captures in two
 * other drives kept the defect. A helper that five files each own is five
 * helpers, and the one that gets fixed is the one somebody happened to be
 * looking at.
 *
 * THE TWO IMPROVEMENTS OVER THE BEST COPY.
 *
 *   1. IT WAITS. `isVisible()` asks about this instant. On a cold `next dev`
 *      route compile the banner has not mounted yet, so the answer is false,
 *      nothing is clicked, and the banner appears immediately afterwards.
 *   2. IT CONFIRMS THE BANNER IS GONE, rather than sleeping 400ms and assuming.
 *      A caller that reads the page straight after wants the banner gone, not
 *      probably gone.
 *
 * THE ANSWER IS THE CALLER'S, and it is written at the call site rather than
 * defaulted silently, because it is a real difference: declining leaves
 * measurement off, which is the right posture for a drive that is not about
 * measurement and writes nothing into a database three lanes share.
 * scripts/verify/an1-consent-drive.mjs deliberately does NOT use this helper:
 * the banner is that drive's subject and it drives every control itself.
 */

/** The banner's own landmark, which is stable in a way its button labels are not. */
export const BANNER = '[aria-label="Cookies and measurement"]'

const LABEL = {
  decline: /no thanks/i,
  accept: /that is fine/i,
}

/**
 * Answer the consent banner and wait until it has gone.
 *
 * @param page a Playwright page
 * @param {{answer?: 'decline'|'accept', timeout?: number}} options
 * @returns {Promise<boolean>} true when a button was pressed and the banner left
 */
export async function answerTheCookieBanner(page, options = {}) {
  const answer = options.answer ?? 'decline'
  const timeout = options.timeout ?? 30000

  /*
   * ASK WHETHER IT WILL EVER APPEAR BEFORE WAITING FOR IT, so the wait can be
   * long without costing anything.
   *
   * 18 September 2026, the three lane merge. The banner moved into
   * `components/analytics/measurement-stack.tsx`, which the root layout now
   * fetches as its own chunk AFTER hydration, to get 3938 bytes gzip of
   * measurement code out of the first load of every route. Nothing about what a
   * visitor receives changed, but the banner now arrives strictly later than it
   * used to, and 8000ms stopped being a safe answer to "has it mounted yet" on a
   * dev server three lanes share. A miss here is SILENT: this returns false, no
   * caller reads it, and the banner sits across the foot of every capture that
   * follows, which is the exact defect this file was written to end.
   *
   * Raising the timeout alone would have been wrong. Most calls are on a page
   * where the decision was already made in the same browser context, so the
   * banner is never going to render and every one of those calls would pay the
   * full wait. The consent decision is stored in a cookie (`el_consent`, see
   * src/lib/analytics/consent.ts), so the question "will a banner appear" has a
   * real answer that costs one evaluate. When the answer is no, this returns at
   * once; when it is yes, it can afford to wait properly.
   */
  const alreadyAnswered = await page
    .evaluate(() => document.cookie.split('; ').some(c => c.startsWith('el_consent=')))
    .catch(() => false)
  if (alreadyAnswered) return false

  const banner = page.locator(BANNER).first()
  try {
    await banner.waitFor({ state: 'visible', timeout })
  } catch {
    return false
  }
  const button = banner.getByRole('button', { name: LABEL[answer] }).first()
  try {
    await button.click({ timeout: 15000 })
  } catch {
    return false
  }
  await banner.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {})
  return true
}
