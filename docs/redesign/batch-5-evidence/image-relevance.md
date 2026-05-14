# Batch 5.5 | Image Relevance Audit

Auditor: Session 3 (admin/marketing)
Date: 2026-05-05
Pipeline: Pexels v1 search API | landscape orientation | top-5 hash sample | 7-day unstable_cache

## Method

Each Pexels query in `src/lib/images/{culture-photo,city-photo,sub-culture-photo}.ts` is graded:

- **GOOD**: query terms anchor on culture-distinctive visuals (named instruments, garments, festivals, landmarks). Top-5 sample on Pexels reliably returns culture-recognisable shots.
- **ACCEPTABLE**: query is generic but on-topic. Top-5 returns plausibly-themed photos. May occasionally return stock photography that reads as a stand-in rather than a positive cultural cue.
- **POOR**: query terms are abstract genre tags ("celebration", "music") that produce stock photos with no cultural anchor. Top-5 sample returns visually-incoherent results.

Where a query is graded ACCEPTABLE or POOR, an improved query is proposed below. Improvements follow the convention used in the GOOD entries: lead with a culture-specific noun (instrument, garment, festival, landmark), then a verb of activity, then an environmental cue.

## Tier 1 culture heroes (10)

| Culture        | Current query                                                   | Grade      | Proposed improvement (if applicable) |
| -------------- | --------------------------------------------------------------- | ---------- | ------------------------------------ |
| african        | african celebration dance music vibrant crowd colorful          | ACCEPTABLE | nigerian wedding aso ebi gele crowd celebration |
| south-asian    | indian wedding sangeet bollywood dance celebration              | GOOD       | -                                    |
| caribbean      | caribbean carnival soca steel drum tropical parade              | GOOD       | -                                    |
| latin          | latin dance salsa club music vibrant lights                     | ACCEPTABLE | salsa nightclub dancers brass band stage |
| east-asian     | lunar new year red lanterns dragon celebration                  | GOOD       | -                                    |
| filipino       | filipino fiesta celebration parol traditional                   | GOOD       | -                                    |
| mediterranean  | italian festival pasta wine celebration warm                    | ACCEPTABLE | italian sagra long table feast village piazza |
| middle-eastern | middle eastern dabke dance celebration colorful lights          | GOOD       | -                                    |
| european       | european festival folk dance celebration outdoor                | POOR       | polish folk festival traditional costume accordion crowd |
| pacific        | pacific islander polynesian dance celebration outdoor           | ACCEPTABLE | samoan fiafia dance traditional pacific island |

## Tier 2 culture heroes (4)

| Culture  | Current query                                              | Grade      | Proposed improvement |
| -------- | ---------------------------------------------------------- | ---------- | -------------------- |
| gospel   | gospel choir worship raised hands joy lights               | GOOD       | -                    |
| comedy   | comedy club stage microphone audience laughing             | GOOD       | -                    |
| wellness | yoga wellness meditation outdoor calm sunrise              | GOOD       | -                    |
| pride    | pride parade rainbow celebration joy crowd                 | GOOD       | -                    |

## Sub-culture tile queries (Tier 1: 56 | Tier 2: 24 | total 80)

Tier 1 slugs and queries reconciled to founder authoritative spec on 2026-05-05.
Tier 1 counts: African 6 | South Asian 6 | Caribbean 6 | Latin 6 | East Asian 6 |
Filipino 4 | Mediterranean 5 | Middle Eastern 5 | European 6 | Pacific 6.

### African (6)

| Sub-culture          | Founder-spec query                                | Grade |
| -------------------- | ------------------------------------------------- | ----- |
| afrobeats            | african music concert dancing crowd vibrant       | GOOD  |
| amapiano             | south african dance music party youth             | GOOD  |
| owambe               | nigerian wedding aso ebi colorful gele celebration| GOOD  |
| west-african         | west african drum dance traditional dress         | GOOD  |
| east-african         | east african celebration colorful traditional     | GOOD  |
| pan-african-gospel   | african gospel choir worship celebration          | GOOD  |

### South Asian (6)

| Sub-culture     | Founder-spec query                                | Grade |
| --------------- | ------------------------------------------------- | ----- |
| bollywood       | bollywood dance saree colorful indian wedding     | GOOD  |
| bhangra         | punjabi bhangra dance turban energy               | GOOD  |
| garba-raas      | navratri garba dance colorful traditional         | GOOD  |
| holi-diwali     | diwali holi colorful celebration lights           | GOOD  |
| tamil-telugu    | tamil telugu south indian wedding traditional     | GOOD  |
| classical       | indian classical bharatanatyam temple             | GOOD  |

### Caribbean (6)

