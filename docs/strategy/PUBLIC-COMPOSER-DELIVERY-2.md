# The public composer: second delivery report

Branch `feat/public-composer`, 9 August 2026. Pushed, not merged.
Preview: `https://eventlinqs-app-git-feat-public-b39b4c-lawals-projects-c20c0be8.vercel.app`

This supersedes `PUBLIC-COMPOSER-DELIVERY.md`, which contained a false claim.
Roast ledger: `docs/roast/public-composer-build-2026-08-09.md`.

---

## UNFULFILLED

### 1. An organiser cannot supply artwork. BLOCKED by this brief's own constraints.

**What a user experiences.** Every kit is the branded typographic composition.
A DJ with a flyer, a promoter with a designed poster, a market with a logo:
none of them can put it in. Law 6 says "the organiser supplies their artwork
and our job is to RENDER what they give us", and the supply half does not
exist on this surface.

**Why.** The only storage policy is `bucket_id = 'event-images' AND
auth.role() = 'authenticated'` (`20260101000001_baseline_schema.sql:493-497`).
An anonymous upload needs a new storage policy, which is an RLS change plus a
migration. This brief forbids both. The available workaround, a service-role
write from an unauthenticated action, would create an arbitrary-upload
endpoint on our domain with no lifecycle sweep, which is worse than the gap.

**What unblocks it.** A founder decision on one storage policy plus an object
lifecycle rule for the anonymous prefix. Phase 0 costed the storage at roughly
2GB a day per 1,000 drafts and it remains unbudgeted.

### 2. "Seeing the kit is the surprise" is still NOT ESTABLISHED.

It is now at least *testable*, which it was not before, because the kit did
not previously render at all. My own judgement, as a promoter, is in the roast
and in the section below: **the honest claim is speed and completeness, not
craft.** Do not brief this as "they will be blown away by how it looks".

**What unblocks it.** Five promoters and a rendered kit. An afternoon.

### 3. The four-surface child-safety proof is STRUCTURAL, not driven.

I fixed two real leaks and the tests assert the shipped source. I did **not**
create an unlisted event on TEST and then check the digest, the feed, the
sitemap and a search index with my own eyes. That is the highest-value
untested claim in this build and it should not be described as a live proof.

### 4. `npm run build` could not be run locally.

The repo's own disk guard refuses: 2.6 GB free against a 5 GB floor, and
`npm run reclaim` correctly refuses because another session holds port 3000 on
this machine. **Vercel built this exact branch successfully on all nine
pushes**, which is a real production build, but it is not the local gate.

### 5. Law 2 Phase A was not performed. Carried forward unchanged.

No competitor create-flow capture at 1440 and 390. The screen structure is
reasoned from existing EventLinqs surfaces, not derived from evidence.

---

## THE THING THE PREVIOUS REPORT GOT WRONG

`PUBLIC-COMPOSER-DELIVERY.md` states: "A stranger sees the full kit." **That
was false.**

The reveal rendered three bordered boxes containing sentences ABOUT a poster
and some cards. No image was rendered anywhere. No caption appeared anywhere.
There were no anonymous artefact routes at all (`find src/app/api -path
"*launch*"` returned nothing), and `draft-artefacts.ts`, the one adapter the
entire design turned on, was imported by nothing.

That is also the real reason nobody had ever judged the kit: **there was
nothing to look at.**

Any confidence placed in that report should be re-examined, including the
parts I did not re-verify.

---

## WHAT WAS BUILT

### The child-safety ruling: two MORE leaks found and fixed

The previous report claimed all four surfaces routed through the shared
predicate. Two did not, and both render on the **public** artist profile:

| Surface | Shipped shape |
|---|---|
| `broadcast/artists.ts:124` upcoming shows | `e.visibility !== 'private'` |
| `marketplace/showcase.ts:236` past credits | `e.visibility !== 'private'` |

A deny-list passes UNLISTED. An unlisted sixteenth at a home address, tagged
to a performer, rendered on an indexable public page.

**Root cause of the miss:** the guard named "nothing in the codebase uses the
leaky deny-list shape" read four hand-listed files. It now walks all of `src/`
recursively and asserts the walk finds 300+ files.

### 0.2a The gate: the kit now actually renders

