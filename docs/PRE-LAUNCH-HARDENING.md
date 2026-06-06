# EventLinqs Pre-Launch Hardening - LOCKED LIST

**Status:** Authoritative as of 14 May 2026 post-Batch-11 merge.
**Owner:** Lawal Adams
**Rule:** Nothing on this list gets forgotten. Every item closed off before friends-launch.

---

## NEW (added post-Batch-11)

### A. Hotfix: Migration chain seed-data + constraint sequencing (CI fix)

**Problem:** GitHub Lighthouse CI workflow fails during `supabase start` because migration `20260507000001_city_taxonomy.sql` triggers the `events_published_real_cover` constraint check on seed event rows that still contain `picsum.photos` URLs.

**Why it matters:** Project cannot be set up from a clean DB. New devs joining or disaster recovery from backup will hit this. Quality CI gate is permanently red.

**Fix scope:**
- Add a corrective migration `<timestamp>_fix_seed_cover_urls_pre_taxonomy.sql` dated BEFORE 20260507000001 (impossible) OR
- Modify migration 20260507000001 to be tolerant of picsum URLs (preferred), OR
- Modify the seed migration 20260426000001 to use real URLs instead of picsum (cleanest if production already has the fix)

**Verification:** Lighthouse CI workflow passes from clean state. `supabase start` followed by full migration apply succeeds. CI badge goes green.

---

### B. Install Sentry SDK in EventLinqs Next.js project

**Problem:** Sentry org exists but project shows the "Get Started with Sentry Issues" setup page - SDK never installed. We cannot capture client or server errors in production. Tonight's Sydney 500 diagnosis took 30 minutes via Vercel logs instead of 30 seconds via Sentry.

**Fix:** Run `npx @sentry/wizard@latest -i nextjs` in eventlinqs-app project. Follow wizard. Verify by triggering a deliberate error and confirming it shows in Sentry dashboard.

**Verification:** Sentry dashboard receives at least one test event from production. Source maps uploaded.

---

### C. ROTATE Mapbox Secret Access Token

