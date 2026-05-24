# PR process

Owner: Lawal Adams. Last updated: 2026-05-24.

## Rule

No PR may be merged unless every required CI check is green. Use of `gh pr merge --admin` is forbidden except for the following emergency conditions:

1. Production is down and the fix has been verified locally with the same gates the CI runs.
2. The failing check has been verified as infrastructure outage (GitHub Actions, Vercel, Supabase) and a status-page or vendor confirmation is captured.
3. Explicit founder approval is left as a comment in the PR thread before the override.

In all three cases, a follow-up issue must be opened within 1 hour to fix the underlying gate so that the override does not recur. The follow-up issue links back to the merged PR and the override reason.

## Why

`gh pr merge --admin` silently bypasses GitHub's required-status-checks gate without leaving a separate audit trail beyond the merge commit. As of 2026-05-24 every PR-targeting Lighthouse CI run for the prior 50 runs has been failing (Lighthouse CI: 0 / 50 success) and PRs have nevertheless been merging via admin override. The root cause was a single missing CI env var (`SUPABASE_SERVICE_ROLE_KEY`), not a real performance regression. A required-checks gate would have surfaced and forced the fix on the first failing PR instead of normalising override.

## Branch protection settings required

GitHub returns `Branch not protected` for `main` as of this writing. The required configuration (Repo Settings -> Branches -> Branch protection rules -> Add rule for `main`):

- Branch name pattern: `main`
- Require a pull request before merging: on
  - Require approvals: 0 (single-founder repo; documented exception). Bump to 1 when a second maintainer joins.
  - Dismiss stale pull request approvals when new commits are pushed: on
  - Require review from Code Owners: off (no CODEOWNERS file yet)
- Require status checks to pass before merging: **on**
  - Require branches to be up to date before merging: on
  - Required status checks (add by name; the names must match the `jobs.<name>` job names in each workflow):
    - `lint · typecheck · build` (from `CI / verify`)
    - `test (vitest)` (from `CI / test`)
    - `Lighthouse mobile gate` (from `Lighthouse CI / lighthouse`)
- Require conversation resolution before merging: on
- Require signed commits: off (defer; needs key distribution)
- Require linear history: on (matches the current squash-merge convention)
- Require deployments to succeed before merging: off (post-deploy smoke is a post-merge gate, not a pre-merge gate)
- Lock branch: off
- Do not allow bypassing the above settings: **on**
  - Confirm "Allow specified actors to bypass required pull requests" is empty.
- Restrict who can push to matching branches: off (single-founder repo). Revisit at scale.
- Allow force pushes: off
- Allow deletions: off

The single most important setting in this list is "Do not allow bypassing the above settings". Without it the admin role can still merge red PRs from the GitHub UI even with required checks declared.

`gh pr merge --admin` will then return:

```
GraphQL: Pull request is not mergeable: At least one approving review is required (mergePullRequest)
GraphQL: ...required status checks have not passed (mergePullRequest)
```

instead of silently merging.

## Operating discipline

- Open the PR with a green local pre-flight: `npx tsc --noEmit`, `npm run lint`, `npx vitest run`, `npm run build`, and where applicable `npx playwright test`.
- Wait for the PR's own CI to pass on the actual PR head, not on a local rebase that diverges from the pushed branch.
- If a check fails, fix the cause; do not retry until it goes green by chance and do not convert it to `continue-on-error` or `if: always()` to make it report success. Real fix, not silenced fix.
- If a gate is genuinely wrong (false positive, miscalibrated threshold), open a separate PR to adjust the gate with the evidence written into the PR description. Do not adjust the gate in the same PR whose work the gate is failing on.

## When you do override (one of the three emergency conditions above)

Required content in the override PR comment, before the override:

1. Which of conditions 1, 2, or 3 applies.
2. The link to the failing check and a one-line summary of why the failure is not a real product issue (production-down evidence, GitHub / Vercel status URL, or founder approval).
3. The link to the follow-up issue opened to fix the underlying gate.

Anyone reviewing the audit trail later should be able to walk from the merged PR to the follow-up issue in one click.

## Verification (one-time, post-config)

After setting the branch protection rule:

1. Open a no-op PR with a deliberately failing change (e.g. introduce a `tsc` error).
2. Confirm CI goes red.
3. Try `gh pr merge --admin` and confirm it is rejected.
4. Revert and close. Document the verified date in this file's footer.

## Footer

Branch protection verified configured: pending.
Verified rejection of `gh pr merge --admin` on a red PR: pending.
