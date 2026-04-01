**EVENTLINQS**

*The World's Smartest Event Platform*

**COMPREHENSIVE SCOPE OF WORK**

**& DEVELOPMENT SPECIFICATION**

Version 5.0 \| March 2026

*CONFIDENTIAL --- For Developer Evaluation Only*

Prepared by EventLinqs --- Melbourne, Australia

**TABLE OF CONTENTS**

*Note: Right-click the Table of Contents in Microsoft Word and select "Update Field" → "Update entire table" to refresh page numbers.*

1\. Executive Summary

1.1 Vision Statement

EventLinqs is a next-generation global event ticketing, discovery, and social experience platform headquartered in Melbourne, Australia. The platform serves event organisers, attendees, and promoters across Australia, the United States, Europe, Africa, and every major market worldwide.

EventLinqs is not another Eventbrite clone. It is engineered to be the world's most intuitive, socially connected, and technologically advanced event platform --- one that makes Ticketmaster feel like legacy software and Eventbrite feel like a basic form builder. Every product decision is made with one question: does this make the experience better for the fan and fairer for the organiser?

1.2 The Platform Philosophy

> *EventLinqs exists to make live experiences more accessible, more social, and more honest. Transparent pricing. Real community. Zero friction. Fan first, always.*

1.3 Competitive Edge --- Why EventLinqs Wins

After extensive analysis of Ticketmaster, Eventbrite, DICE, Humanitix, Partiful, Tix Africa, and 20+ other platforms, the following critical gaps were identified. EventLinqs addresses every single one:

  --------------------------------------- --------------------------------------------------------------------------------------------------------------------------
  **Their Weakness**                      **EventLinqs Strength**

  Hidden fees revealed only at checkout   100% transparent all-in pricing from the first click --- no surprises, ever

  Bots buy tickets before real fans       AI anti-bot protection with purchase velocity limits, device fingerprinting, and virtual queue fairness system

  No human customer support               Real human support combined with AI for instant common queries, with defined SLAs and escalation paths

  Fake and fraudulent events listed       Verified organiser system --- every paid event organiser is identity-checked with tiered trust levels

  No social layer or community features   SmartLinq social discovery --- see who is going, invite friends, buy together

  Generic rigid event pages               Fully branded, organiser-controlled event pages with multi-language support

  Broken or restricted ticket transfers   One-tap ticket transfer between accounts with full QR regeneration

  Organiser payouts take weeks            Automated fast payouts --- daily or weekly settlement, instant payout option

  Crashes during high-demand sales        Serverless architecture with virtual queue, connection pooling, and edge caching built to handle massive concurrent load

  No African market infrastructure        Built from the ground up for low-bandwidth, mobile-money, WhatsApp-native sharing, and African consumers

  No reserved seating for venues          Full reserved seating engine with interactive seat maps, section-level pricing, and accessible seat selection

  No tax or invoicing compliance          Region-aware tax engine with GST, VAT, and sales tax calculation per jurisdiction
  --------------------------------------- --------------------------------------------------------------------------------------------------------------------------

1.4 Target Markets --- Launch Priority

-   Australia --- Primary HQ market (Launch Month 1). Full Stripe integration, GST compliance, AUD settlement.

-   United States --- Largest ticketing market globally (Month 3). State-level sales tax support, USD settlement.

-   Nigeria & West Africa --- Fastest-growing digital event market in Africa (Month 4). Paystack/Flutterwave, mobile money, phone OTP primary auth.

-   United Kingdom & Europe (Month 6). VAT compliance, GBP/EUR settlement, UK GDPR.

-   East Africa, South Africa, Asia-Pacific (Month 9--12). M-Pesa, POPIA compliance, localised payment flows.

1.5 Platform Scope Boundaries --- What This Version Covers

This specification defines Version 1.0 of EventLinqs --- the production-ready platform at launch. The following capabilities are explicitly scoped for future phases and are referenced but not fully specified in this document:

-   Phase 2: Linq Graph visual map, charity donation integration, season tickets and membership products, white-label instances for enterprise promoters

-   Phase 3: Native iOS and Android apps, USSD ticketing flows, advanced BI/data warehouse integrations, corporate invoicing and PO flows

All Phase 1 features in this document are fully specified and must be built as described.

2\. Platform Architecture & Technology Stack

The technology stack has been selected based on 2026 best practices for high-traffic, globally distributed, transactional platforms. Every choice prioritises scalability, developer velocity, cost efficiency, and zero vendor lock-in.

2.1 Recommended Technology Stack

  ---------------------------- ---------------------------------------------------------------------------------------------------------------------------------------------
  **Layer**                    **Technology**

  Frontend Framework           Next.js 15 (App Router, React Server Components, TypeScript strict mode)

  Styling                      Tailwind CSS --- utility-first, responsive, mobile-first by default

  Backend / Database           Supabase --- PostgreSQL with Row-Level Security, Edge Functions, Realtime, connection pooling via PgBouncer

  Cache Layer                  Redis (Upstash or equivalent) for inventory snapshots, session data, rate limiting, and edge caching

  Message Queue                BullMQ (Redis-backed) or AWS SQS for payment webhooks, push fan-out, email/SMS dispatch, and async job processing

  Search                       Meilisearch --- instant, typo-tolerant, faceted search with sub-50ms response times

  File Storage                 Supabase Storage (event images, ticket PDFs, organiser assets) with CDN distribution

  Email Delivery               Resend --- transactional email with React Email templates

  Deployment                   Vercel (frontend) + Supabase Cloud (backend) with global CDN edge delivery

  Serverless Scaling           Vercel Edge Functions for read-heavy paths + AWS Lambda for compute-heavy operations (payment processing, QR generation, report generation)

  Bot Protection               Cloudflare Turnstile (invisible CAPTCHA) + device fingerprinting via FingerprintJS Pro + purchase velocity limits

  Monitoring & Observability   Sentry (error tracking) + PostHog (product analytics) + Logtail or Datadog (centralised log aggregation, metrics, alerting)

  Feature Flags                PostHog Feature Flags or LaunchDarkly for canary rollouts and phased feature releases

  Version Control              GitHub (private repository, CI/CD via GitHub Actions, branch protection, mandatory PR reviews)
  ---------------------------- ---------------------------------------------------------------------------------------------------------------------------------------------

2.2 High-Level Architecture

The platform follows a layered architecture with clear separation of concerns. All business logic flows through defined service modules --- no logic is scattered across edge functions, database triggers, and Lambda without clear ownership.

2.2.1 Architecture Layers

  ------------------- --------------------------------------------------------------------------------------------------------------------- ---------------------------------------------------------------
  **Layer**           **Responsibility**                                                                                                    **Technology**

  Edge Layer          Static assets, CDN, bot protection, rate limiting, geo-routing                                                        Vercel Edge + Cloudflare

  Application Layer   UI rendering, SSR, API routes, form validation                                                                        Next.js 15 App Router

  Service Layer       Business logic modules: Pricing Service, Inventory Service, Payment Service, Notification Service, SmartLinq Engine   TypeScript modules deployed as Vercel Serverless + AWS Lambda

  Data Layer          Persistent storage, real-time subscriptions, row-level security                                                       Supabase PostgreSQL + Redis cache

  Integration Layer   Payment gateways, email/SMS providers, analytics, KYC providers                                                       Webhook handlers + queue-based processing
  ------------------- --------------------------------------------------------------------------------------------------------------------- ---------------------------------------------------------------

2.2.2 Critical Service Boundaries

The following services must be implemented as isolated, testable modules with defined interfaces. No service directly accesses another service's database tables.

-   Single source of truth for all fee calculations. Every checkout, payout, refund, and report calls this service. Reads from pricing_rules table. Never hardcoded.

-   Atomic ticket reservation and release. Handles cart holds, oversell prevention, waitlist promotion, and capacity tracking. Uses PostgreSQL advisory locks or serialisable transactions for concurrency safety.

-   Manages multi-gateway routing, payment state machine, webhook reconciliation, refund processing, and payout calculations. All payment state transitions are idempotent.

-   Fan-out engine for push, email, SMS, and in-app notifications. Queue-based with rate limiting per organiser and per user. Handles preference management and quiet hours.

-   Recommendation and discovery service. Reads event, attendance, and social graph data. Returns ranked recommendations with latency SLA of \<200ms p95.

-   Authentication, session management, KYC verification, and role-based access control via Supabase Auth.

2.3 Serverless Architecture for Traffic Spikes

> *CRITICAL REQUIREMENT: When a major event goes on sale and thousands of fans hit the platform simultaneously, the system must not crash or degrade. This is non-negotiable. The developer must implement serverless scaling with a virtual queue system, connection pooling, edge caching, and pre-computed inventory snapshots so that the platform auto-scales to handle massive concurrent load with zero downtime. This is the single most important infrastructure requirement in this document.*

2.3.1 Virtual Queue System

For high-demand on-sales (events marked as "high-demand" by the organiser or auto-detected based on interest signals), the platform activates a virtual queue:

-   Arriving users are placed in a first-come, first-served queue with a real-time position indicator and estimated wait time.

