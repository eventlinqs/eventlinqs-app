# Module 4: Ticketing Engine & Inventory

**Status:** Not Started
**Depends on:** M1 (Foundation), M2 (Event Management), M3 (Checkout & Payments) — all three must be complete
**Priority:** Critical — this is the ticketing "moat" that separates EventLinqs from Eventbrite/Humanitix
**Estimated Sessions:** 5–7 (with Claude Code) — this is the biggest module we've tackled

---

## Overview

Module 4 takes EventLinqs from "a checkout that works" to "a real ticketing platform that can compete with Ticketmaster, DICE, and Eventbrite". This module delivers:

- **Reserved seating engine** — full seat maps, interactive selection, seat holds, best-available algorithm, accessible seating
- **Dynamic pricing engine** — stepwise demand-based price changes per tier
- **Squad booking** — group buys where friends each pay their own share
- **Waitlist system** — auto-notifies buyers when tickets become available
- **Virtual queue** — fair-order queue for high-demand on-sales (Taylor Swift-style releases)
- **Redis inventory caching** — hot inventory counts with "Only X left!" social proof badges
- **Advanced tier rules** — Early Bird auto-close by date, tier dependencies, hidden tiers
- **Concurrency hardening** — PostgreSQL advisory locks, SELECT FOR UPDATE, idempotent finalisation
- **Capacity race condition prevention** — guarantees no overselling under any load

**What is NOT in this module:**
- Ticket transfers (M6)
- QR generation and check-in (M6)
- Resale marketplace (M11)
- Squad chat/social features (M7)

---

## LESSONS FROM M3 — MANDATORY BUILD PRINCIPLES FOR M4

The following principles MUST be followed during every Claude Code build session for M4. These are non-negotiable. They exist because M3 burned hours on bugs that should have been prevented by design.

### Principle 1: Admin client for all inventory writes
Every write to these tables MUST use `createAdminClient()` (service role, RLS-bypassed):
- `reservations` (already fixed in M3 — keep it that way)
- `seats` (new in M4)
- `seat_holds` (new in M4)
- `waitlist` (new in M4)
- `virtual_queue` (new in M4)
- `squads` (new in M4)
- `squad_members` (new in M4)
- `ticket_tiers` (when updating sold_count, reserved_count)
- `orders` / `order_items` / `payments` (already fixed in M3)

Reads of user's own data (e.g., buyer checking their own waitlist position) may use the user-session client IF the RLS policy allows.
Reads where organiser looks at buyer data MUST use admin client (learned from M3 orders dashboard bug).
Webhooks and cron jobs MUST use admin client (no auth session exists).

### Principle 2: Column verification before queries
Before Claude Code writes any SELECT statement against a table, it MUST first check what columns exist. The `events` table does NOT have a `currency` column — currency lives on `ticket_tiers`. This caused 4+ bugs in M3. For M4:
- Reference the M1/M2/M3 SQL files (now in `scripts/` and in previous M-spec files) for schema truth
- Never guess column names
- If unsure, do a column check query first

### Principle 3: Capture errors, never swallow them
Never write `const { data } = await supabase...`. Always write:
```typescript
const { data, error } = await supabase...
if (error) {
  console.error('[module-name] <operation> failed:', error)
  // handle appropriately
}
```
Errors must surface. Silent failures cost hours.

### Principle 4: Concurrency is mandatory for inventory operations
All seat reservations, inventory decrements, squad joins, waitlist promotions, and queue advances use `SELECT ... FOR UPDATE` inside an RPC function. Never implement inventory logic in application code that could race.

### Principle 5: State machines enforced in database
Seat status, waitlist status, squad status, virtual queue position — all have explicit state machines with valid transitions enforced by DB triggers or RPC functions. No client can bypass them.

### Principle 6: Test each feature end-to-end before moving on
Build waitlist → test waitlist (add entry, verify notification trigger fires, verify promotion on cancellation). THEN move to virtual queue. Don't build all 8 features at once and try to test them in one go.

### Principle 7: Pre-build read of dependency files
Before Claude Code writes a single line, it reads:
1. `scripts/fix-ticket-counts.sql` (to understand current ticket_tiers schema)
2. `src/lib/payments/payment-calculator.ts` (to understand pricing engine)
3. `src/app/actions/checkout.ts` (to understand order creation flow)
4. `src/app/actions/reservations.ts` (to understand reservation flow)
5. The create_reservation and confirm_order SQL RPC functions
This is mandatory context.

---

## Pre-Module Checklist

Before starting M4, confirm the following:

- [ ] M1, M2, M3 all complete and committed
- [ ] `git push` has pushed all M3 work to GitHub
- [ ] Stripe listener running OR ready to restart (see restart steps in README)
- [ ] **Upstash Redis account created** (see Part 0 below — DO THIS FIRST)
- [ ] Upstash Redis database provisioned (free tier is fine)
- [ ] `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` added to `.env.local`
- [ ] npm package `@upstash/redis` installed

---

## Part 0: Upstash Redis Setup (BEFORE running Claude Code)

### 0.1 Why Redis?

Redis gives us millisecond-fast hot inventory counts for social proof badges ("Only 3 left!", "Selling Fast", "Almost Sold Out"). Without it, every event page would hit the database for inventory counts, which is slow under load. Upstash is a serverless Redis service — free tier is 10,000 commands per day, zero config, no server management.

### 0.2 Create the Upstash account

1. Open browser → go to `https://upstash.com`
2. Click **Sign Up** top-right
3. Sign up with GitHub (fastest — uses your existing GitHub account) or email
4. Verify email if needed

### 0.3 Create a Redis database

