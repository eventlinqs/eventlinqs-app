/**
 * The guard runner. Invoked by `npm run guards` and, through it, by `prebuild`,
 * so every one of these is unskippable on the path to a deployable build.
 *
 * Each guard turns a law that was previously enforced by hope into one enforced
 * by a non-zero exit code:
 *
 *   node-version-contract      no script may use an API newer than CI's Node
 *   no-deprecated-runtime      Law 9: the pinned runtime is still supported
 *   auth-provider-guard        no provider button without a server-resolved gate
 *   no-supabase-smtp           no auth flow on Supabase's 2-per-hour built-in mailer
 *   sender-single-source       one definition of the sending identity
 *   no-unguarded-credential-form  no password field submittable before hydration
 *   no-control-characters      no heredoc-corrupted byte in any source file
 *   no-drill-residue           no killed guard-failure drill leaves a mutated file
 *   auth-autocomplete          credential-manager attributes on every auth form
 *   auth-provider-cost         no provider gate on a route with no provider button
 *   canonical-host             one definition of the canonical host, resolved everywhere
 *   canonical-host-runtime     the resolvers, executed, actually return it on production
 *   short-link-namespace       /e/ and /s/ own their segments; no code can shadow a route
 *   check-client-barrel-imports  no third-party namespace import in the browser bundle
 *   migration-collision-guard  no two migrations claiming one version, on any branch
 *   no-inherited-git-env       every git subprocess clears inherited GIT_ variables
 *   payment-critical-doctrine  every paymentCritical variable is actually protected
 *   rls-exposure-scan          no world-readable policy exposes a sensitive column
 *   no-native-submit           no form puts a credential in the URL pre-hydration
 *   no-silent-submit           no control completes with no result and no error
 *   revoked-column-reads       no untrusted-role query selects a revoked column
 *   no-plaintext-credential    no tracked file contains a plaintext credential
 *   entrypoint-authz-audit     every request entry point declares an auth posture
 *   sourced-specifications     Law 7: a third-party spec carries a source or UNSOURCED
 *   no-ai-authorship           Law 8: no commit attributes this work to an AI
 *   labelled-form-controls     every raw input, select and textarea carries a
 *                              programmatic label, so assistive technology can name it
 *   one-db-read-door          every build guard that reads the database goes through
 *                              one door that retries a dropped packet
 *   shared-log-is-opened-for-append  a descriptor handed to a child process is
 *                              opened for append, so a second writer on the same
 *                              file cannot be overwritten by a stale offset
 *   lane-tagged-privilege-writes  a script that grants a Founding Organiser
 *                              window on shared TEST restricts its subject to its
 *                              own lane's rows, because a window makes the platform
 *                              fee zero and a zero keep is refused at the payment
 *                              step, so one left on another lane's charge fixture
 *                              fails that lane's proof for a reason not in its tree
 *   drive-usage-names-what-it-needs  a drive's header names every loader flag and
 *                              environment variable that drive needs, so the
 *                              evidence behind a closure can be reproduced
 *   fixtures-are-not-published  a drive's fixture is never given the two values the
 *                              sitemap selects on, because three lanes share one TEST
 *                              database and a published URL deleted minutes later
 *                              answers 404 to whoever reads the snapshot next
 *   proof-reads-never-discard-their-error  on the campaign proof page a read that
 *                              failed becomes a 500, never a printed zero and never
 *                              a 404, because that page defends a fee with numbers
 *   no-published-lane-b-fixture-on-test  and the same rule asked of the DATABASE:
 *                              no lane B fixture is left published on shared TEST,
 *                              whoever left it and whenever, because a leftover is a
 *                              state and only a question finds one
 *   every-order-carries-its-attribution  an order is never created by a path that
 *                              skips the write-time attribution capture, and the
 *                              repair for the ones it still misses is on a
 *                              schedule, because the guard that reads the rows
 *                              skips in CI and never runs on production at all
 *   busy-region-names-itself   a loading skeleton that names itself carries a role
 *                              allowed to have a name, never a bare aria-label
 *   labels-name-the-right-control  and that label points at the control it describes,
 *                              not at the one that happens to sit beside it
 *   event-structured-data      an event page cannot ship without its Event JSON-LD
 *   sitemap-resolves           no URL enters the sitemap that has no route, redirects, or
 *                              names a column that does not exist
 *   maintained-aggregates      no cache tag without an invalidation, no stored counter
 *                              without a declared maintainer
 *   no-silent-catch            no catch around I/O discards its error in silence
 *   no-client-sentry-import    no client component pulls @sentry/nextjs into the bundle
 *   interaction-only-chrome-is-split  the search overlay and the city dialog are reached
 *                              only by a dynamic import, so they are not first-load
 *                              JavaScript on every one of the 133 routes
 *   edge-cache-is-viewer-independent  a route that is edge-cached publicly renders the
 *                              anonymous header and never stores a signed-in render
 *   no-client-redis-import     no client component pulls @upstash/redis into the bundle
 *   no-loadable-in-the-root-shell  nothing in the root layout's client chunk imports next/dynamic
 *   no-loadable-in-platform-chrome  nor does anything behind the site header or footer,
 *                              which the root-shell closure does not reach
 *   steps-declare-work     every CI step prints how much work it did, and zero fails
 *   curated-categories-exist  every curated homepage category slug exists in the database
 *   no-banned-word-anywhere  the banned word in identifiers, slugs, paths and keys, not only copy
 *   proper-nouns-intact      and the names of real organisations survive that sweep intact
 *   community-editorial-reachable  bespoke community copy reaches a page, or is declared dead
 *   no-unguarded-production-write  no script writes to a database without checking which one
 *   one-db-connection-source   no script assembles its own database connection
 *   one-visibility-source      one public-visibility rule, and every event cache tag is invalidated
 *   migration-needs-sale-gate-fix  the anon column revoke never ships without the sale-gate fix
 *   one-fee-copy               no customer-facing surface names a second fee
 *   no-analytics-before-consent  no measurement or advertising host is reachable
 *                              without consent, and the default is refusal
 *   organiser-page-is-a-read   the live proof block on /organisers is a read from the
 *                              catalogue, the surface is named inside the copy gate, and
 *                              every signup button carries the source AN1 counts
 *   audience-consent-is-the-title-deed  an audience row cannot exist without a
 *                              consent state of true and a non-empty consent wording,
 *                              no unsubscribe surface asks anybody to log in, and the
 *                              community taxonomy and the price bands say the same
 *                              thing in SQL and in TypeScript
 *   matcher-consented-and-capped  no stored match run holds somebody the consent
 *                              resolver refuses, and none holds more people than its
 *                              own cap
 *   attribution-one-record-per-order-never-billable-when-reversed  every order
 *                              carries exactly one stored attribution decision, an
 *                              unattributed one says so with a reason, and nothing
 *                              reports billable while a reversal exists for it
 *   campaigner-allowlist-and-cap-in-database  no send row can exist whose
 *                              recipient is not allowlisted with consent true for that
 *                              campaign and channel, no SMS rests on a consent scoped
 *                              to email, no campaign exceeds its own volume cap, and
 *                              nothing leaves draft without an approval for its segment
 *   forecast-reads-every-number  no fee, price or taxonomy value is typed into
 *                              the public forecast tool, the fee comes from the
 *                              one resolver, the taxonomy from the database, the
 *                              method sentence is chosen by the method used, the
 *                              measured claim stays out of reach, and the call to
 *                              action sits below the result
 *   api-v1-organiser-scope     no row leaves the public read API without the
 *                              organisation predicate in its query: no route file
 *                              can query for itself, the reader is the only reader,
 *                              the three views carry the scope column and cannot be
 *                              written through, an out of scope id answers 404 and
 *                              never 403, every payload names its organisation, the
 *                              key lookup is uncached, and the key screen reads the
 *                              caps it documents rather than typing them
 *   every-guard-has-been-seen-to-fail
 *                              every guard registered in this file has a drill in
 *                              scripts/verify/guard-failure-drills.mjs that has
 *                              actually made it fail, against a dated baseline of
 *                              the 63 that predate the rule; a guard that has never
 *                              been watched to fail is a green light nobody earned
 *   product-loops-carry-their-parameters  the ticket email, rendered, carries the
 *                              run-your-event line and both parameters; the
 *                              confirmation page, the share bar and the
 *                              organiser dashboard build their links through the
 *                              one builder; and nothing types an attributed
 *                              organiser link by hand
 *   proof-page-every-number-sourced  every figure on the campaign proof page is
 *                              produced through a source or a stated absence, no
 *                              number, currency or percentage is typed into the
 *                              rendering path, and the database refuses a stored
 *                              snapshot holding a figure nothing sources
 *   consent-ledger-is-evidence  the consent and suppression ledgers refuse UPDATE and
 *                              DELETE at the database, an event cannot carry empty
 *                              wording or a null tenant, no audience row can exist for
 *                              somebody the resolver refuses, every module that can
 *                              reach a mail transport is classified and every marketing
 *                              one calls the resolver, and no rights or unsubscribe
 *                              surface reads a session
 *   founding-offer-matches-configuration  the published Founding Organiser numbers,
 *                              the fifty in the SQL, and the fee sentence on /organisers
 *                              and /pricing all agree with the configuration
 *   drive-quantity-control-selector  the money drives press the button they name: the
 *                              selector is anchored, it matches the label the product
 *                              puts on the tier increase control, and nothing else in
 *                              src/ answers to it
 *   positioning-lock           no user-facing surface calls EventLinqs a ticketing platform
 *   pricing-derive             the worked fee figures match the lock block they derive from
 *   no-partial-builds          no undated flag, deferral marker or placeholder ships
 *   no-external-checkout       an externally ticketed event cannot reach a checkout
 *   one-sellability-source     one sellability rule, and no live button beside a refusal
 *   zoned-event-times          an event time is converted in the event zone, not the runtime one
 *   mutation-revalidates       a publicly visible mutation invalidates what it affected
 *   gate-fields-complete       a query feeding a gate selects every field that gate reads
 *   refund-restores-inventory  a refund can never take the money and keep the seat sold
 *   no-ambiguous-embed         a PostgREST embed that cannot name its foreign key fails the
 *                              whole query at runtime while compiling and testing clean
 *   one-refund-path            every refund trigger funnels through one path, so there is one
 *                              answer to how much money goes back
 *   refund-success-door        a refund that SUCCEEDS is heard whichever event Stripe announces it
 *                              with: every event in the declared set has a case that reaches
 *                              reconcile_refund, no deprecated event does, the reconcile failure
 *                              is retryable, and the endpoint subscription probe requires the
 *                              same set (close-out R1)
 *   funds-reach-the-organiser  a ticket charge names a destination connected account, refuses an
 *                              organiser who cannot be paid with a named reason, and is never
 *                              refused by the FEE AMOUNT: a deliberately waived fee is a
 *                              legitimate zero and an unexplained zero still is not
 *                              (close-out MONEY FIX A1.7)
 *   every-message-has-a-declared-recipient
 *                              every outbound message names a type the recipient matrix
 *                              declares, no transport escapes the matrix, and no message about
 *                              an organiser's event reaches the platform owner while the
 *                              organiser is told nothing (close-out MONEY FIX B3)
 *   inventory-lock-integrity   two buyers can never be sold the same seat
 *   no-unowned-organisation-read  a service-role read of an organisation's sale posture, or a
 *                              service-role call to the publish gate, must prove the caller
 *                              may act for that organisation first (the service role bypasses
 *                              RLS, so an unchecked read is a cross-tenant read)
 *   no-glassmorphism           no applied backdrop-filter anywhere in src, because the
 *                              Design system and Motion both ban it and neither had a gate
 *   stream-link-never-public   the livestream link is unreachable from every public surface
 *                              and the inert events.virtual_url column is read by nothing
 *   schema-ahead-of-code       the database this build runs against already carries every
 *                              column and table the code names, so code never deploys ahead
 *                              of its migration (read only; refuses a production build until
 *                              the founder's push lands, keeps building previews on TEST)
 *   geocoding-key-posture      a server geocoding key that Google refuses is the silent shape
 *                              (configured-looking, serving nothing) and fails the build; an
 *                              absent key or the browser key standing in is a named decision
 *                              and SKIPs with the founder's step printed
 *   price-history-integrity    ticket_price_history is written by the database triggers only
 *                              and dynamic pricing is saved through save_dynamic_pricing in one
 *                              transaction, so the record a buyer reads is what was charged
 *   offline-door-integrity    the door list carries a hash and never a secret, the sync admits
 *                              through the same compare-and-set as scan_ticket, ticket_scans is
 *                              written by the RPCs only, and the door service worker is GET only
 *                              on /scan/ navigations and /_next/static/ assets
 *   door-live-published       the door's live feed is published on the build's own database
 *                              (ticket_scans in supabase_realtime), asked through one read-only
 *                              RPC, so two doors never go silently deaf to each other
 *   workflows-skip-drafts     every pull-request workflow skips a draft on every job and wakes
 *                              on ready_for_review, so CI runs once, after the local gate
 *   pre-push-gate-wired       .githooks/pre-push runs the whole of scripts/ops/pre-push-gate.mjs,
 *                              npm run gate:push is the same command, and git is pointed at it
 *   gate-servers-carry-a-limiter  every gate step that serves the production build starts it
 *                              through one function, which hands it a rate-limit backend and
 *                              proves the backend answers. Without it the money-path limiter
 *                              fails closed and a drive reports the gate's own gap as a
 *                              product defect
 *   statement-descriptor-premise-holds  no CALLER sets on_behalf_of, so Stripe keeps using
 *                              the PLATFORM's statement descriptor and an organiser's legal
 *                              name cannot reach a buyer's bank statement; a connected
 *                              account is created with BOTH its business profile and its
 *                              descriptor prefix set; and the deleted business-name
 *                              comparison cannot return under any of its four old names
 *   one-door-to-the-requirement-watch  one module reads or writes the monitor's own memory
 *                              of how long a Stripe requirement has been pending, its
 *                              first_seen_at is never written, and a failed write degrades
 *                              the age rather than the check
 *   push-arming-cannot-fail-silently  the backup alert channel can actually be armed, and a
 *                              press that fails says so. One module subscribes, it waits for
 *                              an ACTIVE service worker first, no other worker takes scope '/',
 *                              and both surfaces render the refusal
 *   card-raster-traced        every route that reaches the card rasteriser (derived from the
 *                              import graph, never listed) pins the resvg binary and the brand
 *                              fonts in next.config.ts, judged with Next's own matcher; and as
 *                              npm's postbuild (--built) the trace Next wrote for each route is
 *                              read and must carry both, which is the proof the pin promises
 *   og-single-rasteriser      one rasteriser draws every image: no next/og, no ImageResponse,
 *                              and no direct satori or resvg import anywhere under src except
 *                              card-raster.ts, because next/og rasterises through a sharp that
 *                              cannot decode SVG inside the Next server runtime
 *   event-lifecycle-total     no event status is a dead end, archived leaves only by restore,
 *                              the one public rule pins published, both organiser surfaces
 *                              render the lifecycle controls, and the door SQL never reads
 *                              event status (docs/EVENT-LIFECYCLE.md)
 *   event-lifecycle-installed the build's own database refuses a delete with money records,
 *                              writes a tombstone, carries the archived enum value, gates
 *                              checkout on published and gates every anon read of events,
 *                              asked through one read-only RPC
 *   no-hardcoded-spacing      one spacing scale: no arbitrary padding, margin, gap or inset
 *                              off the 4px grid, in a utility, an inline style or a
 *                              stylesheet (close-out C14.12)
 *   branch-protection-required main requires lint, test and production parity, holds admins,
 *                              requires a pull request, no force push, no bypass actor
 *                              (close-out C16.2.4)
 *   one-priority-image        a document preloads its LCP candidate and nothing else: every
 *                              priority grant is a named candidate, none reaches past the
 *                              first item (close-out C8)
 *   lcp-preload-in-the-first-flush
 *                             the image that decides the paint is rendered by the page
 *                              itself, ahead of every streaming boundary, so its preload
 *                              leaves in the first chunk. Streaming the shell first was
 *                              measured and cost 597 ms of LCP (close-out C8B.3)
 *   image-hints-match-the-cell
 *                             the `sizes` hint a component declares is the width its cell
 *                              actually is: every rail cell says its two numbers twice and
 *                              both agree, every rail hint is derived from a cell, no cell
 *                              width or raw sizes string is written anywhere else, no hint
 *                              is dead and every variant is mapped (close-out C8B.3)
 *   candidate-ladder-has-no-dead-rung
 *                             every width `next.config.ts` offers is one some declared slot
 *                              can select, and every declared slot is reachable at the 2x
 *                              contract. A width nobody selects is still written into the
 *                              srcset of every fixed-width image, 1,404 times on the
 *                              homepage at about 230 bytes each (close-out C8B.3)
 *   marketing-bands-are-supplyable
 *                             every route that renders a marketing band is measured by the
 *                              fidelity drive, every band variant is on its own hint whose
 *                              fixed term matches its declared slot, and a band the
 *                              licensed raster cannot supply is named with a date and a
 *                              reason instead of passing quietly (lane B, 19 Sep 2026)
 *   weak-network-contract     the checkout survives a submit that never reached the server,
 *                              the root service worker keeps only content-hashed assets so
 *                              no cache can serve a stale price, it registers after the
 *                              paint, and /offline is a real route classified never
 *                              (close-out C8B.5, Scope v5 10.3)
 *   homepage-hero-never-empty a homepage with no featured event still wears a curated,
 *                              licensed hero raster from the attribution file beside the
 *                              assets, and the media component owns the failure path
 *                              (close-out C17)
 *   geocoding-never-silent-null a typed address with no coordinates refuses to save on a
 *                              production-like environment, naming the fault, and both
 *                              event actions run that rule (close-out C9)
 *   community-layer-protected the 21 communities, their 20 cities, the faith pages and the
 *                              22 categories match the approved record in both directions;
 *                              the routes and the sitemap still publish them (close-out C18 FINAL)
 *   vercelignore-covers-guard-reads every docs/ file a prebuild script reads survives
 *                              .vercelignore, walked down level by level, and a failure
 *                              prints the exact lines to add rather than describing the
 *                              walk-down (close-out C18 FINAL, F1.9.2)
 *   excluded-reads-survive-the-upload  and every prebuild entry point whose code names a
 *                              docs/ path is EXECUTED in a materialised .vercelignore
 *                              upload. There is no reviewed-tolerant list any more: one
 *                              of its rationales was wrong, nothing had ever run it, and
 *                              it blocked the deployment of 7564b40. Prose does not run,
 *                              and the subject is derived from the import graph (F1.9.2)
 *   indexing-policy           every page route is classified in the indexing policy, every
 *                              never route resolves to noindex, every indexable page names
 *                              its own canonical, the root layout names none, and the
 *                              sitemap gates each templated family on the threshold (C19)
 *   initial-bundle-budget     every route's first-load JavaScript weighed against Scope v5
 *                              10.3's 200KB and against its own recorded mark, which may only
 *                              ever go down. Two modes: this half judges the contract and
 *                              weighs nothing, npm's postbuild runs it with --built and
 *                              weighs the build (C8B.3/C8B.4)
 *   no-catalogue-in-every-document
 *                             a reference list read only after an action is not serialised
 *                              into the document of every page. Two modes, as above: this
 *                              half judges the contract, postbuild's --built weighs the
 *                              built documents. It passes by finding NOTHING, so it
 *                              calibrates its own matcher against a known positive first
 *                              (C8B.3)
 *   class-lists-are-not-repeated-per-card
 *                             a class list a component repeats per item is a composite
 *                              utility, not a string literal: the homepage shipped one
 *                              464-character class value 104 times, in the markup AND
 *                              again in the RSC payload. Three clauses: the composites
 *                              exist and the card files have not re-inlined them; no new
 *                              class literal over 400 chars outside the reviewed baseline;
 *                              and --built weighs repeats in the built documents. It
 *                              cannot see a DYNAMIC route and says so (C8B.3)
 *   all-in-pricing            no buyer is shown a number they will not pay: the fee value has
 *                              ONE source, every buyer-facing price surface resolves it live,
 *                              and no cart total is a per-ticket figure multiplied (SEO4)
 *   parity-spec-complete      every table-stakes line in scripts/lib/parity-spec.mjs carries a
 *                              check that answers on no evidence rather than passing on it,
 *                              and every line is named by a test that breaks it (PARITY1)
 *   no-false-urgency          every scarcity, availability or urgency message is computed
 *                              from real inventory and is a reviewed site naming the
 *                              expression that decides it, no scarcity count is a literal,
 *                              and the accessibility section refuses to render empty or to
 *                              render a negative (SEO5)
 *   discovery-indexability    the page and the sitemap count the same dimension for every
 *                              templated family, nothing overrides or re-spells the owner's
 *                              threshold, and every category in event_categories is a real
 *                              page with written editorial rather than a /events?category=
 *                              query string that canonicalises to /events (SEO3)
 *   sitemap-covers-the-catalogue
 *                             the sitemap and the database agree in both directions for the
 *                              three families that come from rows: no published event,
 *                              organiser profile or venue profile is absent from the sitemap,
 *                              and no URL the sitemap publishes has no row behind it. Reads
 *                              the shipped readers and asks the same questions again over raw
 *                              PostgREST, so a swallowed query error fails a build instead of
 *                              publishing an empty family in silence (SEO2)
 *   machine-callers-reachable every route that authenticates a machine with a shared secret is
 *                              on a reviewed record or a reviewed exclusion, no signed webhook
 *                              can be refused by our own rate limiter, no cron limiter fails
 *                              closed, and the project's live Vercel System Bypass rules match
 *                              what scripts/guards/lib/firewall-bypass-expected.json records (H2.1)
 *   sentry-off-the-paint-path the error-reporting SDK boots on a held error, a first
 *                              interaction or a post-load timer, and the Session Replay
 *                              recorder is never fetched before a first interaction:
 *                              measured at 217.8 KB and 644 ms inside the LCP window
 *                              when it was scheduled on `load` (close-out P0.5)
 *   grid-track-cannot-blow-out  every grid declares a column template its own content cannot
 *                              widen: a base grid-cols-* beside every breakpoint one, and no
 *                              bare fr track. Driven on checkout at 390: one 520px child took
 *                              the track from 358px to 520px and the order summary's right
 *                              edge from 374 to 536, with no scrollbar to reach it (UX6.1-6.3)
 *   buyer-total-is-marked     every buyer-facing total carries data-order-total, so the driven
 *                              viewport proof can find the figure it exists to measure. A
 *                              driven check that cannot find its subject passes in silence (UX6)
 *   lighthouse-floor-ratchet  every Lighthouse assertion is at or above its recorded
 *                              high-water mark: a floor may never be lowered, a budget
 *                              never loosened, a check never moved from error to warn
 *                              and never deleted (close-out P0.7, H5)
 *   gate-names-the-instrument  every Lighthouse collection records the machine it was
 *                              taken on, and a red assertion says whether the page got
 *                              slower or the laptop did. Without it the two are the same
 *                              output: on 8 September 2026 the gate refused main's own
 *                              tree at 41% machine speed and a session went after the
 *                              floors (close-out P0.7, evidence C:\dev\EVIDENCE\P0.7-D)
 *   one-pull-request-at-a-time  at most ONE open pull request is unaccounted for; any held on
 *                              purpose sit in scripts/guards/lib/parked-pull-requests.json
 *                              with a why and an unblockedBy, and that record is itself
 *                              checked for rot on every run (close-out PR5)
 *   launch-readiness-honest    docs/verification/LAUNCH-READINESS.md is a rendering of the
 *                              adjudication in scripts/verify/launch-readiness.mjs and not a
 *                              second place a claim can live: it is re-rendered and compared
 *                              byte for byte, a PASS row must cite evidence that is still on
 *                              disk and carry the date driven, and an OWNER BLOCKED row must
 *                              name what is needed in one sentence (close-out L5, C10.4)
 *   no-build-guard-bypass      no declared guard bypass is set on a machine that builds
 *                              for other people. The list is derived from the manifest,
 *                              never retyped, and a bypass removes the report rather than
 *                              reporting a problem (close-out F1.4)
 *   read-failure-is-not-not-found  a read whose empty answer decides a 404 names its
 *                              error and throws it: never discarded, never folded into
 *                              the notFound() condition, never only logged. A dropped
 *                              socket must answer "try again", not "this does not exist"
 *   build-host-needs-declared  every prebuild entry point declares which of the three
 *                              things the build host lacks it needs - docs, git, a token -
 *                              read out of the import graph rather than listed, and fails
 *                              both ways: an undeclared use, and a declaration the code no
 *                              longer backs (close-out F2.1)
 *   one-contact-domain       every published contact address derives from the sending
 *                              domain, so the site cannot invite people to write to a domain
 *                              it is not served from (close-out UX2.4)
 *   one-platform-entity      the platform's own ABN is written down once and passes the ATO
 *                              checksum. It was hand-copied into twelve places, and in four of
 *                              them prose wrapping split it across two source lines where a
 *                              grep could not see it (close-out UX2.1, LEGAL)
 *   one-venue-address-format  every venue address is composed by one formatter, because
 *                              two call sites each adding the venue name printed it twice
 *                              on the first real organiser event (close-out UX1.2)
 *   organiser-prose-one-rule  organiser and artist prose reaches a screen through
 *                              OrganiserProse or stripMarkdown and never raw, because
 *                              the first real outside organiser's bio shipped to
 *                              production reading **MKL Studios** (close-out UX1.1)
 *   scannable-instruction-has-a-qr  a surface that tells a person to scan a code draws
 *                              one, keeps the typed fallbacks beside it, and builds the
 *                              picture from the same value it prints. /admin/enrol-2fa
 *                              said "scan the QR code" and drew nothing (close-out UX5)
 *   tinted-text-meets-contrast  every solid token text colour painted on a solid token
 *                              background meets WCAG AA, with the ratio COMPUTED from
 *                              globals.css rather than held as a list of banned colours
 *                              in named files, which is how 28 pairs under AA survived
 *                              a test written for exactly that shape (close-out UX1)
 *   trigger-columns-exist    no installed trigger reads a record field that is not a
 *                              column of the table it sits on. plpgsql resolves those at
 *                              runtime, so a typo applies cleanly and then breaks the
 *                              write it was watching (close-out UX3)
 *   types-cover-migrations   the committed src/types/database.ts carries every public
 *                              table, view, enum, callable function and added column the
 *                              migrations create, judged from the repository alone, so a
 *                              migration committed without regenerating the types is
 *                              refused on that commit and not on the push two days later
 *                              when production catches up (11 September 2026)
 *   platform-notifications-installed  the build's own database carries the six triggers
 *                              that record a new organiser, a Stripe onboarding, a
 *                              published event and a paid order, so none of the five can
 *                              complete in silence the way a real organiser's launch did
 *                              on 8 September 2026 (close-out UX3)
 *   platform-day-boundary-is-zone-correct  the owner's daily order-alert ceiling resets
 *                              at a real Sydney midnight on every hour of four years,
 *                              including the two days a year that are not 24 hours long,
 *                              where the boundary used to land an hour out and in October
 *                              on the previous date (close-out UX3.3, 13 September 2026)
 *   notification-paths-retry-before-they-give-up  every delivery path that can write a
 *                              terminal state counts its attempts first, so no path
 *                              escalates or gives up on ONE refusal the way the digest
 *                              did, throwing away up to two hundred orders in a single
 *                              unrecoverable row (close-out UX3.2, 13 September 2026)
 *   digest-attempts-are-the-digests-own  a row held for the digest hands it a FRESH
 *                              attempt count, because the attempts it spent as an
 *                              individual email belong to a different message. Inheriting
 *                              them let a batch arrive at the bound and give up on its
 *                              first refusal, which is the line above defeated through
 *                              another door (close-out UX3.2 and UX3.3, 13 September 2026)
 *   the-daily-state-cannot-go-silent  the once-a-day report is composed and SENT even
 *                              when every read behind it fails, and it names what it
 *                              could not see. It used to return null with no token and
 *                              exit 2 on any throw, sending nothing, which is the one
 *                              signal the owner is told means the build is dead. The
 *                              blind stall check speaks too (close-out UX4.1 and UX4.2,
 *                              13 September 2026)
 *   quiet-hours-are-honoured  the quiet hours the account screen collects are read on
 *                              the USER'S clock before a send, and every path that reads
 *                              the window either acts on it or says in the guard why it
 *                              cannot. The window was collected, validated, stored and
 *                              read on every send, and nothing ever consulted it: a user
 *                              who asked for silence from 10pm was pushed at 3am
 *                              (13 September 2026)
 *   cron-routes-scheduled    every /api/cron route has a vercel.json entry, and every
 *                              entry has a route. /api/cron/queue-admit documented itself
 *                              as running every minute and had no schedule at all, so the
 *                              virtual-queue admission batch had never run once. A cron
 *                              that is never invoked looks exactly like a cron with
 *                              nothing to do, which is why nothing could see it
 *   alert-routing            no branch gate may email, every alert declares its class,
 *                              a drill announces itself, and a push to the session log
 *                              never resets the stall clock. Read in one place because
 *                              all three are rulings about the subject line: the inbox
 *                              was loud about the harmless and silent about the dangerous
 *                              (close-out UX4.3, UX4.5, H2.6)
 *   ledger-append-only        nothing edits the slot ledger, in the source and on the
 *                              project this build will run against. One UPDATE makes every
 *                              number derived from it an assertion, invisibly
 *   ledger-speaks-no-industry  not one ledger column, enum or engine file says event,
 *                              ticket or tier, so the engine can be pointed at a gym's
 *                              rows tomorrow without rebuilding it and losing the history
 *   fillrate-reads-only-the-ledger  the recovery engine imports nothing from this
 *                             platform's domain, queries only the ledger and its
 *                             own tables, and speaks no industry (close-out D2).
 *   overlays-are-portalled    a full-page dialog leaves its ancestors' stacking
 *                             contexts, because one trapped inside a transformed
 *                             ancestor PAINTS correctly and cannot be clicked, and
 *                             nothing else on this platform can see that.
 *   recovery-only-writes-to-people-who-asked  every recovery message names the
 *                             recorded engagement that authorised it, the six
 *                             refusals still exist, and no message goes without a
 *                             working unsubscribe (close-out D2).
 *   ledger-writes-through-the-adapter  one door into the ledger, and every
 *                              order-confirmation site walks through it
 *   tier-identity-preserved  an event's ticket types are reconciled on save, never
 *                              deleted and re-created. The delete-everything version
 *                              made an event permanently uneditable the moment it sold
 *                              one ticket, and told the organiser the name of a database
 *                              constraint; on an unsold event it cascaded away the
 *                              waitlist, the squads, the access codes and the pricing
 *                              rules while every unit test stayed green
 *
 * On no-external-checkout: an event whose tickets are sold on another platform
 * must never render a selector or take a payment here, and the ruling was
 * explicit that this hold "by construction, not by a flag someone can forget".
 * Four refusals enforce it and each depends on its POSITION as much as its
 * presence: move the check in ticketsOnSale below the free-event line and every
 * FREE external event becomes sellable; move the charge preconditions refusal
 * below the organiser checks and an external event under a fully onboarded
 * organiser gets charged; move the reservation check inside its isPaid branch
 * and a free external event reserves. All three still pass every behavioural
 * test, which is why the structure is pinned separately from the behaviour.
 *
 * On one-fee-copy and pricing-derive: the founder ruling of 15 August 2026
 * deleted the separate payment processing fee. The CODE changed that day and the
 * COPY did not, and the sweep found the deleted fee still alive in about twenty
 * places, including the AI support knowledge base, which told anyone who asked
 * that there was "a payment processing fee shown at checkout". Not one of those
 * failed a test, a type check or a gate, because prose is not executed. Worse,
 * docs/PRICING.md, the document that declares itself the ONLY place a fee figure
 * may be written, carried four worked examples built on the deleted fee and was
 * itself the largest single source of the wrong number. So there are now two
 * gates rather than one: pricing-derive RECOMPUTES every worked figure in that
 * document from the lock block and fails on any disagreement, and one-fee-copy
 * fails the build when a customer-facing surface asserts a second fee. The
 * second is deliberately scoped to ASSERTIONS rather than words, because the
 * database column is real, the pass-through rule is live, and the correct copy
 * for an assistant is the sentence "there is no payment processing fee".
 *
 * On no-ai-authorship: Law 8 makes the founder the sole author, which overrides
 * this tooling default of appending a Co-Authored-By trailer. The commit-msg hook
 * in .githooks/ is the cheap enforcement because it rejects a message before it
 * becomes history. This guard is the second line, for the hook being bypassed with
 * --no-verify or a checkout where core.hooksPath was never set, since that setting
 * is local config and is not committed. It is bounded to commits after the law was
 * enacted, because 705 of 1351 reachable commits already carry the trailer and the
 * history rewrite is deliberately deferred until after launch. The deferred count
 * prints on every run so it is not forgotten.
 *
 * On sourced-specifications: Law 7 forbids stating any specification, dimension,
 * limit, price, format or platform behaviour from memory. No static check can judge
 * whether prose was researched, and a guard demanding a citation beside every
 * numeral would fire thousands of times and be switched off within a day. So this
 * narrows to the shape that actually caused harm: a claim about SOMEBODY ELSE'S
 * platform. A line naming a third party and asserting a pixel pair or an aspect
 * ratio must carry a URL or the word UNSOURCED. An honest gap outranks a confident
 * guess, and both satisfy the gate.
 *
 * On entrypoint-authz-audit: there are 167 request entry points, 50 route handlers
 * and 117 exported server actions. The security pass had read about twenty of them
 * and reported the rest as unread, which is honest and useless, because an attacker
 * does not care which files were sampled. This walks all of them and fails the build
 * when one establishes no caller identity and is not declared public with a stated
 * reason, so a route added next month cannot skip the question silently. The
 * decisive distinction it encodes: a session-client path is governed by RLS, so the
 * database scopes the rows, while a service-role path has no backstop and a missing
 * ownership check IS the vulnerability.
 *
 * On no-plaintext-credential: GitGuardian reported a Company Email Password
 * exposed in this repository on 2026-08-08. It was hardcoded in twenty committed
 * automation scripts and reproduced into three security documents, one of them
 * written by the hardening pass itself, which quoted the leaking URL from the
 * brief and the URL contained the password. The person most alert to the defect
 * still committed it, because quoting evidence feels like documentation rather
 * than disclosure. A guard does not feel that difference. Note it protects the
 * WORKING TREE only: a secret already in history is un-exposed by ROTATION, never
 * by an edit.
 *
 * On revoked-column-reads: migration 20260808000010 narrows column privileges, and
 * a privilege failure is LOUD by design, which is right for security and is still
 * an outage in production. PostgREST returns "permission denied for column email"
 * and fails the WHOLE query, not just the field. The first draft of that migration
 * would have broken Stripe Connect onboarding, because onboard/route.ts reads
 * organisations.email with the session client. Nothing in the type system or the
 * test suite could catch it: the failure only exists once the grant changes. This
 * guard resolves the client per query, so it knows which Postgres role each read
 * runs as, and fails the build if any of them asks for a column it no longer has.
 *
 * On no-native-submit: a form written as onSubmit with preventDefault and no
 * action is correct once React is live and a credential leak before it, because
 * a native submit with no action and no method is a GET to the current URL with
 * every named field in the query string. That is how a real password reached
 * production in a URL. The first fix covered src/components/auth, which is four
 * files; the class is not four files, and the same shape carried the ADMIN
 * password, the admin TOTP code and the recovery code on /admin/login. This
 * guard is repo-wide and risk-aware: it fails on forms carrying a credential or
 * personal data, and merely lists the search boxes and filter panels, where a
 * field in the query string is the entire point.
 *
 * On rls-exposure-scan, because it is the newest and the least obvious: Row
 * Level Security filters ROWS, never COLUMNS. A permissive SELECT policy with
 * no TO clause reaches PUBLIC, which includes anon, and the anon key is
 * NEXT_PUBLIC and readable in any page source. So one such policy publishes
 * every column of every matching row to the whole internet. That shipped twice:
 * 20260625000002 closed it on profiles (email, full_name, phone) and
 * 20260808000010 closed it on organisations, on event_artists.invite_token (a
 * credential that transfers profile ownership) and on venues. The first fix
 * dropped a policy, which fixed the instance and left the class alive. This
 * guard models both the policies and the column grants, so it fails the build
 * when the shape reappears on any table, including one not yet written.
 *
 * Runs them all rather than short-circuiting, so one pass reports every
 * violation instead of making the founder play whack-a-mole.
 *
 * THE BOUNDARY BETWEEN THE TWO GUARD SYSTEMS, stated because the rebase that
 * brought them together made it a live question rather than a tidy one.
 *
 * Two independent lines of work each added a build-failing guard and each wired
 * it into the same `prebuild` line. PR #111 added
 * `scripts/check-client-barrel-imports.mjs`, which protects the SIZE of the
 * browser bundle. This branch added the runner you are reading, which protects
 * the CORRECTNESS of the auth surface and the runtime every script assumes.
 * Git presented that as one conflicted line, and the shape of the conflict made
 * "keep my side" delete the other side's guard with nothing going red: the build
 * would have stayed green while an entire class of regression stopped being
 * checked. That is the failure mode this comment exists to prevent recurring.
 *
 * preview-deployment-state: fails when the deployment of the COMMIT UNDER TEST
 * is in ERROR, and in CI waits for that deployment to settle first. Added
 * 9 August 2026 after feat/public-composer was found with SIX consecutive
 * preview builds in ERROR while tsc, eslint, 1839 tests and nine guards all
 * reported green, because none of them can see a bundler failure. Rewritten
 * 7 September 2026 (close-out C16) when it was found judging the PREVIOUS
 * commit's deployment whenever the current one was still building, which is
 * every successful merge. Skips loudly without a VERCEL_TOKEN or a Vercel CLI
 * login rather than failing on every machine without credentials, because a
 * guard everyone disables protects nothing. A skip is the honest state, not a
 * pass.
 *
 * The resolution is deliberately structural rather than a longer `&&` chain.
 * `prebuild` now names ONE runner, and the list below is the single place a
 * build-failing guard is registered, so a third line of work cannot recreate
 * the same collision. The two systems keep separate FILES because they answer
 * separate questions and fail for separate reasons; they share a RUNNER because
 * "what must be true before this repository may be built" is one list, not two.
 *
 * The barrel guard gains something real from being here rather than in the
 * chain: the runtime banner below now covers it too. It was previously run on
 * whatever Node happened to be on the machine, with nothing saying so.
 *
 * THE RUNTIME BANNER. On 2026-08-05 this suite reported all-pass on a laptop
 * running Node 24 while three of its four guards were crashing in CI on Node 20.
 * The suite was not wrong about the code; it was measured on a runtime CI never
 * uses, and nothing said so. It says so now: any run whose Node major is not the
 * `.nvmrc` contract is labelled NOT CI-EQUIVALENT in its own output, so a green
 * local run cannot be quoted as proof of a green CI run.
 *
 * The banner is DERIVED from `.nvmrc`, never hardcoded, which is why the founder
 * ruling of 13 August 2026 moving the platform to Node 24 needed no edit here.
 * The polarity simply inverted with the contract: a Node 24 run now reads
 * CI-EQUIVALENT and a Node 20 run reads NOT CI-EQUIVALENT, the reverse of what
 * this file printed the day before. That is the property worth having. A banner
 * with the number written into it would have gone on confidently reporting the
 * old answer, which is the failure it exists to prevent.
 *
 * no-display-time-exclusion: founder ruling 16 August 2026, PUBLISHED MEANS
 * VISIBLE. Refuses the four shapes in which a published, public row has
 * actually been removed from a discovery surface on this platform: a SQL lower
 * bound at now, the same bound written in JavaScript, a cover test used to
 * exclude rather than to rank, and a post-query filter running on a page the
 * database had already chosen. Nineteen tests pinned the listing window and all
 * of them passed while seven more copies of the defect were live; a test proves
 * the code it calls, and only a scanner proves the absence of a shape. Its scope
 * is derived rather than listed, and it prints how many files, predicates,
 * filters and range calls it inspected, so a scope that collapses says so
 * instead of printing the same PASS.
 *
 * publish-requires-cover: the photo-required rule, in four parts, because
 * removing any one of them leaves the other three looking healthy: the
 * predicate still rejects null, empty and picsum; the cover field is REQUIRED by
 * the type (it was once optional, and a caller that omitted it skipped the check
 * in silence); the refusal runs before any path that can return ok; and every
 * publish site in a derived scan is either gated or carries a written
 * allowance. It also asserts the database backstop, both the migration that adds
 * the events_published_real_cover constraint and the one that VALIDATES it,
 * since a constraint left NOT VALID binds new rows only.
 */