-   Users are admitted to the checkout flow in controlled batches to prevent inventory race conditions.

-   Queue position is cryptographically signed to prevent manipulation.

-   The queue page is served from the edge with minimal backend load.

-   Bot detection runs during queue entry: Cloudflare Turnstile challenge + device fingerprint + behavioural analysis.

2.3.2 Inventory Concurrency Model

Overselling is a platform-ending failure. The following concurrency model is mandatory:

-   Ticket reservation uses PostgreSQL advisory locks with SELECT \... FOR UPDATE SKIP LOCKED on the inventory row.

-   Each reservation creates a reservation row with a 10-minute TTL (configurable per event in admin). A background worker releases expired reservations every 30 seconds.

-   Purchase finalisation is idempotent: the same reservation_id processed twice produces the same result with no duplicate charges or tickets.

-   Inventory counts are pre-computed into Redis every 5 seconds for display purposes (social proof badges, "Selling Fast" indicators). The database remains the source of truth for actual reservation.

-   Group bookings and squad bookings hold inventory atomically --- all seats in the group are reserved or none are.

2.4 Payment Gateway Architecture

EventLinqs implements a region-aware, multi-gateway payment system that automatically presents the most relevant payment options based on the buyer's location. This is critical for global reach and conversion optimisation.

2.4.1 Gateway Routing Rules

  ------------------- --------------------- -------------------------- -----------------------------------------------------
  **Region**          **Primary Gateway**   **Fallback Gateway**       **Payment Methods**

  Australia           Stripe                PayPal                     Card, Apple Pay, Google Pay

  United States       Stripe                PayPal                     Card, Apple Pay, Google Pay

  Europe & UK         Stripe                PayPal                     Card, Apple Pay, Google Pay, SEPA (where supported)

  Nigeria             Paystack              Flutterwave                Card, bank transfer, USSD, mobile money

  Other West Africa   Flutterwave           Paystack                   Card, mobile money, bank transfer

  East Africa         Flutterwave           Stripe (where available)   Card, M-Pesa, mobile money

  Global fallback     PayPal                ---                        PayPal balance, card via PayPal
  ------------------- --------------------- -------------------------- -----------------------------------------------------

2.4.2 Gateway Detection Logic

-   Primary detection: IP geolocation via Cloudflare headers (CF-IPCountry).

-   Secondary signal: browser locale and Accept-Language header.

-   VPN/mismatch handling: if IP country and browser locale conflict, present the IP-based gateway with a manual country selector fallback. Never block a purchase due to geo mismatch.

-   Organiser preference: organisers can set a preferred gateway for their events. Platform routing rules apply as override only when the preferred gateway does not support the buyer's region.

2.4.3 Payment State Machine

Every payment follows a strict state machine. No payment can skip states or transition illegally.

  ------------------ --------------------------------------- ------------------------------------
  **State**          **Description**                         **Valid Transitions**

  INITIATED          Checkout started, inventory reserved    PROCESSING, EXPIRED, CANCELLED

  PROCESSING         Payment submitted to gateway            COMPLETED, FAILED, REQUIRES_ACTION

  REQUIRES_ACTION    3DS or additional auth required         COMPLETED, FAILED, EXPIRED

  COMPLETED          Payment confirmed by gateway webhook    REFUND_PENDING

  FAILED             Gateway declined or error               INITIATED (retry)

  EXPIRED            Cart timer exceeded                     (terminal --- inventory released)

  CANCELLED          User cancelled checkout                 (terminal --- inventory released)

  REFUND_PENDING     Refund requested, awaiting processing   REFUNDED, REFUND_FAILED

  REFUNDED           Refund confirmed by gateway             (terminal)

  REFUND_FAILED      Refund processing error                 REFUND_PENDING (retry)
  ------------------ --------------------------------------- ------------------------------------

2.4.4 Gateway Failover

-   If the primary gateway returns a 5xx error or times out (\>15 seconds), the system automatically retries once, then offers the fallback gateway to the buyer.

-   Circuit breaker pattern: if a gateway fails 3+ times in 60 seconds, route all new transactions to the fallback gateway for 5 minutes before retesting.

-   All gateway failures are logged with full context and trigger an alert to the ops team.

2.4.5 Multi-Currency & FX

-   Prices are stored in the organiser's settlement currency. Display prices are converted to the buyer's local currency at checkout using real-time exchange rates from the payment gateway.

-   FX rate is locked at the moment of payment initiation and displayed to the buyer before confirmation.

-   EventLinqs does not capture an FX spread in V1. FX conversion costs are passed through from the payment gateway at their published rates.

-   Organisers receive payouts in their registered settlement currency: AUD, USD, GBP, EUR, NGN, KES, ZAR, or GHS.

2.5 Caching Strategy

  ---------------------------- ------------------------- ------------------------ --------------------------------------------------
  **Data Type**                **Cache Layer**           **TTL**                  **Invalidation**

  Event page content           Vercel Edge Cache (ISR)   60 seconds               On-demand revalidation on event update

  Inventory counts (display)   Redis                     5 seconds                Background worker refresh

  Search index                 Meilisearch               Near real-time           Webhook on event create/update/delete

  User session                 Supabase Auth + Redis     7 days (refresh token)   On logout, password change, or device revocation

  Pricing rules                Redis                     5 minutes                Cache bust on admin update

  SmartLinq recommendations    Redis                     15 minutes per user      Invalidate on new purchase or follow action
  ---------------------------- ------------------------- ------------------------ --------------------------------------------------

2.6 Observability & SLOs

2.6.1 Monitoring Stack

-   Error tracking: Sentry with source maps, breadcrumbs, and release tracking. Alert on error rate \>1% over 5 minutes.

-   Centralised logging: Logtail or Datadog. All API requests, payment events, and admin actions logged with structured JSON.

-   Product analytics: PostHog for user behaviour, funnel analysis, feature flag targeting, and A/B testing.

-   Uptime monitoring: External synthetic checks every 60 seconds on critical paths (homepage, checkout, scanner).

-   Payment monitoring: Dedicated dashboard tracking payment success rate, average processing time, and gateway-specific failure rates.

2.6.2 Service Level Objectives

  -------------------------------- ------------------------------------------------------ -------------------------------
  **Metric**                       **Target**                                             **Measurement**

  Platform uptime                  99.9% (8.7 hours max downtime per year)                External synthetic monitoring

  API response time (p95)          \<500ms for read endpoints, \<2s for write endpoints   Server-side instrumentation

  Checkout completion time (p95)   \<8 seconds end-to-end                                 Real User Monitoring

  Search response time (p95)       \<100ms                                                Meilisearch metrics

  Payment success rate             \>98% (excluding user-initiated cancellations)         Gateway webhook analysis

  QR scan validation time          \<1 second                                             Scanner instrumentation

  Push notification delivery       \>95% within 60 seconds of trigger                     Push provider analytics
  -------------------------------- ------------------------------------------------------ -------------------------------

2.7 Environments & Release Management

-   Local development with Supabase CLI and Docker. Feature branches deploy to preview URLs via Vercel.

-   Full replica of production with test payment gateways (Stripe test mode, Paystack sandbox). All PRs must pass CI (lint, type check, unit tests, integration tests) before merge.

-   Blue-green deployment via Vercel. Database migrations run via automated scripts with rollback capability.

-   All new features ship behind feature flags. High-risk changes (checkout, payments, scanner) use canary rollouts: 5% → 25% → 50% → 100% with automatic rollback on error rate spike.

-   PagerDuty or Opsgenie integration. Severity levels: P1 (checkout/payments down --- 15-minute response), P2 (degraded performance --- 1-hour response), P3 (non-critical --- next business day).

3\. Core Platform Features --- Complete Module Specification

Every feature below is included in the build scope. Nothing is optional. This represents the complete, production-ready platform. No feature is to be built twice --- each function handles its full use case cleanly with no duplication.

3.1 Event Creation & Management

3.1.1 Event Builder

A powerful yet intuitive event creation experience that makes organisers feel like they are building something beautiful, not filling out a government form.

-   Rich event editor: title, description (rich text with media embeds including video reels), cover images with auto-crop and resize.

-   Location: physical venue with Google Maps integration and embedded map preview, OR virtual event with streaming link integration.

-   Date & time: single events, multi-day events, recurring events (daily, weekly, monthly, custom). Timezone-aware with automatic conversion for attendees.

-   Event categories: Music, Sports, Arts & Culture, Food & Drink, Business & Networking, Education, Charity, Nightlife, Family, Technology, Religion, Fashion, Health & Wellness, Community, Other. Subcategories available per region (e.g., Afrobeats, Amapiano under Music for African markets).

-   Event visibility: Public (fully discoverable), Private (invite-only with shareable link), Unlisted (link-only, not discoverable in search).

-   Draft and publish workflow: save drafts, preview, schedule publication date.

-   Event duplication: one-click clone for recurring or similar events.

-   Multi-language event pages with auto-detect or manual selection.

-   Age restriction flag: organisers can mark events as 18+ or all-ages. Age-restricted events display a clear notice on the event page and at checkout.

3.1.2 Event Lifecycle Management