1. After login, click **Create Database** on the Redis section
2. Fill in:
   - **Name:** `eventlinqs-inventory`
   - **Type:** Regional (cheaper, faster for a single region)
   - **Region:** Pick the closest to your Vercel deployment region — for Australia, choose `Asia Pacific (Sydney) - ap-southeast-2`. If not available, pick the closest Asia-Pacific option.
   - **Eviction:** Enable (so old cache entries auto-clear if memory fills up)
3. Click **Create**

### 0.4 Get your REST credentials

After the database is created, you'll see the database details page. Scroll down to the **REST API** section. You'll see two values:
- `UPSTASH_REDIS_REST_URL` — starts with `https://...`
- `UPSTASH_REDIS_REST_TOKEN` — a long token string

Copy both to Notepad.

### 0.5 Add to .env.local

Open `C:\Users\61416\OneDrive\Desktop\EventLinqs\eventlinqs-app\.env.local` in Notepad. Add these two lines at the bottom:

```
UPSTASH_REDIS_REST_URL=https://your-actual-url-from-step-0.4
UPSTASH_REDIS_REST_TOKEN=your-actual-token-from-step-0.4
```

Save the file.

### 0.6 Install the npm package

In PowerShell (your dev server tab, after stopping dev server with Ctrl+C):

```powershell
cd ~\OneDrive\Desktop\EventLinqs\eventlinqs-app
npm install @upstash/redis
```

Wait for install to complete.

### 0.7 Verify

After install, you can restart the dev server. Nothing should break yet — Redis isn't used until we wire it up in Part 8.

---

## Part 1: Database Schema (SQL — run in Supabase SQL Editor)

> The SQL is provided in a separate combined file: `M4-ticketing-engine-sql.sql`
> Copy the entire file contents into Supabase → SQL Editor → New query → Run.

### Tables Created in This Module

| Table | Purpose |
|-------|---------|
| `venues` | Reusable venue definitions with seat maps |
| `seat_maps` | Venue seat map layouts (sections/rows/seats as JSON) |
| `seat_map_sections` | Named sections within a seat map |
| `seats` | Individual seat records (one row per seat) with status |
| `seat_holds` | Organiser-held seats (VIPs, media, sponsors) |
| `dynamic_pricing_rules` | Per-tier stepwise pricing thresholds |
| `squads` | Group ticket purchases (squad booking) |
| `squad_members` | Members within a squad and their payment status |
| `waitlist` | Sold-out event waitlist entries |
| `waitlist_notifications` | Log of who was notified and when |
| `virtual_queue` | Queue entries for high-demand events |
| `inventory_snapshots` | Pre-computed inventory counts for cache display |

### Columns Added to Existing Tables

| Table | New Column | Purpose |
|-------|-----------|---------|
| `events` | `is_high_demand` BOOLEAN | Enables virtual queue |
| `events` | `waitlist_enabled` BOOLEAN | Enables waitlist when sold out |
| `events` | `venue_id` UUID (nullable) | Link to reusable venue |
| `events` | `has_reserved_seating` BOOLEAN | Enables seat selection UI |
| `events` | `squad_booking_enabled` BOOLEAN | Enables group buys |
| `events` | `squad_timeout_hours` INT DEFAULT 24 | Squad deadline |
| `ticket_tiers` | `dynamic_pricing_enabled` BOOLEAN | Opts into dynamic pricing |
| `ticket_tiers` | `sale_start` TIMESTAMPTZ | When this tier becomes available |
| `ticket_tiers` | `sale_end` TIMESTAMPTZ | When this tier closes (Early Bird auto-close) |
| `ticket_tiers` | `hidden_until` TIMESTAMPTZ | Hidden tier reveal time |
| `ticket_tiers` | `requires_access_code` BOOLEAN | Password-gated tier |
| `ticket_tiers` | `seat_map_section_id` UUID | Links tier to a seat map section |

### Enums Created

| Enum | Values |
|------|--------|
| `seat_status` | `available`, `reserved`, `sold`, `held`, `blocked`, `accessible` |
| `seat_type` | `standard`, `premium`, `accessible`, `companion`, `restricted_view`, `obstructed` |
| `squad_status` | `forming`, `completed`, `expired`, `cancelled` |
| `squad_member_status` | `invited`, `paid`, `declined`, `timed_out` |
| `waitlist_status` | `waiting`, `notified`, `converted`, `expired`, `removed` |
| `queue_status` | `waiting`, `admitted`, `expired`, `abandoned` |

---

## Part 2: Venue & Seat Map Architecture

### 2.1 Data Model

A **venue** is a physical location (e.g., "Melbourne Convention Centre"). A venue can have one or more **seat maps** (e.g., "Main Hall — Theatre Config", "Main Hall — Cabaret Config"). A **seat map** has multiple **sections** (e.g., "Orchestra", "Mezzanine", "Balcony"). Each section has multiple **seats** with specific row and number labels.

Each **event** that uses reserved seating links to:
- One `venue_id`
- One `seat_map_id` (the specific configuration for that event)

Each **ticket_tier** for that event links to:
- A `seat_map_section_id` (which section of the map the tier applies to)

When the event is published, a row per seat is materialised in the `seats` table with status `available`.

### 2.2 Seat Map JSON Structure

The seat_maps table stores a JSON representation of the layout:

```json
{
  "name": "Main Hall - Theatre Config",
  "width": 1200,
  "height": 800,
  "sections": [
    {
      "id": "section-orchestra",
      "name": "Orchestra",
      "color": "#4A90E2",
      "rows": [
        {
          "label": "A",
          "seats": [
            { "number": "1", "x": 100, "y": 600, "type": "standard" },
            { "number": "2", "x": 130, "y": 600, "type": "standard" },
            { "number": "3", "x": 160, "y": 600, "type": "accessible" }
          ]
        }
      ]
    }
  ]
}
```

