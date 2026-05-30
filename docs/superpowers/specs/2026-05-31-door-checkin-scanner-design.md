# Door check-in scanner (design)

Date: 2026-05-31
Branch: `feat/door-checkin-scanner` (off `origin/main`)
Status: Decisions approved by founder 2026-05-31
Launch-gate: item 5

## Mission

Event staff scan a ticket QR at the door and get an instant, correct ADMIT or
REJECT. First scan admits; any later scan is refused. Hard invariant: a ticket
admits exactly once, and only if it is valid for this event.

## Evidence (verified on-disk, not assumed)

From `supabase/migrations/20260517000001_ticketing_system_v1.sql` and
`src/app/t/[code]/page.tsx`:

- `tickets`: `ticket_code TEXT UNIQUE`, `secret UUID`, `status TEXT CHECK IN
  ('valid','scanned','refunded','void','transferred') DEFAULT 'valid'`,
  `scan_count INT`, `first_scanned_at`, `last_scanned_at`, `scanned_by UUID ->
  auth.users`. Check-in columns already exist; we reuse them.
- `ticket_scans` append-only audit: `result CHECK IN
  ('admitted','already_scanned','invalid','wrong_event','refunded','void')`,
  `ticket_id NOT NULL`, `event_id`, `scanned_by`, `scanned_at`, `device_info
  jsonb`. SELECT policy currently owner-only, with a comment inviting org-member
  widening.
- QR encodes `https://<site>/t/<ticket_code>?k=<secret>`; both `ticket_code` and
  `secret` are required to view a ticket.
- Ownership: `events.organisation_id -> organisations.owner_id = auth.uid()`,
  plus `organisation_members` (role enum `owner/admin/manager/member`). Platform
  admin = row in `admin_users` with `disabled_at IS NULL`.
- Tickets are minted `status='valid'` by SECURITY DEFINER
  `issue_tickets_for_order`, fired by the `orders.status -> confirmed` trigger.
- No `scan_ticket`/`check_in_ticket` RPC exists. No QR-decode library is
  installed (`qrcode` is encode-only).

## Approved decisions

1. **Reuse existing columns.** Do NOT add `checked_in_at`/`checked_in_by`.
   `first_scanned_at` is the check-in time, `scanned_by` is the scanner. The
   admit-exactly-once invariant lives on a single atomic compare-and-set that
   flips `valid -> scanned`. Audit every attempt in `ticket_scans`.
2. **Build now, prove on staging.** Build the migration (SQL only, not applied),
   the `scan_ticket` RPC, the scanner UI, and unit tests; open the PR. Defer to
   the staging rig (HOLD MERGE): production build, Lighthouse, Playwright at
   1440/768/375, axe-core, and the real-row end-to-end including the concurrency
   proof. Never run the end-to-end against the live database.
3. **E2E ticket via the real purchase flow on staging**, scanned, then torn
   down. Never seed or scan against live.

## A. Migration (SQL only, do not apply)

New file `supabase/migrations/<ts>_checkin_scanner.sql`. Contents:

### A0. Lookup index + audit enum

- `tickets.ticket_code` is already `TEXT NOT NULL UNIQUE`, which creates a unique
  btree index, so the scan lookup is an instant index probe under a door queue.
  The migration documents this and does NOT add a duplicate index.
- Extend the `ticket_scans.result` CHECK to add `'transferred'` so a transferred
  ticket is logged with its own distinct reason rather than collapsed to
  `invalid`:
  ```sql
  ALTER TABLE public.ticket_scans DROP CONSTRAINT ticket_scans_result_check;
  ALTER TABLE public.ticket_scans ADD CONSTRAINT ticket_scans_result_check
    CHECK (result IN ('admitted','already_scanned','invalid','wrong_event','refunded','void','transferred'));
  ```

### A1. `scan_ticket` RPC (the atomic heart)

```
scan_ticket(p_ticket_code text, p_secret uuid, p_event_id uuid)
  returns table(result text, status text, holder_name text, first_scanned_at timestamptz, message text)
```

- `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp`.
- Identity is `auth.uid()` (never a trusted parameter), so the scanner cannot be
  spoofed. Called via the authenticated server client, not the admin client.
- `GRANT EXECUTE ... TO authenticated` only.

Logic, in order:
1. `v_uid := auth.uid()`. If null, `RAISE EXCEPTION 'not_authenticated'`.
2. Authorisation: `v_authorised :=` event owner
   (`organisations.owner_id = v_uid`) OR `organisation_members` row for the
   event's org with `role IN ('owner','admin','manager')` OR active `admin_users`
   row. If not authorised, `RAISE EXCEPTION 'not_authorised'`. (AuthZ failure is
   an error, not a normal REJECT reason.)
3. **Atomic compare-and-set (the invariant):**
   ```sql
   UPDATE public.tickets
      SET status = 'scanned',
          first_scanned_at = COALESCE(first_scanned_at, now()),
          last_scanned_at = now(),
          scan_count = scan_count + 1,
          scanned_by = v_uid
    WHERE ticket_code = p_ticket_code
      AND secret = p_secret
      AND event_id = p_event_id
      AND status = 'valid'
   RETURNING holder_name, first_scanned_at INTO v_holder, v_first;
   GET DIAGNOSTICS v_rows = ROW_COUNT;
   ```
   The row-level lock Postgres takes on the matching row serialises concurrent
   callers: exactly one sees `ROW_COUNT = 1`.
4. If `v_rows = 1`: result `admitted`. Insert `ticket_scans(result='admitted')`.
   Return ADMIT.
