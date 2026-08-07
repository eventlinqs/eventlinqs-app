# THE EVENT LAUNCH KIT: moat analysis

Date: 8 August 2026. Author: strategy and product analysis session.
Status: READ ONLY. No code was changed. No migration was written.

INTERNAL DOCUMENT. Competitor names appear throughout as research context.
None of this language belongs on any public surface.

**How to read the verdicts.** Every claim about the product carries one of
three labels, and the label is earned, not assumed:

- **BUILT AND PROVEN**: I opened the code, and there is recorded evidence of it
  running (a capture, a results file, a test name). Named per claim.
- **BUILT BUT UNPROVEN**: I opened the code and it exists, but nothing in this
  repository shows it running in production. Production has zero events, so
  almost everything in the kit sits here.
- **PLANNED**: specified in a repository document and verified ABSENT from
  `src` this session, with the command that proved the absence.

Market claims carry a source. Where I could not find a source I say so.
Where a conclusion is mine rather than a source's, it is marked **Inference**.

---

## EXECUTIVE SUMMARY

**The verdict, in one line: the Launch Kit is a genuinely strong artefact
generator sitting behind the wrong door, and as built today it is not strong
enough to be the acquisition engine for a platform with zero users.**

**Four findings decide it.** The product facts are verified in code at the paths
named; the judgement they add up to is my reasoning, and Part 6B names the
experiment that would settle it.

**1. The bait is behind the commitment.** The kit renders only after the
organiser publishes a real event (`launch-kit/page.tsx:128`, the `if (!isLive)`
locked state). First they sign up, verify an email, create an organisation,
finish a seven-step wizard, and publish on a platform with no track record.
"Free, no ticketing commitment required" is not what the code does: publishing
IS the commitment, and it is charged before any value is delivered. The public
`/launch` composer that fixes this is specified in `PHASE-C.md` part 4 and
marked "DO NOT BUILD YET"; `src/app/launch` does not exist.