### 2.3 Seat Materialisation

When an organiser publishes an event with reserved seating, a PostgreSQL function `materialize_seats(event_id, seat_map_id)` runs automatically:

1. Reads the seat_map JSON
2. Inserts one row per seat into the `seats` table
3. Each seat gets event_id, seat_map_section_id, row_label, seat_number, seat_type, status='available', x/y coordinates
4. This happens in a single transaction

The seat_map is reusable — the same venue can be used for multiple events without re-drawing.

### 2.4 Seat Map Builder UI

Route: `/dashboard/venues/[venueId]/seat-maps/[seatMapId]/edit`

Organiser-facing drag-and-drop tool:
- Canvas with grid
- Add section (draws a colored rectangle)
- Add rows within a section (horizontal)
- Add seats within a row (numbered automatically)
- Mark individual seats as accessible, restricted view, companion, or blocked
- Save as JSON to seat_maps table

**For M4, we build a simplified v1 of the builder:** CSV/JSON import OR a basic click-to-place grid editor. A full Figma-like drag-drop seat designer is overkill for launch. We spec the import method as the primary path and a simple grid editor as the secondary path. Organisers can hire a seat map designer later or use CSV import from tools like seats.io exports.

**Simplified seat map creation for M4:**
1. Organiser uploads CSV with columns: section, row, seat_number, seat_type, x, y
2. System parses CSV and creates the seat_map JSON
3. Preview renders the map
4. Organiser clicks Publish → seats materialised

### 2.5 Seat Selection UI (Buyer-Facing)

On the event detail page for events with `has_reserved_seating = true`:

