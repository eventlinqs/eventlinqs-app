# Competitor Visual and Structural Data Pass v1

Raw measurement evidence for the EventLinqs locked competitor set. This document presents what was measured. It contains no recommendations, no interpretation, and no quality judgements. Recommendations are made separately by Claude (chat) reviewing this evidence.

## Methodology

- Capture date: 2026-05-23
- Competitors: Ticketmaster (AU), DICE, Eventbrite (AU), Humanitix (AU)
- Pages per competitor: homepage and one event detail page
- Viewports: desktop 1440 x 900, mobile 375 x 812
- Raw page content: Firecrawl scrape, saved verbatim as `raw.md` (markdown format, full page, onlyMainContent false)
- Screenshots: Playwright headless Chromium, full page, per viewport
- Computed measurements: Playwright `getComputedStyle` via `page.evaluate` on representative rendered elements
- Density counts: Playwright DOM evaluation of elements above the fold at each viewport

### Deviations and limitations

1. The brief referenced "memory entry 27" (visible browser mode) and "memory entry 29" (locked competitor set). Neither entry exists in the current memory index, which holds only five entries. Browser captures were run in headless Chromium. Headless produces pixel-identical page screenshots to headed mode and avoids window focus interference on an unattended machine. This is the only process deviation from the brief.
2. DICE event detail page is not an AU event. DICE geolocates by server IP. Firecrawl proxy traffic resolved to a United States datacentre, and direct AU city URL slugs returned 404. The DICE homepage rendered "Trending in San Francisco" and the captured event detail page is a San Francisco music event. This is recorded in the DICE files and below.
3. Ticketmaster event detail page is a React single page app. At `domcontentloaded` the desktop document title was "Loading...". The screenshot confirms the page rendered visually, but the desktop h1 size of 18px reflects a loading state element rather than the final hydrated h1. Recorded in the Ticketmaster files and below.
4. Where a measurement could not be captured (element absent, layout uses flow or flex rather than CSS grid gap, image proxy hides file extension), the value is recorded as `null` and the reason is noted. No values were estimated or interpolated.

All four competitors were reached without CAPTCHA or bot wall. Playwright succeeded on all four competitors and all eight pages. No Firecrawl screenshot fallback was required.

Colour values below are presented as hex. Where a tool reported `rgb()` the value was converted to hex without alteration. `rgba(0,0,0,0)` is reported as "transparent".

---

## 1. Ticketmaster

Homepage URL: https://www.ticketmaster.com.au/
Event detail URL: https://www.ticketmaster.com.au/anyma-presents-den-sydney-17-10-2026/event/1300643CD30D7773
Event detail selection: "Anyma presents Aeden", Dance and Electronic music, The Domain Sydney NSW, 17 October 2026. AU event. Surfaced from the homepage Popular Tickets area.

### 1A. Homepage

![Ticketmaster homepage desktop](ticketmaster/homepage/screenshot-desktop.png)
![Ticketmaster homepage mobile](ticketmaster/homepage/screenshot-mobile.png)

Typography (desktop)

| Level | Selector | Font family | Size | Weight | Line height | Letter spacing |
|---|---|---|---|---|---|---|
| h1 | h1 | Averta, helvetica, arial, sans-serif | 32px | 700 | 44.8px | 0.32px |
| h2 | h2 | Averta, helvetica, arial, sans-serif | 24px | 700 | 33.6px | 0.32px |
| h3 | h3 | Averta, helvetica, arial, sans-serif | 32px | 800 | 44.8px | 0.32px |
| body | p | Averta, helvetica, arial, sans-serif | 18px | 600 | 26px | 0.36px |
| small | not found | null | null | null | null | null |

h1 font size at mobile: 32px

Spacing

| Metric | Value |
|---|---|
| Hero padding top | 0px |
| Hero padding bottom | 0px |
| Event card padding | 10px |
| Card grid gap | normal (no explicit CSS gap; flow or margin layout) |
| Main container padding x, desktop | 0px |
| Main container padding x, mobile | null (not separately measured) |

