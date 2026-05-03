# CLAUDE.md - EventLinqs Build Context

This file is the shared source of truth for every Claude Code session working on this codebase. Read it first, every session, no exceptions.

## Mission

Build EventLinqs to nationwide-Australia launch readiness. Real organisers, real money, real legal exposure, real scale (thousands of organisers, tens of thousands of concurrent ticket buyers from day one). Internal target: end of May to mid-June 2026.

Beat Ticketmaster on every measurable dimension. Match Airbnb on event-experience polish. Hollywood/luxury visual standard. Zero compromise.

## Founder

Lawal Adams. Sole founder. Australian-Nigerian. Geelong-based. Builds via Claude Code on Windows 11 PowerShell. Non-developer driving the build. Demands world-class standards, evidence-driven assessments, no flattery, no goalpost-moving, no jargon-as-progress.

## The 3-Session Parallel Architecture

This codebase runs 3 concurrent Claude Code sessions in separate git worktrees. Each session owns specific files and modules. Cross-session file edits are forbidden without explicit coordination through the project manager (the partner Claude in claude.ai chat).

### Session 1: Backend / Logic / Payments
- Worktree: `../eventlinqs-app-backend/`
- Branch: `feat/m6-phase3-destination-charges`
- Owned modules: M6 Phase 3 (destination charges), M6 Phase 4-6 (payouts dashboard, refunds, disputes), Stripe Connect Live mode setup
- Owned file paths:
  - `src/lib/stripe/**`
  - `src/app/api/webhooks/stripe/**`
  - `src/app/api/stripe/**`
  - `src/app/api/checkout/**`
  - `src/app/checkout/**`
  - `src/lib/payments/**`
  - `supabase/migrations/**` (payment-related)
