# Batch 8.2 GATE 2 - Existing Code Audit

Date: 2026-05-09
Branch: redesign/world-class-rebuild-2026-05-03

## Audit scope

Per the Batch 8.2 brief, before deciding any "preserve existing"
approach, audit the existing organiser profile page against the
current design system (Rail Standard v2.0, Batch 6+ typography,
brand tokens, media architecture, footer pattern, card patterns).

## Audit finding: route does not exist

`src/app/organisers/[handle]/page.tsx` **does not exist** in the
codebase. The only existing routes under `src/app/organisers/` are:

- `src/app/organisers/page.tsx` - the public organiser-acquisition
  landing page
- `src/app/organisers/signup/page.tsx` - the organiser signup flow

There is no public organiser profile page. The brief's assumption
that "the organiser profile page (/organisers/[handle]) exists but
unpolished" is incorrect for the public surface. (The `/dashboard/organisation/*`
routes do exist for organisers managing their own profile, but those
are private to the organiser, not the public-facing profile page.)

## Verdict

This is a **net-new public-facing build**, not a polish job. The
brief's section-by-section "PRESERVE vs REBUILD" framing does not
apply - every section is built fresh per the OP1-OP10 spec.

The build proceeds with full Batch 6+ standards from the start:
- Rail Standard v2.0 (top-right arrows + progress)
- Hero pattern from city / culture pages (photographic + dark gradient
  overlay + state-aware CTAs)
- Brand tokens (no hardcoded colours)
- Media architecture (HeroMedia / EventCardMedia / no raw `<img>`)
- Batch 5.5 4-column compact footer (already global on the marketing
  shell via PageShell)
- Card patterns matching culture / city tile components

## Data layer

`src/types/database.ts` line 29 defines the `Organisation` interface
with: id, name, slug, description, logo_url, website, email, phone,
status, owner_id, stripe_*, payout_*, total_event_count,
total_volume_cents, etc.

The public profile uses: name, slug, description, logo_url, website,
email (for the Get Updates flow), and joins to `events` for the
upcoming/past lists.

The `total_event_count` and the M5 `saved_organisers` table give us
a stat row without any new schema work.

## Coordination handoffs

- **C-B8.2-A1:** Future-batch reminder - if/when an admin tool
  expands the public organiser profile (cover image, social links,
  primary culture, bio rich text, founding-year metadata), schema
  additions will live in M7 admin panel work.