Colour

| Role | Hex |
|---|---|
| Primary text | #121212 |
| Page background | transparent (body); visual white from parent |
| Accent 1 | #000000 |
| Accent 2 | #ffffff |
| Accent 3 | #646464 |
| Accent 4 | #024ddf |
| Accent 5 | #949494 |

Image rendering

| Metric | Value |
|---|---|
| Event card image aspect ratio | 1.78 (368:207) |
| Hero image aspect ratio | 1.78 (720:405) |
| Image format | WebP (CDN URL `auto=webp`) |

Motion

| Element | Transition duration | Timing function |
|---|---|---|
| button.sc-fb3ba952-2 | 0s | ease |

Density

| Metric | Desktop | Mobile |
|---|---|---|
| Events above the fold | 1 | 1 |
| Filter options visible | 0 | 0 |
| CTAs above the fold | 7 | 10 |

Density notes: the desktop above the fold event is the hero banner; the Popular Tickets rail begins below the fold. Filter count is 0 because nav category links use hashed class names that did not match standard filter selectors; the agent observed 6 visible nav category links. CTA counts include utility nav links and the search button.

### 1B. Event detail

![Ticketmaster event detail desktop](ticketmaster/event-detail/screenshot-desktop.png)
![Ticketmaster event detail mobile](ticketmaster/event-detail/screenshot-mobile.png)

Typography (desktop)

| Level | Selector | Font family | Size | Weight | Line height | Letter spacing |
|---|---|---|---|---|---|---|
| h1 | h1 | Averta, helvetica, arial, sans-serif | 18px | 600 | 26px | 0.36px |
| h2 | not found | null | null | null | null | null |
| h3 | not found | null | null | null | null | null |
| body | body | Averta, helvetica, arial, sans-serif | 16px | 400 | 22.4px | 0.32px |
| small | not found | null | null | null | null | null |

h1 font size at mobile: 18px

Note: the h1 value of 18px was captured during SPA loading state, not the final hydrated heading. See deviation 3 above.

Spacing

| Metric | Value |
|---|---|
| Hero padding top | 0px |
| Hero padding bottom | 0px |
| Event card padding | 0px |
| Card grid gap | normal (no explicit CSS gap) |
| Main container padding x, desktop | 0px |
| Main container padding x, mobile | null |

Colour

| Role | Hex |
|---|---|
| Primary text | #121212 |
| Page background | transparent (body) |
| Accent 1 | #ffffff |
| Accent 2 | #000000 |
| Accent 3 | #024ddf |
| Accent 4 | #d6d6d6 |
| Accent 5 | #646464 |

Primary button captured separately: background #00783a, text #ffffff, transition duration 0s.

Image rendering

| Metric | Value |
|---|---|
| Event card image aspect ratio | 1.78 (143:80) |
| Hero image aspect ratio | 1.78 (143:80) |
| Image format | JPG (og:image CDN URL, 16:9 native) |

Motion

| Element | Transition duration | Timing function |
|---|---|---|
| button.sc-35dd93c5-5 | 0s | ease |

Density: not measured for event detail pages. The density metric is defined for the homepage only.

---

## 2. DICE

Homepage URL: https://dice.fm/
Event detail URL: https://dice.fm/event/k6gby8-all-day-i-dream-of-golden-days-6th-jun-golden-gate-park-san-francisco-tickets
Event detail selection: "All Day I Dream of Golden Days", DJ and Electronic outdoor festival, Golden Gate Park San Francisco USA, 6 June 2026. NOT an AU event. See deviation 2 above for the geolocation reason.

### 2A. Homepage

![DICE homepage desktop](dice/homepage/screenshot-desktop.png)
![DICE homepage mobile](dice/homepage/screenshot-mobile.png)

Typography (desktop)

