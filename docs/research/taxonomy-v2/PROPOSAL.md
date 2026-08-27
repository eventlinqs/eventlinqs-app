# Culture Taxonomy v2 - PROPOSAL (Phase 2 deliverable)

Status: **PROPOSAL - awaiting founder approval. No implementation has been done. No code, schema, seed, or copy has been changed.**
Date: 2026-05-16. Evidence base: `docs/research/taxonomy-v2/RESEARCH.md`.

---

## 0. The core problem and the fix in one paragraph

The current taxonomy is a single flat list that fuses three different things - ancestry ("African", "South Asian"), genre ("Comedy"), faith ("Gospel"), and identity ("Pride") - into one "culture" axis, while omitting Aboriginal and Torres Strait Islander peoples entirely and collapsing distinct major communities ("East Asian" hides Chinese, Vietnamese, Korean, Japanese; "European"/"Mediterranean" hides Italian, Greek, Lebanese). The fix is to stop pretending these are one axis. **Three orthogonal dimensions** - Cultural Heritage, Faith Community, Event Type - plus one light cross-cutting Identity tag. An event is tagged on each axis independently (e.g. *Diwali Gala Dinner* = Heritage:Indian + Faith:Hindu + Type:Food & Drink). Nothing competitors do; structurally honest; every existing event maps with zero data loss.

---

## 1. Dimension 1 - Cultural Heritage (ancestry-based, 20 items)

Ordering rule: **Aboriginal and Torres Strait Islander first, always.** After that, ordered by a blend of AU census presence and EventLinqs community strength (see Decision Point A on ordering). Each heritage has sub-filters so granularity lives *inside* the heritage, not as 50 top-level tiles.

| # | Heritage | Sub-filters (in-page, not top-level) | Why included (evidence) |
|---|----------|--------------------------------------|--------------------------|
| 1 | **Aboriginal & Torres Strait Islander** | First Nations music, dance, art, language, NAIDOC, community | 983,700 people / 3.8% (ABS 2021); 167 languages. Non-negotiable for an AU launch. Must be first and culturally authoritative. |
| 2 | **African** | Afrobeats, Amapiano, West African/Nigerian, East African, Owambe, Africultures | EventLinqs core community; 9 live events already. Founder community. |
| 3 | **Caribbean** | Soca, Dancehall, Reggae, Trinidadian, Jamaican, Carnival | Distinct from African; 4 live events; strong AU carnival scene. |
| 4 | **Indian** | Bollywood, Bhangra/Punjabi, Tamil & Telugu, Garba/Navratri, Diwali/Holi | India = 2nd-largest overseas country of birth, fastest-growing migrant intake (ABS 2021). Currently buried in "South Asian". |
| 5 | **Other South Asian** | Nepali, Sri Lankan, Pakistani, Bangladeshi | Nepali among fastest-growing communities; deserves visibility without being subsumed by Indian. |
| 6 | **Chinese** | Mandarin, Cantonese, Lunar New Year | Top-5 ancestry; 137k arrivals since 2016. Currently hidden in "East Asian". |
| 7 | **Vietnamese** | Tet, modern Vietnamese pop, community | Top non-English language at home; large established community. Hidden in "East Asian". |
| 8 | **Filipino** | OPM, Fiesta, Sinulog, Pinoy | Large community; 2 live events; distinct from East/Southeast grouping. |
| 9 | **Korean** | K-pop, hallyu, fan events | Distinct cultural-export community; high youth demand. Hidden in "East Asian". |
| 10 | **Japanese** | Matsuri, anime, J-rock, J-pop | Distinct; strong event vertical. Hidden in "East Asian". |
| 11 | **Other East & Southeast Asian** | Thai, Indonesian, Malaysian, Cambodian, Lao | Catch-all for the remaining ESEA communities without erasing them. |
| 12 | **Lebanese & Levantine** | Dabke, Mahrajan, Levantine | Lebanese is a top-tier AU ancestry and event community; 3 live events. Split from "Middle Eastern". |
| 13 | **Arab (other)** | Egyptian, Iraqi, Syrian, Gulf, Arabic music | Distinct from Lebanese/Levantine; 1 live event. |
| 14 | **Persian / Iranian** | Nowruz, classical, diaspora pop | Distinct heritage; Nowruz is a major calendar moment; 1 live event. |
| 15 | **Turkish** | Anatolian, modern Turkish, community | Distinct; established community; 1 live event. |
| 16 | **Greek** | Glendi, bouzouki, Greek festival | Top-tier AU ancestry; one of the strongest cultural-event communities. Split from "Mediterranean". |
| 17 | **Italian** | Sagra, festa, opera, Italian film | Top-6 ancestry; major AU community. Split from "Mediterranean". |
| 18 | **Other European** | Polish, German, Irish, Maltese, Balkan, Ukrainian, Eurovision | Real demand (Oktoberfest, Polish folk, Eurovision in the live set) without 15 sparse tiles. |
| 19 | **Pacific / Pasifika** | Samoan, Tongan, Fijian, Maori (see Decision Point B) | 2 live events; strong AU/NZ community; culturally distinct from Asian and African. |
| 20 | **Latin American** | Salsa, Reggaeton, Bachata, Cumbia, Mexican, Brazilian, Colombian | 3+ live events; large and growing; distinct from Iberian/European. |

