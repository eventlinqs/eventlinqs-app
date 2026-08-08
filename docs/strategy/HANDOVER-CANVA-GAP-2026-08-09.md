# HANDOVER: the Canva gap, Jobs 2 to 5

Written 9 August 2026 for a fresh session. Branch `feat/public-composer`,
pushed, not merged. Founder ruling: **Job 4 first**, then Job 3, then Job 5.

Read `docs/strategy/CANVA-GAP-JOB-1-RESEARCH.md` first. It holds the sourced
research these jobs are built on and you should not re-derive it.

---

## WHY THIS WAS HANDED OVER

Another session on this machine removed `node_modules/.bin` mid-run (28 node
processes; `npm run reclaim` had already refused because that session holds port
3000). `tsc`, `vitest`, `eslint` and `next build` could not run, and running
`npm install` underneath another session's install would corrupt it.

**Check this first.** If `ls node_modules/.bin/vitest` succeeds, the tooling is
back and you can proceed. If not, wait; do not install.

---

## STATE OF PLAY

| Item | State |
|---|---|
| Public composer, artefacts, captions, Redis persistence, email-to-self, act link, child-safety fixes | Shipped and verified on the deployed preview. See `PUBLIC-COMPOSER-DELIVERY-2.md` |
| Job 1 research | **Done.** `CANVA-GAP-JOB-1-RESEARCH.md` |
| Job 2, no-artwork poster | **Code complete, NOT VERIFIED.** Nothing about it should be believed yet |
| Job 3, tweak layer | Designed below, not built |
| Job 4, artwork upload | Designed below, not built. **Build this first** |
| Job 5, re-walk | Not started |

Preview: `https://eventlinqs-app-git-feat-public-b39b4c-lawals-projects-c20c0be8.vercel.app`

---

## STEP 0: FINISH VERIFYING JOB 2 BEFORE ANYTHING ELSE

`src/lib/broadcast/poster.ts` was split into `drawCoverPoster` (the previous
renderer, lifted verbatim) and `drawTypographicPoster` (new). The founder's
condition was that **the artwork path renders identically before and after**,
and that has not been proven.

```bash
npx tsc --noEmit
npx vitest run tests/unit/poster-composition.test.ts
```

Then the parity proof:

```bash
# 1. On this commit, render and record the hash.
npx vitest run tests/unit/poster-composition.test.ts
cp docs/design/poster-composition/parity.json /tmp/parity-after.json

# 2. Restore the pre-split renderer and render again.
git show 96a5a22:src/lib/broadcast/poster.ts > src/lib/broadcast/poster.ts
npx vitest run tests/unit/poster-composition.test.ts
cp docs/design/poster-composition/parity.json /tmp/parity-before.json

# 3. Restore and compare. withArtwork.sha256 MUST be identical.
git checkout -- src/lib/broadcast/poster.ts
node -e "const a=require('/tmp/parity-before.json'),b=require('/tmp/parity-after.json');console.log('artwork identical:', a.withArtwork.sha256===b.withArtwork.sha256);console.log('no-artwork changed:', a.noArtwork.sha256!==b.noArtwork.sha256)"
```

Both must print `true`. The hash normalises `CreationDate` and `ModDate`
because pdf-lib stamps the current time, so raw bytes differ between any two
renders; everything else is verbatim.

**Then open the PDFs and look at them.** `docs/design/poster-composition/no-artwork.pdf`.
Real Chrome renders PDFs. **Headless Chromium does not**: a blank poster frame
in a Playwright screenshot is a tooling artefact, not a defect, and an earlier
session nearly reported it as one.

If the artwork hash moved, the lift was not verbatim. Fix that before Job 4.

---

## JOB 4: THE ARTWORK UPLOAD. BUILD THIS FIRST.

### Why it outranks the tweak layer

From Job 1: the boundary is the stock library, not the editor. The two things
that make a poster theirs are their artwork and their name. A tweak layer over
a poster with no photograph in it is polish on the wrong problem.