- Interactive SVG rendering of the seat map
- Available seats shown in section color
- Sold seats shown in grey
- Held seats shown in grey (no indication they're "held" to avoid FOMO)
- Accessible seats shown with wheelchair icon
- Hover shows seat details (row, number, price)
- Click to select → seat turns highlighted
- Click again to deselect
- Multi-select supported (choose multiple seats for group purchase)
- "Select Best Available" button → runs algorithm to auto-pick best N contiguous seats

When the buyer clicks "Checkout":
1. Server validates all selected seats are still `available`
2. Uses `SELECT ... FOR UPDATE` to lock the seat rows
3. Updates all selected seats to `reserved` with reservation_id
4. Creates a reservation (existing M3 flow) linking to the selected seats
5. Redirects to checkout page with reservation_id

---

## Part 3: Dynamic Pricing Engine

### 3.1 How Stepwise Dynamic Pricing Works

Organisers can enable dynamic pricing on any ticket tier. They configure:
- Base price (the lowest price, applies to first N% of capacity)
- Multiple price steps with capacity thresholds

Example configuration for a $50 base price tier with 1000 capacity:
```
Step 1: 0-25% sold (0-250) → $50
Step 2: 25-50% sold (251-500) → $60
Step 3: 50-75% sold (501-750) → $70
Step 4: 75-100% sold (751-1000) → $80
```

### 3.2 Price Determination Logic

The current price for a tier is computed at the moment of **reservation creation**, not page load. When a buyer clicks Checkout:

1. System reads current `sold_count` and `total_capacity` for the tier
2. Calculates percentage sold: `sold_count / total_capacity`
3. Looks up the matching step in `dynamic_pricing_rules`
4. Returns the price for that step
5. Locks that price in the reservation (and ultimately the order)

The buyer always sees the CURRENT price on the event page (refreshed from Redis every few seconds). But the price is LOCKED when they start checkout. If the threshold moves while they're checking out, their locked price is honoured.

### 3.3 Database Schema

`dynamic_pricing_rules` table stores the steps:

```
id UUID PK
ticket_tier_id UUID FK → ticket_tiers
step_order INT (1, 2, 3, 4)
capacity_threshold_percent NUMERIC (25, 50, 75, 100)
price_cents INT
created_at TIMESTAMPTZ
```

### 3.4 Price Calculation RPC

SQL function `get_current_tier_price(tier_id UUID) RETURNS INT`:
- Reads ticket_tier sold_count, total_capacity
- Reads dynamic_pricing_rules for that tier ordered by step_order
- Calculates current percentage
- Returns the price_cents for the active step
- If no dynamic pricing rules exist for the tier, returns the tier's base `price` column

This function is called by:
- The fee calculator during checkout (M3 code needs to be updated to use this)
- The ticket selector UI (for display)
- The event page price display

### 3.5 Organiser UI for Dynamic Pricing

Route: `/dashboard/events/[id]/pricing`

- Shows all ticket tiers
- Toggle "Enable Dynamic Pricing" per tier
- When enabled, shows a step editor:
  - Row 1: 0-25% @ $X
  - Row 2: 25-50% @ $X
  - Row 3: 50-75% @ $X
  - Row 4: 75-100% @ $X
- Organiser can add/remove steps
- Minimum 1 step required (which is just the base price)
- Maximum 10 steps
- Preview: "At current sales, buyers pay $X"

---

## Part 4: Squad Booking

### 4.1 Squad Booking Concept

Alice wants to go to an event with 4 friends but doesn't want to pay upfront for all 5 tickets. She starts a squad:

1. Alice selects 5 tickets → clicks "Start a Squad"
2. System creates a squad with 5 member slots (1 for Alice, 4 for invitees)
3. Alice pays her share immediately
4. Alice gets a shareable link
5. Alice shares the link via WhatsApp, text, or direct share
6. Each friend clicks the link, sees the squad, picks their own attendee details, and pays their share
7. When all 5 members have paid, squad is marked `completed` and each person gets their ticket
8. If the squad timeout expires (default 24 hours), the squad leader can extend once (another 24 hours) OR cancel and release unpaid seats

### 4.2 Squad Data Model

`squads` table:
```
id UUID PK
event_id UUID FK → events
leader_user_id UUID FK → auth.users
total_spots INT (e.g., 5)
tier_id UUID FK → ticket_tiers
status squad_status DEFAULT 'forming'
share_token TEXT UNIQUE (for the shareable URL)
created_at, expires_at, completed_at, cancelled_at
```

`squad_members` table:
```
id UUID PK
squad_id UUID FK → squads
user_id UUID FK → auth.users (nullable for guest joins)
guest_email TEXT (nullable)
attendee_first_name, attendee_last_name, attendee_email
status squad_member_status DEFAULT 'invited'
order_id UUID FK → orders (when paid)
paid_at TIMESTAMPTZ
```

### 4.3 Squad State Machine

```
forming → completed   (all members paid)
forming → expired     (timeout reached, < all members paid)
forming → cancelled   (leader cancels)
```

When a squad reaches `completed`:
- All 5 orders are finalised
- Reservation converted
- sold_count incremented by 5
- All 5 attendees receive confirmation emails

When a squad reaches `expired` or `cancelled`:
- All paid members are automatically refunded via Stripe
- Unpaid slots are released back to inventory

### 4.4 Squad Flows

**Route: `/squad/[share_token]`**

Public page showing:
- Event name, date, venue
- "Alice invited you to join her squad"
- Total spots: 5
- Already paid: Alice, Bob, Carol (3/5)
- Time remaining until deadline: 18 hours 22 minutes
- Join button → opens squad member form
- If all spots full or timeout passed, disabled state with explanation

**Route: `/dashboard/my-squads`**

Buyer's dashboard showing:
- Squads I've created (as leader)
- Squads I've joined (as member)
- Status of each squad
- Ability to cancel a squad I'm leading (if not completed)

### 4.5 Squad Inventory Holds

When a squad is created, all N tickets are atomically reserved via the existing reservation system. The reservation has a longer TTL (24 hours by default) instead of 10 minutes. When the squad completes OR expires, the reservation converts or releases as normal.

---

## Part 5: Waitlist System

### 5.1 Concept

When an event (or specific tier) is sold out, buyers can join a waitlist. If tickets become available (cancellation, refund, organiser releases more, squad expiry releases unpaid seats), waitlist members are notified in FIFO order and given a limited window to buy.

### 5.2 Data Model

`waitlist` table:
```
id UUID PK
event_id UUID FK → events
ticket_tier_id UUID FK → ticket_tiers (nullable — join event-wide waitlist)
user_id UUID FK → auth.users
quantity_requested INT DEFAULT 1
status waitlist_status DEFAULT 'waiting'
position INT (their FIFO position)
created_at, notified_at, converted_at, expired_at
```

`waitlist_notifications` table:
```
id UUID PK
waitlist_id UUID FK → waitlist
notified_at TIMESTAMPTZ
expires_at TIMESTAMPTZ (window to buy, e.g. 15 minutes)
converted BOOLEAN DEFAULT FALSE
```

### 5.3 Joining the Waitlist

On the event page, if the tier (or event) is sold out, the "Buy" button becomes "Join Waitlist":
1. Buyer clicks → modal asks "How many tickets?"
2. Buyer submits → row added to `waitlist` with next `position` value
3. Buyer sees "You're #47 on the waitlist"
4. Confirmation email sent

### 5.4 Promoting from Waitlist

When inventory becomes available (cancellation, refund, squad expiry):
- A SQL function `promote_waitlist(event_id, tier_id, qty_available) RETURNS INT` runs
- It finds the oldest `waiting` entries where `quantity_requested <= qty_available`
- Sets their status to `notified`
- Creates a `waitlist_notifications` row with 15-minute expiry
- Sends email notification (via Resend) with a direct checkout link
- If they don't purchase within 15 minutes, their status moves to `expired` and the next person is notified

### 5.5 When to Trigger Promotion

The `promote_waitlist` function runs:
- After a webhook marks a payment as `refunded` or `cancelled`
- After a squad reaches `expired` status
- After an organiser manually releases held seats
- On a cron job every 5 minutes (catches edge cases)

### 5.6 Waitlist UI

**Route: `/dashboard/my-waitlists`**

Shows all waitlist entries for the current user with:
- Event name, date
- Position in line (updated live)
- Quantity requested
- Status: Waiting / Notified / Expired / Converted
- "Leave Waitlist" button (if still waiting)

---

## Part 6: Virtual Queue (High-Demand Drops)

### 6.1 Concept

For a Taylor Swift / Beyoncé-level drop, thousands of buyers hit the event page simultaneously at the announced on-sale time. Without a queue, the system collapses and the first person to the database wins. Virtual queue puts everyone in a fair, timestamped line and admits them to checkout in controlled batches.

### 6.2 Enabling Virtual Queue

Organisers can mark an event as `is_high_demand = true`. When true:
- Before the sale start time: a countdown page is shown
- At the sale start time: buyers are placed in the queue
- After the sale: normal checkout flow (queue disabled)

Alternatively, the system can auto-enable queue mode if traffic to an event exceeds a threshold (e.g., 500 concurrent viewers). This auto-detection is a v2 feature — for v1, organisers manually enable it.

### 6.3 Data Model

`virtual_queue` table:
```
id UUID PK
event_id UUID FK → events
user_id UUID FK → auth.users (nullable for anonymous)
session_id TEXT (for anonymous)
position INT (assigned atomically)
status queue_status DEFAULT 'waiting'
admitted_at TIMESTAMPTZ
expires_at TIMESTAMPTZ (admission window, e.g., 10 minutes)
created_at TIMESTAMPTZ
```

### 6.4 Queue Entry Flow

1. Buyer loads `/events/[slug]` at sale time
2. If `is_high_demand = true` AND event is at or past sale start AND queue hasn't ended, the buyer is redirected to `/queue/[event_slug]`
3. On queue page, system creates a `virtual_queue` row atomically with next `position`
4. Position is signed with a token (prevents manipulation)
5. Buyer sees "You are #1247 in line. Estimated wait: ~5 minutes"
6. Page polls every 5 seconds to refresh position

### 6.5 Queue Admission Logic

A background process (cron or on-demand) admits buyers in batches:
- Reads the current system load (active checkouts, Redis inventory state)
- Determines safe admission rate (e.g., 50 buyers per minute)
- Finds the next 50 `waiting` entries by position
- Sets their status to `admitted` with 10-minute `expires_at`
- The queue page for these users redirects to the event/checkout

### 6.6 Anti-Gaming Protections

- Position token is HMAC-signed — can't be manipulated
- Cloudflare Turnstile challenge at queue entry (bot detection)
- Device fingerprint check (prevents one device holding multiple positions)
- IP-based rate limiting (max 1 queue entry per IP per event)

For M4 v1, we implement:
- HMAC-signed positions ✅
- IP rate limiting ✅
- Turnstile / device fingerprint → Phase 2 (too complex for launch)

---

## Part 7: Advanced Tier Rules

### 7.1 Sale Start / Sale End (Early Bird Auto-Close)

`ticket_tiers` gets two new columns:
- `sale_start TIMESTAMPTZ` — when this tier becomes available for purchase (nullable = always available)
- `sale_end TIMESTAMPTZ` — when this tier auto-closes (nullable = never closes)

The tier is visible to buyers ONLY when `NOW() >= sale_start AND (sale_end IS NULL OR NOW() < sale_end)`.

Example: Early Bird tier has `sale_end = event_date - 14 days`. At 14 days before the event, it automatically closes. The tier selector hides it. Buyers see only Regular tier from that point on.

### 7.2 Hidden Tiers (Pre-Sale Tiers)

`ticket_tiers.hidden_until TIMESTAMPTZ` — when a tier is hidden until a certain time. Useful for pre-sales.

Example: A tier is hidden until the public on-sale date. Organisers with an access code can see it early.

### 7.3 Access-Code Gated Tiers

`ticket_tiers.requires_access_code BOOLEAN` — if true, the tier is hidden from normal view. Buyers must enter an access code on the event page to reveal it.

Access codes are managed in a new `tier_access_codes` table:
```
id UUID PK
ticket_tier_id UUID FK
code TEXT
max_uses INT (nullable = unlimited)
current_uses INT DEFAULT 0
valid_from, valid_until TIMESTAMPTZ
is_active BOOLEAN DEFAULT TRUE
```

When a buyer enters a valid code, the tier becomes visible in their session. This uses a server-side session flag (not just a cookie — must be validated server-side at reservation time).

---

## Part 8: Redis Inventory Cache & Social Proof

### 8.1 What Gets Cached

For each ticket_tier, cache:
```
Key: tier:{tier_id}:inventory
Value: JSON { sold: 42, reserved: 3, total: 100, available: 55, percent_sold: 42 }
TTL: 30 seconds
```

For each event (aggregate across all tiers):
```
Key: event:{event_id}:inventory
Value: JSON { total_sold: 134, total_capacity: 500, percent_sold: 26.8 }
TTL: 30 seconds
```

### 8.2 Cache Update Strategy

**Write-through:** Every time `sold_count` or `reserved_count` changes in the database (via `confirm_order` RPC, `create_reservation` RPC, etc.), the RPC also updates the Redis cache.

**Fallback read-through:** If Redis is empty (e.g., cache was flushed), the event page reads from Postgres, populates Redis, and serves from Redis next time.

**Graceful degradation:** If Redis is entirely down, the event page falls back to Postgres. Redis failures never break the page.

### 8.3 Redis Client Setup

New file `src/lib/redis/client.ts`:
```typescript
import { Redis } from '@upstash/redis'

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})
```

New file `src/lib/redis/inventory-cache.ts` with functions:
- `getTierInventory(tierId: string)` — reads from Redis, falls back to DB
- `setTierInventory(tierId, data)` — writes to Redis
- `invalidateTierInventory(tierId)` — deletes the key
- `getEventInventory(eventId: string)`, `setEventInventory(eventId, data)`, `invalidateEventInventory(eventId)`

### 8.4 Social Proof Badges

Badge rules (rendered on event cards and event detail page):

| Badge | Condition |
|-------|-----------|
| **Selling Fast** | percent_sold >= 50 AND sold_count_last_hour >= 10 |
| **Almost Sold Out** | percent_sold >= 85 |
| **Only X Left** | total - sold - reserved <= 10 (shows exact count) |
| **Sold Out** | sold + reserved >= total |
| **Just Listed** | event_created_at within last 48 hours |
| **Ending Soon** | sale_end within next 24 hours |

Badges are computed server-side from Redis inventory data and passed to the page as props.

### 8.5 "Who's Viewing" Counter (v2 — NOT in M4)

Later we can add "24 people are viewing this event right now" using Redis sorted sets with viewer session IDs. This is a cool feature but NOT in M4 scope — add to polish list.

---

## Part 9: Checkout Integration

### 9.1 Updates to Existing M3 Code

Several M3 files need updates to handle the new M4 features:

**`src/app/actions/reservations.ts`:**
- Accept `selected_seat_ids` parameter for reserved seating events
- For seat-based reservations, call a new RPC `create_seat_reservation` instead of `create_reservation`

**`src/app/actions/checkout.ts`:**
- Use `get_current_tier_price` RPC to get the dynamic price at reservation time
- Lock the price in the order

**`src/lib/payments/payment-calculator.ts`:**
- Accept a pre-locked price instead of reading from tier.price directly
- Dynamic pricing overrides the tier base price when enabled

**`src/app/events/[slug]/page.tsx`:**
- Check `has_reserved_seating` flag — if true, render the seat selection UI instead of quantity picker
- Check `is_high_demand` flag — if true AND within sale window, redirect to queue page
- Read inventory from Redis cache for display
- Render social proof badges

**`src/components/checkout/ticket-selector.tsx`:**
- Handle seat-based and quantity-based flows
- Show "Start a Squad" button when squad_booking_enabled

---

## Part 10: TypeScript Types

Add to `src/types/database.ts`:

```typescript
// Seat types
export type SeatStatus = 'available' | 'reserved' | 'sold' | 'held' | 'blocked' | 'accessible'
export type SeatType = 'standard' | 'premium' | 'accessible' | 'companion' | 'restricted_view' | 'obstructed'

export interface Venue {
  id: string
  organisation_id: string
  name: string
  address: string
  city: string
  country: string
  capacity: number
  created_at: string
  updated_at: string
}

export interface SeatMap {
  id: string
  venue_id: string
  name: string
  layout: {
    width: number
    height: number
    sections: SeatMapSection[]
  }
  is_active: boolean
  created_at: string
}

export interface SeatMapSection {
  id: string
  name: string
  color: string
  rows: SeatMapRow[]
}

export interface SeatMapRow {
  label: string
  seats: {
    number: string
    x: number
    y: number
    type: SeatType
  }[]
}

export interface Seat {
  id: string
  event_id: string
  seat_map_section_id: string
  row_label: string
  seat_number: string
  seat_type: SeatType
  status: SeatStatus
  x: number
  y: number
  reservation_id: string | null
  order_item_id: string | null
  price_cents: number | null
  held_by_user_id: string | null
  held_reason: string | null
  created_at: string
  updated_at: string
}

// Dynamic pricing
export interface DynamicPricingRule {
  id: string
  ticket_tier_id: string
  step_order: number
  capacity_threshold_percent: number
  price_cents: number
  created_at: string
}

// Squad types
export type SquadStatus = 'forming' | 'completed' | 'expired' | 'cancelled'
export type SquadMemberStatus = 'invited' | 'paid' | 'declined' | 'timed_out'

export interface Squad {
  id: string
  event_id: string
  leader_user_id: string
  tier_id: string
  total_spots: number
  status: SquadStatus
  share_token: string
  created_at: string
  expires_at: string
  completed_at: string | null
  cancelled_at: string | null
}

export interface SquadMember {
  id: string
  squad_id: string
  user_id: string | null
  guest_email: string | null
  attendee_first_name: string | null
  attendee_last_name: string | null
  attendee_email: string | null
  status: SquadMemberStatus
  order_id: string | null
  paid_at: string | null
}

// Waitlist types
export type WaitlistStatus = 'waiting' | 'notified' | 'converted' | 'expired' | 'removed'

export interface WaitlistEntry {
  id: string
  event_id: string
  ticket_tier_id: string | null
  user_id: string
  quantity_requested: number
  status: WaitlistStatus
  position: number
  created_at: string
  notified_at: string | null
  converted_at: string | null
  expired_at: string | null
}

// Virtual queue types
export type QueueStatus = 'waiting' | 'admitted' | 'expired' | 'abandoned'

export interface QueueEntry {
  id: string
  event_id: string
  user_id: string | null
  session_id: string | null
  position: number
  status: QueueStatus
  admitted_at: string | null
  expires_at: string | null
  created_at: string
}

// Inventory cache types
export interface TierInventory {
  sold: number
  reserved: number
  total: number
  available: number
  percent_sold: number
}

export interface EventInventory {
  total_sold: number
  total_capacity: number
  percent_sold: number
}
```

---

## Part 11: File Structure

After M4 is complete, the following files should exist (new files in bold):

```
src/
  lib/
    redis/
      client.ts                       ★ Upstash Redis client
      inventory-cache.ts              ★ Inventory cache helpers
    seats/
      seat-map-parser.ts              ★ CSV/JSON parser for seat map import
      best-available.ts               ★ Best-available seat algorithm
    pricing/
      dynamic-pricing.ts              ★ Dynamic pricing helpers
  
  app/
    actions/
      seats.ts                        ★ Seat selection server actions
      squads.ts                       ★ Squad booking server actions
      waitlist.ts                     ★ Waitlist server actions
      queue.ts                        ★ Virtual queue server actions
      venues.ts                       ★ Venue CRUD
      seat-maps.ts                    ★ Seat map CRUD
      dynamic-pricing.ts              ★ Dynamic pricing rule CRUD
      reservations.ts                 (updated for seat-based reservations)
      checkout.ts                     (updated for dynamic pricing)
    
    (public)/
      events/
        [slug]/
          page.tsx                    (updated — seat UI / queue redirect / badges)
    
    queue/
      [event_slug]/
        page.tsx                      ★ Virtual queue waiting room
    
    squad/
      [share_token]/
        page.tsx                      ★ Squad join page
    
    (dashboard)/
      dashboard/
        events/
          [id]/
            pricing/
              page.tsx                ★ Dynamic pricing editor
            seats/
              page.tsx                ★ Seat holds management
        my-squads/
          page.tsx                    ★ Buyer's squads
        my-waitlists/
          page.tsx                    ★ Buyer's waitlist entries
        venues/
          page.tsx                    ★ Venue list
          [venueId]/
            edit/
              page.tsx                ★ Venue edit
            seat-maps/
              [seatMapId]/
                edit/
                  page.tsx            ★ Seat map editor
  
  components/
    seats/
      seat-map-viewer.tsx             ★ Buyer-facing interactive seat map
      seat-map-editor.tsx             ★ Organiser-facing map editor
      best-available-button.tsx      ★ Best available selector
    squads/
      squad-card.tsx                  ★ Squad display
      squad-join-form.tsx             ★ Join squad form
      squad-status.tsx                ★ Live status with timer
    waitlist/
      waitlist-button.tsx             ★ Join waitlist button
      waitlist-position.tsx           ★ Live position display
    queue/
      queue-position.tsx              ★ Queue wait display with polling
    inventory/
      social-proof-badge.tsx          ★ Badges on event cards
      inventory-counter.tsx           ★ "Only X left!" display
    pricing/
      dynamic-pricing-editor.tsx      ★ Step editor for organisers
      dynamic-pricing-preview.tsx     ★ Price preview

  emails/
    squad-invite.tsx                  ★ Squad invitation email
    squad-completed.tsx               ★ Squad completed confirmation
    waitlist-notification.tsx         ★ "Tickets available!" email
```

---

## Part 12: Completion Checklist

When Module 4 is complete, every item below must be true:

### Database
- [ ] All M4 tables created (venues, seat_maps, seat_map_sections, seats, seat_holds, dynamic_pricing_rules, squads, squad_members, waitlist, waitlist_notifications, virtual_queue, inventory_snapshots, tier_access_codes)
- [ ] All enums created (seat_status, seat_type, squad_status, squad_member_status, waitlist_status, queue_status)
- [ ] All new columns added to events and ticket_tiers tables
- [ ] All RPC functions created: `materialize_seats`, `create_seat_reservation`, `get_current_tier_price`, `create_squad`, `join_squad`, `complete_squad`, `expire_squad`, `join_waitlist`, `promote_waitlist`, `enter_queue`, `admit_queue_batch`
- [ ] RLS policies on every new table
- [ ] pg_cron jobs for squad expiry, waitlist cleanup, queue admission

### Redis
- [ ] Upstash Redis client configured
- [ ] `@upstash/redis` package installed
- [ ] Tier and event inventory cache helpers implemented
- [ ] Cache invalidation on sold_count/reserved_count changes
- [ ] Graceful fallback to Postgres when Redis unavailable
- [ ] Social proof badges render correctly

### Reserved Seating
- [ ] Venue CRUD works for organisers
- [ ] Seat map CSV import works
- [ ] Seats materialise on event publish
- [ ] Interactive seat selection UI renders on event page
- [ ] Selected seats lock correctly (no double-booking under concurrent load)
- [ ] Best Available algorithm picks contiguous seats
- [ ] Accessible seats shown with icon
- [ ] Seat holds (organiser-held seats) work
- [ ] Seat-based reservations flow to checkout correctly

### Dynamic Pricing
- [ ] Dynamic pricing editor works for organisers
- [ ] Steps configurable 1-10 per tier
- [ ] `get_current_tier_price` RPC returns correct step
- [ ] Price displayed on event page matches current step
- [ ] Price locks at reservation time (not page load)
- [ ] Historical orders keep their original locked price

### Squad Booking
- [ ] "Start a Squad" button on event page
- [ ] Squad creation atomically reserves N tickets
- [ ] Share token generates and link works
- [ ] Squad join page shows status
- [ ] Multiple squad members can pay independently
- [ ] Squad completes when all members paid
- [ ] Squad expires at timeout with refunds for paid members
- [ ] Leader can extend once (+24 hours)
- [ ] Leader can cancel (refunds all paid members)
- [ ] Squad invitation emails sent

### Waitlist
- [ ] Sold-out tiers show "Join Waitlist" button
- [ ] Waitlist position assigned atomically
- [ ] Waitlist entry visible in `/dashboard/my-waitlists`
- [ ] When inventory becomes available, next in line is notified
- [ ] Notification email sent via Resend
- [ ] 15-minute purchase window enforced
- [ ] Expired notification promotes next person

### Virtual Queue
- [ ] High-demand events redirect to queue at sale time
- [ ] Queue position assigned atomically
- [ ] HMAC-signed position tokens
- [ ] IP rate limiting prevents multiple entries
- [ ] Queue page polls for position updates
- [ ] Admission batches work correctly
- [ ] Admitted users can proceed to checkout
- [ ] Queue expires at configurable admission window

### Advanced Tier Rules
- [ ] `sale_start` / `sale_end` enforced — tier hidden when out of window
- [ ] `hidden_until` hides tier until reveal time
- [ ] Access-code gated tiers work with session flag
- [ ] Access code validation server-side at reservation time

### Build
- [ ] `npm run build` passes with zero errors
- [ ] No browser console errors on any new pages
- [ ] All RPC calls use adminClient where required (per M4 Principle 1)

---

## Part 13: How To Execute This Module

### Step 1: Complete Part 0 (Upstash Redis Setup)
Do this BEFORE running Claude Code. If you skip this, the Redis parts will fail.

### Step 2: Run the SQL

Download `M4-ticketing-engine-sql.sql` (provided separately). Open Supabase → SQL Editor → New query → paste the entire file → Run.

Expected: success message with no errors. If you get errors, stop and share them. Don't try to fix manually.

### Step 3: Verify SQL Ran

In Supabase → Table Editor, confirm these NEW tables exist:
- venues
- seat_maps
- seat_map_sections
- seats
- seat_holds
- dynamic_pricing_rules
- squads
- squad_members
- waitlist
- waitlist_notifications
- virtual_queue
- tier_access_codes

### Step 4: Check Stripe Listener is Running

Look at the Stripe listener PowerShell tab. Confirm it's still running and forwarding webhooks. If not, restart it with:

```powershell
cd C:\stripe_1.40.2_windows_x86_64
.\stripe.exe listen --forward-to localhost:3000/api/webhooks/stripe
```

If you get a new webhook secret, update `STRIPE_WEBHOOK_SECRET` in `.env.local`.

### Step 5: Open Claude Code

```powershell
cd ~\OneDrive\Desktop\EventLinqs\eventlinqs-app
claude
```

### Step 6: Give Claude Code the First Phase Command

M4 is too large for a single prompt. We break it into 3 phases. Paste this for Phase 1:

```
Read docs/modules/M4-ticketing-engine.md in full. This is the spec for Module 4.

CRITICAL: Before writing any code, you MUST:
1. Read the "LESSONS FROM M3" section and follow every principle — especially Principle 1 (admin client for writes) and Principle 2 (verify columns exist)
2. Read scripts/fix-ticket-counts.sql to understand the current ticket_tiers schema
3. Read src/lib/payments/payment-calculator.ts to understand the pricing engine
4. Read src/app/actions/checkout.ts and src/app/actions/reservations.ts to understand existing reservation flows
5. Read src/app/api/webhooks/stripe/route.ts to understand webhook patterns

PHASE 1 SCOPE — Build ONLY these parts of M4 in this session:
- Part 0: Upstash Redis client setup (src/lib/redis/client.ts and inventory-cache.ts)
- Part 8: Redis inventory cache write-through from confirm_order and create_reservation RPCs
- Part 3: Dynamic pricing engine (schema is in SQL, build the TypeScript helpers, editor page, and integrate into checkout.ts to use get_current_tier_price RPC)
- Part 7: Advanced tier rules — sale_start/sale_end enforcement on event page, hidden_until, access codes
- Part 8: Social proof badges component and integration on event cards

DO NOT build in this phase: seats, squads, waitlist, virtual queue (those are phases 2 and 3).

The database SQL has already been run manually in Supabase. @upstash/redis is installed.

Build incrementally. After each part, run npm run build to verify zero errors. If a build fails, fix it before moving to the next part.

At the end, show me:
1. A summary of every file created or modified
2. npm run build output confirming zero errors
3. A test plan for me to verify Phase 1 works in the browser
```

### Step 7: Test Phase 1
Follow the test plan Claude Code gives you. Only proceed to Phase 2 after Phase 1 is fully working.

### Step 8: Phase 2 Command

```
PHASE 2 SCOPE for M4 — Build these parts next:
- Part 2: Reserved seating (venue CRUD, seat map import via CSV, seat materialisation, interactive seat selection UI, best-available algorithm)
- Part 9: Update reservations.ts and checkout.ts to handle seat-based reservations

Remember the M4 Principles from the spec. Follow the same patterns you used in Phase 1. Build incrementally, run npm run build after each major piece.

At the end, show me files changed, build output, and test plan.
```

### Step 9: Test Phase 2

### Step 10: Phase 3 Command

```
PHASE 3 SCOPE for M4 — Build these final parts:
- Part 4: Squad booking (squad creation, join page, member payment flow, state machine, squad emails, cron job for expiry)
- Part 5: Waitlist system (join waitlist, position tracking, promote_waitlist RPC integration, notification emails, cron cleanup)
- Part 6: Virtual queue (high-demand event redirect, queue page with polling, HMAC-signed positions, admit_queue_batch RPC, cron admission)

Remember the M4 Principles. This is the final phase of M4.

At the end, show me files changed, build output, and full M4 completion checklist status.
```

### Step 11: Full M4 Verification
Run through the Completion Checklist. Anything failing, fix before committing.

### Step 12: Commit

```powershell
git add .
git commit -m "M4 complete: reserved seating, dynamic pricing, squads, waitlist, virtual queue, Redis inventory cache"
git push
```

---

## Part 14: Ticketmaster / Eventbrite / DICE Benchmarking Notes

This section documents how each M4 feature compares to competitors. Use this for marketing copy later.

| Feature | Ticketmaster | Eventbrite | DICE | **EventLinqs M4** |
|---------|-------------|-----------|------|-------------------|
| Reserved seating | ✅ | Limited | ❌ (GA only) | ✅ |
| Dynamic pricing | ✅ (controversial) | ❌ | ❌ | ✅ (transparent step-based) |
| Cart timer | 4 min | 8 min | 10 min | 10 min (configurable) |
| Social squad booking | ❌ | Limited | ❌ | ✅ (first-class) |
| Waitlist | Limited | Limited | ✅ | ✅ |
| Virtual queue | ✅ (SafeTix) | ❌ | ❌ | ✅ |
| Redis inventory cache | ✅ | Partial | ✅ | ✅ |
| Transparent pricing | ❌ (hidden fees) | Partial | ✅ | ✅ |
| Accessible seating | ✅ | ❌ | ❌ | ✅ |

**EventLinqs advantage:** We have every feature Ticketmaster has — but with transparent pricing, social squad booking, and a design-first experience. We match DICE on simplicity while exceeding them on capability.

---

## What Comes After Module 4

**Module 5: Multi-gateway + Payouts + Refunds + Chargebacks + Fraud** — Adds Paystack/Flutterwave/PayPal, refund processing, organiser payouts with holds, chargeback handling, and fraud scoring. CRITICAL: Start your Paystack and Flutterwave business verification applications now if you haven't — they take 1-3 weeks.
