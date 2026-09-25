/**
 * THE EDITORIAL BEHIND EVERY REAL CATEGORY PAGE.
 *
 * ============================================================================
 * WHY THIS FILE EXISTS, AND WHAT IT IS NOT
 * ============================================================================
 *
 * Close-out SEO3 step 4: "Build real category pages at a crawlable path, one
 * page per category read from the taxonomy in the database and never a literal
 * list, each with its own canonical, its own title, its own H1 and its own
 * unique intro copy."
 *
 * THE LIST OF CATEGORIES IS NOT HERE. It is `public.event_categories`, and the
 * route and the sitemap both read it. This file holds the one thing that table
 * cannot hold today: the writing. A category page whose copy was derived from
 * its own name ("Find the best music events in Australia") is the generic
 * template Law 1 exists to refuse, and it is also the exact shape Google
 * collapses as a duplicate, which is the report close-out C19 was raised to
 * answer.
 *
 * SO THE TWO HALVES ARE HELD APART ON PURPOSE, AND A GUARD HOLDS THEM TOGETHER.
 * `scripts/guards/discovery-indexability.mjs` reads the live taxonomy and this
 * file on every build and fails when they disagree in EITHER direction:
 *
 *   a category in the database with no entry here  -> the page would have to
 *       invent its own copy, so the build stops until somebody writes it.
 *   an entry here with no category in the database -> the page would 404 while
 *       something linked to it, so the build stops.
 *
 * That is what makes "never a literal list" true rather than claimed: adding a
 * row to `event_categories` is what creates a page, and this file is what the
 * build then demands before that page may ship.
 *
 * WHY THE COPY IS NOT IN THE DATABASE. `event_categories.description` exists and
 * is null on all 22 rows. Moving the writing there would put a shipped, gated,
 * reviewed surface behind a table with no copy gate, no diff and no history. The
 * taxonomy is data; the writing is a shipped surface, and it is versioned like
 * one.
 *
 * EVERY LINE HERE IS SUBJECT TO THE COPY LAW: Australian English, no em or en
 * dashes, no exclamation marks, community-first, and no competitor named.
 * `scripts/copy-tell-gate.mjs` reads this file like any other source file.
 */

export interface CategoryEditorial {
  /** Must match a slug in public.event_categories. The guard holds it. */
  slug: string
  /** The hero eyebrow, in caps. Short enough to read at 390. */
  eyebrow: string
  /** The page's OWN h1. Never the category name alone. */
  h1: string
  /** The hero body. One or two sentences, specific to this category. */
  intro: string
  /** The document title. Its own, never templated from the name. */
  metaTitle: string
  /** The meta description, under 155 characters. */
  metaDescription: string
  /** The heading above the story. */
  storyHeadline: string
  /** Two paragraphs. The unique intro copy SEO3 step 4 requires. */
  storyParagraphs: [string, string]
  /** Who runs these events in Australia. Rendered as pills. */
  personas: string[]
  /** Search keywords for this page only. */
  keywords: string[]
  /**
   * An existing community surface that covers neighbouring ground, linked
   * rather than duplicated. Google resolves two pages about similar things by
   * reading the link between them; two pages that ignore each other is how it
   * picks one and drops the other.
   */
  seeAlso?: { href: string; label: string }
}

