/**
 * WHAT EACH BUILD-TIME SCRIPT NEEDS THAT THE VERCEL BUILD HOST DOES NOT HAVE.
 *
 * Close-out F2.1: "Every build-time script must declare which of those it needs,
 * and the registry must carry that declaration."
 *
 * THIS IS NOT THE TOLERANT LIST THAT FAILED, and the difference decides whether
 * this file is a safeguard or the next thing to watch a failure walk past. The
 * list deleted in F1.9.2 was a REVIEW: prose asserting that a script coped
 * without docs/, believed on sight, never executed, and one of its entries was
 * simply wrong. This file makes no claim about coping. It claims only WHAT A
 * SCRIPT USES, and that claim is checked three ways:
 *
 *   1. scripts/guards/build-host-needs-declared.mjs reads the source and fails
 *      the build when a script uses a capability it has not declared;
 *   2. the same guard fails when an entry declares one it does not use, so the
 *      registry cannot outlive the code it describes;
 *   3. scripts/guards/excluded-reads-survive-the-upload.mjs then RUNS every
 *      declaring script in a materialised upload, on a tree with no docs and no
 *      usable git, and requires it to exit 0.
 *
 * A declaration therefore buys a script nothing. It costs it a run.
 *
 * ADDING AN ENTRY IS NOT THE FIX FOR A RED GUARD. It is the fix for a NEW and
 * genuine dependence. If a script has started reading something the build host
 * lacks and does not need to, the fix is to stop reading it.
 *
 * The three capabilities are defined once, in build-host.mjs.
 */

/**
 * @typedef {{ docs?: string, git?: string, token?: string }} Needs
 * Keys are capability names from build-host.mjs; values are why, in one line.
 */

/** @type {Record<string, Needs>} */
export const DECLARED = {
  'scripts/check-pricing-lock.mjs': {
    docs: 'src/lib/health/pricing-lock.mjs parses every locked fee figure out of docs/PRICING.md, which is the PRICING-LOCK block the whole fee system derives from. Re-included in .vercelignore; the first of the five lost deployments.',
  },
  'scripts/guards/branch-protection-required.mjs': {
    git: 'reads the origin remote to name the repository when GITHUB_REPOSITORY is unset.',
    token: 'GITHUB_TOKEN, to ask the GitHub API what protection main actually carries. Without it the guard reports that it cannot see, which is not a pass.',
  },
  'scripts/guards/community-layer-protected.mjs': {
    docs: 'judges the source and the database against docs/scope/community-layer-approved.json, the approved record of the 21 communities. Re-included; the third lost deployment.',
  },
  'scripts/guards/excluded-reads-survive-the-upload.mjs': {
    git: 'a CORRECTION, no longer a dependence (close-out F2.2). The upload is enumerated by walking the filesystem and applying every .gitignore, so it works with no repository at all; where the index IS readable it is asked, because being force-added is a fact only the index holds and 16 shipped rasters under public/ are force-added. This is the FIFTH lost deployment: it ran on the build host, called git ls-files, and threw. It now stands aside there by BUILD SCOPE rather than by failing to find git.',
  },
  'scripts/guards/launch-readiness-honest.mjs': {
    docs: 'scripts/verify/launch-readiness.mjs re-renders docs/verification/LAUNCH-READINESS.md from the adjudication and compares byte for byte, and checks the evidence each PASS row cites is still under docs/verification/launch-readiness. Both re-included; the fourth lost deployment.',
  },
  'scripts/guards/machine-callers-reachable.mjs': {
    token: 'VERCEL_TOKEN or the Vercel CLI login, to read the project live firewall bypass rules. Clause 4 reports NOT JUDGED [no-token] rather than failing, so the build host says plainly that it cannot see.',
  },
  'scripts/guards/no-ai-authorship.mjs': {
    git: 'reads recent commit messages for a Co-Authored-By trailer naming an AI (Law 8). With no history it can neither pass nor fail, so it stands aside; the commit-msg hook and CI both have history and both run it.',
  },
  'scripts/guards/no-plaintext-credential.mjs': {
    docs: 'scans the tracked tree for committed secrets, and its exemptions name docs/ evidence artefacts and docs/modules paths by exact path. Those paths are excluded from the upload, so the exemptions simply match nothing there.',
  },
  'scripts/guards/one-fee-copy.mjs': {
    docs: 'scans docs/marketing and the three fee authority documents for a second fee, because copy the founder pastes into an email reaches an organiser as directly as a page does.',
  },
  'scripts/guards/one-pull-request-at-a-time.mjs': {
    git: 'reads the origin remote to name the repository when GITHUB_REPOSITORY is unset.',
    token: 'GITHUB_TOKEN, to list the open pull requests. Without it there is nothing to count and the guard says so.',
  },
  'scripts/guards/positioning-lock.mjs': {
    docs: 'scans docs/marketing for the banned positioning, and names docs/audit, docs/roast and docs/verification as directories it deliberately does NOT judge, since those record what was said rather than say it.',
  },
  'scripts/guards/pre-push-gate-wired.mjs': {
    git: 'reads the index mode of .githooks/pre-push and core.hooksPath, which is the whole question it exists to ask. It already skips the git-backed half on CI and Vercel by name, because neither has local hooks to run.',
  },
  'scripts/guards/preview-deployment-state.mjs': {
    git: 'names the branch and the commit under test when CI has not published them.',
    token: 'VERCEL_TOKEN or the Vercel CLI login, to ask Vercel the state of that commit deployment. It skips loudly without one, because a guard everyone disables protects nothing.',
  },
  'scripts/guards/sourced-specifications.mjs': {
    docs: 'its reviewed baseline names docs/security/AUDIT-2026-08-08-SECTIONS-2-8.md, whose third-party version claims already carry their advisory links.',
  },
  'scripts/guards/vercelignore-covers-guard-reads.mjs': {
    docs: 'scripts/guards/lib/vercelignore-registry.mjs IS the list of docs/ paths that must survive the upload, so naming them is this guard entire subject.',
  },
}
