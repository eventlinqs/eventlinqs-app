# Benchmark: Virtual Queue

## Overview

When a high-demand event goes on sale — Taylor Swift, Beyoncé, Oasis reunion, Coldplay — tens of thousands of buyers hit the event page simultaneously. Without a queue, the fastest internet connection wins, bots hoover up inventory in seconds, and real fans get nothing. A virtual queue puts every buyer in a fair, timestamped line and admits them to checkout in controlled batches. Ticketmaster, DICE, and third-party providers like Queue-it each approach this differently. EventLinqs must implement a queue that is fairer, clearer, and more transparent than all of them.

---

## Ticketmaster — Verified Fan Queue and SafeTix

### Concept

Ticketmaster runs two related but distinct systems for high-demand events:

**Verified Fan Pre-Sale (demand management before sale day):** Launched prominently for the Taylor Swift Eras Tour 2023 US leg, Verified Fan requires buyers to register in advance, provide personal information, and wait to receive a unique access code. Ticketmaster's algorithm selects who receives codes based on fan signals (purchase history, streaming data via Spotify partnership, social engagement). This is less a queue and more a **pre-screening lottery**. Buyers who are not selected never enter the queue at all. The Eras Tour 2023 pre-sale collapsed Ticketmaster's infrastructure despite Verified Fan, resulting in Congressional scrutiny and the Live Nation antitrust proceedings of 2024.

**General On-Sale Queue:** For standard on-sale events without Verified Fan, Ticketmaster uses a virtual waiting room. Buyers who arrive before the sale opens are placed in a lobby. At sale time, they are assigned random queue positions — **not FIFO**. Arriving 30 minutes early gives no advantage over arriving 2 minutes early, as long as you are in the lobby before the randomisation fires.

### Pre-Queue Waiting Room

Ticketmaster's pre-sale waiting room shows:
- A countdown clock to the sale start time
- "You're in the waiting room. You'll be assigned a place in line when the sale begins."
- No position shown until randomisation fires at sale start
- Animated queue graphic (spinning wheel or pulsing dots — no meaningful information conveyed)
- No estimated wait time in the pre-queue state

### Live Queue

Once randomisation fires at sale start:
- Buyer sees: "You are #4,217 in line"
- Estimated wait time shown: "Estimated wait: ~12 minutes"
- Page auto-refreshes every 30–60 seconds
- Buyer must keep the tab open — closing the tab loses the position
- No mobile push notification when it is the buyer's turn — they must be actively watching

### Anti-Bot Protections

Ticketmaster uses several layers:
- **CAPTCHA** at queue entry (reCAPTCHA v3, risk-scored, not always visible)
- **Device fingerprinting** — the same device cannot hold multiple queue positions for the same event
- **Account requirement** — must be signed into a Ticketmaster account to proceed (this is both anti-bot and data collection)
- **SafeTix** — Ticketmaster's proprietary mobile ticket format uses rotating barcodes that refresh every few seconds, making screenshot-based resale impossible after purchase. Not a queue mechanism but part of the overall anti-abuse architecture.

### Admission Batching

Ticketmaster admits buyers in variable-size batches based on server load and checkout completion rate. The algorithm is opaque — there is no public documentation of batch size or admission rate. During the Eras Tour 2023 presale, the system admitted too many buyers simultaneously, causing checkout page failures even after queue admission. This was a catastrophic failure that exposed the batch admission architecture as undertested at scale.

### Token/Session Signing

Ticketmaster uses session tokens to maintain queue position. The token is stored in browser cookies and validated server-side. However, Ticketmaster has a well-documented flaw: if the session cookie is copied to another browser on a different device, the queue position can sometimes be transferred, which creates a secondary market for queue positions. This is a security gap EventLinqs must close.

### Drop-Off Behaviour

Closing the Ticketmaster queue tab forfeits the position entirely with no recovery. There is no grace period, no "resume session" mechanism. This is a known pain point — buyers on mobile who accidentally close Safari lose their place after 30 minutes of waiting. EventLinqs must do better.

### Mobile vs Desktop

Ticketmaster's queue page was not designed mobile-first. Common mobile issues:
- Screen lock causing the tab to lose focus, which can cause the session to become stale
- The auto-refresh mechanism on mobile Safari behaves inconsistently when the browser is backgrounded
- Position number text is small and easy to miss on a crowded mobile screen
- No app-based queue notification — desktop-web parity failure on mobile