export const CATEGORY_EDITORIAL: readonly CategoryEditorial[] = [
  {
    slug: 'music',
    eyebrow: 'LIVE MUSIC',
    h1: 'Live music, from the front bar to the main stage',
    intro:
      'Contemporary music is about 54 per cent of everything ticketed in Australia. This is where it lives on EventLinqs: touring bills, album launches, residencies and the Thursday night room that sells out before the poster goes up.',
    metaTitle: 'Live music events and gigs in Australia | EventLinqs',
    metaDescription:
      'Gigs, tours, album launches and club nights across Australia, with the total price shown up front and alerts for the rooms you keep going back to.',
    storyHeadline: 'What a music listing is worth here',
    storyParagraphs: [
      'A gig sells on two things: the people who already follow the act, and the people who were free that night and never heard about it. Most platforms only reach the first group. The discovery feed, the follow graph and the push alerts on EventLinqs are built for the second, which is where the last part of a room usually comes from.',
      'Every listing carries the all-in price at the first click, the door times, the age policy and the venue on a map. Nothing is sprung at the payment step, so a buyer who has decided at the top of the page is still buying at the bottom of it.',
    ],
    personas: [
      'Promoters booking touring and local bills',
      'Venues programming a weekly room',
      'Labels and artists running album launches',
      'DJ collectives building a night from nothing',
    ],
    keywords: ['live music Australia', 'gigs near me', 'concert tickets', 'band tickets Melbourne', 'album launch', 'club night tickets'],
  },
  {
    slug: 'sports',
    eyebrow: 'SPORT',
    h1: 'Sport, from the grand final to the grade game',
    intro:
      'Codes, clubs, carnivals and the fixtures that fill a suburban ground on a Saturday. Grassroots sport in Australia sells thousands of tickets a weekend and is served by almost nothing built for it.',
    metaTitle: 'Sport events and fixtures in Australia | EventLinqs',
    metaDescription:
      'Fixtures, finals, carnivals and club days across every code in Australia. Gate entry, memberships and family passes, with the total price shown first.',
    storyHeadline: 'Built for the club as well as the code',
    storyParagraphs: [
      'A district club running a finals day has the same problems as a stadium and a hundredth of the budget: gate queues, cash handling, no idea who came, and a volunteer on the door with a cash tin. Scanning on a phone, a live gate count and an attendee list the club owns afterwards solve all four.',
      'Family passes, member pricing and free junior entry are set per fixture rather than negotiated, and a free gate stays genuinely free: a zero total is charged nothing at all.',
    ],
    personas: [
      'District and regional club committees',
      'State associations running finals series',
      'Carnival and gala day organisers',
      'Combat sport and motorsport promoters',
    ],
    keywords: ['sport tickets Australia', 'club finals tickets', 'grassroots sport gate entry', 'carnival tickets', 'match day tickets'],
  },
  {
    slug: 'arts-community',
    eyebrow: 'ARTS',
    h1: 'Theatre, galleries and the work that only runs for a fortnight',
    intro:
      'Independent theatre, exhibitions, readings, dance and the season that lives or dies on its second week. Short runs need discovery fast, and a slow platform costs a company its audience.',
    metaTitle: 'Arts, theatre and exhibition tickets in Australia | EventLinqs',
    metaDescription:
      'Independent theatre, dance, galleries and readings across Australia. Season passes, concession pricing and seat maps, with the total price shown first.',
    storyHeadline: 'A short season has no time to be invisible',
    storyParagraphs: [
      'An independent season opens on a Wednesday and closes eleven days later. By the time word of mouth arrives the run is half over, which is why a company spends on press it cannot afford. A listing that enters search the day it is published, and a push alert to people who booked something similar last season, is the cheaper half of the same job.',
      'Concession, preview and pay-what-you-can pricing are ordinary ticket tiers here rather than an awkward workaround, and a seat map is set once and reused for the whole season.',
    ],
    personas: [
      'Independent theatre companies and co-ops',
      'Galleries programming openings and talks',
      'Dance companies and physical theatre makers',
      'Writers festivals and reading series',
    ],
    keywords: ['theatre tickets Australia', 'independent theatre Melbourne', 'gallery opening', 'dance performance tickets', 'exhibition tickets'],
  },
  {
    slug: 'food-drink',
    eyebrow: 'FOOD AND DRINK',
    h1: 'Long lunches, degustations, markets and brewery yards',
    intro:
      'Ticketed food and drink is a seated business: a dinner with 48 covers cannot oversell by one. Capacity, dietary notes and the guest list all have to be right before the kitchen starts prepping.',
    metaTitle: 'Food and drink events and dinners in Australia | EventLinqs',
    metaDescription:
      'Long lunches, degustations, tastings, markets and brewery events across Australia. Seated capacity, dietary notes and the total price shown first.',
    storyHeadline: 'The guest list is the prep list',
    storyParagraphs: [
      'A chef needs the numbers and the dietary requirements the day before, not on the night. Ticket questions are set per event, arrive on the attendee export as columns, and go to the kitchen as a list rather than as forty screenshots of an inbox.',
      'Wine dinners, tasting flights and market stalls each price differently, and per-tier capacity means the six magnum seats sell out without taking the rest of the room with them.',
    ],
    personas: [
      'Restaurants running ticketed dinners',
      'Breweries, distilleries and cellar doors',
      'Market and food truck organisers',
      'Cooking schools and tasting hosts',
    ],
    keywords: ['food events Australia', 'degustation tickets', 'wine tasting Melbourne', 'brewery events', 'food market tickets'],
  },
  {
    slug: 'business-networking',
    eyebrow: 'BUSINESS',
    h1: 'Conferences, summits and the room where the deals start',
    intro:
      'Multi-day programmes, early-bird tiers, group registrations and a delegate list that has to be accurate at the door. Business events are the least forgiving thing to run badly.',
    metaTitle: 'Business conferences and networking events in Australia | EventLinqs',
    metaDescription:
      'Conferences, summits, workshops and networking across Australia. Early-bird tiers, group registration and delegate badges, with all-in pricing first.',
    storyHeadline: 'Registration is the product, not the checkout',
    storyParagraphs: [
      'A delegate buys once and then needs six things: an invoice with their company name on it, a transferable ticket when a colleague goes instead, a badge that scans, an agenda, a receipt for the GST return, and somebody to answer the phone. All six are ordinary here rather than an upgrade.',
      'Group registration with one payment and individual tickets means a firm sending five people does it in one transaction and still gets five scannable badges with five names.',
    ],
    personas: [
      'Industry associations running annual conferences',
      'Training providers and workshop hosts',
      'Chambers of commerce and business groups',
      'Startup communities running demo nights',
    ],
    keywords: ['business conference Australia', 'networking events Sydney', 'summit tickets', 'workshop registration', 'professional development events'],
  },
  {
    slug: 'education',
    eyebrow: 'LEARNING',
    h1: 'Courses, short workshops and the one-night masterclass',
    intro:
      'Teaching is sold in seats and in sessions. A six-week course, a single Saturday intensive and a free public lecture are three different products, and all three belong on one ticket page.',
    metaTitle: 'Courses, workshops and lectures in Australia | EventLinqs',
    metaDescription:
      'Short courses, masterclasses, lectures and school holiday programmes across Australia. Session pricing, concessions and the total price shown first.',
    storyHeadline: 'A course is a series, so sell it like one',
    storyParagraphs: [
      'A multi-week course sold as a single ticket loses the people who can only make four of the six weeks, and a course sold week by week loses the ones who would have committed to all of it. Both shapes are ticket tiers here, priced independently, on the same page.',
      'Concession and student pricing, a waitlist that fills a cancellation automatically, and materials lists delivered with the confirmation are the difference between a class that runs and one that is refunded.',
    ],
    personas: [
      'Independent tutors and course leaders',
      'Makerspaces and craft studios',
      'Universities and libraries running public lectures',
      'School holiday programme providers',
    ],
    keywords: ['workshops Australia', 'short courses Melbourne', 'masterclass tickets', 'public lecture', 'school holiday programme'],
  },
  {
    slug: 'charity',
    eyebrow: 'FUNDRAISING',
    h1: 'Fundraisers, galas and the night that has to clear its costs',
    intro:
      'A fundraising night is measured on what reaches the cause, not on what it took at the door. Every dollar the platform keeps is a dollar the charity does not.',
    metaTitle: 'Charity fundraisers and gala events in Australia | EventLinqs',
    metaDescription:
      'Fundraising dinners, galas, raffles and community appeals across Australia. Table bookings, donation tiers and the total shown before checkout.',
    storyHeadline: 'What reaches the cause is the only number that counts',
    storyParagraphs: [
      'Free events carry no fee at all here, which matters to an appeal that takes donations at the door rather than selling a ticket. For a paid night there is one fee and no second line, so the committee can state on the invitation what the night will clear before a single table is booked.',
      'Table bookings, sponsor tiers and an optional donation added at checkout all sit on the one page, and the attendee list belongs to the organisation afterwards, which is how a first-year appeal becomes a second-year one.',
    ],
    personas: [
      'Community fundraising committees',
      'Schools and parent associations',
      'Registered charities running annual galas',
      'Sporting clubs raising for a member',
    ],
    keywords: ['charity events Australia', 'fundraiser tickets', 'gala dinner tickets', 'community fundraiser', 'charity auction night'],
  },
  {
    slug: 'nightlife',
    eyebrow: 'AFTER DARK',
    h1: 'Club nights, warehouse parties and the queue that moves',
    intro:
      'Australia streams more dance music per head than anywhere on earth, and most of it ends up in a room at midnight. Doors, capacity and re-entry are the whole job.',
    metaTitle: 'Club nights and nightlife events in Australia | EventLinqs',
    metaDescription:
      'Club nights, warehouse parties, day parties and after-hours across Australia. Tiered release pricing and door scanning, with the total shown first.',
    storyHeadline: 'Release tiers, and a door that keeps moving',
    storyParagraphs: [
      'A night sells in releases: first release cheap and gone in an hour, second release holding the middle, door price for the ones who decided at 10pm. Each release is its own tier with its own capacity, and the page moves to the next one by itself when a release is gone.',
      'At the door, scanning works with the network off and reconciles when it comes back, which matters in a basement. Two scanners on the same event see each other in real time, so a ticket cannot be walked in twice.',
    ],
    personas: [
      'Club promoters and party crews',
      'Venues programming Friday and Saturday rooms',
      'DJ collectives and label showcases',
      'Day party and rooftop organisers',
    ],
    keywords: ['club night tickets', 'warehouse party Melbourne', 'nightlife events Sydney', 'DJ set tickets', 'day party tickets'],
  },
  {
    slug: 'comedy',
    eyebrow: 'COMEDY',
    h1: 'Stand-up, open mics and the fastest growing room in the country',
    intro:
      'Comedy is the fastest growing category in Australian ticketing. It also runs on tight rooms, short notice and a lot of festival seasons that all land at once.',
    metaTitle: 'Comedy gigs and stand-up tickets in Australia | EventLinqs',
    metaDescription:
      'Stand-up, open mics, festival shows and gala nights across Australia. Multi-night runs, comp lists and the total price shown before checkout.',
    storyHeadline: 'A run of nights, not a night',
    storyParagraphs: [
      'A festival show is the same hour performed nineteen times, and each of those nineteen is its own room with its own sales. Repeating performances are created once and sell separately, so a comic can see which Tuesday is soft while there is still time to do something about it.',
      'Comp lists, industry seats and the last twenty at the door are ordinary ticket types, and the room count is live on a phone from the bar.',
    ],
    personas: [
      'Comics running their own festival seasons',
      'Rooms programming a weekly open mic',
      'Producers touring a stand-up bill',
      'Festival venues managing multi-show nights',
    ],
    keywords: ['comedy tickets Australia', 'stand-up Melbourne', 'open mic comedy', 'comedy festival tickets', 'live comedy near me'],
  },
  {
    slug: 'family',
    eyebrow: 'FAMILY',
    h1: 'School holidays, kids shows and the days out that sell by session',
    intro:
      'Family events sell by session and by group, and the buyer is almost always booking for other people. Session times, age bands and a pram policy are what decide the sale.',
    metaTitle: 'Family and kids events in Australia | EventLinqs',
    metaDescription:
      'School holiday programmes, kids shows, sensory sessions and days out across Australia. Session times, family passes and the total shown first.',
    storyHeadline: 'The parent is buying four tickets and one nap window',
    storyParagraphs: [
      'Session-based selling is the whole difference: twelve sessions across a Saturday, each with its own capacity, each selling independently, all on one page a parent can scan in thirty seconds while holding a toddler.',
      'Family passes priced below four singles, free entry for under-threes, and a clearly stated sensory or relaxed session are the details that turn a browse into a booking, and they are fields here rather than a line in the description nobody reads.',
    ],
    personas: [
      'School holiday programme providers',
      'Councils running community family days',
      'Children theatre and puppetry companies',
      'Farms, zoos and attractions selling sessions',
    ],
    keywords: ['kids events Australia', 'school holiday activities', 'family day out tickets', 'childrens theatre', 'sensory friendly session'],
  },
  {
    slug: 'technology',
    eyebrow: 'TECH',
    h1: 'Meetups, hack nights and conferences that start with a free RSVP',
    intro:
      'Most technology events are free, capped and chronically over-subscribed. The problem is not payment, it is that half the list does not turn up and the room was full on paper.',
    metaTitle: 'Technology meetups and conferences in Australia | EventLinqs',
    metaDescription:
      'Developer meetups, hack nights, launch events and tech conferences across Australia. Free RSVPs, waitlists and automatic release of no-show places.',
    storyHeadline: 'A free ticket is still a seat somebody else wanted',
    storyParagraphs: [
      'Free events cost nothing to run here, so a capped meetup can be ticketed properly rather than tracked in a spreadsheet. A waitlist that promotes automatically when somebody releases their place is what turns a two-thirds turnout into a full room.',
      'For paid conferences the ordinary things are ordinary: early bird by date, group registration, invoices with a company name, and a badge that scans at the door.',
    ],
    personas: [
      'Meetup organisers and user groups',
      'Startups running launch and demo nights',
      'Conference committees and unconferences',
      'Coworking spaces programming a calendar',
    ],
    keywords: ['tech meetup Australia', 'developer events Melbourne', 'hackathon tickets', 'tech conference Sydney', 'startup demo night'],
  },
  {
    slug: 'religion',
    eyebrow: 'FAITH',
    h1: 'Services, conventions and the gatherings a community plans its year around',
    intro:
      'Conventions, revivals, retreats and the annual gathering that brings people in from three states. Most are free, many are capped, and all of them need a name on a seat.',
    metaTitle: 'Faith events, conventions and services in Australia | EventLinqs',
    metaDescription:
      'Conventions, retreats, services and community gatherings across Australia. Free registration, capped seating and the total shown before checkout.',
    storyHeadline: 'Free to attend, and still worth counting',
    storyParagraphs: [
      'A gathering that charges nothing still has a fire limit, a catering number and a bus to book. Free registration costs nothing on EventLinqs, so counting the room is no longer a reason to charge for it.',
      'Multi-day conventions sell as sessions, childcare and youth streams are their own capacities, and the list of who came stays with the community rather than with a platform.',
    ],
    personas: [
      'Churches, mosques, temples and synagogues',
      'Convention and conference committees',
      'Retreat and camp organisers',
      'Youth and young adult ministries',
    ],
    keywords: ['faith events Australia', 'church convention tickets', 'religious conference', 'retreat registration', 'community gathering'],
    seeAlso: { href: '/communities', label: 'Browse faith communities' },
  },
  {
    slug: 'fashion',
    eyebrow: 'FASHION',
    h1: 'Runway, sample sales and the labels that sell out a room',
    intro:
      'Shows run to a seating plan, sample sales run to a queue, and both are over in a day. Fashion events are the shortest sales window in ticketing.',
    metaTitle: 'Fashion shows and sample sale tickets in Australia | EventLinqs',
    metaDescription:
      'Runway shows, sample sales, launches and styling events across Australia. Timed entry, seated allocation and the total shown before checkout.',
    storyHeadline: 'Timed entry is what stops the queue around the block',
    storyParagraphs: [
      'A sample sale with one door and no timed entry is four hours of queue and a lot of people who leave. Entry windows are ticket tiers here, each with its own capacity, so the same number of people come through with nobody standing in the rain.',
      'For a runway the seating plan is the product: front row, standing, industry and press each priced and allocated separately, and the seat map set once and reused each season.',
    ],
    personas: [
      'Independent labels running sample sales',
      'Fashion week and showcase producers',
      'Stylists and image consultants',
      'Markets and pop-ups selling timed entry',
    ],
    keywords: ['fashion show tickets', 'sample sale Melbourne', 'runway show Australia', 'designer pop-up', 'timed entry shopping'],
  },
  {
    slug: 'health-wellness',
    eyebrow: 'WELLNESS',
    h1: 'Classes, retreats and the sessions people book in tens',
    intro:
      'Wellness sells in courses, passes and recurring sessions. A single-ticket platform makes a ten-week yoga term harder to sell than it should be.',
    metaTitle: 'Health and wellness events and classes in Australia | EventLinqs',
    metaDescription:
      'Yoga, breathwork, sound baths, retreats and wellness workshops across Australia. Class passes, term pricing and the total price shown first.',
    storyHeadline: 'Sell the term, not only the Tuesday',
    storyParagraphs: [
      'A term pass, a ten-class pack and a single drop-in are three prices for the same room, and the one a person picks depends entirely on whether they can see all three. They sit side by side as tiers rather than being split across three listings.',
      'Health intake questions, injury notes and emergency contacts are per-event ticket questions that arrive as columns on the attendee list, which is the difference between a safe class and a folder of emails.',
    ],
    personas: [
      'Yoga, pilates and movement studios',
      'Breathwork and sound practitioners',
      'Retreat organisers and facilitators',
      'Allied health running group programmes',
    ],
    keywords: ['wellness events Australia', 'yoga class booking', 'sound bath tickets', 'wellness retreat Australia', 'breathwork session'],
  },
  {
    slug: 'community',
    eyebrow: 'COMMUNITY',
    h1: 'Street parties, working bees and the things a neighbourhood runs itself',
    intro:
      'Most community events are free, run by volunteers, and counted on a clipboard. They are also the events that keep a suburb together, and they deserve better tooling than they get.',
    metaTitle: 'Community events and local gatherings in Australia | EventLinqs',
    metaDescription:
      'Street parties, markets, working bees and neighbourhood gatherings across Australia. Free registration, volunteer shifts and no fees on free events.',
    storyHeadline: 'Volunteers, not a box office',
    storyParagraphs: [
      'The person organising a street party is not a ticketing professional and should not have to become one. A free event takes no fee here and needs no bank details at all, so a residents group can be taking registrations ten minutes after deciding to.',
      'Volunteer shifts, stallholder registrations and a public head count are the three things every community event needs, and they are the same ticket mechanism wearing different words.',
    ],
    personas: [
      'Residents and neighbourhood groups',
      'Councils and neighbourhood houses',
      'Market and stallholder coordinators',
      'Volunteer and landcare organisers',
    ],
    keywords: ['community events Australia', 'local events near me', 'street party', 'neighbourhood market', 'volunteer day'],
    seeAlso: { href: '/communities', label: 'Find your community' },
  },
  {
    slug: 'festival',
    eyebrow: 'FESTIVALS',
    h1: 'Festivals, from a one-day park stage to a three-day camp',
    intro:
      'A festival is a dozen ticket types, a site map, a gate that has to move thousands of people in two hours, and a phone signal that will not be there. All four are the build.',
    metaTitle: 'Festival tickets and multi-day events in Australia | EventLinqs',
    metaDescription:
      'Music, arts and food festivals across Australia. Day passes, camping, payment plans and offline gate scanning, with the total price shown first.',
    storyHeadline: 'The gate is where a festival is won or lost',
    storyParagraphs: [
      'Scanning at a regional site has to work with no signal at all, so the validation set downloads to the scanner before the gates open and reconciles when the network returns. Two lanes cannot admit the same wristband twice, on or off the network.',
      'Day passes, weekend passes, camping, vehicle passes and payment plans are separate tiers on one page, and a payment plan means somebody can go to a big festival without putting it on a card they should not have.',
    ],
    personas: [
      'Independent festival producers',
      'Regional and council-run festivals',
      'Food, wine and harvest festivals',
      'Arts and street festival programmers',
    ],
    keywords: ['festival tickets Australia', 'music festival 2026', 'camping festival tickets', 'day pass festival', 'regional festival'],
  },
  {
    slug: 'film',
    eyebrow: 'SCREEN',
    h1: 'Screenings, premieres and the one-night-only cinema',
    intro:
      'A screening is a room, a session time and a print that is only licensed for one night. Selling it is mostly about being findable in the four days before it happens.',
    metaTitle: 'Film screenings and cinema events in Australia | EventLinqs',
    metaDescription:
      'Premieres, one-night screenings, outdoor cinema and film festivals across Australia. Session times, seat maps and the total shown before checkout.',
    storyHeadline: 'Four days to fill a room',
    storyParagraphs: [
      'Independent screenings are announced late by necessity, which leaves days rather than months to fill the room. A listing that enters search immediately, and an alert to people who bought a ticket to something similar, is most of what a small distributor can actually do.',
      'Question and answer sessions, double bills and outdoor cinema with a weather policy all sit on the one page, and a seat map is optional rather than assumed.',
    ],
    personas: [
      'Independent cinemas and film societies',
      'Film festival programmers',
      'Distributors running preview screenings',
      'Outdoor and pop-up cinema operators',
    ],
    keywords: ['film screening tickets', 'independent cinema Melbourne', 'film festival Australia', 'outdoor cinema tickets', 'premiere screening'],
  },
  {
    slug: 'pride',
    eyebrow: 'PRIDE',
    h1: 'Pride events, all year and not only in March',
    intro:
      'Parades, parties, picnics, panels and the small rooms that matter most. Pride in Australia is a season in some cities and a monthly thing in others, and both need the same care.',
    metaTitle: 'Pride and LGBTQIA+ events in Australia | EventLinqs',
    metaDescription:
      'Pride parties, parades, picnics and community nights across Australia. Safer-space policies, accessible pricing and the total price shown first.',
    storyHeadline: 'Safety is a feature, not a footnote',
    storyParagraphs: [
      'A door list, a named safer-space policy and the ability to remove a ticket quietly are practical safety tools, and they are part of the event rather than something bolted on. An organiser here can state the policy on the listing and hold the door to it.',
      'Sliding scale and pay-what-you-can pricing are ordinary ticket tiers, which matters for community events whose whole point is that nobody is priced out of the room.',
    ],
    personas: [
      'Pride committees and community collectives',
      'Queer party promoters and DJ crews',
      'Support and social groups running regular nights',
      'Regional pride organisers',
    ],
    keywords: ['pride events Australia', 'LGBTQIA events Melbourne', 'queer party tickets', 'pride festival', 'community night'],
  },
  {
    slug: 'european',
    eyebrow: 'EUROPEAN',
    h1: 'European community events across Australia',
    intro:
      'Feast days, festas, national days and the club rooms that have been running the same dance for sixty years. Australia holds one of the largest European-descended populations outside Europe, and it is busy every weekend.',
    metaTitle: 'European community events in Australia | EventLinqs',
    metaDescription:
      'Feast days, festas, national days and club nights across Australia. Community pricing, table bookings and the total shown before checkout.',
    storyHeadline: 'Sixty years of committee minutes, on a phone',
    storyParagraphs: [
      'A community club running an annual festa has decades of practice and a ticketing process built out of a raffle book. Table bookings, member pricing and a printed door list are the three things it actually needs, and all three come out of the same event page.',
      'These events also draw a second and third generation who find things on a phone rather than in a newsletter, which is what a search-visible listing and a discovery feed are for.',
    ],
    personas: [
      'Community clubs and social committees',
      'Festa and feast day organisers',
      'Language schools and associations',
      'Promoters touring European artists',
    ],
    keywords: ['European community events Australia', 'festa tickets', 'national day event', 'community club night', 'European festival Melbourne'],
    seeAlso: { href: '/community/greek', label: 'Greek community events' },
  },
  {
    slug: 'middle-eastern',
    eyebrow: 'MIDDLE EASTERN',
    h1: 'Middle Eastern community events across Australia',
    intro:
      'Concerts, Eid gatherings, weddings, poetry nights and the community dinners that run to hundreds of covers. Sydney and Melbourne carry some of the largest Levantine and Arabic-speaking communities outside the region.',
    metaTitle: 'Middle Eastern community events in Australia | EventLinqs',
    metaDescription:
      'Concerts, Eid gatherings, dinners and community nights across Australia. Table bookings, family pricing and the total shown before checkout.',
    storyHeadline: 'A large dinner is a seating plan, not a ticket count',
    storyParagraphs: [
      'Community dinners sell by the table, not by the head, and a platform that only understands single tickets makes the organiser rebuild the room in a spreadsheet. Tables are a ticket tier here with their own capacity and their own price.',
      'Touring concerts, Eid family days and poetry nights all sit on the same platform, and the attendee list belongs to the organiser afterwards so the next one starts with an audience rather than from zero.',
    ],
    personas: [
      'Community associations and social clubs',
      'Promoters touring regional artists',
      'Mosque and community centre committees',
      'Restaurants running ticketed community nights',
    ],
    keywords: ['Middle Eastern events Australia', 'Arabic concert Sydney', 'Eid events Melbourne', 'community dinner tickets', 'Levantine events'],
    seeAlso: { href: '/community/lebanese-levantine', label: 'Lebanese and Levantine events' },
  },
  {
    slug: 'pacific',
    eyebrow: 'PACIFIC',
    h1: 'Pacific community events across Australia',
    intro:
      'Language weeks, church gatherings, sports carnivals, dance groups and the fundraisers that fill a hall on a weeknight. Pasifika and Maori communities in Australia run some of the best attended community events in the country.',
    metaTitle: 'Pacific and Pasifika community events in Australia | EventLinqs',
    metaDescription:
      'Language weeks, carnivals, church gatherings and dance nights across Australia. Family pricing, free entry and the total shown before checkout.',
    storyHeadline: 'Family pricing, because families come as families',
    storyParagraphs: [
      'An event that charges per head prices out the exact families it is for. Family and household tiers, free entry for children, and an optional donation at checkout are all ordinary settings here rather than a workaround.',
      'Language weeks, sports carnivals and church gatherings are planned a year ahead and announced late, so a listing that can be published early and stay findable does real work for the committee.',
    ],
    personas: [
      'Church and community committees',
      'Language week and community association organisers',
      'Rugby league and touch carnival organisers',
      'Dance groups and performance collectives',
    ],
    keywords: ['Pasifika events Australia', 'Pacific community events', 'language week event', 'island night tickets', 'Maori community events'],
    seeAlso: { href: '/community/pacific-pasifika', label: 'Pasifika community events' },
  },
  {
    slug: 'other',
    eyebrow: 'EVERYTHING ELSE',
    h1: 'The events that do not fit a box',
    intro:
      'Swap meets, dog shows, auctions, ghost tours, trivia leagues, model train exhibitions and the thousand things a taxonomy never sees coming. They sell tickets like anything else.',
    metaTitle: 'Other events and one-off gatherings in Australia | EventLinqs',
    metaDescription:
      'Swap meets, auctions, tours, trivia and one-off gatherings across Australia. Every ticket type, every capacity rule, and the total shown first.',
    storyHeadline: 'A taxonomy is a guess, and this is the honest part of it',
    storyParagraphs: [
      'Every category list in ticketing is somebody guessing what people will run, and every one of them is wrong about something. This page is where the events that were not guessed live, and they get the same tools as the ones that were.',
      'If this page fills up with the same kind of event over and over, that is a signal the taxonomy needs a new row rather than a signal the events are odd. The list is read from the database precisely so adding one is a row rather than a release.',
    ],
    personas: [
      'Swap meet and collector fair organisers',
      'Tour operators and experience hosts',
      'Trivia, quiz and games night runners',
      'Anybody with a room, a date and an audience',
    ],
    keywords: ['events near me Australia', 'things to do this weekend', 'swap meet tickets', 'trivia night', 'ghost tour tickets'],
  },
]

const BY_SLUG = new Map(CATEGORY_EDITORIAL.map(e => [e.slug, e]))

/** The editorial for a category slug, or undefined when none is written. */
export function getCategoryEditorial(slug: string): CategoryEditorial | undefined {
  return BY_SLUG.get(slug.toLowerCase())
}

/** Every slug this file writes for. The guard compares it with the database. */
export function editorialSlugs(): string[] {
  return CATEGORY_EDITORIAL.map(e => e.slug)
}