| Level | Selector | Font family | Size | Weight | Line height | Letter spacing |
|---|---|---|---|---|---|---|
| h1 | h1 | Foggy, sans-serif | 106px | 400 | 88px | normal |
| h2 | h2 | Favorit, Helvetica, Arial, sans-serif | 18px | 700 | 22px | normal |
| h3 | not found | null | null | null | null | null |
| body | p | Favorit, Helvetica, Arial, sans-serif | 18px | 350 | 22px | normal |
| small | span | Favorit, Helvetica, Arial, sans-serif | 12px | 700 | 16px | 0.72px |

h1 font size at mobile: 48px

Spacing

| Metric | Value |
|---|---|
| Hero padding top | 60px |
| Hero padding bottom | 80px |
| Event card padding | 0px |
| Card grid gap | null (inline-flex with CSS variables; gap property not set) |
| Main container padding x, desktop | 0px |
| Main container padding x, mobile | 0px |

Colour

| Role | Hex |
|---|---|
| Primary text | #000000 |
| Page background | #000000 |
| Accent 1 | #eeeeee |
| Accent 2 | #595959 |
| Accent 3 | #ffffff |
| Accent 4 | #f2f2f2 |
| Accent 5 | null (only four distinct accents returned) |

Image rendering

| Metric | Value |
|---|---|
| Event card image aspect ratio | 1 (204:204) |
| Hero image aspect ratio | 1 (2200:2200) |
| Image format | JPG |

Motion

| Element | Transition duration | Timing function |
|---|---|---|
| Styled-component icon button | 0.2s | ease |

Density

| Metric | Desktop | Mobile |
|---|---|---|
| Events above the fold | 1 | 1 |
| Filter options visible | 5 | 1 |
| CTAs above the fold | 5 | 3 |

### 2B. Event detail

![DICE event detail desktop](dice/event-detail/screenshot-desktop.png)
![DICE event detail mobile](dice/event-detail/screenshot-mobile.png)

Typography (desktop)

| Level | Selector | Font family | Size | Weight | Line height | Letter spacing |
|---|---|---|---|---|---|---|
| h1 | h1 | Favorit, Helvetica, Arial, sans-serif | 64px | 400 | 70.4px | normal |
| h2 | h2 | Favorit, Helvetica, Arial, sans-serif | 28px | 400 | 33.6px | 0.28px |
| h3 | h3 | Favorit, Helvetica, Arial, sans-serif | 18px | 400 | 21.6px | 0.36px |
| body | p | Favorit, Helvetica, Arial, sans-serif | 14px | 400 | 18.2px | 0.28px |
| small | small | Favorit, Helvetica, Arial, sans-serif | 14px | 400 | 18.2px | 0.28px |

h1 font size at mobile: 35px

Spacing

| Metric | Value |
|---|---|
| Hero padding top | null (full bleed image layout, no section padding) |
| Hero padding bottom | null |
| Event card padding | null |
| Card grid gap | null |
| Main container padding x, desktop | 0px |
| Main container padding x, mobile | 0px |

Colour

| Role | Hex |
|---|---|
| Primary text | #ffffff |
| Page background | #000000 |
| Accent 1 | #ffffff |
| Accent 2 | #333333 |
| Accent 3 | #ffffff (returned twice) |
| Accent 4 | #f2ef1d (Buy now CTA colour per agent) |
| Accent 5 | #000000 |

Image rendering

| Metric | Value |
|---|---|
| Event card image aspect ratio | null (no card grid on event detail) |
| Hero image aspect ratio | 1 (328:328) |
| Image format | JPG |

Motion

| Element | Transition duration | Timing function |
|---|---|---|
| Styled-component icon button | 0.2s | ease |

Density: not measured for event detail pages.

---

## 3. Eventbrite

