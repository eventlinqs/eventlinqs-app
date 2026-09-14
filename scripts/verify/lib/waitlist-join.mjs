/**
 * ONE WAY TO PUT A REAL PERSON ON A REAL WAITING LIST, through the interface.
 *
 * EXTRACTED 14 SEPTEMBER 2026 (close-out R1) from d2-waitlist-proof.mjs, which
 * had the only working implementation. R1 needs a queue behind a sold-out place
 * so it can prove that a refund issued OUTSIDE the application still offers the
 * freed place down the list, and a second copy of this dance would drift from
 * the first within a month: every line below is a lesson a run paid for, and a
 * copy inherits the lessons frozen at the moment it was made.
 *
 * WHY IT IS THE UI AND NOT THE RPC. `join_waitlist` alone writes the inventory
 * hold and nothing else. The OFFER a freed place produces is composed by the
 * recovery engine from the LEDGER's `waitlist_join` rows, which carry the
 * address, and those are written by the server action after the RPC
 * (src/app/actions/waitlist.ts). Calling the RPC directly would put somebody on
 * a list that nothing could ever write to, and a proof that quietly removed the
 * email it exists to observe would pass while proving nothing.
 *
 * THE FOUR THINGS A RUN PAID FOR, kept verbatim because each was a wrong verdict:
 *
 *   1. THE MODAL SUBMIT, NOT THE BUTTON THAT OPENED IT. Clicking
 *      `^(join|confirm|add me)` matched the TRIGGER again, because it is still in
 *      the DOM and still visible behind the dialog, so the form was never
 *      submitted: three PASSes about joining a queue, and an empty waitlist table
 *      underneath them.
 *   2. PRESSED WHERE A FINGER LANDS. `locator.click()` timed out on that button
 *      twice: the modal is `position: fixed` inside a document whose `html, body`
 *      carry `overflow-x: clip` (globals.css) and Playwright's scroll step never
 *      settles on that combination. Nothing about the button is wrong and a
 *      person never scrolls to reach it, so the drive reads the button's box,
 *      checks the button IS what sits at that point, and presses the mouse there.
 *   3. THE POINT IS MEASURED INSIDE THE PAGE with `getBoundingClientRect`, which
 *      is viewport-relative by definition. An earlier run used Playwright's
 *      `boundingBox()` and then asked `elementFromPoint`: two different
 *      coordinate spaces, and a reachability check measuring the wrong pixel
 *      reported "covered by the hero". A drive that indicts the product for its
 *      own arithmetic is worse than no drive.
 *   4. WAIT FOR THE ROW, NOT FOR A CLOCK. Five seconds then count recorded a
 *      FAILED join whose row arrived at about six, and then attributed that row
 *      to the next person, who had never submitted anything.
 *
 * THE ROW IS THE ANSWER, not which control was pressed: there are two ways in,
 * the tickets panel opens the dialog and the ticket selector joins directly with
 * no dialog at all, and an earlier version reported a perfectly good direct join
 * as a failure.
 */

const DIALOG = '[role=dialog][aria-labelledby=waitlist-modal-title]'
const SUBMIT = `${DIALOG} button[type=submit]`

/** Click the first visible control whose text matches. */
async function clickText(page, rx) {
  for (const el of await page.$$('button, a[role=button], a')) {
    const t = ((await el.innerText().catch(() => '')) || '').trim()
    if (rx.test(t) && (await el.isVisible().catch(() => false))) {
      await el.click().catch(() => {})
      return t
    }
  }
  return null
}

/**
 * Put the signed-in person on the waiting list for a sold-out event.
 *
 * @param {import('playwright').Page} page  a page whose context is already signed in
 * @param {object} opts
 * @param {string} opts.base        the server under test
 * @param {string} opts.slug        the event slug
 * @param {() => Promise<number>} opts.queueLength  reads the waitlist row count
 * @param {number} opts.wanted      the count that means this join landed
 * @param {(m: string) => void} [opts.log]
 * @returns {Promise<{ joined: string|null, confirmed: string|null, reach: object|null,
 *                     dialogSaid: string, queued: number, ok: boolean }>}
 */
export async function joinWaitlistThroughTheUi(page, { base, slug, queueLength, wanted, log = () => {} }) {
  await page.goto(`${base}/events/${slug}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(2500)

  const joined =
    (await clickText(page, /join (the )?wait ?list/i)) ?? (await clickText(page, /notify me/i))
  await page.waitForTimeout(2500)

  const submit = page.locator(SUBMIT).first()
  let confirmed = null
  let reach = null
  if (await submit.count()) {
    confirmed = (await submit.innerText().catch(() => '')).trim()
    reach = await page.evaluate((sel) => {
      const button = document.querySelector(sel)
      if (!button) return null
      const box = button.getBoundingClientRect()
      const x = box.left + box.width / 2
      const y = box.top + box.height / 2
      const topmost = document.elementFromPoint(x, y)
      return {
        x,
        y,
        reached: Boolean(topmost && topmost.closest('button') === button),
        topmost: topmost
          ? `${topmost.tagName.toLowerCase()} "${(topmost.textContent ?? '').trim().slice(0, 40)}"`
          : 'nothing',
      }
    }, SUBMIT)
    if (reach) await page.mouse.click(reach.x, reach.y)
  } else {
    confirmed = await clickText(page, /^join waitlist:/i)
  }
  await page.waitForTimeout(3000)

  const dialogSaid = await page
    .locator(DIALOG)
    .first()
    .innerText()
    .then((t) => t.replace(/\s+/g, ' ').trim().slice(0, 200))
    .catch(() => '(the dialog is gone, which is what a join looks like)')
  log(`after the press: ${page.url().replace(base, '')} and the dialog says: ${dialogSaid}`)

  let queued = await queueLength()
  for (let i = 0; i < 20 && queued < wanted; i += 1) {
    await page.waitForTimeout(1000)
    queued = await queueLength()
  }

  return { joined, confirmed, reach, dialogSaid, queued, ok: Boolean(joined) && queued >= wanted }
}
