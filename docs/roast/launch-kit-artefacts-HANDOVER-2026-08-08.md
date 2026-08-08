# HANDOVER: feat/launch-kit-artefacts

Written 8 August 2026 at a clean stop. Branch cut from `origin/main` at
`bbe6fd7`. Four commits. **Nothing merged, nothing pushed.** The parallel
session on `feat/launch-kit-moat` was never touched.

| SHA | What |
|---|---|
| `bb66416` | A2: the social card set and the caption engine |
| `eff7ee3` | The story card finished; B1 groundwork (logo pipeline, poster) |
| `455201a` | Ruling 4 (robot clicks) and ruling 5 (canonical host guard) |
| `65acb86` | Rulings 1 to 3: /e/[code] serving the event page directly |

---

## 1. THE LEDGER

| Item | Verdict | What remains |
|---|---|---|
| **Ruling 4** robot clicks | **MET** | Nothing. Filter, per-hour de-duplication, panel leads with conversions |
| **Ruling 5** canonical host | **MET** | Nothing. Guard registered, every URL position resolves the one definition |
| **Ruling 1** /e/ format | **MET** | Nothing |
| **Ruling 2** no redirect | **MET, with one named deviation** | The last-touch cookie is set in middleware because a Server Component cannot write a cookie during render. Stated, not worked around |
| **Ruling 3a** collisions impossible | **MET** | Nothing. Build-failing guard, 46 routes reserved |
| **Ruling 3b** legacy codes forever | **MET** | Nothing |
| **Ruling 3c** codes never released | **BLOCKED ON THE FOUNDER** | Migration `20260808000001` written, NOT applied. Until it is, deleting an event still frees its codes |
| **Ruling 3d** attribution unweakened | **MET in code, UNPROVEN live** | Same row, same cookie, same join. Not yet walked end to end in a browser |
| **A2** cards and captions | **BUILT, NOT BROWSER-PROVEN** | See section 3 |
| **B1** organiser logo | **PARTIAL** | Pipeline, storage, poster and card rendering all done. **The control is not mounted on any page, so no organiser can upload one yet** |
| **B2** the four zeros | **NOT STARTED** | The reach panel now leads with conversions and labels clicks as estimates; the empty state itself is untouched |
| **A4** positioning | **NOT STARTED** | |
| **E2** images and video | **NOT STARTED** | `src/lib/media/limits.ts` already declares `VIDEO_PROVIDERS` and "EventLinqs never self-hosts the file", and `docs/design/MEDIA-UPLOAD-SPEC.md` exists. Read both before starting |

---

## 2. THE ONE THING A FOUNDER MUST DO

`supabase/migrations/20260808000001_share_codes_never_released.sql`, applied
with `supabase db push --linked` in PowerShell. Never the Dashboard SQL editor,
never the MCP.

Until it runs, `share_links.event_id` is still `ON DELETE CASCADE`: deleting an
event deletes its codes and frees them for another event to claim. That is the
Luma hazard, live.

---

## 3. WHAT IS NOT PROVEN, STATED PLAINLY

**Nothing on this branch has been driven in a browser.** Everything is proven by
`next build`, by 1450 unit tests, by nine build-failing guards, and by rendered
artefact files on disk. Under the founder's standing rule 3, that is not shipped.

The single walk that would close it, in order:

1. `set -a && . ./.env.test && set +a` then `npm run dev`. **Never `.env.local`:
   it points at PRODUCTION.**
2. Sign in as an organiser with a published event on TEST.
3. `/dashboard/events/[id]/launch-kit`. Confirm the post pack renders six
   channel panels, each caption copies, each image downloads.
4. Open a downloaded story, square and tall card. Confirm the logo slot,
   the ticket bar and the QR.
5. Scan the QR. It must land on `/e/[code]` and render the event page with no
   redirect in the network panel.
6. Confirm `el_share_code` is set on that response.
7. Buy a ticket. Confirm the reach panel books a conversion against that channel.
8. Open an OLD `/s/[code]` link. It must still resolve.
9. Repeat at 390 and 1440.

---

## 4. THINGS THAT COST ME TIME

- **Heredoc escaping in this shell eats backslashes.** `\s` in a `node - <<'EOF'`
  patch script became `s`, which shipped a regex that replaced every lowercase
  s with a space and rendered "Four hour of hou e and break acro two room" onto
  a card. Use the Edit tool for anything containing a regex.
- **satori does not composite `rgba()` at the alpha it declares.** A multi-stop
  gradient and then a flat rgba both came out far weaker than specified. Tone
  images in sharp, where the result is a file you can open.
  `tests/proofs/gradient-probe.proof.tsx` records which background forms do work.
- **`sharp.strategy.attention` is not safe for a large crop.** It scored the
  colourful paintings on a wall above a comedian and cropped the comedian out.
- **The disk floor blocks the build at 5 GB.** `npm run reclaim -- --deep`
  cleared enough. Check before starting anything.
- **The `/cdn` rewrite needs env.** `npm run build` fails with "Invalid rewrite
  found" unless `.env.test` is sourced first. Not a code defect.
- **`RESERVED_CODES: readonly string[] = [` has TWO brackets.** A parser
  anchored on the name matches the type's `[]` and silently reads an empty list.

---

## 5. THE EXACT NEXT STEP

1. Mount `LogoUploader` on `/dashboard/organisation` and add the logo to the
   organisation create form. That closes B1. The component, the server actions
   and the pipeline are all written and typechecked; only the mounting is left,
   plus rendering both EventLinqs mark treatments for the founder's ruling.
2. B2, the four zeros.
3. A4, the positioning sweep.
4. E2, images and video.
5. The browser walk in section 3, once, covering everything.
