# The launch kit social artefacts: before and after

Rendered 8 August 2026 on branch `feat/launch-kit-artefacts`. Every file in this
directory is produced by code in the repository, not by hand, and is regenerated
with one command:

```
npx vitest run --config vitest.proof.config.ts
```

Six event shapes, chosen to stress different parts of the design: a comedy
night, a club night, a market, a workshop, a fundraiser, and a child's birthday
party. Two of the six deliberately have NO cover photograph, because a workshop
run out of a studio and a family party are exactly the events whose organiser
has nothing to upload.

## What the kit shipped before (`before/`)

One artefact: the 1200 x 630 Open Graph link preview
(`src/app/events/[slug]/opengraph-image.tsx`), reproduced verbatim.

| File | What it is |
|---|---|
| `before/01-comedy-night-link-card.jpg` | The single asset, comedy night |
| `before/02-club-night-link-card.jpg` | Club night |
| `before/03-market-link-card.jpg` | Market |
| `before/04-workshop-link-card.jpg` | Workshop, no cover |
| `before/05-fundraiser-link-card.jpg` | Fundraiser |
| `before/06-kids-birthday-link-card.jpg` | Birthday party, no cover |

What it does not have, judged as a promoter: no organiser name and no organiser
logo, so the poster carries our brand where their Canva one carried theirs. No
price. No link written anywhere on the artefact. No QR. A system font, not the
brand type. And 1200 x 630 is the link-preview shape, which Instagram renders
only in a direct message or behind a story link sticker, never in a feed post.

## What ships now

Three shapes, each built to a published platform rule cited in
`src/lib/broadcast/social-card-spec.ts`.

| Shape | Size | Ratio | Published rule it answers |
|---|---|---|---|
| Story | 1080 x 1920 | 9:16 | Meta recommends 9:16 for stories, status and reels, and publishes a recommended minimum of 1080 x 1080 for that placement. Type and logos stay clear of the top and bottom 250 pixels, which is the safe area Meta publishes |
| Square post | 1080 x 1080 | 1:1 | Meta recommends 1:1 for the Instagram feed and publishes 1080 x 1080 as the recommended minimum for it. LinkedIn accepts 1:1 from 360 to 4320 pixels square |
| Tall post | 1440 x 1800 | 4:5 | Meta recommends 4:5 for the Facebook feed and publishes 1440 x 1800 as the recommended minimum for that exact ratio. It sits inside the Instagram supported band, which runs to 3:4 |

Sources, all read on 8 August 2026 and quoted in full in the spec file:
Instagram Help Centre 1631821640426723; Meta Business Help Centre
103816146375741, 469767027114079 and 201503794673956; LinkedIn single image ads
specifications; X Help Centre "How to post on X".

### The files

For each of the six events: `NN-name-story.jpg`, `NN-name-square.jpg`,
`NN-name-feed.jpg`. Captions for all six are in `captions.txt`.

### What is on every card that was not there before

- The organiser's trading name at the top of the identity row, at full strength,
  with a slot for their logo beside it. The EventLinqs mark is one muted line.
- The price and the tracked short link together in a gold ticket bar.
- The same tracked link again as a QR, so a screenshot still carries it.
- The event type and the city as a gold chip.
- The brand type: Archivo for display, Hanken Grotesk for the rest, drawn from
  real font files rather than falling back to a system face.

### Two decisions worth reading

**The panel rule.** The first render of the story card cropped a comedian
straight out of his own poster and kept the wall behind him: sharp's
attention-weighted crop scored the colourful paintings on the wall above the
performer. A 16:9 photograph pushed into 9:16 loses two thirds of the frame and
no saliency heuristic reliably keeps the right third. So a landscape or square
photograph is now placed WHOLE, full width at the top of the frame, with the
type composition below it on navy. Only a photograph already close to the story
shape is cropped to bleed, where little is lost. A promoter who framed that shot
on purpose gets the shot they framed. Compare `01-comedy-night-story.jpg` with
`before/01-comedy-night-link-card.jpg`.

**No photograph is not a broken card.** `04-workshop-*` and `06-kids-birthday-*`
have no cover. They fall back to a full-frame typographic composition built from
the organiser's own event details, on the navy and gold ground. The platform
never generates an image and never substitutes a stock photograph for one the
organiser did not supply.

## The captions (`captions.txt`)

One per channel, in that channel's register, each carrying that channel's own
tracked link so a sale from the WhatsApp message is attributed to WhatsApp.
Deterministic: no model call, no API key, no network, so the kit renders in the
same breath as the page. The organiser's own summary is quoted, never rewritten.

## The probe (`probe/`)

Five 400 x 400 swatches from `tests/proofs/gradient-probe.proof.tsx`, kept
because they answer a question that otherwise costs an afternoon: which CSS
background forms the renderer behind `ImageResponse` actually resolves. A
gradient it silently ignores looks exactly like a flat fill in the output.
