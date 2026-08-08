# HANDOVER: feat/launch-kit-artefacts

Written 8 August 2026 at a clean stop, on the founder's instruction. Branch cut
from `origin/main` at `bbe6fd7`. Six commits. **Nothing merged, nothing pushed.**
The parallel session on `feat/launch-kit-moat` was never touched.

| SHA | What |
|---|---|
| `bb66416` | A2: the social card set and the caption engine |
| `eff7ee3` | The story card finished; B1 groundwork (logo pipeline, poster) |
| `455201a` | Ruling 4 (robot clicks) and ruling 5 (canonical host guard) |
| `65acb86` | Rulings 1 to 3: /e/[code] serving the event page directly |
| `822a684` | The first stop-point record |
| `81f12bd` | B1 control mounted; collision answered with the date |

---

## 1. THE LEDGER

Verdicts are MET, PARTIAL, NOT STARTED or BLOCKED. Nothing is rounded up.

| Item | Verdict | What remains |
|---|---|---|
| **Ruling 4** robot clicks | **MET** | Nothing |
| **Ruling 5** canonical host | **MET** | Nothing |
| **Ruling 1** /e/ format | **MET** | Nothing |
| **Ruling 2** no redirect | **MET, one named deviation** | The last-touch cookie is set in middleware: a Server Component cannot write a cookie during render. Stated, not worked around |
| **Ruling 3a** collisions impossible | **MET** | Build-failing guard, 46 routes reserved |
| **Ruling 3b** legacy codes forever | **MET** | Asserted in tests; not yet walked in a browser |
| **Ruling 3c** codes never released | **BLOCKED, QUEUED** | Migration `20260808000006` written, NOT applied. Queues behind `fix/security-hardening` |
| **Ruling 3d** attribution unweakened | **MET in code, UNPROVEN live** | Needs the browser walk |
| **A2** cards and captions | **BUILT, NOT BROWSER-PROVEN** | Section 4 |
| **B1** organiser logo | **BUILT AND MOUNTED, awaiting a founder ruling and the walk** | Both mark treatments are rendered; the founder rules on subordinate versus absent. Then the walk |
| **B2** the four zeros | **NOT STARTED** | The reach panel now leads with conversions and labels clicks as estimates. The empty state itself is untouched |
| **A4** positioning | **NOT STARTED** | |
| **E2** images and video | **NOT STARTED** | `src/lib/media/limits.ts` already declares `VIDEO_PROVIDERS` and "EventLinqs never self-hosts the file"; `docs/design/MEDIA-UPLOAD-SPEC.md` exists. Read both first |

Gates at `81f12bd`: tsc clean, eslint 0 errors, 9 build-failing guards pass,
copy-tell-gate clean, **1452 tests across 132 files**, `next build` compiles
`/e/[code]` as a dynamic route.

---

## 2. THE TWO THINGS THAT NEED A HUMAN

**A founder ruling: does the EventLinqs mark stay on the artefacts?**
Four PDFs in `docs/design/launch-kit-artefacts/logo/`, each rendered against a
light and a dark organiser mark:
`poster-*-ours-subordinate.pdf` and `poster-*-ours-absent.pdf`.
The recommendation on record is SUBORDINATE: the artefact already carries the
domain in the ticket bar, so one muted line is honest rather than intrusive, and
it is the only organiser-to-organiser vector anywhere in the kit.

**A migration, after another branch lands.**
`supabase/migrations/20260808000006_share_codes_never_released.sql`, applied with
`supabase db push --linked` in PowerShell. Never the Dashboard SQL editor, never
the MCP.

It queues behind `fix/security-hardening`, which owns all migrations and all RLS
work until its live production data exposure lands. Until this one runs,
`share_links.event_id` is still `ON DELETE CASCADE`: deleting an event deletes
its codes and frees them for another event to claim. That is the Luma hazard,
live in our own schema.

---

## 3. FILE OWNERSHIP: DO NOT EDIT src/proxy.ts

`fix/security-hardening` is patching `next@16.2.7` to `16.2.11` for
GHSA-6gpp-xcg3-4w24, a documented App Router **proxy bypass**. That is the same
file and the same request-interception path this branch added a cookie write to.

**That session owns `src/proxy.ts`.** A security patch outranks a cookie write.

This branch's hunk is 12 lines and self-contained: `SHARE_PATH_RE`,
`attachShareCookie`, and one wrapped return at the end of `proxy()`. Either
rebase onto their work and re-apply it, or let them carry it. What must not
happen is two sessions holding that file open.

