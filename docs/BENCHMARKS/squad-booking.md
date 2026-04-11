# Benchmark: Squad Booking

## Overview

Group ticket purchasing — where friends want to attend together but coordinate payment across multiple people — is an underserved problem in ticketing. The dominant platforms approach it from fundamentally different angles: Ticketmaster treats it as corporate bulk buying, Eventbrite treats it as conference registration, and DICE has built the most consumer-friendly group feature with Cliques. None of them fully solve the "Alice wants to go with 4 friends who each pay their own way" problem. EventLinqs' Squad Booking is designed to be the definitive solution.

---

## Ticketmaster — Group Tickets

### Concept

Ticketmaster's "Group Tickets" feature is not designed for friends. It is designed for **corporate groups, school trips, and sports club bulk purchases** — typically 10 or more tickets bought by a single buyer (or organiser) who pays the full amount upfront. The flow is:

1. Navigate to the event page
2. Find the "Group Tickets" link (often buried in a side panel or a separate "Groups" tab — not always visible at all)
3. Submit an enquiry form with: group size, name, organisation, phone number, event date
4. A Ticketmaster group sales representative contacts the buyer — this is a **manual, sales-assisted process**, not self-serve
5. Payment is arranged via invoice or bulk card charge

### Inventory Holding

Tickets for group purchases are held manually by the Ticketmaster group sales team, not by an automated system. Lead time is typically 3–5 business days. This is completely unsuitable for the consumer "friends going out" use case.

### Payment Model

Leader-pays-all. There is no mechanism for individual members of the group to pay their own share via Ticketmaster's group flow. Cost-splitting is left entirely to the buyer (cash, Venmo, etc.) outside the platform.

### Member Join Flow

N/A — there is no member join flow. One person submits the enquiry, one person pays, and tickets are delivered to that person for redistribution. No individual attendee management.

### Expiry Behaviour

N/A — because the process is manual, there is no automated expiry. The group sales team manages timelines manually.

### Refund Handling

Standard Ticketmaster refund policy applies to the lead buyer. Individual member refunds are not a platform concept — the lead buyer is responsible for reimbursing members.

### Anti-Abuse

N/A at the consumer level — group tickets require a manual sales call, which is the only abuse protection (and the main friction point).

### Summary Assessment

Ticketmaster's Group Tickets feature is a B2B sales product disguised as a ticketing feature. It is **not comparable to EventLinqs Squad Booking** for the consumer use case. It is included here for completeness only.

---

## Eventbrite — Group Registration

### Concept

Eventbrite's approach to group buying is most relevant for **workshops, conferences, and corporate training events** rather than live entertainment. Eventbrite supports:

1. **Order on behalf of others** — a single buyer purchases multiple tickets, provides attendee details for each (name + email per ticket), and each attendee receives their own confirmation email. The leader pays the full total.

2. **Promo codes for group discounts** — an organiser creates a promo code for a specific group (e.g., "TECHSYDNEY30") and distributes it to a team. Each individual purchases their own ticket with the code. This is not coordinated — members buy independently at different times.

### Inventory Holding

No coordinated hold. Each ticket in the multi-ticket order is processed as part of a single transaction — no waiting for friends to join. The leader buys all at once.

### Payment Model

Leader-pays-all for the "order on behalf of others" flow. For the promo code approach, each member pays their own share independently, but there is no coordination layer — they are just using the same discount code. There is no mechanism to say "this group of 5 is buying together and we are all paying our share."

### Member Join Flow

In the promo code model: N/A — members buy independently. In the "on behalf of" model: members receive confirmation emails but have no active role in the purchase — they are passive recipients of tickets bought for them.

### Expiry Behaviour

N/A — there is no pending squad that could expire. The purchase is either completed (leader pays) or not started.

### Mobile UX

The "on behalf of others" flow requires entering multiple names and emails in a form, which is tedious on mobile. Eventbrite does not have a "share link with friends to join" model. TBD — verify current mobile registration flow with Playwright MCP visit to eventbrite.com.

### Refund Handling

Refunds go back to the lead buyer's payment method. Individual members have no refund path — they would need to be reimbursed by the leader out-of-band.

### Summary Assessment

Eventbrite's group model is a **purchaser-as-coordinator** model, not a **collaborative purchase** model. It is better than Ticketmaster for consumer use cases but still requires one person to bear the full payment. No platform-level split payment exists.

---

## DICE — Cliques

### Concept

DICE Cliques is the most advanced consumer group-buying feature of any major ticketing platform. It was designed specifically for the "going with friends" use case common in music and nightlife:

1. A buyer (the Clique leader) selects 2–6 tickets
2. DICE creates a shareable Clique link
3. The leader shares the link via WhatsApp, iMessage, or Instagram DM directly from the DICE app
4. Friends open the link on their own devices, see the event, see who has already joined, and purchase their own ticket within the Clique
5. Each member pays for exactly one ticket — their own
6. When the Clique is full OR a defined deadline passes, the Clique is finalised

### Inventory Holding

When a Clique is created, DICE holds all N seats atomically for the Clique's duration. The default hold period is **48 hours** for standard events and can be shorter for high-demand shows. If the Clique is not full when the hold expires, the unfilled seats are released back to inventory and the filled members keep their tickets (the Clique partially succeeds rather than rolling back).

This partial success model is a meaningful UX distinction from an all-or-nothing approach.

### Payment Model

**Split payment** — each member pays only their own ticket. The leader pays for one seat, not all seats. This is the core value proposition of Cliques and why it is uniquely suited to the consumer use case.

### Member Join Flow