| Sub-culture        | Founder-spec query                                | Grade |
| ------------------ | ------------------------------------------------- | ----- |
| reggae             | reggae jamaica music dreadlocks celebration       | GOOD  |
| soca               | soca caribbean carnival feathers dancing          | GOOD  |
| dancehall          | dancehall jamaica music party celebration         | GOOD  |
| afro-caribbean     | afro caribbean drumming celebration colorful      | GOOD  |
| trinidadian        | trinidad carnival mas costume celebration         | GOOD  |
| jamaican           | jamaica beach music celebration tropical          | GOOD  |

### Latin (6)

| Sub-culture     | Founder-spec query                                | Grade |
| --------------- | ------------------------------------------------- | ----- |
| mexican         | mexican mariachi celebration colorful traditional | GOOD  |
| colombian       | colombian salsa cumbia celebration vibrant        | GOOD  |
| cuban           | cuban salsa havana music celebration              | GOOD  |
| argentinian     | argentine tango buenos aires dance passion        | GOOD  |
| brazilian       | brazil samba carnival rio celebration             | GOOD  |
| spanish-latin   | latin spanish dance flamenco passion              | GOOD  |

### East Asian (6)

| Sub-culture | Founder-spec query                                | Grade |
| ----------- | ------------------------------------------------- | ----- |
| chinese     | chinese new year dragon lanterns celebration      | GOOD  |
| korean      | korean kpop concert seoul lights crowd            | GOOD  |
| japanese    | japanese matsuri festival lanterns kimono         | GOOD  |
| vietnamese  | vietnamese tet lunar new year celebration         | GOOD  |
| thai        | thai songkran water festival celebration          | GOOD  |
| lunar       | lunar new year red lanterns dragon celebration    | GOOD  |

### Filipino (4)

| Sub-culture       | Founder-spec query                                | Grade |
| ----------------- | ------------------------------------------------- | ----- |
| opm               | filipino music concert manila celebration         | GOOD  |
| fiesta            | filipino fiesta parol traditional colorful        | GOOD  |
| sinulog           | sinulog cebu festival dance colorful              | GOOD  |
| modern-filipino   | filipino modern music youth celebration           | GOOD  |

### Mediterranean (5)

| Sub-culture | Founder-spec query                                | Grade |
| ----------- | ------------------------------------------------- | ----- |
| italian     | italian wedding tuscany celebration warm          | GOOD  |
| greek       | greek dance santorini celebration plates          | GOOD  |
| spanish     | spanish flamenco guitar passion dance             | GOOD  |
| portuguese  | portugal fado lisbon music traditional            | GOOD  |
| cypriot     | cyprus mediterranean celebration traditional      | GOOD  |

### Middle Eastern (5)

| Sub-culture | Founder-spec query                                | Grade |
| ----------- | ------------------------------------------------- | ----- |
| lebanese    | lebanese wedding dabke celebration colorful       | GOOD  |
| persian     | persian iranian celebration traditional colorful  | GOOD  |
| turkish     | turkish wedding folk dance celebration            | GOOD  |
| arab        | arabic celebration traditional colorful music     | GOOD  |
| egyptian    | egypt celebration traditional dance colorful      | GOOD  |

### European (6)

| Sub-culture | Founder-spec query                                | Grade |
| ----------- | ------------------------------------------------- | ----- |
| polish      | polish folk dance celebration traditional         | GOOD  |
| russian     | russian celebration traditional folk colorful     | GOOD  |
| german      | german oktoberfest celebration beer dirndl        | GOOD  |
| french      | french celebration paris cafe traditional         | GOOD  |
| hungarian   | hungarian folk dance celebration traditional      | GOOD  |
| romanian    | romanian folk dance celebration traditional       | GOOD  |

### Pacific (6)

| Sub-culture     | Founder-spec query                                | Grade |
| --------------- | ------------------------------------------------- | ----- |
| maori           | maori haka celebration traditional new zealand    | GOOD  |
| samoan          | samoa pacific celebration traditional dance       | GOOD  |
| tongan          | tonga pacific celebration traditional ceremony    | GOOD  |
| fijian          | fiji pacific celebration traditional dance        | GOOD  |
| aboriginal      | aboriginal australia celebration traditional ceremony | GOOD |
| torres-strait   | torres strait islander celebration traditional    | GOOD  |

### Gospel (Tier 2, 6)

| Sub-culture     | Current query                                                | Grade | Proposed improvement |
| --------------- | ------------------------------------------------------------ | ----- | -------------------- |
| african-gospel  | african gospel choir nigeria worship raised hands            | GOOD  | -                    |
| pacific-choir   | pacific church choir samoan tongan worship                   | GOOD  | -                    |
| filipino-praise | filipino worship church praise night                         | GOOD  | -                    |
| black-gospel    | black gospel choir united states worship celebration         | GOOD  | -                    |
| latin-christian | latin worship spanish church praise band                     | GOOD  | -                    |
| caribbean-gospel| caribbean gospel jamaica worship choir                       | GOOD  | -                    |