If the cookie has to move out of the middleware for any reason, the only other
place it can go is a Route Handler, which costs a redirect hop and reintroduces
exactly what Ruling 2 removed. Raise it rather than doing it quietly.

---

## 4. THE BROWSER WALK: THE NEXT THING, AND IT IS NOT DONE

**Nothing on this branch has been driven in a browser.** It is proven by
`next build`, 1452 unit tests, nine build-failing guards, and rendered artefact
files on disk. Under the founder's standing rule 3 that is **not shipped**.

Run it in one pass, in this order, and paste the evidence:

1. `set -a && . ./.env.test && set +a` then `npm run dev`.
   **Never `.env.local`: it points at PRODUCTION.**
2. Sign in as an organiser who owns a published event on TEST.
3. `/dashboard/organisation`. Upload a logo with a transparent background and a
   light wordmark: the panel must say it sits straight on the navy. Upload a
   dark one: it must say it went onto a white tile. Both previews are on navy.
4. `/dashboard/events/[id]/launch-kit`. Six channel panels. Copy a caption and
   paste it somewhere to confirm what actually landed on the clipboard.
5. Download a story, a square and a tall card. Open each. Confirm the organiser
   logo, the ticket bar on ONE line, and the QR.
6. Download the A4 poster. Confirm the organiser mark leads the band, ours is
   the footer line, and it is set in Archivo and Hanken rather than Helvetica.
7. **Scan the poster QR with a phone camera**, not a code-level decode. It must
   land on `/e/[code]` and render the event page. In the network panel there
   must be NO redirect: one request, 200.
8. Confirm `el_share_code` is set on that response.
9. Buy a ticket through it. Confirm the reach panel books a conversion against
   that channel, and that tickets and orders lead the panel in gold with clicks
   and views marked as estimates below.
10. Open an OLD `/s/[code]` link. It must still resolve.
11. Repeat the kit screen at 390 and 1440.

If any step fails, the item it belongs to is NOT done and must be reported that
way rather than repaired quietly.

---

## 5. TRAPS THAT COST ME TIME

- **Heredoc escaping in this shell eats backslashes.** `\s` inside a
  `node - <<'EOF'` patch script became `s`, which shipped a regex that replaced
  every lowercase s with a space and rendered "Four hour of hou e and break acro
  two room" onto a card. **Use the Edit tool for anything containing a regex.**
- **satori does not composite `rgba()` at the alpha it declares.** A multi-stop
  gradient, then a flat rgba, both came out far weaker than specified. Tone
  images in sharp, where the result is a file you can open.
  `tests/proofs/gradient-probe.proof.tsx` records which forms do work.
- **satori CLIPS an image it cannot fit, it does not scale it.** A flex row
  squeezed a logo and the render printed "BASEMEN1". Put `flexShrink: 0` on the
  image itself, not only on its wrapper.
- **sharp greyscales in linear light.** The brand navy measures about 4 on that
  scale, not the ~20 the naive luminance formula suggests. Measure a baseline,
  never assume one.
- **Averaging a logo's whole frame measures the canvas, not the ink.** A white
  wordmark on transparency measured 59 and was sent to a tile it did not need.
  Weight by the alpha channel.
- **`sharp.strategy.attention` is unsafe for a large crop.** It scored the
  paintings on a wall above a comedian and cropped the comedian out.
- **`events.slug` is UNIQUE per (organisation_id, slug), not globally**, while
  `/events/[slug]` resolves by slug alone. Pre-existing; flagged to the founder,
  not fixed here.
- **The disk floor blocks the build at 5 GB.** `npm run reclaim -- --deep`
  cleared enough. Check before starting anything.
- **`npm run build` fails with "Invalid rewrite found"** unless `.env.test` is
  sourced first: the `/cdn` rewrite needs the storage host. Not a code defect.
- **`RESERVED_CODES: readonly string[] = [` has TWO brackets.** A parser
  anchored on the name matches the type's `[]` and silently reads an empty list.
- **Migration numbers collide across branches.** `20260808000001` through
  `...0005` were already taken by other lines of work. Check
  `git log --all --name-only -- "supabase/migrations/*"` before numbering.

---

## 6. THE EXACT NEXT STEP

1. The browser walk in section 4, in full, with evidence pasted.
2. B2, the four zeros empty state.
3. A4, the positioning sweep.
4. E2, images and video.

Do not start 2, 3 or 4 before 1. Everything already built is unproven where it
matters most, and the founder's benchmark is the user, not the gate.
