# Canva gap: running progress log

Session of 9 August 2026, branch `feat/public-composer`. Written after every
step so a crash costs nothing. Newest section at the bottom.

Founder rulings in force (R1 to R7), which OVERRIDE the handover where they
differ. The material one: **R6, the long-edge ceiling is 3000px, not the 3508
the handover argues for**, and 3000px on A4's long edge is about 260dpi, NOT
300dpi. Any comment claiming 3000 gives true 300dpi is wrong and gets fixed.

---

## STEP 1: verify Job 2

### Gate chain

| Command | Result |
|---|---|
| `npx tsc --noEmit` | PASS, exit 0 |
| `npx vitest run tests/unit/poster-composition.test.ts` | **FAIL, 2 tests** (plus 1 flaky) |

### Finding 1: the parity proof was incapable of proving anything

The proof hashed the PDF after normalising `/CreationDate` and `/ModDate` with a
regex over the raw bytes. Those strings are **not plaintext** in the output:
pdf-lib writes document metadata into a compressed object stream. Proof:

```
plaintext CreationDate present: false
plaintext ModDate present: false
matches: null
```

So the regex matched nothing, and every render hashed differently regardless of
the code. Two consecutive renders of the SAME code, separate processes:

```
run1=1063906e33d06a965712f1d09fc729fea6c0c93213595049427951e5fd6d3493
run2=8aeea5bb38a35ba3d24ccc0cfca9f300ae1d3ce7bc96a5b09ce9090e7cad18be
NOT DETERMINISTIC ACROSS PROCESSES
```

The proof would have reported `artwork identical: false` against a byte-for-byte
unmodified renderer. The handover's instruction that both lines "must print
true" could never have been satisfied.

The same root cause explains the flaky third test: `is deterministic: the same
input renders the same bytes` passes only when both renders land inside the same
clock second, and fails across a second boundary.

**Fix:** freeze the clock (`vi.useFakeTimers({ toFake: ['Date'] })`, only Date,
because faking `setTimeout` stalls the async work in pdf-lib and the QR
encoder). The render is then byte-stable across processes, so the hash is a
plain SHA-256 of the whole file with **nothing normalised away**, which is a
stronger proof than the one designed.

New files: `tests/unit/poster-parity.test.ts` (imports only
`buildEventPosterPdf`, whose name and input shape are identical either side of
the split, so the same file renders against both; the composition test could not
be reused because it imports `fitPosterTitle`, which does not exist in
`96a5a22`, so the module fails to link) and `scripts/verify/poster-parity.mjs`
(the checkout dance, with a `finally` so a crash never leaves the old renderer
in the working tree).

### Finding 2: the lift WAS verbatim

```
artwork identical: true
  before 76052d7397ffea904ca39188613e78c9090ec42bd80ae318c9a7ecea27b063c6 (28943 bytes)
  after  76052d7397ffea904ca39188613e78c9090ec42bd80ae318c9a7ecea27b063c6 (28943 bytes)
no-artwork changed: true
  before 5b967d9cf56a693cb9f0c8efcaf8a317023cc2d81e88c6d0052b26f4e85a4ca3 (28412 bytes)
  after  a90b38689b76957048571fd1aea6ab047c097cb36cc0fb41c8e0fecc37181950 (28436 bytes)
[parity] PASS
```

The predecessor's code was right; only its proof was broken.

### Finding 3: a real defect in wrapText

`wrapText` never breaks a token wider than the line. It pushes the current line
and sets `current = word`, so a single unspaced token becomes one line that runs
straight off the page, and `fitPosterTitle` accepts it because the fitter counts
LINES, not width. A 4000-character title returns 68pt on one line about 149,600pt
wide on a 595pt page.

This is shared by BOTH compositions: `drawCoverPoster` calls `wrapText` at
poster.ts:273 (title) and :283 (locality), so the artwork path has the same
overflow. Real trigger: a pasted URL, a long hashtag run, or any title without
spaces.

**Fixed:** `wrapText` now breaks a token that cannot fit by character. Parity
re-run after the fix still prints `artwork identical: true`, which is the proof
that fixing a shared helper did not disturb the path that must not move.

### Finding 4: the empty half was NOT gone for a short title

Found by opening the PDF, not by a test. The handover's claim that a three-word
name "prints huge" was half true: it printed at the 68pt CEILING, one line,
optically centred in a ~400pt box, with large dead navy above and below it. The
hole had been redistributed, not removed, and a short name is the COMMON case
for this surface (a birthday, a single-word club night), not an edge case.

Root cause: `max: 68` was a hand-picked point size that contradicted the file's
own stated intent, "the title is the hero and is auto-fitted to fill the space
it is given".

**Fixed** by bounding the ceiling with the BOX (`available / 1.08`) instead of a
number, so width and height are the design. That immediately exposed a second
defect I had just introduced: at the larger sizes the character-breaker shattered
"Ruby's" into "Ruby'" / "s". So `fitPosterTitle` now runs two passes, preferring
the largest size at which NO word has to be broken, and only falling back to
character breaking for a token that cannot fit whole at any size (a pasted URL).
It still takes the largest size in that case rather than dropping to the floor.

### Step 1 gate results, all green

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| poster tests | 9/9, stable over 5 consecutive runs (was flaky) |
| `npm test` | 1824 passed / 155 files, exit 0 |
| `npm run lint` | exit 0, 0 errors (47 pre-existing warnings) |
| `node scripts/guards/run-guards.mjs` | 9/9 PASS |
| `node scripts/verify/poster-parity.mjs` | **PASS** |

### The PDFs were opened in real Chrome and looked at