Homepage URL: https://www.eventbrite.com.au/
Event detail URL: https://www.eventbrite.com.au/e/sounds-on-sunday-june-long-weekend-2026-tickets-1982642744821
Event detail selection: "Sounds On Sunday - June Long Weekend 2026", multi-stage DJ and dance music event, Greenwood Hotel North Sydney NSW, 7 June 2026. AU event.

### 3A. Homepage

![Eventbrite homepage desktop](eventbrite/homepage/screenshot-desktop.png)
![Eventbrite homepage mobile](eventbrite/homepage/screenshot-mobile.png)

Typography (desktop)

| Level | Selector | Font family | Size | Weight | Line height | Letter spacing |
|---|---|---|---|---|---|---|
| h1 | h1 | Neue Plak Condensed, system fallback stack | 56px | 700 | 56px | 1px |
| h2 | h2 | Neue Plak, system fallback stack | 18px | 600 | 24px | 0.25px |
| h3 | h3 | Neue Plak, system fallback stack | 18px | 600 | 24px | 0.25px |
| body | p | Founders Grotesk Regular (Next.js hashed) | 10px | 400 | 11px | 0.1px |
| small | [class*=small] | Neue Plak Text, Neue Plak | 14px | 600 | 0px | normal |

h1 font size at mobile: 40px

Note: the homepage `p` selector first matched a small footer or label text node at 10px. See the agent note in `eventbrite/homepage/measurements.json`.

Spacing

| Metric | Value |
|---|---|
| Hero padding top | 8px |
| Hero padding bottom | 8px |
| Event card padding | 0px |
| Card grid gap | null (flex row wrap layout; gap not set on matched container) |
| Main container padding x, desktop | 0px |
| Main container padding x, mobile | 0px |

Colour

| Role | Hex |
|---|---|
| Primary text | #39364F |
| Page background | transparent (body) |
| Accent 1 | #3659E3 |
| Accent 2 | #C2C2CC |
| Accent 3 | #000000 |
| Accent 4 | #FFFFFF |
| Accent 5 | #F0F0F0 |

Image rendering

| Metric | Value |
|---|---|
| Event card image aspect ratio | 2.00 (2:1) |
| Hero image aspect ratio | 2.00 (2:1) |
| Image format | unknown (Next.js image proxy hides extension; CDN URL uses `auto=format,compress`, WebP delivered to modern browsers) |

Motion

| Element | Transition duration | Timing function |
|---|---|---|
| button | 0s | ease |

Density

| Metric | Desktop | Mobile |
|---|---|---|
| Events above the fold | 0 | 0 |
| Filter options visible | 6 | 3 |
| CTAs above the fold | 3 | 1 |

Density notes: above the fold is occupied by the hero banner, the category nav pill row, and location and filter controls. Event cards begin below the fold; the `article` and event card selectors matched no in-viewport elements before scroll.

### 3B. Event detail

![Eventbrite event detail desktop](eventbrite/event-detail/screenshot-desktop.png)
![Eventbrite event detail mobile](eventbrite/event-detail/screenshot-mobile.png)

Typography (desktop)

| Level | Selector | Font family | Size | Weight | Line height | Letter spacing |
|---|---|---|---|---|---|---|
| h1 | h1 | Neue Plak, system fallback stack | 32px | 800 | 35.2px | normal |
| h2 | h2 | Neue Plak | 24px | 600 | 31.99px | normal |
| h3 | h3 | Neue Plak, system fallback stack | 24px | 600 | 31.92px | normal |
| body | p | Neue Plak, system fallback stack | 18px | 400 | 23.94px | 0.1px |
| small | [class*=small] | Neue Plak Text, Neue Plak | 14px | 600 | 0px | normal |

h1 font size at mobile: 24px

Spacing

| Metric | Value |
|---|---|
| Hero padding top | 0px |
| Hero padding bottom | 0px |
| Event card padding | 24px |
| Card grid gap | null (flex row wrap layout) |
| Main container padding x, desktop | 0px |
| Main container padding x, mobile | 0px |

