# LAUNCH KIT: the social publishing plan

Date: 2026-07-27. Status: RESEARCH AND DESIGN ONLY, awaiting founder approval.
Nothing in this phase touched src. The two design proofs live in
`docs/design/launch-kit-proof/` (kit-screen-1440.png, kit-screen-390.png,
publish-flow.png).

INTERNAL DOCUMENT. Competitor names appear below as research context; none of
this language is for any public surface.

Every external claim in this document was fetched live on 2026-07-27 by
research agents working only from live sources, with the URL beside the claim.
Where a fact could not be verified from a live source it is marked NOT
VERIFIED, never assumed.

---

## 1. The premise (the founder's vision, held as the bar)

The Launch Kit must feel like a social media handle, not a file download. The
organiser brings their event and their media; it publishes as well as a human
would, with the right caption, the right crop and the right format for each
platform. It detects what the media is and treats it correctly. One touch, one
place, reachable from anywhere including a link in a bio. Nothing is double
handled. If they have to go and find it, we have lost them.

Every decision below is judged against that sentence.

---

## 2. The per-platform API reality (A1)

The single most important research finding: **true one-touch API publishing is
gated on every platform that matters, and the gates are measured in weeks of
review, per-post fees, or both.** Meanwhile a zero-review "intent" layer
exists on half the platforms that carries a fully written post into the
platform's own composer with no account connection at all.

### 2.1 The reality table

| Platform | Third-party publish via official API | Account type + permission | Review gate and duration | Composer prefill with NO API |
|---|---|---|---|---|
| Instagram | YES, but professional accounts only. Personal accounts have no publishing API at all | Business or Creator. Newer route (Instagram Login): `instagram_business_content_publish`, no Facebook Page needed. Older route (Facebook Login): `instagram_content_publish` plus a linked Facebook Page | Meta App Review mandatory for public apps, plus Business Verification for advanced access. Official duration unpublished (NOT VERIFIED); practitioner reports of up to 20 days by mid 2026 | Image YES via native share (Android intent, iOS document interaction). Caption NO: no parameter exists, and Meta policy bans pre-filling shared content. Both together: NO |
| Facebook Pages | YES, Pages only. There is NO API to post to a personal profile timeline | Page access token; user needs the CREATE_CONTENT Page task; `pages_manage_posts` | Same Meta App Review + Business Verification framework. Duration NOT VERIFIED | Share dialog carries the URL (plus an optional hashtag). Text prefill is policy-banned. Link card unfurls from our OG tags |
| Threads | YES (Threads API, 2024) | Any authorised Threads profile; `threads_basic` + `threads_content_publish`; public-profile grants last 90 days | Meta App Review for public apps. Duration NOT VERIFIED | The one Meta surface with an official composer intent: text + link + tag prefill. Images cannot be prefilled |
| WhatsApp | NO social posting exists. Cloud API is opt-in 1:1 template messaging; Channels have no API; Status has no API | WABA + business phone number (Cloud API only) | Business Verification to scale past 250 unique customers per day | wa.me prefills full message text with zero review, no account, no app. Text only, no image parameter |
| TikTok | YES (Content Posting API, `video.publish`) | Any authorised user | Mandatory audit: UNAUDITED apps can only post PRIVATE (SELF_ONLY), max 5 users per 24h. FAQ: review "several days to two weeks"; audit-specific duration NOT VERIFIED. Post-audit: ~15 posts per creator per 24h | None. No web intent, no upload prefill. The old web share kit was sunset in 2023 |
| X | YES (`POST /2/tweets`, `tweet.write`) | Any authorised user | No review documented, BUT pay-per-use pricing (2026): USD $0.015 per post, **USD $0.20 per post containing a URL**. Every event post carries a URL | Official web intent prefills text + url + hashtags + via attribution, free, no review |
| LinkedIn | YES. Member posts: `w_member_social`, self-serve. Organisation pages: `w_organization_social` via the Community Management API | Member: any profile. Page: admin-role holders | Page route: registered legal organisations only, business email vetting, Development then Standard tier with a screen-recording review; a rejected app can never re-apply. Duration NOT VERIFIED | Share plugin / share-offsite carries the URL only. Text prefill NOT VERIFIED (not documented). Link preview comes from the target page's own metadata |
| YouTube Shorts | YES (`videos.insert`, `youtube.upload` scope). A Short = square or vertical video up to 3 minutes (uploads on or after 15 Oct 2024), classified automatically | Any authorised channel | Unverified API projects upload PRIVATE-ONLY until an audit. Duration NOT VERIFIED (secondary reports: weeks to months). Hard cap 100 uploads per day per project | None documented |
| Reddit | YES (`POST /api/submit`, scope `submit`) | Any authorised account | No formal review for standard access, BUT commercial use requires a separate agreement with Reddit, and mass promotion is Reddit's named spam pattern | reddit.com/submit prefills url + title (300 chars); per-subreddit targeting works. (Parameter behaviour corroborated by developer references; official docs NOT VERIFIED) |

