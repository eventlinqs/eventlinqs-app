# Benchmark: Error Handling & Empty States

## Overview

Errors and empty states are where amateur products expose themselves. Every error must answer three questions: What happened? Why did it happen? What should the user do next? Generic errors destroy trust. Empty states are not failures — they are opportunities to guide users toward their goal. This document captures professional platform patterns.

---

## Form Validation Errors

### Inline vs Submit-Gate

**Best practice (Eventbrite, Stripe):** Validate on blur (when user leaves a field), not on submit.

- User tabs out of "Email" field with invalid value → inline error appears immediately under the field: "Please enter a valid email address"
- User does not need to click submit to discover errors — errors surface as they go
- On submit: re-validate all fields, scroll to first error, focus on first erroring field

**Bad practice (many platforms):** Show all errors only after submit. This means a user can fill in 8 fields, click submit, and suddenly see 4 errors — disorienting and punishing.

### Error Message Format

Every inline error must be:
- Red text, 14px, below the field
- With a red border on the field itself
- With an icon: ⚠ or ✕ to the left of the text
- With an `aria-describedby` linking the error message to the input for screen readers
- Specific — never generic

**Good error messages:**
- "Email is required" — simple, clear
- "Password must be at least 8 characters" — specific requirement
- "End date must be after start date" — relational, explains why
- "Card number is invalid — check for typos" — actionable
- "Promo code SUMMER20 is expired" — identifies the specific value that failed

**Bad error messages:**
- "Something went wrong" — useless
- "Invalid input" — what input? what is invalid about it?
- "Error" — not helpful at all
- "Please try again" — implies retrying will work; often it won't

### Multi-Field Error Summary (for complex forms)

For forms longer than 5 fields (like event creation), on submit-failure:
- Show error count in banner: "3 errors need your attention before saving"
- List each error as a link: clicking focuses the relevant field
- This is Eventbrite's pattern for multi-step event creation

---

## 404 Pages

**Ticketmaster 404:**
- Custom illustration
- "Hmm, we couldn't find that page" headline
- Search bar — allows immediate recovery
- Links to: Home, Concerts, Sports, Theater

**Eventbrite 404:**
- Illustration with character looking confused
- "Uh oh! This page doesn't exist" headline
- CTA buttons: "Find events" | "Create an event"
- No search bar on the page itself

**EventLinqs 404 target:**
- Custom branded illustration (consistent with EventLinqs visual identity)
- Headline: "We couldn't find that page"
- Sub-text: "The event or page you're looking for may have ended, moved, or never existed."
- Three CTAs: "Browse Events" | "Create an Event" | "Go to Home"
- Search bar — allows immediate recovery without full navigation
- Log error to Sentry with URL and referrer for investigation

---

## Empty States

### No Events (Events Listing Page)

When filters return zero results:
- **Never:** blank white space
- **Correct (Eventbrite):** Illustration + "No events found" + "Try adjusting your filters" + "Clear filters" button
- **EventLinqs target:** Same, plus: "Or explore events in a nearby city" with auto-suggested nearby city links

When organiser has published zero events:
- Dashboard shows: Illustration of a stage / ticket booth
- "You haven't created any events yet"
- "Create your first event" — large CTA button
- Secondary: "Watch a 2-minute guide" (links to help doc — TBD)

### No Orders

When organiser event has zero orders:
- Not a failure — it's early. Treat it as a journey start.
- "No orders yet — your event goes live [date]. Share it to get your first sale!"
- Share buttons: WhatsApp, Instagram (copy link for stories), Facebook, Email
- "Promote this event" CTA — links to marketing tools

When attendee has never bought a ticket:
- "Your ticket history is empty"
- "Explore events near you" — links to discovery
- Do not shame or confuse — this is a new user state

### No Venues

When organiser has no saved venues:
- "Add a venue to speed up future event creation"
- "Add Venue" CTA
- Or: "Use an address for this event without saving it" — guest venue option

---

## Network Failure States

### During page load

- Show skeleton loaders (not blank page)
- After 10 seconds: show error state with retry button
- Error state: "We're having trouble loading this page. [Retry]"
- Do not auto-retry endlessly — single manual retry is the correct UX

### During form submission

- Show loading state on submit button: spinner + "Saving..." label
- If request fails: restore button to "Save" state, show inline error banner: "Couldn't save changes — please check your connection and try again"
- Do not clear form data on network error — user inputs must be preserved

### During payment

- "Processing payment..." state on "Pay Now" button
- If network fails: "We couldn't reach our payment processor. Your card was not charged. Please try again."
- If uncertain (504 timeout): "Your payment is taking longer than expected. Do not refresh. We will email you a confirmation if your payment went through."
- After 30 seconds of timeout: "Something went wrong. Please check your email before trying again. If you see a charge without confirmation, contact support."

---

## Payment Failure States

**Card declined:**
- Inline error under card field: "Your card was declined. Please try a different card or contact your bank."
- Do not log or display decline reason codes to users (security)
- Keep seat hold for 2 additional minutes to allow card retry

**Insufficient funds:**
- Same message as card declined — do not expose specific reason

**Card expired:**
- "Your card has expired. Please try a different card."

**CVV mismatch:**
- Error on CVV field specifically: "Security code is incorrect"

**Fraud block:**
- Generic: "Your payment couldn't be processed. Please try a different payment method or contact your bank."

**3DS authentication failed:**
- "Your bank couldn't verify this payment. Please try again or use a different card."

---

## Sold-Out States

**When viewing a sold-out event (no waitlist):**
- No ticket selection available
- Red "SOLD OUT" badge on event hero
- Message: "This event is sold out."
- Suggested similar events (3 cards): "You might also like..."
- "Get notified if tickets become available" CTA (email capture — future feature)

**When viewing a sold-out event (with waitlist enabled):**
- "This event is sold out — join the waitlist"
- Waitlist form: Name, Email, Number of tickets wanted
- Confirmation: "You're on the waitlist! We'll notify you immediately if tickets become available."
- Position shown: "You are #47 on the waitlist"

**When a ticket sells out during seat selection:**
- Seat turns grey in real-time (via Supabase Realtime subscription)
- If user had the seat selected and it was released: toast notification "Your selected seat was taken by another buyer. Please choose a different seat."
- Never silently remove selection — always communicate why

---

## Expired Reservation

When seat hold timer reaches zero:
- Full-screen overlay (non-dismissable): "Your reservation has expired"
- Body: "We held your seats for 8 minutes but they've been released."
- CTA: "Select new seats" — returns to seat map, does NOT clear chosen quantity
- Secondary: "See available seats" — same action
- Do not allow proceeding to payment with an expired reservation — server-side validation enforces this too

---

## General Principles

1. **Every error must suggest the next action.** "Error" alone is not enough.
2. **Errors must be specific.** Name the field, name the value that failed, name the requirement.
3. **Preserve user work.** Form data must survive an error — never clear the form on failure.
4. **Empty states are not errors.** Use encouraging, constructive language, not apologetic.
5. **All errors are logged to Sentry** with: error message, user ID (if logged in), URL, form state, timestamp.
6. **User-facing error messages never expose stack traces, query errors, or internal state.**