**Problem:** Secret token was committed to docs/redesign/batch-11-evidence/lighthouse/*.json files briefly, then removed via `git rm --cached`. Token may have been visible in local git history. Treat as compromised.

**Fix:** Mapbox dashboard → Tokens → revoke old secret token. Generate new secret token. Update wherever it's used (probably nowhere in client code, only in build scripts or server-side - audit needed). Add `docs/redesign/batch-*-evidence/lighthouse/*.json` to `.gitignore`.

**Verification:** Old token returns 401 if attempted. New token works for legitimate uses. Lighthouse JSON pattern added to gitignore.

---

### D. ROTATE Supabase service_role key

**Problem:** Service role key was pasted in conversation history during the Sydney 500 diagnosis. While not committed to a public repo, treat as exposed.

**Fix:** Supabase Dashboard → Project Settings → API → reset service_role key. Update Vercel env var `SUPABASE_SERVICE_ROLE_KEY` for Production + Preview + Development. Force redeploy. Confirm production still working.

**Verification:** Old service_role key returns invalid when tested. New key works. Vercel deployment green.

---

## Launch readiness flagged by Vercel audit

### Preview deployments are publicly indexable (x-robots-tag: index, follow)

**Problem:** Vercel MCP audit confirmed all preview deployments return `x-robots-tag: index, follow` and `HTTP/1.1 200 OK` with no authentication. Work-in-progress builds are crawlable and publicly accessible on the open web ahead of a real-money Australian launch.

**Required changes:**

1. Enable Vercel Authentication with Standard Protection scope in Deployment Protection settings
2. Generate Protection Bypass for Automation secret
3. Add VERCEL_AUTOMATION_BYPASS_SECRET to GitHub Actions secrets
4. Update Playwright tests to send x-vercel-protection-bypass header on preview requests
5. Update Lighthouse CI workflow to send x-vercel-protection-bypass header
6. Verify CI passes on next PR

**Verification:** Preview `.vercel.app` URLs return 401 with `x-robots-tag: noindex`. `www.eventlinqs.com` still returns 200 publicly. Playwright and Lighthouse CI pass on the next PR via the automation bypass header.

**Owned by:** Hardening session
**Priority:** Pre-launch (must be done before public Australian launch)
**Deferred from:** Tonight's session (15 May 2026) - foundation setup priority
**Flagged by:** Vercel MCP audit, see session log

---

## EXISTING (from prior pre-launch hardening list)

1. Confirm Supabase Auth Site URL is https://www.eventlinqs.com (verify in Dashboard → Authentication → URL Configuration)
2. Configure Resend SMTP in Supabase Dashboard → Auth → SMTP Settings (auth emails from noreply@eventlinqs.com)
3. Mapbox public token - add eventlinqs.com and www.eventlinqs.com as URL restrictions
4. Vercel /events caching - review cache headers and edge config (Facebook crawler overwhelm risk)
5. Upstash Redis migration from N. Virginia free tier to Sydney region, paid Fixed 250MB plan
6. **Replace hardcoded "Melbourne" with IP-detected city + state-grouped picker (LOCATION PICKER ROOT FIX)**
   - Tonight's screenshot confirmed: "Could not detect location. Pick a city below instead" - geolocation API failing silently
   - Required: IP detection on first visit via /api/location/set, browser geolocation as enhancement, fallback to "All Australia" not "Melbourne"
   - State grouping: NSW | VIC | QLD | WA | SA | ACT | TAS | NT
   - Desktop dropdown panel, mobile modal
   - Persist selection in cookie/localStorage
7. ~~Replace `supabase.auth.getSession()` with `supabase.auth.getUser()` where user identity is trusted server-side~~ AUDITED AND SATISFIED (2026-05-31, folded from PR #72; re-verified 2026-06-06 on chore/launch-hardening)
   - Server-side already uses the revalidating `getUser()`: middleware (`src/lib/supabase/middleware.ts:36`, gates `/dashboard` + auth-page redirects) plus ~57 server components / route handlers / server actions (all of `src/app/actions/*.ts`, dashboard pages, `src/app/api/stripe/connect/*/route.ts`, `src/lib/admin/auth.ts`, `src/lib/reporting/attendees.ts`, etc.). Zero server-side `getSession()` usages.
   - The only two `getSession()` reads are client-only and safe to leave (the security rationale applies to server code trusting an incoming request cookie; on the client the session is the user's own and the server is the real gate):
     - `src/components/auth/reset-password-form.tsx:22` (`'use client'`) - gates showing the password form vs a "validating link" message; the actual `auth.updateUser({password})` is revalidated server-side by Supabase.
     - `src/components/features/events/save-event-button.tsx:39` (`'use client'`) - login redirect + `session.user.id` for an RLS-protected `saved_events` write; the server authority is RLS (`user_id = auth.uid()`). Switching to `getUser()` would add an auth-server round-trip per click with no security gain.
   - Regression guard: `tests/unit/security/no-server-side-getsession.test.ts` fails the build if any non-`'use client'` file calls `auth.getSession(`.
8. Missing /public/cities/*.svg assets 404ing on homepage (audit which still missing post-Batch-11)
9. Stripe revenue card rounding display bug
10. Authed + organiser E2E smoke test
11. M4.5 Close-out Steps E and A2
12. ~~Run `supabase migration list --linked` and reconcile all local migrations against remote applied list before launch~~ DONE (2026-06-06): no drift, 34 local = 34 remote, all matched. See `docs/launch-hardening/migration-drift-2026-06-06.md`. Re-run if migrations are added before launch.
13. Migrate src/types/database.ts (423 lines, handwritten) to `supabase gen types typescript --linked` before launch
14. ABN 30 837 447 587 inserted into /legal/terms and /legal/privacy (replace "pending registration" text)
15. Street address or PO Box in legal pages
16. /legal/cookies and /legal/organiser-terms still ComingSoon placeholders
17. Logo delivery (Fiverr Pro brief in progress)
18. Plausible analytics installation (cookieless, matches Privacy Policy)
19. Em-dash scrub pass across all seed data and components before launch

---

## DESIGN PHASE (separate, comes after functionality stable)

- Hero desktop height reduction (currently takes full viewport, should be reduced)
- Hero slot cropping refinements (Africultures title position, Pasifika legs-only crop, Caribbean waist-down crop)
- Replace placeholder Pexels imagery with Stocksy/Adobe Stock launch imagery
- Footer redesign (35-40% length reduction)
- Sitewide spacing audit
- CLS stability lock
- Final design polish pass

---

## CONSOLIDATION OPTIONS (TBD)

- `/city/[slug]` redirect to `/events/browse/[city]` (one canonical city page) - decision: Batch 12 or 13
- Admin subdomain (admin.eventlinqs.com) vs /admin path - decision TBD pre-M7

---

End of locked list. Add to this file when items are identified. Tick them off when shipped. Do not ship friends-launch with any item open.
