# The 299 untracked files: what they are, and which matter

Founder direction, 8 August 2026: "enumerate them, tell me what they are, and
tell me which matter. If any is a verification artefact a report depends on, it
needs to be somewhere other than this laptop. If they are all disposable, say so
and I will stop worrying about them."

**They are not all disposable. Three committed reports cite evidence that exists
only on this disk.**

---

## First, a correction to my own number

I reported **1.23 GB**. It is **0.23 GB**. The 1.23 figure was an inference
(primary `docs/` 2.70 GB minus 1.47 GB restored in a throwaway worktree), and
that restore measurement was taken immediately after `sparse-checkout disable`
while git may still have been writing. The direct enumeration below is
authoritative: **299 files, 240 MB**.

The risk is a fifth of what I said. It is still real.

---

## What they are

None of them are from this session. All date from 4 to 26 July, left behind by
earlier sessions that captured evidence and never committed it.

| Files | Size | Directory | Cited by a committed report? |
|---|---|---|---|
| 148 | 114 MB | `docs/verification/2026-07-04` | **YES** |
| 60 | 69 MB | `docs/design/2026-07-04-fable5-after` | **YES** |
| 42 | 42 MB | `docs/verification/walkthrough-defects-2026-07-19` | no |
| 32 | 6 MB | `docs/design/seating-craft-2026-07-26` | **YES** |
| 9 | 5 MB | `docs/verification/maps-live-2026-07-23` | no |
| 6 | 2 MB | `docs/verification/lineup-loop-2026-07-23` | no |
| 2 | 3 MB | `docs/design/hero-height-2026-07-05` | no |

**None is in `.gitignore`.** They were simply never added.

---

## Which matter: 240 files, 189 MB

Three directories are cited by **six committed markdown reports**. If this disk
dies, those reports point at evidence nobody can produce.

**1. `docs/verification/2026-07-04/` (148 files, 114 MB)**
Cited by `docs/verification/2026-07-04-verification-report.md`, which says so in
its own words:

> `docs/verification/2026-07-04/` (local, not committed; screenshots referenced
> below by filename in `docs/verification/2026-07-04/screenshots/`).

A previous session knew and recorded it. That is honest, and it is still a
report whose evidence exists in exactly one place.

**2. `docs/design/2026-07-04-fable5-after/` (60 files, 69 MB)**
Cited by `docs/design/BEFORE-AFTER.md` and
`docs/design/phase3-execution-plan-2026-07-04.md`. `BEFORE-AFTER.md` is a
before/after design comparison: it is the AFTER half. Without it the document
is one half of a comparison.

**3. `docs/design/seating-craft-2026-07-26/` (32 files, 6 MB)**
Cited by `docs/design/SEATING-CRAFT-COMPARISON.md`, `docs/design/SEATING-PLAN.md`
and `docs/roast/seating-craft-2026-07-26.md`. This is the benchmark evidence
behind the "7 of 7 AHEAD" seating verdict.

## Which are lower risk: 59 files, 52 MB

`walkthrough-defects-2026-07-19`, `maps-live-2026-07-23`,
`lineup-loop-2026-07-23`, `hero-height-2026-07-05`.

**No committed document references any of these paths**, so nothing on record
depends on them being present. That makes them lower risk. It does not prove
they are worthless: they are captures from real verification work and a future
session might want them. I would keep them, and I would not lose sleep.

---

## What I did about it, and what I did not

**Did:** `MANIFEST.md` beside this file lists every one of the 299 with a
**sha256** and its size. That is small, text, committed, and it means two
things: if the files are lost we know exactly what was lost, and any copy
recovered later can be proven authentic and complete rather than assumed.

**Did not:** copy them anywhere.

- Committing them contradicts the accepted ruling that images do not belong in
  git, and would add 240 MB to a `.git` already at 1.66 GB.
- Uploading them to Supabase Storage means writing to the **production**
  Supabase project, which no agent does.
- Copying them to another local path leaves them on the same disk, which is the
  actual risk.

## The recommendation

**One copy, off this laptop, today, before any decision about the archive.**
This is a backup, not the migration: it does not prejudge where the archive
finally lives.

The cheapest correct move is an external drive or any cloud target you control:

```powershell
$src = "C:\Users\61416\OneDrive\Desktop\EventLinqs\eventlinqs-app\docs"
robocopy $src "<destination>\eventlinqs-untracked-evidence" /E /XO /R:1 /W:1
```

Then verify the copy against the manifest:

```powershell
Get-FileHash <destination>\...\<file> -Algorithm SHA256
```

The first 16 characters must match the `sha256` column in `MANIFEST.md`.

**Note the tree already sits inside OneDrive**, so these files may already be
synced to your OneDrive account. I could not determine whether `docs/` is
included or excluded from sync without changing OneDrive settings, which is not
mine to do. If it IS syncing, the urgency drops considerably, and that is worth
five minutes of your time to check before you buy a drive.