---

## DICE — Waiting Room

### Concept

DICE uses a **"Waiting Room"** for high-demand drops, most visibly for events like Glastonbury tickets sold via DICE, DJ Boiler Room events, and limited-capacity club nights. DICE's approach is simpler than Ticketmaster's and deliberately so — it matches their app-native, low-friction philosophy.

### Trigger

DICE events can be marked as "on-sale drops" with a specific time. The DICE app shows a countdown page for the event. When the drop time arrives, all users who have the event open (or who open it within the first minute) are placed in a FIFO queue based on the exact timestamp they joined. **DICE is FIFO, not random** — arriving early genuinely helps. This is fairer and more transparent than Ticketmaster's randomisation model.

### Pre-Queue Experience

- Countdown timer is large, bold, and the dominant element on the event page
- "Set a reminder" option sends a push notification 15 minutes before sale start
- DICE does not show a holding animation or vague messaging — the countdown is the UX

### Live Queue

- Once the sale starts, the buyer sees their position number and an estimated wait time
- The estimated wait time updates as batches are admitted
- DICE's queue page is app-native — built as a native screen, not a web view, so it handles backgrounding gracefully
- When it is the buyer's turn, the app sends a **push notification** and navigates automatically to checkout — the buyer does not need to be watching the screen
- This is the most important UX advantage DICE has: **passive waiting** vs. Ticketmaster's required active watching

### Anti-Bot Protections

- DICE account required — no anonymous queue entries
- 2-ticket maximum per account per event is a hard system limit, reducing the incentive for multi-account bot operations
- Device-level checks (one active queue session per device per event)
- No CAPTCHA shown to users — DICE performs risk scoring silently at account level

### Admission Batching

DICE admits buyers in small, conservative batches — prioritising checkout stability over speed. In practice, DICE's queue moves slower than Ticketmaster's for the same event size, but with far fewer checkout failures. TBD — verify current batch sizes with Playwright MCP visit to dice.fm on next high-demand drop.

### Drop-Off Behaviour

Because DICE's queue is app-native with push notification, drop-off is handled gracefully: the app can be backgrounded and the push will arrive when the buyer's turn comes. Position is preserved for at least 10 minutes after a push is sent — if the buyer does not tap through and begin checkout within 10 minutes, the position is forfeited and the next person is admitted. TBD — verify grace period duration with Playwright MCP.

### Mobile UX

DICE's queue is the strongest mobile queue UX of any platform:
- Full-screen, clean design with position number in 64px bold type
- Estimated wait time updated every 30 seconds
- Screen stays active using wake-lock API (prevents lock screen from interrupting the session)
- Push notification on admission — buyers do not need to watch the screen
- Smooth animated transition from queue page to checkout on admission

---

## Eventbrite — Virtual Queue

**N/A — Eventbrite does not have a virtual queue feature.** Eventbrite's architecture is designed for workshop/conference style events with slower sales patterns. For high-demand on-sale events that would require queueing, Eventbrite is not used — organisers route those events to Ticketmaster, DICE, or AXS. Eventbrite handles sold-out states via their waitlist feature (see waitlist.md) but has no pre-admission queueing mechanism.

This is a structural gap in Eventbrite's product and one reason large-scale live entertainment events do not use Eventbrite.

---

## Third-Party Queue Providers

### Queue-it

Queue-it is a SaaS virtual queue provider used by smaller venues, independent promoters, and some government ticketing systems (e.g., Australian passport renewal appointments used Queue-it for high-demand slots). Queue-it is a third-party overlay — it intercepts traffic to the event page before the ticketing platform's own queue.

- FIFO positioning
- Configurable admission rate (events per second, not per minute)
- Real-time position display with estimated wait
- Token-based session with signed JWT
- Cloudflare integration for edge-level bot protection
- Used by: Hype.co, select Shopify sneaker drops, government services

EventLinqs should not use Queue-it — it adds cost, dependency, and latency. The EventLinqs virtual queue described in M4-ticketing-engine.md must be built natively using PostgreSQL + Redis for the same functionality at lower cost and with full control.

### AXS Queue

AXS (used by UK venues O2 Arena, Wembley Arena, and US venues) runs a queue similar to Ticketmaster's randomised model. AXS requires an account and uses a browser-based waiting room. No significant advantages over Ticketmaster's approach. TBD — verify current AXS queue UX with Playwright MCP visit to axs.com.

---