Key sources (all accessed 2026-07-27):
Instagram/Facebook/Threads/WhatsApp: developers.facebook.com/docs/instagram-platform/content-publishing, /docs/permissions, /docs/app-review/, /docs/pages-api/posts/, /docs/threads/posts, /docs/threads/threads-web-intents, /docs/whatsapp/cloud-api/, /docs/whatsapp/messaging-limits, /docs/sharing/ios, /docs/sharing/android, developers.facebook.com/devpolicy/, faq.whatsapp.com/5913398998672934, bundle.social/blog/meta-app-review-20-days (secondary).
TikTok: developers.tiktok.com/doc/content-posting-api-get-started/, /doc/content-sharing-guidelines, /doc/getting-started-faq.
X: docs.x.com/x-api/getting-started/pricing, /x-api/posts/create-post, /x-for-websites/post-button/overview, help.x.com/en/rules-and-policies/x-automation.
LinkedIn: learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review, /marketing/community-management/shares/posts-api, /consumer/integrations/self-serve/share-on-linkedin, /consumer/integrations/self-serve/plugins/share-plugin.
YouTube: developers.google.com/youtube/v3/docs/videos/insert, /guides/quota_and_compliance_audits, support.google.com/youtube/answer/15424877.
Reddit: reddit.com/dev/api#POST_api_submit, redditinc.com/policies/data-api-terms, support.reddithelp.com/hc/en-us/articles/360043504051.

### 2.2 The hard walls that shape the product

1. **Personal Instagram accounts cannot be posted to via API, full stop.** Only
   Business or Creator accounts, and production access sits behind Meta App
   Review with no published duration. Meta policy also bans pre-filling a
   caption through the share sheet: the image can be handed over, the words
   cannot.
2. **TikTok and YouTube treat un-audited apps as private-only.** A post made
   through an unapproved app is invisible to the public. There is no partial
   credit.
3. **X now charges USD $0.20 per API post containing a URL.** Every event post
   contains a URL. The free web intent carries the same text and link with no
   fee and no review.
