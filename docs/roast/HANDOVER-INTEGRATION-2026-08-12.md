# Handover: integration/launch, 12 August 2026

The five launch branches merged into one tree for the first time. Written so a
fresh session resumes without re-deriving anything.

**Read this before touching the branch.**

## 0. REQUIRED FIRST STEP: the runtime, every session

**The platform runs on Node 24. Founder ruling, 13 August 2026.** Node 20 is
deprecated by Vercel on 1 October 2026 and this platform does not run on a
deprecated runtime. Every environment was brought forward in one pass: `.nvmrc`,
`package.json` `engines`, every workflow, and the recorded guard surface.

`.nvmrc` pins Node **24** and the newest 24.x LTS at the time of the move was
**24.19.0** with npm **11.17.0** (source: `https://nodejs.org/dist/index.json`,
fetched 13 August 2026). The guard surface in
`scripts/guards/lib/node-surface.json` was re-recorded from 24.19.0.

This machine has no version manager. Its system Node is 24.14.0, five patches
behind the contract, so a portable extract of the exact version lives at
`C:\node24`. Run this FIRST, in every shell, before any node, npm, npx or build
command:

```powershell
$env:PATH="C:\node24\node-v24.19.0-win-x64;$env:PATH"; node --version
```

It must print `v24.19.0`. The shell does not keep this between tool calls, so it
belongs at the start of every command, not once at the start of a session.

If `C:\node24` is absent, recreate it from the official zip. The destination must
be a SHORT path, because extracting under the long scratchpad path trips the
Windows MAX_PATH limit, and the zip itself cannot be written to the root of
`C:\` on this machine, so stage it inside the destination directory:

```powershell
New-Item -ItemType Directory -Force "C:\node24" | Out-Null
$zip = "C:\node24\node-v24.19.0-win-x64.zip"
Invoke-WebRequest -Uri "https://nodejs.org/dist/v24.19.0/node-v24.19.0-win-x64.zip" -OutFile $zip -UseBasicParsing
Expand-Archive -Path $zip -DestinationPath "C:\node24" -Force
Remove-Item $zip -Force
```

`C:\node20` was the previous portable extract and is no longer used by anything.
It can be deleted.

### VERCEL SELECTS THE RUNTIME FROM `engines.node`

This is the line that stops the two silently disagreeing again, so it is stated
plainly rather than left to be rediscovered, and it is cited rather than
asserted.

Vercel publishes exactly two mechanisms for choosing the Node.js version, at
`https://vercel.com/docs/functions/runtimes/node-js/node-js-versions` (fetched
13 August 2026): the **Node.js Version** dropdown in Project Settings, and the
`engines.node` field in `package.json`. Of the two, the file wins. Verbatim:

> "You can define the major Node.js version in the `engines#node` section of the
> `package.json` to override the one you have selected in the Project Settings"

and, on the mapping:

> "when you set the Node.js version to 20.x in the Project Settings and you
> specify a valid semver range for Node.js 24 (e.g. 24.x) in package.json, your
> project will be deployed with the latest 24.x version of Node.js"

The page lists **24.x (default), 22.x and 20.x** as the available versions, and
`24.x` maps to "latest 24.x version". So the deployed runtime now lives in
version control beside the code it runs, rather than in a dashboard nobody
remembers to check.

**Precisely: that page documents those two mechanisms and does not mention
`.nvmrc` anywhere.** That is an absence, not a published denial, so the honest
statement is that `.nvmrc` is not one of Vercel's documented selection inputs and
must not be relied on to set the deployed runtime. `.nvmrc` remains load-bearing
for CI and for the local guard contract, which is why both files exist.

**UNSOURCED:** the 1 October 2026 Vercel deprecation date for Node 20 comes from
the founder ruling of 13 August 2026. It does not appear on the versions page
above, which still lists 20.x as available. The move to 24 stands on its own
merits either way; the date is recorded here as unverified rather than quoted as
Vercel's.

`package.json` therefore carries:

```json
"engines": { "node": "24.x" }
```

The two files serve different readers and must be changed together:

| File | Read by | Pins |
|---|---|---|
| `package.json` `engines.node` | **Vercel**, npm | `24.x` |
| `.nvmrc` | `actions/setup-node` in CI, `scripts/guards/contract-node.mjs`, `node-version-contract` | `24` |

