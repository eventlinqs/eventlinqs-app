# App stores, wallets and the scanner: research only, nothing built

16 August 2026. Law 7 throughout: every specification below carries the primary
source it came from, and anything I could not source from a first-party page is
marked **UNSOURCED** rather than asserted. Nothing in this document was built.

**The one-line answer to each question, before the detail.**

| Question | Answer |
|---|---|
| What does our manifest and service worker lack for a Play submission? | A Digital Asset Links file, and a service worker that serves anything offline. The manifest itself is close to complete |
| Can Expo build iOS without a Mac? | **Yes.** EAS runs iOS builds on Expo's own macOS cloud. No Mac needed to BUILD. An Apple Developer Program membership at 99 USD a year is still needed to DISTRIBUTE |
| Apple Wallet passes: what is required? | Apple Developer Program membership (99 USD/year), a Pass Type ID, a signing certificate and Apple's WWDR intermediate. Passes are signed `.pkpass` bundles. No review, no per-pass approval |
| Google Wallet passes: what is required? | A Google Wallet API issuer account, a Google Cloud service account, and a **publishing-access request** before real users can be issued passes. No fee found for the issuer account |
| Does the scanner work offline today? | **No. Not at all**, and the reason is structural rather than a missing feature. See section 5 |
| Does iOS evict a home-screen PWA after seven days? | **The premise is wrong, per WebKit's own post.** Home screen web apps are explicitly outside Safari's seven-day counter. See section 5b |

---

## 1. What the manifest and the service worker lack for a Trusted Web Activity

**What we have.** `src/app/manifest.ts` (a Next.js `MetadataRoute.Manifest`) already
declares `name`, `short_name`, `description`, `start_url`, `display: 'standalone'`,
`orientation`, `background_color`, `theme_color`, `categories`, and five icons
including a 512 maskable one. That is a solid installable manifest.

**What we do NOT have, and each one is a real gap.**