### 4a. Fix the reject-versus-resize defect FIRST, in the same pass

`src/lib/media/image-pipeline.ts:80`

```ts
if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
  error: `Image is too large in pixels: ${width} x ${height}. The maximum is ${MAX_IMAGE_DIMENSION} x ${MAX_IMAGE_DIMENSION}.`
```

`MAX_IMAGE_DIMENSION = 4000` (`src/lib/media/limits.ts:16`).

**The founder hit this with a 3625 x 4961 photo, which is ordinary camera
output.** The market has no pixel ceiling: Eventbrite and Humanitix both
publish a 10MB byte cap and a recommended MINIMUM resolution, and Humanitix
crops rather than refuses. Sources are quoted in the research doc.

**The fix:**

1. Replace the hard reject with a downscale. **The founder has ruled: true
   300dpi print.** So the ceiling is `3508`, not 3000:

   ```ts
   sharp(...).resize({ width: 3508, height: 3508, fit: 'inside', withoutEnlargement: true })
   ```

   **The arithmetic, because the first number proposed was wrong and the next
   person will check.** A4 is 210 x 297mm, so 300dpi is 2480 x 3508px. A 3000px
   long edge is 3000 / 11.69in = **257dpi**, not 300.

   It is slightly worse than that on the artwork poster, because the cover does
   not fill the page: it is cover-fitted into the top region, 595.28 x 463.04pt,
   which is 2480 x 1929px at 300dpi. For a PORTRAIT source the width binds, so
   the founder's own 3625 x 4961 photo at a 3000 ceiling becomes 2192px across a
   region that wants 2480. At 3508 it becomes 2563px, which clears it.

   Every other artefact is far below this ceiling and does not drive it: the
   tall card is 1440 x 1800, the story card 1080 x 1920, the square 1080 x 1080.
   **Print is the only reason this number is not smaller.**

   Known and accepted limit: a 9:16 phone photo would need about 4400px to hit
   true 300dpi after the crop. 3508 gives true 300dpi for ordinary camera ratios
   and slightly under for very tall phone shots. Chasing that case is not worth
   the storage.
2. Rename the constant so the name states the new behaviour, e.g.
   `IMAGE_DOWNSCALE_LONG_EDGE`. Leaving it called `MAX_IMAGE_DIMENSION` is how
   the next person reintroduces a reject.
3. Keep a real safety guard, because "no ceiling" is not the same as "no
   guard": refuse only a decompression bomb, e.g. `width * height > 100_000_000`
   or unreadable `sharp` metadata. A 4000px reject was never protecting against
   that; it was protecting against nothing and refusing real photos.
4. Apply the same change in `logo-pipeline.ts:164`, which has the identical
   reject.
5. **Test that a 3625 x 4961 input now succeeds** and comes back at or under the
   long edge. That is the founder's exact reported case; make it a named test.

**This question is CLOSED. Founder ruled 9 August 2026: true 300dpi print, so
the ceiling is 3508.** The storage cost of 3508 over 3000 is about 37% more
pixels, which on a WebP re-encode is roughly 300KB to 410KB per cover. That is
small because the re-encode does the heavy lifting either way, and it is the
reason the ruling was cheap to honour. Do not reopen it to save storage.

### 4b. The anonymous upload

**Route:** `POST /api/launch/[code]/cover`

**Ownership, not auth.** No account, but the caller must prove they own the
draft with the `el_kit_draft` httpOnly cookie, exactly as `emailKitToSelf`
already does (`src/app/launch/actions.ts`). A code in the URL alone must never
be enough to write to somebody's draft.

**Rate limit:** a new policy `launch-upload` in `src/lib/rate-limit/policies.ts`,
**`failClosed: true`**. This is the second action on the surface that costs real
money (storage and egress), so it takes the same posture as `launch-email` and
not the fail-open posture of compose. Suggested 10 per IP per hour. Follow the
rationale-writing style of the existing rows; they explain the number.