Events go through defined lifecycle states. Each state transition triggers specific actions.

  ------------- ---------------------------------------------------------------------- --------------------------------------------------------
  **State**     **Description**                                                        **Allowed Transitions**

  DRAFT         Event created but not published                                        SCHEDULED, PUBLISHED, DELETED

  SCHEDULED     Set to auto-publish at a future date/time                              PUBLISHED, DRAFT, DELETED

  PUBLISHED     Live and discoverable, tickets on sale                                 PAUSED, POSTPONED, CANCELLED, COMPLETED

  PAUSED        Temporarily hidden, sales suspended                                    PUBLISHED, CANCELLED

  POSTPONED     Date changed, all ticket holders notified, tickets remain valid        PUBLISHED (new date), CANCELLED

  CANCELLED     Event cancelled, all ticket holders auto-refunded, notification sent   (terminal)

  COMPLETED     Event date has passed                                                  (terminal --- analytics and reviews remain accessible)
  ------------- ---------------------------------------------------------------------- --------------------------------------------------------

3.1.3 Postponement & Cancellation Flows

-   Postponement: organiser selects new date(s). All ticket holders receive push notification, email, and SMS (if opted in). Tickets remain valid for the new date. Attendees who cannot attend the new date may request a refund within a configurable grace period (default: 14 days from postponement announcement).

-   Venue change: same notification flow as postponement. Organiser must provide reason. Refund grace period applies.

-   Line-up change: notification sent to all attendees. No automatic refund right unless the headliner changes (configurable by organiser).

-   Cancellation: all tickets auto-refunded to original payment method. If the original payment method is unavailable, credit is issued to the user's EventLinqs wallet. Organiser payout is clawed back or held.

-   Force majeure: admin can trigger a force majeure cancellation that follows the same refund flow but flags the event for insurance and compliance reporting.

3.1.4 Ticketing Engine

-   Unlimited ticket tiers per event: General Admission, VIP, VVIP, Early Bird, Group, Student, Table or Booth, Donation-based (pay what you want).

-   Ticket scheduling: early bird windows open and close automatically by date. Tier auto-transitions (e.g., Early Bird → Regular → Last Chance).

-   Capacity management: per-tier and total event capacity with real-time inventory tracking and social proof badges (Selling Fast, Almost Sold Out).

-   Waitlist: when sold out, attendees join waitlist and are automatically notified if tickets become available due to cancellations or transfers. Waitlist position is visible to the user.

-   Ticket transfer: attendees can transfer tickets to another person's account. Original QR is deactivated and a new unique QR is generated for the recipient. Transfer history is logged.

-   Free events: zero platform fees. No charges to organisers or attendees for free events, unconditionally.

-   Add-ons (Phase 1): organisers can create optional paid add-ons attached to any ticket tier --- parking, merchandise pre-orders, drink packages, cloakroom, shuttle, VIP upgrades. Each add-on has its own name, description, price, and capacity.

-   Table/booth inventory: tables have a capacity (e.g., 10 seats), optional minimum spend, and can be assigned to specific locations on the venue map.

3.1.5 Reserved Seating Engine

For venues with assigned seating (theatres, arenas, stadiums), EventLinqs provides a full seat selection experience.

-   Seat map builder (admin/organiser tool): upload or build a venue map with sections, rows, and individual seats. Maps are reusable across events at the same venue.

-   Seat categories: each section or row can be assigned a pricing tier. Individual seats can be flagged as accessible, restricted view, premium, or companion.

-   Interactive seat selection: buyers see available and taken seats in real-time. Selected seats are held for the duration of the cart timer (10 minutes default).

-   Seat holds: organisers can hold specific seats for VIPs, sponsors, or media. Held seats do not appear as available to the public.

-   Best available: buyers who prefer not to pick seats manually can click "Best Available" and the system assigns optimal seats based on section preference and group size.

-   Accessible seating: clearly marked on the map with wheelchair icon. Accessible seats include companion seat auto-selection. Only available to buyers who self-identify as requiring accessible seating (no verification required --- trust-based per Australian and US disability law).

-   Anti-hoarding: if a buyer selects seats but does not complete checkout within the cart timer, seats are automatically released.

-   Seat-level dynamic pricing: different pricing per section is standard. Per-seat dynamic pricing (where individual seat price varies by demand) is Phase 2.

3.2 Group & Social Ticketing

> *One unified ticketing system handles all group scenarios --- whether buying for yourself, buying multiple tickets for friends, or purchasing in bulk for a large group. No separate modes. No duplicate flows. The same checkout handles everything cleanly.*

-   Any buyer can purchase any quantity of tickets in a single transaction --- 1 ticket or 50 tickets, same flow, same checkout.

-   Squad Booking: a buyer starts a group, shares a link via WhatsApp or SMS, each person in the group selects their ticket and pays their own share independently. The group leader sees real-time status of who has paid. Tickets are issued individually once all members complete payment.

-   squad remains open for a configurable period (default: 24 hours). If not all members have paid by the deadline, the squad leader is notified and can either extend the deadline (once, for an additional 24 hours) or release unpaid seats. If the event sells out while squad seats are held, the hold is maintained until the timeout expires.

-   the organiser can see the total squad size and payment status but cannot see individual squad member names or personal details unless the event requires attendee names at checkout.

-   Group organiser option: one buyer purchases all tickets for a group and assigns names and emails to each ticket. Each attendee receives their own QR code. Ideal for anyone coordinating a group outing.

-   Social proof on group checkout: real-time counter showing how many people are in the squad and who has confirmed.

-   No separate corporate product. Any buyer purchasing in bulk uses the same group flow above --- simple, clean, no duplication.

3.3 Dynamic Pricing

Organisers can enable demand-based automatic pricing on any ticket tier. This is a revenue optimisation tool that rewards early buyers and captures more value when demand is high.

-   Organiser sets a minimum price, a maximum price, and a demand threshold (percentage of capacity sold) that triggers each price step.

-   stepwise pricing. Price increases occur at defined capacity thresholds (e.g., 0--25% capacity = \$30, 25--50% = \$40, 50--75% = \$50, 75--100% = \$60). This is not continuous real-time fluctuation --- it is predictable, transparent step changes.

-   Price is always shown transparently to buyers --- no hidden changes mid-checkout. Once a buyer enters checkout, the price is locked for the duration of their cart hold.

-   the price is determined at the moment of inventory reservation (not page load). If the capacity threshold is crossed while a buyer is browsing, the buyer sees the updated price when they click "Buy." If they have already entered checkout, their locked price is honoured.

-   Early bird pricing remains available as a manual tier option for organisers who prefer fixed early pricing over dynamic pricing.

-   Price history visible on event page so buyers can see how pricing has moved --- reinforcing transparency.

3.4 Social & Community Features

This is the core competitive advantage. No competitor has a genuine social layer. EventLinqs makes events a social experience from discovery through to post-event. This is the primary viral acquisition engine for the platform.

3.4.1 Who's Going & Social Proof

