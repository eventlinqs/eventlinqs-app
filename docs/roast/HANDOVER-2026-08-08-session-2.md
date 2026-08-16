# HANDOVER: feat/launch-kit-moat, session 2

Written 8 August 2026 at a clean stop, per the scope ruling. Branch
`feat/launch-kit-moat`, 9 commits on top of the predecessor's 5.
**Nothing merged. Nothing pushed. Nothing applied to production.**

Gates at HEAD: tsc clean, eslint **47 warnings 0 errors**, **1366 tests across
125 files** (predecessor 1302 across 121), copy-tell-gate clean.

---

## 1. WHAT SHIPPED, and the proof for each

| Commit | What | Proof |
|---|---|---|
| `bf82993` | The waitlist bridge, `city_primary` root fix, digest tracked links | 22 of 23 end-to-end assertions on TEST, `docs/roast/WAITLIST-BRIDGE.md` |
| `eaa9f3f` | Law 6, render never generate, plus the Higgsfield boundary and the Midjourney strike | CLAUDE.md, MASTER-PLAN-V1.md |
| `8364107` | Migration runbook and a verifier that does not trust the migration | Baseline captured pre-push |
| `74d0a80` | Twelve silent-break candidates named | `docs/roast/SILENT-BREAK-CANDIDATES.md` |
| `96fae24` | Correction of the 91 percent figure, plus the read-only production probe | Production measured |
| `f763431` | reach-integrity harness, 16 checks | `production-BEFORE.txt`, 4 pass 9 FAIL 4 empty, exit 1 |
| `483870c` | Newsletter capture stores the address | BEFORE and AFTER committed, check FAIL to PASS |
| `4ef556c` | Scheduled events actually publish | Live flip proven on TEST, `docs/roast/scheduled-publish/PROOF.txt` |
| `2a701db` | Category landings filter in the query | music 0 to 6, sports 0 to 5, nightlife 0 to 6 on TEST |

---

## 2. THE MISTAKE I MADE, so it is not repeated

I measured `city_primary` coverage on TEST (8.8 percent), reported it, and let
it drive the priority conversation. Production is 84 percent. The root defect
was real and the fix stands, but the blast radius was 5 events, not 330.

**The harness exists because of this.** It takes PRODUCTION as its
authoritative target and TEST as the CI target, and it will not let the
convenient database stand in for the real one again.

---

## 3. reach-integrity: the current board

`node scripts/verify/reach-integrity.mjs --production` (read only, exit 1 on
any FAIL). `--code-only` needs no database.

**PASS (5):** newsletter-persists, scheduled-events-publish, city-primary-written,
category-landing-filters-in-query, follow-write-matches-alert-read,
digest-links-are-tracked, community-tag-coverage.

**FAIL, still open (5):**

| Check | What it means | Est. |
|---|---|---|
| `suburb-primary-written` | Every suburb page is permanently empty of organiser events. **The fix is NOT the city fix**: a suburb cannot be derived from a city name, so it needs a picker or geocoding, and inventing one from an address is what Law 6's spirit forbids | 4 to 6 h |
| `url-filters-parsed` | 6 filters appear in links a user can click and none is parsed: `city`, `date`, `suburb`, `event_type`, `venue`, `tab`. Every "View all" on a city page lands on the unfiltered national list | 3 to 5 h |
| `search-matches-more-than-title` | `ilike` on title only, no index. Nine of twelve Sounds tiles and three of four search tabs are dead ends | 6 to 10 h |
| `city-primary-coverage` | 27 of 32 on production. Waits on migration 20260808000001 | migration |
| `share-view-beacon-fires` | 3 views against 57 clicks on production | investigate |
| `flags-off-by-oversight` | `broadcast_follow` and `broadcast_artists` have no recorded decision | founder |

**EMPTY, not pass and not failure (4):** digest-audience-reachable,
share-conversions-fire, push-subscribers-exist, featured-events-exist. Each
becomes a real measurement the moment traffic arrives. None is a clean bill of
health.

---

## 4. THE NEXT STEP, in order

1. **Share conversions, proven or reported broken.** The founder ranked this
   first among the unfixed and I agree. Production cannot settle it: 1 order, 0
   paid, 0 of 17 organisations able to charge, so the zero conversions proves
   nothing. **It must be settled by driving a real paid purchase through a
   tracked link on TEST** and watching for the `share_link_events` conversion
   row. The cookie is `el_share_code`, set at `/s/[code]`
   (`src/app/s/[code]/route.ts`), and the conversion is written by
   `src/lib/broadcast/conversion.ts`. The question is whether the cookie
   survives the whole checkout and is read at order creation. Est. 3 to 5 h.
   Memory notes a working paid-purchase harness at
   `scripts/verify/paid-purchase-webhook-e2e.mjs`.
2. **The three remaining discovery breaks** in the table above.
3. **The output review harness (founder ruling 3).** NOT STARTED. The digest
   half exists (`?preview_to=` renders the mail and sends nothing, and it found
   three defects). What is missing is the organiser-copy half: dump generated
   copy for a fixed set of realistic organiser inputs on every run so a human
   reads what was produced. Est. 4 to 6 h.
4. **The predecessor's Parts A to E**, untouched this session: A1 public
   composer, A2 story/square cards, A3 spread mechanic, A4 positioning sweep,
   B1 organiser logo, B2 the four zeros, C6 venue address, C7 and E1 voice, D2
   and D4 walkthrough, E2 images and video, E3 composer desk. **A4 (3 to 5 h)
   and B2 (3 to 4 h) remain the cheapest.** All estimates in the predecessor's
   handover still stand.
5. **R1, the category taxonomy migration.** Still unwritten. `event_categories`
   has no Comedy row while the homepage offers a comedy tile and a comedy rail,
   so both can never match. The category fix in `2a701db` proved this: comedy
   was the one category that stayed at 0 after the repair.

---

## 5. GOTCHAS THAT COST ME TIME

- **An orphaned `next start -p 3000` from a previous session served stale code**
  and made a proof fail for the wrong reason. Killed. Check the port before
  trusting a local run: `Get-NetTCPConnection -LocalPort 3000 -State Listen`.
- **Login fails closed under `NODE_ENV=production` with no Upstash.** Use
  `next dev` for any proof that needs a sign-in, on a port that is free.
- **PostgREST returns HTTP 400 with an EMPTY error message** when you filter an
  enum column by a value that is not in the enum. `if (error)` passes on `''`,
  so a query that never ran looks like a successful one returning null. There
  is no `paid` in `order_status`; it is `confirmed`, `partially_refunded`,
  `refunded`.
- **`events.end_date` is NOT NULL**, which is not obvious when cloning a row.
- **`.env.local` is PRODUCTION.** `.env.test` is TEST. The production probe
  refuses to run against anything but production and is read only by proxy;
  reach-integrity refuses the reverse.
- Reading real output found six defects this session that tests did not: three
  in the digest email, three in the harness itself. **Every single one passed
  its tests.**