import { spawnSync } from 'node:child_process'

import { gitEnv } from '../lib/git-env.mjs'
import { describeOutcome, renderFailures } from './lib/guard-run-report.mjs'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

/**
 * Every build-failing guard, as a path relative to the repository root.
 *
 * Repo-relative rather than a bare filename, because the list is no longer all
 * one directory and pretending otherwise would have meant either moving another
 * line of work's file to fit this runner's assumption, or quietly leaving it
 * out. Registering a guard is now one line here, wherever the guard lives.
 */
const GUARDS = [
  'scripts/guards/node-version-contract.mjs',
  // Law 9 (founder ruling 2026-08-13). node-version-contract asks whether the
  // scripts match the pinned runtime; this asks whether the PIN ITSELF is still
  // a supported release, which nothing did. `.nvmrc` said 20 until 13 August
  // 2026 and Node 20 went end of life on 2026-04-30, so the platform sat three
  // and a half months on an unsupported runtime with every gate green.
  'scripts/guards/no-deprecated-runtime.mjs',
  'scripts/guards/auth-provider-guard.mjs',
  'scripts/guards/auth-provider-cost-guard.mjs',
  'scripts/guards/no-supabase-smtp.mjs',
  'scripts/guards/sender-single-source.mjs',
  'scripts/guards/no-unguarded-credential-form.mjs',
  'scripts/guards/no-control-characters.mjs',
  // The guard-failure drill harness mutates a real source file and restored it
  // in a `finally`, which does not run when the process is killed. It was killed
  // twice in two days: a power loss put `process.exit(1)` into the guard above
  // and into commit 1aa059f6, where it exited 1 with no output at all and read
  // as a real finding for a day; a usage-limit kill left an auth provider
  // hardcoded on in the login page. This one fails while any drill journal entry
  // is open, so a crash can only ever ADD evidence, and it offers the one-command
  // undo rather than a description of one.
  'scripts/guards/no-drill-residue.mjs',
  'scripts/guards/auth-autocomplete-guard.mjs',
  // One definition of the canonical host. The same wrong-domain defect had
  // landed in six places, including four share-card generators that printed it
  // onto an artefact a stranger sees, and every one was found by accident.
  'scripts/guards/canonical-host.mjs',
  // The RUNTIME half of the same law, and the one that could have caught the
  // 13 August defect. The scanner above reads files; the wrong host was never in
  // a file. It came out of VERCEL_PROJECT_PRODUCTION_URL at runtime, so a clean
  // grep and a wrong artefact were true at the same time. This one executes the
  // real resolvers in a fresh process under a simulated production and a
  // simulated preview, which is the only way to see a value that lives in an
  // environment variable.
  'scripts/guards/canonical-host-runtime.mjs',
  // A share code is a readable slug, so it must never be mintable as something
  // that shadows a real route, and nothing else may take the /e/ segment.
  'scripts/guards/short-link-namespace.mjs',
  // A branch whose preview has not built is a branch whose verification is
  // fiction (founder ruling, 9 August 2026). Skips loudly without a token.
  'scripts/guards/preview-deployment-state.mjs',
  // From PR #111. See THE BOUNDARY above: separate file, separate question,
  // shared runner. Absent from this list, `prebuild` stops checking the browser
  // bundle for untree-shakeable namespace imports and nothing goes red.
  'scripts/check-client-barrel-imports.mjs',
  // Founder ruling 2026-08-12 (R-MIGRATION-GUARD). This guard was written for
  // exactly the failure it needed to catch, was correct, had a working
  // cross-branch check, and was WIRED TO NOTHING. It lived in scripts/verify/
  // and no gate, script or workflow invoked it, so it reported nothing and the
  // silence read as health. Three real collisions accumulated behind it, one of
  // which reached TEST and skipped a migration permanently.
  //
  // Registered here it runs in `prebuild` and blocks the build, which is the
  // only place it can act before a colliding version is pushed. It stays in
  // scripts/verify/ because it is also run by hand with --remote against the
  // linked project; the path below is the one thing that makes it a gate.
  'scripts/verify/migration-collision-guard.mjs',
  // Founder ruling 2026-08-15, the GIT_DIR incident class. A git hook exports
  // GIT_DIR, an inheriting child ignores cwd for the purpose of choosing a
  // repository, and the command runs against the REAL one. That is how a test
  // drill set core.bare=true on the shared config and broke `git status` in all
  // nine worktrees at once, and how two commits reached the remote authored by a
  // test fixture.
  //
  // Registered here rather than left as a convention because the failure is
  // invisible outside a hook: in an ordinary shell GIT_DIR is unset, every call
  // site behaves correctly, and code review cannot tell the safe line from the
  // unsafe one. This is the only place the decision is checked at all.
  'scripts/guards/no-inherited-git-env.mjs',
  // Founder ruling 2026-08-12: of the twelve unwired source-only checks found by
  // the sweep, wire THIS one and leave the other eleven listed and unwired,
  // because it guards money. It asserts the paymentCritical doctrine: every
  // variable carrying that flag exists on production, is sensitive where the
  // platform allows it, is covered by the runtime sentinel, and has a rotation
  // procedure with a verification command.
  //
  // It was itself written because a classification had one display consumer and
  // no guard, which is the same shape as a guard with no caller: something that
  // reads as a control and controls nothing.
  'scripts/verify/payment-critical-doctrine.mjs',
  // RLS column exposure. Deliberately written WITHOUT apostrophes: the registry
  // test extracts single-quoted strings from this array, so an apostrophe in a
  // comment here is parsed as the start of a registered path and turns
  // tests/unit/guards/guard-registry.test.ts red for a reason that has nothing
  // to do with guards. Full rationale lives in the header above and in
  // docs/security/AUDIT-2026-08-08.md.
  'scripts/security/rls-exposure-scan.mjs',
  'scripts/guards/no-native-submit-guard.mjs',
  // A control that completes with neither a visible result nor a visible
  // error. Journey 8, 29 August 2026: a number input whose min and step
  // disagreed made every round value a stepMismatch, so the browser refused
  // the submit before React saw it and the panel showed nothing at all.
  'scripts/guards/no-silent-submit.mjs',
  'scripts/security/revoked-column-reads.mjs',
  'scripts/guards/no-plaintext-credential.mjs',
  'scripts/security/entrypoint-authz-audit.mjs',
  'scripts/guards/sourced-specifications.mjs',
  'scripts/guards/no-ai-authorship.mjs',

  // A raw input, select or textarea that assistive technology cannot name is
  // unusable without sight, and it is invisible to review because the screen
  // looks finished. Found on 28 August 2026: 34 such controls across 13
  // surfaces, including the whole venue form and the whole discount form, where
  // a visible label sat right beside the field and was associated with nothing.
  // NO APOSTROPHES IN THIS BLOCK, see the note above the RLS entry.
  // The guard walks the TSX AST rather than grepping, because both greps tried
  // that day were wrong: one called 20 controls labelled when 9 were, the other
  // called 39 unlabelled when 0 were. It resolves aria-label, aria-labelledby,
  // htmlFor pairing, an ancestor label element, and a component that wraps its
  // children in a label. The DOM remains the authority; this is the fast gate.
  'scripts/guards/labelled-form-controls.mjs',

  // The sibling of the guard above, and the founder was right that the first one
  // could never catch this: it proves a control HAS a name, not that the name is
  // TRUE. On 28 August a label reading "Price" pointed at the CURRENCY select
  // beside the price input, so pressing the label focused the currency and
  // filling the field the label named produced a zero-priced ticket on a paid
  // event. NO APOSTROPHES IN THIS BLOCK, see the note above the RLS entry.
  'scripts/guards/labels-name-the-right-control.mjs',
  // The third sibling, and the one the other two cannot see: a name that is
  // PROHIBITED, so assistive technology drops it silently. A plain div maps to
  // role=generic and a generic role may not carry an accessible name, so
  // `<div aria-busy aria-label="Loading">` is invalid ARIA that announces
  // nothing while looking correct in review. Fixed once in the seating plan in
  // September, with a comment, and shipped again three times anyway: checkout,
  // the event page and the shared LoadingState. The checkout one BLOCKED THE
  // PUSH GATE on 13 September 2026 at the checkout-viewport step. Scoped to
  // aria-busy because that is where axe raises a violation rather than a review
  // note, which is measured in the guard header, not assumed.
  // NO APOSTROPHES IN THIS BLOCK, see the note above the RLS entry.
  'scripts/guards/busy-region-names-itself.mjs',
  // A build guard that reads the database over the network does it through one
  // door that retries a dropped packet. On 13 September 2026 two pushes were
  // blocked, four hours apart, by guards reporting `fetch failed` as a finding;
  // one of them told the reader to apply two migrations that had been applied
  // for a week. Five of the probes were copy-pastes of each other, so the first
  // fix, made to the single guard that used the supabase client, missed all of
  // them. NO APOSTROPHES IN THIS BLOCK, see the note above the RLS entry.
  'scripts/guards/one-db-read-door.mjs',
  // A descriptor handed to a child process is opened for APPEND, never
  // truncating. startGateServer hands one fd to the server, the Upstash stub
  // and any extra a step needs, and the drives read that file as an inbox AND
  // append the recovery engine subprocess mail into it. A truncating fd keeps
  // its own offset, so every append moved end of file past it and the server
  // wrote over the message the harness had just added. On 13 September 2026
  // the D2 recovery proof at 768 called that a product defect: two messages
  // where three were sent, while the database and the engine both said three.
  // NO APOSTROPHES IN THIS BLOCK, see the note above the RLS entry.
  'scripts/guards/shared-log-is-opened-for-append.mjs',
  // A drive's documented command names everything that drive actually needs.
  // Three incidents in one day, 14 September 2026, all in lane B's own drives
  // and all found by running exactly what the header said: an1-consent-drive
  // named neither loader flag nor SERVER_LOG and reported 'no confirmation link
  // was printed' and 'the role is attendee after confirming' before throwing
  // part way through; pl1-loops-drive named the loaders and not SERVER_LOG and
  // reported 'the weekly query counted 0 referred signups'. Every one of those
  // messages accuses the product and not one was about the product, which is
  // the property that makes it worth a guard: the damage lands in the harness's
  // own evidence. A drive is what a closure block cites, so a drive nobody can
  // reproduce is a closure resting on somebody's shell history. Drilled red in
  // scripts/verify/guard-failure-drills.mjs.
  // Three lanes share TEST vkapkibzokmfaxqogypq. On 14 September 2026 lane B's
  // FO1 offer drive was found granting and revoking Founding Organiser windows on
  // whichever organisation happened to be first, which on that day meant lane A's
  // refund fixtures and lane C's events. A window sets the platform fee to zero and
  // a zero keep is refused at the payment step, so it makes another lane's proof
  // fail at Stripe with the cause nowhere in that lane's tree. Drilled red in
  // scripts/verify/guard-failure-drills.mjs.
  'scripts/guards/lane-tagged-privilege-writes.mjs',
  'scripts/guards/drive-usage-names-what-it-needs.mjs',
  // On 14 September 2026 lane B's PL1 fixture refused lane A's push at step 13 of
  // 16: an organisation created `active` and an event created `public` are exactly
  // what src/app/sitemap.ts selects on, so for the minutes that fixture lived the
  // platform advertised an organiser profile and a venue page that were about to be
  // deleted, and another lane's server had already cached that snapshot for its 300
  // second revalidate window. Deleting the rows does not undo the advertising. The
  // same shape cost production 48 URLs answering 404 to Googlebot on 25 August 2026.
  // This guard also checks its own premise, because a rule about what the sitemap
  // publishes is worthless the day the sitemap publishes something else. Drilled red
  // in scripts/verify/guard-failure-drills.mjs, four ways.
  'scripts/guards/fixtures-are-not-published.mjs',
  // 15 September 2026, found by driving rather than by reading. GA5's drive said
  // the proof page did not read as the with-sales state and the leading number
  // rendered at 0 pixels. The server log carried the cause: a ConnectTimeoutError
  // to Supabase, for about a minute. Every read in src/lib/proof/read.ts dropped
  // its error, so the campaign read returned null and the page answered 404 for a
  // campaign that exists, and the orders read would have returned an empty list,
  // which downstream is not an error at all. It is zero revenue, printed as a
  // figure, on the one page whose stated law is that a figure which cannot name
  // its source renders as words and never as a zero. Drilled red two ways in
  // scripts/verify/guard-failure-drills.mjs.
  'scripts/guards/proof-reads-never-discard-their-error.mjs',
  // The third lock on the same law, and the only one that asks the world. The
  // static guard reads the drives; each drive asks about its own run; this asks
  // what is on TEST right now. On 13 September 2026 a GA5 run left a published
  // fixture event with four confirmed orders behind it, GA5 reported 'left as
  // found' on every run afterwards because it counted campaign rows, and it sat in
  // the sitemap for two days. Neither of the other two locks can see that: the
  // source was already being changed and the run had long since ended. SKIPS by
  // name where there is no database, as schema-ahead-of-code does. Drilled red in
  // scripts/verify/guard-failure-drills.mjs by removing the FO1 exemption, and its
  // decision is driven both ways over synthetic rows in
  // tests/unit/guards/no-published-lane-b-fixture-on-test.test.ts, because proving
  // the interesting half against the real database means committing the incident.
  'scripts/guards/no-published-lane-b-fixture-on-test.mjs',
  // 15 September 2026. GA3's invariant guard reads the database, and its own
  // header says what it cannot do: in CI it points at a PLACEHOLDER project and
  // skips, and on production nothing runs it at all. So the rule that every
  // order carries exactly one stored attribution decision was defended by four
  // call sites remembering one function, plus an ops script a person runs by
  // hand after a build reds on a different machine. This checks the two halves
  // that ARE source facts: every order insert under src/ is paired with the
  // write-time capture, and the healer is on a schedule. Both derived by reading
  // src/ rather than listed, so the fifth insert site is judged the day it is
  // written. Drilled red both ways in scripts/verify/guard-failure-drills.mjs.
  'scripts/guards/every-order-carries-its-attribution.mjs',
  // Close-out L5 (9 September 2026): the launch readiness report is a rendering
  // of the adjudication in scripts/verify/launch-readiness.mjs, re-rendered here
  // and compared byte for byte, so a row cannot be improved by editing the
  // markdown. A PASS row must cite evidence that is still in the repository and
  // carry the date driven; an OWNER BLOCKED row must name what is needed in one
  // sentence, which is close-out C10.4's rule applied for the same reason. It is
  // the most tempting document in the tree to edit by hand, because every row is
  // a claim about whether a journey works. SKIPS by name where docs/ has been
  // stripped by .vercelignore, and is registered TOLERANT there. Drilled red in
  // scripts/verify/guard-failure-drills.mjs, four ways.
  'scripts/guards/launch-readiness-honest.mjs',

  // Founder brief 2026-08-23: an event page can never ship without its
  // structured data. A production audit that day found every event page valid
  // on the REQUIRED set but missing `performer` on 36 of 36, because the page
  // loaded the lineup to render it and never passed it to the markup. This
  // guard holds the WIRING; tests/unit/seo/event-structured-data.test.ts holds
  // the CONTENT; scripts/verify/event-structured-data-audit.mjs holds the
  // DEPLOYED truth.
  'scripts/guards/event-structured-data.mjs',
  // NOTHING ENTERS THE SITEMAP THAT DOES NOT RESOLVE. Three ways of breaking
  // that promise were live in one file at once on 25 August 2026: a query on
  // venues.slug, a column that does not exist, silently caught; six
  // /categories/* URLs this repository 308s away; and no tie at all between the
  // shapes published and the routes that exist. A sweep of the 586 URLs the
  // production sitemap published returned 48 hard 404s.
  'scripts/guards/sitemap-resolves.mjs',
  // A SECOND COPY MUST HAVE SOMETHING KEEPING IT IN STEP. Four failures of this
  // one class landed in a week, in four different mechanisms: a cached rail with
  // eight deleted events, a sitemap with 48 dead URLs, reserved_count holding
  // seats nobody held, and event_addons.sold_count stuck at 0 while the checkout
  // capped an addon at total_capacity minus it. This guard makes the link
  // between the write and the copy unskippable; the drift drive measures whether
  // the maintainers are actually correct.
  'scripts/guards/maintained-aggregates.mjs',
  // AN ERROR FROM OUTSIDE THE PROCESS MUST NOT BE DISCARDED IN SILENCE. A bare
  // catch {} in src/app/sitemap.ts ate a 42703 on venues.slug, a column that has
  // never existed, and published zero venue URLs from the day the block was
  // written. The gate is drawn at I/O rather than at every catch, on purpose:
  // the reasoning, the 197 catches it deliberately does not fail, and the
  // PostgREST { data, error } shape it cannot see are all in the guard's header.
  'scripts/guards/no-silent-catch.mjs',
  // NO CLIENT COMPONENT MAY REACH THE SENTRY SDK THROUGH A VALUE IMPORT. That
  // edge existed once through the four error boundaries and put @sentry/nextjs
  // in the bundle of every route; client-error-report.ts was built to break it,
  // and a comment was all that kept it broken. The silent-catch sweep of
  // 2026-08-25 rebuilt it in one line, in bill-ref.ts, and nothing but a bigger
  // bundle would have said so.
  'scripts/guards/no-client-sentry-import.mjs',
  // THE SAME DEFECT ONE LAYER OUT: chrome that only an action can reveal, sitting
  // in the platform-wide client shell because the header is in the root layout.
  // The global search overlay and the city dialog were both there, on /offline
  // and /unsubscribe/[token] as much as on the homepage. Moving them behind
  // next/dynamic took 509,320 bytes off the platform across 133 routes with 0
  // routes worse, and took three public routes back under the Scope v5 10.3
  // budget. initial-bundle-budget would catch a straight reintroduction, but its
  // marks are rewritten by hand whenever a growth is justified, and after any
  // such rewrite a static import that crept back is the new normal. This names
  // that edit.
  'scripts/guards/interaction-only-chrome-is-split.mjs',
  // THE HALF OF THAT SPLIT NOTHING WAS WATCHING: the code moved and the DATA did
  // not. The header handed the whole picker city catalogue to the client
  // component as a prop, and a prop crossing the server/client boundary is
  // serialised into the RSC payload whether the component reading it ever mounts
  // or not. 6,988 bytes, twice, on every page of the platform, 7.29 percent of
  // the login document, for a dialog almost nobody opens. initial-bundle-budget
  // recorded the JavaScript win while the same feature's bytes sat in the HTML
  // where no gate was looking. THIS HALF WEIGHS NOTHING and says so; the proof is
  // the same file run with --built from npm's postbuild (close-out C8B.3).
  'scripts/guards/no-catalogue-in-every-document.mjs',
  // A CLASS LIST A COMPONENT REPEATS PER ITEM IS A COMPOSITE UTILITY, NOT A
  // STRING LITERAL. The homepage shipped one 464-character class value 104
  // times, once in the markup and again in the RSC payload, which is 34.9% of a
  // 1,007,295 B document spent on class attributes. Collapsing the home card
  // family took the document to 850,054 B. This half judges the CONTRACT (the
  // composites exist, the card files have not re-inlined them, and no new class
  // literal over 400 chars arrives outside the reviewed baseline); postbuild's
  // --built weighs the built documents. It CANNOT see the homepage, which is a
  // dynamic route, and says so: card-class-collapse-drive.mjs covers that
  // (close-out C8B.3).
  'scripts/guards/class-lists-are-not-repeated-per-card.mjs',
  // A ROUTE WHOSE RESPONSES ARE SHARED AT THE EDGE MAY NOT RENDER ONE VISITOR'S
  // NAME. /events carried `CDN-Cache-Control: public, s-maxage=60` with no
  // signed-in exclusion while rendering the ordinary `<SiteHeader />`, which
  // puts the signed-in visitor's initials and display name in the markup, and
  // that display name falls back to the local part of their email. Production
  // answered `X-Vercel-Cache: HIT, Age: 80` on that URL, so the cache was real.
  // Its two siblings had both halves of the protection; this one had neither.
  // Found by building this guard rather than by a visitor, on 18 September 2026.
  'scripts/guards/edge-cache-is-viewer-independent.mjs',
  // THE SAME RULE, A DIFFERENT SERVER-ONLY DEPENDENCY, AND IT WAS ALREADY LIVE.
  // src/lib/redis/client.ts imports @upstash/redis and a 16.0 KB Buffer
  // polyfill. One import from the ticket selector into sale-status.ts, which
  // took a single currency helper from application-fee.ts, put 17.5 KB gzip of
  // that on the event page and the checkout: the two surfaces that sell
  // tickets. It surfaced as a 372-byte budget overage, 48 times smaller than
  // its own cause, which is why a comment was never going to hold it.
  'scripts/guards/no-client-redis-import.mjs',
  // next/dynamic costs 1306 bytes gzip and a whole extra chunk in the SHARED
  // shell, which is the first load of all 141 routes, and the shell uses none
  // of the preloading, loading slot or SSR control it buys. One dynamic() call
  // added to defer six components out of the root layout gave back 1099 of the
  // 3938 bytes it saved, and surfaced as 116 identical faults on routes like
  // /press and /offline, none of which names the cause. A bare import() defers
  // the same tree for nothing. Route-level lazy wrappers are untouched.
  'scripts/guards/no-loadable-in-the-root-shell.mjs',
  // THE SAME RULE, THE CHUNK THE GUARD ABOVE CANNOT REACH. SiteHeader is not
  // in the root layout: 22 route files import it directly and the rest reach
  // it through the page templates, so the root-shell closure never touches it.
  // Two pieces of header chrome deferred their panels with dynamic() on
  // 17 September and the root-shell guard reported PASS on both, while each
  // file's own comment asserted it WAS in the root layout. The blind spot and
  // the false justification were the same belief, so neither corrected the
  // other. This one is rooted at the header and the footer, the two client
  // subtrees that are on every page by construction.
  'scripts/guards/no-loadable-in-platform-chrome.mjs',
  // A STEP THAT CLAIMS WORK MUST SAY HOW MUCH IT DID. A CI step named
  // "Warm ISR + the next/image optimiser" warmed no images at all, for weeks,
  // printing a tidy list of 200s the whole time; its replacement then reported
  // 40 variants across four pages, which was the CAP printed as a finding. The
  // list of scripts under this contract is DERIVED from the workflows on every
  // run, because a hand-written list would have to be remembered and being
  // remembered is the thing that failed.
  'scripts/guards/steps-declare-work.mjs',
  // THE HOMEPAGE MAY NOT TYPE OUT WHAT THE DATABASE ALREADY KNOWS. Nine
  // category tiles carried hand-typed names and five had drifted from
  // event_categories with nothing comparing them. The names are derived now, so
  // a curated slug that no longer matches a row renders NOTHING and the rail
  // silently shows eight tiles where it showed nine. This fails the build first.
  'scripts/guards/curated-categories-exist.mjs',
  // THE BANNED WORD, EVERYWHERE IT CAN LIVE. copy-tell-gate reads
  // customer-facing TEXT, so a string comparison in TypeScript and a slug in a
  // storage path both sat in its blind spot for months: captions.ts compared
  // against a slug that no longer existed and mis-registered every arts event,
  // and stock/categories/<retired>/ is still served to browsers. This one reads
  // identifiers, comparisons, slugs, URLs, storage keys, filenames and config,
  // and fails on an exemption whose file no longer contains the word.
  'scripts/guards/no-banned-word-anywhere.mjs',
  // Founder ruling 2026-09-03: proper nouns are EXEMPT from the banned word.
  // The ban stops EventLinqs describing ITSELF with that word; it was never
  // meant to rename other people's organisations. A find-and-replace had done
  // exactly that to 43 names. Both
  //   Multicultural Council of the Northern Territory
  //   National Multicultural Festival
  // were published under a mangled name on the /community pages, which are 441
  // of the 552 URLs in the production sitemap. The corruption made the word-ban gate GREENER while
  // making the tree untrue, which is why it needed a gate of its own rather
  // than a note. This comment names those bodies correctly on purpose: both
  // guards read the same registry, so the real names are the safe spelling.
  'scripts/guards/proper-nouns-intact.mjs',
  // Found 3 September 2026 by driving the pages. intersection-editorial.ts is
  // keyed on community taxonomy V1 while the site runs V2, so 211 of its 271
  // hand-written paragraphs reached no page. Nothing reported it, because the
  // templated fallback makes a page with missing bespoke copy look finished.
  // One retired slug had no redirect at all and returned a 404. This guard
  // makes an unreachable paragraph loud instead of silent.
  'scripts/guards/community-editorial-reachable.mjs',
  // Founder ruling 2026-08-13. `.env.local` in this repo points at the
  // PRODUCTION project, deliberately, because the app is run against production
  // from here. An audit that day found ten write-capable scripts with a
  // service-role credential and no check on which project they were about to
  // write to, four of which documented `node --env-file=.env.local <script>` in
  // their own header. The ten were fixed and given the preflight; this guard is
  // what stops the eleventh. Without it the fix is a written procedure, and a
  // written procedure is not a control.
  'scripts/guards/no-unguarded-production-write.mjs',

  // Founder instruction 2026-08-25, after two hours were lost to a
  // 28P01 password authentication failure whose cause was a hand
  // percent-encoded password, and whose three decoys were the REDACTED masking
  // that pg applies to a string it could not parse, a username that always reads
  // postgres on the pooler, and nine divergent private copies of the connection
  // parser. The sibling guard above asks whether a script checks WHICH database
  // it is about to write to; this one asks whether it built the connection
  // itself. Fixing the shared helper fixed nothing for the eight scripts that
  // were not using it, so the rule is now structural.
  //
  // NO APOSTROPHES IN THIS BLOCK. tests/unit/guards/guard-registry.test.ts reads
  // the entries below by extracting single-quoted strings from this file, so an
  // apostrophe in a comment opens a string literal and the registry parse breaks
  // for every guard after it. Sixteen guards read as unregistered when this
  // comment first said "pg" followed by an apostrophe and the word s.
  'scripts/guards/one-db-connection-source.mjs',

  // Founder instruction 2026-08-25, the second half of the same day. After the
  // demo purge, /events printed a correct header count of 2 beside a
  // "Popular this week" rail listing EIGHT deleted events, and a visitor
  // clicking any of them got a 404 on a live platform. Two causes: the
  // publication predicate was spelled out by hand in seventeen discovery
  // surfaces rather than shared, and a data cache held ROWS, which outlive the
  // rows they copy. Of every cache tag declared in the codebase, exactly one was
  // ever invalidated anywhere. This guard holds both halves.
  'scripts/guards/one-visibility-source.mjs',

  // Founder ruling 2026-08-15, a PRODUCTION SAFETY ordering rule expressed as a
  // gate. Migration 20260808000010 revokes stripe_account_id and
  // stripe_charges_enabled from anon. The event page used to read exactly those
  // two through an anon embed and feed them to the sale gate, so applying that
  // migration to a database whose deployed code still does that takes EVERY PAID
  // EVENT off sale instantly, with no error and no alert: it renders the real,
  // designed "organiser is still finishing their payment setup" state. This
  // guard fails the build if the migration is present without the fix.
  'scripts/guards/migration-needs-sale-gate-fix.mjs',

  // Founder ruling 2026-08-15, ONE FEE. Two gates, because the failure had two
  // halves and only one of them is about copy.
  //
  // one-fee-copy walks the customer-facing surfaces and fails on an ASSERTION of
  // a second fee. It is scoped to assertions rather than to the word
  // "processing" on purpose: orders.processing_fee_cents is a real column
  // holding real history, processing_fee_pass_through is live and decides who
  // carries the one fee, and the correct copy for an assistant includes the
  // sentence that there is no payment processing fee. Reviewed exemptions carry
  // ONE-FEE-ALLOW with a written reason and print on every run.
  'scripts/guards/one-fee-copy.mjs',
  // Owner ruling 2026-09-07, the positioning lock: EventLinqs is not a
  // ticketing platform, it is the platform where events get made, and the
  // phrases "ticketing platform" and "ticket seller" are never used for us.
  // The sibling of one-fee-copy and it exists for the same reason: when the
  // ruling arrived, the retired strapline was the platform's own description in
  // fifteen source files and four founder copy packs, and not one of them
  // failed a gate, because prose is not executed. Describing a COMPETITOR that
  // way stays legal and is allowed by a marker in the same sentence.
  'scripts/guards/positioning-lock.mjs',
  // pricing-derive recomputes the worked examples and the margin table in
  // docs/PRICING.md from the PRICING-LOCK block and fails if the committed text
  // disagrees. It lives outside scripts/guards/ because it is also the
  // GENERATOR: run it with --write to regenerate, and with no arguments, which
  // is how the runner invokes it, it checks.
  'scripts/pricing-derive.mjs',
  // Close-out FO1 (13 September 2026). The Founding Organiser offer is
  // published on /organisers and repeated word for word in every outreach
  // message: fifty organisers, six fee-free months, three more per referral,
  // terms applied before the first on-sale. Every one of those numbers was a
  // string in a copy file that no gate compared with the constants the charge
  // actually uses, and the cap was ALSO a literal in two SQL functions that
  // TypeScript cannot see. This holds the copy, the code and the database to one
  // set of numbers, and holds /organisers and /pricing to rendering the fee as a
  // read rather than a sentence. Drilled red by changing one number in the copy.
  'scripts/guards/founding-offer-matches-configuration.mjs',
  // Close-out FO1 (18 September 2026). Every driven proof that a ticket can be
  // bought goes through one helper, and that helper asked Playwright for a
  // button whose name merely STARTED with "add". On 14 September an "Add to
  // calendar" button shipped above the ticket panel, so from that day every
  // money drive opened a calendar menu, left the quantity at 0, and reported
  // that the ticket panel had never rendered. It had. A loose selector does not
  // fail; it indicts the product for the harness's mistake, in detail, and is
  // believed. This holds the drive's selector to the label the product actually
  // puts on the control the drive presses, requires it to be anchored at both
  // ends, and fails if any other button in src/ answers to it. Drilled red both
  // ways: the old prefix selector back in the helper (it names "Add to
  // calendar" and eleven more), and the product renaming its own tier label.
  'scripts/guards/drive-quantity-control-selector.mjs',
  // Close-out OL1 (13 September 2026). /organisers is now the page every
  // outreach message sends a stranger to, and it gained a block that shows the
  // newest published event as a real card. The cheapest way to make that block
  // look good on a thin day is to paste an event into it, and nothing would
  // fail: the page would read better and would be lying to the people it is
  // recruiting. This holds the block to a read, names the surface so a
  // narrowing of the copy gate's walk cannot quietly drop it, and requires
  // every signup button to carry the source AN1 counts. Drilled red by pasting
  // an event slug into the template.
  'scripts/guards/organiser-page-is-a-read.mjs',
  // Close-out AN1 (13 September 2026). The platform now loads four third-party
  // measurement scripts, three of which can recognise a person on other sites,
  // and the rule is that none is requested until somebody says yes. The failure
  // is silent in the worst direction: the page still works, the data still
  // flows, and the tracker loads for exactly the person who took the trouble to
  // refuse. This holds every provider host to the one gate, requires that gate
  // to ask BOTH questions (the category and the identifier), and requires the
  // default to be refusal on every path the decoder can take. The network half,
  // loading three pages with no consent and watching every request, is the
  // driven proof; a guard that needs a running server cannot run on the build
  // host and would be dropped from the chain. Drilled red.
  'scripts/guards/no-analytics-before-consent.mjs',
  // Close-out GA1 (13 September 2026). The platform now keeps an audience of
  // proven buyers, and consent is the title deed to it: an audience without
  // provable consent cannot be used and cannot be sold. ACMA's enforcement
  // record covers both halves, and the dates are stated correctly here because
  // an earlier version of this comment had two of them wrong: TAB was penalised
  // 4,003,270 dollars in June 2025 and 2.7 million dollars again in July 2026,
  // mostly for messages with no unsubscribe; the Commonwealth Bank was
  // penalised 7.5 million dollars announced in October 2024, for 34.8 million
  // messages to people who had not consented or had withdrawn. So the entry and
  // the exit are held equally hard. Three GA1 clauses: the CHECK that refuses
  // an unconsented row, the CHECK that refuses empty wording, and no session on
  // any unsubscribe surface. Two more, because a trigger cannot call
  // TypeScript and the two languages must not drift: the community token map
  // and the price bands. Drilled red on the constraint and on the drift.
  'scripts/guards/audience-consent-is-the-title-deed.mjs',
  // Close-out GA1 v3. The consent LEDGER, which is a different claim from the
  // audience above it: a consent record is evidence of what one person was
  // shown and agreed to, so it is append only, it carries the tenant and the
  // scope from its first line, and the resolver that reads it is the only door
  // a message can leave by. Five clauses, each drilled red: the database
  // refuses UPDATE and DELETE on both ledgers, an event cannot be empty
  // evidence, an audience row cannot exist for somebody the resolver refuses,
  // no module can reach a mail transport without being classified in the send
  // path registry (and a marketing one without calling the resolver), and no
  // unsubscribe or privacy rights surface reads a session.
  'scripts/guards/consent-ledger-is-evidence.mjs',
  // Close-out GA2. The matcher produces the list a campaign will one day send
  // against, so two things about a stored run must hold: nobody in it is
  // somebody the consent resolver refuses, and no run holds more score rows
  // than the cap recorded on it. The trigger stops a bad row arriving; this
  // asks whether one is there, which a dropped or disabled trigger makes a
  // different question. Drilled red on both clauses with the database's own
  // protection removed, which is how a row like that would ever exist.
  'scripts/guards/matcher-consented-and-capped.mjs',
  // Close-out GA3. The attribution table is the basis of an invoice, so every
  // order carries exactly one stored decision, never zero and never two, an
  // order no campaign produced says so with a reason rather than being absent,
  // and nothing reports billable while a reversal exists for it. Drilled red on
  // both clauses: an attribution row deleted for one lane-B order, and a
  // reversal inserted against a billable one with the database's own recompute
  // removed, which is how a row like that would ever exist.
  'scripts/guards/attribution-one-record-per-order-never-billable-when-reversed.mjs',
  // Close-out GA4. The Spam Act is enforced hard here and the two failure modes
  // an autonomous sender produces, messaging people who did not consent and
  // volume nobody authorised, are each capable of ending this business. So the
  // allowlist and the cap are database constraints rather than application
  // checks, and this asserts both that the constraints are still there and that
  // no row has slipped past them. Drilled red three times with every application
  // level check removed: a send to somebody absent from the allowlist, an SMS to
  // somebody whose consent covers email, and the insert that exceeds the cap.
  'scripts/guards/campaigner-allowlist-and-cap-in-database.mjs',
  // Close-out GA5. A client will not keep paying a commission they cannot check,
  // and the moment a number appears on the proof page that nobody can trace, the
  // page stops being proof and becomes a claim. This reads the rendering path
  // out of the repository, so it needs no database and runs everywhere. Drilled
  // red by replacing one figure with a typed literal, which it names by figure
  // and by file, and by removing the snapshot constraint from the migration.
  'scripts/guards/proof-page-every-number-sourced.mjs',
  // Close-out PL1. The two product loops, and the failure that is quiet in the
  // direction that costs most: the loop still works, people still arrive, and
  // the parameter that says where they came from is gone, so the item is judged
  // on a number nobody collected. It RENDERS the ticket email in a child
  // process rather than reading its source, because a line inside a branch that
  // never runs is in the source and not in the email.
  'scripts/guards/product-loops-carry-their-parameters.mjs',
  // Close-out FT1. The free forecast tool is the strongest reason a stranger
  // has to trust this platform, and there are two ways it stops being that: a
  // fee, price or taxonomy value gets typed into it and it quietly stops
  // agreeing with what the platform charges, or the method sentence goes
  // missing and arithmetic starts reading as a prediction.
  'scripts/guards/forecast-reads-every-number.mjs',
  // Close-out API1. The public read API's one promise is that a key for
  // organiser A cannot see organiser B, and the whole of it rests on a single
  // predicate being present on every query the surface makes. A predicate that
  // is present by convention fails silently: the route works, the tests pass,
  // and it returns everybody's rows. This proves the predicate, proves that no
  // route file can query around it, proves the views it names carry the column
  // and cannot be written through, and proves an out of scope id answers 404
  // rather than the 403 that would confirm the row exists.
  'scripts/guards/api-v1-organiser-scope.mjs',
  // A guard nobody has ever seen fail is not a guard, and on 18 September 2026
  // 63 of the 148 entry points in this very list had never been made to fail by
  // anything. Eleven of those were drilled properly that day and the drilling
  // found three real defects in guards that had been passing confidently for a
  // week. This fails the build when a guard is registered here with no drill in
  // scripts/verify/guard-failure-drills.mjs, against a dated baseline of the 63
  // that predate it, so the debt is visible and cannot grow.
  'scripts/guards/every-guard-has-been-seen-to-fail.mjs',
  // Founder ruling 2026-08-15: nothing on this platform stays partially built.
  // Held unregistered while it reported 57 hits, because a gate that cannot go
  // green is a gate somebody switches off. All 57 are now classified and
  // cleared: 41 were feature flags whose decision moved to one dated registry
  // beside the flags rather than 41 copies beside the call sites, 5 were this
  // guard reading OTHER detectors regex literals and finding its own subject
  // matter, 2 TODOs waited on a route that was never built and now point at the
  // real one, and the rest were reworded or dated. It blocks from here.
  'scripts/guards/no-partial-builds.mjs',
  // Founder ruling 2026-08-15, external ticketing non-negotiable 3. Pins the
  // POSITION of four refusals, not just their presence: each one is still
  // present and still passes every unit test when moved, and wrong.
  'scripts/guards/no-external-checkout.mjs',
  // Founder ruling 2026-08-16, PUBLISHED MEANS VISIBLE. The exclusion audit
  // found eleven ways a legitimate row could vanish; these two guards close the
  // class rather than the instance. The first refuses a display-time exclusion,
  // the second refuses a publish with no cover. Both print how much they
  // scanned, so a gate that has quietly stopped working says so in its own
  // output instead of printing the PASS it always printed.
  'scripts/guards/no-display-time-exclusion.mjs',
  'scripts/guards/publish-requires-cover.mjs',
  // Founder ruling 2026-08-18, after every paid event on production refused to
  // sell behind a message that named a field this codebase does not have, with
  // an enabled gold checkout button sitting directly underneath it. Pins three
  // things: a sale-gate read may not discard its error, a checkout control must
  // be disarmed by the refusal rather than accompanied by it, and sellability is
  // decided in one place. Prints its scan counts and its reviewed baseline on
  // every run, and fails if a baseline entry stops matching, so it cannot pass
  // vacuously or rot into an unexamined allowlist.
  'scripts/guards/one-sellability-source.mjs',
  // Founder ruling 2026-08-18, after an organiser typed 12:00 pm and the page
  // showed 2:00 am. A zoneless datetime-local value read through new Date() takes
  // the offset of whatever runtime evaluates it, so every edit moved the event
  // one offset earlier, and a create was only accidentally right when the browser
  // zone happened to match the event zone. This guard binds to the actual inputs
  // rather than guessing at field names, which is how it found two further
  // instances of the same defect in surfaces nobody had reported.
  'scripts/guards/zoned-event-times.mjs',
  // Founder ruling 2026-08-18, after an organiser saved an edit and the public
  // page did not change. Five of the seven event mutations invalidated nothing
  // at all, and a sixth invalidated only the organiser own pricing screen, so a
  // price change was visible to the person who made it and to no buyer. A
  // dashboard-only revalidation therefore does NOT satisfy this guard.
  'scripts/guards/mutation-revalidates.mjs',
  // Founder ruling 2026-08-18: every gate that reads a set of fields must be
  // unable to run on an incomplete set. Twice in one week a query narrowed while
  // the gate went on reading, the missing field arrived undefined, and undefined
  // refuses at a boolean test exactly as false does. It reads each gate required
  // list out of its own signature rather than duplicating it, follows the entry
  // points a caller actually uses rather than only direct calls, and refuses a
  // bare cast at the boundary.
  'scripts/guards/gate-fields-complete.mjs',
  // Founder task 2026-08-18: "a refund that succeeds at Stripe but fails to
  // restore inventory must be impossible to ship." It was possible, and it
  // shipped. A refund created outside the app (the Stripe dashboard shape) had no
  // refunds row, so reconcile_refund had nothing to attach to and the handler fell
  // through to a door-safety void that returned no seats and left the order on
  // `confirmed`. Reproduced with a real test-mode refund: money back, ticket dead,
  // sold_count still 1. Every party saw a correct outcome, which is why it could
  // have run for months. This pins the structure that makes it impossible: one
  // inventory path, an adopted orphan, a refusal that stops a double-restore, and
  // exactly one sanctioned void.
  'scripts/guards/refund-restores-inventory.mjs',
  'scripts/guards/one-refund-path.mjs',
  // Close-out R1, 14 September 2026. The guard above pins what happens ONCE a
  // refund is heard; this one pins whether it is heard at all. The route reached
  // its successful-refund handler from one event, `charge.refunded`, and a refund
  // issued from the Stripe Dashboard arrived as `refund.created` and was dropped:
  // the ticket kept admitting, the place stayed unsellable, the queue was never
  // offered it, and nothing reported a fault. Stripe's own page names
  // `refund.created` as the minimum an integration must listen to. This pins the
  // set, that each event in it reaches reconcile_refund, that no deprecated event
  // does, that the reconcile failure is actually retryable, and that the endpoint
  // subscription probe cannot drift from the code.
  'scripts/guards/refund-success-door.mjs',
  // Close-out MONEY FIX part A. A ticket charge exists to pay an organiser, so
  // it must name a destination, refuse an organiser who cannot be paid, and
  // never be refused by the FEE AMOUNT. The last clause is the A1.7 defect: the
  // precondition refused any zero platform fee as calculator drift, and a
  // founding organiser inside their fee-free window resolves to exactly zero, so
  // every paid ticket for the organisers the growth plan exists to recruit was
  // refused at checkout with a pricing error that refreshing could never clear.
  'scripts/guards/funds-reach-the-organiser.mjs',
  // MONEY FIX B3. The companion to funds-reach-the-organiser: that one makes the
  // MONEY reach the organiser, this one makes the NEWS reach them. MKLStudios
  // sold two tickets on 10 September 2026 and the only human told was the
  // platform owner, because `order_paid` is a PLATFORM notification and no
  // organiser counterpart existed anywhere in the tree. A message that was never
  // written cannot be caught by testing the messages that were, so the check has
  // to be a declaration every send is judged against.
  'scripts/guards/every-message-has-a-declared-recipient.mjs',
  'scripts/guards/no-ambiguous-embed.mjs',
  // Measured 2026-08-19 against the real TEST database: 50 simultaneous buyers
  // against ONE seat, live create_reservation -> 1 won. Same body with FOR UPDATE
  // removed -> 16 won, 16 claimed against a capacity of 1. Fifteen people turned
  // away at the door. The row lock IS the protection, so a refactor that drops it
  // ships a platform that passes every existing test and oversells under load.
  // This pins the lock, the availability arithmetic, the already-confirmed latch,
  // and the rule that the counters have exactly one owner.
  'scripts/guards/inventory-lock-integrity.mjs',
  'scripts/guards/no-unowned-organisation-read.mjs',
  // A founder-locked DESIGN law with no gate until 2026-09-02, which is how it
  // survived being written down twice. "Surfaces are solid and opaque. No
  // glassmorphism anywhere: no backdrop-filter / backdrop-blur chrome" is in the
  // Design system, and glassmorphism is in Motion's forbidden list beside GSAP
  // and bento grids. The site header had already been de-frosted for legibility
  // and its comment says so. `src/components/ui/glass-card.tsx` still carried
  // backdrop-blur-2xl on a variant two live surfaces render, plus backdrop-blur-md
  // on a variant nothing used, and a launch readiness audit found it by reading.
  // Translucency without a filter stays legal, so this only fails on an APPLIED
  // filter, never on a /95 badge, a comment, or an inert transition property list.
  // UX1.1: the first real outside organiser published on production and their
  // bio rendered its asterisks. One rule now, two doors, and this fails the
  // build on a third. Drilled red against the exact line that shipped.
  // UX1.2: the composition rule for a venue address lived nowhere, so it was
  // reinvented per call site and two of them each added the name. Drilled red.
  // UX2.1 is LEGAL. The entity taking ticket money must match the ABN
  // displayed, and the number changes when the Pty Ltd is registered. Drilled
  // red against a literal split across two lines, which a grep reports as clean.
  // UX2.4: the site is served from eventlinqs.com.au and invited people to
  // write to eventlinqs.com, in about forty hand-written literals. Drilled red.
  'scripts/guards/one-contact-domain.mjs',
  'scripts/guards/one-platform-entity.mjs',
  'scripts/guards/one-venue-address-format.mjs',
  'scripts/guards/organiser-prose-one-rule.mjs',
  // UX5: /admin/enrol-2fa told every new administrator to "scan the QR code"
  // and drew nothing to scan, so the real instruction was to type a 32
  // character base32 secret off a laptop into a phone, on the one screen where
  // a typo locks you out of the admin console. A route sweep saw a 200 and no
  // unit test saw a wrong function. Drilled red on all three clauses, and
  // drilled GREEN on descriptive prose about scanning, which is the false
  // positive that would otherwise get this guard switched off.
  'scripts/guards/scannable-instruction-has-a-qr.mjs',
  // UX1: the "Selling Fast" badge painted coral-600 on coral-100 at 3.42:1, on
  // every event 50% sold or more, and the a11y test written for exactly this
  // shape could not see it because it banned coral across a hand-listed TWO
  // files. Probing the tree found 28 pairs under AA in two repeated
  // combinations. This computes the ratio from globals.css instead of holding a
  // list. Drilled red on a real pair and green again.
  'scripts/guards/tinted-text-meets-contrast.mjs',
  'scripts/guards/no-glassmorphism.mjs',
  // Scope v5 3.11, 3 September 2026. The livestream link was captured by the
  // organiser form, stored on the anon-readable events row, and shown to nobody.
  // Migration 20260903000002 moved it into a vault table with no anon grant.
  // This holds the two properties that make the reveal rule true: the inert
  // column is read by nothing, and no public surface can import the modules
  // that hand the link back. Proven red against `{event.virtual_url}` on the
  // public event page and green after its removal (C:\dev\EVIDENCE\A2).
  'scripts/guards/stream-link-never-public.mjs',
  // 4 September 2026. The A2 code SELECTS ticket_tiers.access_mode by name on
  // the bearer ticket page and the order confirmation, and production did not
  // have the column (the migration is the founder's push). None of lint,
  // typecheck, build or the suite reads a database, so a merge before the push
  // would have passed every gate and 500'd every ticket page on the live site.
  // This probes the build's own database, read only, and refuses a build whose
  // schema is behind its code. Proven red against production and green against
  // TEST on the same day (C:\dev\EVIDENCE\A2\guard-schema-ahead-proof.txt).
  'scripts/guards/schema-ahead-of-code.mjs',
  // 4 September 2026 (A3, venue geocoding). GOOGLE_MAPS_API_KEY was found to
  // be the public browser key in production, preview and local, which Google
  // refuses for the Geocoding API. That shape is a decision and SKIPs loudly;
  // a DISTINCT server key is probed once per build and a refusal FAILS, because
  // that is the shape every gate would otherwise miss. Proven FAIL with a bogus
  // distinct key and SKIP with the live values (C:\dev\EVIDENCE\A3-guard-geocoding-key-posture-proof.txt).
  'scripts/guards/geocoding-key-posture.mjs',
  // 4 September 2026 (A4, price history, Scope v5 3.3). ticket_price_history is
  // what a buyer reads on the event page about how a price has moved, and it is
  // written by two DEFERRED constraint triggers that judge the effective price
  // at commit. Two edits would corrupt it while passing every other gate: an
  // application insert into the history, and a return to writing
  // dynamic_pricing_rules as three auto-committed statements instead of through
  // save_dynamic_pricing. This refuses both, and checks the migration still
  // declares both triggers deferred. Proven red by restoring the old delete
  // call in the action and green after (C:\dev\EVIDENCE\A4-guard-price-history-integrity-proof.txt).
  'scripts/guards/price-history-integrity.mjs',
  // 5 September 2026 (B1, offline door validation, Scope v5 3.12 and 3.13). The
  // phone at the gate downloads every ticket and judges scans against it with no
  // signal, then syncs its queue. Four edits would break that while passing every
  // other gate: returning the secret in the door list, dropping the
  // `status = 'valid'` clause from the sync's compare-and-set (two doors both
  // record admitted), an application insert into ticket_scans, and a service
  // worker that answers more than /scan/ navigations and /_next/static/ assets.
  // Proven red by removing the status clause from the migration and green after
  // (C:\dev\EVIDENCE\B1\guard-offline-door-integrity-proof.txt).
  'scripts/guards/offline-door-integrity.mjs',
  // 5 September 2026 (B2, multi-scanner realtime, Scope v5 3.13). Two doors see
  // each other's admissions because ticket_scans is in the supabase_realtime
  // publication, and no other gate can see a publication: a project where the
  // migration was never applied subscribes, says SUBSCRIBED, and never receives
  // a row. This asks door_realtime_enabled() on the build's own database, read
  // only, and refuses a build whose doors would be silently deaf. SKIPs by name
  // on CI's placeholder URL. Proven red on TEST by dropping the table from the
  // publication and green by adding it back (C:\dev\EVIDENCE\B2\guard-door-live-published-proof.txt).
  'scripts/guards/door-live-published.mjs',
  // 6 September 2026 (close-out C2, CI hygiene). Six failed-run emails for one
  // pull request, because CI was the first place four of its checks ever ran.
  // The rule is now: nothing is pushed until the same checks pass locally, as
  // one command, and CI runs once, when the draft is marked ready. Two guards
  // hold the two halves that die quietly. The first reads every workflow and
  // requires each job to skip a draft and each trigger to wake on
  // ready_for_review. The second requires the pre-push hook to exist, to run
  // the WHOLE gate with no step selection, to exit with its verdict, to be
  // executable in the index, and (off CI) for core.hooksPath to point at it,
  // because that setting is local config no clone inherits. Both proven red by
  // the drills in scripts/verify/guard-failure-drills.mjs and green after.
  'scripts/guards/workflows-skip-drafts.mjs',
  'scripts/guards/pre-push-gate-wired.mjs',
  // 10 September 2026, found by the gate failing on itself. Three gate steps
  // served the production build and each spawned `next start` in its own block.
  // Only the Lighthouse one handed the server a rate-limit backend, and it is
  // the one that never buys anything; the UX6 checkout drive, which does, had
  // none, so `checkout-reserve` (failClosed) refused every reservation and every
  // checkout submit and the drive reported six product defects that were not
  // product defects. One door now, startGateServer(), which also PROVES the stub
  // answers, because a URL pointing at nothing fails closed identically to no
  // URL. Five clauses, all drilled red and green
  // (C:\dev\EVIDENCE\D1\guard-gate-server-drill.txt).
  'scripts/guards/gate-servers-carry-a-limiter.mjs',
  // 11 September 2026 (close-out UX3.2). The owner's backup alert channel could
  // not be armed at all on a device that had never armed before, and the screen
  // said nothing. `register()` resolves before the worker is running, so
  // `pushManager.subscribe()` threw "Subscription failed - no active Service
  // Worker"; the catch then set 'idle', which is the state an UNPRESSED control
  // shows, and sent the error to reportClientError, which on a production build
  // queues into memory nobody reads. A second press always worked, which is why
  // nobody had noticed: anybody debugging it presses twice. Five clauses, plus a
  // premise check on public/push-sw.js, all drilled red and green including two
  // negatives that the first draft genuinely failed
  // (C:\dev\EVIDENCE\UX3\ux3-push-guard-drill.txt).
  'scripts/guards/push-arming-cannot-fail-silently.mjs',
  // S1: the daily heartbeat compared an organiser's EventLinqs name with the
  // business name on their Stripe account and called a difference a fault.
  // Stripe holds a public trading name and a legal entity name as two separate
  // fields by design, so for a sole trader they differ CORRECTLY, and the check
  // fired on healthy accounts for ever. The founder deleted it rather than
  // softened it. Answering S1's first requirement also found the claim that
  // justified it to organisers on /dashboard/payouts - "Stripe uses its own name
  // on your buyers' bank statements" - to be false on this platform, which
  // charges with separate charges and transfers and never sets on_behalf_of, so
  // Stripe uses the PLATFORM's descriptor. That absent parameter holds up the
  // whole argument and nothing anywhere said so. Three clauses, drilled red and
  // green, plus a NEGATIVE drill proving the gateway pass-through exemption is
  // checked rather than trusted.
  'scripts/guards/statement-descriptor-premise-holds.mjs',
  // S1: "anything sits in pending_verification for more than 3 days" needs an
  // age, and Stripe publishes no per-requirement timestamp, so the monitor keeps
  // its own in public.connect_requirement_watch. The whole value of that table
  // is first_seen_at not moving. Three clauses, drilled red and green, plus two
  // NEGATIVE drills for the two false positives the first draft produced: a
  // header comment naming the table, and the property READ the age is computed
  // from.
  'scripts/guards/one-door-to-the-requirement-watch.mjs',
  // 6 September 2026 (close-out C3, the eighteen social cards). The rasteriser
  // reads the resvg WebAssembly binary and the brand fonts from disk at run
  // time, and next.config.ts pins them per route in outputFileTracingIncludes
  // with a comment saying the lambda ships without them otherwise. Measured,
  // that is not so today: every reaching route's .nft.json already carries
  // both, pin or no pin, and the composer drew a cover in a preview lambda
  // with no pin for its page. The pins are kept as the one guarantee held in
  // this repository's own hands, and this guard keeps them COMPLETE: it derives
  // every route that reaches the rasteriser from the runtime import graph
  // (eight, where the config had three: the two card routes, the three
  // dashboard event pages that host the cover composer's server action, the
  // admin health page and the two health crons) and judges each pin with
  // Next's own normaliser and picomatch call. The same file runs again as
  // npm's postbuild with --built and reads the trace Next actually wrote for
  // each route, which is the proof the pins are a promise of. Proven red by
  // the drill that removes the binary from a card route's pin, and by the
  // judge on a synthetic trace without the binary; green on the tree and on
  // the real build (C:\dev\EVIDENCE\C3\guard-card-raster-traced-*.txt).
  'scripts/guards/card-raster-traced.mjs',
  // og-single-rasteriser (close-out C3, 6 September 2026). ONE rasteriser draws
  // every image this platform renders, and it is ours. next/og hands satori's
  // SVG to sharp, its getSharp() is unconditional, and inside the Next server
  // runtime that sharp cannot decode SVG. It cost eighteen Launch Kit artefacts
  // on 29 August; the cards were moved onto satori plus resvg-wasm and the
  // METADATA IMAGES WERE NOT, because nothing had driven one. Driven on 6
  // September the per-event share card dropped the connection outright (code
  // 000, "failed to pipe response"), seven days after the fix that was supposed
  // to have ended it, because that fix was applied to the routes somebody was
  // looking at rather than to the rule. This guard is the rule: no next/og, no
  // ImageResponse, and no direct satori or resvg import anywhere under src
  // except card-raster.ts itself. It bans the four STATIC metadata images too,
  // which are prerendered by the build and were green through both incidents,
  // because an invariant with an exception list decays into the exception list.
  // Proven red against the two pre-fix routes with their line numbers, and by
  // the drill below; green on the repaired tree
  // (C:\dev\EVIDENCE\C3\guard-og-single-rasteriser-{RED,GREEN}.txt).
  'scripts/guards/og-single-rasteriser.mjs',
  // event-lifecycle-total and event-lifecycle-installed (close-out C13,
  // 6 September 2026). The founder found on production that a cancelled event
  // could be edited, viewed or duplicated for ever and nothing else, because
  // `cancelled: []` in the lifecycle table was a dead end that compiles, and
  // that delete existed for drafts only, decided by the interface. The static
  // guard reads the lifecycle module the application runs (through the alias
  // loader) and fails on any dead end, on archived leaving by anything but
  // restore, on the public rule drifting off published, on either organiser
  // surface dropping the controls, and on the door SQL reading event status.
  // The database guard asks event_lifecycle_guards() on the build's own
  // project and fails unless the money-records delete trigger, the tombstone
  // trigger, the archived enum value, the reservation status gate and the
  // gated anon policies are all in place, because none of that is visible to
  // anything else in the gate set. Both drilled red and green
  // (C:\dev\EVIDENCE\C13\guard-event-lifecycle-*.txt).
  'scripts/guards/event-lifecycle-total.mjs',
  'scripts/guards/event-lifecycle-installed.mjs',
  // Close-out C14.12 (6 September 2026): one spacing scale, and a guard that
  // fails the build on any hardcoded spacing value. An arbitrary spacing
  // utility or an inline padding/margin/gap whose length is not a multiple of
  // 4px and not a --space token is a step off the grid the design system
  // declares, and nothing else in the gate set could see one. Drilled red and
  // green in scripts/verify/guard-failure-drills.mjs.
  'scripts/guards/no-hardcoded-spacing.mjs',
  // Close-out C16.2.4 (7 September 2026): branch protection on main must require
  // the production parity check, hold admins to it, require a pull request and
  // carry no bypass. Read back from GitHub on every build; SKIPS loudly with no
  // credentials, judges in the CI job that carries GITHUB_TOKEN.
  'scripts/guards/branch-protection-required.mjs',
  // Close-out PR HYGIENE, PR5 (9 September 2026). Twenty two open pull requests
  // on 8 September, most of them months old, and the PR1 audit found eighteen
  // already on main or superseded. The rule is one open pull request at a time.
  // The guard counts ACTIVE = open minus parked, not the raw total, because the
  // same audit left three open BY DECISION carrying files main does not have,
  // and a guard that fails on day one for three pull requests the owner agreed
  // to is a guard somebody switches off. Parking is therefore a reviewed record
  // (scripts/guards/lib/parked-pull-requests.json) with a why and an
  // unblockedBy per entry, printed every run and checked for rot: an entry
  // naming a pull request that is not open, one whose branch has moved, or one
  // with no reason, are each a fault. Reads with the gh login or GITHUB_TOKEN
  // and SKIPS in capitals without either, so no build host blocks for want of a
  // credential. Drilled red in scripts/verify/guard-failure-drills.mjs and
  // green against the real live list.
  'scripts/guards/one-pull-request-at-a-time.mjs',
  // Close-out C8 (6 September 2026): a document preloads its LCP candidate and
  // nothing else. Nine image preloads on the homepage were competing with the
  // render-blocking stylesheet on the mobile profile and first paint waited four
  // seconds for it. Every priority grant is a named LCP candidate; a grant that
  // reaches past the first item fails. Drilled red and green.
  'scripts/guards/one-priority-image.mjs',
  // Close-out C8B.3 (18 September 2026): on a route whose LCP element is an image
  // the DATABASE chooses, that image is rendered by the page component itself and
  // ahead of every streaming boundary, so its preload leaves in the first chunk.
  // Written after the opposite was tried and measured: flushing the shell first
  // won 324 ms of time to first byte and lost 507 ms of hero discovery, for 597 ms
  // more LCP and six points of performance score at matched machine speed. The
  // boundaries BELOW the hero are correct and are not counted. Drilled red and
  // green, including the exact shape that was reverted.
  'scripts/guards/lcp-preload-in-the-first-flush.mjs',
  // Close-out C8B.5 (15 September 2026), Scope v5 10.3: the platform's contract
  // with a weak network. The checkout survives a submit that never reaches the
  // server (it used to throw the buyer to the error boundary and lose every
  // value they typed), the root service worker keeps only content-hashed
  // assets so no cache can ever serve a stale price, it registers after the
  // paint, and /offline is a real route classified never. Four clauses, each
  // drilled red and green.
  // Close-out C8B.3 (18 September 2026): a `sizes` hint is a promise about layout
  // that the browser believes at parse time, and nothing else in the toolchain can
  // notice when it stops being true. Driven at nine viewports, three hints were
  // serving thirteen layouts: the homepage fetched a 1080px image for a 278px slot
  // at 1440 and a 1920px one at 1920, the city tiles fetched 640px for a slot
  // needing 644 and were BLURRY, and a 56px dashboard thumbnail fetched 640px.
  // Five clauses, each drilled red and green.
  'scripts/guards/image-hints-match-the-cell.mjs',
  // Close-out C8B.3 (19 September 2026): the two width lists in next.config.ts are
  // a CLAIM about the slots this platform renders, and the claim had already gone
  // stale. Their own comment named "16, 32, 192, 256, 288, 320 and 512" as the
  // fixed sizes in use; the sizes rework of 18 September moved the smallest slot to
  // 24, and 16 went on being emitted 142 times across the fifteen pinned routes for
  // a slot that no longer existed. Next 16 removed 16 from its own default for the
  // same reason. Three clauses, each drilled red and green.
  'scripts/guards/candidate-ladder-has-no-dead-rung.mjs',
  // Lane B (19 September 2026): the marketing bands on /organisers and /about were
  // under-fetched at every desktop width and every gate was green, because the one
  // gate that could see a band did not have those routes in its list. Three clauses:
  // every route rendering a band is measured by the fidelity drive, every band
  // variant is on its own hint whose fixed term matches its declared slot, and a
  // band the licensed raster cannot supply is named with a date and a reason rather
  // than left silent. Drilled red and green.
  'scripts/guards/marketing-bands-are-supplyable.mjs',
  'scripts/guards/weak-network-contract.mjs',
  // Close-out C17 (7 September 2026): the homepage hero never renders without
  // imagery. Production showed a flat navy panel the day every event had ended;
  // the empty branch now wears a curated, licensed raster and the media component
  // owns the failure path. Drilled red and green.
  'scripts/guards/homepage-hero-never-empty.mjs',
  // Close-out C9 (7 September 2026): an organiser's event cannot be saved with
  // null coordinates on a production-like environment when the server key is
  // absent or refused; the save rule is driven and both actions must call it.
  'scripts/guards/geocoding-never-silent-null.mjs',
  // Close-out C18 FINAL (7 September 2026): the community layer and the categories
  // are approved and recorded; nothing may be lost from the source or the database,
  // and every addition is recorded in docs/scope/community-layer-approved.json.
  'scripts/guards/community-layer-protected.mjs',
  // Close-out C18 FINAL, the same day: a guard that reads under docs/ must survive
  // .vercelignore, or it passes locally and kills every Vercel build (third time).
  'scripts/guards/vercelignore-covers-guard-reads.mjs',
  // The fourth occurrence of that same defect, 8 September 2026: the guard above
  // accepts a WRITTEN RATIONALE for a script declared tolerant of an absent docs/,
  // one of those rationales was wrong, and the deployment of 7564b40 died on it.
  // This one materialises the upload and RUNS each tolerant script inside it.
  'scripts/guards/excluded-reads-survive-the-upload.mjs',
  // Close-out C19 (8 September 2026): the indexing policy is the one place that says
  // what may be indexed, and the tree must keep agreeing with it. Google Search
  // Console had been reporting the disagreement back for weeks.
  'scripts/guards/indexing-policy.mjs',
  // Close-out SEO3 (14 September 2026): indexing-policy.mjs asks whether a gate
  // EXISTS. This one asks whether the gate on the page and the gate in the
  // sitemap are asking the same question of the same numbers, and whether a
  // category is a page rather than a query string that canonicalises to /events.
  'scripts/guards/discovery-indexability.mjs',
  // Close-out SEO2 (14 September 2026): the two guards above judge the POLICY
  // and the THRESHOLD, both of which are readable from source. This one judges
  // the CATALOGUE, which is not: an event page exists because a row exists. It
  // runs the shipped sitemap readers against the build's own database and asks
  // the same three questions again over raw PostgREST, and fails when a page the
  // database holds is absent from the sitemap or a URL the sitemap publishes has
  // no row behind it. Every sitemap defect on record is in that shape and every
  // one of them was silent: a 42703 a bare catch threw away, so the venue block
  // published nothing for its whole life; a missing status predicate that
  // advertised eight 404s. SKIPs by name on CI's placeholder URL. Drilled red
  // four ways in scripts/verify/guard-failure-drills.mjs.
  'scripts/guards/sitemap-covers-the-catalogue.mjs',
  // Close-out SEO4 (14 September 2026): one-fee-copy.mjs judges whether a
  // SENTENCE names a second fee. This one judges the wiring and the arithmetic:
  // whether a surface that renders a price has the live fee values in its hands,
  // whether any file carries the fee as a literal, and whether anybody
  // multiplies a per-ticket total into a cart total. The event page showed
  // "From AUD $18.00" for an event nobody could leave for eighteen dollars, and
  // no gate could fail, because the number was correct and simply was not the
  // price.
  'scripts/guards/all-in-pricing.mjs',
  // Close-out SEO5 (14 September 2026): nothing may hurry a buyer with a number
  // it made up, and no accessibility section may render empty. It found four
  // live false-urgency claims on its first run: a "Selling fast" eyebrow over a
  // homepage rail that reads no stock at all, the same eyebrow on the bento
  // variant, a static content slide asserting "The events booking out right
  // now", and an alerts panel promising a push "when an event is going fast"
  // that nothing on this platform has ever sent. Each was true-looking and none
  // was true. The badge engine, which DOES count tickets, was correct all along.
  'scripts/guards/no-false-urgency.mjs',
  // Close-out PARITY1 (14 September 2026): the structured data gap, the noindex
  // discovery layer and the undisclosed buyer total were all found because the
  // owner asked a question, not because the build noticed. The table stakes are
  // now a specification the machine checks against production, and this guard
  // holds the one thing a specification can quietly lose: a line with no check,
  // or a check that reports PASS when it was shown nothing at all.
  'scripts/guards/parity-spec-complete.mjs',
  // Close-out H2.1 (8 September 2026): production reset a TLS handshake from a
  // GitHub Actions runner and the post-deploy smoke called it an outage. The
  // reset was at the handshake, before any header was sent, so nothing that
  // reads an HTTP request can have answered it, and the project has no firewall
  // configuration at all. What is left is Vercel's always-on system mitigation
  // of a shared datacentre address, and the owner's question was the right one:
  // the same thing could drop a Stripe webhook, and a dropped webhook is a paid
  // order nobody is told about. This guard holds the half that is ours (a signed
  // webhook is never rate limited by us, a cron limiter never fails closed), keeps
  // the reviewed record of every machine caller complete in both directions, and
  // reads the project's live System Bypass rules when it has a token.
  'scripts/guards/machine-callers-reachable.mjs',
  // Close-out P0.5 (8 September 2026): the error-reporting SDK was moved off the
  // BOOT path in August and stayed on the PAINT path, because `load` fires long
  // before the hero paints on a throttled mobile. Measured on the deployed
  // preview: 217.8 KB of the event page's 439.0 KB of script and 644 ms of main
  // thread, evaluating at 3,180 ms and 4,079 ms against an LCP of 4,382 ms. That
  // page scored 0.79 against the gate's 0.80 floor. Drilled red and green.
  'scripts/guards/sentry-off-the-paint-path.mjs',
  // The gate the platform just rose to meet is one JSON edit away from being
  // handed back, and that edit looks exactly like the one that earned it. The
  // high-water mark lives in the guard, beside the rule, and every drill fires:
  // a floor lowered, a check made advisory, a check deleted, a budget loosened,
  // and a new floor added undeclared. Close-out P0.7 and H5.
  'scripts/guards/lighthouse-floor-ratchet.mjs',
  // The ratchet above holds the numbers. This holds the ability to READ them. On
  // 8 September 2026 the local gate refused main's own tree against floors that
  // tree had cleared three times the same afternoon, with script bytes identical
  // to the byte, and nothing in the output said the laptop was running at 41% of
  // the speed the floors were confirmed at. The session that followed proposed
  // lowering a floor that was never wrong. Every Lighthouse collection now
  // records the machine it was taken on and a red assertion says which of its
  // two causes it was. Evidence: C:\dev\EVIDENCE\P0.7-D.
  'scripts/guards/gate-names-the-instrument.mjs',

  // Close-out F1.4. A bypass left switched on does not report a problem, it
  // removes the report, and ALLOW_PRICING_DRIFT=1 lets a build ship whose live
  // fee disagrees with docs/PRICING.md. The manifest forbids each declared
  // bypass on every Vercel STORE; this reads the process environment the build
  // actually has, so an inline one is caught as well as a stored one.
  'scripts/guards/no-build-guard-bypass.mjs',

  // Close-out UX3. On 8 September 2026 a real outside organiser signed up, built
  // an event, set a price and published it on production, and the owner received
  // nothing. Five state changes now write a notification record inside their own
  // transaction, enforced by six database triggers, and this asks the project the
  // build will run against whether those triggers are actually there. Nothing
  // else in the gate set reads a database, so nothing else could ever have seen
  // that silence. Drilled red by disabling a trigger on TEST.
  'scripts/guards/platform-notifications-installed.mjs',

  // Close-out UX3, the second guard, added after the first one shipped a defect
  // this would have caught for nothing. 20260909000002 gave events a trigger
  // reading new.city, which does not exist; plpgsql resolves a record field at
  // RUNTIME, so it applied cleanly, every gate here went green, and NO EVENT
  // COULD BE CREATED until a browser drive found it. This checks every installed
  // trigger's record fields against the committed types. Drilled red by putting
  // new.city back.
  'scripts/guards/trigger-columns-exist.mjs',

  // Close-out UX3.3, the third guard, added 13 September 2026 after driving the
  // function rather than reading it. The owner's daily order-alert ceiling is
  // counted from platformDayStart(), which subtracted the Sydney wall clock from
  // the instant. A day is 24 hours long except twice a year, so on both
  // transition days the boundary was an hour out, and on the October one it
  // landed on the PREVIOUS DATE: 172 of 35,064 hourly instants across four years
  // were wrong. Neither the unit test nor any sweep could see it, because both
  // used dates in the middle of a season. This calls the real function on every
  // hour of four years and refuses to run on a window with no transition in it.
  'scripts/guards/platform-day-boundary-is-zone-correct.mjs',

  // Close-out UX3.2, 13 September 2026. "Every notification is recorded as sent
  // or failed, A FAILURE IS RETRIED, and a PERSISTENT failure raises through the
  // second channel." The individual dispatcher did that; the digest did not. One
  // refusal from the mail vendor escalated it straight to push, and with no
  // armed device it went to `failed` on a single attempt, where nothing reads it
  // again. The one email that can carry two hundred orders was the one with no
  // second chance. This asks every delivery path that writes a terminal state
  // whether it counts its attempts first. Drilled red by taking the comparison
  // back out of the digest.
  'scripts/guards/notification-paths-retry-before-they-give-up.mjs',

  // Close-out UX3.2 and UX3.3, 13 September 2026, found the same day as the line
  // above and against the one rule it left standing. The digest counts a batch by
  // its HIGHEST attempts, which is right only while every attempt on a held row
  // was a DIGEST attempt. The dispatcher held rows with their individual-email
  // attempts intact, so a batch could arrive already at the bound and give up on
  // its first refusal: the same unrecoverable loss, through another door. This
  // runs the real hold across a sweep of attempt counts and also proves the
  // dispatcher calls it, because a perfect pure function nobody calls is worth
  // nothing. Drilled red both ways.
  'scripts/guards/digest-attempts-are-the-digests-own.mjs',

  // 13 September 2026. /account/notifications promises "nothing arrives inside
  // your quiet hours". The window was collected by that screen, validated by the
  // API, stored on notification_prefs and READ by the dispatcher on every send,
  // and no code anywhere consulted it: isWithinQuietHours was exhaustively unit
  // tested and called only by its own test file. A control that does nothing is a
  // defect by name, and this one made the screen say something untrue. The guard
  // runs the real decision across every hour of three days including both
  // daylight-saving transitions, and proves every reader of the window either
  // honours it or carries a written reason it cannot. Drilled red both ways.
  'scripts/guards/quiet-hours-are-honoured.mjs',

  // Close-out UX4.1 and UX4.2, 13 September 2026. The daily state says inside
  // its own body "if it does not arrive, that is itself the alert". The reporter
  // then gave up in the two cases that matter: no GitHub token returned null and
  // sent nothing, and any read that threw exited 2 and sent nothing. A broken
  // reporter therefore produced exactly the signal that means the build machine
  // is dead. Three collectors also answered a failed read with an empty list, so
  // a morning when the commits API was down reported a quiet day. This runs the
  // REAL composer with readers that fail and asserts a message still comes out
  // naming every blind spot, and that a blind stall check speaks. Drilled red.
  'scripts/guards/the-daily-state-cannot-go-silent.mjs',

  // 11 September 2026. Five migrations (20260910000001 to 20260911000001) were
  // committed without regenerating src/types/database.ts and every gate stayed
  // green, because the types-drift guard compares the committed file with
  // PRODUCTION and production had not been given them yet: both sides were
  // stale in the same way, and it said IN SYNC twenty-six times. The first push
  // after the founder applied them was refused with 285 unexplained
  // differences, every one an object the migrations in this tree create. This
  // replays the migrations and demands every public table, view, enum, callable
  // function and added column from the committed types, reading nothing but the
  // repository, so it refuses the commit that forgets rather than the push two
  // days later. Drilled red with a table, an enum and a column added to the
  // newest migration; proven red against the committed types of 4d0fda21 and
  // green against the regenerated file (C:\dev\EVIDENCE\TYPES-DRIFT-2026-09-11).
  'scripts/guards/types-cover-migrations.mjs',

  // Found while auditing the notification routing for close-out UX4:
  // /api/cron/queue-admit documented itself as running every minute and had no
  // entry in vercel.json, so the virtual-queue admission batch had never run
  // once. A cron that is never invoked looks exactly like a cron with nothing to
  // do, which is why nothing could see it. Drilled red on the pre-fix vercel.json.
  'scripts/guards/cron-routes-scheduled.mjs',

  // Close-out UX4.5. Branch gate failures stop being email. Nothing in this
  // repository may dispatch an alert for a ref that is not main, and every
  // dispatch declares which class it belongs to so an outage never again reads
  // like a branch gate in the inbox. Drilled red by adding a branch dispatch.
  'scripts/guards/alert-routing.mjs',

  // Found on 10 September 2026 while reading the write paths a slot ledger would
  // hook into. Saving an event deleted EVERY one of its ticket types and
  // re-inserted them. On a sold event the database refused that delete (the
  // order_items CHECK), the error was never read, the re-insert collided, and the
  // organiser was shown `duplicate key value violates unique constraint
  // "ticket_tiers_event_id_name_key"`: one sale made an event permanently
  // uneditable. On an unsold one the delete succeeded and cascaded away the
  // waitlist, the squads, the access codes and the pricing rules. Every unit test
  // passed throughout, because nothing in the suite has a foreign key. All four
  // clauses drilled red and green (C:\dev\EVIDENCE\D0\guard-tier-identity-drill.txt).
  'scripts/guards/tier-identity-preserved.mjs',


  // Close-out UX6 (10 September 2026). The owner bought a ticket on a phone and
  // could not see the total he was paying: a grid track widened by one of its own
  // children dragged the order summary 146px off the right of a 390 screen, and
  // `overflow-x: clip` meant there was no scrollbar to reach it with. Measured on
  // the real page, not reasoned about. Both drilled red and green.
  'scripts/guards/grid-track-cannot-blow-out.mjs',
  'scripts/guards/buyer-total-is-marked.mjs',

  // Close-out D1, the slot ledger, three guards because the close-out asks for
  // three and each defends a different thing.
  //
  // ledger-append-only: nothing edits history, checked in the source AND on the
  // project this build will run against. One UPDATE and every number derived
  // from the table becomes an assertion, with no way to notice afterwards.
  //
  // ledger-speaks-no-industry: not one column, enum or engine file may say
  // event, ticket or tier. The ledger is the foundation of something that will
  // later run for gyms, clinics and tour operators, and a ledger that speaks one
  // industry has to be REBUILT to leave it, which loses the history.
  //
  // ledger-writes-through-the-adapter: one door in, and every order-confirmation
  // site uses it. The second clause exists because this repository has twice
  // shipped one write site that forgot a call the others made (discount usage on
  // the paid path, payout_status on account.updated).
  //
  // All three drilled red and green (C:\dev\EVIDENCE\D1\guard-ledger-drill.txt).
  'scripts/guards/ledger-append-only.mjs',
  'scripts/guards/ledger-speaks-no-industry.mjs',
  'scripts/guards/ledger-writes-through-the-adapter.mjs',

  // Close-out D2, the recovery engine, two guards because the close-out asks for
  // exactly two and each holds a line nothing else can see.
  //
  // fillrate-reads-only-the-ledger: the engine imports nothing from this
  // platform's domain, queries no table but the ledger's and its own, and says
  // no word from one industry. The engine is the part of this business with
  // value outside ticketing and the boundary that gives it that value is
  // invisible: nothing breaks the day somebody imports a domain type into it.
  //
  // recovery-only-writes-to-people-who-asked: every send and every offer names
  // the recorded engagement that authorised it, enforced in the database by a
  // NOT NULL foreign key and in the source by one door; the six refusals in
  // due.ts still exist by name; and a message with no working unsubscribe is
  // refused rather than degraded.
  //
  // Both drilled red and green (C:\dev\EVIDENCE\D2\guard-recovery-drill.txt).
  'scripts/guards/fillrate-reads-only-the-ledger.mjs',
  'scripts/guards/recovery-only-writes-to-people-who-asked.mjs',

  // Close-out D2, found by driving the waiting list on 11 September 2026. A
  // full-page dialog rendered where it sits is trapped in the stacking context
  // of any ancestor carrying a transform: it PAINTS correctly and cannot be
  // clicked at all. The join dialog was in exactly that state, and the browser
  // said so when asked what was at the centre of its own submit button (the
  // hero section). Nothing else on this platform can see it: the component
  // renders, the screenshot looks right, the unit tests pass and axe passes.
  //
  // Drilled red on nine real overlays, all nine now portalled, then green.
  'scripts/guards/overlays-are-portalled.mjs',

  // 12 September 2026, the FOURTH occurrence of one class. The gate's checkout
  // drive opened a published, public event at 768 and the route answered 404,
  // once, because the layout's existence read discarded its error: a dropped
  // socket left `data` null exactly as an empty table would, and the line that
  // turns null into notFound() cannot tell them apart. The first three were each
  // fixed where they stood and each fix was a paragraph; the measurement after
  // the third counted only the visible fold and walked past the silent one. The
  // fix is now one door (src/lib/supabase/read-or-throw.ts) and this guard fails
  // the build on every read that decides a 404 and discards, folds or merely
  // logs its error. Drilled RED on the 17 files as they stood, then green.
  'scripts/guards/read-failure-is-not-not-found.mjs',

  // Close-out C8 EXECUTION METHOD, C8B.3 and C8B.4, 15 September 2026. Scope v5
  // section 10.3 asks for "minimal JavaScript payloads (<200KB initial bundle)"
  // and until now NOTHING measured it on any commit. The Lighthouse gate holds
  // a SCORE, and the founder's ruling of 25 August made that gate advisory
  // because the same bytes scored 0.76 on the runner and 0.88 from a warmed
  // client. Bytes do not have that problem, so the scope's own number can be a
  // hard gate where the score cannot.
  //
  // Measured on the first run: the four heaviest PUBLIC routes on the platform
  // were /signup (228.9 KB), /login (228.2), /auth/reset-password (226.8) and
  // /scan/[eventId] (225.2), all of them heavier than the event page nobody had
  // stopped optimising, and all four explained by one 51.4 KB chunk of auth
  // client statically imported into four components. Nothing could see it.
  //
  // THIS HALF WEIGHS NOTHING and says so on every run: it judges the contract
  // (perf-budget.json is well formed, carries the scope number, and the
  // postbuild half is still wired). The proof is the same file run with
  // --built from npm's postbuild, against the build that just finished.
  'scripts/guards/initial-bundle-budget.mjs',

  // Close-out F2.1. The generalisation of five lost deployments: the build host
  // is not a developer machine, and every build-time script says which of docs,
  // git and a token it needs. Registered LAST on purpose - it reads the source
  // of every other guard in this list, so running it after them means a guard
  // added in the same pass is already on disk to be read.
  'scripts/guards/build-host-needs-declared.mjs',
]

