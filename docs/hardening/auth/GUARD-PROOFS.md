# Guard proofs

Pasted output for every build guard on the auth-hardening line: what each one
is, proof it PASSES on a clean tree, and proof it FAILS on the defect it exists
to catch. A guard never seen to fail is not a guard.

Two files referenced this document before it existed
(`scripts/guards/auth-provider-guard.mjs` and
`src/app/api/cron/auth-sentinel/route.ts`). That dead reference was itself a
small instance of the problem this branch is about: a claim of proof with no
artefact behind it. The artefact is here now.

Replay everything with:

```
npm run guards                 # the suite, on whatever Node you are running
npm run guards:contract-node   # the suite, on the Node CI runs
npm run guards:drills          # every guard, forced to fail, then restored
```

## The Node version contract

`.nvmrc` is the single definition of the Node major this platform is tested on.
`.github/workflows/ci.yml` reads it through `actions/setup-node`'s
`node-version-file`, so the contract and the runtime CI installs cannot drift
apart by editing one of them.

### The 2026-08-05 failure this contract exists to prevent

Three guards imported `globSync` from `node:fs`. That export landed in Node 22.
CI pins Node 20. The author's machine runs Node 24. All three crashed at import
time in CI:

```
SyntaxError: The requested module 'node:fs' does not provide an export named 'globSync'
Node.js v20.20.2

scripts/guards/auth-provider-guard.mjs:21
scripts/guards/no-supabase-smtp.mjs:22
scripts/guards/sender-single-source.mjs:24
```

Every local gate was green at the time. The guards were not wrong about the
code; they were measured on a runtime CI never uses, and nothing said so.

The same fact, on both runtimes:

```
node 20: v20.20.2 -> fs.globSync is undefined
local  : v24.14.0 -> fs.globSync is function
```

### The fix

All three now take their file list from one shared `sourceFiles()` helper in
`scripts/guards/lib/source.mjs`, built on `readdirSync(dir, { withFileTypes:
true })`, which has existed since Node 10. One walker in one place removes both
the duplication and the version exposure.

### Proof under Node 20, which is the version that failed

```
### Runtime
v20.20.2

### Guard suite under Node 20
[node-version-contract] PASS - 239 scripts hold to the Node 20 surface recorded from node v20.20.2.
[auth-provider-guard] PASS - every provider button is gated (5 checks).
[no-supabase-smtp] PASS - no auth flow depends on Supabase's mailer (4 patterns).
[sender-single-source] PASS - every sender derives from src/lib/email/sender.ts.
[auth-autocomplete-guard] PASS - 5 forms, 11 fields match the WHATWG/Chromium contract.

[guards] all 5 guards PASS.
[guards] runtime: Node 20.20.2 (CI-EQUIVALENT: matches the .nvmrc contract of 20)
```

The whole `prebuild` chain, also under Node 20, exits 0:

```
[disk] 8.9 GB free - ok to build.
[public-env]  ... 4 critical public var(s) empty (local machine has no .env; WARNING, not blocking)
[pricing-lock] WARNING only (local build); this WOULD block on Vercel.
[guards] all 5 guards PASS.
[prebuild] HOMEPAGE_SEED_FIXTURE not set - skipping density fixture (normal/production build).
########## PREBUILD EXIT: 0 ##########
```

### Every added script, parsed under Node 20 with every builtin import resolved

```
AUDIT RUNTIME: v20.20.2

file                                                 parse builtin imports resolved
--------------------------------------------------------------------------------
scripts/guards/auth-autocomplete-guard.mjs           OK    all resolve
scripts/guards/auth-provider-guard.mjs               OK    all resolve
scripts/guards/lib/source.mjs                        OK    all resolve
scripts/guards/no-supabase-smtp.mjs                  OK    all resolve
scripts/guards/run-guards.mjs                        OK    all resolve
scripts/guards/sender-single-source.mjs              OK    all resolve
scripts/verify/auth-credential-manager-proof.mjs     OK    all resolve
scripts/verify/auth-journey-e2e.mjs                  OK    all resolve
scripts/verify/auth-provider-gate-proof.mjs          OK    all resolve
scripts/verify/auth-visual-capture.mjs               OK    all resolve
scripts/verify/auth-visual-diff.mjs                  OK    all resolve
scripts/verify/guard-failure-drills.mjs              OK    all resolve
scripts/verify/upstash-local-stub.mjs                OK    all resolve
scripts/guards/node-version-contract.mjs             OK    all resolve
scripts/guards/contract-node.mjs                     OK    all resolve
scripts/guards/lib/generate-node-surface.mjs         OK    all resolve
--------------------------------------------------------------------------------
CLEAN: 16 scripts, 0 problems on Node v20.20.2
```

