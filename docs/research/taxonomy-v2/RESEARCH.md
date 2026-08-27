# Culture Taxonomy v2 - Phase 1 Research Log

Date: 2026-05-16. Prepared for the Culture Taxonomy v2 strategic rebuild.
Method: Firecrawl primary-source scrapes + live Supabase event inventory + the existing competitor analysis on file.

---

## 1. Australian cultural composition (ABS 2021 Census - primary source)

### 1.1 Aboriginal and Torres Strait Islander peoples
Source: ABS, *Estimates of Aboriginal and Torres Strait Islander Australians* and *Aboriginal and Torres Strait Islander people: Census, 2021*.
- 983,700 Aboriginal and Torres Strait Islander people at 30 June 2021 = **3.8% of the total Australian population**.
- 167 Aboriginal and Torres Strait Islander languages used at home, by 76,978 people.
- Implication: a launch-credible AU platform cannot omit First Nations representation. It must be first, and it must be handled with cultural authority (real language/nation naming, not a generic tile).

### 1.2 Country of birth, ancestry, language
Source: ABS, *2021 Census highlights increasing cultural diversity* (media release, 20 Sep 2022) and *Cultural diversity: Census, 2021*.
- ~30% of people in Australia were born overseas (>7 million; up from 26% in 2016).
- 1M+ arrived since the 2016 Census: **India 230,000**, **China 137,000**, **Nepal 71,000** (Nepalese is among the fastest-growing communities).
- **India is now the 2nd-largest overseas country of birth**, behind England (moved up from 4th).
- Top 5 ancestries reflect British/European migration and were unchanged from 2016 (English, Australian, Irish, Scottish, Chinese - then Italian, German, Indian, with Australian Aboriginal and Greek also in the top tier; ABS 2021).
- 5.6 million people (22%) use a language other than English at home (up from 20.6% in 2016). Largest non-English languages at home include Mandarin, Arabic, Vietnamese, Cantonese, Punjabi, Greek, Italian, Hindi, Spanish, Tagalog/Filipino (ABS 2021; Nepali fastest-growing).

Design implication: an ancestry-based heritage dimension must split the groups EventLinqs currently fuses - "East Asian" (Chinese vs Vietnamese vs Korean vs Japanese are distinct top communities), "South Asian" (Indian is the standout, plus Nepali/Sri Lankan/Pakistani), and "European/Mediterranean" (Italian, Greek, Lebanese are individually top-tier ancestries and strong AU event communities).

### 1.3 Religion (ABS 2021, *2021 Census shows changes in Australia's religious diversity*)
- Christianity 43.9% (largest denominations Catholic 20.0%, Anglican 9.8%).
- No religion 38.9% (up from 30.1% in 2016).
- Islam 3.2% (813,392 people).
- Hinduism 2.7% (684,002; grew 55.3% since 2016 - the fastest-growing major religion).
- (Buddhism, Sikhism and Judaism are the other significant minority faiths in the same census.)

Design implication: faith is a **separate dimension** from heritage. Diwali (Hindu), Eid (Islamic), Gospel/Worship (Christian) and Nowruz (Persian cultural-religious) all appear in the current event set but cut across multiple heritages. Faith must be its own opt-in axis, not a fake "culture".

## 2. Competitor and platform taxonomy scan

- **Eventbrite AU** (`/d/australia/cultural-events/`, scraped live): there is **no cultural/ancestry taxonomy**. "Cultural events" is an undifferentiated search slug returning a grab-bag (an Indigenous festival, a Latin club night, a Christian conference, a Bollywood party, a Bosnian documentary, a Chinese club night) with no heritage grouping. Eventbrite's real taxonomy is generic format/genre (Live music, Comedy, Food events, Dating). Their trending list confirms it. One result venue was the "Queensland Multicultural Centre" - the demand exists, the categorisation does not.
- **Humanitix**: no public ancestry taxonomy; organised by cause/charity and generic categories (positioning: "tickets for good, not greed"). Detailed prior capture in `docs/research/competitors/pricing/_ANALYSIS.md`.
- **Ticketmaster / DICE**: documented in `_ANALYSIS.md` - no cultural taxonomy exists or is structurally possible for them (mega-brand / single-vertical).

Conclusion: **no competitor categorises events by cultural heritage at all.** A rigorous, respectful, ancestry + faith + type taxonomy is not "catching up" - it is a category nobody else occupies. The bar is therefore "be undeniably authentic and complete", not "match a competitor".

## 3. Internal reality - the live event signal (49 events: 35 published, 14 draft)

Tag signals already present in real events, grouped:
- **Heritage**: afrobeats / afropop / owambe / yoruba / nigerian / west-african / african; amapiano / south-african; caribbean / soca / dancehall / reggae / jamaican; latin / salsa / cuban / reggaeton / bachata; bollywood / bhangra / dhol / south-asian / diwali / sangeet / mehndi / mela; lunar-new-year / chinese / vietnamese / korean; filipino / opm; pacific / pasifika / samoan / tongan / fijian / maori; middle-eastern / lebanese / persian / turkish / arab; european / polish / german; eurovision.
- **Faith**: gospel / worship / christian / choir; eid (Islamic); diwali (Hindu); nowruz (Persian New Year).
- **Event type / format**: comedy / stand-up; music / live-band; festival; brunch / food / gala / cruise; nightlife / day-party; carnival.
- **Identity**: pride / mardi-gras / queer / lgbtq.
- **First Nations**: ZERO events. The gap is real and must be represented honestly (invite state, not a dead tile).

Every existing event carries a clean heritage or faith or type signal in its tags, so a 3-dimension model can be back-filled from existing tags with no data loss (full mapping in PROPOSAL.md section 6).

## 4. Sources
- ABS, *Cultural diversity: Census, 2021* - abs.gov.au/statistics/people/people-and-communities/cultural-diversity-census/latest-release
- ABS, *2021 Census highlights increasing cultural diversity* (media release) - scraped 2026-05-16
- ABS, *2021 Census shows changes in Australia's religious diversity* (media release) - scraped 2026-05-16
- ABS, *Aboriginal and Torres Strait Islander people: Census, 2021* and *Estimates of Aboriginal and Torres Strait Islander Australians* - latest release
- Eventbrite AU `/d/australia/cultural-events/` - scraped live 2026-05-16
- EventLinqs Supabase `events` table - full inventory pulled 2026-05-16 (read-only)
- `docs/research/competitors/pricing/_ANALYSIS.md` - prior competitor taxonomy capture
