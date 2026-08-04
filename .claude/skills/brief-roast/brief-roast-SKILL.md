---
name: brief-roast
description: "Mandatory self-audit before claiming any task complete. Reconstructs the original brief into a numbered requirement ledger, adjudicates each one with observed evidence, then runs an adversarial pass that assumes failure and hunts for it. Blocks the word DONE while any requirement is unmet. Trigger this at the end of EVERY substantive task, and again before any report is written. Also trigger when a task asks to match or surpass a competitor, when a design or product decision is being made, or when a claim of quality is about to be stated."
---

# Brief roast: the self-audit gate

## Why this exists

The founder's recurring loss is not bad code. It is **reports that read as complete while requirements were silently dropped.** A brief lists eight things, six get done, the report leads with the six, and the two missing ones surface a week later in production.

This skill exists to make that impossible. It is adversarial by design. Its job is to find your failure before the founder does.

**Hard rule: you may not write the word DONE, COMPLETE, SHIPPED, or GREEN in any report until this gate has run and every requirement is adjudicated.**

---

## Phase 1: The requirement ledger

Re-read the original brief **verbatim**, from the top, in the conversation. Not your memory of it. Not your plan derived from it. The literal text.

Then decompose it into a numbered ledger. Every imperative sentence becomes its own row. Split compound requirements: "build X and prove Y" is two rows, not one.

Include requirements that arrived **mid-task** as founder directives. Those are the most commonly dropped, because they are not in the original block.

Include the **standing rules** that apply to every task: Australian English, no em-dashes or en-dashes, the community word, TEST-only writes, the funds-holding engine untouched, DESIGN-LOCK, no competitor named in public-facing copy.

Write the ledger to `docs/roast/<task-slug>-<date>.md` before you begin adjudicating. Writing it first prevents the ledger from being shaped to fit what you happened to do.

---

## Phase 2: Adjudication

For each numbered row, exactly one verdict:

| Verdict | Meaning | Requires |
|---|---|---|
| **MET** | Fully satisfied | Observed evidence: a file path with line numbers, a command's actual output, a screenshot, or a test name. Never an inference |
| **PARTIAL** | Started, incomplete | What precisely remains, and why it stopped |
| **NOT MET** | Not done | Plain statement. No softening |
| **REFUSED** | Deliberately not done | The reason, and why refusing was correct |
| **BLOCKED** | Could not be done | The blocker, and what would unblock it |

Rules of adjudication:

- **Inference is not evidence.** "The code appears to handle this" is NOT MET until you have run it or read the specific lines.
- **A passing test is not proof the requirement was met** unless the test asserts the requirement. Say which assertion covers it.
- **"I could not verify" is NOT MET**, not MET with a caveat.
- If a requirement's premise was false, say so, and still adjudicate what the founder actually wanted underneath it.

---

## Phase 3: The adversarial pass

Now assume you failed. Your task is to find the failure. Work through every item below and answer it in writing, even when the answer is "none found."

**Silent drops.** Compare the ledger against your report draft. Name every requirement the report does not mention. Those are the silent drops.

**Interpretation drift.** Where did you substitute an easier task for the one asked? Where did you reframe a requirement into something more convenient? If you found yourself mentally rewording a requirement, that rewording is the failure.

**The match-versus-surpass test.** If the brief said surpass, beat, or better than: did you produce something that merely matches? State, per competitor capability, whether the result is BEHIND, LEVEL, or AHEAD, and what the specific visible difference is. **"Level" is a failure when the brief said surpass.** Never claim AHEAD without naming the capability and the evidence.

**The unverifiable claim hunt.** List every quality claim in your report. For each, name what would falsify it and whether you tested that. Delete any claim you cannot falsify-test.

**The generic test.** Could this output belong to any other product? If yes, it violates the no-generic law. Name the specific thing that makes it EventLinqs.

**The AI-tell sweep.** Scan every line of generated or written copy for: em-dashes, en-dashes, exclamation marks in user-facing copy, the banned community word, and the tell lexicon (unforgettable, look no further, elevate, unlock, vibrant, nestled, in the heart of, stands as a testament, "not just X, it's Y", delve, tapestry, seamless, robust, leverage, navigate the landscape). Report the count. Zero is the only passing number.

**The regression sweep.** DESIGN-LOCK: name every existing element you changed that the brief did not ask you to change. Hero height, spacing, colours, layout, copy, chrome. If any, revert it and say so.

**The founder-cost test.** Does this report send the founder back to a dashboard for something you could have done in code? Does it ask a question you could have answered by reading the code? Each instance is a failure. Fix it before reporting.

**The evidence-visibility test.** Can the founder see the work with their own eyes, or only read your description of it? Screenshots, downloadable files, and written reports at named paths are visible. Prose is not. If a deliverable is visual, there must be a capture.

---

## Phase 4: The gate

Count NOT MET plus PARTIAL plus unresolved adversarial findings.

**If the count is zero:** state it, list the evidence per requirement, and report.

**If the count is greater than zero:** you have two options, and only two.

1. **Go back and finish them.** This is the default. Do not report an incomplete task when finishing it is within reach. Continue working.
2. **If genuinely blocked**, report with a section titled exactly `UNFULFILLED` at the very top of your report, before any success narrative. List every unmet item, why, and what would unblock it. The founder reads the top of a report first, so the failures go there, not buried at the bottom.

**Never lead with what worked when something did not.**

---

## Phase 5: Decision evidence

When the task involves a **design, product, or strategic decision**, no decision may be recorded without evidence across these dimensions. Missing a dimension is stated, not skipped.

| Dimension | The question | Evidence form |
|---|---|---|
| **Competitor** | What do the incumbents actually do here, feature by feature? | Cited sources, dated. Never memory |
| **Market** | What does the segment expect as table stakes? | Cited |
| **Engagement** | What makes a real person act rather than bounce? | Cited behavioural or conversion evidence |
| **Trend** | What is current, and what is dated? | Cited, recent |
| **Our code** | What already exists? | File paths, lines |
| **Test plan** | How would we know if this is wrong? | The metric, the comparison, the threshold |

Where an A/B test would settle a question and cannot be run yet, say so and name the variant to test later. Do not present an untested opinion as a finding.

---

## Phase 6: Report format

Every report opens with one of these two blocks. No exceptions, no preamble before it.

```
ROAST GATE: PASSED
Requirements: N. Met: N. Partial: 0. Not met: 0.
Adversarial findings: 0 unresolved.
Ledger: docs/roast/<slug>-<date>.md
```

```
UNFULFILLED
1. <requirement> - NOT MET - <why> - <what would unblock it>
2. <requirement> - PARTIAL - <what remains>
Adversarial findings unresolved: <list>
Ledger: docs/roast/<slug>-<date>.md
```

Then the substance of the report.

---

## The standard

You are not writing to look competent. You are writing so the founder can trust the report without re-verifying it himself. A report that admits two failures and proves six successes is worth more than one that implies eight and delivers six, because the first one can be acted on and the second one cannot.

Roast yourself harder than he would. That is the whole job.