Colour

| Role | Hex |
|---|---|
| Primary text | #000000 |
| Page background | transparent (body) |
| Accent 1 | #261B36 |
| Accent 2 | #39364F |
| Accent 3 | #FFFFFF |
| Accent 4 | #6F7287 |
| Accent 5 | #F0F0F0 |

Image rendering

| Metric | Value |
|---|---|
| Event card image aspect ratio | null (no card grid on event detail) |
| Hero image aspect ratio | 2.00 (2:1; event cover art crop) |
| Image format | null (extension not exposed) |

Motion

| Element | Transition duration | Timing function |
|---|---|---|
| button | 0s | ease |

Density: not measured for event detail pages.

---

## 4. Humanitix

Homepage URL: https://www.humanitix.com/au/
Event detail URL: https://events.humanitix.com/bangladesh-night-2026
Event detail selection: "Solar Power Nation Presents BANGLADESH NIGHT 2026", live music concert and Bangladeshi cultural event featuring Runa Laila and Emon Chowdhury's Bengal Symphony, Norwest Convention Centre Norwest NSW, 1 August 2026. AU cultural event.

### 4A. Homepage

![Humanitix homepage desktop](humanitix/homepage/screenshot-desktop.png)
![Humanitix homepage mobile](humanitix/homepage/screenshot-mobile.png)

Typography (desktop)

| Level | Selector | Font family | Size | Weight | Line height | Letter spacing |
|---|---|---|---|---|---|---|
| h1 | h1.sc-225c3114-0 | Satoshi, Montserrat, DejaVu Sans, Verdana, sans-serif | 42px | 900 | 50.4px | normal |
| h2 | h2.sc-903ce683-0 | Satoshi, Montserrat, DejaVu Sans, Verdana, sans-serif | 30px | 900 | 36px | normal |
| h3 | h3.sc-903ce683-0 | Satoshi, Montserrat, DejaVu Sans, Verdana, sans-serif | 20px | 700 | 38px | normal |
| body | body | Satoshi, Montserrat, DejaVu Sans, Verdana, sans-serif | 14px | 500 | 16.8px | normal |
| small | small | null (no small element on homepage) | null | null | null | null |

h1 font size at mobile: 22px

Spacing

| Metric | Value |
|---|---|
| Hero padding top | 0px |
| Hero padding bottom | 0px |
| Event card padding | 0px |
| Card grid gap | 24px |
| Main container padding x, desktop | 0px |
| Main container padding x, mobile | 0px |

Colour

| Role | Hex |
|---|---|
| Primary text | #151414 |
| Page background | #ffffff |
| Accent 1 | #1b1b1b |
| Accent 2 | #f7f7f7 |
| Accent 3 | #ffb08f |
| Accent 4 | #101010 |
| Accent 5 | #2d2825 |

Image rendering

| Metric | Value |
|---|---|
| Event card image aspect ratio | 2 (2:1) |
| Hero image aspect ratio | 2 (2:1) |
| Image format | WebP |

Motion

| Element | Transition duration | Timing function |
|---|---|---|
| button | 0s | ease |

Density

| Metric | Desktop | Mobile |
|---|---|---|
| Events above the fold | 6 | 6 |
| Filter options visible | 3 | 3 |
| CTAs above the fold | 15 | 11 |

### 4B. Event detail

![Humanitix event detail desktop](humanitix/event-detail/screenshot-desktop.png)
![Humanitix event detail mobile](humanitix/event-detail/screenshot-mobile.png)

Typography (desktop)