**Validation order, cheapest first:**

1. Byte length against `MAX_IMAGE_BYTES` (10MB, already the constant, and it
   matches both Eventbrite and Humanitix).
2. **Magic bytes, not the declared Content-Type.** JPEG `FF D8 FF`, PNG
   `89 50 4E 47`, WebP `RIFF....WEBP`.
3. `sharp` metadata read, then the decompression-bomb guard.
4. Downscale and **re-encode**. Re-encoding is a security control as well as a
   size one: it strips EXIF (including GPS, which on a birthday at a home
   address is a child-safety problem, not a privacy nicety) and discards any
   payload smuggled in a container.

**Do NOT accept SVG.** Humanitix does. SVG is XML, executes script in a browser,
and there is no version of that which is safe to host on our domain from an
unauthenticated endpoint. Say so plainly in the code comment rather than
silently omitting it.

**Storage:** a new bucket, not a prefix inside `event-images`. A separate bucket
is what makes the lifecycle sweep and the access rules simple and auditable.

**Recommended posture: no anonymous INSERT policy at all.** Write via the
service role from the route, and give the bucket public READ only. That way
there is no anon-writable bucket in the project, the route is the single writer,
and every upload has already passed the validation above. This is both simpler
and stricter than granting anon INSERT.

**The migration to WRITE (do not apply):**
`supabase/migrations/20260810000001_kit_draft_covers.sql`

```sql
-- Anonymous composer cover artwork. Public read so the renderers and the
-- preview can fetch it; NO anonymous insert policy, because the only writer is
-- the upload route using the service role, which has already validated,
-- re-encoded and downscaled the bytes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kit-draft-covers',
  'kit-draft-covers',
  true,
  10485760,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

create policy "Anyone can view kit draft covers"
  on storage.objects for select
  using (bucket_id = 'kit-draft-covers');
```

**Hand the founder exactly this, and nothing else:**

```
supabase db push --linked
```

**Success criteria to give them:**

1. `select id, public, file_size_limit from storage.buckets where id='kit-draft-covers';`
   returns one row, `public = true`, `file_size_limit = 10485760`.
2. `select policyname from pg_policies where tablename='objects' and policyname='Anyone can view kit draft covers';`
   returns one row.
3. Then re-run the six-arrival walk with an artwork upload and confirm the
   poster embeds the photograph.

**Object path:** `<kitCode>/cover.webp`. The kit code is already unguessable at
31^12, so the path inherits that. One cover per draft, overwritten on re-upload,
which also caps a single draft's storage at one object.

### 4c. The lifecycle, designed in rather than bolted on

Drafts live 30 days in Redis (`KIT_DRAFT_TTL_SECONDS`). **Objects must not
outlive them.** Supabase Storage has no native TTL, so this needs a sweep.

`src/app/api/cron/sweep-kit-covers/route.ts`, daily, following the existing
cron pattern in `src/app/api/cron/*` (CRON_SECRET, fail-closed). It lists
`kit-draft-covers` and deletes any object older than 31 days. Thirty-one, not
thirty, so a live draft is never stripped of its artwork by a clock race.

**The cost, and why downscaling is the real control.** The earlier estimate was
about 2GB a day per 1,000 drafts at 2MB each, so 60GB at steady state.
Re-encoding to WebP at the long-edge ceiling brings a typical phone photo to
roughly 200 to 400KB, which is about 300MB a day and under 10GB at steady
state. **The downscale is a bigger lever than the sweep**, and both are needed.

### 4d. The abuse surface, stated honestly

An unauthenticated upload endpoint means we host bytes a stranger supplied.
What bounds it:

- They must compose a kit first, so there is a cookie and a rate-limited step
  in front of it.