1. Friend receives link (no DICE account required to view the Clique)
2. If they do not have a DICE account, they are prompted to create one before purchasing — account creation is streamlined (email + phone, no password initially)
3. Friend confirms their ticket and pays
4. Friend's name appears in the Clique member list immediately (real-time update for all members)

DICE requires accounts for all Clique members — this is consistent with their anti-touting model (named, verified tickets).

### Expiry Behaviour

If the hold expires with unfilled spots:
- Filled members' tickets are confirmed and remain valid
- Unfilled spots are released to general inventory
- The leader receives a notification: "3 of 5 Clique spots were filled — [Name], [Name], and [Name] have their tickets"
- No refunds are required for this scenario since each person paid individually

If the leader cancels the Clique before any member joins:
- Inventory is released, leader's payment is refunded

TBD — verify exact partial Clique cancellation behaviour with Playwright MCP visit to dice.fm

### Communication

DICE sends real-time notifications to the Clique leader at each member join event:
- Push: "[Friend's name] just joined your Clique for [Event]! 3/5 spots filled."
- In-app banner shows current Clique status at all times

Members see a live Clique page showing all confirmed members' profile names (not full real names — DICE usernames), spots remaining, and countdown to deadline.

### Squad Limits

DICE Cliques support 2–6 members inclusive of the leader. The minimum is 2 (one leader + one friend). The maximum is 6. TBD — verify if limits vary per event via Playwright MCP.

### Visibility

Cliques are **invite-only** via link. There is no public "join a stranger's Clique" feature. The link is the access credential. DICE does not surface Cliques to users who were not invited.

### Anti-Abuse

- DICE account required to complete payment — no anonymous squad abuse
- One ticket per account per event limit applies within Cliques — you cannot join multiple Cliques for the same event
- Ticket is named and linked to the buyer's verified ID — scalpers cannot benefit from Cliques since tickets are non-transferable except via DICE's transfer system (face value only)
- The leader cannot claim multiple spots — they pay for exactly one seat like everyone else

### Mobile UX

DICE is mobile-app-native and Cliques are designed exclusively for mobile:
- Sharing uses the native iOS/Android share sheet — WhatsApp, iMessage, Instagram DM all work with one tap
- The Clique page is a card-style view optimised for mobile: event image, member grid, progress indicator ("3/5 joined"), time remaining
- Each member avatar appears in real-time as they join (similar to a live "watching" indicator)
- CTA button: "Join Clique — 1 ticket — $45" — single tap to initiate payment
- Apple Pay / Google Pay supported for one-tap payment within Clique join flow

---

## Cross-Platform Comparison

| Feature | Ticketmaster | Eventbrite | DICE (Cliques) | EventLinqs Target |
|---------|-------------|------------|----------------|-------------------|
| Consumer friend-group model | No (B2B only) | No (leader-pays-all) | Yes (Cliques) | Yes (Squads) |
| Split payment (each pays own) | No | No | Yes | Yes |
| Shareable join link | No | No | Yes | Yes |
| Account required to join | N/A | No | Yes | No — guest join allowed |
| Inventory hold on creation | No | No | Yes (48 hrs) | Yes (24 hrs default) |
| Partial fill handling | N/A | N/A | Partial success | All-or-nothing (refund on expiry) |
| Real-time member status | N/A | N/A | Yes | Yes |
| Expiry behaviour | N/A | N/A | Partial success | Full rollback + refund |
| Max group size | Unlimited (B2B) | Unlimited | 6 | Configurable per event |
| Anti-scalping in model | No | No | Yes (named tickets) | Yes (named tickets) |
| Mobile sharing UX | N/A | N/A | Native share sheet | Native share sheet |

---

## What EventLinqs Should Do Better

1. **Guest join without forced account creation** — DICE requires all Clique members to have DICE accounts, which creates friction for friends who haven't heard of DICE. EventLinqs Squad joining must support guest checkout (email + name only), consistent with the platform's zero-friction philosophy. The Squad leader can see which members are guests vs. logged-in users, and guests receive their ticket via email the same way a standard guest checkout does.

2. **Configurable hold duration per event tier** — DICE fixes the hold at 48 hours. EventLinqs should let organisers configure the Squad hold duration per ticket tier: short hold (4 hours) for high-demand events where inventory is scarce, longer hold (72 hours) for events with abundant inventory. Default to 24 hours.

3. **Full rollback on expiry with automatic Stripe refunds** — DICE's partial-success model is arguably more user-friendly at the individual level (filled members keep tickets), but it means some squads never complete and social coordination fails. EventLinqs should default to all-or-nothing with automatic Stripe refund for paid members if the squad expires unfilled. Organisers can optionally enable "partial success" mode. Clear communication of the rules at squad creation prevents surprises.

4. **Leader extension option** — give the squad leader one extension (another 24 hours) before the expiry triggers the rollback. DICE does not have this. Adding it reduces wasted squads where "almost everyone" paid and one friend just needed more time.

5. **WhatsApp-native sharing for African markets** — DICE uses the native share sheet which includes WhatsApp, but the preview when a link is shared on WhatsApp is generic. EventLinqs must ensure the Squad join link generates a rich WhatsApp preview card: event image, event name, "Alice invited you to join her squad — 3/5 spots filled", CTA. This is critical for the Africa-ready platform mandate.

6. **Organiser visibility into squad pipeline** — Ticketmaster and Eventbrite give organisers no visibility into in-progress group coordination. EventLinqs organiser dashboard should show: number of active squads, total seats held in squads, number of expired/incomplete squads, and conversion rate (squads completed vs. created). This helps organisers understand real demand vs. confirmed demand.
