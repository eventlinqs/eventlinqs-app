# CLAUDE.md — EventLinqs Project Rules

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
primary: '#1A1A2E'      // Deep Navy — headers, primary buttons, navigation
accent: '#4A90D9'        // Electric Blue — links, highlights, interactive elements
success: '#10B981'       // Emerald Green — confirmations, valid scans
warning: '#F59E0B'       // Amber — warnings, VIP scan, attention states
error: '#EF4444'         // Red — errors, invalid scans, destructive actions
background: '#FAFAFA'    // Off-White — page backgrounds
surface: '#FFFFFF'       // White — cards, modals, input fields
textPrimary: '#1A1A2E'  // Near Black — body text, headings
textSecondary: '#6B7280' // Grey — subtitles, helper text, metadata
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
- Images: use Next.js `<Image>` component with WebP format and lazy loading.
- Errors: wrap async operations in try/catch. Log errors to Sentry. Show user-friendly error messages.

## File Structure

```
src/
  app/                    — Next.js pages and routes
    (public)/             — Attendee-facing pages
    (organiser)/          — Organiser dashboard pages
    (admin)/              — Admin panel pages
    (auth)/               — Login, signup, OTP pages
    api/                  — API routes
  components/             — Reusable UI components
    ui/                   — Base components (shadcn/ui)
    forms/                — Form components
    layout/               — Navigation, footer, sidebar
    features/             — Feature-specific components
  lib/                    — Business logic and services
    services/             — Core service modules
    supabase/             — Supabase client and helpers
    utils/                — Shared utility functions
    types/                — TypeScript type definitions
  hooks/                  — Custom React hooks
  styles/                 — Global styles
supabase/
  migrations/             — Database migration SQL files
  seed/                   — Seed data
  functions/              — Supabase Edge Functions
docs/
  EventLinqs_Scope_v5.md  — Full platform specification (THE BIBLE)
  modules/                — Module build specs
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

## Important Reminders

- The logo does not exist yet. Use text "EVENTLINQS" as a placeholder in navigation and branding components. The logo will be added later as a single image swap.
- Paystack and Flutterwave are not integrated in the initial build. The payment architecture must support adding them later as gateway adapters without changing the core payment logic or database schema.
- All fees and pricing values are stored in the `pricing_rules` table and read by the Pricing Service. Nothing is hardcoded. This is the single most important architectural requirement.
- Free events have zero platform fees. Unconditional. This is enforced in the Pricing Service.
