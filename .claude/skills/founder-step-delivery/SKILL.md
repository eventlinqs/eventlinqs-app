---
name: founder-step-delivery
description: How to hand Lawal any manual step, runbook, or setup instruction. Use whenever producing steps Lawal will execute by hand across tools (Vercel, Stripe, Supabase, Upstash, terminal, Claude Code). Removes ambiguity so steps are followable click by click with zero guesswork.
---

# Founder Step Delivery Standard

## Purpose

Lawal runs every step manually across many tools. Ambiguity costs time and causes mistakes. Every instruction must be executable by hand with zero guesswork.

## The contract: every step states all four

1. **PLACE.** Which app or tool the step happens in. For example: Vercel, the Stripe test dashboard, the Claude Code window, PowerShell in the repo.
2. **LINK.** The exact URL or navigation path to the screen. For example: https://vercel.com, then project eventlinqs-app, then Settings, then Environment Variables.
3. **ACTION.** The exact field, button, or command, and what to type or paste. Name the box, name the button, give the literal value or command.
4. **SUCCESS.** What Lawal should see when the step worked. The confirmation message, the row that appears, the status that turns green.

## Formatting rules

- Break work into labelled steps: A, B, C, D, E. One action per step.
- Never bundle two tools into one step.
- Put variable names, paths, and commands in code formatting.
- If a screen might differ from the description, end with: screenshot it and I will tell you exactly where to click.
- No dashes in any message to Lawal. Use commas, colons, full stops, or reword. This rule already applies platform wide.

## Template for a single step

**[Letter]. [One line goal]. Where: [PLACE].**
[LINK or navigation path.]
[ACTION: the field, button, or command, and the literal value.]
You should see: [SUCCESS state.]

## Worked example

**B. Add the Stripe test secret key. Where: Vercel.**
Open https://vercel.com, project eventlinqs-app, Settings, Environment Variables.
Click Add Environment Variable. Key: `STRIPE_SECRET_KEY`. Value: your `sk_test_` key from https://dashboard.stripe.com/test/apikeys. Tick Preview only. Save.
You should see: a new `STRIPE_SECRET_KEY` row showing the Preview environment.

## Anti patterns, never do these

- "Set up the environment variables." No place, no names, no success state.
- "Configure Stripe." No link, no field.
- "Add the keys to your host." Which host, which screen, which keys.
- Mixing two tools in one step so Lawal has to switch context mid step.