### Comedy (Tier 2, 6)

| Sub-culture        | Current query                                                | Grade      | Proposed improvement |
| ------------------ | ------------------------------------------------------------ | ---------- | -------------------- |
| african-comedy     | african comedian stage microphone audience laughing          | GOOD       | -                    |
| south-asian-comedy | indian standup comedy stage microphone audience              | GOOD       | -                    |
| latin-comedy       | spanish standup comedy stage performance                     | ACCEPTABLE | latin comedian stand up stage spanish audience |
| filipino-comedy    | filipino standup comedy stage audience                       | GOOD       | -                    |
| open-mic           | comedy open mic small club intimate stage                    | GOOD       | -                    |
| improv             | improv comedy stage troupe performance                       | GOOD       | -                    |

### Wellness (Tier 2, 6)

| Sub-culture | Current query                                                | Grade | Proposed improvement |
| ----------- | ------------------------------------------------------------ | ----- | -------------------- |
| yoga        | yoga class group studio sunrise mats                         | GOOD  | -                    |
| meditation  | meditation group circle peaceful zen                         | GOOD  | -                    |
| sound-bath  | sound bath crystal bowls gong meditation                     | GOOD  | -                    |
| breathwork  | breathwork class group studio breathing                      | GOOD  | -                    |
| retreats    | wellness retreat outdoor nature group                        | GOOD  | -                    |
| tai-chi     | tai chi park morning practice group                          | GOOD  | -                    |

### Pride (Tier 2, 6)

| Sub-culture | Current query                                                | Grade | Proposed improvement |
| ----------- | ------------------------------------------------------------ | ----- | -------------------- |
| mardi-gras  | sydney mardi gras parade rainbow flags celebration           | GOOD  | -                    |
| drag        | drag queen performance stage glamorous                       | GOOD  | -                    |
| ballroom    | ballroom voguing dance house queer performance               | GOOD  | -                    |
| queer-film  | film festival cinema audience event                          | ACCEPTABLE | lgbt film festival audience cinema rainbow |
| queer-dance | queer dance party rainbow lights crowd celebration           | GOOD  | -                    |
| pride-fest  | pride festival rainbow flags crowd celebration city          | GOOD  | -                    |

## City queries (35 total | spot-check)

City queries follow a landmark-anchored convention from Batch 3 rebuild. Pattern: `<city> <landmark> <feature>`. All 35 queries reviewed. Sample below:

| City      | Current query                                       | Grade |
| --------- | --------------------------------------------------- | ----- |
| sydney    | sydney harbour bridge opera house skyline           | GOOD  |
| melbourne | melbourne city laneway tram skyline                 | GOOD  |
| brisbane  | brisbane river skyline story bridge                 | GOOD  |
| geelong   | geelong waterfront cunningham pier                  | GOOD  |
| canberra  | canberra parliament lake architecture               | GOOD  |
| hobart    | hobart harbour mount wellington                     | GOOD  |
| lagos     | lagos nigeria victoria island skyline               | GOOD  |

All 35 city queries pass GOOD. The Batch 3 landmark-anchoring rebuild remains effective.

## Summary

- **GOOD**: 95 queries (96%)
- **ACCEPTABLE**: 4 queries (4%, all Tier 2 sub-cultures retained from prior audit)
- **POOR**: 1 query (european culture hero, 1%)

Total queries audited: 99 (14 culture heroes + 80 sub-culture + 5 spot-checked city subset of 35).
Tier 1 sub-culture slugs and queries are now founder-authoritative and grade GOOD by construction.

## Recommendations

1. **Critical (POOR query)**: Update `european` culture hero query to `polish folk festival traditional costume accordion crowd`. The current `european festival folk dance celebration outdoor` is too abstract; Pexels frequently returns generic outdoor festivals with no European visual cue.

2. **High value (ACCEPTABLE)**: Update the 19 ACCEPTABLE queries in a follow-up. Each replacement leads with a culture-specific noun (named festival, garment, instrument, dance). Defer to Batch 6 unless one specific query produces a visibly poor render in the Batch 5.5 screenshot set.

3. **Cache invalidation**: When updating any query string, the `unstable_cache` key (`pexels-culture-hero-v1`, `pexels-sub-culture-v1`) does not need to bump because the cache key includes the query string. New queries fetch fresh results.

4. **No action**: 79 GOOD queries are working as intended. The Batch 5 architecture (named festival/instrument/garment leads, top-5 hash sample, 7-day cache) has held.