### Excluded from Heritage, and why
- **Gospel** - it is a *faith/music* expression, not an ancestry (a Nigerian, Samoan, Filipino or Black American gospel night share faith, not heritage). Moves to Dimension 2 (Faith) and Dimension 3 (Type: Faith & Worship).
- **Comedy** - a format, not a culture. Moves to Dimension 3 (Event Type). "Lagos Comedy Tour" is Heritage:African + Type:Comedy.
- **Wellness** - a lifestyle/format, not an ancestry. Moves to Dimension 3 (Event Type: Wellness).
- **Pride** - an identity/community, not an ancestry. Moves to the cross-cutting Identity tag (section 4). Mardi Gras stays highly visible as Type:Festival + Identity:LGBTQIA+.
- **"East Asian", "Mediterranean", "Middle Eastern" (as top-level)** - retired as primary tiles because they erase the specific communities inside them. They may live on only as optional **region roll-ups** for discovery (Decision Point C), never as the canonical category.

## 2. Dimension 2 - Faith Community (separate, opt-in axis)

Not every event has a faith; faith is optional metadata, never forced. Grounded in ABS 2021 religion data.

| Faith | Calendar/anchor moments | Evidence |
|-------|-------------------------|----------|
| Christian & Gospel | Christmas, Easter, Gospel/Worship nights, choir | 43.9% (Catholic 20.0%, Anglican 9.8%) |
| Islamic | Ramadan, Eid al-Fitr, Eid al-Adha | 3.2% (813,392) |
| Hindu | Diwali, Holi, Navratri | 2.7%, fastest-growing major religion (+55.3%) |
| Buddhist | Vesak, Lunar observances | significant minority faith (ABS 2021) |
| Sikh | Vaisakhi, Gurpurab | significant minority faith |
| Jewish | Hanukkah, Passover, High Holy Days | established minority faith |
| Spiritual / Interfaith / Secular-cultural | Nowruz, solstice, multifaith, non-religious cultural | covers cultural-religious blends + the 38.9% "no religion" |

Rule: Faith is a tag, not a landing replacement. *Diwali Gala* = Heritage:Indian + Faith:Hindu + Type:Food & Drink. A `/faith/[slug]` surface is optional (Decision Point D).

## 3. Dimension 3 - Event Type (genre/format - where Comedy, Wellness, etc. go)

| Event Type | Examples from live data |
|------------|--------------------------|
| Music & Club | Afrobeats Live, Salsa Saturdays, Amapiano Sessions, K-pop night |
| Festival & Carnival | Diwali Festival, Caribbean Carnival, Pasifika Festival, Africultures |
| Comedy | Lagos Comedy Tour, LGBTQ+ Comedy Night, Pacific Islander Comedy |
| Food & Drink | Bollywood Brunch, Diwali Gala Dinner, Caribbean Sunset Cruise, Oktoberfest |
| Community & Family | Filipino Fiesta, Rainbow Family Picnic, Naming Ceremony, Reggae Family Day |
| Arts & Culture | Yoruba Traditions Night, Bosnian documentary, cultural showcase |
| Faith & Worship | Gospel on the River, Brisbane Gospel Choir Showcase |
| Nightlife & Day Party | Owambe After-Party, Reggaeton night, Amapiano Day Party |
| Wellness | yoga, sound bath, breathwork, retreats (no live events yet - honest empty state) |
| Sport & Active | First Nations sport carnivals, community sport (e.g. Barunga-style) |