| # | Gap | Why it matters | Effort |
|---|---|---|---|
| 1 | **No Digital Asset Links file.** There is no `public/.well-known/assetlinks.json` and no route serving one | Chrome's TWA documentation states the app and the site "are expected to come from the same developer. (This is verified using Digital Asset Links.)" (https://developer.chrome.com/docs/android/trusted-web-activity/, fetched 2026-08-16). Without it the TWA falls back to showing a browser address bar, which defeats the point | 1 hour, once the signing key exists. The file carries the app package name and the SHA-256 fingerprint of the signing certificate, so it cannot be written before the key is generated |
| 2 | **No offline service worker.** `public/push-sw.js` is the only worker and its own header says it is "Deliberately push-only: it registers NO fetch handler" | Nothing is cached. Every navigation needs the network. The TWA will show Chrome's offline page | See section 5, where this is the same gap that stops the scanner working |
| 3 | **No `scope`, no `id`, no `screenshots`, no `shortcuts` in the manifest** | `id` is what keeps an installed app identified as the same app across a `start_url` change. `screenshots` is what a richer install prompt uses. `shortcuts` would put "Scan tickets" and "My tickets" on the long-press menu | 2 hours |
| 4 | **No signed Android artefact and no Play account** | Play registration is a **US$25 one-time fee**, and an individual account may be asked for "a valid government ID and a credit card, both under your legal name" (https://support.google.com/googleplay/android-developer/answer/6112435, fetched 2026-08-16) | Half a day, plus Google's verification turnaround, which is not published as a fixed number and is therefore **UNSOURCED** |
| 5 | **Target API level** | New apps and app updates must target **Android 16 (API level 36)** or higher as of 31 August 2026, with an extension available to 1 November 2026 (https://developer.android.com/google/play/requirements/target-sdk, fetched 2026-08-16). Bubblewrap generates the wrapper, so this is a generator setting rather than our code | Included in item 4 |

**On the qualification bar itself, honestly.** The Chrome page states "there are
currently no qualifications for content opened in the preview of Trusted Web
activities" and that they "will need to meet the same Add to Home Screen
requirements" in future. That page reads as written for an earlier preview
period, so I am NOT treating it as a current statement of Play policy. Whether
Play today applies a PWA quality bar to a TWA submission is **UNSOURCED**: I did
not find a first-party page that says so either way.

**Recommended tooling, from the same page:** "Bubblewrap, a NodeJs library / CLI
to generate and build Trusted Web Activity projects".

**Sequence, if this is done at all:** offline service worker first (it is the
same work as the scanner), then manifest completion, then the Play account and
key, then assetlinks, then Bubblewrap. About **three to four days** of work plus
Google's verification wait.

---

## 2. Expo, and whether a Mac is needed

**No Mac is needed to build.** Expo's own documentation states:

> "Android builds run on Linux runners hosted in Google Cloud Platform, and iOS
> builds run on macOS runners hosted in Expo's macOS cloud."
> (https://docs.expo.dev/build/introduction/, fetched 2026-08-16)

That is the single fact the founder asked for, and it settles the hardware
question: **EAS Build can produce iOS builds without owning a Mac.**

Two qualifications that matter as much as the answer:

1. **Building is not distributing.** Shipping to the App Store or to TestFlight
   requires an **Apple Developer Program membership at 99 USD per membership
   year** (https://developer.apple.com/support/compare-memberships/, fetched
   2026-08-16, which states "Enrollment is 99 USD (or in local currency where
   available) per membership year"). The same page distinguishes the free Apple
   Account, which does NOT include app distribution: "To distribute apps, join
   the Apple Developer Program."
2. **EAS pricing was not checked.** Whether the free EAS tier is enough for our
   build volume is **UNSOURCED**; I did not fetch Expo's pricing page.

**Sequence:** this only matters if we decide to ship a real native app rather
than a TWA. It is not needed for wallets and not needed for the scanner.

---

## 3. Apple Wallet passes

Source: https://developer.apple.com/documentation/walletpasses/building-a-pass
(fetched 2026-08-16). The page describes a pass as a bundle built from:

- a **pass type identifier** (registered in the developer account),
- a **signing certificate** for that pass type,
- the **Apple WWDR intermediate certificate**,
- a **`manifest.json`** of hashes of every file in the pass,
- a **`signature`** over that manifest,
- all zipped into a **`.pkpass`** bundle.

**Membership.** Obtaining the pass-type signing certificate requires an Apple
Developer Program membership, which is the same 99 USD per year cited above.
I am recording that as **derived from the two pages above rather than quoted
from one sentence**, because the membership page speaks about app distribution
and the pass page speaks about certificates; no single first-party sentence I
fetched says "a Pass Type ID requires paid membership" in those words.

**No review.** Nothing on the pass-building page describes an approval or review
step for passes themselves. Once the certificate exists, we sign and serve.

**Australian specifics:** none found. Apple prices in USD "or in local currency
where available"; the exact AUD figure is **UNSOURCED**.

**Effort:** the signing and bundling is a well-understood two to three days,
most of which is certificate handling and the pass layout. The recurring cost is
the 99 USD membership.

---

## 4. Google Wallet passes

Source: https://developers.google.com/wallet/tickets/events (fetched
2026-08-16). What it requires:

- **A Google Wallet API Issuer account**, created before development begins.
- **A Google Cloud account** and a service account for REST API access. The page
  offers a REST API and an Android SDK; the REST API is the one that fits us,
  because it issues passes from a web platform by link or email.
- **A publishing-access request.** The page's own navigation carries "Request
  publishing access" under "Testing and go live", so there IS a gate between
  development and issuing passes to real users. **What that review asks for and
  how long it takes is UNSOURCED**: the page I fetched names the step without
  describing it.

**Cost:** no fee is stated for an issuer account on that page. Whether one
exists is **UNSOURCED** rather than "free".

**Australian specifics:** none found.

**Effort:** two to three days for the REST integration, plus an unknown wait on
publishing access. That unknown is the reason to start the request early if
wallets are wanted for launch.

**The honest comparison.** Apple has a cost and no review; Google has a review
and no stated cost. If wallet passes are wanted, request Google publishing
access on day one and build Apple in parallel, because the Apple path has no
external wait in it.

---

## 5. The scanner, offline: it does not work, and here is exactly why

**Verdict: NO. Today, with no network, in a venue, the scanner does not work at
all.** This is not one missing feature; it is four independent reasons, and any
one of them alone would be enough.

| # | What blocks it | Evidence |
|---|---|---|
| 1 | **The page cannot load.** `src/app/scan/[eventId]/page.tsx` sets `export const dynamic = 'force-dynamic'`, so every visit is a server render. There is no cached shell to fall back to | that file, line 6 |
| 2 | **Nothing is cached, by design.** The only service worker is `public/push-sw.js`, whose header states it "registers NO fetch handler, so it never intercepts navigations or assets". A worker with no fetch handler cannot serve anything offline | `public/push-sw.js`, lines 3 to 6 |
| 3 | **The scan itself is a round trip.** `Scanner` calls a server action per scan, which reaches the database. Offline that call fails | `src/components/features/scanner/scanner.tsx`, `src/app/scan/actions.ts` |
| 4 | **There is no queue and no local store.** A search of `src/app/scan/` and `src/components/features/scanner/` for `offline`, `navigator.onLine`, `localStorage` and `indexedDB` returns nothing. A scan attempted offline is lost rather than deferred | grep, 16 August 2026 |

The only part that does work offline is the QR decode itself, because
`BarcodeDetector` is a browser API.

**What it would take, in order.**

1. **A guest list downloaded before the doors open**, held in IndexedDB. The
   admit-once decision is a compare-and-set, so an offline scanner must hold the
   valid ticket set and record its own admissions.
2. **A real service worker with a fetch handler** for the scan route and its
   assets, and the scan page moved off `force-dynamic` so there is something
   cacheable.
3. **An outbox** that replays admissions when the network returns, and a
   reconciliation rule for the case two doors admit the same ticket while both
   are offline. That rule is a founder decision, not an engineering one: the
   choices are last-writer-wins, first-writer-wins, or flag-for-review.

**Roughly a week**, and the third item is the part that needs a ruling before
any of it is worth starting.

### 5b. The seven-day eviction premise is wrong

The brief states that "iOS evicts home-screen PWAs after roughly seven days of
disuse, taking cached data with them, which is exactly wrong for a scanner used
once a month". That is worth correcting, because it is the argument that would
otherwise force a native app.

WebKit's own announcement of the policy says the opposite for installed web
apps:

> "Web applications added to the home screen are not part of Safari and thus
> have their own counter of days of use. Their days of use will match actual use
> of the web application which resets the timer."

and

> "We do not expect the first-party in such a web application to have its
> website data deleted"

(https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/,
fetched 2026-08-16). The seven-day cap covers "Indexed DB, LocalStorage, Media
keys, SessionStorage, Service Worker registrations and cache" after "seven days
of Safari use without user interaction on the site" -- Safari use, and the
installed web app has its own counter that advances only when the app is used.

**Two caveats, stated rather than buried.** That post is from 2020. Whether the
behaviour is unchanged in the current iOS is **UNSOURCED**: I did not find a
2026 first-party page restating it. And the exemption is about the FIRST PARTY
in an installed web app, so it does not license careless storage elsewhere.

**What this changes.** A home-screen PWA is not disqualified as a scanner by a
seven-day eviction rule, which removes the strongest reason to build a native
app. The remaining reasons to prefer native are camera performance and the
absence of `BarcodeDetector` on iOS Safari, and the second of those is
**UNSOURCED** here: I did not check current iOS support for `BarcodeDetector`,
and it decides whether the scanner works on an iPhone at all today. **That is
the single most useful next check on this whole subject**, because it is cheap
and it changes the answer.

---

## 6. Effort and sequence, all together

| Work | Effort | Depends on | Worth doing when |
|---|---|---|---|
| Check `BarcodeDetector` on current iOS Safari | 30 minutes | nothing | **Immediately.** It decides whether the scanner works on an iPhone today |
| Offline scanner (worker, IndexedDB guest list, outbox) | about a week, plus a founder ruling on double-admit | the check above | Before the first event with a real door |
| Apple Wallet passes | 2 to 3 days plus 99 USD/year | Apple Developer Program | When a buyer asks for it, which they will |
| Google Wallet passes | 2 to 3 days plus an unknown review wait | issuer account, publishing access | Start the access request early, build second |
| Manifest completion (`id`, `scope`, screenshots, shortcuts) | 2 hours | nothing | Cheap, do it with the offline worker |
| TWA on Play | 3 to 4 days plus US$25 and ID verification | the offline worker, a signing key, assetlinks | After the wallet passes. A store listing without an offline scanner is a wrapper around a website |
| Native app via Expo | weeks | Apple Developer Program | Only if the offline scanner proves impossible on the web, which the WebKit finding above suggests it is not |

**The ordering argument in one sentence:** a buyer needs their ticket in a wallet
more than they need an app, and an organiser needs a scanner that works in a
basement more than they need either, so wallets and the offline scanner come
before any store listing.
