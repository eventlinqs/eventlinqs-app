# EventLinqs Launch Plan and Carry-Forward (locked 21 June 2026)

This document carries the full active plan forward to the next chat and is to be
written into the repo: CLAUDE.md (laws), the architecture doc, and the benchmark
doc. Memory is a backup only; the repo is the source of truth.

Author note on dashes: this document follows the product-copy dash rule (hyphens
allowed in identifiers and filenames). Messages to Lawal himself never use any dash.

---

## Where we are (three proven branches, none merged)

1. feat/home-rebuild = the CONFIRMED final design. Approved by Lawal.
   Live preview: eventlinqs-app-git-feat-home-rebuild-lawals-projects-c20c0be8.vercel.app
   Glassmorphism nav, gold on dark hero with rotating slides (incl The Glass Menagerie),
   browse-by-category rail. DO NOT change the design. Only make things work.

2. feat/funds-holding-payments = PROVEN funds-holding re-platform.
   16 of 16 integrated Stripe TEST surfaces green. 5 migrations on TEST only
   (20260621000001 through 000005). Gates green: tsc 0, eslint 0, 435 tests, build 0.
   EventLinqs is merchant of record, holds funds, pays organiser after the event,
   reserve + refund + dispute all proven. Nothing merged. Limited-agent GST posture
   (organiser stays seller, EventLinqs remits GST on its fee only) to confirm with
   an accountant post-launch.

3. release/launch-line (PR #99) = admin + launch consolidation. Carries the OLD design.

---

## THE LAUNCH SEQUENCE (do in this order)

1. INSPECT FIRST. Have CC report the three branches' merge-bases and likely conflict
   hotspots, and propose the safest merge order. Do this BEFORE any merge.

2. INTEGRATE. Merge feat/home-rebuild and feat/funds-holding-payments onto
   release/launch-line one at a time. Re-green ALL gates after each merge
   (tsc, eslint, vitest, build, Lighthouse mobile gate). Resolve conflicts cleanly.
   Payments and design touch mostly different files, so conflicts should be limited.
   Verify, do not assume.

3. BUILD + VERIFY launch-blocker changes on the unified line (see below). Each one
   verified A to Z with proof shown. No patchwork.

4. DEPLOY a fresh preview for Lawal to confirm everything works.

5. FOUNDER RUNBOOK. Lawal enters production secrets, one complete block per service:
   Stripe live activation + keys + webhook, Supabase Auth Site URL + Resend SMTP,
   Resend DNS, restricted Mapbox token (production only), Upstash Redis to Sydney,
   credential rotation. (See existing runbook: EventLinqs-Launch-Runbook.md.)

6. DEPLOY to production. First real card purchase end to end. Live.

---

## LAUNCH-BLOCKER CHANGES (do now, on the unified line)

i.   ABOUT US in the HEADER. Add an About Us link in the header after the EVENTLINQS
     logo. Keep the existing footer About Us as is. The page already exists in the
     footer; verify it works A to Z, professionally done, link confirmed working.

ii.  RENAME "For Organisers" to "EVENT ORGANISERS" in the header. Verify it works.
     PLUS fix the IMAGE UPLOAD defect (high priority, reported by Lawal AND a tester):
     - Image does not appear in the upload section; only shows AFTER the event is
       published. It must show immediately on upload.
     - Images look cropped. Must handle aspect correctly, not falsely crop, professional.
     - Verify the FULL organiser flow A to Z: sign-up, set up an event, upload photos,
       payment/payout path, event goes live. Show proof.

iii. REMOVE the "Communities" tab from the header (community discovery already lives
     in the picture rail below the hero). INTEGRATE community-linking INTO event
     creation: an organiser tags an event to one or many communities (tick across,
     or all communities). Discovery surfaces feed from those tags. This is a PLANNED
     build: write the plan in plain language (how organisers link events to
     communities, how existing community pages keep populating, the data model, how
     we prove it), get Lawal's approval, THEN CC builds and proves it. Not a quick edit.

vii. LOGO finalise + final polish. Rides along after working changes confirmed.
     No design changes. Only make everything work, professionally.

---

## PARKED: DELIBERATE FUTURE, SUBSTANCE FIRST

iv.  Global community-support statement (footer only, understated, never bold, never
     in the design). Build the SUBSTANCE first (a real donation/partnership programme,
     like Humanitix's audited model) THEN make the claim. A public claim that cannot
     be substantiated risks Australian consumer-law scrutiny. Pattern is right; the
     move is substance before statement. Footer only, future.

---

## PARKED: NEXT MAJOR WORKSTREAM, RIGHT AFTER LAUNCH (do NOT forget this)

v.   THE AGENTIC GROWTH ENGINE + AI OPERATING SYSTEM. This is the next big build
     immediately after launch and Lawal explicitly said to remember it even if he
     forgets. It is the one-man-business engine from the transcripts (Higgsfield
     creative engine; the full agency operating model: build plan then implementation
     plan then build, with repeatable skills as the compounding asset).
     Scope to research and build properly:
     - Lead-generation funnels targeting event organisers AND event-goers.
     - Super-agent sales/marketing automation; agentic automations; an AI operating
       system so the platform captures the market and earns from day one of being live.
     - Organic traffic / SEO engine, web-push + email lifecycle (ties to the demand
       engine moat already planned in docs/MOAT-DEMAND-ENGINE-PLAN.md).
     - Higgsfield integration (custom connector in the app, or Higgsfield CLI + agent
       skills in Claude Code) + EventLinqs-branded creative skills (navy/gold, hook
       framing) for hero images, launch videos, social ads, YouTube content.
     WHY AFTER LAUNCH, NOT BEFORE: building automations to capture a market for a
     platform that is not yet live and earning is the wrong order; the engine is far
     more powerful built on top of a live, earning platform with real traffic and data.
     This is NOT a launch task. Strong yes to the vision, firm not-yet on timing.
     This serves Lawal's community and his planned YouTube channel; it is about
     building, not about selling courses.

---

## STANDARDS THAT APPLY THROUGHOUT (already locked in memory + CLAUDE.md)

- SHIP 100%: nothing called done while partially built. Real engineering, no patchwork.
- Surpass Ticketmaster / Eventbrite / DICE / Humanitix; benchmark with evidence.
- Plan first, research competitors, verify, then hand CC a prompt. Never rush to code.
- Community-first positioning. Tagline: "Every community. Every event. One platform."
- Verify in production before calling anything done. Lighthouse 95+ desktop and mobile.
- Lawal wants hands-off: provide step-by-step setup guides a 10 year old could follow.

---

## IMMEDIATE NEXT ACTIONS

1. CC branch inspection (merge-bases + conflict hotspots + safest merge order), no merge yet.
2. In parallel, draft the community-into-event-creation plan (item iii) for Lawal's approval.
3. Write this plan into CLAUDE.md, the architecture doc, and the benchmark doc in the repo.
4. Once Lawal approves the integration order and the community plan, execute the sequence.

Carry this document into the next chat verbatim.
