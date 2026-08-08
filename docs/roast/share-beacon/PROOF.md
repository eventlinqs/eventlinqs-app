# share-view-beacon-fires: the beacon was never broken. The click count was.

Written 8 August 2026, branch `feat/launch-kit-moat`.

## What the check was reporting, and why it could not settle it

`reach-integrity` failed `share-view-beacon-fires` on production with 3 views
against 57 clicks. Its own note admitted it could not distinguish the two
possible causes: "Either most clicks are scanners that never run JavaScript, or
the beacon is not firing." Those are completely different findings and only one
of them is a severed feature.

## The production data settles it

Read-only probe of `share_link_events` on production:

```
production share_link_events: 60
  clicks: 57, views: 3, conversions: 0

distinct visitor_hash among clicks: 55
distinct visitor_hash among views : 3
click visitors that also produced a view: 1 of 55

clicks by channel:
   31  facebook
   26  x

top click visitors (a burst from one hash is a scanner signature):
    2 clicks over 535263s   produced a view: false
    2 clicks over 36276s    produced a view: false
    1 clicks over 0s        produced a view: false
```

Four things, together conclusive:

1. **Every single click was on a `facebook` or an `x` link.** Not one on
   whatsapp, email, copy or native.
2. **55 distinct visitor hashes across 57 clicks.** Not one scanner hammering,
   which is what the "burst" test was looking for and did not find. It is a
   crawler FLEET: Facebook and X fetch a posted URL from many different
   addresses to build the preview card.
3. **Only 1 of those 55 ever ran the view beacon.**
4. **Views do exist**, 3 of them, on 2026-08-01 and 2026-08-02.

Point 4 is decisive on its own. **The beacon fires.** A view row can only exist
if a real browser ran the script, kept the cookie and the endpoint accepted it.

## The real defect, which is upstream

Those 57 crawler hits were being **counted as clicks and shown to the
organiser**. An organiser who shared their event once and had no human visitors
at all would open their reach panel and read "57 clicks, 0 sales".

That reads as "my audience clicked and did not buy". The truth is that nobody
clicked. **A number that points someone at the wrong conclusion is worse than no
number**, and the Launch Kit's whole claim is honestly measured reach.

### The fix

`src/lib/broadcast/crawlers.ts`: `/s/[code]` now identifies link-preview
crawlers and records **nothing** for them, and sets no attribution cookie. The
redirect still happens, because a shared link must never break, and the preview
card still renders, because the crawler still gets the page it asked for.

**The direction of error is deliberate.** Treating a human as a crawler
undercounts, which is the safe way to be wrong for a panel that must never
overstate. Treating a crawler as a human overstates, which is the defect. So the
list is specific tokens rather than a loose "contains bot" match, and there are
nine explicit assertions that real browsers are never dropped.

The subtle one, which has both sides in the same word:

```
facebookexternalhit/1.1                        -> crawler
Mozilla/5.0 (iPhone ...) [FBAN/FBIOS;FBAV/...] -> a PERSON in the Facebook app
```

The second is exactly the audience a shared link exists to reach.

## The proof

**Unit** (`tests/unit/broadcast/crawlers.test.ts`, 26 tests): the agents that
produced every production click, twelve other unfurlers, a missing user agent,
and nine real browsers including both in-app browsers.

**End to end** (`node scripts/verify/share-beacon-e2e.mjs`) - **13 pass, 0
FAIL**. Two halves that pull in opposite directions, so passing both is the
whole assertion:

```
a crawler hit records nothing, and still redirects
  [PASS] Facebook still gets its redirect     HTTP 302 -> /events/comedy-lineup-live-at-brisbane-hotel-hobart
  [PASS] Facebook gets no attribution cookie
  [PASS] X still gets its redirect            HTTP 302 -> ...
  [PASS] X gets no attribution cookie
  [PASS] WhatsApp still gets its redirect     HTTP 302 -> ...
  [PASS] WhatsApp gets no attribution cookie
  [PASS] Slack still gets its redirect        HTTP 302 -> ...
  [PASS] Slack gets no attribution cookie
  [PASS] no crawler was counted as a click    0 -> 0 click rows across 4 crawler hits

a real browser is still counted, and the view beacon still fires
  [PASS] the browser landed on the event page
  [PASS] the browser DID get the attribution cookie   el_share_code=Htve83OtXY
  [PASS] the real browser WAS counted as a click      0 -> 1 click rows
  [PASS] the view beacon fired                        0 -> 1 view rows
```

**The harness caught my own filter first.** Its initial run failed the three
real-browser legs, because Playwright's default user agent contains
"HeadlessChrome", which the filter drops deliberately (headless Chrome is
synthetic; Lighthouse audits run as one). The harness now sets an explicit real
Chrome agent, because it has to present as the thing it is simulating. Had I
only run the crawler half, I would have shipped a filter that silently dropped a
class of real visitors.

## The check now asks the question it can answer

`share-view-beacon-fires` used to fail below a ratio it could not interpret. It
now fails only on the severed case, **zero views against real clicks**, which is
the only shape that means the feature cannot fire. The ratio is still reported,
because traffic composition is worth seeing, but a low ratio is a fact about the
audience and not a broken feature.

Production board after the change:

```
[PASS ] share-view-beacon-fires  (data)
         3 views against 57 clicks (5.3 percent). The beacon fires; the ratio is
         a fact about who is clicking, not a severed feature
```

## What this does NOT do

The 57 historical crawler rows on production **are still there and still
counted**. Nothing was written to production. Deleting or reclassifying them is a
data edit on the live database and is yours to approve; the filter only prevents
new ones. If you want the history cleaned, the shape of the query is in the
probe and it needs your sign-off and a production approval-block entry.

Gates: tsc clean, eslint 47 warnings 0 errors (the baseline), 1466 tests across
130 files, copy-tell-gate clean.