**2. The one social card cannot be posted where it matters.** The kit ships one
designed social artefact, a 1200x630 Open Graph link preview. Instagram renders
Open Graph previews only in direct messages and the Story link sticker, never in
a feed post, by deliberate design
([Share Preview](https://share-preview.com/blog/instagram-link-preview)). The
1080x1920 and 1080x1080 composers that fix it are specified and ABSENT (grep
verified). No captions are generated either, so the organiser still writes every
word.

**3. No organiser-to-organiser spread exists inside the kit.** Every artefact
points at attendees. The one organiser-recruitment link lives on the buyer's
order confirmation, not in the kit. The lineup loop is the only true
organiser-to-organiser vector and it is flag-gated and not framed as
recruitment. Spread currently depends entirely on the founder's own outreach.

**4. In the asset-generation category the kit is not novel.** Luma already ships
generated share images, a poster generator, QR codes and per-referrer attributed
referral links ([Luma](https://help.luma.com/p/promote-your-event)). PosterMyWall
already ships an event page with RSVP, roughly a million event-specific flyer
templates and email, for USD 9.99 a month
([PosterMyWall](https://www.postermywall.com/index.php/c/canva-vs-postermywall)).
"We generate your promo assets" is a claim two products already meet. The
differentiated claim is narrower and stronger: our assets attach to a real
checkout, so they attribute to REVENUE, not clicks.

**What is strong and must not be rebuilt.** The artefacts are CONNECTED. The
poster QR carries a tracked link, the click ties to an order, and the order lands
in reach attributed to "Poster QR". In the manual stack the poster and the ticket
link are unrelated objects and nobody knows which worked. That is BUILT AND
PROVEN in staging. The anti-tell copy gate and the two-pass Magic Start are also
genuine leads on the incumbents.

**The pain is real but it is not the pain the kit leads with.** Asset production
is not a top-five organiser complaint in any source found; Canva made it cheap.
Filling the room is: 52 percent of planners name attendance as their biggest
problem ([Bizzabo](https://www.bizzabo.com/blog/event-marketing-statistics)). The
kit's attribution layer answers the second pain, which is real but less acute.
Nobody who cannot sell tickets buys a better dashboard.

**The five moves that would change the answer**, ranked by impact against
effort. Hours are the repository's own estimates where they exist.

| # | Move | Cost | What it buys |
|---|---|---|---|
| 1 | Render the kit on a DRAFT, not only on publish | 6 to 10 h | Removes the publish-before-value inversion for signed-up users. The cheap half of finding 1 |
| 2 | Instagram-shaped assets (1080x1350, 1080x1920, 1080x1080) | 16 to 20 h | Makes the output postable on the channel that matters. Finding 2 |
| 3 | Caption engine, deterministic base plus the AI register pass | 14 to 18 h | The other half of "pleased to post". Deterministic base works with no AI key |
| 4 | The plain-English reach sentence | 3 to 5 h | "WhatsApp sold 9 of your 34 tickets" closes the knowing pain in one line |
| 5 | The public `/launch` composer and reveal | 20 to 30 h | Removes the auth wall entirely. The full fix for finding 1 |

Moves 1 to 4 total roughly 39 to 53 hours and each ships alone. They are the
difference between "a competent post-publish screen" and "a thing an organiser
tells another organiser about".

**The risk nobody has named.** On launch day every organiser's reach panel
renders four zeros under the heading "Watch it travel"
(`launch-kit/page.tsx:529`, `reachStats` at `:241-246`). On a platform with no
audience, the honest measurement that makes the kit trustworthy is also the
thing that makes the delivery moment feel empty. This is a design problem, not a
data problem, and it is currently unaddressed.

---

## PART 1: THE GENERALIST PASS

### 1.1 Who independent event organisers actually are

The segment is not one thing. Segmenting it matters because the kit lands very
differently on each.

**Segment A: the solo promoter or DJ.** One to four events a month, standing
room, no seating, no venue ownership. Promotes almost entirely through
Instagram, a group chat, and posters in the venue and the record shop. This is
the founder's own network and the stated wedge. Evidence for the promotion
pattern: DIY gig promotion guidance consistently names the same short list,
posters and flyers in venues and music shops, consistent posting across
Instagram Reels, TikTok and Shorts in the three weeks before, a ticket link in
the bio and in every caption, and a QR on the poster going straight to tickets
([Last Minute Musicians](https://www.lastminutemusicians.com/how_to_get_gigs/3-steps-to-promoting-a-gig/),
[RouteNote](https://routenote.com/blog/how-to-promote-your-gig-6-tips-for-success/)).

**Segment B: the small venue.** Owns the room, runs a weekly or fortnightly
programme, may have reserved seating or a cabaret floor. Cares about the room
more than the poster. In Victoria this segment is real and measurable: the 2025
Victorian Live Music Venue Audit found 2,441 live music venues in the state, 45
percent of them in regional Victoria, with 655 hosting at least one gig a week
([Music Victoria audit, reported by The Music, 26 February
2026](https://themusic.com.au/industry/new-audit-confirms-victoria-holds-the-most-music-venues-in-australia/6khQ_P_-4eA/25-02-26)).

**Segment C: the community organiser.** Markets, fundraisers, faith gatherings,
school and sporting events. Often free or low-priced entry, often no ticketing
platform at all today, often a spreadsheet and a Facebook event. This is
TryBooking's core segment in Australia
([TryBooking](https://www.trybooking.com/)).

**Segment D: the professional producer.** Multi-event, has a designer or an
agency, already on Oztix, Moshtix or Humanitix. The kit is not aimed here and
should not be.

**Inference.** The kit as built serves segment B best (the seat builder is its
most engineering-expensive component and only segment B needs it), while the
stated wedge is segment A. That mismatch is examined in Part 8.

### 1.2 How an organiser gets an event live today, step by step

There is no single authoritative time study for this workflow that I could
find. What follows is assembled from the promotion guidance above plus the tool
documentation, with each step's cost sourced where a source exists and marked
as an estimate where it is not. **This is the honest state of the evidence: the
step list is sourced, the per-step minutes are largely not.**

| # | Step | Tool today | Time | Source or estimate |
|---|---|---|---|---|
| 1 | Decide the event, lock the date and venue | Head, phone, group chat | Not the tool's problem | - |
| 2 | Make the poster | Canva | Canva's own material claims "zero to a working canvas in under 90 seconds" and "professional-quality posters in minutes" ([Canva](https://www.canva.com/create/posters/)) | Vendor claim, treat as a floor not a typical |
| 3 | Resize for Instagram feed, story, and Facebook | Canva resize (Pro feature) | Estimate: minutes | UNSOURCED |
| 4 | Write the caption for each channel | Notes app, head | Estimate: the slowest creative step | UNSOURCED |
| 5 | Set up ticketing | Eventbrite, Humanitix, TryBooking, Oztix | Eventbrite's public claim is a page in under two minutes | Vendor claim |
| 6 | Put the link somewhere clickable | Linktree, bio | Linktree integrates Canva directly, which tells you how common the pairing is ([Linktree](https://linktr.ee/features/canva-integration)) | Primary |
| 7 | Post, repost, remind for three weeks | Instagram, TikTok, Shorts | The guidance is explicit that this runs for weeks, not one post | Sourced |
| 8 | Track what worked | Nothing, or UTM parameters if sophisticated | - | - |

**What actually breaks in this stack, with sources.**

- **Step 8 breaks completely for most organisers.** 40 percent of organisers
  still struggle to prove event ROI
  ([Bizzabo](https://www.bizzabo.com/blog/event-marketing-statistics)). The
  poster, the story and the ticket link are three unrelated objects and nothing
  joins them.
- **Step 3 and 4 multiply.** The number of promotional methods used by event
  marketers rose from 4.79 to 6.5 on average
  ([Bizzabo](https://www.bizzabo.com/blog/event-marketing-statistics)). Every
  added channel is another crop and another caption.
- **Step 7 is where the effort actually lives** and no tool in the stack helps
  with the repetition.

**Honest gap.** I found no survey measuring how many minutes an independent
organiser spends assembling promotional assets for one event, and no data on
what share of event organisers use Canva. I searched for both directly. The
"hours of work" framing in the founder's brief is plausible and matches the step
count, but I cannot substantiate it with a citation, and this analysis does not
rely on it.

### 1.3 What they complain about

Ranked by strength of the evidence found.

1. **Attendance.** 52 percent of planners name boosting event attendance as
   their biggest problem
   ([Bizzabo](https://www.bizzabo.com/blog/event-marketing-statistics)); 42
   percent say they struggled to drive attendance
   ([Remo](https://remo.co/blog/event-industry-statistics)).
2. **Fees.** High booking fees are cited by 52.1 percent of organisers as the
   biggest barrier to signing up for a ticketing platform, with complicated
   systems at 12.3 percent and payment processing fees at 10.9 percent, from a
   2025 TicketSource survey. **Source caveat: I could not verify this
   primary.** The TicketSource page returned HTTP 403 to my fetch; the numbers
   come from a secondary citing it
   ([Ticketsauce](https://www.ticketsauce.com/why-switch) and
   [eventcloud](https://www.eventcloud.io/blog/ticketing-platform-fees-compared-2026)).
   Sample size and method unknown. Treat the ordering as more reliable than the
   decimals.
3. **Fragmentation.** Organisers describe marketing scattered across five tools
   and a vendor that treats payment processing as if it were help selling out
   ([Tixr](https://creators.tixr.com/post/modern-vs-legacy-ticketing-why-event-organizers-are-choosing-platforms-like-tixr)).
4. **Data ownership.** Organisers sell out and still do not know who their
   customers are
   ([Tixr](https://creators.tixr.com/post/modern-vs-legacy-ticketing-why-event-organizers-are-choosing-platforms-like-tixr)).
5. **Proving ROI.** See point 1 above, 40 percent.

**Note what is NOT on this list: "making assets is too hard".** No source I
found names asset creation as a top organiser complaint. This is the single most
important finding of the generalist pass and it is examined in Part 2.

### 1.3b Where they abandon

The strongest evidence found points at one place, and it is not the place the
Launch Kit sits.

**Payments onboarding is the highest drop-off point.** Ticket Tailor, a direct
competitor in this segment, told Stripe that "the highest drop-off point in its
customer journey was during onboarding for payments"
([Stripe customer story](https://stripe.com/customers/ticket-tailor)). No
before-and-after percentages are published, so the size of the drop is unknown,
but the location is stated by an operator with real volume.

Secondary abandonment points, less strongly sourced:

- **Signup complexity as a barrier to even starting.** Complicated systems are
  the second-named barrier to signing up for a ticketing platform at 12.3
  percent, behind fees (secondary source, primary unreachable, see 1.3).
- **Form length.** "Every extra field is another reason to pause", and long or
  poorly optimised forms cause drop-off before a single ticket is sold
  ([Ticket Falcon](https://www.ticketfalcon.com/event-registration-setup-guide-that-works/)).
  Vendor source, treat as directional.
- **Reconnection friction on connected social accounts** is documented across
  every scheduler surveyed (Later's "refresh your social profile", Metricool's
  permission renewals, Canva's dedicated error page for Creator accounts),
  recorded in `docs/design/LAUNCH-KIT-PLAN.md` section 3.1, fetched 2026-07-27.

**Evidence, not inference:** EventLinqs sits astride the exact drop-off point
Ticket Tailor named. Its seven-step wizard is completable with title plus cover
image alone (`event-form.tsx:1708`, recorded in
`docs/design/LAUNCH-KIT-AUDIT.md` item 1), which is short by the standards
above. But Stripe Connect onboarding is required before an organiser can sell a
paid ticket, and project state as of 2026-07-31 records all sixteen production
organisations sitting at `stripe_charges_enabled = false`. **Inference:** that
is not a coincidence and it is not an EventLinqs-specific defect. It is the
industry's known worst step, and the Launch Kit does nothing about it because
the kit is delivered after publish and before any payout ever happens.

### 1.4 What they pay for and refuse to pay for

- **Free events are free everywhere.** TryBooking: "All free events are free"
  ([TryBooking](https://www.trybooking.com/)). Eventbrite: free events carry no
  fees ([SimpleTix analysis,
  2026](https://www.simpletix.com/eventbrite-2026-pricing-changes/)). Free is
  table stakes, not a differentiator.
- **They pay per ticket, not per month.** Eventbrite's 2026 restructure
  replaced the free-for-everyone Flex plan with a paid Pro tier at USD 15, 50 or
  100 a month, and the organiser reaction recorded in the trade press is
  negative ([SimpleTix](https://www.simpletix.com/eventbrite-2026-pricing-changes/),
  [TickPick](https://www.tickpick.com/blog/organizer/eventbrite-2026-fee-changes)).
- **They resist subscriptions for marketing tooling.** Buffer at USD 5 per
  channel per month, Later at USD 18.75, Hootsuite at USD 99, per the pricing
  survey recorded in `docs/design/LAUNCH-KIT-PLAN.md` section 3.1 (fetched
  2026-07-27). A solo promoter running four gigs a month does not carry three
  of these.

### 1.5 What makes them switch, and what makes them stay

**Switch triggers, sourced:** high fees, limited customisation, poor support,
and lack of ownership over customer data
([Posh](https://posh.vip/university/post/switch-ticketing-platforms-without-losing-audience)).
Add the 2026 specific: Bending Spoons acquired Eventbrite for roughly USD 500
million, Julia Hartz departed, staff cuts landed after close, and the analysis
in the trade press is that thinner support is the effect organisers will notice
first ([Event Tech
Live](https://eventtechlive.com/500-million-180-countries-zero-quarterly-earnings-calls-bending-spoons-just-took-eventbrite-private/),
[Ticket Tailor](https://www.tickettailor.com/blog/bending-spoons-acquires-eventbrite-what-does-this-mean)).

**Stay forces:** the audience list, the historical sales data, and the URL
already printed on things. **Inference:** these are weak for segment A, because
a solo promoter's audience lives on Instagram and in a phone, not in a ticketing
platform's CRM. That is good news for EventLinqs and is developed in Part 3.

**How they hear about tools:** 58.9 percent of organisers rely on referrals and
personal recommendations, and 92 percent of consumers trust recommendations
from friends over advertising ([Ticket
Fairy](https://www.ticketfairy.com/blog/how-referral-are-an-essential-tool-for-event-promotions)).
Source caveat: Ticket Fairy is a ticketing vendor with a commercial interest in
referral mechanics, and the 58.9 percent figure has no visible primary. Treat
as directional.

---

# THE THREE COMPARISONS

The brief requires three separate, clearly labelled comparisons, and warns that
comparing only against ticketing platforms is the mistake to avoid. They are
below, in the brief's order, each with its own verdict. Product claims carry a
file path; market claims carry a source.

**What is being compared.** The Launch Kit as it exists in `src` on 8 August
2026: a live event page, an A4 QR poster PDF, one 1200x630 link-preview card,
seven tracked share intents, a reach panel, and an optional seat map. No
captions, no story or square assets, no scheduling, delivered only after publish.

---

## COMPARISON 1: against the manual status quo

The fragmented stack an independent organiser assembles today. This is the real
competitor for most of segment A.

**The stack:** Canva for the poster and the resizes, Instagram and Facebook for
the posts, Linktree for the clickable link, a group chat or spreadsheet for the
guest list, a ticketing checkout bolted on at the end.

| Dimension | The manual stack | The Launch Kit | Verdict |
|---|---|---|---|
| **Time cost** | Canva claims "zero to a working canvas in under 90 seconds" and posters "in minutes" ([Canva](https://www.canva.com/create/posters/)), plus a separate ticketing setup, plus a Linktree edit, plus a caption per channel. No independent per-step study exists; see the gap statement in 1.2 | 17.6 seconds wizard-start to rendered kit, measured in staging (`drive-results.json`, `totalStartToKitMs: 17577`), by Playwright at 28ms per character with every decision pre-made | **AHEAD on the assembly step, and the margin is smaller than it looks** because Canva's step was never the expensive one |
| **Skill cost** | Real but low and falling. Canva's template library removes layout and typography decisions; the residual skill is taste and cropping. The genuinely skilled steps are writing the caption and choosing the photo, and Canva helps with neither | Zero skill required for the poster and card. Photo choice and caption still fall entirely on the organiser, because the kit generates no captions (verified absent) | **AHEAD on layout, LEVEL on the two steps that actually need skill** |
| **Quality of output** | Ceiling is high: PosterMyWall alone offers roughly a million concert flyer templates with genre-specific galleries ([PosterMyWall](https://www.postermywall.com/blog/2025/10/29/the-best-concert-poster-maker-and-marketing-tools-compared/)). Floor is low. Output carries the organiser's own logo and matches their night's aesthetic | One fixed template for every event type, base-14 Helvetica (`poster.ts:63-64`), carries the EventLinqs wordmark and no organiser logo slot (`poster.ts:24-34`). Consistent, professional, and identical every time | **BEHIND on ceiling and identity, AHEAD on floor and consistency** |
| **What breaks** | The link and the poster are unrelated objects. Nothing is measured. The Linktree link goes stale. The story gets recropped badly. Nobody can answer which channel sold the room, and 40 percent of organisers cannot prove ROI ([Bizzabo](https://www.bizzabo.com/blog/event-marketing-statistics)) | The QR carries a tracked short link; scans, clicks, orders and tickets are attributed per channel, deduplicated per visitor per day, one conversion per link-order pair (`src/lib/broadcast/share-links.ts`, `/s/[code]`) | **AHEAD, decisively, and this is the only dimension where the gap is structural rather than incremental** |

**Comparison 1 verdict.** The kit beats the manual stack on assembly speed,
consistency and, above all, measurement. It loses on creative ceiling and on
whose brand the artefact carries. **Inference:** an organiser will rationally
use both, taking the kit's page, tracked links and printed QR poster while still
making their own Instagram graphic in Canva. That is a good outcome for the
platform and it is not the outcome the acquisition strategy assumes.

---

## COMPARISON 2: against event marketing and promotion tools

Tools that generate assets, pages or links for events. This is the category the
brief's warning points at, and it is where the kit's asset claim is weakest.

**Source caveat for this table.** Template counts and feature lists come from
each tool's own marketing or help pages, because that is where the primary
statement of what a product does lives. They are self-reported and unaudited.
Prices are cross-checked against a third party where one exists (Software
Advice). Treat magnitudes as directional and capabilities as reliable.

| Tool | What it gives an event organiser | Price | Where the kit is AHEAD | Where the kit is BEHIND |
|---|---|---|---|---|
| **Canva** | Templates at every social size, resize, content planner scheduling to connected accounts, brand kit with the organiser's own logo | Free tier; Pro from about USD 12.99 to 15 a month ([Software Advice](https://www.softwareadvice.com/graphic-design/canva-profile/vs/postermywall/)) | Tracked links, a live selling page, a real A4 print PDF with a working QR, and measurement. Canva has none of these | Every creative dimension: template choice, sizes, editability, the organiser's own branding, scheduling |
| **PosterMyWall** | Roughly a million concert flyer templates with genre galleries, **event pages with RSVP**, and email campaigns sent directly | Premium USD 9.99 a month, Premium Plus USD 29.99 ([PosterMyWall](https://www.postermywall.com/index.php/c/canva-vs-postermywall)) | Real ticketing and payment, tracked per-channel attribution, a seat map | Creative range, genre-aware art direction, built-in email, and the fact that it too offers an event page |
| **Linktree** | The clickable bio link, with Canva integrated directly into the profile editor ([Linktree](https://linktr.ee/features/canva-integration)) | Free tier | The kit's short links are tracked to orders, not just clicks | The kit has no bio-link surface at all. The stable `/k/[code]` kit link is step 5 of the plan and is not built |
| **Buffer, Later, Metricool, Hootsuite** | Scheduling and auto-publish to Instagram professional, Facebook Pages, X, LinkedIn, TikTok, YouTube, Threads, with a standardised notification-publishing fallback for the hard cases | Buffer from USD 5 per channel per month, Later USD 18.75, Metricool free then EUR 16, Hootsuite USD 99 (recorded in `docs/design/LAUNCH-KIT-PLAN.md` section 3.1, fetched 2026-07-27) | Event-specific assets and attribution to actual ticket sales, not just engagement | Scheduling, repetition across the three-week campaign, and any form of publishing assistance. The kit is a single one-shot moment |
| **Luma** | Generated OG images, a Share Event Poster generator, QR codes, and referral links with per-referrer attribution ([Luma Help](https://help.luma.com/p/promote-your-event), [Luma Event Referrals](https://help.luma.com/p/event-referrals)) | Free tier | The A4 print PDF, per-channel tracked intents, and the seat map | **Nothing material. Luma is the closest thing to the Launch Kit that already exists**, and its referral attribution is per-referrer where the kit's is per-channel |

**Comparison 2 verdict, and it is the uncomfortable one.** In the promotion-tool
category the Launch Kit is not novel. Luma already ships generated share images,
a poster generator, QR codes and attributed referral links. PosterMyWall already
ships an event page with RSVP plus a million event-specific templates plus email
for USD 9.99 a month. The kit's genuine differentiator against this whole
category is that its artefacts are attached to a real ticketing checkout and
therefore attribute to REVENUE rather than to clicks. That is a real and
defensible claim. "We generate your promo assets" is not.

**One caveat carried from the source.** The repository's 2026-07-25 research
concluded that no surveyed platform renders a finished promo kit at publish, and
the source itself notes a universal negative cannot be absolutely proven. That
caveat travels with the claim wherever it appears in this document.

---

## COMPARISON 3: against ticketing platforms' own organiser tooling

What an incumbent hands an organiser at the moment they create an event.

| Platform | What it gives at creation | Verdict against the Launch Kit |
|---|---|---|
| **Eventbrite** | The only major incumbent with in-product AI generation (descriptions, summaries, images), framed by Eventbrite itself as "a starting point for them to revise and edit". AI ad copy is paywalled behind Boost at USD 15 to 100 a month. Share on Social auto-posts to Instagram for Business accounts with a linked Facebook Page, with the documented weakness that "your post doesn't automatically link to your Eventbrite event" ([Eventbrite help 719933](https://www.eventbrite.com/help/en-us/articles/719933), research recorded in `LAUNCH-KIT-AUDIT.md` C1 and `LAUNCH-KIT-PLAN.md` 3.2). No built-in promotional QR code generator; organisers use third-party services | **Kit AHEAD** on the poster, the tracked QR, per-channel attribution, and on price (free where Boost is paid). **Kit BEHIND** on auto-posting and on marketplace reach, and Eventbrite's marketplace is a genuine demand asset that a zero-user platform cannot match |
| **Humanitix** | A Promotional Hub of pre-made Canva templates. The organiser clicks through to Canva, edits the template, adds their own logo, downloads a PNG or JPEG, and posts it manually. The help page does not mention tracked links or QR posters (fetched this session, [Humanitix help](https://help.humanitix.com/en/articles/8913665-communicate-your-events-impact-using-the-promotional-hub)) | **Kit AHEAD** on automation (no Canva round trip), on the print-ready A4 PDF, on the tracked QR, and on attribution. **Kit BEHIND** on creative range and on the organiser's own logo, which Humanitix explicitly supports and the kit does not |
| **TryBooking** | Free events genuinely free, no tiers that reduce features, no ticket limits ([TryBooking](https://www.trybooking.com/)). Marketing help is editorial blog guidance, not in-product asset generation | **Kit AHEAD** on every asset dimension. **LEVEL** on free events being free, which is table stakes |
| **Oztix and Moshtix** | Marketing and audience tooling aimed at the live-music trade, plus box office and on-the-ground support ([Moshtix](https://business.moshtix.com/promote), [Oztix](https://www.oztix.com.au/venues-organisers/)). Neither publishes a self-serve promo-kit generator | **Kit AHEAD** on self-serve assets. **Kit BEHIND** on human support and on existing relationships with Victorian venues, which is what the wedge segment actually buys on |
| **Ticket Tailor** | Points organisers at an external assistant via an MCP connector rather than generating in product ([Ticket Tailor AI MCP connector](https://www.tickettailor.com/features/ai-mcp-connector), recorded in `LAUNCH-KIT-AUDIT.md` C1) | **Kit AHEAD** on in-product generation |
| **Luma** | Generated OG images, share poster generator, QR codes, referral links (see comparison 2) | **LEVEL to marginally BEHIND.** Luma's per-referrer attribution is a mechanic the kit does not have at the attendee level |

**Comparison 3 verdict.** Against ticketing incumbents the kit is genuinely
ahead on the artefact set and on attribution, and the claim is defensible line
by line. Two things temper it. First, the incumbents' real advantage is not
tooling, it is demand (Eventbrite's marketplace) and relationships (Oztix and
Moshtix in Victorian live music), and no promo kit substitutes for either.
Second, the wedge that matters in Victoria is not Eventbrite: this repository's
own measurement of one Beat gig guide page found Oztix 24, Humanitix 18 and
TryBooking 10 ticket links (`docs/design/PHASE-C.md` part 0, point 5). The
platform the Geelong promoter must be argued away from is Oztix or Humanitix,
and neither is in trouble.

---

## PART 2: THE PAIN

The founder ranks this first. The honest answer is uncomfortable and has two
halves.

### 2.1 Is there a real, felt, recurring pain here

**Yes, but it is a different pain from the one the tool leads with.**

The tool's hook is "build your event, map your room, get your complete promo
kit, in minutes, free". That is a promise about ASSET PRODUCTION SPEED. Asset
production speed is not a top-five organiser complaint in any source I found.
It is not in the switching-trigger list, it is not in the barrier-to-signup
list, and it is not in the biggest-headache list.

The reason is Canva. Canva made poster production cheap, fast and good enough
for a market that was previously served by a designer or a Word document. The
manual status quo for step 2 is not "hours of pain"; it is a template library
and a fifteen-minute drag. A tool that competes on being faster than Canva at
making one poster is competing for a few minutes of a job that has already been
substantially solved.

**What has NOT been solved, and is genuinely painful, recurring and acute:**

| Rank | The pain | How acute | How often | Evidence |
|---|---|---|---|---|
| 1 | The room does not fill | Existential. It is the whole job | Every single event | 52 percent name it the biggest headache ([Bizzabo](https://www.bizzabo.com/blog/event-marketing-statistics)) |
| 2 | Nobody knows which channel worked | Chronic, low-grade, compounding | Every event, forever | 40 percent cannot prove ROI ([Bizzabo](https://www.bizzabo.com/blog/event-marketing-statistics)) |
| 3 | Fees eat the margin | Sharp at settlement | Every paid event | 52.1 percent name it the top barrier (secondary, unverified primary) |
| 4 | The work is scattered across five tools | Grinding, invisible | Every event | Fragmentation named directly ([Tixr](https://creators.tixr.com/post/modern-vs-legacy-ticketing-why-event-organizers-are-choosing-platforms-like-tixr)) |
| 5 | You do not own your audience | Felt only when you try to leave | Once, painfully | Data ownership named as a switch trigger ([Posh](https://posh.vip/university/post/switch-ticketing-platforms-without-losing-audience)) |
| 6 | Resizing and recaptioning per channel | Annoying | 6.5 channels per event now, up from 4.79 ([Bizzabo](https://www.bizzabo.com/blog/event-marketing-statistics)) | Sourced |
| 7 | Making the first poster | Mild | Once per event | No source names it as a complaint |

### 2.2 Mapping the tool to the pain

| Pain | What the kit actually does | Verdict |
|---|---|---|
| 1. Room does not fill | Nothing directly. The demand engine (feed, alerts, follows) is a platform feature, not a kit feature, and on a zero-user platform it delivers zero reach on day one | **DOES NOT ADDRESS** |
| 2. Nobody knows what worked | Directly and well. Every kit artefact carries its own tracked short link; the QR is channel `qr`; reach attributes views, clicks, orders and tickets per channel, deduplicated per visitor per day and capped at one conversion per link-order pair | **ADDRESSES, and this is the strongest match in the product** |
| 3. Fees | Not a kit feature. The two-fee model is a platform decision | **OUT OF SCOPE** |
| 4. Fragmentation | Partly. Page, poster, card, links and measurement in one screen is genuinely less scattered. But the organiser still leaves for Instagram, still writes their own captions, and still resizes their own story | **PARTLY ADDRESSES** |
| 5. Audience ownership | Not a kit feature. Attendee export is a platform feature | **OUT OF SCOPE** |
| 6. Resize and recaption per channel | Nothing. One 1200x630 card, no captions, no story or square sizes. Verified absent this session | **DOES NOT ADDRESS** |
| 7. Making the first poster | Fully, and better than the alternative in one specific way: the QR is live and tracked | **ADDRESSES the weakest pain on the list** |

### 2.3 Every pain the tool does not address, stated plainly

1. **Filling the room.** The kit hands over assets. It does not bring anyone.
2. **Per-channel assets.** No story, no square, no 4:5. One link preview format.
3. **Captions.** The organiser writes every word of every post.
4. **The three weeks of repetition.** The kit is a one-shot delivery at publish.
   Pattern C in `docs/design/LAUNCH-KIT-PLAN.md` section 6 addresses this and is
   explicitly post-launch.
5. **Recurring events.** Not built (founder-supplied fact). A weekly night has
   to be recreated every week, which is the single most common shape in segment
   A and B.
6. **Fees and audience ownership.** Platform-level, correctly out of the kit.
7. **Anything after the door opens.** Check-in exists as a separate surface, not
   as part of the kit narrative.

### 2.4 The honest reframe

**Inference, clearly labelled.** The kit is not weak. It is pointed at the wrong
sentence. "Get your promo kit in minutes" competes with Canva on a solved
problem. "Every poster, every link, every share, measured, so you finally know
what sold the room" competes with nothing, addresses pain number 2, and is the
one claim the code fully supports today. The tracked-QR-poster to reach-panel
chain is the product's actual differentiator and it is currently described as a
footnote under the poster rather than as the reason to use the tool.

---

## PART 3: WOULD THEY SWITCH

### 3.1 The good news: for this tool, switching cost is unusually low

Most tools that fail on switching cost fail because the user must migrate
something. The Launch Kit is used at EVENT CREATION time, on a NEW event. There
is nothing to migrate. No historical sales, no attendee list, no reissued
tickets, no URL already printed on posters. The organiser runs the next gig
here and keeps the previous ones wherever they were.

**Inference:** this is a genuine structural advantage and it is under-used in
the framing. The switching unit is one event, not one business. That is the
cheapest possible ask in this market.

**What they must abandon, stated directly.** Nothing, and that is the answer.
Not their existing platform, which keeps running their other events. Not their
audience, which for segment A lives on Instagram and in a phone rather than in a
ticketing CRM. Not their historical data. Not a URL already printed on anything,
because the event is new. The only thing genuinely abandoned is the familiarity
of a checkout they have already watched work, and that is a confidence cost
rather than an asset cost. **This is the single most favourable fact in the
entire analysis and the product does not currently say it anywhere.**

### 3.2 The bad news: the tool asks for the commitment BEFORE it delivers

This is the central finding of the whole analysis and it is verified in code.

The kit renders only when `event.status === 'published'`. Below that, the
organiser gets a locked card reading "Your launch kit unlocks when you publish"
(`src/app/(dashboard)/dashboard/events/[id]/launch-kit/page.tsx:128-160`).

The full gate sequence a stranger passes before seeing the bait, each verified:

1. Sign up, including an email verification step.
2. Log in. Every dashboard route redirects to `/login` with no session
   (`src/app/(dashboard)/layout.tsx:20`, confirmed live in the audit drive:
   anonymous `/dashboard/events/create` landed on
   `/login?redirect=%2Fdashboard%2Fevents%2Fcreate`, recorded in
   `docs/design/launch-kit-audit-2026-07-25/drive-results.json`).
3. Create an organisation
   (`src/app/(dashboard)/dashboard/events/create/page.tsx:22-44`).
4. Complete a seven-step wizard.
5. **Publish a real event on a platform with no track record.**

Only then does the kit render.

**So the founder's framing "free, no ticketing commitment required" is not what
the code does.** Publishing an event is the ticketing commitment. The organiser
must decide EventLinqs is their ticketing platform before they are allowed to
see whether the tool is any good. The bait is behind the hook.

The fix is fully specified. `docs/design/PHASE-C.md` part 4 sets out
`/launch`, a public anonymous composer with a staged reveal and a
save-after-value email gate, down to the cookie contract, the migration shape,
the abuse posture and the acceptance test. It is marked "DO NOT BUILD YET".
**Verified absent:** `src/app/launch` does not exist (directory listing of
`src/app`, this session).

### 3.3 What an organiser loses by trying this

| What they risk | Severity | Mitigated today? |
|---|---|---|
| The money. Their ticket revenue sits with an unknown company until after the event | **HIGH.** Fast payout is named as a real operational advantage for small businesses with tight cash flow ([Tixr](https://creators.tixr.com/post/how-to-choose-a-ticketing-platform)) | Partly. The funds-holding model is proven in Stripe TEST across 16 surfaces per `CLAUDE.md`, but no organiser has ever been paid out in production |
| The event. If checkout breaks on the night, the gig is the casualty | **HIGH** | Not mitigated by anything the organiser can see. No reviews, no social proof, no other organisers |
| Their reputation. They sent their audience to a platform nobody has heard of | **MEDIUM to HIGH** for segment A, whose audience is personal | Not addressed |
| The time. Seven wizard steps | **LOW.** 17.6 seconds mechanically | Genuinely mitigated |
| Their brand. The A4 poster carries "EVENTLINQS." in gold and the EventLinqs short URL in the footer (`src/lib/broadcast/poster.ts:155-170`) | **MEDIUM.** A promoter with their own identity gets a poster carrying a ticketing platform's mark. Their Canva poster carried their own | Not addressed, and not previously raised |

### 3.4 Where the tool asks for trust it has not earned

1. **The reach panel asks to be believed.** It says "only measured platform
   activity is counted, never estimates"
   (`launch-kit/page.tsx:555`). That is true and it is good engineering. But on
   day one it will read four zeros. See Part 8, risk 1.
2. **The generated description asks to be trusted as the organiser's own
   voice.** The anti-tell gate is strong, but see Part 4.3 for the disclosure
   problem.
3. **The seat map asks to be trusted with the room.** Production holds zero seat
   maps and zero seats (founder-supplied verified fact). The seated half of the
   tool has never rendered a real room for a real buyer.

### 3.5 Does free lower the barrier, or signal low quality

**Neither, in this market. It signals table stakes.** Every credible Australian
competitor is already free for free events: TryBooking states it explicitly
([TryBooking](https://www.trybooking.com/)), Eventbrite free events carry no
fees ([SimpleTix](https://www.simpletix.com/eventbrite-2026-pricing-changes/)),
Humanitix's model funds itself from booking fees on paid tickets
([Humanitix comparison,
GetApp AU](https://www.getapp.com.au/compare/91490/2075424/eventbrite/vs/humanitix)).

"Free" therefore buys no differentiation and costs no credibility. What it does
buy is a lower psychological cost on the FIRST event, which matters because
the switching unit is one event (3.1).

**The genuine free-versus-paid asymmetry is elsewhere and is not being used.**
Eventbrite paywalls its AI ad copy behind Boost at USD 15 to 100 a month; the
scheduler tools charge USD 5 to 99 a month; the specialist seat-map benchmark
charges roughly AUD 0.20 to 0.30 per used seat on top of ticketing (research
recorded in `docs/design/LAUNCH-KIT-AUDIT.md` addendum C1 and C2, fetched
2026-07-25). EventLinqs gives all three natively at zero. That is the money
story, and it is stronger than "free".

---

## PART 4: THE OUTPUT QUALITY QUESTION

The founder's standard: the output must be better than what a person would
produce themselves, not merely faster, and an organiser must be PLEASED to post
it, not merely willing. This is the point the whole strategy turns on, so the
verdicts here are deliberately harsh.

### 4.1 The event page

**BUILT AND PROVEN.** Verdict: **PLEASED.**

The public event page is the strongest artefact in the kit and the only one I
would call unambiguously better than the alternative. It inherits the full
platform design system, the hero treatment, the media components and the motion
engine. Cross-promotion was removed from it in commit `b253057`
(`docs/design/PHASE-C.md` part 2, C1), so the page sells that event alone, which
is a real organiser-first differentiator against Eventbrite's marketplace
behaviour.

**Caveat:** an organiser cannot brand it. The trade press names custom colours,
logos and domain mapping as what stops a page feeling like "a third-party
storefront"
([RSVPify](https://rsvpify.com/best-event-ticketing-platforms-2026/)). Every
EventLinqs page is navy and gold. For segment A that is fine or even a plus. For
a venue with an identity it is a real objection.

### 4.2 The A4 QR poster

**BUILT AND PROVEN** (`docs/design/launch-kit-audit-2026-07-25/05-poster-a4.pdf`,
HTTP 200 recorded in `drive-results.json`). Verdict: **WILLING, not pleased.**

What is genuinely good, read from `src/lib/broadcast/poster.ts`:

- True A4 at 595.28 x 841.89 points, vector text, actually print-ready.
- Cover image cover-fitted to the top 55 percent with overflow cropped by the
  band edge, so a bad aspect ratio never produces a squashed photo.
- A branded navy and gold fallback when no image embeds, so there is never a
  broken poster.
- webp and avif covers converted through sharp, so the common upload formats
  work.
- **The QR is live and tracked.** This is the one thing no competitor's poster
  does.

What stops it being something an organiser is pleased to post:

1. **It is one template, for every event, forever.** Image top, navy band
   bottom, title, date, locality, price, QR right. A comedy night, a worship
   service and a warehouse party get an identical poster. The kit knows the
   event's category and does not use it: a grep for `category` across
   `src/lib/broadcast/`, the poster route and the OG image returns nothing this
   session. This is precisely the "generic template aesthetic" the platform's
   own Law 1 forbids, applied to the artefact the organiser puts on a wall.
2. **It uses `StandardFonts.Helvetica` and `HelveticaBold`**
   (`poster.ts:63-64`), not the brand type stack (Archivo, Hanken Grotesk,
   Manrope). It is clean, and a designer will read it as a default.
3. **It carries the EventLinqs wordmark and short URL, and no organiser logo.**
   There is no logo slot in `PosterInput` (`poster.ts:24-34`). The organiser's
   Canva poster carried their own name. This one carries ours.
4. **Nothing about it can be changed.** No colour, no crop, no layout, no
   alternate size. Canva's entire value proposition is that everything can be
   changed. This is a one-shot download.

**The honest comparison, against the right alternative.** The relevant
comparison is not "no poster at all". It is the Canva or PosterMyWall template
the promoter picked because it matched their night's aesthetic and carried their
own logo, from a library of roughly a million event-specific designs
([PosterMyWall](https://www.postermywall.com/blog/2025/10/29/the-best-concert-poster-maker-and-marketing-tools-compared/)).
Against that, this poster loses on identity, loses on creative range, loses on
editability, and wins on exactly one thing: the QR is live and measured.
**Inference: most segment-A promoters will print this as the door poster because
of the working QR, and still make their own Instagram graphic elsewhere.** That
is a useful outcome. It is not the outcome the acquisition strategy is built on,
which requires the organiser to be surprised.

### 4.3 The social share cards

**BUILT: exactly one card. Verdict: NOT FIT FOR THE STATED PURPOSE.**

The founder's brief says "designed social share cards", plural. The code has
one: `src/app/events/[slug]/opengraph-image.tsx`, 1200 x 630.

The card itself is good. Cover photo, the platform's bottom-up navy scrim, gold
"You are invited" eyebrow, title at 64px dropping to 52px past 60 characters,
date and venue, wordmark with the gold full stop. It falls back to a navy and
gold radial treatment with no cover, so a shared link never renders bare. It is
better than most link previews in the category.

The problem is what 1200 x 630 IS. It is the Open Graph link preview format. It
renders when a link unfurls in a feed or a chat. It is not a post.

- **Instagram does not render link previews in feed, by deliberate product
  design.** Links in captions are not clickable and no preview is generated,
  across regular feed posts, carousels, Reels captions and Live descriptions.
  Instagram renders an Open Graph preview in exactly two places: direct messages
  and the Story link sticker
  ([Share Preview](https://share-preview.com/blog/instagram-link-preview),
  [Open Graph Plus, Instagram guide](https://opengraphplus.com/consumers/instagram)).
  **Sourcing note: this claim was originally written from prior knowledge and
  was sourced only after the round 1 self-audit flagged it.** The kit's own
  Instagram button behaves consistently with it: no share intent exists, so the
  button copies the link to the clipboard instead
  (`src/components/launch-kit/launch-share-row.tsx:59-69`, the copy-based branch
  at `:121-137`). So on the single most important channel for the wedge segment,
  the kit's only designed asset reaches a preview surface only in a DM or behind
  a Story sticker, never in the feed post the promoter actually makes.
- **The organiser saves it by right-clicking.** The kit's card panel says
  "Opens full size: right-click or long-press to save"
  (`launch-kit/page.tsx:459`). There is no download control and no set.
- **The formats that would work are specified and absent.** 1080x1920 story,
  1080x1080 square and 1080x1350 four-by-five are step 1 of
  `docs/design/LAUNCH-KIT-PLAN.md` section 8, estimated at 16 to 20 hours.
  Verified absent by grep this session.

**Verdict: the "designed social share cards" element of the value proposition
does not exist as described.** One link preview is not a share card set, and the
one that exists is in the one format the wedge channel cannot render.

### 4.4 The generated copy

**BUILT AND PROVEN in staging.** Verdict: **PLEASED, with a disclosure risk.**

This is the best engineering in the kit and it is genuinely ahead of the market.

- Two passes: Haiku 4.5 for field extraction, Sonnet 5 for the prose the buyer
  reads (`src/lib/ai/magic-start.ts:17-21`).
- Six voice registers selected by event type, each with mandated concreteness
  (`magic-start.ts:134-146`).
- A no-invention rule enforced at the schema level: unstated fields come back
  empty and named in `unresolved`, never guessed (`:128`).
- **A two-layer anti-tell gate.** Layer one strips dashes and exclamation marks
  mechanically. Layer two runs a researched lexicon (`src/lib/ai/copy-tells.json`),
  fails a telling draft, regenerates ONCE with the violations named, and then
  blanks the field and flags it rather than shipping a tell
  (`magic-start.ts:223-256`, `blankTellingFields` at `:330-346`). The gate
  cannot lose. Twenty-two banned patterns are documented with before-and-after
  fixtures in `docs/design/PHASE-C.md` section C3, which reports 34 tests in
  `tests/unit/copy-tell-gate.test.ts` and `tests/unit/magic-start-gate.test.ts`.
  **I did not run those tests this session. The test count is cited from a
  repository document, not observed, and it is not my evidence.** What is my
  evidence is the gate's control flow, which I read line by line at
  `magic-start.ts:223-256` and `:330-346`.
- The organiser's free text is wrapped as untrusted data, never merged into the
  instruction (`asUntrustedBlock`).

Against the market this is a clear lead. Eventbrite is the only major incumbent
with in-product generation and frames its own output as "a starting point for
them to revise and edit"; Humanitix and TryBooking ship none; Ticket Tailor
points organisers at an external assistant (research recorded in
`docs/design/LAUNCH-KIT-AUDIT.md` addendum C1, fetched 2026-07-25).

**The risk that is not engineered away.** The trust penalty for AI content is
real and it is about DISCLOSURE, not quality. In a Bynder study of 2,000 UK and
US consumers, 56 percent chose the AI-generated article as more engaging when
it was unlabelled, and 52 percent reported feeling less engaged with the same
article once told its origin
([MarTech](https://martech.org/consumers-like-ai-content-until-they-know-its-ai/)).
Broader 2026 data points the same way: YouGov found 32 percent would trust a
brand less if they knew its content was AI-generated against 15 percent who
would trust it more, and a June 2026 Harris Poll found 73 percent less likely to
trust an ad they suspect was AI-made (both reported secondhand via
[kompozy](https://kompozy.io/guides/ai-marketing-backlash) and
[Breef](https://www.breef.com/breefingroom/articles/the-ai-marketing-backlash-why-ai-first-brands-are-starting-to-fall-flat);
I did not reach the primaries).

**A small defect the gate lets through, found while auditing this document.**
The kit's own pre-publish copy reads "Your launch kit unlocks when you publish"
(`launch-kit/page.tsx:135-137`). "unlock" is on the platform's own tell lexicon,
in the `generatedOnlyWords` bucket of `src/lib/ai/copy-tells.json`. That bucket
fails GENERATED copy only, on the stated reasoning that in code these words
carry legitimate meanings. The reasoning is sound for code. It does not hold
here: this is user-facing marketing prose on the kit's own delivery surface, and
the lexicon file's own comment says these words are tells "in marketing prose".
The bucket rule is coarser than the law it implements, so the platform's own
copy passes a gate that would reject the identical sentence from the model.
Small, cheap to fix, and worth fixing because the whole anti-tell position
depends on the platform holding itself to the bar it sets for the machine.

**Inference:** the anti-tell gate is the correct response to this evidence, and
the plan's rule of making no public AI claim
(`LAUNCH-KIT-AUDIT.md` C1, "no public 'AI' claim anywhere in the product") is
strategically right. But the ORGANISER knows. If they feel the description is
not their voice, they will rewrite it, and the twenty seconds evaporates. There
is no measurement of how often generated copy survives to publish unedited, and
that is the metric that would settle whether the copy pass is worth its 5.5
seconds of latency (measured in `docs/design/PHASE-C.md` C5).

### 4.5 The seat map

**BUILT, UNPROVEN in production.** Verdict: **strong for segment B, irrelevant
to the wedge.**

The builder is 840 lines
(`src/app/(dashboard)/dashboard/venues/[id]/seat-maps/seat-map-builder.tsx`)
with rows blocks, round and square tables, standing areas, per-seat tools, undo,
zoom, section colours and reusable venue templates. Two extensive rebuild and
benchmark passes are recorded (`docs/design/SEATING-FINAL.md`,
`SEATING-SUPREMACY.md`), with accepted limitations documented rather than
hidden, which is unusually honest engineering.

Three things must be said plainly:

1. **Production holds zero seat maps and zero seats** (founder-supplied verified
   fact). This half of the tool has never been observed live.
2. **The room lives under Venues, a different navigation area.** An organiser
   must create a venue before they can draw a room
   (`docs/design/LAUNCH-KIT-AUDIT.md` item 2, friction note). It is not in the
   twenty-second path.
3. **The wedge segment does not need it.** Standing-room gigs have no seats.
   Segment B needs it and segment B is not the stated wedge.

### 4.6 Summary verdict on output quality

| Artefact | Pleased, or merely willing? | Why |
|---|---|---|
| Event page | **Pleased** | Design-system grade, sells that event alone. Cannot be branded |
| Generated copy | **Pleased** | Genuine market lead. Disclosure risk unmeasured |
| A4 QR poster | **Willing** | Clean, print-ready, tracked QR. One template for every event, default fonts, our wordmark not theirs, unchangeable |
| Social share card | **Not fit for purpose** | One link preview format. Unusable on Instagram. No set, no download control, no captions |
| Seat map | **Pleased, for the segment that needs it** | Not the wedge segment, and never run in production |
| Tracked links and reach | **Pleased** | The real differentiator. Renders four zeros on day one |

**The single sentence.** The kit produces one artefact an organiser would be
proud of (the page), one they would happily use (the poster), one they cannot
use where it matters (the card), and one measurement layer that is the best
thing in the product and currently has nothing to measure.

---

## PART 5: VIRALITY AND SPREAD

The question is structural, not campaign-level: is there anything in the
artefact itself that carries the tool to a new user?

### 5.1 What the kit does carry

| Vector | What it reaches | Verdict |
|---|---|---|
| The A4 poster footer: "EVENTLINQS." plus the short URL (`poster.ts:155-170`) | **Attendees**, on a wall | Brand exposure, not acquisition. An attendee seeing a wordmark on a poster does not become an organiser |
| The OG card wordmark and "Tickets at eventlinqs.com" (`opengraph-image.tsx:190-202`) | **Attendees**, in a feed | Same |
| The tracked short link `/s/[code]` | **Attendees** | Same |
| Share-a-ticket on the order confirmation, with the buyer's exact seat in the invite (`orders/[order_id]/confirmation/page.tsx:339-373`) | **Attendees to attendees** | A real acquisition loop, but it is a BUYER loop and it is not in the kit |
| Invite-an-organiser, `via=organiser-invite` (`confirmation/page.tsx:375-385`) | **Buyers to organisers** | **The one true organiser-acquisition mechanic in the product, and it is on the buyer's confirmation page, not in the kit** |
| The lineup loop: each tagged act gets their own tracked link and sees their tickets sold (`launch-kit/page.tsx:167-171`, `LineupLoopPanel`) | **Organiser to performer, and performers are frequently organisers** | **The only organiser-to-organiser vector inside the kit.** Flag-gated on `broadcast_artists` |

### 5.2 The plain answer

**As built, the kit has no inherent organiser-to-organiser spread.** Every
artefact it produces points at attendees. Nothing in the poster, the card, the
page or the reach panel puts the tool in front of another person who runs
events, and nothing gives an organiser a reason to show it to a peer beyond
ordinary enthusiasm.

The founder's success condition is "uses it once, is genuinely surprised by the
output, and tells another organiser". The first two clauses are product
problems, addressed in Part 4. **The third clause has no mechanism.** It relies
entirely on unprompted word of mouth, and the evidence says word of mouth is how
this market works (58.9 percent rely on referrals, directional source in Part
1.5) but the product does nothing to trigger, ease or reward it.

### 5.3 The three spread vectors assessed individually

**The referral and share-a-ticket mechanic: real, but pointed the wrong way.**
It is genuinely built, genuinely attributed, and it recruits ATTENDEES. It is
the right loop and the wrong audience for a supply-side cold start. The research
in the constitution's own growth plan is explicit that two-thirds of failed
marketplaces die on the supply side.

**The tracked links: measurement, not spread.** A tracked link makes an
organiser's existing reach visible. It does not extend it. This is worth stating
because "tracked links" can be mistaken for a growth mechanic when it is an
analytics mechanic.

**The QR poster: the strongest physical vector, and it is under-built.** A
poster on a venue wall in Geelong is seen by exactly the people the platform
wants: gig-goers, and the promoters and venue staff who walk past it. It is the
only artefact that reaches a physical local community. Two things are missing
that would turn it from exposure into acquisition, and both are small: the
poster has no organiser-facing call to action of any kind, and there is no
second QR or short line that says, in the platform's own words, that the person
reading it can run their own event here for free. **Inference: this is the
cheapest unbuilt spread vector in the product.**

### 5.4 What would structurally make an organiser show another organiser

Ranked by how much they depend on the artefact rather than on marketing.

1. **An artefact so specific to their event that showing it IS showing off the
   event.** Today the poster is identical for every event, so showing it says
   nothing about their night. Event-type theming (4 to 6 hours, Part 6) changes
   what is being shown from "a tool output" to "my gig".
2. **A number they want to repeat.** "WhatsApp sold nine of my thirty-four
   tickets" is a sentence a promoter says out loud to another promoter. Four
   stat cards in a grid is not. The plain-English reach sentence (3 to 5 hours)
   is a virality feature disguised as a copy change.
3. **The lineup loop, reframed.** Every tagged act already gets their own
   tracked link. Each of those acts is a candidate organiser. Handing them a
   result ("your link sold six") plus an offer costs almost nothing and is the
   most natural organiser-to-organiser introduction in the product.
4. **A public artefact URL.** The kit is entirely behind auth. Nothing about it
   can be shown to a peer except by screenshot.

---

## PART 6: THE GAP TO EXTRAORDINARY

Ranked by impact against effort. Hours are the repository's own estimates from
`docs/design/LAUNCH-KIT-AUDIT.md` B5 and `docs/design/LAUNCH-KIT-PLAN.md`
section 8 where those exist, and are marked as mine where they do not.

| # | Missing thing | Cost | What it buys | Source of estimate |
|---|---|---|---|---|
| 1 | **The kit renders on a DRAFT, not only on publish.** Change the `isLive` gate to render the full kit for a draft, with the QR pointing at the draft preview and captioned "goes live the moment you publish", exactly as the `/launch` spec already describes for anonymous users | 6 to 10 h | Removes the publish-before-value inversion for anyone who has signed up. This is the cheap 70 percent of finding 1 and it needs no new route, no new table and no anonymous-abuse posture | **Mine.** The reveal semantics are already specified in PHASE-C 4.3 |
| 2 | **Instagram-shaped assets: 1080x1350, 1080x1920, 1080x1080**, through the same `ImageResponse` pipeline as the existing card, with sharp attention smart-crop for the photo region and the branded fallback when there is no cover | 16 to 20 h | Makes the output usable on the channel the wedge segment actually promotes on. Turns "one link preview" into "a set" | LAUNCH-KIT-PLAN section 8 step 1 |
| 3 | **The caption engine.** Deterministic per-platform composition from real event fields as the base layer so it works with no AI key, the register pass on top when configured, run through the existing tell gate plus per-platform length, hashtag and emoji validators | 14 to 18 h | The other half of "pleased to post". Without it the organiser still writes every word. With it the twenty-second promise is actually true end to end | LAUNCH-KIT-PLAN section 8 step 2 |
| 4 | **The plain-English reach sentence.** "WhatsApp has sold 9 of your 34 tickets. Your poster sold 4." Built from `fetchReachSummary`, unit-tested, on the kit and the reach panel | 3 to 5 h | Closes pain number 2 in a form a person repeats out loud. The highest virality-per-hour item in the product | LAUNCH-KIT-AUDIT B5 item 2 |
| 5 | **Event-type theming.** Use the category the kit already has to vary the poster accent treatment, the eyebrow language and the card line, inside the existing tokens. No new colours | 4 to 6 h | Kills "every EventLinqs poster is identical", which is the specific defect that makes the poster merely acceptable | LAUNCH-KIT-AUDIT B5 item 3 |
| 6 | **An organiser logo slot on the poster**, with the EventLinqs mark reduced to a discreet footer line | 4 to 6 h | Removes the brand-dilution objection in 3.3. Turns the poster from ours into theirs | **Mine** |
| 7 | **The organiser-to-organiser hook, in three places:** an offer line on the poster back or footer, a result-plus-offer to every tagged act in the lineup loop, and the invite-an-organiser link surfaced in the kit itself rather than only on the buyer confirmation | 4 to 8 h | The only structural answer to "tells another organiser". Currently zero | **Mine** |
| 8 | **The public `/launch` composer, reveal and email gate** | 20 to 30 h | Removes the auth wall completely. The full fix for finding 1, and the signature moment. Sequenced after 1 to 7 so it lands on themed, downloadable, captioned artefacts rather than on the current set | LAUNCH-KIT-AUDIT B5 item 5 |
| 9 | **Recurring events** | Not estimated in the repository | A weekly night is the most common shape in segments A and B. Without it the twenty-second promise resets to twenty seconds every single week, which is the opposite of retention | **Mine.** Founder-supplied as not built |
| 10 | **The zeros problem.** A designed first-run state for the reach panel that does not present four zeros under "Watch it travel" | 2 to 4 h | Protects the delivery moment on a zero-user platform. See Part 8 risk 1 | **Mine** |

**Items 1, 4, 5 and 10 total roughly 15 to 25 hours and address the three
cheapest defects in the product.** Items 2 and 3 together are 30 to 38 hours and
are the difference between an asset generator and something an organiser posts
without editing. **Inference: if only one week of work were available, items 1,
4, 5, 6, 7 and 10 (roughly 23 to 39 hours) buy more behaviour change than item 8
alone.**

**What is deliberately NOT on this list, and why.** Auto-publishing to social
platforms. The research in `docs/design/LAUNCH-KIT-PLAN.md` section 2 is
thorough and the conclusion holds: personal Instagram accounts cannot be posted
to by any third party, Meta caption prefill is policy-banned, TikTok and YouTube
treat un-audited apps as private-only, and X charges USD 0.20 per post
containing a URL. The composer pattern is correct and the decision to kill
auto-publishing was right.

---

## PART 6B: HOW WE WOULD KNOW THIS ANALYSIS IS WRONG

This document recommends roughly 51 to 73 hours of work on the strength of
reasoning, not on the strength of data, because the platform has no users and
therefore no data. That makes a falsification plan mandatory rather than
optional. Each row names the metric, the comparison and the threshold that would
prove the recommendation wrong. The four activation events needed for rows 1 to
3 already ship (`src/lib/analytics/plausible.ts:71-158`).

| # | The claim this document makes | The metric | Threshold that FALSIFIES it |
|---|---|---|---|
| 1 | The publish-before-value gate is the main blocker | `kit_started` to `event_published` completion rate among first-time organisers | If over 70 percent of organisers who start the wizard publish anyway, the gate is not the blocker and Part 6 item 1 is wasted work |
| 2 | The output is merely acceptable, not surprising | Share of published events whose generated description is edited before publish, and poster download rate per published event | If under 20 percent edit the description and over 60 percent download the poster, the output already clears the bar and items 5 and 6 drop in priority |
| 3 | The one link-preview card is the binding asset gap | Instagram tracked-link clicks as a share of total tracked clicks, before and after the 1080 assets ship | If Instagram is already the top channel by clicks with only the copy-link button, the asset gap is not binding |
| 4 | Attribution is the real differentiator, not asset speed | In concierge onboarding calls, count how many organisers ask about the reach panel unprompted versus the poster | If nobody asks about reach, the repositioning in 2.4 is wrong and the speed story should stay |
| 5 | The tool has no organiser-to-organiser spread | Signups carrying `via=organiser-invite`, and signups attributable to a tagged act in the lineup loop | Any non-trivial volume here without the Part 6 item 7 work falsifies the "no inherent spread" finding |
| 6 | Free does not differentiate | Objection tracking in the first 25 recruitment conversations: how many name price as the reason they said yes | If price leads the yes-reasons, 3.5 is wrong |

**Two A/B tests worth naming now and running only once volume exists**, per the
skill's requirement not to present an untested opinion as a finding:

- **Kit-on-draft versus kit-on-publish.** The claim in Part 7 finding 1 is the
  single largest assertion in this document and it is untested. Variant A shows
  the full kit on a draft; variant B keeps the current publish gate. Measure
  publish rate. This is the experiment that settles the whole analysis.
- **Poster with the organiser's logo versus with the EventLinqs wordmark.**
  Measure poster download rate and, if it can be instrumented, print-and-display
  rate via QR scans. Risk 6 is currently reasoning, not evidence.

Until these run, every forward-looking statement in Parts 5 to 8 is reasoned
judgement built on verified code facts and cited market data, not measurement,
and should be read that way.

---

## PART 7: THE HONEST VERDICT

**Evidence status of this part.** Every FACT below is verified in code at a named
path or cited to a source. Every JUDGEMENT below (that a given fact is
disqualifying, that the balance falls one way) is my reasoning and is not
measured, because the platform has no users to measure. The three reasons are
facts; the verdict they add up to is inference. Part 6B names the experiment
that would settle it.

**Is this tool, as built today, strong enough to be the acquisition engine for a
platform with zero users in a crowded market?**

**No.**

Not because the engineering is weak. The engineering is better than most of what
the incumbents ship: the anti-tell copy gate has no equivalent in the market, the
tracked-artefact-to-attribution chain has no equivalent in ticketing, and the
poster is genuinely print-ready where competitors hand over a Canva template and
wish you luck.

It is not strong enough for four specific reasons, in order of severity. The
first three are product facts verified in code. The fourth is a positioning
fact established in comparison 2 and it is the cheapest of the four to fix.

**1. The bait requires the commitment first, which inverts the entire
strategy.** The whole premise is that the tool acquires people because it is
free and demands nothing. In the code, the tool renders only after an organiser
has signed up, verified an email, created an organisation, filled a seven-step
wizard and published a live event on a platform with zero track record. An
acquisition tool that requires the acquisition to have already happened is not
an acquisition tool. It is a retention tool with good manners. Until `/launch`
or, more cheaply, the draft-kit render in Part 6 item 1 exists, the strategy
described in the brief is not the strategy the code implements.

**2. The output is not yet what the founder's own bar demands.** The success
condition is "genuinely surprised by the output". Measured against that: the
event page qualifies, the generated copy qualifies, the poster does not because
it is one unchangeable template carrying our wordmark rather than theirs, and
the share cards do not exist in any form usable on Instagram. Two of the five
artefacts clear the bar. "Complete promotional kit" is not what ships; a live
page, a poster, and a link preview is what ships, and the organiser still writes
every caption themselves.

**3. There is no mechanism for the third clause of the success condition.** "And
tells another organiser" has no structural support anywhere in the kit. Every
artefact points at attendees. The one organiser-recruitment link in the product
lives on the buyer's order confirmation page. On a zero-user platform, a tool
with no organiser-to-organiser vector means every single organiser is acquired
by the founder personally, one conversation at a time. That may be the correct
launch plan (the constitution's own growth doctrine says recruit the first 25 to
50 personally) but it means the tool is a CLOSING aid, not an acquisition
engine, and the strategy should say so.

**4. The asset claim is not differentiated, and the differentiated claim is not
the one being made.** From comparison 2: Luma already ships generated share
images, a poster generator, QR codes and attributed referral links; PosterMyWall
already ships an event page with RSVP plus roughly a million event-specific
templates plus email for USD 9.99 a month. A pitch built on "get your complete
promo kit in minutes, free" is a pitch two other products can answer. The pitch
that nothing else can answer is "every poster, every link, every share, measured
against actual ticket sales". This is a reason the tool as CURRENTLY POSITIONED
is not strong enough, and unlike findings 1 to 3 it costs nothing to fix: it is
a change of sentence, not a change of code.

**What would make it strong enough.** Items 1 to 7 in Part 6, roughly 51 to 73
hours. Concretely, the tool becomes an acquisition engine when: a stranger or a
new signup sees their real kit before committing; the kit hands over a set of
assets they can actually post, with words already written; the poster looks like
their event rather than like our template; and something in the artefact puts
the tool in front of the next organiser. None of that is speculative. Every one
of those items is either specified in this repository already or is a small
change to code I have read.

**The comfortable answer would have been that the kit is strong and needs
polish.** That answer is wrong. The kit is a well-built delivery screen at the
end of a funnel, and the strategy needs it to be the front of one.

---

## PART 8: THE RISKS

Including the uncomfortable ones.

**Evidence status of this part.** A risk is by definition a thing that has not
happened, so nothing here is measured. Each risk states its FACTUAL basis (a
code path, a statistic, a recorded project state) separately from the
consequence I infer from it. Where the basis is only my reasoning, the risk says
so in its own words.

**Risk 1: the zeros. The delivery moment fails on day one by design.**
The reach panel renders four stat cards at 3xl extrabold: link views, link
clicks, orders from links, tickets from links (`launch-kit/page.tsx:241-246`,
rendered at `:539-550`), under the heading "Watch it travel" (`:529`). On a
platform with zero users, every organiser's first kit shows 0, 0, 0, 0 in the
largest gold numerals on the screen. The honest empty-state copy underneath is
correct and does not save it. **The single most emotionally loaded moment in the
product, the one the whole strategy depends on, currently ends with four zeros.**
This has not been raised in any repository document I read.

**Risk 2: the wedge segment does not need the most expensive thing you built.**
The seat builder is the largest single engineering investment in the kit, with
two full rebuild passes recorded. Standing-room gigs, which are the Geelong and
Melbourne music wedge, have no seats. Production holds zero seat maps. The
segment that needs the seat builder (small venues, cabaret rooms, theatres) is
not the segment the recruitment plan targets.

**Risk 3: the Eventbrite opening does not apply to the wedge.** The growth
doctrine leans on Eventbrite wobbling under Bending Spoons, which is real and
well sourced. But this repository's own organiser-intelligence work measured the
Victorian platform mix from one Beat gig guide page and found Oztix 24,
Humanitix 18 and TryBooking 10 ticket links (`docs/design/PHASE-C.md` part 0,
point 5). Eventbrite is close to irrelevant for Victorian live music. The
switching story that must be told to a Geelong promoter is a story against
Oztix and Humanitix, and neither of those is wobbling. Humanitix in particular
is a certified B Corp donating booking-fee profits to charity
([GetApp AU](https://www.getapp.com.au/compare/91490/2075424/eventbrite/vs/humanitix)),
which is an emotionally strong position to attack and one that "we have a better
poster generator" does not touch.

**Risk 4: the supply side is shrinking.** Victorian venues hosting at least one
gig a week fell 19.4 percent since 2019, from 813 to 655, and 20 percent of the
state's music venues have permanently closed since 2020
([Music Victoria audit via The
Music](https://themusic.com.au/industry/new-audit-confirms-victoria-holds-the-most-music-venues-in-australia/6khQ_P_-4eA/25-02-26)).
The addressable wedge is contracting, and contracting markets make organisers
more fee-sensitive and less experimental, not more.

**Risk 5: the time claim is an Australian Consumer Law exposure.** The 17.6
second measurement is real (`drive-results.json`,
`totalStartToKitMs: 17577`) and it was produced by Playwright typing at 28
milliseconds per character with every decision pre-made, a cover photo ready,
and one field set per step. A first-time organiser writing their own copy and
choosing a photo will take minutes. The repository already flags this correctly
and the founder already ruled for "in under a minute" with no second count
(`PHASE-C.md` part 1). The residual risk is that "in minutes, free" in the
founder's own framing drifts into public copy without the measured typical run
supporting it.

**Risk 6: the poster carries our brand, not theirs.** Raised in 3.3 and 4.2. For
a promoter who has spent years building an identity, a poster with a ticketing
company's wordmark in gold at the bottom is a downgrade from their Canva poster.
Some will simply not print it, which silently kills the strongest physical
spread vector in the product.

**Risk 7: the organiser knows the copy was generated, even if the audience does
not.** The anti-tell gate handles the audience. It does not handle the
organiser's own feeling that the words are not theirs. If they rewrite the
description, the speed promise evaporates and the two-pass copy investment (5.5
seconds of added latency, measured) buys nothing. **There is no instrumentation
for how often generated copy survives to publish unedited.** That is the metric
that would settle it and it does not exist.

**Risk 8: Magic Start has never run in production.** `ANTHROPIC_API_KEY` is
required on production by the manifest (`src/lib/env/manifest.mjs:772-783`) and
the generated snapshot records it as PRESENT AND CORRECT
(`docs/verification/ENV-STATE.md:80`). But zero events have ever been created in
production, so the AI path has never been exercised there. If it fails on first
contact, it fails at the exact moment a recruited organiser is watching. Note
that `docs/design/LAUNCH-KIT-PLAN.md` section 4.3 point 6, written 2026-07-27,
states production has no key; that statement is now stale and the manifest work
of 2026-07-31 superseded it. The deterministic caption base layer that plan
proposes remains a good idea for exactly this reason.

**Risk 9: the platform cannot currently sell tickets in production.** Recorded
in this project's own working memory as of 2026-07-31: all sixteen production
organisations have `stripe_charges_enabled = false` and no ticket picker
renders. **This is not a kit risk, it is an existential one, and it outranks
everything in this document.** A perfect Launch Kit delivered to an organiser
whose buyers cannot then buy a ticket is worse than no Launch Kit at all,
because it burns a personally recruited relationship. I did not re-verify this
against production this session; it is carried forward from the recorded state.

**Risk 10: the Launch Kit is not in the scope document.** A search of
`docs/EventLinqs_Scope_v5.md` for "launch kit", "poster" and "share card"
returns zero matches. The kit is the acquisition strategy and it is absent from
the document the constitution names as the scope authority. That is a governance
gap, not a product gap, but it means nobody can check the kit against an agreed
definition of what it was meant to be.

---

## APPENDIX A: SOURCES CONSULTED

### External sources, accessed 8 August 2026 unless noted

**Market and industry**
- Bizzabo, 2026 Event Marketing Statistics, Trends and Benchmarks. https://www.bizzabo.com/blog/event-marketing-statistics
- Remo, 70+ Event Statistics for Organizers in 2026. https://remo.co/blog/event-industry-statistics
- Music Victoria 2025 Victorian Live Music Venue Audit, reported by The Music, 26 February 2026. https://themusic.com.au/industry/new-audit-confirms-victoria-holds-the-most-music-venues-in-australia/6khQ_P_-4eA/25-02-26 (the Music Victoria primary at musicvictoria.com.au returned HTTP 403)
- Ticketsauce, Why Switch Ticketing Platforms. https://www.ticketsauce.com/why-switch
- Tixr, Modern vs Legacy Ticketing. https://creators.tixr.com/post/modern-vs-legacy-ticketing-why-event-organizers-are-choosing-platforms-like-tixr
- Tixr, How to Choose a Ticketing Platform in 2026. https://creators.tixr.com/post/how-to-choose-a-ticketing-platform
- Posh University, How to Switch Ticketing Platforms Without Losing Your Audience. https://posh.vip/university/post/switch-ticketing-platforms-without-losing-audience
- RSVPify, 12 Best Event Ticketing Platforms for Small Businesses and Promoters in 2026. https://rsvpify.com/best-event-ticketing-platforms-2026/

**Eventbrite and Bending Spoons**
- Event Tech Live, Bending Spoons Just Took Eventbrite Private. https://eventtechlive.com/500-million-180-countries-zero-quarterly-earnings-calls-bending-spoons-just-took-eventbrite-private/
- Ticket Tailor, What Eventbrite Users Can Expect From the Bending Spoons Takeover. https://www.tickettailor.com/blog/bending-spoons-acquires-eventbrite-what-does-this-mean
- SimpleTix, Eventbrite Pricing 2026. https://www.simpletix.com/eventbrite-2026-pricing-changes/
- TickPick Organizer, Eventbrite's 2026 Changes. https://www.tickpick.com/blog/organizer/eventbrite-2026-fee-changes
- Eventbrite, Event marketing tools and platform for organizers. https://www.eventbrite.com/organizer/features/event-marketing-platform/

**Competitor organiser tooling**
- Humanitix Help Centre, Communicate your event's impact using the Promotional Hub (primary, fetched). https://help.humanitix.com/en/articles/8913665-communicate-your-events-impact-using-the-promotional-hub
- GetApp Australia, Eventbrite vs Humanitix comparison. https://www.getapp.com.au/compare/91490/2075424/eventbrite/vs/humanitix
- TryBooking. https://www.trybooking.com/
- Moshtix for Event Organisers, Promote. https://business.moshtix.com/promote
- Oztix, Venues and event organisers. https://www.oztix.com.au/venues-organisers/
- Luma Help, How to Promote Your Event and Grow Attendance. https://help.luma.com/p/promote-your-event
- Luma Help, Event Referrals. https://help.luma.com/p/event-referrals
- **Excluded deliberately:** lumalabs.ai "AI Poster Generator" results returned by search. Luma Labs is a different company from lu.ma and conflating them would have produced a false competitor claim.

**Event marketing and promotion tools (comparison 2)**
- PosterMyWall, Canva vs PosterMyWall. https://www.postermywall.com/index.php/c/canva-vs-postermywall
- PosterMyWall Gradient, The best concert poster maker and marketing tools compared. https://www.postermywall.com/blog/2025/10/29/the-best-concert-poster-maker-and-marketing-tools-compared/
- Software Advice, Canva vs PosterMyWall 2026. https://www.softwareadvice.com/graphic-design/canva-profile/vs/postermywall/
- Scheduler pricing (Buffer, Later, Metricool, Hootsuite, Publer) and the notification-publishing fallback pattern: recorded in `docs/design/LAUNCH-KIT-PLAN.md` section 3.1, fetched by that session on 2026-07-27 from each tool's own help pages

**Abandonment**
- Stripe customer story, Ticket Tailor (primary, fetched: "the highest drop-off point in its customer journey was during onboarding for payments"). https://stripe.com/customers/ticket-tailor
- Ticket Falcon, Event Registration Setup Guide That Works. https://www.ticketfalcon.com/event-registration-setup-guide-that-works/

**Instagram link-preview behaviour**
- Share Preview, Instagram Link Preview: Why It Looks Different and How to Fix It (2026). https://share-preview.com/blog/instagram-link-preview
- Open Graph Plus, Instagram Open Graph Tags Guide: DM and Story Link Previews. https://opengraphplus.com/consumers/instagram
- Sourced only after the round 1 self-audit flagged the claim as written from prior knowledge.

**Incumbent organiser tooling cited via the repository's 2026-07-25 research**
- Eventbrite help article 719933 (Share on Social, and the documented no-event-link weakness). https://www.eventbrite.com/help/en-us/articles/719933
- Ticket Tailor AI MCP connector. https://www.tickettailor.com/features/ai-mcp-connector
- Both are recorded in `docs/design/LAUNCH-KIT-AUDIT.md` C1 and `docs/design/LAUNCH-KIT-PLAN.md` 3.2. I did not re-fetch them this session and they are labelled as second-hand wherever used.

**The manual status quo**
- Canva, Free Online Poster Maker. https://www.canva.com/create/posters/
- Canva, Free and customizable event templates. https://www.canva.com/templates/s/event/
- Linktree, Canva Integration. https://linktr.ee/features/canva-integration
- Last Minute Musicians, How To Promote A Gig. https://www.lastminutemusicians.com/how_to_get_gigs/3-steps-to-promoting-a-gig/
- RouteNote, How to promote your gig. https://routenote.com/blog/how-to-promote-your-gig-6-tips-for-success/

**AI content trust**
- MarTech, Consumers like AI content until they know it's AI (Bynder study, 2,000 UK and US consumers). https://martech.org/consumers-like-ai-content-until-they-know-its-ai/
- Kompozy, The AI marketing backlash (secondary for YouGov and Fractl figures). https://kompozy.io/guides/ai-marketing-backlash
- Breef, The AI Marketing Backlash (secondary for the June 2026 Harris Poll figures). https://www.breef.com/breefingroom/articles/the-ai-marketing-backlash-why-ai-first-brands-are-starting-to-fall-flat

**Product-led growth**
- ProductLed, Product-Led Growth Benchmarks. https://productled.com/blog/product-led-growth-benchmarks

**QR codes** (used sparingly and flagged as vendor-sourced)
- Bitly, QR Code Statistics. https://bitly.com/blog/qr-code-statistics/
- Linkbreakers, QR Code Scan Rate Benchmarks by Industry. https://linkbreakers.com/help/article/qr-code-scan-rate-benchmarks-by-industry

### Repository sources read in full or in part

| File | What it supplied |
|---|---|
| `src/app/(dashboard)/dashboard/events/[id]/launch-kit/page.tsx` | The whole kit screen, the `isLive` gate, the reach stats, the share row wiring |
| `src/lib/broadcast/poster.ts` | The A4 poster renderer, fonts, layout, wordmark |
| `src/app/api/organiser/events/[id]/poster/route.ts` | The poster route, tracked QR, download signal |
| `src/app/events/[slug]/opengraph-image.tsx` | The 1200x630 invitation card |
| `src/lib/broadcast/og-theme.ts` | The card token swap point |
| `src/components/launch-kit/launch-share-row.tsx` | Every share intent, and the Instagram copy-only branch |
| `src/lib/ai/magic-start.ts` | Two-pass model choice, voice registers, no-invention rule, the anti-tell gate flow |
| `src/lib/ai/copy-tells.ts` | The lexicon consumption |
| `src/lib/ai/client.ts`, `src/lib/ai/cost-guard.ts` | AI configuration and the fail-open budget guard |
| `src/lib/flags.ts` | `launch_kit` and `magic_start` default ON |
| `src/lib/env/manifest.mjs` (ANTHROPIC block) | Production key requirement |
| `docs/verification/ENV-STATE.md` | Generated snapshot showing the key present on production |
| `docs/design/LAUNCH-KIT-AUDIT.md` | Phase A inventory, the 17.6s run, the auth-wall finding, the competitor and seat-tool research |
| `docs/design/launch-kit-audit-2026-07-25/drive-results.json` | The raw timings and checks |
| `docs/design/PHASE-C.md` | What shipped (C1 to C5), the founder rulings, the `/launch` spec marked do-not-build |
| `docs/design/LAUNCH-KIT-PLAN.md` | The per-platform API reality, the three patterns, the composer recommendation, the build sequence and hours |
| `docs/design/SEATING-FINAL.md` | Seating closure and accepted limitations |
| `docs/EventLinqs_Scope_v5.md` | Searched: contains no reference to the Launch Kit, poster, or share cards |
| `CLAUDE.md` | The governing laws, growth doctrine, Definition of Done |

### Verification commands run this session

| Claim | Command | Result |
|---|---|---|
| `/launch` does not exist | directory listing of `src/app` | 40+ routes listed, no `launch` |
| No story or square card composer | grep for `1080x1920`, `width: 1080`, `story-card`, `square-card` across `src` | zero matches |
| No event-type theming in kit artefacts | grep for `category` across `src/lib/broadcast/`, the poster route, the OG image | zero matches |
| No plain-English reach sentence | grep on the reach page for `sold`, `verdict`, `plain` | zero matches (file is 167 lines) |
| Activation metrics exist | grep for the four event names across `src` | present in `plausible.ts`, `event-form.tsx`, `kit-rendered-tracker.tsx`, `events/actions.ts` |
| Audit evidence exists | listing of `docs/design/launch-kit-audit-2026-07-25/` | 24 files including the poster PDF, the OG card and `drive-results.json` |

### Facts taken on the founder's authority and NOT independently re-verified

- Production holds zero seat maps and zero seats; no production event has ever
  been created.
- Zero organisers have used the kit; zero tickets sold.
- Verification covered 314 pages and 148 screenshots in staging.
- Recurring events are not built.
- The production selling blocker recorded in project memory as of 2026-07-31.

I did not query production this session. Every production statement above is
carried forward from the founder's brief or from recorded project state, and is
labelled as such wherever it is used.