## How the contract is enforced, in three layers

No single layer is enough, and the weakest one is named as weak rather than
trusted.

1. **`node-version-contract.mjs`, an ALLOWLIST.** `lib/node-surface.json`
   records what Node 20 actually provides, enumerated by Node 20 itself and
   committed. Anything a script imports or reaches for that is absent from that
   record fails the build. This is deliberately not a denylist: a denylist only
   knows the APIs somebody remembered to add, so it would have caught `globSync`
   and missed the next one.

   Complete for named imports of built-in modules, for built-in module names,
   and for static members of the well-known globals. NOT complete for prototype
   methods such as `.isSubsetOf(`, because the receiver's type is not knowable
   without type inference, so those keep a short hand list. Dynamic access such
   as `fs['glob' + 'Sync']` defeats any static check whatsoever.

2. **`npm run guards:contract-node`.** Runs the whole suite under the contract
   Node itself. This is the complete check, because it is not a check at all: it
   is the real runtime.

3. **The runtime banner.** `run-guards.mjs` labels any run whose Node major is
   not the contract as NOT CI-EQUIVALENT, in its own output, so a green local
   run can never again be quoted as proof of a green CI run:

```
[guards] runtime: Node 24.14.0 (NOT CI-EQUIVALENT: .nvmrc pins 20, CI runs that, this is 24)
[guards] this PASS is NOT proof CI is green. Reproduce CI's runtime with:
[guards]   npm run guards:contract-node
```

### The first version of this guard could not fail

Worth recording, because it is the failure mode guards are most prone to. The
first draft scanned the string-blanked source view for a module specifier. A
module specifier IS a string, so the pattern could never match, and the guard
reported PASS on the very defect it was written for:

```
=== DRILL A: import { globSync } from 'node:fs' reintroduced ===
[node-version-contract] PASS - 238 scripts hold to the Node 20 contract in .nvmrc.
EXIT: 0
```

The drill caught it; nothing else would have. Each check now scans the view it
needs (`withStrings` for specifiers, `code` for identifiers) and compares byte
offsets between the two views to tell a real statement from one quoted inside a
string. Every check has a drill for exactly this reason.

## Drill output: every guard forced to fail, then restored

```
FAILS AS EXPECTED  ungated provider button (the 2026-08-02 production defect)
FAILS AS EXPECTED  provider button in an unregistered file
FAILS AS EXPECTED  gate prop weakened to optional
FAILS AS EXPECTED  page renders a gated form without resolving provider state
FAILS AS EXPECTED  password reset back on Supabase SMTP (the recovery-email defect)
FAILS AS EXPECTED  magic link back on Supabase SMTP
FAILS AS EXPECTED  sender address literal reintroduced
FAILS AS EXPECTED  sign-in email field reverted to autocomplete="email"
FAILS AS EXPECTED  name attribute dropped from the sign-in password field
FAILS AS EXPECTED  hidden username field removed from the reset form
FAILS AS EXPECTED  globSync imported from node:fs (the 2026-08-05 CI failure)
    exit 1: scripts/guards/no-supabase-smtp.mjs:22 imports { globSync } from 'node:fs',
FAILS AS EXPECTED  a built-in module that does not exist in Node 20 (node:sqlite)
    exit 1: scripts/guards/no-supabase-smtp.mjs:22 imports 'node:sqlite', which does not exist
FAILS AS EXPECTED  a global static added after Node 20 (Promise.withResolvers)
    exit 1: scripts/guards/no-supabase-smtp.mjs:52 uses Promise.withResolvers, which Node
FAILS AS EXPECTED  a prototype method added after Node 20 (Set.isSubsetOf)
    exit 1: scripts/guards/no-supabase-smtp.mjs:52 uses .isSubsetOf(, added in Node 22.
FAILS AS EXPECTED  a workflow pinned BELOW the .nvmrc contract
    exit 1: below the .nvmrc contract of 20. Every script would then run

--- restoring and re-verifying a clean tree ---
  all guards PASS on the restored tree.

=== 15/15 drills fired correctly ===
```

## Regenerating the surface record

Only when `.nvmrc` changes, and only under the new contract version:

```
npm run guards:surface
```

`generate-node-surface.mjs` refuses to run on any other major, because a
manifest generated on the wrong Node would describe the wrong platform and would
silently bless every API the contract version does not have. That is the exact
mistake the manifest exists to prevent.
