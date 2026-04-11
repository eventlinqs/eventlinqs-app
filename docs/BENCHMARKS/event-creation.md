# Benchmark: Event Creation

## Overview

Event creation is the organiser's most important first-time experience. If the wizard is confusing, fields are in the wrong order, or validation is punishing, organisers churn before publishing a single event. Eventbrite and Ticketmaster have invested millions of hours in optimising this flow. This document captures their patterns so EventLinqs can match and exceed them.

---

## Eventbrite Event Creation Wizard

### Structure

Eventbrite uses a **multi-step sidebar wizard** (not a traditional top-step-indicator). The sidebar persists the full list of steps at all times so the organiser always knows where they are and can navigate backward freely.

**Steps (in order):**

1. **Basic Info** — Event name, organiser/host name, event category, sub-category, format (conference, seminar, performance, etc.), event language
2. **Location & Date** — Venue vs. Online vs. TBD toggle, venue address autocomplete (Google Places API), start date/time, end date/time, timezone dropdown, recurring event toggle
3. **Details** — Long-form description (rich text editor with formatting toolbar: bold, italic, link, bullet lists, image embed), event image (minimum 2160x1080px, aspect ratio 2:1 enforced)
4. **Tickets** — Ticket tiers (Free or Paid), quantity, price, sale start/end, tier name, tier description (optional), max per order, visibility rules (show when another tier sells out)
5. **Publish** — SEO meta description, privacy (public/private/password-protected), online event link, publish immediately vs. schedule later

### Key Behavioural Patterns

**Smart defaults everywhere:**
- Timezone defaults to organiser's local timezone (detected from browser)
- Sale start defaults to "immediately" and sale end defaults to "event start time"
- Capacity defaults to 100 (editable)
- Currency defaults to organiser's account currency

**Inline validation, not submit-gated:**
- Date fields validate on blur. If end date is before start date: "End time must be after start time" appears inline immediately under the field, not after clicking Next
- Ticket price validates for minimum $0.99 for paid events
- Event name enforces 5–140 character limit with live character counter

**Draft saving:**
- Every field change autosaves to draft. No data is ever lost if the browser closes
- "Last saved 2 minutes ago" status indicator in top-right corner
- Organisers can close and reopen mid-creation from "Drafts" in their dashboard

**Image upload UX:**
- Drag-and-drop zone with clear size requirements shown (2160x1080px, max 10MB)
- Inline preview crops to 2:1 ratio immediately on upload
- If image is below minimum: "Image too small. Minimum 2160x1080px" — not a generic error
- No upload allowed before image meets requirements

**Recurring events:**
- Toggle reveals a date pattern selector: daily, weekly (with day checkboxes), monthly (first/second/third/last + day of week), custom
- Each occurrence is created as a separate event but linked under a parent series
- Series settings (name, image, description) propagate to all occurrences with override option per date

**Free vs. Paid toggle:**
- Switching to Free removes all pricing fields and shows a zero-fee confirmation
- Switching back to Paid restores last-entered values

**Required vs. optional labeling:**
- All required fields marked with asterisk (*)
- Optional fields explicitly labeled "(optional)" in grey
- No ambiguity about what blocks progression

---

## Ticketmaster/Live Nation Organiser Flow (Venue-Side)

Ticketmaster's organiser tools are primarily used by large venue staff and promoters, not individual creators. The flow is fundamentally different from Eventbrite.

### Structure

Ticketmaster uses a **venue-first model**:

1. **Select Venue** — The venue must exist in Ticketmaster's system before the event can be created. No venue = no event. This is a hard blocker. Venue operators have pre-configured seating charts, capacities, and hold patterns.
2. **Event Details** — Performer/artist name, event type (concert, sports, comedy, etc.), event date and door time, on-sale date and time
3. **Seat Map Selection** — Choose from pre-existing venue seat maps or create a manifest. Sections, rows, and individual seats are mapped from the venue's master configuration
4. **Pricing** — Price codes assigned to seat zones (Platinum, Gold, Standard, GA), dynamic demand pricing toggle (Platinum pricing that auto-adjusts)
5. **Holds and Kills** — Artist holds (comps), promoter holds, venue holds, ADA holds — each hold type is a counted block with names
6. **On-Sale Rules** — Fan Club pre-sale windows (password-protected), credit card pre-sales, general public on-sale time
7. **Review and Publish**