/**
 * A registered guard that does not exist is a silent hole: `spawnSync` on a
 * missing file yields a non-zero status that reads like an ordinary guard
 * failure, and a typo'd path would report as "the guard failed" rather than
 * "the guard is not there". Checked up front so the two cannot be confused.
 */
const missing = GUARDS.filter((g) => !existsSync(join(ROOT, g)))
if (missing.length > 0) {
  console.error('\n[guards] FAILED before running anything.\n')
  for (const g of missing) console.error(`    registered but not on disk: ${g}`)
  console.error('\n    Fix the path in scripts/guards/run-guards.mjs, or restore the guard.\n')
  process.exit(1)
}

/** The Node major CI installs, from the one file that defines it. */
function contractMajor() {
  const file = join(ROOT, '.nvmrc')
  if (!existsSync(file)) return null
  const major = Number.parseInt(readFileSync(file, 'utf8').trim().replace(/^v/, ''), 10)
  return Number.isInteger(major) ? major : null
}

const CONTRACT = contractMajor()
const RUNNING = Number.parseInt(process.versions.node.split('.')[0], 10)
const CI_EQUIVALENT = CONTRACT !== null && RUNNING === CONTRACT

/**
 * NAMES, NOT A COUNT. Close-out F1.1: on 9 September 2026 this runner ended two
 * builds with "1 of 84 guard(s) FAILED" and never said which one, on two
 * different machines, and the name was recoverable only by reading several
 * thousand lines of PASS output. It had the name the whole time. Keep it.
 */