- `/api/launch/[code]/card/[format]` for story, square and tall
- `/api/launch/[code]/poster` for the A4 PDF
- `DraftEventPreview`, a real rendered event page in the design system
- All six captions, in full, copyable

Both routes are siblings of the organiser routes and reuse their entire back
half verbatim. Viewing is free; `?download=1` returns 401 signed out. The code
says plainly that an inline image can be saved by anyone who knows how to save
an image, so this is posture, not DRM.

### 0.2b Abuse: the cost is zero, at every volume

| Anonymous generations / day | Model spend / month |
|---|---|
| 10 | **USD 0.00** |
| 100 | **USD 0.00** |
| 1,000 | **USD 0.00** |

A stranger never reaches a model. What is not zero is compute: one kit view is
four renders, bounded by `launch-artefact` (400/IP/hr) and made free on
re-view by a ten-minute private cache.

Rate limits: `launch-compose` 20/hr, `launch-compose-daily` 250/day,
`launch-artefact` 400/hr, `launch-email` 3/hr **fail-closed**, plus
`countSessionCompose` at 40 per browser per day.

**Two of those numbers were wrong until a live walk broke them**, both in the
direction Phase 0 warned about (per-IP caps break real organisers behind
carrier NAT before they trouble an abuser).

### 0.2c Persistence: Redis, so the ruling holds with no migration

The previous pass wrote a migration, never applied it, and shipped a store
where every function returned `null`. Verified absent on TEST (`PGRST205`).

Redis with a 30-day TTL closes the ruling with no schema change, and removes
the nightly sweep Phase 0 specified entirely. The unapplied migration was
deleted. Email-to-self built: it was cheap.

### 0.3 Spread: the page existed, its input did not

`updateKit` was written, exported and **called from nowhere**, so every typed
bill name lived in React state and vanished on reload. Now wired.

Still honest: no per-person card or per-person tracked link exists, so the
"vehicle" is the same three cards everyone gets.

---

## GATES

| Gate | Result |
|---|---|
| `vitest run` | **1795 passed, 151 files**, exit 0 (was 1739) |
| `eslint` | **47 problems, 0 errors**, one under the 48 baseline |
| `run-guards.mjs` | **all 9 PASS** |
| `copy-tell-gate.mjs` | **clean** |
| `tsc --noEmit` | **0 errors** |
| axe-core, 3 states x 2 viewports | **0 violations, 0 serious/critical** |
| link-integrity-crawl | **ZERO dead links, 299 links** |
| affordance-scan | **0 dead-end tiles, 19 pages** |
| `next build` locally | **BLOCKED** by disk guard (see UNFULFILLED 4) |
| Vercel production build | **READY** on all nine pushes |

Every new test was proven to fail against the pre-fix code: visibility 2/12,
draft store 7/13 then 3/19, email escaping 2/14, repetition 6/21.

**A correction to my own earlier claim in this session:** I reported the build
passing after `npm run build | tail`, where the pipe returned `tail`'s exit
code. The build had actually been blocked. Every gate above was re-run
capturing the real exit code.

---

## JUDGING THE KIT AS A PROMOTER

**The good.** Three cards at the exact published sizes with a working QR. Six
captions in six genuinely different registers, which nothing in the benchmark
set writes. From one sentence, in about ten seconds.

**The bad.**

1. **Half the A4 poster is empty** when there is no artwork. It reads as a
   template with a hole, not a designed typographic poster. That is the shared
   poster renderer, not composer code, so I left it, but it is the first thing
   anyone notices.
2. **The kit URL inside a caption is long and ugly** and is the first thing a
   promoter deletes.
3. **The floor arranges facts, it does not write.**

**Against the standard "I could not have done that better myself": no.** Ten
minutes in Canva beats our poster. What Canva cannot do in ten minutes is a
working event page, a resolving QR, three correctly-sized cards and six
channel-specific captions, all consistent, from one sentence.

**One real quality lift this session:** the summary now carries the detail the
structured fields missed, which is the first output in this build that adds
something instead of rearranging what was already on screen.

| Arrival | Summary |
|---|---|
| comedian | "5 comics." |
| market | "40 stalls." |
| workshop | "6 places." |
| charity | "Tables of 8, at the RSL." |
| birthday | "About 40 kids." |
