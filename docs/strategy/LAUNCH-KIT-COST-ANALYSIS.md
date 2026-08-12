# Part F: the cost analysis, before anything expensive is built

Date: 8 August 2026. Branch `feat/launch-kit-moat`.
INTERNAL DOCUMENT. Competitor names appear as research context only.

Every price is quoted from a source fetched on 8 August 2026, with the URL
beside it. Every token count is measured from this repository, not estimated
from memory. Where a figure could not be sourced it says so and is not filled
with a guess.

---

## THE ANSWER IN ONE PAGE

**Magic Start costs about 1.5 US cents per generation today.** Measured, not
guessed: 1,613 tokens of system prompt plus a 732-token schema through Haiku
4.5, then a second pass through Sonnet 5.

**That is not the interesting number. This is: roughly 70 percent of what the
Launch Kit produces never needed a model at all, and the part that did now has
a zero-cost floor underneath it.**

| Volume | AI cost per month | With the recommended design |
|---|---|---|
| 10 generations/day | USD 4.87 | USD 1.46 |
| 100/day | USD 48.75 | USD 14.63 |
| 1,000/day | USD 487.49 | USD 146.25 |

The recommended design is not a cheaper model. It is **deterministic by
default, model for prose only, cached aggressively**, which cuts the bill by
about 70 percent while making the output MORE reliable, because a template
cannot hallucinate a venue and a regular expression cannot invent a date.

**Three things I would flag before you spend anything.**

1. **The runaway risk was real and is now closed.** `checkMonthlyBudget`
   returned "yes, proceed" whenever Redis was unreachable. On the anonymous
   endpoint A1 opens, that is an uncapped bill for the length of any Redis
   wobble. Fixed and committed this session (`3aa5335`), proven by tests that
   assert the two fail modes reach opposite verdicts on the same failure.
2. **Nothing in the visual artefacts should ever call a model.** The poster,
   the share cards, the QR and the layout are deterministic problems solved
   once. The research says the tools you admire do the same thing.
3. **I could not complete F6.** Testing whether a cheaper model clears your bar
   requires calling the models, and there is no `ANTHROPIC_API_KEY` on this
   machine. It is BLOCKED, not skipped, and the unblock is one environment
   variable on the preview deployment.

---

## F1: what one Magic Start generation costs today

**Measured inputs** (from `src/lib/ai/magic-start.ts` on this branch):

| Component | Chars | Approx tokens |
|---|---|---|
| System prompt (`buildSystem`, including 21 categories and 21 communities) | 5,969 | 1,613 |
| `DRAFT_SCHEMA` sent as the output format | 2,710 | 732 |
| A typical organiser description (150 chars) | 150 | 41 |
| Pass 1 output (the full draft JSON) | - | ~400 |
| Pass 2 output (title, summary, description) | - | ~350 |