**What enforces this: one blocking gate and one label.**
`scripts/guards/node-version-contract.mjs` runs in `prebuild` and fails the build
when any script uses an API absent from the recorded surface, in either
direction: an API too NEW for the contract, and, since the 24 move, one that the
contract has REMOVED. `scripts/guards/run-guards.mjs` LABELS a wrong-major run
`NOT CI-EQUIVALENT` and still exits on the guard results alone. That label is
derived from `.nvmrc`, never hardcoded, so it inverted by itself when the
contract moved: a Node 24 run now reads CI-EQUIVALENT and a Node 20 run reads
NOT CI-EQUIVALENT. It is a warning, not a gate. Read it on every run.

---

## 1. WHERE IT IS

| | |
|---|---|
| Branch | `integration/launch` |
| Worktree | `C:/Users/61416/OneDrive/Desktop/EventLinqs/el-moat` |
| Based on | `origin/main` at `86bb285` |
| State | uncommitted, mid-merge, three files still conflicted |
| `node_modules` | present and valid in that worktree (tsc 5.9.3 verified) |

The worktree previously held `feat/launch-kit-moat`. That branch is pushed at
`9694e0f` and nothing is lost by the switch.

`git merge --abort` discards the whole thing cleanly if a restart is preferred.

## 2. WHY IT EXISTS

Every gate result before this was PER BRANCH. Each of the five was merged
against `main` and verified alone. Nothing had ever tested the five against EACH
OTHER, and the conflicts resolved along the way were, by definition, exactly the
places where two branches touched one file.

A sweep of `main` cannot answer this, because `main` contains none of the five.
That refusal and its reasoning are recorded as the counter-example in
`docs/roast/FALSE-POSITIVE-CHECKLIST.md`.

## 3. MERGE STATE

