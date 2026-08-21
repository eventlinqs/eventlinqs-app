# The read the column lockdown missed, and why the dashboard 404'd

Recorded 21 August 2026. Author: Lawal Adams.
**RECORD ONLY. Nothing in this document has been fixed.** The founder's ruling is
that the lockdown goes back on in its own deploy, with nothing else riding on it,
after the missed read is found. This is the finding.

## The current state of production

Production carries a broad `GRANT SELECT` on `organisations`, `venues`, `seats`
and `event_artists` to `anon` and `authenticated`, run by hand as an emergency
rollback when the lockdown took the dashboard event page to 404. That grant is
still in place. Measured read-only on 21 August: `anon` holds table-level SELECT
on all 75 public tables.

So the column lockdown (`20260819000002`, and stage 1 in `20260818000001`) is
currently INERT on production even though its migrations are pending. Applying
them will re-apply the revoke, and the emergency grant will need re-running if the
cause below is not fixed first.

## The cause: a WHERE clause, not a projection

`src/app/(dashboard)/dashboard/events/[id]/page.tsx:87`

```ts
const { data: org } = await supabase        // session client, line 63
  .from('organisations')
  .select('id, name, slug')                  // all three ARE granted
  .eq('id', event.organisation_id)
  .eq('owner_id', user.id)                   // owner_id is NOT granted
  .single()

if (!org) notFound()                         // -> the 404
```

The lockdown grants `authenticated` exactly six columns:
`id, name, slug, description, logo_url, website`.

Every column this query SELECTS is inside that grant. The column it FILTERS on is
not. **PostgreSQL requires SELECT privilege on every column named in a WHERE
clause, not only on the columns returned**, so the query is refused with 42501,
`org` comes back null, and the page calls `notFound()`.

That is why the failure looked like a missing event rather than a permissions
error, and why reading the select list alone would never have found it.

It is also why the earlier sweep missed it. That sweep looked for reads of the
five Stripe sale-posture columns. This query reads none of them.

## Every session-client read that the lockdown will refuse

Twelve, found by matching `.from('organisations')` with an `owner_id` filter on a
session client. The dashboard event page is the one that was hit; the rest are the
same defect waiting for a different click.

| File | Line |
|---|---|
| `src/app/(dashboard)/dashboard/events/[id]/page.tsx` | 87 |
| `src/app/(dashboard)/dashboard/events/[id]/discounts/page.tsx` | 30 |
| `src/app/(dashboard)/dashboard/events/[id]/edit/page.tsx` | 31 |
| `src/app/(dashboard)/dashboard/events/[id]/pricing/page.tsx` | 28 |
| `src/app/actions/discount-codes.ts` | 124, 185, 218 |
| `src/app/actions/dynamic-pricing.ts` | 68 |
| `src/app/api/ai/chat/route.ts` | 133 |
| `src/lib/upload.ts` | 57 |
| `src/lib/organisation/logo.ts` | 44 |
| `src/lib/organisations/access.ts` | 57 |

Nine further sites already use the service role and are unaffected. Two more,
`src/lib/organisations/event-access.ts:21` and `src/lib/organisations/scope.ts:15`,
take an injected client and need reading before the deploy rather than assuming.

Separately, these dashboard reads select columns outside the grant and will be
refused on their projection rather than their filter:

- `dashboard/organisation/page.tsx:44` (`email`, `status`, `stripe_onboarding_complete`)
- `dashboard/payouts/page.tsx:120` (the Stripe posture columns)
- `dashboard/invites/page.tsx:50` and `invites/actions.ts:46` (the founding columns)
- `dashboard/gigs/page.tsx:39` (`status`)

Several of those already construct an admin client in the same file, so each needs
confirming per query rather than per file.

## The shape of the fix, for the dedicated deploy

The same one already applied to `createEvent`, `updateEvent` and `publishEvent` on
20 August: prove ownership under the service role via
`assertCallerMayActForOrganisation`, then read. Granting the columns back to
`authenticated` is NOT the fix; the "Organisations are viewable by everyone"
policy admits every active organisation, so it would hand every signed-in user
every organiser's Stripe posture, which is what the lockdown exists to prevent.

`scripts/guards/no-unowned-organisation-read.mjs` already enforces that a
service-role read of the sale posture is preceded by an ownership check. It does
NOT yet cover this class, because these reads are ownership checks themselves
rather than sale-posture reads. Extending it to flag a session-client
`organisations` read that touches any column outside the six is the natural
companion to the fix, and would have caught this before Monday.

## Verifying before the deploy, not after

TEST currently has the lockdown applied and passes: `anon` still reads events,
organisations, venues, seats, event_artists, ticket_tiers, event_categories and
profiles. That proves the PUBLIC surfaces survive it. It did not catch this one
because the query that fails is an AUTHENTICATED organiser read, and the TEST
proof exercised `anon`.

Before the lockdown goes back on, the drive has to include a signed-in organiser
opening `/dashboard/events/<id>` on a database that has the revoke applied.
