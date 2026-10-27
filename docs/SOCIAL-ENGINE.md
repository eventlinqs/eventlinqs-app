# The social engine (item 11)

The foundation's item 11 (START-16OCT/EVENTLINQS-FOUNDATION-LOCKED-27OCT.md, locked 27 October 2026): "The social engine: Bookedproof's engine brought across, fed by the organiser's own photos and video through the Launch Kit." "Results are credited by WI3's counted clicks and EventLinqs ticket sales; likes are never the measure."

Ported on 27 October 2026 from Bookedproof's engine (C:\dev\bp-int-pf1, src/lib/social and its bp_social_* migrations, read only) as EventLinqs code. No EventLinqs data goes to Bookedproof.

## What it does

1. **Plan.** /admin/social, "Plan this week's posts": every published, public event starting in the next seven days that has not ended or sold out gets an Instagram feed card (4:5, the top of Meta's "4:5 to 1.91:1 range", https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media) and a story, photo first, then the soonest. An unlisted event (AMCF's page) is never posted.
2. **Its own link.** Each post gets a share link of its own (public.share_links, /e/<code>), so every arrival, press out to the organiser's booking page and ticket sold through it is counted as that post's, in share_link_events. The Launch Kit's own link for the channel is made first and stays the kit's (getOrCreateShareLink takes the oldest).
3. **The card and the words.** The card is the Launch Kit's renderer (src/lib/broadcast/social-cards.tsx) with the event's own photo and the post's link and QR, as a JPEG (/admin/social/card/<post>). The words are the Launch Kit's Instagram caption (src/lib/broadcast/captions.ts) carrying the post's link. Nothing is generated. For a listing EventLinqs does not ticket, the price line is read from its booking links (a price read within the day, else where it sells), where the kit alone would say "Free entry".
4. **Versions.** A person may change the words; each change is the next version. The database refuses a version that states a number the listing does not hold, leaves out the post's link, or carries a long dash or an exclamation mark.
5. **Approve, post, record.** The newest version is approved by a person. The database refuses the approval for an event that is not published and public, has ended or has sold out, and inside the gap of the rule in force. The post goes on Instagram by hand (publishing by Meta's API waits on Meta's app review), and its address is recorded within the day of the approval.
6. **Results.** For each post that went: tickets and money first, then people who arrived and people who pressed on to book, inside 30 days of the post. Likes, impressions and follows are never read.
7. **Cadence.** Feed posts start 12 hours apart and stories 2 (Buffer's study of 2.1 million posts from 102K Instagram accounts: "Posting 10+ posts/week = ~24% more reach per post", https://buffer.com/library/how-often-to-post-on-instagram/, read 27 October 2026; the study "looked at Instagram feed posts ... not Instagram Stories"). Once twelve posts of a format have each gone 48 hours, the gap and the best hours are learned from our own posts, ranked by tickets sold a post, then arrivals and presses out. Rules are versioned and read by date, so no change is retroactive.

## Where it lives

| Part | File |
|---|---|
| Tables, refusals, grants | supabase/migrations/20261027233001_social_engine.sql |
| What is posted, its facts and words | src/lib/social/plan.ts |
| The words' rules | src/lib/social/words.ts |
| Results | src/lib/social/results.ts |
| Cadence | src/lib/social/cadence.ts |
| Reads and writes (the one writer) | src/lib/social/store.ts |
| The page and its presses | src/app/admin/(authed)/social/ |
| The card | src/app/admin/(authed)/social/card/[postId]/route.ts |
| Tests | tests/unit/social/social-engine.test.ts |
| Database proof (TEST, rolled back) | scripts/verify/social-engine-proof.sql |
| One writer guard | scripts/guards/social-one-writer.mjs |

## What Bookedproof's engine has that this does not yet

- Publishing through Meta's API: waits on Meta's app review; the channel interface is Bookedproof's src/lib/social/channel.ts.
- Platform readings (shares, saves, plays watched to the end): Mosseri named "watch time, likes and sends" as Instagram's top signals (section 14's social section); sends would be read from the Instagram Graph API once connected.
- The brake on interest already in play (Bookedproof's velocity brake): EventLinqs has no enquiry inbox for an event yet.
- Model-written words in the business's own voice: EventLinqs posts in its own Launch Kit words.

Reversal: if a post's results ever count a sale, an arrival or a press out made through another link, or a post goes for an unlisted, ended or sold out event, tests/unit/social/social-engine.test.ts or the database proof fails.