const failures = []

/*
 * STDERR IS CAPTURED RATHER THAN INHERITED, and that is the whole of close-out
 * F2.3's remaining half. An inherited stream reaches the log and reaches
 * NOBODY ELSE: this process cannot read what its child printed, so a guard that
 * threw an uncaught exception and a guard that printed a considered FAIL and
 * exited 1 arrived here as the same fact, `status === 1`, and were reported
 * identically. Those are opposite faults. One says the law was broken; the
 * other says the guard is broken, which on the build host nearly always means
 * it was written for a machine it was never run on.
 *
 * The cost of capturing is that a guard's output appears when it FINISHES
 * rather than as it runs. Guards run sequentially and each takes about a
 * second, so the log still fills incrementally; the ordering of stdout against
 * stderr WITHIN one guard is the thing genuinely lost, and it is worth it. Both
 * streams are echoed verbatim below, so nothing disappears from the build log
 * that used to be in it.
 */
for (const guard of GUARDS) {
  // env: gitEnv() SEVERS THE INCIDENT CLASS AT THE ROOT rather than at the leaves.
  // This one line fans an environment out to every registered guard, three of
  // which shell out to git. Clearing GIT_ here means a guard added tomorrow is
  // safe without its author knowing the rule, which is the only kind of safety
  // that survives. The per-guard clearing stays as well: this is the belt, that
  // is the braces, and neither is load-bearing alone.
  const result = spawnSync(process.execPath, [join(ROOT, guard)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    env: gitEnv(),
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  const outcome = describeOutcome(result)
  if (!outcome.ok) failures.push({ guard, reason: outcome.reason, thrown: outcome.thrown })
}

const runtime = CI_EQUIVALENT
  ? `Node ${process.versions.node} (CI-EQUIVALENT: matches the .nvmrc contract of ${CONTRACT})`
  : `Node ${process.versions.node} (NOT CI-EQUIVALENT: .nvmrc pins ${CONTRACT}, CI runs that, this is ${RUNNING})`

if (failures.length > 0) {
  for (const line of renderFailures({ failures, total: GUARDS.length, runtime })) console.error(line)
  process.exit(1)
}

console.log(`\n[guards] all ${GUARDS.length} guards PASS.`)
console.log(`[guards] runtime: ${runtime}`)
if (!CI_EQUIVALENT) {
  console.log(
    `[guards] this PASS is NOT proof CI is green. Reproduce CI's runtime with:\n` +
      `[guards]   npm run guards:contract-node\n`,
  )
} else {
  console.log('')
}