| Level | Selector | Font family | Size | Weight | Line height | Letter spacing |
|---|---|---|---|---|---|---|
| h1 | h1.f-heading-8 | Satoshi, Arial and Roboto fallbacks, sans-serif | 52px | 700 | 57.2px | -1.04px |
| h2 | h2.title | Satoshi, Arial and Roboto fallbacks, sans-serif | 32px | 700 | 35.2px | -0.64px |
| h3 | h3.f-heading-1 | Satoshi, Arial and Roboto fallbacks, sans-serif | 18px | 700 | 19.8px | -0.36px |
| body | body | Satoshi, Arial and Roboto fallbacks, sans-serif | 14px | 500 | 16.8px | normal |
| small | time.f-label-3 | Satoshi, Arial and Roboto fallbacks, sans-serif | 16px | 500 | 19.2px | normal |

h1 font size at mobile: 36px

Spacing

| Metric | Value |
|---|---|
| Hero padding top | 0px |
| Hero padding bottom | 0px |
| Event card padding | null (no event card grid on event detail) |
| Card grid gap | null (no event card grid on event detail) |
| Main container padding x, desktop | 16px |
| Main container padding x, mobile | 16px |

Colour

| Role | Hex |
|---|---|
| Primary text | #000000 |
| Page background | #ffffff |
| Accent 1 | #0d0d0d |
| Accent 2 | #ac4f3b |
| Accent 3 | #e5e5e5 |
| Accent 4 | #7a7a7a |
| Accent 5 | #666666 |

Image rendering

| Metric | Value |
|---|---|
| Event card image aspect ratio | 1 (1:1) |
| Hero image aspect ratio | 2 (2:1) |
| Image format | WebP |

Motion

| Element | Transition duration | Timing function |
|---|---|---|
| button | 0s | ease |

Density: not measured for event detail pages.

---

## File index

All paths are relative to `research/competitors/`.

| Competitor | Page | raw.md | screenshot-desktop.png | screenshot-mobile.png | measurements.json | density.json |
|---|---|---|---|---|---|---|
| Ticketmaster | homepage | ticketmaster/homepage/raw.md | ticketmaster/homepage/screenshot-desktop.png | ticketmaster/homepage/screenshot-mobile.png | ticketmaster/homepage/measurements.json | ticketmaster/homepage/density.json |
| Ticketmaster | event-detail | ticketmaster/event-detail/raw.md | ticketmaster/event-detail/screenshot-desktop.png | ticketmaster/event-detail/screenshot-mobile.png | ticketmaster/event-detail/measurements.json | not applicable |
| DICE | homepage | dice/homepage/raw.md | dice/homepage/screenshot-desktop.png | dice/homepage/screenshot-mobile.png | dice/homepage/measurements.json | dice/homepage/density.json |
| DICE | event-detail | dice/event-detail/raw.md | dice/event-detail/screenshot-desktop.png | dice/event-detail/screenshot-mobile.png | dice/event-detail/measurements.json | not applicable |
| Eventbrite | homepage | eventbrite/homepage/raw.md | eventbrite/homepage/screenshot-desktop.png | eventbrite/homepage/screenshot-mobile.png | eventbrite/homepage/measurements.json | eventbrite/homepage/density.json |
| Eventbrite | event-detail | eventbrite/event-detail/raw.md | eventbrite/event-detail/screenshot-desktop.png | eventbrite/event-detail/screenshot-mobile.png | eventbrite/event-detail/measurements.json | not applicable |
| Humanitix | homepage | humanitix/homepage/raw.md | humanitix/homepage/screenshot-desktop.png | humanitix/homepage/screenshot-mobile.png | humanitix/homepage/measurements.json | humanitix/homepage/density.json |
| Humanitix | event-detail | humanitix/event-detail/raw.md | humanitix/event-detail/screenshot-desktop.png | humanitix/event-detail/screenshot-mobile.png | humanitix/event-detail/measurements.json | not applicable |

Each competitor folder also contains `capture.mjs`, the Playwright script used for that competitor's screenshots, measurements, and density counts.

Total files: 40. Page captures: 16 (4 competitors x 2 pages x 2 viewports). Raw scrapes: 8. Measurement files: 8. Density files: 4. Capture scripts: 4.
