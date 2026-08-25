# Founder steps: Search Console, the sitemap, and Google Business Profile

Written 23 August 2026, after the discoverability audit. Everything the platform
can do in code is done and shipped. What is left needs an account only Lawal
controls, so it is written here as exact steps rather than described.

Every rule below was fetched from Google's own documentation on 23 August 2026
and is cited beside the step it governs. Nothing here is from memory (Law 7).

---

## Step 1: verify ownership in Search Console, as a DOMAIN property

**Do this one, not the others.** Search Console offers five verification methods
(HTML file upload, HTML tag, Google Analytics, Tag Manager, DNS record). Pick the
DNS record, because it creates a **Domain property**, and a Domain property
covers every subdomain and both protocols at once. A URL-prefix property verified
with an HTML tag covers `https://www.eventlinqs.com.au/` and nothing else, so
`eventlinqs.com.au` without the `www`, and any future subdomain, would each need
verifying again.

The second reason is durability. Google: "Verification lasts as long as Search
Console can confirm the presence and validity of your verification token." An
HTML tag lives in a template a future deploy can drop; a DNS record does not
depend on a deploy at all.
(<https://support.google.com/webmasters/answer/9008080>, fetched 2026-08-23)

**Exact steps**

1. Open <https://search.google.com/search-console>.
2. Click the property dropdown (top left) then **Add property**.
3. Choose the **Domain** box, not the URL prefix box.
4. Enter exactly: `eventlinqs.com.au`
   No `https://`, no `www.` A Domain property covers both automatically.
5. Google shows a **TXT record**. Copy the whole value; it begins
   `google-site-verification=`.
6. Add it at the DNS host for `eventlinqs.com.au`:
   - **Type:** `TXT`
   - **Name / Host:** `@` (some hosts want the bare domain instead)
   - **Value:** the string Google gave you, pasted whole
   - **TTL:** leave the default
7. Back in Search Console, click **Verify**. If it fails, wait for DNS
   propagation and press Verify again. It is often minutes, and can be hours.

**Do not delete that TXT record afterwards.** Google re-checks it periodically,
and permissions expire after a grace period if it disappears.

---

## Step 2: submit the sitemap

Google can already find it: `robots.txt` names it, and that is live now
(`src/app/robots.ts` emits `Sitemap: https://www.eventlinqs.com.au/sitemap.xml`).
Submitting it in Search Console is still worth doing, because the Sitemaps report
is where parse errors and the discovered-URL count are shown, and that is the
only place we will see the sitemap being rejected.

Google's own note: submitting through the report requires owner permissions,
which Step 1 gives you.
(<https://support.google.com/webmasters/answer/7451001>, fetched 2026-08-23)

**Exact steps**

1. Open <https://search.google.com/search-console/sitemaps>.
2. Select the `eventlinqs.com.au` property.
3. In **Add a new sitemap**, enter: `sitemap.xml`
   The box is relative to the property root, so the full path is not needed.
4. Click **Submit**.
5. Expected result: **Status: Success**, with a discovered-URL count in the
   high hundreds. It was **688 URLs** on the local build of 23 August 2026 and
   586 on production before this pass.

**If it says "Couldn't fetch"**, that is usually Google not having crawled yet
rather than a real failure. Leave it a day before treating it as a fault.

---

## Step 3: Google Business Profile. MY RECOMMENDATION IS DO NOT CREATE ONE

This is the one I would push back on, so here is the reasoning rather than a
yes or no.

Google's eligibility rule is a single sentence: "If your business either has a
physical location that customers can visit, or travels to customers where they
are, you can create a Business Profile on Google."
(<https://support.google.com/business/answer/3038177>, fetched 2026-08-23)

EventLinqs is neither. Attendees buy tickets on the web and go to an organiser's
venue; nobody visits us, and we do not travel to them. The same page closes the
obvious workaround: "If your business rents a physical mailing address but
doesn't operate out of that location, also known as a virtual office, that
location isn't eligible for a Business Profile." A home address in Geelong that
no customer attends is the same shape.

The downside is not merely a wasted afternoon. That page opens by framing its
rules as what is required "to make sure your Business Profile won't be
suspended", and a suspension attaches to the Google account and the brand.

**What to do instead**, which is already built and shipped:

- The homepage emits `Organization` and `WebSite` JSON-LD, which is the correct
  structured data for an online business and is what feeds a brand knowledge
  panel.
- The organiser profile pages emit `Organization` each. **Organisers with real
  venues are the ones who should hold Business Profiles**, and that is worth
  saying to them during concierge onboarding: it is free, it helps their event
  rank locally, and every one of those profiles points at their EventLinqs page.

Revisit this only if EventLinqs ever takes premises that ticket buyers actually
attend.

---

## Step 4: the one check I cannot run for you

Google's **Rich Results Test** fetches a public URL, so it cannot see localhost
and cannot be run across a catalogue. The repo now carries
`scripts/verify/event-structured-data-audit.mjs`, which encodes the same
published rules and audits every event page in a deployed sitemap, and that is
what should run on every pass.

The hosted tool is still worth one spot check after the next deploy, because it
is Google's own parser rather than our reading of Google's documentation:

1. Open <https://search.google.com/test/rich-results>.
2. Paste any live event URL, for example
   `https://www.eventlinqs.com.au/events/<any-published-slug>`.
3. Expected: **Events** detected, valid, with no errors. Warnings about
   recommended properties are acceptable and are tracked by the audit script.

If it disagrees with our audit script, **Google is right and the script is
wrong**, and the script should be corrected to match rather than the finding
explained away.

---

## What to watch, once data starts arriving

Data takes days to accrue after a property is added.

| Report | What it answers |
|---|---|
| Sitemaps | Did Google accept the file, and how many URLs did it discover |
| Pages (indexing) | How many are indexed, and the reason for each exclusion |
| Enhancements > Events | How many event pages are valid for the event experience |
| Performance | The queries actually bringing people in |

The number that matters for the wedge is **Enhancements > Events**. If event
pages are valid there, an event published today is eligible for Google's event
experience, which is what this whole pass was for.
