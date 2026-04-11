# Benchmark: Organiser Dashboard

## Overview

The organiser dashboard is the control center for event creators. It must answer the question "How is my event performing?" in under 3 seconds of page load. Platforms that bury critical metrics, use unclear chart types, or require navigating to multiple pages to understand event health lose organiser trust quickly. This document covers how Eventbrite and Ticketmaster handle this, and where EventLinqs must exceed them.

---

## Eventbrite Organizer Dashboard

### Layout Structure

Eventbrite uses a **left sidebar navigation + main content area** layout:

**Left Sidebar (persistent):**
- Organiser avatar and account name at top
- Navigation items:
  - Dashboard (overview)
  - Events (list of all organiser's events)
  - Orders (all orders across events)
  - Reporting (revenue and attendee reports)
  - Marketing (email campaigns, promoted events)
  - Finance (payout settings, invoices)
  - Settings (organiser profile, team members)

**Main content (Dashboard overview):**

**Section 1 — "Your Upcoming Events" carousel:**
- Horizontal scroll of event cards (3 per row desktop)
- Each card: event thumbnail, event name, date, "X tickets sold" badge, status pill (Published / Draft / Ended)
- Quick actions on hover: "Manage", "View", "Copy"

**Section 2 — "Performance" charts:**
- Date range picker (last 7 days / last 30 days / custom)
- Revenue over time (line chart)
- Tickets sold by day (bar chart)
- These are event-agnostic aggregates across all events

**Section 3 — "Recent Orders" table:**
- 10 most recent orders across all events
- Columns: Attendee name, Event, Order date, Ticket type, Amount, Status (Completed / Refunded / Cancelled)
- "View all orders" link at bottom

**Missing from Eventbrite dashboard:**
- No page views metric on dashboard (buried in Reporting section)
- No conversion rate (buried)
- No "currently checking out" real-time metric
- Charts are basic — no event-level comparison view
- No quick action to send email to all attendees from dashboard

### Event-Specific Dashboard

When an organiser clicks into a specific event, they get a dedicated event dashboard:

**Metrics row (above the fold — this is Eventbrite's best UX pattern):**
- 4 metric cards in a horizontal row:
  - **Total Revenue** — "$4,280.00" with change vs. previous day (+$120)
  - **Tickets Sold** — "214 of 500" with progress bar
  - **Page Views** — "1,847" with mini trend line
  - **Conversion Rate** — "11.6%" (page views → purchases)
- Each card has a small sparkline showing 7-day trend

**Below the fold:**
- Revenue chart (line, 7/14/30 days)
- Tickets sold by tier (stacked bar chart)
- Traffic sources (pie chart or table)
- Attendee list (paginated table, searchable)
- Order table (same as main dashboard but event-filtered)

---

## Ticketmaster Host Portal

Ticketmaster's organiser portal (for venue clients and promoters) is more enterprise-grade:

### Key Differences from Eventbrite

**Metrics focus:**
- Ticketmaster shows **gross revenue** prominently (the number venue managers care about)
- Breakdown by price tier (Platinum vs. Standard vs. GA)
- **Holds dashboard** — how many comp/hold tickets are allocated vs. remaining
- **Dynamic pricing metric** — current market price vs. face value spread

**Access model:**
- Multi-user with role permissions (Box Office Manager, Promoter, Venue Admin)
- Separate login from consumer Ticketmaster accounts
- No self-serve — setup requires Ticketmaster account manager involvement

**Real-time updates:**
- On-sale day: dashboard shows "live" tickets sold counter with 60-second refresh
- "Demand alerts" — notification when a section sells out
- Sales velocity graph: tickets per hour over time (useful for predicting sellout)

**Reporting exports:**
- CSV and PDF exports from any data view
- Scheduled report emails (daily/weekly summary)
- Box office manifest export (for day-of operations)

---

## EventLinqs Organiser Dashboard — Target

Based on both platforms, EventLinqs must:

### Page Layout

**Navigation:**
- Left sidebar on desktop (collapsible to icon-only with tooltip on hover)
- Bottom tab bar on mobile (5 tabs max: Dashboard, Events, Orders, Finance, Settings)
- Brand logo / "EVENTLINQS" text at top of sidebar

**Dashboard overview URL:** `/organiser/dashboard`

### Above-the-Fold Metrics (non-negotiable — must be visible without scrolling on 1280x800)

Four metric cards in a 2×2 grid on mobile, 4-column row on desktop:

1. **Revenue** — Total gross revenue across all active events. Dollar formatted. Change badge (▲ +12% vs last 7 days) in green/red.
2. **Tickets Sold** — Total tickets sold this month. Absolute number + progress ring if capacity is defined.
3. **Upcoming Events** — Count of published events with future dates. Links to events list.
4. **Conversion Rate** — Aggregate across all events (orders / unique visitors who reached checkout). Shown as percentage.

Each card must:
- Load within 500ms (use Suspense skeletons)
- Have a mini sparkline (7-day trend)
- Be clickable — links to the relevant detailed view

### Charts Section

Below metrics, two charts side by side (desktop), stacked (mobile):

**Revenue over time (line chart):**
- X axis: days (last 30 days by default, selectable 7 / 30 / 90 / custom)
- Y axis: revenue in dollars
- Tooltip on hover: "15 Apr: $842"
- Supports multi-event comparison (toggle individual events on/off)

**Tickets sold by day (bar chart):**
- Same date range as revenue chart (synced)
- Color-coded bars by event (if multiple events)
- Total shown in tooltip

### Event List Section

Below charts, "Your Events" section:
- Tabs: Upcoming | Ended | Drafts
- Each event row: thumbnail, name, date, venue, tickets sold / capacity, revenue, quick action buttons (Manage, View Public Page, Duplicate, Archive)
- Sortable columns
- Search/filter bar above table

### Recent Orders Section

- Last 20 orders across all events (paginated)
- Columns: Attendee name, Event, Tickets, Amount, Date, Status
- Status badge: Completed (green), Pending (yellow), Refunded (grey), Cancelled (red)
- Click row → order detail modal (no page navigation)
- Export to CSV button

### Quick Actions Sidebar Widget

Right column (desktop only):
- "Create New Event" — primary CTA, always visible
- "Send Email to Attendees" — triggers email broadcast modal
- "Download Sales Report" — CSV export
- "View Public Profile" — link to organiser's public page

### Event-Specific Dashboard (`/organiser/events/[id]`)

When viewing a single event:

**Metrics bar (4 cards):**
1. Revenue — gross, with breakdown popover (before/after fees)
2. Tickets Sold — X of Y, progress bar, breakdown by tier
3. Page Views — unique visitors to event public page
4. Conversion — page views → purchase rate

**Ticket tier breakdown table:**
- Columns: Tier name, Price, Sold, Remaining, Revenue
- "Sold out" badge if remaining = 0

**Attendee list:**
- Searchable, paginated table
- Columns: Name, Email, Ticket type, Order date, Seat (if reserved seating), Check-in status (when M6 is built)
- Export to CSV
- "Email this attendee" action per row

**For reserved seating events:**
- Mini seat map thumbnail showing sold (grey) vs available (colored) seats
- Click to open full seat map in manage mode

### Mobile Dashboard

On mobile (≤768px):
- Bottom tab bar with 5 icons: Home (Dashboard), Events, Orders, Finance, Settings
- Metric cards stack vertically, full-width
- Charts are full-width, touch-scrollable with horizontal pan on X axis
- Event list uses card layout (not table — tables don't work on mobile)
- "Create Event" FAB (floating action button) fixed bottom-right

---

## Notification Patterns

**Eventbrite** sends email notifications for:
- New order received
- Daily sales summary (opt-in)
- Upcoming payout

**Ticketmaster** sends alerts for:
- Section selling out
- On-sale start
- Demand threshold breached (custom)

**EventLinqs target notifications (via email + in-app):**
- New order received (organiser email, configurable on/off)
- Event is 50% sold → "You're halfway there!"
- Event is 90% sold → "Almost sold out — consider adding capacity or a waitlist"
- Event is 100% sold → "Your event is sold out"
- Ticket refunded (with reason if provided)
- Payout processed (with amount)

---

## Performance Requirements for Dashboard

- Page must achieve First Contentful Paint under 1.5 seconds
- Metric cards must use Suspense and skeleton placeholders — never block on slow DB queries
- Charts load asynchronously after metrics — page remains interactive while charts load
- Export operations are async (background job) — do not block UI
- All data shown in organiser's timezone (not UTC) — detect from browser or let organiser set in Settings

---

## Dark Mode

Both Eventbrite and Ticketmaster host portals do NOT support dark mode (as of 2025). EventLinqs can differentiate:
- Respect `prefers-color-scheme: dark` system setting
- Full dark mode support: deep navy (#1A1A2E) backgrounds, white text, adjusted card/chart colors
- Toggle in Settings to force light/dark regardless of system preference

TBD — verify current dark mode support on Eventbrite Organizer with Playwright MCP visit to eventbrite.com/manage