- Off-limits: src/components/admin/**, src/app/admin/**, marketing copy, infra config

### Session 2: Hardening / Scale / Infrastructure
- Worktree: `../eventlinqs-app-hardening/`
- Branch: `feat/launch-hardening-nationwide`
- Owned modules: Upstash Sydney migration, Resend SMTP for auth emails, Mapbox URL restrictions, src/types/database.ts auto-generation from Supabase, schema drift reconciliation, staging environment setup, load testing infrastructure (k6 or Artillery), Sentry/observability instrumentation, error boundary auditing, rate limit configuration
- Owned file paths:
  - `src/types/database.ts` (auto-gen from Supabase)
  - `src/lib/redis/**`
  - `src/lib/email/**`
  - `src/lib/observability/**`
  - `src/lib/rate-limit/**`
  - `infrastructure/**` (new directory)
  - `tests/load/**` (new directory)
  - `next.config.ts` (infra-related changes only)
  - `.env.example` (additions)
- Off-limits: payment code, admin UI, marketing copy

### Session 3: Admin Panel / Marketing Polish
- Worktree: `../eventlinqs-app-admin/`
- Branch: `feat/m7-admin-panel`
- Owned modules: M7 admin panel (organiser moderation, KYC review queue, financial controls per region, event content moderation, support tooling, status page setup, audit log), marketing site visual polish (homepage, /organisers, /pricing, /about, /contact - to Hollywood/Airbnb standard)
- Owned file paths:
  - `src/app/admin/**`
  - `src/app/api/admin/**`
  - `src/components/admin/**`
  - `src/app/page.tsx` (homepage marketing polish only)
  - `src/app/organisers/page.tsx`
  - `src/app/pricing/page.tsx`
  - `src/app/about/page.tsx`
  - `src/app/contact/page.tsx`
  - `src/components/marketing/**` (new directory if needed)
  - `src/components/features/events/featured-event-hero.tsx` (visual polish)
- Off-limits: payment code, infrastructure config, database type definitions

### Cross-Session Shared Files (require coordination)
These files may be touched by any session but ALL changes must be flagged in commit messages with `[SHARED]` prefix and the partner Claude (project manager) is notified before merge:
- `src/types/database.ts`
- `next.config.ts`
- `package.json`
- `package-lock.json`
- `CLAUDE.md`
- `docs/MEDIA-ARCHITECTURE.md`
- `docs/DESIGN-SYSTEM.md`

If a session needs to modify a shared file, commit the change as a separate commit with `[SHARED]` in the message, push immediately, and STOP that session until the project manager confirms no conflict with other sessions.

## Locked Build Standards (every session)

### Code Quality
- TypeScript strict mode, no `any` without explicit justification
- npm run lint, npm run typecheck, npm run build, npm test ALL green before every commit
- Granular commits per logical unit
- Commit messages: conventional format (feat, fix, chore, test, docs, perf, refactor)
- NO co-authorship attribution (no "Co-authored by Claude" lines)

### Performance
- Production build Lighthouse mobile Performance >= 95 on every public page
- A11y, Best Practices, SEO all 1.0
- axe-core 0 violations
- Mobile homepage and /events have known cold-cache measurement issue documented in docs/perf/v2/closure-report.md - to be revisited with production warm-cache data, do not block on it

### Brand and Copy
- Public copy: culture-first language only
- NO "diaspora" in any public surface (codebase, copy, commits, PR descriptions, UI labels, meta descriptions, emails, structured data)
- NO em-dashes anywhere - use hyphens, colons, pipes, commas
- NO en-dashes
- NO exclamation marks in user-facing copy
- Australian English (-ise, -our, -re)
- Tagline: "Every culture. Every event. One platform."
- Sub-tagline: "The ticketing platform built for every culture."
- Cultures list (canonical, marketed-rhythm order, never alphabetised, never repeated differently across surfaces): Afrobeats · Caribbean · Bollywood · Latin · Italian · Filipino · Lunar · Gospel · Amapiano · Comedy · Spanish · K-Pop · Reggae · West African · European · Asian · African · South Asian

### Visual Standard
- Hollywood / luxury / Ticketmaster-or-better
- Airbnb-grade event-experience polish
- Use Playwright for live visual verification against competitors at every UI commit
- Touch targets minimum 44px
- Drag-scroll rails where horizontal lists apply
- Branded placeholder system for missing imagery (no raw broken images)
- HeroMedia, EventCardMedia, CityTileImage, OrganiserAvatar component patterns enforced
- No `bg-image`, no raw `<img>`, no video without poster (per docs/MEDIA-ARCHITECTURE.md)

### Security
- All schema changes via `supabase db push --linked` from PowerShell terminal only
- Never modify schema via Dashboard SQL editor
- Never use Supabase MCP `apply_migration` (MCP is read-only permanently)
- All payment-related code uses idempotency keys
- All RLS verified on every new query
- All env var values never logged
- No hardcoded secrets in any commit

### Stripe Configuration (locked)
- Test mode currently active (sandbox: Eventlinqs)
- Live mode setup is M6 Phase 3 sub-task
- Statement descriptor: "EVENTLINQS"
- Shortened descriptor: "ELINQS"
- Webhook events subscribed: 14 (5 payment + 9 Connect, see docs/m6/audit/phase2/closure-report.md)
- Tier 1 default for all new organisers, 3-day post-event payout, 20% reserve
- Destination charges with transfer_data.destination + application_fee_amount + on_behalf_of
- v1 geography: AU/UK/US/EU only

## Architectural Decisions (immutable)

### Stack
- Next.js 16.2.2, React 19.2.4
- Supabase Sydney (project ref: gndnldyfudbytbboxesk)
- TypeScript, Tailwind v4
- Stripe (Test mode now, Live mode in M6 Phase 3)
- Upstash Redis (currently free tier N. Virginia, migrating to Sydney paid tier in Session 2)
- Resend (SMTP setup for auth emails in Session 2)
- Vercel Pro
- Playwright for visual regression and competitive verification

### Repository
- GitHub: github.com/eventlinqs/eventlinqs-app
- Production domain: eventlinqs.com
- Active main branch: main
- Working branches per session (defined above)

### Business
- Sole trader, ABN 30 837 447 587
- Pty Ltd conversion deferred until meaningful revenue or investor onboarding
- v1 launch markets: AU, UK, US, EU (African organisers deferred to M11 with Paystack/Flutterwave)

## Communication Protocol Between Sessions

When any session completes a logical unit:
1. Commit with descriptive message
2. Push to its branch
3. Append summary to `docs/sessions/{session-name}/progress.log`
4. Continue to next task in its mission

The partner Claude (project manager) reviews progress.log files across all 3 sessions every 2-3 days, identifies merge candidates, coordinates conflict resolution, and merges to main on a coordinated cadence.

If any session encounters:
- A blocker requiring another session's work
- A shared file that must be modified
- An architectural decision that affects another session
- An apparent conflict with another session's recent commits

That session MUST stop, log the issue to its progress.log with prefix `[COORDINATION]`, and wait for the project manager.

## Definition of Done

A module/phase is "done" when ALL of these are true:
- Code shipped to its branch with all gates passing
- E2E verification passes (real environment, real flow, real data writes)
- Visual regression at 7 viewports verified
- Competitive Playwright comparison vs Ticketmaster/DICE/Eventbrite/Humanitix passes (parity or surpass on every dimension)
- Lighthouse + axe gates green
- Documentation updated (closure report, audit trail)
- Real-world load test passed (Session 2 hardening provides this; Session 1 and 3 reference it)
- No "deferred" items snuck into closure - genuine deferrals require explicit project manager sign-off

## Files to read before starting any work

Every session reads these on session start:
- `CLAUDE.md` (this file)
- `docs/EventLinqs_Scope_v5.md`
- `docs/MASTER-PLAN-V1.md`
- `docs/BUILD-STANDARDS.md`
- `docs/PRODUCTION-READINESS-CHECKLIST.md`
- `docs/DESIGN-SYSTEM.md`
- `docs/MEDIA-ARCHITECTURE.md`
- `docs/brand-sweep/voice.md` (brand voice)
- Its own session-specific scope doc (Session 1: M6 Phase 3 scope, Session 2: hardening checklist, Session 3: M7 scope + marketing polish brief)

## Hard Rules (non-negotiable across all sessions)

- NO em-dashes
- NO co-authorship attribution
- NO "diaspora" in public copy
- NO scope creep into another session's owned files
- NO accepting failed gates with rationalisation
- NO "deferred" items without project manager sign-off
- NO single-run Lighthouse measurements (median-of-5 only)
- NO localhost performance measurements (Vercel preview or production warmed only)
- NO bulk taskkill (caused stalls before, kill processes by PID)

## Project Manager / CTO

External coordinator: partner Claude (claude.ai chat). Reviews progress logs, coordinates merges, resolves conflicts, sets module sequencing, holds standards.

# CLAUDE.md - EventLinqs Project Rules

## What Is This Project

EventLinqs is a global event ticketing, discovery, and social experience platform. It serves event organisers, attendees, and promoters across Australia, the United States, Europe, Africa, and every major market worldwide. The complete platform specification is in `docs/EventLinqs_Scope_v5.md`. That document is the authoritative source of truth. Every feature you build must comply with it.

## Platform Philosophy (Non-Negotiable)

- Fan-first: every decision prioritises the attendee experience
- Transparent pricing: all-in pricing shown from the first click, no hidden fees, ever
- Zero friction: guest checkout, one-page checkout, 2-tap payment
- Social-first: events are a social experience from discovery through post-event
- Africa-ready: built from the ground up for low-bandwidth, mobile money, WhatsApp-native sharing, and African consumers
- No hardcoded fees: all pricing, fees, and rates are database-driven and configurable via admin panel

## Tech Stack

- **Frontend:** Next.js 15 (App Router, React Server Components, TypeScript strict mode)
- **Styling:** Tailwind CSS with custom brand colours defined below
- **UI Components:** shadcn/ui
- **Backend / Database:** Supabase (PostgreSQL with Row-Level Security, Edge Functions, Realtime)
- **Cache:** Upstash Redis (inventory snapshots, session data, rate limiting, recommendation cache)
- **Search:** Meilisearch
- **Email:** Resend with React Email templates
- **Payments:** Stripe (primary), Paystack, Flutterwave, PayPal (added later as gateway adapters)
- **Hosting:** Vercel (frontend) + Supabase Cloud (backend)
- **Monitoring:** Sentry (errors) + PostHog (analytics, feature flags) + Logtail (logs)
- **Version Control:** GitHub with CI/CD via GitHub Actions

## Brand Colours (Tailwind Config)

```
primary: '#1A1A2E'      // Deep Navy - headers, primary buttons, navigation
accent: '#4A90D9'        // Electric Blue - links, highlights, interactive elements
success: '#10B981'       // Emerald Green - confirmations, valid scans
warning: '#F59E0B'       // Amber - warnings, VIP scan, attention states
error: '#EF4444'         // Red - errors, invalid scans, destructive actions
background: '#FAFAFA'    // Off-White - page backgrounds
surface: '#FFFFFF'       // White - cards, modals, input fields
textPrimary: '#1A1A2E'  // Near Black - body text, headings
textSecondary: '#6B7280' // Grey - subtitles, helper text, metadata
```

## Coding Standards

- TypeScript strict mode. No `any` type. Ever.
- All database tables must have Row-Level Security (RLS) policies. No exceptions.
- All business logic goes through service modules in `src/lib/services/`. No business logic in API routes or components.
- The Pricing Service (`src/lib/services/pricing.ts`) is the single source of truth for all fee calculations. No fee calculation anywhere else.
- The Inventory Service (`src/lib/services/inventory.ts`) handles all ticket reservation logic. Uses PostgreSQL advisory locks for concurrency safety.
- The Payment Service (`src/lib/services/payment.ts`) manages all gateway interactions. Payment state transitions are idempotent.
- All API routes go in `src/app/api/`.
- All reusable UI components go in `src/components/`.
- All custom hooks go in `src/hooks/`.
- All TypeScript types go in `src/lib/types/`.
- Use Zod for runtime validation on all API inputs.
- Use React Server Components by default. Use client components (`'use client'`) only when interactivity requires it.
- Mobile-first responsive design on every page. No desktop-only layouts.
- Images: feature code consumes the canonical media library at `@/components/media` only. Direct `next/image` imports are forbidden in feature code (ESLint enforces). See `## Media Architecture` below.
- Errors: wrap async operations in try/catch. Log errors to Sentry. Show user-friendly error messages.

## File Structure

```
src/
  app/                    - Next.js pages and routes
    (public)/             - Attendee-facing pages
    (organiser)/          - Organiser dashboard pages
    (admin)/              - Admin panel pages
    (auth)/               - Login, signup, OTP pages
    api/                  - API routes
  components/             - Reusable UI components
    ui/                   - Base components (shadcn/ui)
    forms/                - Form components
    layout/               - Navigation, footer, sidebar
    features/             - Feature-specific components
  lib/                    - Business logic and services
    services/             - Core service modules
    supabase/             - Supabase client and helpers
    utils/                - Shared utility functions
    types/                - TypeScript type definitions
  hooks/                  - Custom React hooks
  styles/                 - Global styles
supabase/
  migrations/             - Database migration SQL files
  seed/                   - Seed data
  functions/              - Supabase Edge Functions
docs/
  EventLinqs_Scope_v5.md  - Full platform specification (THE BIBLE)
  modules/                - Module build specs
```

## Module Build Process

This project is built in 12 sequential modules. Each module has a spec file in `docs/modules/`. When instructed to build a module, read the spec file AND reference the full scope in `docs/EventLinqs_Scope_v5.md` for complete context. The module spec tells you what to build now. The scope tells you how it connects to everything else.

## Database Conventions

- Table names: lowercase, snake_case, plural (e.g., `events`, `ticket_tiers`, `pricing_rules`)
- Column names: lowercase, snake_case (e.g., `created_at`, `event_id`, `is_active`)
- Primary keys: `id` as UUID with `gen_random_uuid()` default
- Timestamps: `created_at` and `updated_at` on every table, both with `now()` default
- Soft deletes: use `deleted_at` timestamp (nullable) instead of hard deletes on user-facing tables
- Foreign keys: always named `{referenced_table_singular}_id` (e.g., `event_id`, `user_id`)
- Enums: use PostgreSQL enums or check constraints, not magic strings
- All monetary values stored as integers in the smallest currency unit (cents, kobo, etc.) to avoid floating point errors

## Security Rules

- Every table has RLS policies. No exceptions.
- Users can only read/write their own data unless they have an explicit role-based permission.
- Organisers can only access data for events they own.
- Admin access is controlled by the `role` column on the `users` table.
- All API routes validate authentication before processing.
- All user inputs are validated with Zod schemas.
- No secrets in client-side code. All API keys and secrets go in `.env.local` and are accessed server-side only.

## Media Architecture

All event covers, hero backgrounds, city tiles, organiser avatars, and category imagery flow through the media component library at `src/components/media/`. The library is the single contract between feature code and `next/image`. See `docs/MEDIA-ARCHITECTURE.md` for the full standard and `docs/MEDIA-INCONSISTENCIES.md` for the violation taxonomy that drove Pre-Task 2.

Public surfaces:

- `HeroMedia`: above-the-fold heroes. Always renders a priority-painted raster as the LCP layer. Refuses videos with SVG posters and refuses to be the sole hero element when no raster is available.
- `EventCardMedia`: every card, tile, rail, and marquee surface. Variants: `bento-hero`, `bento-supporting`, `card`, `rail`, `marquee`. Each carries its own `sizes` and `quality`.
- `CityTileImage`: city rail and city directory tiles. Routes local SVG placeholders through a raw `<img>` (avoiding Next raster re-encoding of vectors) and remote rasters through `next/image`.
- `OrganiserAvatar`: organiser identity. Sizes: `xs`, `sm`, `md`, `topbar`, `lg`.
- `CategoryTileImage`: category nav and category hero tiles.
- `BrandedPlaceholder` (under `media/decorative/`): dark-gradient EventLinqs-wordmark fallback when no organiser cover exists.

Centralised constants:

- `MEDIA_QUALITY` (`@/components/media/quality.ts`): `hero` 80, `card` 75, `rail` 70, `avatar` 75. Mirrors the `qualities: [70, 75, 85]` array in `next.config.ts`.
- `MEDIA_SIZES` (`@/components/media/sizes.ts`): canonical responsive `sizes` strings per layout role.
- `MEDIA_TRANSITIONS` (`@/components/media/transitions.ts`): brand-level easing and duration constants for carousels, ken-burns, card hover, and hero crossfades.

Rules enforced by ESLint (`eslint.config.mjs`):

1. Direct `import Image from 'next/image'` is forbidden in feature code. Import from `@/components/media`.
2. Raw `<img>` elements are forbidden in feature code (`@next/next/no-img-element` set to `error`).
3. `style={{ backgroundImage: 'url(...)' }}` is forbidden for content imagery. Decorative gradients (radial, linear) without `url(...)` are allowed.
4. `next/legacy/image` is forbidden. Use the modern `next/image` via the media library.

Forbidden patterns (must NOT ship, full list in `docs/MEDIA-INCONSISTENCIES.md` "Forbidden patterns" section):

- Above-fold media without `priority` and `fetchPriority="high"`.
- `<video>` with SVG poster on the LCP path.
- Hardcoded `quality={N}` outside `MEDIA_QUALITY.*` references.
- Hardcoded `sizes="100vw"` outside `MEDIA_SIZES.*` helpers.
- `unoptimized={true}` on remote raster images (only allowed for local SVG via `CityTileImage`).

When adding a new media surface (a new role that doesn't fit any existing variant), extend the library rather than reaching for `next/image` directly. Surfaces live in `src/components/media/` and are always exempt from the no-`next/image` rule.

## Important Reminders

- The logo does not exist yet. Use text "EVENTLINQS" as a placeholder in navigation and branding components. The logo will be added later as a single image swap.
- Paystack and Flutterwave are not integrated in the initial build. The payment architecture must support adding them later as gateway adapters without changing the core payment logic or database schema.
- All fees and pricing values are stored in the `pricing_rules` table and read by the Pricing Service. Nothing is hardcoded. This is the single most important architectural requirement.
- Free events have zero platform fees. Unconditional. This is enforced in the Pricing Service.