-   "Who's Going" feed: attendees can see which friends and contacts are attending an event (privacy-controlled per user --- opt-in to appear on Who's Going, default: on).

-   Social proof counters on every event page: number of people interested, number confirmed going, number of mutual connections attending.

-   Real-time activity notifications on event pages: "Sarah just bought 3 tickets" or "47 people are viewing this right now" or "Only 12 tickets left." Configurable per organiser (on/off toggle). Activity counts are sampled and aggregated (not raw real-time per-user fan-out) to control Supabase Realtime costs at scale.

-   Friend invitation cards: "I'm going to this --- come with me!" shareable cards with personalised invite links that track who joined through each invite.

3.4.2 Event Activity Feed

-   Each event has a live activity feed: organiser announcements, attendee comments, hype moments, countdowns.

-   Post-event: attendees can share photos, rate the event, and leave reviews visible on the event and organiser page.

-   Organiser can pin announcements (parking updates, set time changes, surprise guests).

-   Content moderation: automated profanity filter on user-generated content. Organiser can hide or report comments. Platform admin can remove content and suspend users for violations.

3.4.3 Follow & Discover

-   Follow organisers: get notified when they create new events.

-   Follow friends: see what events your connections are interested in attending.

-   Interest and behaviour-based recommendations: based on events attended, searches made, and Linq connections.

3.5 SmartLinq AI Engine

> *The SmartLinq AI Engine is EventLinqs' proprietary competitive moat. No competitor has anything like it. It creates weighted intelligent connections between artists, venues, events, and audiences --- and gets smarter with every interaction on the platform.*

3.5.1 Core Concept

-   Every artist performance at a venue creates a Linq --- a weighted connection that records who performed, where, when, and how the event performed (tickets sold, attendance rate, revenue, ratings).

-   The engine learns from this data to surface: recommended venues for artists, recommended artists for venue programmers, and "People who attended this also loved" recommendations for attendees.

-   AI-powered suggestions surface in the admin panel: "Would you like to link Artist X with Venue Y based on 3 past events?"

-   Discovery feed powered by Linq connections: the more events on the platform, the smarter and more personalised every recommendation becomes.

-   Smart genre and audience clustering: the engine identifies patterns in who attends what, enabling organisers to target the right audience for each event type.

-   Linq Graph View (Phase 2): a visual map of all connections between artists, venues, and events --- a unique tool no competitor offers.

3.5.2 Technical Specification

SmartLinq is implemented in PostgreSQL with optional future migration to a dedicated graph database (Neo4j) when the data volume justifies it.

3.5.2.1 Data Schema

-   artist, venue, event, user, genre, city

-   source_entity_type, source_entity_id, target_entity_type, target_entity_id, linq_type (performed_at, attended, similar_to, recommended_for), weight (float 0--1), created_at, last_updated, metadata (JSONB --- stores event performance data)

-   ticket sell-through rate (0.3 weight), attendee rating (0.2), repeat attendance (0.2), social shares from event (0.15), revenue per capacity (0.15). Weights are configurable in admin.

3.5.2.2 Recommendation Algorithm

-   collaborative filtering based on co-attendance patterns + content-based filtering on genre/category/location preferences. Results are blended 60/40 collaborative/content.

-   artist-venue affinity scoring based on linq weights. Top-N recommendations with explanation ("Artist X performed 3 times at similar venues with 95% sell-through").

-   recommendations are ranked by predicted relevance score. Diversity injection ensures no single genre or organiser dominates the feed (max 3 consecutive events from same organiser).

3.5.2.3 Cold Start Strategy

-   recommendations fall back to trending events (ticket velocity), editorial picks, and geo-proximity until sufficient local data accumulates (threshold: 50+ events with 100+ total attendees in the city).

-   onboarding flow asks for 3--5 interest preferences (genre, event type, price range). Initial recommendations use content-based filtering only. Switches to blended model after 3+ attended events.

-   no recommendations shown until their first event completes. Artist suggestions are based on genre and city match.

3.5.2.4 Quality & Safety

-   Feedback loop prevention: recommendations are A/B tested with a 10% exploration cohort that receives diversified results to prevent echo chambers.

-   Spam prevention: events with abnormally high "interested" counts relative to actual purchases are deprioritised. Organisers who repeatedly create low-quality events (high refund rates, low ratings) have their events' recommendation weight reduced.

-   Evaluation: offline metrics (precision@10, recall@10, NDCG) computed weekly on holdout data. Online metrics: click-through rate on recommendations, conversion rate from recommendation to purchase.

-   Latency SLA: recommendations must return within 200ms p95. Pre-computed recommendation sets are cached in Redis per user, refreshed every 15 minutes.

3.6 Gamification & Loyalty

Gamification builds habit and retention that pure utility cannot achieve. These features turn occasional ticket buyers into daily active users who check the platform habitually.

-   Loyalty points: earned for every ticket purchased, event attended, review left, and friend referred. Points are redeemable for discounts on future tickets. Points have no cash value and expire 12 months after earning.

-   Attendance badges: awarded automatically for milestones such as first event, tenth event, attending events across multiple cities, or attending a sold-out show.

-   Referral rewards: unique referral links for every user. When a friend buys a ticket through the link, the referrer earns points or a direct discount credit.

-   Organiser leaderboards: publicly ranked organisers by events hosted, tickets sold, and attendee ratings --- drives competition and quality.

-   a branded EventLinqs credit currency earned through the affiliate and influencer programme. Creators receive Backstage Credits when their followers buy tickets through their link. Credits are redeemable for free tickets, upgrades, and exclusive experiences. More sticky than cash commission and builds deep loyalty to the platform.

3.7 Payment & Checkout

3.7.1 Checkout Experience

-   One-page checkout: ticket selection → attendee details → payment → confirmation. No redirects, no page reloads.

-   Express checkout: Apple Pay and Google Pay one-tap for returning users.

-   Cart timer: 10-minute hold on selected tickets during checkout to prevent overselling during high-demand events. Timer is visible to the buyer. Timer duration is configurable per event in admin (range: 5--20 minutes).

-   Transparent all-in pricing: the final total including all fees is shown on the event page before the buyer clicks purchase. No fee reveals at the last step. Ever.

-   Multi-currency: auto-detect buyer currency, display prices in local currency, organiser receives in their settlement currency. FX rate shown at checkout.

-   Discount codes: percentage-based, fixed amount, limited-use, time-limited, or tier-specific. Organisers create unlimited codes.

-   Guest checkout: buyers can purchase without creating an account. Account creation is prompted post-purchase, not required to complete it.

3.7.2 Organiser Payouts

-   Automated payouts: daily or weekly settlement to organiser's bank account, configurable by the organiser.

-   Instant payout option: organiser requests immediate payout for a small premium fee (configurable in admin, starting point: 1.5% of payout amount).

-   Payout dashboard: full transaction history, fee breakdowns, upcoming payouts, and tax summaries.

-   Multi-currency settlement: organisers receive payouts in their local currency --- AUD, USD, GBP, EUR, NGN, KES, ZAR, or GHS.

-   for new or unverified organisers, payouts are held for 7 days post-event (configurable by admin). For verified organisers with clean history, payouts process on schedule.

-   admin can set a rolling reserve percentage (default: 0%) for organisers in higher-risk tiers. The reserve is released 30 days after the event.

-   if refunds or chargebacks exceed the organiser's available balance, the account enters a negative balance state. Future payouts are withheld until the balance is recovered. Admin is alerted immediately.

3.7.3 Refunds & Cancellations

-   Organiser-defined refund policy: full refund, partial refund, no refund, or time-based (e.g., full refund up to 7 days before event). Policy is displayed at checkout and on the ticket.

-   Automated refund processing: attendee requests trigger a policy check, then auto-approve or flag for organiser review.

-   Event cancellation: organiser cancels → all attendees auto-refunded to original payment method → notification sent → optional credit to EventLinqs wallet.

-   \(1\) organiser's available balance, (2) upcoming payout deduction, (3) gateway partial reversal. If all sources are exhausted, the platform floats the refund and recovers from the organiser's future earnings.

3.7.4 Chargebacks & Disputes

Chargebacks are inevitable on any payment platform. EventLinqs handles them proactively rather than reactively.

-   when a gateway notifies of a chargeback, the system automatically compiles evidence: purchase confirmation email, IP address, device fingerprint, ticket scan history (if used), refund policy acceptance, and attendee details. This pack is submitted to the gateway's dispute API automatically.

-   organisers are notified of chargebacks on their events with full context. The chargeback amount is deducted from the organiser's next payout.

-   purchases are scored at checkout based on: card BIN risk (via gateway), device fingerprint reputation, purchase velocity (\>5 tickets in 60 seconds = flag), IP risk score, and email domain reputation. High-risk purchases are flagged for manual review before ticket issuance.

-   admin assigns organisers to risk tiers (Standard, Elevated, High) based on chargeback rate and refund rate. Higher tiers trigger larger rolling reserves and payout holds.

3.8 Built-In Resale Market

Rather than losing users to StubHub, Viagogo, or other third-party resale sites, EventLinqs keeps all resale activity on-platform. This eliminates scalping, generates additional platform revenue, and keeps buyers and sellers within the EventLinqs ecosystem.

-   Attendees can list their ticket for resale directly from their account dashboard.

-   Resale price is capped at a maximum set by the organiser at event creation (e.g., 110% of face value). No scalping above this cap is permitted.

-   Platform charges a resale fee (configurable in admin panel, starting point: 5% split between buyer and seller) on all secondary sales.

-   Original QR is invalidated when a ticket is listed for resale. New QR issued to the buyer on completion of the resale transaction.

-   Organiser can disable resale entirely for their event if they choose.

-   organisers can optionally receive a percentage of the resale fee (configurable, default: 0%). This incentivises organisers to enable resale.

-   a ticket can be resold a maximum of 2 times (configurable per event). Each resale generates a new QR and a new ownership record in the audit trail.

-   resale listings are automatically closed 2 hours before the event start time (configurable by organiser, minimum: 1 hour).

-   if an event is postponed, active resale listings are automatically suspended. Sellers are notified and can re-list for the new date or cancel the listing and keep their ticket.

-   if the original purchase is charged back after a resale has completed, the original seller's payout is clawed back. The resale buyer's ticket remains valid --- the platform absorbs the loss and pursues recovery from the original buyer.

3.9 User Management & Authentication

3.9.1 User Roles

-   discover events, buy tickets, manage bookings, follow organisers, group bookings, social features, loyalty rewards.

-   create and manage events, sell tickets, analytics, payouts, marketing tools. Sub-roles: Owner (full access), Manager (event management, no financial settings), Staff (door scanner only), Marketing (campaigns and promo codes only).

-   full platform management, moderation, financial oversight, support, and all configuration. Admin roles: Super Admin (all access), Finance (payouts, fees, reports), Support (tickets, disputes, user management), Content (moderation, featured events).

3.9.2 Authentication

-   Email and password with strong password requirements (min 10 characters, complexity check via zxcvbn or equivalent).

-   Social login: Google, Apple, Facebook via Supabase Auth OAuth2.

-   Phone number login with OTP --- critical for African markets where email is secondary.

-   Magic link passwordless email login.

-   Two-factor authentication (TOTP) for organiser accounts --- mandatory for Owner role, optional for others.

-   sessions expire after 30 days of inactivity. Password changes invalidate all existing sessions across all devices. Organisers can view and revoke active sessions from their settings.

3.9.3 Organiser Verification (KYC)

-   Identity verification: government ID upload plus selfie match via Stripe Identity or Sumsub.

-   Business verification: ABN (Australia), EIN (US), CAC (Nigeria), Companies House number (UK), or equivalent per jurisdiction.

-   Verified badge on organiser profile once approved.

-   Tiered limits: unverified organisers limited to 100 tickets per event and \$5,000 total sales before verification is required. Verified organisers: unlimited.

3.10 Event Discovery & Search

-   Homepage feed: personalised event recommendations powered by the SmartLinq AI Engine based on location, past attendance, interests, and social connections.

-   Search with instant results via Meilisearch: type-ahead, typo-tolerant, faceted filtering by location, date range, price range, category, and event type.

-   Map view: see all events near the user on an interactive map with clustering.

-   Curated collections: "This Weekend in Melbourne," "Top Free Events in Lagos," "Festivals Near You." Admin-managed and algorithm-assisted.

-   Trending events: algorithm-driven based on ticket velocity, social shares, and engagement rate.

-   Explore page: browsable by city, category, date, and price with rich visual cards.

-   events with abnormally inflated interest counts, duplicate listings, or SEO-bait titles are automatically deprioritised. Sponsored/featured events are clearly labelled as "Sponsored" --- no deceptive mixing with organic results.

3.11 Virtual & Hybrid Events

Virtual and hybrid events are making a strong comeback in 2026. EventLinqs must support them fully from day one, not as an afterthought.

-   Virtual-only events: organisers add a streaming link (YouTube Live, Zoom, StreamYard, or custom RTMP). Link is only revealed to ticket holders after purchase.

-   Hybrid events: separate ticket tiers for in-person attendance and livestream-only access, each with independent pricing and capacity.

-   Geo-based access restrictions: organisers can restrict livestream tickets to specific countries or regions.

-   Virtual attendee experience: chat, Q&A, and reaction features accessible to livestream ticket holders during the event.

3.12 E-Ticketing & QR Code System

-   Digital tickets: unique QR code per ticket, stored in the user's account and accessible via web browser --- no app download required.

-   QR validation: cryptographically signed using HMAC-SHA256. Single-scan-only (prevents screenshot sharing). Displays attendee name and ticket type on scan.

-   QR codes refresh every 30 seconds using a time-based token (TOTP-like scheme). The QR payload includes: ticket_id, timestamp, HMAC signature. The scanner validates the signature and checks that the timestamp is within the current 30-second window.

-   before the event, the scanner app downloads and caches a validation dataset: all ticket IDs, their current status (valid/transferred/refunded), and the HMAC secret for that event. Offline validation checks the ticket_id against the cached set and validates the HMAC. Validated scans are queued locally and synced when connectivity returns. Conflict resolution: if two scanners validate the same ticket offline, the first sync wins and the second is flagged for manual review.

-   each event has a unique signing key generated at event creation and stored in the platform's key management system (AWS KMS or Supabase Vault). Keys are rotated if compromised. Scanner devices receive the key via an authenticated, encrypted channel only.

-   Anti-screenshot overlay on ticket view: semi-transparent animated watermark with the attendee's name that cannot be easily cropped or edited.

-   PDF ticket download: professionally designed ticket with event branding, attendee name, QR code, and all event details.

-   Apple Wallet and Google Wallet integration: add ticket directly to phone wallet.

-   Email confirmation: ticket sent immediately after purchase with QR code, event details, and calendar invite (.ics attachment).

3.13 Event Day --- Check-In & Door Management

-   Web-based scanner: organiser or staff opens scanner in any phone browser. No app download needed. Uses device camera to scan QR codes.

-   Scan feedback: green checkmark (valid), red X (already used or invalid), yellow warning (VIP or special handling). Audio feedback for noisy venues.

-   Guest list view: searchable list of all ticket holders with real-time check-in status. Manual check-in by name search for lost phone situations.

-   Real-time attendance dashboard: live check-in count, check-in rate, peak arrival time, and capacity utilisation.

-   Multi-scanner support: multiple staff scanning simultaneously, synchronised in real-time via Supabase Realtime.

-   scanner caches the full guest list and validation keys locally before the event. Supports up to 50,000 tickets in the local cache. Scans are queued offline and synced when connectivity returns. Cache is valid for 24 hours from download. Critical for outdoor events and venues with poor signal.

-   staff can sell tickets at the door via the scanner interface using card payment (Stripe Terminal or payment link). Walk-up sales are logged in real-time inventory and analytics. Cash handling is not supported in V1 --- card-only at door.

3.14 Marketing & Promotion Tools

3.14.1 Organiser Marketing Tools

-   Email campaigns: organiser emails all ticket holders or segmented lists (confirmed attendees, interested, past event attendees) via Resend.

-   SMS campaigns: send SMS reminders or announcements to opt-in attendees --- especially important in African markets.

-   Social sharing tools: auto-generated Open Graph images, one-click share to Facebook, Instagram, WhatsApp, Twitter/X, LinkedIn, and Snapchat. WhatsApp deep links for African markets.

-   Embeddable widget: organiser embeds a ticket purchase widget directly on their own website or social link-in-bio.

-   Affiliate and referral programme: generate unique tracking links for influencers or promoters with configurable commission (flat fee, percentage, or Backstage Credits).

-   last-click attribution with a 7-day cookie window (configurable by organiser). If a refund or chargeback occurs, the affiliate commission is reversed.

-   affiliates earning above the tax threshold (\$600 USD / equivalent) are prompted to submit tax information. Platform generates 1099 (US) or equivalent reporting.

-   Discount and promo code engine: unlimited codes with percentage or fixed amounts, usage limits, date ranges, and tier-specific targeting.

-   Organiser onboarding wizard: guided step-by-step setup for first-time organisers to create their first event --- reduces abandonment at the most critical conversion point in the organiser funnel.

3.14.2 Platform-Level Growth Features

-   web push and mobile push notifications for ticket sales, friend RSVPs, event reminders, price drops, and personalised event recommendations. Push is the primary driver of repeat ticket purchases --- not email.

-   max 3 push notifications per user per day (configurable in admin). Max 2 promotional pushes per organiser per event per week. Users can opt out by channel (push, email, SMS) and by topic (event updates, recommendations, social, marketing). Quiet hours: no push between 10pm and 8am local time (configurable by user). Compliance: all push includes unsubscribe mechanism per GDPR and CAN-SPAM.

-   SEO-optimised event pages: every event page is fully indexable by Google with Schema.org Event structured data markup, Open Graph tags, Twitter Card meta, clean canonical URLs, and auto-generated sitemaps.

-   Attendee-to-organiser conversion prompt: immediately after a successful ticket purchase, the attendee sees a prompt --- "Want to host your own event? It's free to get started."

-   installable on any smartphone home screen, with offline access to purchased tickets, background sync, and full push notification support. Service worker caches critical assets for \<3 second load on 3G connections. Critical for the African market.

-   Social proof notifications: real-time purchase activity on event pages creates urgency. Configurable per organiser.

-   AI-powered chatbot: handles common attendee queries instantly (ticket status, event details, refund policy) and routes complex issues to human support.

3.15 Sustainability

By 2026, sustainability is a core expectation from attendees, not a nice-to-have.

-   Carbon-neutral ticketing badge: all digital tickets carry a "Paperless Event" badge by default.

-   Charity integration (Phase 2): organisers can optionally donate a portion of ticket revenue to a nominated charity. Displayed on the event page.

-   Sustainability event category: dedicated filter for events with eco-friendly or community-benefit credentials.

3.16 Accessibility & Inclusivity

-   WCAG 2.1 AA compliance across all public-facing pages --- screen reader support, keyboard navigation, sufficient colour contrast.

-   Accessible ticket purchasing: no flow relies solely on colour or visual cues to communicate status.

-   Accessible seating selection: in the reserved seating engine, accessible seats are clearly marked and bookable with companion seat auto-selection.

-   Multi-language support: event pages support multiple languages. Platform UI supports English, French, Yoruba, Swahili, and Zulu at launch, with admin-manageable language packs for expansion.

3.17 Analytics & Reporting Dashboard

Every organiser gets a comprehensive, real-time analytics dashboard. Data is the reason organisers stay on the platform.

-   total revenue, tickets sold by tier, daily and weekly sales velocity graph, conversion rate from page views to purchases. Conversion is defined as: unique checkout initiations / unique event page views (both tracked via PostHog with consistent event definitions).

-   age, gender, location by city and country, device type, referral source (social, direct, email, affiliate, push notification).

-   gross revenue, platform fees, payment processing fees, net revenue, pending payouts, completed payouts, chargebacks, refunds.

-   Check-in analytics: live attendance rate, check-in time distribution, no-show rate.

-   Marketing performance: email open and click rates, promo code usage, affiliate performance, social share tracking, push notification click-through rate.

-   Exportable reports: CSV and PDF export of all data for accounting and tax purposes.

-   nightly export of anonymised event and transaction data to BigQuery or equivalent for advanced BI. Scheduled data exports available to enterprise organisers.

3.18 Admin Panel --- EventLinqs Internal

-   Platform dashboard: total events, total users, total revenue, active events, growth metrics, and trend charts.

-   User management: view, edit, suspend, and delete users. Verify organisers. Handle disputes.

-   Event moderation: flag and remove inappropriate events, manage content review queue.

-   events promoting illegal activity, hate speech, extremism, or scams are flagged by automated keyword detection and removed by admin. Age-restricted events are enforced via the age flag in Section 3.1.1.

-   Financial oversight: platform revenue tracking, organiser payouts, refund management, transaction monitoring, chargeback dashboard.

-   Promotion management: manage featured and sponsored listings, set pricing, track advertising revenue.

-   Support tools: customer support ticket system, FAQ management, canned responses, knowledge base content editor, and chatbot configuration.

-   daily reconciliation between internal ledger and gateway settlement reports (Stripe, Paystack, Flutterwave). Discrepancies are flagged automatically for finance team review.

> *PLATFORM FEE CONFIGURATION --- NON-NEGOTIABLE REQUIREMENT: The platform owner must be able to adjust all fee structures, percentage rates, fixed charges, and pricing tiers directly from the admin panel at any time, with changes taking immediate effect for new transactions, and without any developer involvement whatsoever. This covers: the platform percentage fee per ticket, the fixed fee per ticket, the organiser premium subscription price, featured listing rates, instant payout premium, resale market fee, affiliate commission rates, and any market-specific or region-specific fee overrides. No fee, rate, or pricing value on this platform may be hardcoded into the application. All pricing is database-driven and fully configurable via the admin interface.*

3.18.1 Pricing Rules Architecture

All fees are stored in a pricing_rules table with the following structure:

-   id, rule_type (platform_fee, fixed_fee, subscription, featured_listing, instant_payout, resale_fee), country_code (ISO 3166-1, or 'GLOBAL' for default), currency, event_type (or 'ALL'), organiser_tier (or 'ALL'), value (numeric), value_type (percentage or fixed), effective_from (timestamp), effective_until (timestamp, nullable), created_by, created_at, version.

-   every pricing change creates a new row with a new version number. Old orders are always reported with their historical fee structure intact. No retroactive fee changes.

-   country-specific rule \> event-type-specific rule \> organiser-tier-specific rule \> GLOBAL default. If multiple rules match, the most specific rule wins.

-   every pricing change is logged with the admin user who made it, the old value, the new value, and a timestamp.

4\. Security, Compliance & Data Protection

As a platform handling financial transactions across multiple jurisdictions, security is non-negotiable and must be implemented correctly from day one.

4.1 Application Security

-   Authentication: JWT-based session management via Supabase Auth. Refresh token rotation. Rate-limited login attempts (5 attempts per 15 minutes per IP). Account lockout after 10 failed attempts with email notification.

-   Row-Level Security: every database table has RLS policies ensuring users can only access their own data. No backend bypass permitted.

-   PCI DSS compliance: no card data stored on EventLinqs servers. All payment processing delegated to PCI-compliant gateways (Stripe, Paystack, Flutterwave).

-   DDoS protection: Cloudflare or Vercel edge protection with rate limiting on all API endpoints. Graduated rate limits: 100 requests/minute for anonymous users, 300/minute for authenticated users, 1000/minute for organiser APIs.

-   Bot protection: Cloudflare Turnstile on ticket purchases during high-demand drops, FingerprintJS Pro device fingerprinting, and purchase velocity limits per user and per IP.

-   QR ticket security: HMAC-SHA256 signed QR codes. Single-use validation. Dynamic QR refresh every 30 seconds. Anti-screenshot overlay. Event-specific signing keys stored in KMS.

-   HTTPS everywhere: TLS 1.3 on all connections. HSTS headers. CSP headers. X-Frame-Options.

-   Audit logging: all admin actions and financial transactions logged with timestamps, actor identity, and IP address for compliance and dispute resolution.

-   Dependency security: automated vulnerability scanning via Dependabot or Snyk on all npm dependencies. No known critical vulnerabilities in production.

4.2 Data Privacy & Compliance

  ------------------------ ------------------ -------------------------------------------------------------------------------------------------------------------------------------------
  **Regulation**           **Jurisdiction**   **Key Requirements Implemented**

  Australian Privacy Act   Australia          Data export, right to deletion, consent management, APPs compliance, notifiable data breaches scheme

  GDPR                     EU/EEA             Lawful basis for processing, data export (Article 20), right to erasure (Article 17), DPO appointment, consent management, cookie consent

  UK GDPR                  United Kingdom     Same as GDPR with ICO-specific requirements

  CCPA/CPRA                California, US     Right to know, right to delete, right to opt-out of sale, data minimisation

  POPIA                    South Africa       Consent, purpose limitation, data export, information officer appointment

  NDPR                     Nigeria            Consent, data minimisation, data protection officer, breach notification within 72 hours
  ------------------------ ------------------ -------------------------------------------------------------------------------------------------------------------------------------------

4.2.1 Data Retention Periods

  ------------------------------- ------------------------------------------------------ -----------------------------------------
  **Data Type**                   **Retention Period**                                   **Reason**

  Financial transaction records   7 years                                                Tax and regulatory compliance

  User account data               Duration of account + 30 days after deletion request   Service delivery and legal obligation

  Behavioural/analytics data      24 months from collection                              Product improvement and recommendations

  Audit logs                      5 years                                                Compliance and dispute resolution

  Support tickets                 3 years from resolution                                Quality assurance and legal

  Marketing consent records       Duration of consent + 3 years                          Regulatory compliance proof
  ------------------------------- ------------------------------------------------------ -----------------------------------------

4.3 Tax & Invoicing Compliance

EventLinqs must handle tax calculation and invoicing correctly per jurisdiction from launch.

-   a tax_rules table stores GST/VAT/sales tax rates per country, and per state where applicable (US state-level sales tax). The Pricing Service applies the correct tax rate at checkout based on the event's location (not the buyer's location, per most jurisdictions' rules for event tickets).

-   Australia and Europe: prices displayed inclusive of GST/VAT. United States: prices displayed exclusive of sales tax, with tax shown as a separate line item at checkout. Configurable per region in admin.

-   every purchase generates a tax invoice with: platform name, ABN/VAT number/EIN, buyer details (if provided), event details, line items with tax breakdown, invoice number (sequential per region), and date.

-   organisers can download a tax summary report per financial year showing gross revenue, fees deducted, tax collected, and net payouts.

-   platform fees and service charges are subject to GST/VAT where applicable. The tax engine handles this automatically based on the fee's jurisdiction rules.

4.4 Compliance Roadmap

-   GDPR, Australian Privacy Act, CCPA/CPRA, NDPR compliance built-in. Basic tax engine for GST and VAT.

-   SOC 2 Type I readiness assessment and gap analysis.

-   SOC 2 Type II audit initiation. ISO 27001 scoping.

-   Full SOC 2 Type II certification. ISO 27001 implementation begun.

5\. EventLinqs Revenue Model

The platform generates revenue through multiple streams designed to be competitive while remaining fair to organisers. All fee rates listed below are indicative starting points only and are not hardcoded. Every rate must be fully configurable by the platform owner through the admin panel without any developer involvement, as specified in Section 3.18.

  -------------------------------- ----------------------------------------------------------------------------------------------------------- ----------------------------
  **Revenue Stream**               **Description**                                                                                             **Starting Rate**

  Platform fee per ticket          Percentage of ticket price plus fixed fee per ticket                                                        2% + \$0.50

  Organiser premium subscription   Monthly subscription for advanced analytics, priority support, marketing tools, and reduced platform fees   \$49/month

  Featured event listings          Paid placement on homepage and category pages                                                               Fixed rate per week or CPM

  Sponsored search results         Boosted visibility in search and discovery feeds, clearly labelled as "Sponsored"                           CPC or CPM model

  Instant payout premium           Fee for organisers who request immediate payout                                                             1.5% of payout amount

  Resale market fee                Platform fee on all secondary ticket sales                                                                  5% (split buyer/seller)

  Add-on commissions (Phase 2)     Platform fee on add-on sales (parking, merch, drinks)                                                       Same rate as ticket fee

  Free events                      Always zero fees. Unconditional. Free events are a growth engine, not a revenue stream                      \$0.00
  -------------------------------- ----------------------------------------------------------------------------------------------------------- ----------------------------

5.1 Revenue Model Sustainability Notes

-   The 2% + \$0.50 starting rate is competitive but thin-margin. The admin-configurable pricing system allows increasing this per market without code changes as the platform scales and demonstrates value.

-   Premium subscriptions and featured listings are expected to become the primary margin drivers after Year 1 as the organiser base grows.

-   Free events are capped at anti-abuse thresholds: maximum 10 free events per unverified organiser per month. Verified organisers: unlimited. This prevents platform abuse (spam events, fake listings) without restricting legitimate use.

-   enterprise organisers selling 10,000+ tickets per year qualify for negotiated rates configured in admin. No code changes required.

-   verified charities receive reduced platform fees (configurable in admin, suggested: 1% + \$0.25).

6\. User Interfaces --- Complete Screen List

The following is a comprehensive list of every screen and page that must be built.

6.1 Public-Facing (Attendee)

-   Homepage: hero section, search bar, featured events (labelled "Sponsored"), trending events, curated collections, city selector, personalised recommendations.

-   Event Discovery and Search: search results with filters (date, location, price, category), map view toggle, sort options.

-   Event Detail Page: cover image, title, description, date and time, location with map, ticket tiers with all-in pricing, seat map (if reserved seating), add-ons, organiser info, social proof, activity feed, share buttons, Who's Going section, reviews.

-   Checkout: ticket selection (GA or seat map), add-ons, group booking or solo, attendee details, payment method, discount code, transparent order summary with tax breakdown, payment processing.

-   Order Confirmation: ticket details, QR code, add to wallet, add to calendar, share with friends, organiser conversion prompt.

-   User Dashboard: my tickets (upcoming and past), my profile, settings, notification preferences, saved events, loyalty points and badges, following, EventLinqs wallet balance.

-   Ticket View: individual ticket with dynamic QR code, event details, transfer option, resale option, refund request.

-   Sign Up and Login: email, social login, phone OTP, magic link.

-   Organiser Public Profile: organiser info, upcoming events, past events, follower count, verified badge, reviews.

-   Resale Market: browse available resale tickets for any event, purchase flow.

-   About, FAQ, Terms, Privacy, Contact, Sustainability, Help Center pages.

6.2 Organiser Dashboard

-   Dashboard Overview: total sales, upcoming events, recent activity, quick actions.

-   Create and Edit Event: full event builder with all fields, ticket tiers, add-ons, seat map builder, dynamic pricing settings, virtual or hybrid options.

-   Events List: all events with status (draft, scheduled, live, paused, postponed, past, cancelled) and quick metrics.

-   Event Analytics: per-event detailed analytics covering all metrics in Section 3.17.

-   Attendee and Order Management: list of all orders, attendee details, check-in status, refund actions.

-   Financial Hub: revenue overview, payout history, upcoming payouts, bank account settings, tax information, chargeback history, rolling reserve status.

-   Marketing Tools: email campaigns, SMS campaigns, promo codes, affiliate links, Backstage Credits management.

-   Check-In Scanner: web-based QR scanner, guest list, manual check-in, walk-up sales.

-   Team Management: invite staff, assign roles (Owner, Manager, Staff, Marketing), manage permissions.

-   Settings: organiser profile, notification preferences, payout settings, KYC verification, refund policy, active sessions.

6.3 Admin Panel

-   Platform Dashboard: global metrics, growth charts, revenue, active users, payment gateway health.

-   User Management: search and filter users, view details, suspend or ban, verify organisers, assign risk tiers.

-   Event Management: view, flag, and remove events, content moderation queue.

-   Financial Management: platform revenue, transaction logs, payout oversight, refund management, fee configuration (pricing_rules editor), reconciliation dashboard, chargeback management.

-   Promotions Manager: featured and sponsored listing management.

-   Support and Moderation: support ticket system with SLA tracking, user reports, dispute resolution (attendee vs organiser), escalation management, knowledge base editor, chatbot configuration.

-   Tax Configuration: GST/VAT/sales tax rules editor per jurisdiction.

-   SmartLinq Configuration: recommendation weight tuning, cold-start thresholds, spam detection rules.

-   System Health: gateway status, error rates, queue depths, cache hit rates, SLO dashboard.

7\. Recommended Development Timeline

Total timeline: 28 weeks (approximately 7 months) from kickoff to production launch. The additional time over the previous estimate accounts for the expanded scope including reserved seating, enhanced payment architecture, tax engine, chargeback handling, and comprehensive observability.

  ----------------------------- ----------- ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Phase**                     **Weeks**   **Scope**

  Phase 1: Foundation           1--4        Project setup, database schema (including pricing_rules, tax_rules, inventory reservation tables), authentication system, core user roles, organiser KYC flow, Redis cache layer, CI/CD pipeline, monitoring setup

  Phase 2: Core Ticketing       5--10       Event creation and lifecycle management, ticketing engine, reserved seating engine, add-ons, checkout flow, payment gateway integration (all 4 gateways), payment state machine, QR code generation, email confirmations, cart timer and inventory concurrency

  Phase 3: Social & Discovery   11--15      SmartLinq AI engine (schema, algorithm, cold start), Who's Going, group and squad booking, Meilisearch integration, homepage feed, push notification infrastructure with governance, PWA, virtual queue system

  Phase 4: Organiser Tools      16--20      Analytics dashboard, marketing tools (email, SMS, affiliate, promo codes), check-in scanner with offline mode, payout system with holds and reserves, virtual and hybrid event support, resale market, walk-up sales

  Phase 5: Admin & Polish       21--25      Admin panel (all modules including fee configuration, tax config, reconciliation, moderation, support tools, SmartLinq tuning), gamification and loyalty system, AI chatbot, dynamic pricing, Backstage Credits

  Phase 6: Hardening            26--28      Accessibility compliance audit, security audit, penetration testing, load testing (target: 10,000 concurrent users), performance optimisation, feature flag cleanup, documentation, staging validation, production deployment
  ----------------------------- ----------- ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

7.1 Milestone Acceptance Criteria

Each phase concludes with a milestone demo. The milestone is accepted only when:

-   All features for the phase are functional in the staging environment.

-   Unit test coverage is \>80% for business logic modules (Pricing Service, Inventory Service, Payment Service).

-   Integration tests pass for all payment gateway flows.

-   No P1 or P2 bugs remain open.

-   Performance benchmarks meet SLOs defined in Section 2.6.2.

8\. Developer Requirements & Evaluation Criteria

8.1 Mandatory Requirements

-   Proven experience with Next.js 14 or 15 (App Router, Server Components) in production at scale.

-   Proven experience with Supabase (Auth, RLS, Edge Functions, Realtime) in production.

-   Portfolio showing at least two live marketplace, ticketing, or e-commerce platforms built and deployed.

-   Payment gateway integration experience: Stripe required, Paystack and Flutterwave strongly preferred.

-   TypeScript proficiency in strict mode with no use of the 'any' type.

-   Strong UI and UX sensibility --- the platform must look and feel premium on every screen and every device.

-   Experience building for high concurrency --- thousands of simultaneous ticket purchases without degradation.

-   Demonstrated understanding of serverless scaling architecture.

-   Experience with Redis for caching and/or message queuing.

-   Familiarity with observability tools (Sentry, Datadog, or equivalent).

8.2 Proposal Requirements

Developers must include all of the following in their proposal:

-   Fixed-price quote for the complete scope with milestone breakdown matching the six phases in Section 7.

-   Team composition: who is working on each area (lead developer, frontend, backend, design, QA).

-   2 to 3 links to live projects they have built --- not templates, not landing pages --- real transactional platforms.

-   Proposed timeline with weekly milestones.

-   Architecture proposal: a brief document (2--4 pages) describing how they would implement the inventory concurrency model, payment state machine, and caching strategy.

-   Post-launch support plan: minimum 3 months of bug fixes included in the quoted price.

-   Communication plan: weekly video calls, daily async updates via Slack or Discord, working demo at each milestone completion.

9\. Final Deliverables Checklist

Upon project completion, the developer must deliver all of the following. Incomplete delivery is not accepted.

-   Complete source code in a private GitHub repository with full commit history and branch protection configured.

-   Production deployment live on eventlinqs.com or specified domain.

-   Staging environment for ongoing testing.

-   Database migration scripts and seed data (including pricing_rules and tax_rules defaults for all launch markets).

-   Full API documentation (internal and external endpoints) with request/response examples.

-   Admin manual and user guide.

-   All third-party account credentials and access (Supabase, Vercel, Stripe, Paystack, Flutterwave, Redis, monitoring tools) transferred to EventLinqs ownership.

-   CI/CD pipeline configured and documented (lint, type check, unit tests, integration tests, preview deployments, production deployment).

-   demonstrating the platform handles a minimum of 10,000 concurrent users without degradation, including a simulated high-demand on-sale with 5,000 simultaneous checkout attempts.

-   Security audit report including OWASP Top 10 assessment.

-   Penetration test results (can be third-party or developer-conducted with documented methodology).

-   Accessibility audit report confirming WCAG 2.1 AA compliance on all public-facing pages.

-   3 months post-launch support covering bug fixes, critical patches, and one round of performance tuning.

-   Runbook: documented procedures for common operational tasks (deploy, rollback, database backup/restore, gateway failover, incident response).

10\. Market Research & Growth Intelligence

This section consolidates validated market research, competitive intelligence, and growth strategy. This is not background reading --- it is a build directive. Every insight below directly informs product and development decisions.

10.1 The Market Opportunity

The global online event ticketing market reached \$85.35 billion in 2025 and is projected to hit \$102.79 billion by 2030. Total ticketing transaction value was \$1.47 trillion in 2025 and is forecast to reach \$3.37 trillion by 2030 --- 128% growth in five years. This is one of the fastest-growing digital sectors on earth.

For Africa specifically, the opportunity is generational. The region is the next frontier for event services with smart ticketing projected to grow at over 10% CAGR. No dominant, consumer-loved platform exists for Africa the way Spotify exists for music. EventLinqs has the opportunity to become that platform.

10.2 Validated Consumer Pain Points

-   Frictionless checkout gap: 79% of consumers want a quick frictionless checkout yet only 49% of current platforms deliver one. Guest checkout, 2-tap payment, and saved payment methods are mandatory.

-   Mobile-first gap: 88% of consumers use mobile devices to discover and purchase tickets. Mobile is the product. Desktop is secondary.

-   Transparent pricing demand: hidden fees at checkout are the single most cited reason consumers abandon ticketing platforms. EventLinqs shows the full price from the first click.

-   Social discovery: 74% of Gen Z users say seeing who is attending makes them significantly more likely to purchase.

10.3 Africa-Specific Build Requirements

-   Low-bandwidth and offline resilience: aggressive image compression (WebP with JPEG fallback), lazy loading, minimal JavaScript payloads (\<200KB initial bundle), and a PWA that functions offline. Checkout must not fail under poor network conditions.

-   Mobile money integration: Paystack and Flutterwave cover M-Pesa, bank transfer, USSD, and local card networks. Phone OTP login is critical.

-   many African payment methods (bank transfer, USSD) are asynchronous. The system must support a "payment pending" state where inventory is held (up to 30 minutes for bank transfers, configurable) and the ticket is issued only when payment confirmation is received via webhook.

-   WhatsApp is the dominant sharing and communication platform in Africa. All share flows generate WhatsApp deep links with rich preview cards. Event invitations, squad booking links, and ticket transfers are optimised for WhatsApp.

-   Fraud prevention: dynamic rotating QR codes and single-use cryptographic validation directly address ticket counterfeiting at large African events.

-   Corporate and hybrid event demand: Lagos, Nairobi, Johannesburg, and Accra have strong demand for professional corporate event management.

-   verified organiser badges, public dispute resolution process, buyer protection messaging ("Your purchase is protected by EventLinqs"), and visible refund policies build trust in markets where online payment trust is still developing.

10.4 Growth Strategy

10.4.1 Core Growth Flywheel

-   launch targeting independent club nights, community events, food experiences, and local cultural festivals --- the underserved long tail that Ticketmaster ignores and Eventbrite overcharges.

-   every free event published generates SEO traffic, new registered attendees, and potential organiser conversions at zero cost. The zero-fee policy for free events is unconditional and permanent.

-   every buyer prompted to become an organiser after purchase. More organisers attract more attendees, who become more organisers.

-   DICE confirmed that nearly half of all their ticket sales come through personalised push-driven recommendations. EventLinqs must treat push as a core revenue channel from day one.

-   the SmartLinq AI Engine gets smarter with every event. The more data on the platform, the harder it becomes for any competitor to replicate the recommendation quality.

-   Africa's creator economy is valued at \$5.1 billion and projected to reach \$29.84 billion by 2032. Backstage Credits enable a creator programme targeting micro-influencers from day one.

10.4.2 Supply Acquisition Plan

The growth strategy requires concrete organiser acquisition targets and tactics per market.

  --------------- ----------- --------------------------------- ----------------------------------------------------------------------------------------------------- ------------------------------------------------------
  **Market**      **Month**   **Target Organisers (Month 1)**   **Primary Acquisition Channel**                                                                       **Key Offer**

  Australia       Month 1     50 independent organisers         Direct outreach to Melbourne/Sydney nightlife promoters, food festival organisers, community groups   Zero fees for 3 months + priority onboarding support

  United States   Month 3     100 independent organisers        Instagram/TikTok creator partnerships + direct outreach to NYC/LA/ATL event collectives               Lower fees than Eventbrite + social features demo

  Nigeria         Month 4     30 independent organisers         Lagos nightlife and Afrobeats promoter network + university event coordinators                        Zero fees for 6 months + WhatsApp support concierge

  UK & Europe     Month 6     50 independent organisers         London club promoters + festival organisers + LinkedIn outreach                                       Transparent pricing pitch + social layer demo
  --------------- ----------- --------------------------------- ----------------------------------------------------------------------------------------------------- ------------------------------------------------------

10.4.3 User Lifecycle Strategy

-   interest selection (3--5 genres/categories), location permission, first event recommendation within 10 seconds of signup.

-   goal is first ticket purchase within 14 days of signup. Triggered push + email sequence with personalised event recommendations.

-   weekly personalised push with "Events your friends are attending" + "Trending near you." Loyalty points and badges create stickiness.

-   users inactive for 30+ days receive a winback campaign: "You missed these events --- here's what's coming up." Discount code for first reactivation purchase.

-   post-purchase prompt + follow-up email 7 days later: "Have you ever thought about hosting your own event?"

10.5 Revenue Benchmarks & Scale Targets

-   Humanitix (Australia) bootstrapped on under \$250K, doubled every six months, and became the fastest-growing ticketing platform in Australia and New Zealand.

-   Tix Africa grew revenue 515% in H1 2022 versus the prior year.

-   EventLinqs path to \$1M revenue: at an average ticket price of \$35 and a platform fee of approximately \$1.20 per ticket, EventLinqs needs roughly 833,000 paid tickets per year across all markets. With premium organiser subscriptions and featured listings added, \$5M by Year 5 is a credible target.

10.5.1 Unit Economics Targets

  --------------------------------------- ---------------------------------------- -----------------------------------------------------------
  **Metric**                              **Year 1 Target**                        **Year 3 Target**

  Average revenue per ticket              \$1.20                                   \$1.80 (as premium features and higher-tier plans mature)

  Customer acquisition cost (attendee)    \<\$2.00 (organic/push-driven)           \<\$1.50

  Customer acquisition cost (organiser)   \<\$50 (direct outreach + free period)   \<\$30 (referral + word of mouth)

  Organiser LTV (24-month)                \$500                                    \$2,000

  Gross margin per paid ticket            \~60% (after payment processing)         \~65% (scale leverage on infra costs)

  Chargeback rate target                  \<0.5%                                   \<0.3%
  --------------------------------------- ---------------------------------------- -----------------------------------------------------------

11\. API & Integration Strategy

A public API and webhook system is critical for organiser retention and ecosystem growth. Organisers will demand integrations with their existing tools.

11.1 Public API (V1)

EventLinqs exposes a RESTful JSON API authenticated via API keys (organiser-scoped) or OAuth2 (for third-party integrations).

-   CRUD for events, ticket tiers, add-ons. Read-only for public event details.

-   read-only access to orders for an organiser's events. Includes attendee details, payment status, check-in status.

-   validate ticket by QR payload or ticket ID. Returns validation result and attendee details.

-   list attendees for an event with filtering by tier, check-in status, and payment status.

-   read-only access to event analytics (sales, demographics, check-in data).

11.2 Webhook Events

Organisers and partners can subscribe to webhook events for real-time integration with their own systems.

  -------------------- --------------------------------- ---------------------------------------------------------------------------
  **Event**            **Trigger**                       **Payload**

  order.created        New ticket purchase completed     Order ID, event ID, attendee details, ticket tier, amount, payment method

  order.refunded       Refund processed                  Order ID, refund amount, reason

  ticket.transferred   Ticket transferred to new owner   Ticket ID, old owner (anonymised), new owner

  ticket.checked_in    Ticket scanned at door            Ticket ID, scan timestamp, scanner ID

  event.published      Event goes live                   Event ID, event details

  event.cancelled      Event cancelled                   Event ID, cancellation reason

  event.postponed      Event date changed                Event ID, old date, new date

  payout.completed     Organiser payout processed        Payout ID, amount, currency, destination
  -------------------- --------------------------------- ---------------------------------------------------------------------------

11.3 Third-Party Integration Roadmap

  -------------------------------- ----------- -----------------------------------------------------------------------------
  **Integration**                  **Phase**   **Purpose**

  Meta Pixel + CAPI                V1          Organiser ad tracking and conversion attribution for Facebook/Instagram ads

  Google Ads conversion tracking   V1          Organiser ad tracking for Google Ads

  TikTok Pixel                     V1.1        Organiser ad tracking for TikTok

  Zapier / Make                    V1.1        No-code automation for organisers (sync orders to CRM, spreadsheet, etc.)

  Mailchimp / Klaviyo              V1.1        Organiser email marketing integration via webhook or Zapier

  Google Calendar                  V1          Add-to-calendar from ticket confirmation (already in scope via .ics)

  Venue POS (Phase 2)              V2          Integration with venue point-of-sale systems for door sales and bar tabs
  -------------------------------- ----------- -----------------------------------------------------------------------------

11.4 API Documentation Deliverable

Full API documentation must be delivered as an interactive API reference (Swagger/OpenAPI spec hosted on docs.eventlinqs.com or equivalent). Every endpoint must include: URL, method, authentication requirements, request parameters with types, example request, example response, error codes, and rate limits.

**END OF SCOPE OF WORK**

EventLinqs --- Version 5.0 --- March 2026

*This document is confidential and intended for developer evaluation purposes only.*
