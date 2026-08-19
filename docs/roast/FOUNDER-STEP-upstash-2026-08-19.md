# FOUNDER STEP: configure Upstash so the rate limits are live

Status: **launch blocker.** Without these two variables, production either refuses
paying customers or leaves billable endpoints unthrottled. Nothing else in this
document matters more than getting them set before the first real traffic.

Every claim below carries its source. Where I could not find a primary source, it
says UNSOURCED rather than guessing.

---

## 1. Create the database

**Page:** <https://console.upstash.com> then the **Redis** tab, and
**`+ Create Database`** in the upper right.
(Source: <https://upstash.com/docs/redis/overall/getstarted>, fetched 19 August 2026.)

The dialog asks for three things, in its own words:

| Field | What to enter |
|---|---|
| **Database Name** | `eventlinqs-prod` |
| **Primary Region** | The region closest to your writes. Upstash's guidance is *"Select the region closest to your write operations."* |
| **Read Regions** | Leave empty. Every read here is a rate-limit counter written and read in the same request, so a read replica adds cost and no benefit. |

**Which region.** Your deployment runs in Sydney: the staging response header reads
`X-Vercel-Id: syd1::syd1::…`, so the functions that will call Upstash execute in
`syd1`. Pick the Sydney / `ap-southeast-2` option if the dropdown offers it, and
otherwise the nearest Australian or Asia-Pacific region.

> **UNSOURCED:** I could not find an Upstash page that lists the available regions,
> so I am not asserting that a Sydney region exists. The dropdown in the dialog is
> the authority. Do not pick a US or EU region: every rate-limited request pays that
> round trip, and checkout is one of them.

**Plan.** The free tier is **256 MB, 500K commands per month, 10 GB bandwidth**
(source: <https://upstash.com/docs/redis/overall/pricing>, fetched 19 August 2026).

Read the next paragraph before choosing free, because it is a security question and
not only a cost one.

> **The 500K monthly ceiling is itself an attack surface, and the code says so.**
> Each rate-limited request spends one or two commands (an `INCR`, plus an `EXPIRE`
> on the first hit of each window), so 500K a month is roughly 16,000 rate-limited
> requests a day. When a quota is exhausted Upstash returns **errors**, and
> `src/lib/redis/rate-limit.ts:138` degrades on an error to a per-instance in-memory
> window. Its own comment names the attack: *"Upstash returns errors when a plan's
> request quota is exhausted, and the cheapest way to exhaust it is to hammer the
> very endpoints these policies protect."* That degradation is bounded rather than
> unlimited, so this is not a hole, but a paid plan removes the lever entirely. My
> recommendation is the cheapest paid tier before you advertise anywhere.

## 2. Copy the two credentials

In the database's page, open the **Connect** section and select the **REST** tab.
Upstash's own docs describe copying *"the tokens by clicking the copy button next to
`UPSTASH_REDIS_REST_TOKEN`"* (source:
<https://upstash.com/docs/redis/features/restapi>, fetched 19 August 2026). The URL
sits beside it as `UPSTASH_REDIS_REST_URL`.

Those two names are exactly what the code reads, verified in the source rather than
assumed: `src/lib/redis/client.ts:115-116`.

```
UPSTASH_REDIS_REST_URL     https://<something>.upstash.io
UPSTASH_REDIS_REST_TOKEN   <a long token>
```

## 3. Where they go in Vercel, and for which environments

Vercel dashboard, the **eventlinqs** project, **Settings → Environment Variables**.

Add each of the two variables **twice**, or once with two environments ticked:

| Variable | Environments to tick | Why |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | **Production** and **Preview** | Production is the launch requirement. Preview matters too, because a preview build is where you verify the limits before trusting production. |
| `UPSTASH_REDIS_REST_TOKEN` | **Production** and **Preview** | Same. |

**Do NOT tick Development.** Development variables are pulled into `.env` by
`vercel env pull` and used by `vercel dev`. Local runs are meant to have no Upstash:
`rate-limit.ts:114` deliberately allows everything when the config is missing and
`NODE_ENV` is not production, because *"Local dev and unit tests have no Upstash and
are not a threat surface."* Giving local runs the production Redis would put local
traffic into the same counters as real buyers.

Both names are already declared in `src/lib/env/manifest.mjs` (lines 648 and 661), so
the env guards know about them. **Declaring is not setting** — that declaration is
why an unset variable is a silent condition rather than a build failure.

## 4. Does anything need a redeploy? Yes.

Vercel's own wording, quoted:

> *"Any change you make to environment variables are not applied to previous
> deployments, they only apply to new deployments."*
> (<https://vercel.com/docs/environment-variables>, fetched 19 August 2026.)

And for the Production target specifically:

> *"When selected, the Environment Variable will be applied to your next Production
> Deployment."*

So setting the variables changes **nothing** until you deploy again. Concretely:

1. Set both variables for Production and Preview.
2. **Redeploy production.** Either push a commit to the production branch, or use
   Redeploy on the latest production deployment in the dashboard.
3. Only after that deployment is live are the limits in force.

## 5. Is there a window where the limits are partly configured?

**Yes, and it is worth understanding because the two half-states behave very
differently.** From `src/lib/redis/rate-limit.ts`:

| State | What happens |
|---|---|
| Neither variable set (today) | `getRedisClient()` returns null. In **production**, the 14 `failClosed` policies return **429 to everybody**: checkout, signup, login, password reset. The 14 `failOpen` policies allow everything. |
| **Only ONE of the two set** | Identical to neither being set. `client.ts:118` requires **both** (`if (!url \|\| !token)`), so a half-configured deploy is not half-protected, it is unconfigured. This is the trap: it looks configured in the dashboard. |
| Both set, deployed | Counters live in Redis. Verified below. |
| Both set, Upstash erroring | Degrades to a per-instance in-memory window for **every** policy. Bounded, not unlimited. |

**So the window is the deploy, not the dashboard.** Because both variables are read
per request and neither is baked into the build, there is no partial state between
them once a deployment picks them up. The only partial state you can create is
setting one and not the other, and that reads as fully unconfigured.

**Order that avoids any customer-facing gap:** production is currently 429-ing
nothing, because the variables have never been set and `failClosed` only blocks when
the config is missing **and** `NODE_ENV === 'production'`. If production is already
live and serving, setting the variables and redeploying moves it from
"unlimited on 14 policies" to "limited on all of them", with no window in which it is
worse than now.

## 6. How to verify the limits are LIVE rather than failing closed

This is the important half, because "the variables are present" and "the limits work"
are different claims. The recipe below was **run and measured**, not written from
theory.

### The measurement, on a local server pointed at the repo's Upstash stub

`newsletter-subscribe` is 5 requests per 600 seconds and is public, so it is the
cheapest honest probe:

```
request 1 -> HTTP 200  {"ok":true}
request 2 -> HTTP 200  {"ok":true}
request 3 -> HTTP 200  {"ok":true}
request 4 -> HTTP 200  {"ok":true}
request 5 -> HTTP 200  {"ok":true}
request 6 -> HTTP 429  {"ok":false,"error":"rate_limited"}
request 7 -> HTTP 429  {"ok":false,"error":"rate_limited"}
```

Exactly at limit + 1. That is a limiter that is counting.

### The negative control, which is what makes the above mean anything

The same seven requests against the same server with **no** Upstash configured:

```
request 1..7 -> HTTP 200  {"ok":true}     all seven allowed
```

So the probe can distinguish a live limiter from an absent one. Without this control,
"I got a 429" could have been anything.

### Run it against your preview after you deploy

```bash
for i in $(seq 1 7); do
  curl -s -o /dev/null -w "request $i -> HTTP %{http_code}\n" \
    -X POST https://<your-preview-url>/api/newsletter/subscribe \
    -H 'content-type: application/json' \
    -d '{"email":"limit-probe@resend.dev","source":"city","city":"melbourne"}'
done
```

**Expected:** five `200`s then `429`. If you get seven `200`s, the deployment does not
have the variables. If you get a `429` on the FIRST request, the variables are absent
**and** the deployment is production (the fail-closed branch), which is the state to
avoid.

Two notes on that probe. The email address is a Resend sink so it costs nothing and
reaches nobody. And the counter is keyed on the caller's IP
(`rate-limit.ts` `clientIp`), so a second run from the same machine within ten minutes
will start already-limited: change the window or wait it out rather than concluding
it is broken.

### Then verify the money path specifically

`checkout-reserve` is 20 per 60 seconds per IP and is the one that matters most. It
is a server action rather than a plain endpoint, so the honest check is to open an
event and click through to checkout once, confirming a normal purchase still works.
A 429 there would be a limit set too low, not a success.

## 7. The short version

1. <https://console.upstash.com> → Redis → `+ Create Database`, name it, primary
   region Sydney/`ap-southeast-2` if offered, no read regions.
2. Consider the cheapest paid tier rather than free: the 500K monthly command
   ceiling is an attack lever, by the code's own account.
3. Connect → REST tab → copy `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN`.
4. Vercel → project → Settings → Environment Variables → add both for
   **Production and Preview**. Not Development.
5. **Redeploy.** Nothing takes effect until a new deployment.
6. Run the seven-request probe against the preview. Five `200`s then `429`.