| # | Branch | Result |
|---|---|---|
| 1 | `feat/public-composer` (#113) | **CLEAN.** Zero conflicts |
| 2 | `fix/security-hardening` (#114) | **SIX conflicts.** Three resolved, three open |
| 3 | `feat/launch-kit-artefacts` (#115) | not started |
| 4 | `feat/launch-kit-moat` (#116) | not started |
| 5 | `fix/production-sweep` (#117) | not started |

**No gates were run. No browser walk was done. No claim is made about either.**

## 4. THE THREE RESOLVED, so nobody re-decides them

### 4a. `scripts/guards/run-guards.mjs` - UNION

Two conflict regions, the registry array AND the header comment, which is the
collision the earlier handover predicted for this file.

`feat/public-composer` registers 2 guards (`migration-collision-guard`,
`payment-critical-doctrine`). `fix/security-hardening` registers 7
(`rls-exposure-scan`, `no-native-submit`, `revoked-column-reads`,
`no-plaintext-credential`, `entrypoint-authz-audit`, `sourced-specifications`,
`no-ai-authorship`). Neither list contains the other. Union, both regions.

Verified: **21 guards registered**, `node --check` passes.

The registry test requires the header comment to name every registered guard, so
the header union is not cosmetic. Skip it and
`tests/unit/guards/guard-registry.test.ts` goes red.

### 4b. `vercel.json` - UNION

`feat/public-composer` adds the `sweep-kit-covers` cron. `fix/security-hardening`
adds `connect-reconcile` and `connect-divergence`. All three are wanted. Union.

Verified: `JSON.parse` succeeds. Worth re-checking after any further edit, because
a conflict marker in JSON is a parse error rather than a runtime surprise.

### 4c. `src/lib/media/image-pipeline.ts` - COMPOSED

**This is the most dangerous find of the session and the clearest argument for
building this branch at all.**

Both branches rewrote the same block of the upload pipeline, and the two changes
are ORTHOGONAL:

```
feat/public-composer     decides HOW BIG
  .resize({ width: IMAGE_DOWNSCALE_LONG_EDGE,
            height: IMAGE_DOWNSCALE_LONG_EDGE,
            fit: 'inside', withoutEnlargement: true })
  The downscale that replaced an older hard reject: an oversize photo comes
  down to the long edge, a small one is left exactly as it is, never upscaled.

fix/security-hardening   decides WHICH FORMAT
  const encoding = decideOutputEncoding(format, meta.compression)
  Replaces a hand-rolled `toJpeg` boolean, and reads meta.compression, which
  is the decompression-bomb signal.
```

**Downstream consumes BOTH**, which is what makes a naive resolution silently
wrong:

```
const { contentType, ext } = encoding     <- from fix/security-hardening
image: { buffer: out.data,
         width: out.info.width, ... }     <- needs resolveWithObject, and the
                                             dimensions must postdate the resize
```

So the composed block keeps the resize, keeps `decideOutputEncoding`, and keeps
`toBuffer({ resolveWithObject: true })` on every branch so the recorded
dimensions are read back from sharp after both the rotate and the resize:

```ts
const encoding = decideOutputEncoding(format, meta.compression)
const pipeline = sharp(inputBuffer)
  .rotate()
  .resize({
    width: IMAGE_DOWNSCALE_LONG_EDGE,
    height: IMAGE_DOWNSCALE_LONG_EDGE,
    fit: 'inside',
    withoutEnlargement: true,
  })

let out: { data: Buffer; info: sharp.OutputInfo }
if (encoding.kind === 'webp') {
  out = await pipeline.webp({ quality: 82 }).toBuffer({ resolveWithObject: true })
} else if (encoding.kind === 'avif') {
  out = await pipeline.avif({ quality: 60 }).toBuffer({ resolveWithObject: true })
} else {
  out = await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer({ resolveWithObject: true })
}
const { contentType, ext } = encoding
```

**WHY IT IS DANGEROUS. Taking either side alone drops the other, and NEITHER
LOSS SHOWS IN ANY TEST.**

- Take `fix/security-hardening` alone: the resize disappears. Every oversize
  upload is stored at full resolution. Nothing fails. The image is still valid,
  still the right format, still has its EXIF stripped. It is just enormous, on
  every event page, for ever.
- Take `feat/public-composer` alone: `decideOutputEncoding` disappears and the
  hand-rolled `toJpeg` returns. `meta.compression` stops reaching the format
  decision, which is the decompression-bomb signal. Nothing fails there either.

Both losses are invisible to the suite, invisible to the guards, and invisible in
review, because each side on its own is coherent, well commented, and passes.
Only the merge puts them in the same room.

**A CORRECTION RECORDED HONESTLY.** The first attempt at this resolution left a
dead-code shortcut in the file: the old branch chain was disabled with a
`const UNREACHABLE_LEGACY_BRANCH = false` guard rather than deleted, so the
composed block compiled with the superseded branches still sitting underneath it.
That was caught and removed in the same pass, and the file now contains one
branch chain and no dead code. It is written down because leaving disabled code
in an upload path is the sort of thing that reads as deliberate six months later.

## 5. THE THREE OPEN

### 5a. `.githooks/commit-msg` - NEEDS THE FOUNDER, AND IS DEFERRED

**Both branches independently wrote a Law 8 commit hook**, and only one file can
exist at that path.

- `feat/public-composer`: refuses `Co-Authored-By` naming Claude, an AI, a bot or
  a tool; refuses "Generated with" lines and the robot emoji; explicitly still
  allows a HUMAN co-author, because pair-programming trailers are legitimate.
  Its header records that `core.hooksPath` already pointed at `.githooks` while
  the directory did not exist, so the law was enforced by memory and three
  trailered commits reached the remote.
- `fix/security-hardening`: same law, fuller rationale, and it names the specific
  reason the hook is needed at all, that the harness default appends the trailer
  and CLAUDE.md Law 8 supersedes it. It ships alongside
  `scripts/guards/no-ai-authorship.mjs`, the second line of the same defence.

**FOUNDER RULING 2026-08-12: DEFERRED.** Not to be chosen until somebody compares
the two hooks' matching rules LINE BY LINE. Both are recorded here.

The standing recommendation, which is a recommendation and not a decision, is
`fix/security-hardening`'s, because the enforcement pair of hook plus guard
should come from one branch and be reasoned about together. Against it:
`feat/public-composer`'s is the hook currently installed and passing on every
commit made this session, so it has the operating record.

**The next session compares the rules and REPORTS. It does not choose.**

### 5b. `CLAUDE.md` - two regions

Both branches amended the constitution. Not yet examined. At stake: the
constitution is the file every other decision is measured against, so a silently
dropped clause here is worse than a dropped feature. Expect Law 7 and Law 8 to be
involved, since the earlier handover flagged that neither was present in
`feat/public-composer`'s copy.

### 5c. `src/app/(dashboard)/dashboard/organisation/page.tsx` - one small region

A layout region (`<div className="mt-6 flex flex-wrap gap-4">` on one side). Looks
trivial, and was not examined. At stake: probably nothing, but it is an organiser
dashboard surface, so confirm rather than assume.

## 6. THE MERGE ORDER FINDING

**`#113 first is CONFIRMED CORRECT.** It merges into `main` with zero conflicts,
because it already contained `main`. It costs nothing and it catches `main` up.

**`#113` into `#114` is the expensive step, and no order avoids it.** The six
conflicts are between THOSE TWO BRANCHES, not against `main`. Whichever of them
lands second pays the same bill. This is new information: it was not visible from
either PR, because each PR only ever showed its own diff against `main`.

**Whether #115, #116 and #117 collide with EACH OTHER is UNKNOWN.** That is
exactly what merges 3 to 5 would reveal and it is the main open question. The
files to watch are already known:

- `auth-errors.ts`, `api/auth/signup/route.ts`, `signup-form.tsx`, where the
  ruling is #115's implementation with #117's tests, already executed on #117
  (`12ae6cd`) so those two should now agree
- `fetchers.ts`, `search-params.ts`, `types.ts`, `events/page.tsx`, where the
  nine resolutions and the suburb ruling apply
- `no-clock-during-render.test.ts`, where `KNOWN_UNFIXED` stays empty, the walk
  covers `.ts` and `.tsx`, and `isExempt` plus its assertions survive
- `run-guards.mjs`, where every branch edits the registry AND the header comment
- the migration versions, where `migration-collision-guard` is now a registered
  gate and should catch anything not yet seen

## 6b. `SUPABASE_DB_URL` MUST NEVER BE HANDED TO pg AS A STRING

Recorded because the symptom points at the wrong thing and cost an hour once.

**The database password is not percent-encoded**, and the real value in this repo
contains characters that are RESERVED in a URL. Two consequences follow, and the
second is the trap:

1. `new URL(SUPABASE_DB_URL)` throws on it, so the project ref can never be read
   that way.
2. `new pg.Client({ connectionString })` throws `ERR_INVALID_URL` and pg prints
   the offending input as `*****REDACTED*****`. **That redaction reads like an
   unset placeholder value rather than a parse failure**, so the obvious
   conclusion is "the variable is not set" when in fact it is set and correct.

**The fix, and where it lives.** `scripts/lib/production-write-preflight.mjs`
owns a hand parser (`parseConnectionString`) and hands pg **discrete fields**
(`user`, `password`, `host`, `port`, `database`) through
`resolveDatabaseTarget().clientConfig`. Nothing else may parse a connection
string. Two positional rules make an unescaped password safe to read: the **last**
`@` separates credentials from host, so an `@` inside the password cannot split
it early, and the **first** `:` inside the credentials separates user from
password, so a `:` inside the password stays there.

The password is extracted into `clientConfig` only. It is never placed on the
returned target, never packed into a message, and never logged.

**All seven call sites now route through it:** the four e2e scripts
(`payout-e2e`, `refund-e2e`, `analytics-gmv-e2e`, `organiser-transition-e2e`) and
the three seeded-data scripts (`seeded-order-forensics`, `seeded-dependency-map`,
`seeded-purge-rehearsal`). The last three additionally had the WRONG preflight:
they called `assertNotProduction()`, which judges `NEXT_PUBLIC_SUPABASE_URL`,
while connecting over `SUPABASE_DB_URL`. Those are different variables and can
name different projects, so a run could pass its preflight and connect somewhere
else entirely. They now call `assertNotProductionDatabase()`, which judges the
connection string it is actually about to open.

`pg` is a declared devDependency, pinned `8.23.0`. It was imported by the four
e2e scripts and declared nowhere, so none of them could run at all. 8.23.0 is the
current release on the npm registry as at 14 August 2026 and declares
`node >= 16.0.0`, so it is not a backwards pin under Law 9.

## 7. RESUMING

1. Resolve 5b and 5c. Report on 5a, do not choose.
2. Merges 3, 4, 5 in that order.
3. The five gates, exit codes read directly and never through a pipe:
   `npx tsc --noEmit`, `npm run lint`, `npm test`,
   `node scripts/guards/run-guards.mjs`, `npm run build`.
   Build with `.env.test` exported (`set -a; . ./.env.test; set +a`). Bare, the
   env guard blocks it correctly, because `.env.local` resolves to production.
4. Push, confirm the preview deployment reaches READY rather than ERROR.
5. The browser walk at 390 and 1440, screenshotting each: signup with a duplicate
   address naming the existing account; an event page with the muted map style;
   a Sale opens line in the event's own zone; browse with a suburb filter
   returning events; a Launch Kit rendering poster and all three cards;
   `/events?category=arts-culture` still resolving through the alias.

Any one of those failing is a merge regression and outranks everything else.