The extension refuses `file://`, so the repo was served over a local port and
opened in the real browser (headless Chromium has no PDF viewer, which is the
tooling artefact the handover warned about). A visual proof set now renders to
`docs/design/poster-composition/set/` via `tests/unit/poster-visual-set.test.ts`,
covering short, medium, long, unspaced-token and two with a real photograph.

**Judged as a promoter: is the empty half gone.** Yes, now. Before the two fixes
above it was gone only for medium and long titles. A short name now sets across
two lines at roughly twice the old size and fills the page, and an unspaced
token wraps mid-word at a large size instead of running off the sheet.

---

## STEP 2: JOB 4, the artwork upload

### 4a. Reject-versus-resize, fixed on BOTH paths

`MAX_IMAGE_DIMENSION = 4000` (a hard reject) is replaced by
`IMAGE_DOWNSCALE_LONG_EDGE = 3000` (a downscale) plus `MAX_IMAGE_PIXELS`
(100MP, a real decompression-bomb guard, which the 4000px reject never was).

**R6 honoured: the ceiling is 3000, not the 3508 the handover argues for**, and
the dpi arithmetic beside it is corrected. A4's long edge is 297mm = 11.69in, so
3000px across it is about **257dpi, NOT 300dpi**. The constant's comment says so
explicitly, because a wrong comment beside a right constant is how somebody
later changes it in the wrong direction.

Changed in `image-pipeline.ts` (organiser path) and `logo-pipeline.ts`, where
the reject was doubly pointless because that pipeline already downscales to
1000px, so it was refusing images it was about to shrink anyway.

Also fixed while there: the returned `width`/`height` came from pre-resize,
pre-`.rotate()` metadata, so a portrait phone photo reported its dimensions
swapped. They are now read back from sharp's actual output.

Proven by `tests/unit/media/image-pipeline.test.ts`, 13/13, including the
founder's exact reported case as a named test:

```
accepts the founder's 3625 x 4961 photo and downscales it instead of refusing
downscales an over-size landscape image rather than rejecting it
leaves an image already under the ceiling exactly as it is, never upscaling
strips EXIF, including GPS, from an uploaded photo
still refuses a decompression bomb
```

### 4b. The anonymous upload

`POST /api/launch/[code]/cover`. Ownership via the httpOnly `el_kit_draft`
cookie, never the code alone (the code is designed to be SHARED).
`attachDraftCover` additionally refuses a token that owns a DIFFERENT draft from
the code being written to, which is the case that would otherwise let anyone who
had ever composed a kit write artwork onto any code they could see.

Validation is cheapest-first: fail-closed rate limit (`launch-upload`, 10/IP/hr),
ownership, byte cap (10MB, the market standard), magic bytes, metadata read,
bomb guard, then a full sharp re-encode to WebP at the 3000px ceiling.

**SVG is refused**, with the reason stated in code rather than silently omitted:
it is XML, executes in a browser, and this is an unauthenticated endpoint
writing to a publicly readable bucket. Humanitix accepts it; we do not.

The EXIF claim is proven rather than asserted: a test builds a JPEG carrying a
GPS IFD3 block, confirms the input genuinely has it, and asserts the output does
not. `tests/unit/launch/sniff-image.test.ts` covers the sniffer, 13/13,
including SVG disguised as a photo.

### THE MIGRATION: written, NOT applied. Founder runs this.

File: `supabase/migrations/20260809000001_kit_draft_covers.sql`

```
supabase db push --linked
```

Success criteria:

1. `select id, public, file_size_limit from storage.buckets where id='kit-draft-covers';`
   returns one row, `public = true`, `file_size_limit = 10485760`.
2. `select policyname from pg_policies where tablename='objects' and policyname='Anyone can view kit draft covers';`
   returns one row.
3. There is NO insert policy on that bucket, by design. The only writer is the
   route, using the service role.

One deliberate divergence from the handover's draft SQL: `allowed_mime_types` is
`image/webp` ALONE rather than the three input formats. The route re-encodes
everything it accepts to WebP, so WebP is the only thing ever written, and
listing the input formats would let a future careless change store an
un-re-encoded original with its EXIF intact and still succeed. This way that
fails loudly at the storage layer.

### 4c. Lifecycle, designed in

`/api/cron/sweep-kit-covers`, daily at 03:30 (added to `vercel.json`),
fail-closed on the shared cron secret. Deletes objects older than **31** days,
one day longer than the 30-day Redis draft TTL so a live draft is never stripped
of its artwork by a clock race.

Cost: 1,000 drafts a day at 2MB raw would be about 2GB a day and 60GB at steady
state. The WebP re-encode at the ceiling brings a typical phone photo to
200-400KB, so the real figure is about 300MB a day and under 10GB at steady
state. **The downscale is the bigger lever by an order of magnitude**; the sweep
stops even that growing without bound. Both are needed.

### 4d. The abuse surface, honestly

What bounds it: the caller must already own a composed draft (cookie plus a
rate-limited compose in front); a fail-closed per-IP limit; magic-byte sniffing;
a full re-encode, so nothing survives but pixels; no SVG, so nothing hosted can
execute; an unguessable path; `noindex`; deletion at 31 days. The object path is
`<kitCode>/cover.webp`, so one draft can only ever hold ONE object no matter how
many times it is replaced.

What it does NOT bound, stated plainly:

- A determined abuser can host an image on our storage domain for up to 31 days.
  That is the honest cost of the feature.
- The per-IP limit is evaded by rotating addresses, which is cheap. The
  ownership requirement is evaded by composing a kit first, which is also cheap.
  Together they make casual abuse pointless and determined abuse merely
  possible, not free.
- Content is not moderated. Nothing inspects what the photograph depicts. A
  publicly readable bucket plus an anonymous uploader means unlawful imagery is
  reachable by URL until the sweep or a report removes it. There is no takedown
  path on this surface yet, and that is a real gap rather than an accepted one.