### Key Behavioural Patterns

**Venue selection is the critical blocker:**
- No free-text address. You search for the venue by name from Ticketmaster's database
- Small/new venues must be onboarded separately before any event can be created against them
- This is Ticketmaster's moat — venue relationships lock in event creators

**Seat map is inherited, not built:**
- Organisers don't draw seat maps. They select from the venue's pre-approved map configuration
- Hold patterns (artist vs. promoter vs. venue) are overlaid as blocks on the map with counts
- "Kills" are seats permanently blocked (obstructed view, broken, restricted)

**Price codes not per-ticket:**
- Ticketmaster doesn't allow arbitrary per-seat pricing. Price is set at the zone/section level via price codes (e.g., "A1" = $150, "B2" = $95)
- Dynamic pricing (Platinum) overrides the base price code with a demand-adjusted floor and ceiling

**On-sale windows are complex:**
- Fan Club pre-sale: specific date/time + password
- Card pre-sale: tied to a specific credit card (e.g., Citi, Amex)
- General on-sale: public date/time with queue enabled for high-demand events
- Multiple pre-sale windows are stacked and managed in a timeline view

**No draft concept:**
- Events exist in "Pending", "Approved", or "On Sale" states, managed through internal approval workflows for large venues

---

## EventLinqs Targets (What We Must Build)

Based on the above analysis, EventLinqs event creation must:

1. **Use a sidebar wizard** with persistent step list, free backward navigation, and no data loss on navigation
2. **Autosave every field change** to draft with visible "last saved" timestamp
3. **Inline validation on blur** — never wait for submit to show field errors
4. **Smart defaults** — timezone from browser, sale start = now, sale end = event start, capacity = 100
5. **Support both GA and reserved seating** — toggle that reveals the seat map builder (our competitive edge over Eventbrite which has no real seat map builder)
6. **Rich text editor** for event description with at minimum: bold, italic, link, bullet list
7. **Image upload** with 2:1 cropping, minimum size enforcement, drag-and-drop, and immediate preview
8. **Recurring events** with series parent/child structure
9. **Free vs Paid toggle** with zero-fee messaging for free events
10. **Pre-sale window support** with password and date/time configuration
11. **Privacy settings** — public, private, password-protected

### Where We Beat Them

- **Eventbrite** requires 5 separate step changes to create a basic event. EventLinqs should allow a minimal event (name, date, one tier, image) to publish in 3 steps.
- **Ticketmaster** requires venue pre-registration. EventLinqs allows any organiser to create a venue profile and build a seat map in the same session.
- **Both** have clunky mobile event creation experiences. EventLinqs must work flawlessly on mobile — full creation from an iPhone is a first-class use case.
- **Neither** gives clear, line-item fee transparency to the organiser at ticket creation time. EventLinqs must show "You'll earn $X per ticket after our Y% fee" as the organiser types the price.

---

## Specific Field Reference

| Field | Eventbrite Default | Ticketmaster Default | EventLinqs Target |
|-------|-------------------|---------------------|-------------------|
| Event name | Required, 5–140 chars | Required, no limit shown | Required, 3–150 chars, live counter |
| Start date | Required, future only | Required, future only | Required, future only, timezone-aware |
| End date | Required, after start | Required, after start | Required, after start, cross-midnight supported |
| Timezone | Auto-detected | Auto-detected | Auto-detected, user-overridable |
| Capacity | Default 100 | Inherited from venue | Default 100 for GA, derived from seat map for reserved |
| Image | 2:1, min 2160x1080 | Varies by event type | 16:9 for cards, 2:1 for hero, both generated from one upload |
| Sale end | Defaults to event start | Set per price code | Defaults to event start |
| Currency | Account currency | USD primarily | Per-event, with organiser account default |

---

## Validation Error Messaging Standards

These are the error message patterns Eventbrite uses — specific, human, and actionable:

- `"Event name must be at least 5 characters"` — not "Invalid name"
- `"End time must be after start time"` — not "Invalid date range"
- `"Ticket quantity must be at least 1"` — not "Invalid quantity"
- `"Sale end date cannot be after the event start"` — not "Date error"
- `"Image too small. Minimum dimensions are 2160 × 1080px"` — not "Upload failed"
- `"Price must be at least $0.99 for paid events"` — not "Invalid price"

EventLinqs must match or improve on this specificity. Generic errors are not acceptable.
