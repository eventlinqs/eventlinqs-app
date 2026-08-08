# The share link: research, recommendation, reasoning

Written 8 August 2026, before any change to the link scheme, at the founder's
instruction. Every external claim below is from a primary source read this
session, or is marked as unsourced.

---

## 1. What the market actually does

**Eventbrite does not shorten. It names.** Eventbrite Help Centre, "Set up
promotional tracking links" (help article 835126): "Enter the name of your
tracking link. As you type, you'll see the unique URL for your tracking link."
The tracking link is the REAL event URL with the organiser's own named tracker
on it, and if the organiser has set a custom event URL, "you'll see two URLs
appear when you create a tracking link. Both URLs will lead visitors to your
event page." Two things follow: the tracker is human-named, not random, and the
event address itself stays visible inside the tracked link.

**Luma sells readability.** Luma Help, "Updating Event Information": the default
event address is a Luma-generated code, and a readable one is a paid feature:
"If you have Luma Plus, you can update the URL of your event to a custom link
like luma.com/my-event." Luma also publishes the hazard that comes with
readable slugs, plainly: "your old URL becomes available for others to claim.
If another event or calendar takes it, the old link points to their page
instead of forwarding to yours."

That a company charges for readable links is the strongest market evidence I
found that readability has value. It is also not proof that it converts.

**The 39 per cent claim could not be sourced and is not used.** The founder's
figure (branded links lifting click through by roughly a third) is repeated
widely. Every trail I followed ends at link-shortener vendors' own marketing
(Rebrandly's blog, and a Pimms article restating the same numbers with no
methodology, no sample, and no date). I found no independent study, no
published method, and no primary data. **I am not going to justify a design
decision with it**, and nothing below depends on it.

---

## 2. What our own code says

**A 302 short link does NOT cost the link preview.** Meta, "Specify a Canonical
URL" (developers.facebook.com/docs/sharing/webmasters/getting-started/versioned-link,
updated 18 December 2020): "The sharing details that Facebook uses are the ones
at the final link in the redirect chain", and 301 or 302 redirects are the
documented mechanism. Our `/s/[code]` route 302s to the event page, so the
invitation card still unfurls. Shortening is not costing us the artefact.

**The card physically cannot carry the real URL at display scale.** Measured:

| Form | Characters shown |
|---|---|
| `www.eventlinqs.com.au/s/Rk9dW2xa` | 32 |
| `www.eventlinqs.com.au/events/basement-45-warehouse-session` | 58 |
| the same with `?via=instagram` | 72 |

The story card's gold ticket bar is about 730 pixels of usable width and also
carries the price. At 72 characters the type has to drop to roughly 21 pixels
on a 1080 pixel card, against the 38 the design uses. It would read as fine
print on the one line that has to be read from a phone at arm's length. This,
not aesthetics, is the real argument for a short form on the CARD.

**A defect this research surfaced.** `src/app/s/[code]/route.ts` records a
click for every request with a valid code, including link-preview crawlers.
Facebook, LinkedIn, WhatsApp and Slack all fetch a shared link to build its
preview. Every share therefore books at least one click that no person made.
The differentiated claim of this whole product is honest measurement against
real ticket sales, and the click number is currently padded by robots. It is
listed as a fix below because it is the same subsystem, and it matters more
than the cosmetics of the code.

---

## 3. The recommendation

**Keep the short link, and make the code readable. Do not move attribution onto
a query parameter.**

The scheme:

```
www.eventlinqs.com.au/s/basement-45-ig
                        └────────┘ └┘
                        event      channel
```

- The code is the event slug, trimmed to a readable stem, plus a two or three
  letter channel marker.
- It is minted into the existing `share_links` table exactly as today: same
  row, same click recording, same cookie, same conversion join. **Attribution
  is not weakened by a single line.** This is a change to what the code SAYS,
  not to what it does.
- Existing random codes keep resolving forever. A poster already on a wall must
  never stop working, and the format gate simply widens to accept both.

**Why this over the alternatives.**

- *Against the real URL plus `?via=instagram`*: it is the shape Eventbrite uses
  and it would be my recommendation if the card did not exist. But 72
  characters does not fit the artefact, and the artefact is the point.
- *Against keeping random codes*: `Rk9dW2xa` tells a stranger nothing, and a
  stranger deciding whether to tap is the entire audience for this link. If we
  keep random codes, then shortening does not earn its place at all and we
  should print the real URL. It is one or the other.
- *Against a separate branded short domain*: it is another domain to own,
  renew, warm and defend, and Meta's canonical-URL rules mean a second domain
  must be verified before it can claim to be canonical. Not worth it at zero
  users.

**The risks, and how the design answers them.**

| Risk | Answer |
|---|---|
| **Enumeration.** A readable code is guessable, so a competitor could click `/s/basement-45-ig` repeatedly and pad that channel | Real, and it is the strongest argument against readability. Answered by de-duplicating clicks per visitor hash per hour (views are already de-duplicated per day) and by the fact that CONVERSIONS, the number that decides anything, require a real order and cannot be forged. Reported honestly rather than designed away |
| **Collision.** Two events with similar names | The code is unique-checked at mint. On collision it takes a short disambiguating suffix. The row is stored, so a later event reusing a slug can never steal an old code, which is precisely the hazard Luma publishes and accepts |
| **Privacy.** The code reveals the channel | The event page is public and the channel is the organiser's own choice. Nothing about an attendee is exposed |
| **A changed event slug.** The event is renamed after the poster is printed | The code is stored at mint and never recomputed, so the printed poster keeps working. This is stronger than Luma, where the old address becomes claimable by a stranger |

**Answering "is shortening worth it at all" plainly.** With a random code, no:
it saves 26 characters and destroys all meaning, and attribution could ride on
the real URL instead. With a readable code, yes, on two concrete grounds that
are not taste: the ticket bar cannot render 72 characters legibly, and a QR
encoding 32 characters has meaningfully fewer modules than one encoding 72,
which is what makes it scannable from across a room.

---

## 4. What would have to be built

1. A readable code generator, deterministic, with collision handling.
2. The format gate widened to accept both readable and legacy codes, with the
   legacy path unchanged.
3. Crawler exclusion and per-hour click de-duplication in `/s/[code]`.
4. Nothing else. The card, the caption engine and the poster all read the code
   through `buildShortUrl`, so they inherit it with no change.

Not started. Awaiting the founder's decision on section 3.
