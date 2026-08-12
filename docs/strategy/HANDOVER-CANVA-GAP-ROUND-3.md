# HANDOVER: round 3, items 3 to 6

9 August 2026, branch `feat/public-composer`, head after `f66f862`. Supersedes
round 2 where they differ. Read `CANVA-GAP-VERDICT-2026-08-09.md` first for the
verdict and the evidence; it is not repeated here.

---

## STATE OF THE SEVEN ITEMS

| # | Item | State |
|---|---|---|
| 1 | Prove Job 4 end to end | **DONE.** Walked on the deployed preview, EXIF/GPS measured on the stored object, six arrivals both viewports |
| 2 | Answer the question again | **DONE.** Cards yes, poster not yet, with the reason and the measurement. See the verdict doc |
| 3 | Job 3, the tweak layer | **NOT STARTED** |
| 4 | D1, the kit URL in a caption | **NOT STARTED** |
| 5 | D2, the child-safety proof, driven | **NOT STARTED** |
| 6 | D3, the floor writes rather than arranges | **NOT STARTED** |
| 7 | Re-walk six arrivals both viewports | **DONE**, as part of item 1 |

---

## THE ONE DECISION WAITING ON THE FOUNDER

**The artwork poster still has about a third of its information band empty.**
Full reasoning and two options in the verdict doc. It needs a ruling rather than
an agent's taste, because fixing it breaks byte parity with the pre-split
renderer, and that parity proof is currently the only thing guaranteeing the
artwork path has not silently moved. It is also the single biggest remaining
reason a promoter would not forward the poster.

I did not touch it, under the standing rule about not regressing a working
surface.

---

## ITEM 3: JOB 3, THE TWEAK LAYER

Already scoped by the Job 1 research; do not re-derive it. Layout treatment,
constrained named palettes, logo. **No free colour picker** (the Humanitix
support page is live evidence of an unconstrained picker producing a gradient
users want removed and a support answer telling them to type a hex code from
memory). **No text scale** (Canva's own four-step sequence never mentions
resizing type, and `fitPosterTitle` now beats a manual control).

What changed this session that makes it cheaper than it was:

- `fitPosterTitle` now bounds the title by its BOX rather than a fixed point
  size, so a new treatment is mostly a new box rather than new type logic.
- The renderer is already split into two compositions behind one entry point,
  so a third and fourth are additive.

The hard constraint stands: nothing may let a person produce something worse
than the default.

## ITEM 4: D1, THE KIT URL

**Now confirmed visible in the wild**, which it was not before. On the walked
kit the gold ticket bar on the square card reads:

```
From $25 · eventlinqs-app-git-feat-pub...0be8.vercel.app/launch/k/tjzb656rfxgx
```

It is truncated with an ellipsis by the renderer because it does not fit, which
is the clearest possible evidence it is too long. On the poster the same bar
reads `eventlinqs-app-git-feat-...8.vercel.app/launch/k/tjzb656rfxgx`.

Note before changing anything: part of that length is the PREVIEW hostname, not
the format. On production the host is short, so the real question is only
`/launch/k/[code]` versus `/e/[code]`. Measure both on the production host
before deciding, and cite Eventbrite's own `/e/[slug]` default. Say plainly
whether this needs `feat/launch-kit-artefacts` merged first, since that branch
established the readable-code format.

## ITEM 5: D2, THE CHILD-SAFETY PROOF

Unchanged and still the highest-value untested claim in the build. Create an
unlisted event on TEST and watch it stay out of the digest, the feed, the
sitemap and a search index, with your own eyes, and paste evidence for all four.

One thing this session adds that is adjacent but NOT the same claim: the
composer's own privacy path is now partly proven, in that a home-address photo's
GPS EXIF is genuinely stripped from the stored object. That is the IMAGE half.
The four-surface visibility half is untouched.

## ITEM 6: D3, THE FLOOR

Unchanged. Research what a good gig listing actually reads like from real
published examples, cite them, improve the deterministic floor. No model call on
the anonymous path.

---

## STANDING RULES AND FOOTGUNS FOR THE NEXT SESSION

**Run `npm run build`.** This branch had six consecutive failed preview
deployments while every other gate was green. Unit tests, tsc, lint and the
guards cannot see a server-only module reaching the client bundle; only the
build can. Run it before believing any "verified on the preview" claim.

**Build against `.env.test`**, never bare. `.env.local` points at the PRODUCTION
Supabase project and the env isolation guard will block the build, correctly.
Use `set -a; . ./.env.test; set +a; npm run build`.

**Law 8 is now gated.** `.githooks/commit-msg` refuses AI attribution trailers,
and `core.hooksPath` was already set to `.githooks` (the directory simply did
not exist). Proven to refuse a dirty message and pass a clean one.

**Three commits on this branch still carry the trailer** and are already pushed:
`0b103f4`, `da9bc30`, `e991173`. They predate Law 8. I did not rewrite them,
because that means a force-push to a shared branch and the standing rule says to
stop and report rather than alter something that works. If you want them clean,
that is a deliberate `git rebase` plus `push --force-with-lease`, and it should
be your call, not a side effect.

**The parity proof restores from a snapshot, not from git.** An earlier version
used `git checkout -- <file>` and silently reverted an uncommitted fix. Do not
reintroduce that.

**The extension cannot give you a true 390 viewport.** `resize_window` changes
the outer window and leaves `innerWidth` at 750. Use the Playwright walk
(`scripts/verify/launch-kit-walk.mjs`), which sets the viewport properly and now
uploads artwork on three of the six arrivals.

**Rate limits.** `launch-upload` is 10 per IP per hour and FAIL-CLOSED. A walk
uses three. Budget for it; a tripped limit is designed behaviour.