4. **Identical cross-posting is explicitly banned** by X ("duplicative or
   substantially similar posts"), is Reddit's named spam pattern, and TikTok
   names "an app that copies arbitrary contents from other platforms" as a
   rejection category. Whatever we build must compose per-platform variants,
   which we want anyway for quality.
5. **WhatsApp has no feed to post to**, and our marketing brief already records
   that third party DM automation breaches Meta's terms. The lawful WhatsApp
   surface is the wa.me prefilled message, which needs no review at all.
6. **Media constraints that matter:** Instagram feed images are JPEG only,
   4:5 to 1.91:1, 8 MB; Stories and Reels want 9:16; API-published Stories
   cannot carry link stickers. Threads text caps at 500 characters. X posts at
   280 with a URL costing 23. Reddit titles at 300. A Short is vertical or
   square, up to 3 minutes. Captions: Instagram 2,200 chars and 30 hashtags
   max (3 to 5 recommended in practice).

---

## 3. How the best tools actually solve it (A2)

All fetched live 2026-07-27 from each tool's own help pages.

### 3.1 The pattern every serious tool converged on

Every 2026 scheduler (Buffer, Later, Metricool, Hootsuite, Publer, SocialBee,
Planable, Postiz) auto-publishes via API to the same set: Instagram
professional feed and Reels, Facebook Pages, X, LinkedIn, TikTok, YouTube,
Threads, Pinterest, Google Business. And every one of them falls back to the
SAME manual handoff for the same cases: Instagram Stories with interactive
elements, trending audio, personal accounts, Facebook Groups, out-of-range
aspect ratios.

That fallback is a standardised industry pattern called notification
publishing: a push notification, the media saved to the phone, the caption
copied to the clipboard, a deep link into the native app, and the human
finishes the post. Buffer, Later, Metricool and Hootsuite all document this
identical flow (support.buffer.com/article/658, help.later.com/hc/en-us/articles/360043360553,
help.metricool.com/en/article/how-to-manually-publish-via-notification-1npgf9m,
help.hootsuite.com/s/article/mobile-notification-workflow).

Notable specifics:

- Buffer does NOT auto-crop a bad ratio; it downgrades that post to a
  notification handoff and offers a crop tool (support.buffer.com/article/622).
- Hootsuite: Instagram direct publish is Business-profile-only; Creator
  profiles are reminder-only for everything; 25 API posts per rolling 24h.
- Canva's content planner is the weakest: Business accounts only, no Stories,
  no Reels, no carousels, one design to one platform at a time.
- Onboarding tax is universal: Instagram professional account, usually a
  linked Facebook Page, Meta OAuth, and documented reconnection nagging
  (Later's "refresh your social profile", Metricool's permission renewals,
  Canva's dedicated error page for Creator accounts).
- Entry pricing: Buffer free then $5/channel/month; Later $18.75/mo; Metricool
  free then EUR 16/mo; Hootsuite $99/mo; Publer $4 to 5/account/mo.

### 3.2 What ticketing platforms do (the direct competitors)

- **Eventbrite** is the only one with true auto-posting: Share on Social posts
  to Instagram (Business account + linked Facebook Page + admin + granted
  permissions), auto-generates a caption, up to 10 images. Its documented
  weakness: "Your post doesn't automatically link to your Eventbrite event"
  (eventbrite.com/help/en-us/articles/719933).
- **Humanitix**: Canva templates the organiser edits, downloads and posts
  manually. No auto-post (help.humanitix.com/en/articles/8913665).
- **Meetup**: share intents and a downloadable flyer. No auto-post.
- **Luma** (the event-kit design benchmark): generated OG images, a Share
  Event Poster generator, QR codes, referral links with per-referrer
  attribution, attendee share prompts. The human does every post
  (help.luma.com/p/promote-your-event).

Conclusion: in ticketing, generated assets plus attributed links IS the state
of the art, and the one auto-poster (Eventbrite) cannot even link the post to
the event. A kit that composes per-platform assets AND captions AND hands them
over with tracked links beats every ticketing incumbent on day one without a
single API approval.

---

## 4. Caption intelligence (A3)

### 4.1 What reads as human in 2026 (researched, cited)

Per-platform conventions (all accessed 2026-07-27):

| Platform | The convention |
|---|---|
| Instagram | Hook and reason-to-care inside the first 125 characters (the fold). Ideal length 138 to 150 chars. Line breaks, 1 to 3 sentence paragraphs. 3 to 5 niche hashtags at the END, never a wall (blog.hootsuite.com/ideal-social-media-post-length/, posttruncate.com/en/blog/instagram-caption-limits-and-hashtag-rules-2026/) |
| TikTok | Primary keyword in the first 50 characters, natural language; 150 to 300 chars; 3 to 5 hashtags; stuffing is penalised (blog.hootsuite.com/tiktok-seo/, monolit.sh/blog/how-long-should-tiktok-caption-be-2026-data-backed-answer-founders) |
| X | 71 to 100 characters ideal; 0 to 2 hashtags integrated into the sentence (hashtagtools.io/blog/x-twitter-hashtag-trending-guide) |
| LinkedIn | First line earns the click (under 150 chars above the fold), blank line, short paragraphs; 3 hashtags max at the end; OVER-formatting "reads as generated" (connectsafely.ai/articles/linkedin-post-best-practices-guide-2026) |
| Facebook | Shortest wins: 40 to 80 characters gets the most engagement; let the link card do the visual work (hookagency.com/blog/facebook-post-length/) |

Named AI tells specific to social captions (sources name these exactly):

- Emoji clusters (rocket, fire, sparkles "peppered into every paragraph") are
  the number one robot tell; one or two emoji read human (blog.push.fm/24032/ai-captions/).
- "We're thrilled to announce" (the named LinkedIn announcement cliche),
  "Don't miss out", "Mark your calendars" (named overused event phrases),
  "In today's fast-paced digital world", rhetorical-question openers
  (leapshq.com/blog/thrilled-to-announce-alternatives, addevent.com/blog/youre-missing-out-on-using-fomo..., clearvoice.com/resources/most-overused-phrases-in-content-marketing/).
- Structural tells: hook question + three bullets + "What are your thoughts?";
  "No X. No Y. Just Z."; rectangular paragraphs with zero sentence-length
  variation; no contractions, no lived detail (oliviacal.com/post/ai-writing-tells, sweetorange.co.nz/the-most-annoying-buzzwords-of-2026/).
- What humans do instead: concrete specifics (who it is for, times, price,
  venue), one plain CTA ("Tickets in bio"), tag the artists and venue early,
  register matched to the event type: club nights run on energy, comedy runs
  on the promoter's own voice, family events run on practical detail, corporate
  runs on who-should-come-and-why (ticketleap.com/blog/instagram-event-promotion/, converve.com/event-networking-blog/how-to-promote-events-on-linkedin-2026-guide, ticketfairy.com/blog/family-first-defining-your-festivals-promise-to-parents-and-kids).
- NOT VERIFIED as named tells (do not add to the lexicon without a source):
  "Get ready to" is already in our lexicon from the earlier audit; "Calling
  all", hashtag walls and title-case captions were not named by any fetched
  source, though hashtag stuffing is platform-penalised regardless.

### 4.2 How the copy gate extends to captions

What exists: `enforceCopyLaws` (src/lib/ai/sanitise.ts:66) mechanically strips
dashes and exclamation marks; `findCopyTells` (src/lib/ai/copy-tells.ts:39)
fails a draft on any lexicon hit (src/lib/ai/copy-tells.json), with
regenerate-once-then-blank semantics already proven in the Magic Start flow.

The extension for social captions, in order:

1. **The same gate runs on every generated caption**, unchanged: dash and
   exclamation strip, tell lexicon, banned-word and competitor-name checks.
2. **New lexicon entries (with the sources above):** "thrilled to announce",
   "don't miss out", "mark your calendars", "in today's fast-paced",
   "what are your thoughts". Added to `phrases` in copy-tells.json so the CI
   gate covers the repo's own copy too.
3. **New caption-only structural checks** (these are caption conventions, not
   prose laws, so they live in a caption validator beside the lexicon, not in
   it): per-platform length windows (IG hook <= 125 before the fold, X <= 280,
   Threads <= 500, Reddit title <= 300); hashtag count caps (IG and TikTok
   3 to 5 at end, X 0 to 2 inline, LinkedIn <= 3 at end); emoji budget
   (0 to 2, never bookended); no more than one CTA; the CTA names a real
   surface ("Tickets in bio", "link below"), never generic urgency.
4. **Register by event type**: the caption prompt selects a register from the
   event's category (club/gig energy, comedy voice, theatre tone-of-program,
   family practicality, corporate value-first), grounded ONLY in real event
   fields (title, description, venue, date, price). Unknown facts are never
   invented; a missing lineup is simply not mentioned.
5. **Exclamation-mark nuance, flagged for founder decision:** the platform law
   bans exclamation marks in user-facing platform copy. An organiser's social
   caption is the ORGANISER'S voice, not platform chrome. Recommendation:
   keep the ban for generated captions at launch (it doubles as an AI-tell
   guard since emoji-and-bang density is a named tell), revisit only if
   organisers push back. The organiser can always edit in the composer.
6. **The captions work without AI too.** Production has no ANTHROPIC_API_KEY
   today. The caption engine therefore ships with deterministic composition
   from real event fields as the base layer (title, date in Australian
   format, venue, price, one CTA), with the AI pass as an upgrade when
   configured. Both paths run through the same gate.

---

## 5. Media intelligence (A4)

Researched approaches, all accessed 2026-07-27:

- **Detection**: photo vs video and portrait vs landscape from the file
  itself (sharp metadata for images, container metadata for video). Buffer
  and peers validate against per-platform API envelopes rather than silently
  fixing; the failure mode we must avoid is Instagram's silent rejection of
  out-of-range ratios (support.buffer.com/article/622).
- **Smart crop, the default treatment**: sharp's attention strategy crops to
  the region with the highest luminance, saturation and skin-tone presence
  (sharp.pixelplumbing.com/api-resize/), and is already in our stack. For
  people-heavy event photos, smartcrop.js (MIT) accepts face boxes as boost
  regions (github.com/jwagner/smartcrop.js). Cloudinary g_auto is the hosted
  benchmark (faces, then subject, then saliency) with a free tier of 25
  credits per month if we ever want it; not needed at launch.
- **The one-landscape-photo, four-shapes problem** (the founder's exact
  scenario). Researched options, best to worst for us:
  1. Smart crop per shape where the composition survives (1.91:1, 1:1, 4:5).
  2. For extreme ratios (9:16 story from a landscape photo): compose a
     branded frame rather than butcher the crop. The photo sits smart-cropped
     in the frame with the navy carrying title, date, venue in the platform's
     poster language. This is the @vercel/og pattern we already run for the
     1200x630 invitation card, at 1080x1920 and 1080x1080 (vercel.com/docs/og-image-generation:
     arbitrary width and height, images via runtime fetch, 500 KB bundle cap,
     flexbox only, fonts as ttf/otf/woff buffers).
  3. Blur-extend (the broadcast convention: the photo as its own blurred
     background) as the no-text alternative; no invented pixels
     (conroyp.com/articles/blurred-background-tv-portrait-images).
  4. Generative outpainting: REJECTED for launch. Cited risks: breaks
     perspective and lighting, plus a live 2026 disclosure debate around
     synthetic imagery (reloadium.com and emarketer.com citations in the
     research). We do not invent pixels of a real venue.
- **Video**: 2026 ceilings are Reels 3 minutes practical (20 recorded),
  TikTok 10 in-app / 60 upload, Shorts 3. The safe cross-platform band is
  15 to 60 seconds. At launch the kit VALIDATES and reports (length, ratio)
  and hands over; it does not auto-trim (Buffer surfaces the rejection and
  offers a trim tool; auto-cutting a promoter's clip is presumptuous).
- **No cover photo at all**: the branded navy/gold card (the existing OG
  fallback pattern) composes for every shape, so the kit never shows a blank.

---

## 6. The three patterns, compared (Phase B)

### Pattern A: THE PUBLISHER

Connect accounts once; one tap publishes everywhere the API allows.

What it actually requires (from section 2): a Meta app through App Review plus
Business Verification (duration unpublished, practitioner reports up to 20
days, screencasts required); a TikTok audit (private-only until passed); a
YouTube audit (private-only until passed); LinkedIn legal-entity vetting with
a no-second-chance rejection rule; X at USD $0.20 per link post; a Reddit
commercial agreement. Then, per organiser: a professional Instagram account,
usually a linked Facebook Page, OAuth for every channel, and the documented
reconnection nagging every scheduler suffers. Ongoing: every Meta API version
bump, token expiry storm and policy change is our pager.

Honest coverage on launch day if we started today: possibly Facebook Pages
and Instagram professional (if review lands in time), X at a fee. TikTok,
YouTube: private-only. WhatsApp: never. Personal Instagram (a large share of
first-time organisers): never.

### Pattern B: THE COMPOSER

The kit composes everything per platform, perfectly cropped and captioned,
then hands off with one action per channel: prefilled intent where the
platform allows it, native share sheet with the asset attached and the
caption on the clipboard where it does not.

Honest coverage on launch day: every one of the nine platforms gets its
best-possible path immediately. WhatsApp, X, Threads, Reddit: the post
arrives WRITTEN in the composer (tap, then post). Instagram, Facebook,
LinkedIn: the composed asset is handed over and the caption is one paste.
TikTok and Shorts: asset plus caption handoff once a clip exists. Zero
account connection, zero review queue, zero ban surface, zero per-post fees.
The cost: one to three extra taps per platform, honestly stated.

### Pattern C: THE MANAGER (the campaign that comes to you)

Not a blend of A and B but a different axis: TIME. A and B both assume the
organiser stands at the kit on publish day. Pattern C makes the kit behave
like a social media manager across the whole sale: at publish it proposes a
posting plan (announce today, momentum next week, final release, day before
doors), and at each moment it DELIVERS the prepared post to the organiser's
phone as a push notification; one tap opens the same handoff as B. The kit
finds the organiser; the organiser never finds the kit. This is the
notification-publishing pattern the entire scheduler industry standardised,
pointed at a campaign calendar instead of a single moment, and it runs on
the PWA web-push engine the demand engine already requires.

### The comparison

| Dimension | A: Publisher | B: Composer | C: Manager |
|---|---|---|---|
| Time to first post (organiser, from publish) | Instant IF connected and approved; the connection ceremony costs minutes per channel first | Under 60 seconds to the first posted channel (tap, post) | Same as B on day one, then near-zero effort for every later beat |
| Onboarding friction | Highest: professional accounts, OAuth per channel, Page links, re-auth nagging | Zero. No connection exists | Low: one push-permission prompt |
| Honest platform coverage at launch | FB Pages + IG professional at best, pending review; TikTok/YouTube private-only; WhatsApp never; personal IG never | All nine platforms at their real ceiling, day one | Same as B |
| Policy and ban risk | Real: five separate review regimes, ongoing ToS exposure, the marketing brief already records Meta bans for automation overreach | None. We never hold posting permissions | None (web push is our own surface) |
| Build effort (engineering hours, honest) | 120 to 200+ h plus review calendar-time we do not control | 70 to 95 h (section 8) | B plus 25 to 35 h |
| Ongoing maintenance | High: every platform API version, token, quota and policy change | Low: intents and share sheets are stable, consumer-facing surfaces; a break degrades to copy-pack, never to dead | B plus scheduling infra we already run (cron + push) |
| The 11pm solo organiser on a phone | Worst case: reconnection wall at 11pm ("session expired") | Best case: the desk opens from the bio link, thumb does four taps | Best case over time: the phone buzzes with the post ready at the right moment |

### The recommendation: B NOW, C AS THE SECOND ACT, A NEVER AS A PRECONDITION

**Build Pattern B for launch.** It is the only pattern that delivers the
founder's sentence in weeks: every platform at its honest ceiling, zero
review queues between us and launch, zero ban surface for a bootstrapped
company that cannot afford one, and zero per-post fees. The research shows
the handoff we would build is the exact flow the entire scheduler industry
uses for the hard cases: nobody on earth does better than
asset-attached-caption-copied without account connection, and the incumbent
ticketing platforms do not even reach that bar.

**Pattern C is the roadmap, not the launch.** It reuses B's entire
composition engine and adds scheduling plus push delivery. It is the moment
the kit stops being a page and becomes a manager, and it should be built as
the first post-launch kit upgrade, after real organisers have used the desk.

**Pattern A becomes an optional upgrade, later, for the narrow set that
earns it:** one Meta App Review covering Facebook Pages plus Instagram
professional accounts (the Eventbrite-parity move, and we can beat their
documented no-event-link weakness because our posts always carry the tracked
link). Started only when launch is behind us, run in parallel with real
usage, never blocking anything. TikTok/YouTube audits only if organiser
demand proves out. X API never (the intent is free; $0.20 per post buys
nothing the intent does not do).

**What would change my mind:**

1. If Meta App Review were reliably under one week AND our first 25 to 50
   concierge-onboarded organisers overwhelmingly held professional Instagram
   accounts with linked Pages, A's Meta slice would justify starting the
   review now, in parallel (still shipping B as the floor for everyone else).
2. If launch moved out by six or more weeks, start the Meta review
   immediately; the calendar cost stops competing with launch.
3. If the founder's first recruits say the extra paste on Instagram is
   costing posts (measurable: desk taps vs posted confirmations), that is
   direct evidence to prioritise the A upgrade for Instagram specifically.
4. If a platform ships a richer share intent (as Threads just did), the lane
   assignment changes for free; the desk design absorbs it without rework.

---

## 7. What exists today (verified in code, do not rebuild)

- **The kit screen**: `src/app/(dashboard)/dashboard/events/[id]/launch-kit/page.tsx`.
  Post-publish delivery moment with masthead, tracked share row, lineup loop,
  A4 QR poster, invitation card preview, seat-map preview, live reach,
  next steps. Locked state pre-publish. Flag `launch_kit` ON (src/lib/flags.ts:19).
- **Share row**: `src/components/launch-kit/launch-share-row.tsx`. Already
  uses the correct intents: wa.me with text, X intent with text + url,
  Facebook sharer with url, LinkedIn share-offsite with url, mailto, and
  copy-link for Instagram. The desk upgrades this row into channel cards; the
  intent wiring carries over.
- **Tracked links + attribution**: `src/lib/broadcast/share-links.ts`,
  `src/lib/broadcast/share-codes.ts`, redirect `src/app/s/[code]/route.ts`,
  reach `src/lib/broadcast/reach.ts`. Honest by construction (dedup views,
  one conversion per link-order). Per-channel minting already runs in the kit.
- **The invitation card (1200x630)**: `src/app/events/[slug]/opengraph-image.tsx`
  and `src/app/api/og/event/[slug]/route.tsx`, themed from
  `src/lib/broadcast/og-theme.ts` (the swap point). This is the proven
  @vercel/og pipeline the new 1080x1920 / 1080x1080 / 1080x1350 composers
  extend.
- **A4 QR poster PDF**: `src/lib/broadcast/poster.ts` +
  `src/app/api/organiser/events/[id]/poster/route.ts` (pdf-lib, sharp
  conversion, tracked qr channel, downloads recorded).
- **The copy gate**: `enforceCopyLaws` (src/lib/ai/sanitise.ts:66),
  `findCopyTells` + lexicon (src/lib/ai/copy-tells.ts, copy-tells.json),
  CI gate `scripts/copy-tell-gate.mjs`.
- **The AI layer**: `src/lib/ai/magic-start.ts` (two-pass, cost-guarded,
  gate-enforced) is the template the caption pass follows.
- **Activation tracker**: `src/components/launch-kit/kit-rendered-tracker.tsx`
  (kit_rendered with just_published).
- **The 2026-07-25 audit**: `docs/design/LAUNCH-KIT-AUDIT.md` (17.6s
  wizard-to-kit timed run; the auth-wall finding; the per-platform artefact
  gap this plan closes).

---

## 8. Build sequence (Pattern B), honest hour estimates

Engineering hours for a working, QA-passed result, not optimistic floors.
Order matters: each step ships value alone.

| # | Step | What it is | Hours |
|---|---|---|---|
| 1 | Shape composer | @vercel/og templates at 1080x1920 (story), 1080x1080 (square), 1080x1350 (4:5), reusing the OG card language; sharp attention smart-crop for the photo region; branded fallback when no cover; JPEG conversion for Instagram via sharp | 16 to 20 |
| 2 | Caption engine | Deterministic per-platform composition from real event fields (base layer, works with no AI key); AI register pass on top when configured (magic-start pattern); per-platform validator (lengths, hashtag caps, emoji budget); gate extension (new lexicon entries + caption checks); unit tests including tell-gate proof | 14 to 18 |
| 3 | The desk UI | The channel-card grid replacing the share row on the kit screen, per the approved proof: per-card asset preview, caption, action, honest tap note, Ready / Sent / Wants-a-clip states; 1440 and 390; motion per the CSS engine | 16 to 20 |
| 4 | Handoff mechanics | Mobile: Web Share API with files (feature-detected) attaching the composed asset + clipboard caption; desktop: asset download + caption copy + platform tab; intents for WhatsApp/X/Threads/Reddit carried over; per-card fallback to copy pack | 8 to 12 |
| 5 | The kit link | Short stable /k/[code] per event opening the kit on any device (auth: organiser session required; the code is convenience, authorisation stays server-side role-checked); bio-safe | 4 to 6 |
| 6 | Posted-state + reach wiring | Mark card Sent on handoff, per-channel state row; plain-words reach sentence on the kit ("WhatsApp sold N of your M tickets") from existing per-channel data | 6 to 8 |
| 7 | Clip intake (optional at launch) | Upload a clip on the TikTok/Shorts cards, duration + ratio validation, stored beside event media | 6 to 8 |
| 8 | QA pass per Definition of Done | Playwright drives at 1440/390 (desk, every card state, handoff fallbacks), axe, link-integrity on the kit, caption tell-gate zero-hit proof on generated output, benchmark verdict vs Eventbrite share flow + Luma kit | 8 to 10 |
| | **Total** | | **78 to 102** |

Phase next (post-launch, in order of evidence): Pattern C posting plan +
push delivery (25 to 35 h on top of B); Meta App Review track for FB Pages +
IG professional auto-post (engineering 30 to 40 h plus review calendar-time
outside our control).

### How we will know if this is wrong (the test plan)

- Activation: kit_rendered -> first card action rate (target: over half of
  publishing organisers act on at least one card in the first session).
- Per-channel: card action -> Sent confirmation; clicks per channel within
  48h (the tracked links already measure this).
- Speed: publish -> first posted channel under 60 seconds on a phone
  (measured, not claimed; the audit's 17.6s wizard floor is the precedent).
- The Instagram paste question: IG card actions vs IG Sent vs IG link clicks;
  if the paste step leaks users, that is the evidence that prioritises the
  Meta API upgrade.
- A/B candidates once volume exists: caption register variants per event
  type; desk order per event category. Named now, run later.

---

## 9. Design proof notes

- The two proofs are composed from the real TEST event "Afrobeats and
  Brunch: Sunday Sessions" (The Forum Melbourne, Sunday 9 August 2026,
  Brunch Pass $85, its real licensed cover photograph, its real description
  fields). No placeholder content.
- Design tokens: the brief named gold #D4A437; the binding tokens in
  `src/app/globals.css` are gold-500 #D4A017 and gold-400 #E8B738 (dark
  surfaces). Per the constitution the token wins; the proofs use the tokens
  and the discrepancy is reported here rather than silently repainted.
- Type roles as per the design system: Archivo headlines, Hanken Grotesk
  body, Manrope UI labels. Rail heading at the measured 24px CAPS standard
  with the single faint divider. Solid opaque surfaces, no glassmorphism,
  navy scrim over photography only.
- Every caption shown in the proofs passes the tell lexicon, the dash and
  exclamation laws, and Australian English, and states only real facts from
  the event record.