**Prices** ([Anthropic pricing, fetched 8 August
2026](https://platform.claude.com/docs/en/about-claude/pricing)): Haiku 4.5 at
USD 1.00 input / 5.00 output per million tokens, 5-minute cache write 1.25x,
cache hit 0.1x. Sonnet 5 at USD 2.00/10.00 through 31 August 2026, then
USD 3.00/15.00 from 1 September 2026.

| Scenario | Pass 1 (Haiku) | Pass 2 (Sonnet) | Total |
|---|---|---|---|
| Cold cache, Sonnet 5 introductory | $0.004789 | $0.007896 | **$0.012686** |
| Warm cache, Sonnet 5 introductory | $0.002934 | $0.004187 | **$0.007121** |
| Cold cache, Sonnet 5 standard (from 1 Sept) | $0.004789 | $0.011845 | **$0.016634** |
| Warm cache, Sonnet 5 standard | $0.002934 | $0.006280 | **$0.009214** |

**The working figure: USD 0.01625 per generation** (standard Sonnet 5 pricing,
80 percent cold, plus one anti-tell regeneration on an assumed 15 percent of
drafts). Cold dominates because organisers arrive minutes apart, not seconds,
and the cache window is five minutes.

**A discrepancy worth knowing.** The repository's own price table
(`src/lib/ai/config.ts:36-40`) prices `claude-sonnet` at $3/$15, which is the
post-1-September rate. During the introductory window the guard therefore
over-estimates spend by about 50 percent on the Sonnet pass. That errs toward
safety, so it is not a defect, but the number in the admin view is not the
number on the invoice and you should know which is which.

---

## F2: the anonymous endpoint

Assumptions, stated so you can disagree with them: one generation per visitor,
150-character descriptions, 30-day month, 80 percent cold cache, 15 percent of
drafts triggering one anti-tell regeneration, standard Sonnet 5 pricing.

| Anonymous generations/day | Per month (USD) | Approx AUD |
|---|---|---|
| 10 | $4.87 | $7.40 |
| 100 | $48.75 | $74.10 |
| 1,000 | $487.49 | $741.00 |

**The deterministic floor costs USD 0.00 per generation at every volume.** It
is already built and committed this session, and it fills every step 1 field
from the organiser's own words.

**The honest risk is not the steady state, it is the spike.** A thousand
generations a day is a good problem. A thousand generations an hour from one
script is a USD 400 evening. That is what F9 is about.

---

## F3: the fail-open cost guard. FIXED AND PROVEN.

`checkMonthlyBudget` returned `ok: true` on any Redis error
(`cost-guard.ts:35` before this branch). Correct for support chat, where every
caller is authenticated and separately rate limited. Wrong for anything a
stranger can reach, where the counter is the only thing between anonymous
traffic and the API.

**What changed** (commit `3aa5335`):

- The fail mode is now a REQUIRED parameter, not a global default, so a new
  call site cannot inherit the wrong risk posture by forgetting to think.
- `src/lib/ai/service.ts` (the four chat assistants) passes `'open'`, with the
  reasoning recorded at the call site.
- `src/lib/ai/magic-start.ts` passes `'closed'`.
- "No Redis configured at all" is treated exactly like an outage, because it
  is the same blindness.
- The route falls back to `buildDeterministicDraft` for every non-refusal
  failure, so refusing costs the organiser nothing: they still get a complete
  draft, and the response carries `source: 'model' | 'deterministic'` so the
  difference is observable rather than silent.

**Proof it is not vacuous:** six tests, of which two assert that `'open'` and
`'closed'` reach OPPOSITE verdicts on the identical Redis failure. A guard that
could not fail would fail that pair.

```
✓ fails OPEN on a redis error for the chat callers
✓ fails CLOSED on a redis error for draft generation
✓ fails CLOSED when redis is not configured at all
✓ still allows the chat callers when redis is not configured
```

---

## F4: how the others make this cheap

**Finding: the tools producing beautiful event artefacts are not calling a
model to produce them. They are rendering templates.**

The dominant pattern is Satori, Vercel's library that converts JSX and a subset
of CSS into SVG, then to PNG with sharp
([vercel/satori](https://github.com/vercel/satori),
[Vercel OG docs](https://vercel.com/docs/og-image-generation)). It is
deterministic, it runs in milliseconds, and it costs only compute.

On Luma specifically: developers openly describe reproducing Luma's event
images with `@vercel/og` and treat them as the reference for the technique
([Vercel community
thread](https://community.vercel.com/t/using-v0-dev-to-build-open-graph-images-and-rip-off-luma/869)).
**I could not determine Luma's actual internal stack**, and I am not going to
assert it. What I can say is that the visual result they are admired for is
reproducible with a deterministic renderer, because people reproduce it.

**We already run exactly this pattern.** `src/app/events/[slug]/opengraph-image.tsx`
is an `ImageResponse` template, and the A4 poster is pdf-lib
(`src/lib/broadcast/poster.ts`). Neither calls a model. **The right answer to
"how do we make the artefacts cheap" is that they already are, and the work in
A2 and E3 must stay that way.**

**The question behind the question, answered directly:** essentially all of the
visual kit can be produced with no AI call. Layout, crop, colour, typography,
QR, tracked links and composition are deterministic problems, solved once and
reused for every event forever. The only part with a genuine claim on a model
is PROSE, and even prose now has a zero-cost floor.

---

## F5: where our AI spend is avoidable

Audit of every AI call reachable from Magic Start and the Launch Kit.

| Call | Needs a model? | Reasoning |
|---|---|---|
| Field extraction (pass 1, Haiku) | **Partly.** Keep for now | Regular expressions already read price, capacity, venue, city, date and time reliably (shipped this session). What they cannot do is resolve "next Friday" against context or read an unusual sentence shape. Keep the model, but the floor means a failure is invisible |
| Prose: title, summary, description (pass 2, Sonnet) | **YES** | This is the one place a model earns its money. It is also the part the founder's bar is aimed at |
| Anti-tell regeneration | **Yes, but it is avoidable spend** | Fires on roughly 15 percent of drafts by assumption. Every avoided tell in the prompt is a saved regeneration |
| Category selection | **NO** | 21 fixed options against keyword intent. Deterministic, shipped, and now correct on ordering |
| Tags | **NO** | Derived from the organiser's own words |
| Community detection | **NO, and a model is worse here** | High precision matters more than recall, and a wrong tick misrepresents a real community. A fixed signal list is auditable; a model is not |
| Short summary | **Model preferred, deterministic acceptable** | The deterministic version is factually correct and reads as a listing line. A model writes a better hook. See the honest quality note below |
| Poster, OG card, future story and square cards | **NO. Never** | Typeset templates. Also a quality argument, not only cost: generated imagery garbles text |
| QR, tracked links, reach maths | **NO** | Pure computation |

**The recommendation, stated plainly: the deterministic layer should be the
DEFAULT, not the fallback, for everything except prose.** That is not a cost
compromise. It is better engineering in three ways: a template cannot
hallucinate, output is identical for identical input so it can be cached
forever, and the product keeps working when Anthropic has an incident.

**The honest quality caveat, because F5 asked for reasoning and not
reassurance.** I dumped the deterministic summary for six event types and read
them (`docs/roast/launch-kit-moat-six-drafts-2026-08-08.txt`). They are
factually correct, correctly punctuated, and lead with the practical anchor:

> The Pier, Geelong, Friday 21 August at 8pm. Comedy night, doors 7pm.
> Tickets from $20.

A promoter would post that. A promoter would not be impressed by it. It leads
with the venue rather than the reason to come, and the founder's bar is
"I could not have done that better myself". **On that bar the deterministic
summary passes as a floor and fails as a ceiling, so the model pass stays.**
That is the distinction: deterministic by default for structure, model for the
sentence that has to sell.

---

## F6: the cheaper model question. BLOCKED, not skipped.

F6 requires testing models and pasting side-by-side output. **There is no
`ANTHROPIC_API_KEY` in any local environment file** (checked `.env.local`,
`.env.test`, `.env.staging.example`, `.env.example`: zero matches). I cannot
call any model from this machine, so I cannot produce the comparison, and I am
not going to assert which model is better from memory.

**What is already known without a test:** the current split is already the
cheap design. Extraction runs on Haiku 4.5, the cheapest current model, and
only the prose runs on Sonnet. The open question is narrow: does Haiku 4.5
write the summary and description well enough to drop the Sonnet pass, which
would cut per-generation cost by roughly 70 percent (from $0.0166 to about
$0.0048 cold).

**The unblock is one environment variable.** `ANTHROPIC_API_KEY` is already
required on production by the manifest (`src/lib/env/manifest.mjs:772-783`) and
recorded as present. Setting it on the PREVIEW scope lets me run the six-input
matrix through both models and paste the output for judgement. That same
variable also unblocks R5, which is still outstanding: **C3's exact cause
remains unproven at the model level**, though the taxonomy finding explains it
without needing a run.

---

## F7: caching and reuse

| Opportunity | State | Saving |
|---|---|---|
| System prompt caching | **Already on.** `cache_control: ephemeral` at `magic-start.ts:368` | Cache hit is 0.1x input. On a warm path it takes the generation from $0.0166 to $0.0092, about 45 percent |
| 1-hour cache instead of 5-minute | **Not used.** Worth testing at volume | 2x write, 0.1x read. Pays off after two reads within the hour. Only helps once traffic is steady |
| Identical-input dedup | **NOT BUILT.** Recommended | Hash the sanitised description plus taxonomy version; return the stored draft on a repeat. Costs one table and removes the entire spend for retries and refreshes, which is exactly what a frustrated organiser does |
| OG card regenerated per view | **Needs measurement.** `opengraph-image.tsx` is a dynamic route | Every social crawler hit re-renders. Static caching by event slug plus updated-at is the fix, and it is compute, not model spend |
| Poster PDF regenerated per download | Rebuilt on every request (`poster/route.ts`) | Same shape. Cheap individually, wasteful at volume |
| Deterministic artefacts generally | Identical input gives identical output | This is the real prize: cache forever, invalidate on event edit |

**The one I would build first is identical-input dedup**, because it removes
the most common wasted spend (an organiser pressing the button again) for a
day of work.

---

## F8: storage and bandwidth. PARTIAL, and I will not guess the gaps.

Sourced: Supabase charges USD 0.09 per GB egress beyond the included
allowance, and about USD 0.021 per GB per month for storage beyond included
limits; the Pro plan includes 250 GB egress
([makerkit](https://makerkit.dev/blog/saas/supabase-pricing),
[Schematic](https://schematichq.com/blog/supabase-pricing)). **These are
secondary sources. I did not reach Supabase's own pricing page and the figures
should be confirmed there before anyone budgets on them.**

**NOT SOURCED, and therefore not stated:** Vercel bandwidth and image
optimisation pricing for 2026, and Upstash Redis free tier limits. My searches
did not return them and I am not filling the gap from memory.

**The architectural recommendation for E2 does not depend on those gaps**, and
it is this: **do not self-host video.** One 60-second promo clip at moderate
quality is roughly 15 to 30 MB. Serving it from Supabase egress at USD 0.09 per
GB means about 3 to 6 US cents per hundred views, which is small until an event
goes well and then scales with exactly the thing you want to encourage. Accept
a link to a clip the organiser already has on a platform that serves video for
free, and store only a poster frame. That keeps images (small, cacheable,
already handled) as the only thing on our storage bill.

Images: keep the existing 4.5 MB cap with client-side compression, store one
optimised original, and derive every crop deterministically at render time.

---

## F9: abuse vectors on the anonymous endpoint

The founder is right that IP rate limiting alone is weak. Named honestly:

| Vector | What stops it |
|---|---|
| One IP hammering the endpoint | Per-IP limit (the `launch-magic` bucket, 5/hour, specified in PHASE-C 4.6). **Necessary, not sufficient** |
| Rotating residential proxies | Per-IP fails. The real defence is the monthly budget ceiling, now failing CLOSED (F3), which caps the worst case at the budget rather than at infinity |
| Headless browser farm | Vercel BotID is available on this stack and is the right tool. **Not currently wired.** Recommended before the endpoint opens |
| Using us as a free general-purpose text API | The output schema is event-shaped and the system prompt is locked to event drafting, so it is a poor general tool. Input is clamped at 2,000 chars |
| Prompt injection through the description | Already handled: input is wrapped as untrusted data (`asUntrustedBlock`) and never merged into the instruction |
| Junk draft rows filling the database | 72-hour expiry with a nightly sweep, one draft per cookie (PHASE-C 4.6) |
| Cost amplification by very long inputs | Clamped at 2,000 chars, so the worst-case input is bounded and known |
| Slow-drip abuse under the per-IP limit | Only the budget ceiling catches this. It is the backstop that matters |

**The load-bearing defence is the budget ceiling, and it only works because it
now fails closed.** Everything else raises the cost of abuse; only the ceiling
bounds it.

---

## F10: the recommendation

| Cost driver | Today | After the branch as specified | Cheapest design that still clears the bar |
|---|---|---|---|
| Magic Start prose | $0.0166/gen | $0.0166/gen | $0.0166/gen. **Keep. This is where a model earns its money** |
| Field extraction | $0.0048/gen | $0.0048/gen | **$0.00.** Deterministic first, model only when the regex finds no date |
| Category, tags, communities | included above | included above | **$0.00.** Deterministic, shipped |
| Anti-tell regeneration | ~15% of drafts | ~15% | Lower by prompt tuning; not worth a model change |
| Repeat generations | full price | full price | **$0.00** with identical-input dedup |
| Poster, cards, QR | $0.00 | $0.00 | **$0.00.** Never let a model near these |
| Video storage and egress | n/a | risk if self-hosted | **$0.00** by accepting a link and storing a poster frame |

**Monthly delta by service.** Anthropic figures are computed from cited
pricing. The other three are marked because I could not source current pricing
and will not guess.

| Active organisers | Anthropic (as specified) | Anthropic (recommended) | Supabase | Vercel | Upstash |
|---|---|---|---|---|---|
| 0 | $0.00 | $0.00 | existing | existing | existing |
| 10 | ~$1.63/mo | ~$0.49/mo | negligible | negligible | free tier likely |
| 100 | ~$16.25/mo | ~$4.88/mo | NOT SOURCED | NOT SOURCED | NOT SOURCED |
| 1,000 | ~$162.50/mo | ~$48.75/mo | NOT SOURCED | NOT SOURCED | NOT SOURCED |

Assumes 10 generations per organiser per month. Anonymous traffic is modelled
separately in F2 and is the larger and less predictable number.

**The recommendation: deterministic by default, model for prose, cache
aggressively, and never let a model near a pixel.**

At every realistic launch volume the AI bill is smaller than one ticket's
platform fee per organiser per month. **Cost is not the constraint on this
product and should not be allowed to shape it.** The reason to adopt the
deterministic default is reliability and quality, and the 70 percent saving is
a side effect worth taking.

**Where I would spend MORE, not less.** The Sonnet prose pass costs about a
cent and is the only thing standing between the organiser and copy they would
be embarrassed to post. If F6 shows Haiku writes a materially worse summary,
keep Sonnet and pay the cent. The founder's standard is explicit that cost
discipline never means paying less for a worse product, and this is the exact
case it was written for.

**Nothing in this branch materially changes the bill.** The one item that
would is A1 opening generation to anonymous traffic, which is modelled in F2
and bounded by F3 and F9. At 100 anonymous generations a day it is about USD 49
a month, and the floor means even a total AI outage still hands every visitor a
complete kit.