## Failover and Resilience

### What Happens If the Queue Goes Down

The Eras Tour 2023 failure is the canonical case study: queue infrastructure overloaded, buyers were admitted faster than checkout servers could handle, and the system cascaded. Lessons:

- **Queue and checkout must be independently scalable** — admitting buyers at a rate the checkout system cannot handle is worse than no queue at all
- **Graceful degradation**: if the queue system is unavailable, show a clear "Sale temporarily paused — your place is saved" message rather than an error. Never show a generic 500.
- **Dead man's switch**: if the queue admission cron job fails to fire, buyers should not be silently stuck. A monitoring alert must page the operator and a fallback "manual admit" mechanism must exist.

For EventLinqs M4, queue infrastructure is:
- Redis for position storage (fast atomic increments)
- PostgreSQL `virtual_queue` table as source of truth
- pg_cron for admission batch processing
- Supabase Realtime for position updates to clients

---

## Cross-Platform Comparison

| Feature | Ticketmaster | Eventbrite | DICE | EventLinqs Target |
|---------|-------------|------------|------|-------------------|
| Has virtual queue | Yes | N/A — no queue feature | Yes | Yes |
| Queue assignment | Randomised at sale start | N/A | FIFO (timestamp) | FIFO (timestamp) |
| Position shown to buyer | Yes | N/A | Yes | Yes |
| Estimated wait time | Yes (unreliable) | N/A | Yes | Yes |
| Passive waiting (push on turn) | No — must watch tab | N/A | Yes | Yes |
| Account required | Yes | N/A | Yes | No — guest allowed |
| Anti-bot | CAPTCHA + fingerprint | N/A | Account + device check | IP limit + HMAC + Turnstile (v2) |
| Drop-off grace period | None | N/A | ~10 minutes | Configurable, default 10 min |
| Mobile UX | Poor | N/A | Excellent (app-native) | Excellent (PWA + push) |
| Failover messaging | Generic error (failure) | N/A | Paused state | Explicit "saved" message |
| Batch admission | Variable, opaque | N/A | Conservative, stable | Configurable rate per event |
| Pre-queue reminder | No | N/A | Push reminder (15 min) | Push + email reminder |

---

## What EventLinqs Should Do Better

1. **FIFO, not randomised** — Ticketmaster's randomised model at sale start is opaque, frustrating, and unprovable as fair. DICE's FIFO model is more transparent: arriving early genuinely helps, buyers know the rules, and there is no perception of manipulation. EventLinqs uses FIFO by design. Document this publicly on the queue page: "Position is assigned by arrival time — first in, first served."

2. **Push notification on admission (passive queue)** — this is DICE's single biggest queue advantage over Ticketmaster. Buyers should not need to stare at a screen. EventLinqs queue page must use the Web Push API (for PWA) to send a notification when a buyer's turn arrives. The queue page also uses the Screen Wake Lock API to prevent mobile screens from locking while actively waiting.

3. **HMAC-signed position tokens to prevent position selling** — Ticketmaster's cookie-copyable session flaw creates a secondary market for queue positions. EventLinqs signs each position with an HMAC token tied to the buyer's session ID and IP, making the token non-transferable. Attempting to use a copied token from a different session is rejected with a re-queue prompt.

4. **Transparent admission rate** — show buyers a dynamic message on the queue page: "We are admitting approximately 50 buyers per minute. At your current position (#1,247), your estimated wait is 25 minutes." Recalculate and update every 60 seconds. Ticketmaster shows estimated wait but it is notoriously inaccurate and rarely updates. Accurate, updating estimates dramatically reduce buyer anxiety.

5. **10-minute grace period after admission** — DICE does this; Ticketmaster does not. When a buyer is admitted, they receive a push notification and have a defined window (EventLinqs default: 10 minutes, configurable by organiser) to begin checkout before their admission expires and the next buyer is admitted. This accommodates the buyer who is momentarily busy when their turn arrives, without holding inventory indefinitely.

6. **Organiser-controlled queue parameters** — expose queue configuration in the organiser dashboard at event creation time: enable/disable queue, set admission batch size (e.g., 20 / 50 / 100 per minute), set admission window per buyer (5 / 10 / 15 minutes), set sale start time. These are all inputs to the `admit_queue_batch` RPC and should not require a support ticket to configure. Ticketmaster and DICE both treat queue configuration as platform-controlled — EventLinqs should give this power to organisers with sensible defaults.