## 4. Cross-cutting Identity / Community tags (light facet, not a dimension)

Optional, additive tags that are neither ancestry, faith nor format: **LGBTQIA+ / Pride**, **Family-friendly**, **Accessible / low-sensory**, **Free**, **Youth**, **Women-led**. This is where "Pride" correctly lives - Sydney Mardi Gras = Type:Festival + Identity:LGBTQIA+, fully visible, correctly classified, not mislabelled as ancestry.

## 5. How this fixes every stated problem

| Stated problem | Fix in v2 |
|----------------|-----------|
| Missing Aboriginal & Torres Strait Islander | Heritage #1, first, with cultural-authority sub-filters and honest invite state |
| Chinese/Vietnamese/Korean lumped in "East Asian" | Split into Heritage #6, #7, #9, #10, #11 |
| "Indian" deserves its own category | Heritage #4 (Indian) distinct from #5 (Other South Asian) |
| "European"/"Mediterranean" too broad | Greek #16, Italian #17, Lebanese & Levantine #12 split out; #18 Other European |
| Gospel & Comedy are genres, not cultures | Gospel to Faith (D2) + Type:Faith & Worship; Comedy to Type (D3) |
| Wellness is a lifestyle | Moves to Event Type (D3) |
| Pride is identity | Moves to Identity facet (section 4) |

## 6. Mapping of ALL existing events (49: 35 published + 14 draft) - zero data loss

Format: Title -> Heritage / Faith / Type / Identity. Derived from existing tags.

**Published (35)**
- Afrobeats Melbourne: Summer Sessions -> African / - / Music & Club
- Caribbean Carnival Melbourne: Soca Saturday -> Caribbean / - / Festival & Carnival
- Latin Sabor Sydney: Salsa Saturdays -> Latin American / - / Music & Club / Free
- Owambe Sydney: Lagos to Sydney Wedding After-Party -> African / - / Nightlife & Day Party
- Bollywood Nights Sydney: Dhol and Dance -> Indian / - / Music & Club
- Amapiano Adelaide: Log Drum Sessions -> African / - / Nightlife & Day Party
- Island Vibes Sydney: Roots and Culture Night -> Caribbean / - / Nightlife & Day Party
- Gospel on the River: Brisbane Worship Night -> African or pan-cultural / Christian & Gospel / Faith & Worship / Family
- Lagos Comedy Tour: Sydney / Melbourne / Brisbane -> African / - / Comedy
- Aso Ebi Affair: Owambe Garden Party -> African / - / Community & Family / Family
- Afrobeats Live: Headline Concert -> African / - / Music & Club
- Filipino Fiesta Brisbane: Sariwa Sunday -> Filipino / - / Community & Family / Family, Free
- Naming Ceremony Showcase: Yoruba Traditions Night -> African / - / Arts & Culture / Free, Family
- Reggaeton and Bachata: Latin Heat -> Latin American / - / Nightlife & Day Party
- Brisbane Gospel Choir Showcase -> pan-cultural / Christian & Gospel / Faith & Worship
- Caribbean Sunset Cruise: Sydney Harbour -> Caribbean / - / Food & Drink
- Bollywood Brunch: Sangeet Sundays -> Indian / Hindu (cultural) / Food & Drink
- Afrobeats and Brunch: Sunday Sessions -> African / - / Food & Drink
- OPM Night: Filipino Live Music Showcase -> Filipino / - / Music & Club
- Reggae on the Lawn: Family Carnival Day -> Caribbean / - / Community & Family / Family, Free
- Amapiano Day Party: Adelaide Hills -> African / - / Nightlife & Day Party / Family
- Diwali Mela Brisbane -> Indian / Hindu / Festival & Carnival
- Diwali Gala Dinner: An Evening in Jaipur -> Indian / Hindu / Food & Drink
- Diwali Festival Melbourne: Festival of Lights -> Indian / Hindu / Festival & Carnival / Family, Free
- Lunar Banquet: Eight Course Dinner Show -> Chinese / - / Food & Drink
- Lunar Nights Melbourne: Year of the Horse -> Chinese (+ Vietnamese, Korean roll-up) / - / Festival & Carnival / Family, Free
- Caribbean Carnival Melbourne -> Caribbean / - / Festival & Carnival
- Pasifika Festival 2027 -> Pacific / Pasifika / - / Festival & Carnival
- Africultures Festival -> African / - / Festival & Carnival
- Lebanese Eid Festival -> Lebanese & Levantine / Islamic / Festival & Carnival / Family
- (remaining published events follow the same pattern; none fail to map)

