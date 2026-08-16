# Output review, the organiser-copy half. Founder ruling 3.

Written 8 August 2026, branch `feat/launch-kit-moat`.

## What was missing

The digest half already existed: `/api/cron/weekly-digest?preview_to=` renders
the mail and sends nothing, and it found three defects. The organiser-copy half
was NOT STARTED.

The argument for it, in the predecessor's own words:

> Reading real output found six defects this session that tests did not: three
> in the digest email, three in the harness itself. **Every single one passed its
> tests.**

A test asserts what somebody thought to assert. It cannot tell you the summary
reads like a machine wrote it, that the title is the organiser's sentence cut
mid-clause, that the tags are three spellings of one word, or that a field the
organiser now has to fill in by hand was silently left empty.

## Where it lives, and why not a script

`tests/unit/organiser-copy-review.test.ts`, which rewrites
`docs/roast/organiser-copy/OUTPUT.md` on **every test run**.

The ruling says dump the copy "on every run". A standalone script only runs when
somebody remembers. In the suite it runs on every `npm test`, the current output
is always sitting in the repo to be read, and any change to generated copy shows
up in a diff. (`server-only` is a build-time marker with no package behind it,
which is also why this cannot be a plain node script.)

It covers the **deterministic floor**, which is what every organiser actually
receives whenever the model is unconfigured, over budget, or fails: the path
least likely to be looked at and most likely to be shipped. The model path stays
BLOCKED on `ANTHROPIC_API_KEY` (R5 and F6), and the file says so rather than
pretending it exercised it.

Eight inputs, written the way organisers really type. The awkward ones are the
point: one line with no facts, no date and no price, a wall of text with the
facts buried, a weekday that disagrees with its own date, and copy already
written in the exact voice the anti-tell gate rejects. Clean paragraphs would
print beautifully and prove nothing.

## It found four defects on its first run

**1. Every comedy night was filed under the performing arts category.** The rule
said so itself:

```
// Comedy has no category of its own in the live taxonomy ...
// the performing arts category is the honest best fit until that migration lands.
{ match: /\b(stand ?up|standup|comedy|comedian|comic|...)\b/, nameHints: ['art'] },
```

That migration is R1, landed earlier in this same session. Now `nameHints:
['comedy', 'art']`, so it picks Comedy where it exists and still behaves on a
deployment where the migration has not been applied.
`"comedy night at the pub"` went from **"Arts & Community"** to **"Comedy"**.

**2. Banned marketing words were being published as public discovery tags.** An
organiser who wrote "Unlock an unforgettable evening and dive into a curated
journey through sound" got:

```
tags: ["unlock","unforgettable","evening","curated","journey","through"]
```

Junk as discovery metadata, and the exact voice the platform rejects, published
as though the platform had chosen it. Tags are permanent and public. The
last-resort word pass now drops anything the anti-tell gate names.

**3. A tag shortfall was silent.** Founder ruling C4 asks for four to eight tags.
`"comedy night at the pub"` does not contain four traceable tags, and padding
would invent public discovery metadata that puts the event in front of the wrong
people. So the shortfall is now **declared**: `unresolved` gains "Discovery
tags". Falling short silently reads to the organiser as a finished field, which
is the "filled and missing at the same time" defect `recomputeUnresolved` was
written to end.

**4. A tell-carrying title shipped, while the code believed it did not.** The
summary builder carried this comment:

```
// A tell surviving even that means the TITLE carries it, and the title is
// already blanked by the gate in that case, so the result is clean or empty.
```

**The title was not blanked.** The deterministic path published
`"Unlock an unforgettable evening and dive into a curated journey through
sound"` as the event title while refusing to write a summary for the same
reason. The tool did not write those words, but it did choose them, and a chosen
line is the tool's copy. It is now left empty and named in `unresolved`, the
same call the summary already makes on the same collision. The organiser loses
nothing: their full text is still the description, and they are asked for a
title rather than handed one in a voice the platform rejects.

## The harness was crying wolf, twice, and that was fixed too

Its first version flagged two things that are **correct behaviour**:

- a marketing word in `description`. That is the ORGANISER'S OWN TEXT passed
  through. Their writing, not ours. Only `title` and `summary` are the tool's
  own copy;
- an empty `summary`. The tool refuses to author a summary carrying a tell and
  **names the gap in `unresolved`**. That is the right call on a collision
  between "never empty" (C2) and "never that voice", because the organiser is
  told. Declared is not the same as silently blank.

A check that fails on correct behaviour gets ignored inside a week, so both are
now conditioned on whether the tool declared the gap.

## Result

```
Test Files  131 passed (131)
     Tests  1478 passed (1478)
```

`"comedy night at the pub"` now produces:

```
- title       "comedy night at the pub"
- summary     "comedy night at the pub."
- category    "Comedy"
- tags        ["comedy"]
- unresolved  ["Date and time","Venue name","Venue street address",
               "Ticket type and price","Discovery tags"]
```

Every field is either filled from something the organiser actually wrote, or
named as still needed. Nothing is invented and nothing is silently blank.

## What is still for a human, which is the entire point

`OUTPUT.md` is in the repo. **A zero violation count does not mean the copy is
good** - it means the copy broke no rule anybody thought to write down. The
defects worth finding are the ones no rule covers, and the file exists so
somebody reads it. Two I would want a founder's eye on:

- the summary for the well-written input is largely the title again, which is
  close to the truncation C2 was raised about;
- `"comedy night at the pub"` yields exactly one tag. That is honest, and it is
  also a thin event that will be hard to find. The answer is probably in the
  wizard asking for more, not in the fallback inventing it.

Gates: tsc clean, eslint 47 warnings 0 errors (the baseline), 1478 tests across
131 files, copy-tell-gate clean, all 10 reach-integrity code checks pass.
