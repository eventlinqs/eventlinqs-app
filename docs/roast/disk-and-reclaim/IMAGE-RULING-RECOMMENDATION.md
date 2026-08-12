# Do 2790 verification screenshots belong in git?

Founder question, 8 August 2026: "2790 screenshots at up to 26 MB is a
verification archive, not source. Recommend whether they belong in git at all,
and if not, where. Do not move anything yet."

**Nothing has been moved.** This is a recommendation.

---

## The recommendation, in one line

**No. They should leave git, and the destination is a Supabase Storage bucket,
with the markdown proofs staying in git and linking to them.**

---

## Why not git, specifically

**1. Git stores every version of a binary in full.** Delta compression is
effective on text and near-useless on PNG, which is already compressed. Every
re-capture of the same surface adds its entire size to history, permanently.
`docs/benchmark/system-pass/surface-5/` holds a `before/city-1440.png` at
14.9 MB and an `after/city-1440.png` at 15.1 MB: 30 MB of history for one
comparison that a reviewer looked at once.

**2. The cost is paid by everyone, forever.** `.git` is 1.66 GB and shared by
nine worktrees. It is cloned in full by CI, by any new machine, and by any new
worktree. History cannot be selectively forgotten without a rewrite.

**3. The access pattern is the opposite of source.** Source is read constantly,
diffed line by line, and reviewed. This archive is **write-once, read-rarely,
and diff-never**: a PNG diff shows "binary files differ", which is no
information at all. It is consulted when somebody disputes a claim, which is
occasionally and by one person.

**4. It is already replicated nine times** (10.68 GB), which sparse-checkout
mitigates but does not fix: thinning stops the working trees carrying it, and
`.git` still does.

**The counter-argument, which is real:** the constitution demands proof with
evidence, and evidence that is not durable is not proof. So this is not an
argument for deleting the archive. It is an argument that git is the wrong
durable store for it.

---

## Where instead: Supabase Storage

Already in the stack, already paid for, already has an access model and a client
in this codebase.

- A private bucket, `verification-evidence`, with paths mirroring the current
  layout (`benchmark/system-pass/surface-5/after/city-1440.png`).
- The markdown proof documents **stay in git**. They are small, diffable, and
  the thing that actually carries the argument. Only the image `src` changes,
  from a relative path to a bucket URL.
- Retrieval is a signed URL, so evidence stays private without a second login.

### Why not the alternatives

| Option | Why not |
|---|---|
| **git-lfs** | Still couples the archive to the repo, adds an LFS install to every clone, every worktree and the Vercel build, and LFS bandwidth is billed per fetch. It moves the problem rather than removing it. |
| **Delete the old ones** | Destroys the record the constitution requires. A benchmark verdict without its capture is an assertion. |
| **A shared drive (OneDrive/Drive)** | The tree is ALREADY inside OneDrive and that is part of the current pathology. No access model, no addressing, no integration with the proof docs. |
| **Leave it** | The measured trajectory: `.git` grows every session, and it is the one component sparse-checkout cannot touch. |

---

## Do this regardless of the ruling: stop the bleeding

Independent of where the archive lives, **the captures are far larger than they
need to be**, and this is the cheapest win available:

- The harnesses write lossless full-page PNG. A quality-80 WebP or JPEG of the
  same capture is typically **a tenth the size** and reads identically in a
  review. 26 MB becomes about 2.5 MB.
- Full-page captures at 1440 are the biggest files. Most proofs need the
  viewport, not the entire scrollable page.

That is a change to the Playwright capture options in the proof harnesses, it is
small, and it makes every future session cheaper whichever store wins.

---

## What I am NOT recommending yet

**A history rewrite.** Removing the existing 1.66 GB from `.git` requires
`git filter-repo` and rewrites every commit hash, which invalidates nine
worktrees, every open branch, and every SHA referenced in the handover
documents. It is the only way to actually reclaim the history, and it is a
separate, planned, everybody-stops operation. **Decide the destination first,
stop adding to the archive, and treat the rewrite as its own project with its
own approval block.**

## Sequencing, if the recommendation is accepted

1. Switch the capture harnesses to WebP quality 80 and viewport-not-full-page
   where the proof allows. Cheap, immediate, no migration.
2. Create the bucket and move `docs/benchmark/` first: it is 1001 MB, the
   largest single subtree, and the least frequently opened.
3. Leave `docs/roast/` and the recent proof directories in git for now: they are
   small, actively read, and the ones a reviewer opens this week.
4. Revisit the history rewrite once nothing new is being added.