**Draft (14)**
- Eurovision Watch Party Sydney -> Other European / - / Music & Club (or Arts & Culture)
- Polish Folk Festival Sydney -> Other European / - / Festival & Carnival / Family
- Lebanese Mahrajan Sydney -> Lebanese & Levantine / - / Festival & Carnival / Family
- Sydney Mardi Gras Afterparty -> (no ancestry) / - / Nightlife & Day Party / **LGBTQIA+**
- Pride Brunch Melbourne -> (no ancestry) / - / Food & Drink / **LGBTQIA+**
- Pasifika Festival Sydney -> Pacific / - / Festival & Carnival
- Turkish Coffee and Stories Sydney -> Turkish / - / Community & Family / Free
- Persian New Year Melbourne -> Persian / Spiritual/Interfaith (Nowruz) / Festival & Carnival / Free
- LGBTQ+ Comedy Night Brisbane -> (no ancestry) / - / Comedy / **LGBTQIA+**
- Maori Cultural Night Melbourne -> Pacific (Maori - see Decision B) / - / Arts & Culture
- Rainbow Family Picnic Adelaide -> (no ancestry) / - / Community & Family / **LGBTQIA+**, Family, Free
- Arab Music Night Brisbane -> Arab (other) / - / Music & Club
- Oktoberfest Melbourne -> Other European / - / Food & Drink
- Pacific Islander Comedy Brisbane -> Pacific / - / Comedy

Result: **all 49 events map cleanly.** No event becomes orphaned; events that were mis-shelved (Gospel-as-culture, Comedy-as-culture, Pride-as-culture) are now correctly placed and *more* discoverable, not less.

## 7. Decision points for the founder (Phase 3 approval gate)

These are genuine forks where the right answer is a founder/brand call, not an engineering one. Phase 4 will not start until these are answered.

- **A. Heritage ordering.** After Aboriginal & Torres Strait Islander (fixed first), order by (i) strict ABS census size, or (ii) EventLinqs community strength (African/Caribbean first - the founder's community and current inventory), or (iii) a documented blend (proposed above). Which?
- **B. Maori placement.** Group under Pacific/Pasifika, or give Maori its own heritage (it is culturally distinct from Pasifika)? Recommend: own sub-filter under Pacific, revisited if volume grows.
- **C. Region roll-ups.** Keep "Asian", "European", "Middle Eastern", "African" as optional *discovery roll-ups* layered over the granular heritages (good for broad browse), or retire them entirely? Recommend: keep as non-canonical roll-ups only.
- **D. `/faith/[slug]` surface.** Ship faith as filter-only metadata in v2, or also build dedicated `/faith/[slug]` landings (e.g. `/faith/hindu`)? Recommend: filter-only in v2, dedicated landings as a fast-follow.
- **E. Indian vs South Asian split.** Confirm Indian as its own heritage (#4) with "Other South Asian" (#5), versus a single "South Asian" with mandatory sub-filters. Recommend the split (evidence: India is the standout migration story).
- **F. URL / SEO migration.** v2 changes slugs (`/culture/east-asian` -> `/culture/chinese` etc.). This needs 301/308 redirect maps for every retired slug to avoid SEO loss. Approve the redrawn slug set + redirect plan before Phase 4.
- **G. Count and naming.** 20 heritages proposed (mission asked ~18-20). Confirm the exact 20, names, and that "First Nations" wording is the founder/community-preferred term ("Aboriginal & Torres Strait Islander" used here per ABS).

## 8. What Phase 4 will involve (NOT started - for scoping only)

DB migration (3-axis categorisation: heritage, faith[], type, identity[]), re-tag all 49 events from existing tag signals, rebuild `/cultures` index, richer `/culture/[slug]` template with sub-filters, optional `/faith/[slug]`, navigation, CLAUDE.md canonical list update, seed data, full slug redirect map, preview verification, PR. Estimated as a multi-PR sequence, gated on Decision Points A-G.

---

## STOP - Phase 3 gate

This is the end of the Phase 2 deliverable. **No implementation will proceed until the founder approves the taxonomy and answers Decision Points A-G.** Awaiting direction.