- Fail-closed per-IP limit.
- Magic-byte sniffing, so only real images pass.
- Full re-encode through sharp, so nothing survives the round trip except
  pixels. EXIF, including GPS, is stripped.
- No SVG, so nothing hosted can execute.
- Unguessable path, `noindex`, 31-day deletion.

**Residual risk, not eliminated:** somebody can host an image on our storage
domain for up to 31 days. That is the honest cost of the feature. It is bounded
in volume, time and content type, and it is the same exposure every platform in
the benchmark set accepts.

---

## JOB 3: THE TWEAK LAYER (build after Job 4)

The evidence in the research doc supports a **shorter** list than the founder's
starting expectation.

| Control | Build it? | Why |
|---|---|---|
| **Layout treatment**, 2 or 3 | **Yes** | Canva's own step 1 is "pick a design". With the two poster compositions already split, a third and fourth treatment is now a contained addition rather than a rewrite |
| **Constrained palette** | **Yes, constrained** | Canva's step 2 includes colour. But Humanitix's free hex picker produces a gradient their own FAQ says cannot be removed, and tells users to type `#FFB18F` to get back. Ship a small set of named schemes inside the brand system. **Never a hex field** |
| **Focal point / crop** | **Yes** | Not in Canva's list, but it is Humanitix's stated failure mode ("heavily cropped"), which is stronger evidence than a marketing page. Only meaningful once Job 4 exists, which is another reason Job 4 comes first |
| **Logo** | **Yes** | Canva's step 4. `logo-pipeline.ts` and `resolveLogoPlacement` already exist and the poster already draws a logo. Mostly wiring |
| **Text scale** | **NO** | Canva's sequence never mentions resizing type, and `fitPosterTitle` now does it automatically and better. A manual control here can only make the output worse, which fails the founder's own test |
| **Stock graphics** | **NO, ever** | The one step that needs two million templates. Also licensing, also Law 1 |

**Law 6 boundary for this job:** every one of these is composition. Nothing here
generates an image.

---

## JOB 5: JUDGE IT AGAIN

Re-walk the six arrivals with artwork and without, at 390 and 1440, on the
deployed preview, with screenshots. `node scripts/verify/launch-kit-walk.mjs <base>`
already does the no-artwork case and asserts the things that matter (cards
decoded with real dimensions, poster is a real PDF, download refused at 401).
Extend it to upload a cover for half the arrivals.

Then answer the founder's question in plain words: would a promoter look at this
and think they could not have done better themselves. The last honest answer was
**no**, on the grounds that the poster had a hole in it and there was no way to
put a photograph in. Jobs 2 and 4 remove both of those reasons. If the answer is
still no, say so and say precisely what remains.

### The rate limit will get in your way, and that is expected

A day of verification from one IP exhausts `launch-compose-daily`. Refused
attempts still increment the counter, so retrying extends the lockout. Budget
for it: do the walk once, deliberately, rather than iterating against the live
preview. When the limit trips, the kit still renders with all six captions but
**no cards and no poster**, because those are addressed by draft code. That is
designed behaviour, not a regression; do not chase it as a bug.

---

## STANDING RULES, CARRIED FORWARD

Australian English. No em dashes or en dashes. "community", never the banned
alternative. No claim without pasted proof. Never write to the Production
Supabase database (TEST is `vkapkibzokmfaxqogypq`). Never touch `src/proxy.ts`.
Write source files with the editor, never a shell heredoc. Every specification
from a fetched primary source, cited beside the claim.

Migrations are WRITTEN by the agent and APPLIED by the founder. Hand him the
exact command and the success criteria, as above.

Run `brief-roast`, two rounds, before claiming anything complete.

**One footgun worth repeating:** `npm run build 2>&1 | tail -40` returns
`tail`'s exit code, not the build's. A disk-guard block was reported as a
success earlier in this branch because of it. Capture the real exit code. The
disk guard floor is **5GB**, not the 1.5GB CLAUDE.md states.