5. Else re-read the ticket by `ticket_code` to diagnose (no row lock needed):
   - no row -> `invalid` (not found). Cannot audit (ticket_scans.ticket_id NOT
     NULL); return without an audit row.
   - `secret <> p_secret` -> `invalid`.
   - `event_id <> p_event_id` -> `wrong_event`.
   - `status = 'scanned'` -> `already_scanned`.
   - `status = 'refunded'` -> `refunded`.
   - `status = 'void'` -> `void`.
   - `status = 'transferred'` -> `transferred` (audited as `transferred`; a
     distinct reason, never generic invalid).
   For any branch where the ticket exists, insert the matching `ticket_scans`
   row, then return REJECT with the reason.

Result-to-UI mapping (each reject is a clear, distinct reason for door staff):
- `admitted` -> ADMIT (green).
- `already_scanned` -> REJECT "Already used".
- `refunded` -> REJECT "Refunded".
- `void` -> REJECT "Void".
- `transferred` -> REJECT "Transferred away".
- `wrong_event` -> REJECT "Wrong event".
- `not_found` -> REJECT "Not found" (covers no row and secret mismatch, so a bad
  secret is not an oracle).

### A2. RLS

The RPC is SECURITY DEFINER so writes do not depend on RLS. For dashboards,
widen `ticket_scans` SELECT (and confirm `tickets` UPDATE) to include
`organisation_members` roles `owner/admin/manager` and active `admin_users`,
mirroring the RPC's authorisation. No new write policy is needed.

### A3. Apply commands (founder runs; I will stop here)

```
supabase db push --linked      # from PowerShell, this worktree
npm run db:types               # regenerate src/types/database.ts
```

## B. Scanner UI

Route `src/app/scan/[eventId]/page.tsx` (server) + a `'use client'` scanner
component. Server page: `getUser`, verify the user is authorised for the event
(same checks as the RPC), else `redirect('/login...')` or `notFound`. Loads event
title for the header.

Client scanner:
- Live camera via `getUserMedia({ video: { facingMode: 'environment' } })` drawn
  to a hidden `<canvas>`; decode frames with `jsQR` on a `requestAnimationFrame`
  loop (small, MIT, pure-JS; decodes `ImageData`).
- QR payload is the bearer URL; parse out `ticket_code` (path) and `secret`
  (`?k=`). Reject unparseable payloads with a clear message.
- On decode, call a server action `scanTicket(eventId, ticketCode, secret)` ->
  `scan_ticket` RPC via the authenticated client. Show a full-screen result:
  large green ADMIT or red REJECT with reason and holder name.
- Rapid-scan safe: debounce identical codes for ~3s, lock during an in-flight
  request, auto-clear the result after a short delay so the next attendee can be
  scanned. No double submit.
- Manual fallback: a code-entry input (and `?k` secret) for an unreadable QR,
  calling the same action. The manual form is ALWAYS available, not only after a
  camera failure.
- Camera failure handling: if `getUserMedia` is denied, unavailable, or throws,
  the UI never shows a blank screen. It renders a visible prompt ("Camera
  unavailable - enter the code manually") and focuses the manual entry form, so
  staff can keep working. The same fallback covers browsers without camera
  support.
- Token-only styling, 44px targets, clear camera-permission and no-camera
  states, no em or en dashes, mobile-first (primary viewport 375).

## C. Server action

`src/app/scan/actions.ts`: `scanTicket(eventId, ticketCode, secret)` -> auth
check (session exists) -> `supabase.rpc('scan_ticket', {...})` via the
cookie-based client so `auth.uid()` is the staff user. Returns a typed
`{ result, message, holderName, firstScannedAt }`.

## D. Tests

- **Unit (now, no DB):** a pure `lib/scanner/parse-qr.ts` that extracts
  `{ ticketCode, secret }` from a bearer URL or raw code, with a full test suite
  (valid URL, raw code, missing secret, wrong host, garbage). A pure
  `lib/scanner/result.ts` mapping RPC result codes to UI label/tone/reason, fully
  tested. These hold the parsing and presentation logic out of the component.
- **Concurrency + e2e (deferred to staging, HOLD MERGE - these are the tests
  that prove the door cannot double-admit; deferred, not optional; merge holds
  until they pass on staging):** a runnable test that,
  against a real Postgres, mints a real ticket via the purchase flow, fires two
  concurrent `scan_ticket` calls and asserts exactly one `admitted` and one
  `already_scanned` with `scan_count = 1` and one `first_scanned_at`; then the
  scenario suite (admit; re-scan already used; refunded/void rejected; wrong
  event rejected; unauthorised user refused), restoring rows after. Script
  delivered in this PR; executed on staging.

## E. Gates

- Now: typecheck 0, lint 0, vitest green (unit suites above).
- Deferred to staging (HOLD MERGE): production build, Lighthouse 95+ on
  `/scan/[eventId]`, Playwright 1440/768/375 (mobile primary), axe-core 0, and
  the concurrency + e2e proof.

## F. Notes / flags

- `package.json` gains `jsqr` (QR decode). CLAUDE.md designates `package.json` a
  `[SHARED]` file; the dependency-adding commit uses the `[SHARED]` prefix.
- Offline scanning is an explicit deferral; the launch scanner is online-only.
- **Follow-up (accepted for launch):** the not-found case writes no audit row
  because `ticket_scans.ticket_id` is `NOT NULL`. A later migration should make
  `ticket_scans.ticket_id` nullable (and add a nullable `attempted_code` column)
  so fraudulent or garbage scans are also logged for security review. Out of
  scope for this PR.

## Out of scope

- Offline / queued scanning.
- A check-in analytics dashboard (RLS is widened to support it later).
- Changing how QR codes are generated or how tickets are issued.
