#!/usr/bin/env bash
# Stop the local server, build against .env.test, start it again.
# `next start` holds .next open on Windows, so a build over a live server dies
# with EPERM unlink .next/server/app/... and reads as a code error. Stop first.
set -eo pipefail
cd "$(dirname "$0")/../.."
export PATH="/c/node24/node-v24.19.0-win-x64:$PATH"
PORT="${PORT:-3311}"

powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -like '*next*start*-p*${PORT}*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force }" >/dev/null 2>&1 || true
sleep 1

set -a; . ./.env.test; set +a
export NEXT_PUBLIC_APP_URL="http://localhost:${PORT}"
# `next start` sets NODE_ENV=production, and order-access fails CLOSED there:
# with no secret it neither mints nor honours a guest link, so the refund and
# transfer controls correctly vanish and every guest journey reads as broken.
# A LOCAL-ONLY value, never a production one.
export ORDER_ACCESS_SECRET="${ORDER_ACCESS_SECRET:-local-journey-order-access-secret-32chars}"

# THE MAIL TRANSPORT. Signup will not complete without one: /api/auth/signup
# answers 502 when the confirmation email cannot be sent, which is correct (an
# account nobody can confirm is worse than no account) and which stops every
# journey at step one. The console transport prints the message and its links to
# the server log, which is where linkFromInbox() in the journey harness reads
# the confirmation link from. It refuses to run on a real deployment; see
# src/lib/email/send.ts.
export EMAIL_TRANSPORT="${EMAIL_TRANSPORT:-console}"

# THE RATE-LIMIT STORE, for the same reason and with the same shape as the line
# above. `next start` sets NODE_ENV=production, and checkRateLimit BLOCKS a
# failClosed policy whenever the store is missing in production. auth-signup and
# checkout-reserve are both failClosed, so with no store every journey dies at
# its first step with "a service we depend on is unavailable" or "Too many
# attempts", which is the limiter working correctly and is indistinguishable at
# the UI from a real limit or from broken code. It read as broken code for three
# sessions.
#
# The shim serves the two commands the limiter uses, in memory, on localhost, so
# the local run takes the SAME code path production takes rather than a bypass.
# It is started here rather than left to the operator because a step a human has
# to remember is a step that gets forgotten, and the failure it causes points at
# the wrong thing.
UPSTASH_SHIM_PORT="${UPSTASH_SHIM_PORT:-8079}"
if [ -z "${UPSTASH_REDIS_REST_URL:-}" ]; then
  if ! curl -s -o /dev/null --max-time 2 "http://127.0.0.1:${UPSTASH_SHIM_PORT}/get/_probe"; then
    nohup node scripts/dev/upstash-shim.mjs "$UPSTASH_SHIM_PORT" > .tmp-upstash.log 2>&1 &
    for _ in $(seq 1 20); do
      curl -s -o /dev/null --max-time 2 "http://127.0.0.1:${UPSTASH_SHIM_PORT}/get/_probe" && break
      sleep 0.5
    done
  fi
  export UPSTASH_REDIS_REST_URL="http://127.0.0.1:${UPSTASH_SHIM_PORT}"
  export UPSTASH_REDIS_REST_TOKEN="local"
  echo "rate-limit store: local shim on ${UPSTASH_SHIM_PORT}"
fi

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  # A killed build leaves a half-written .next that the next build cannot
  # unlink (EPERM on a directory), which reads as a permissions problem and
  # is not one. Start from nothing.
  #
  # AND THEN RETRY ONCE, because a clean start is not sufficient on this
  # machine. The worktree lives under OneDrive, which begins syncing files in
  # .next the moment they are written and holds handles on them. Next prunes
  # its own stale output mid-build, so that prune races the sync and dies with
  #
  #   ENOTEMPTY: directory not empty, rmdir '...\.next\server\app\...'
  #
  # on a directory this script had already deleted seconds earlier. It cost two
  # builds on 29 August, and both times it read as a code fault rather than as
  # a file-system race: the message names a directory, not a module.
  #
  # The retry is BOUNDED AT TWO and the second failure is reported rather than
  # swallowed, because an unbounded retry on a real compile error is an
  # infinite loop that looks like a slow build. The durable fix is to keep
  # .next out of OneDrive's sync scope, which is the founder's setting to
  # change, not this script's.
  for attempt in 1 2; do
    rm -rf .next
    sleep 1
    if npm run build > .tmp-build.log 2>&1; then
      echo "build exit 0"
      break
    fi
    if grep -qE "ENOTEMPTY|EPERM.*\.next" .tmp-build.log && [ "$attempt" = "1" ]; then
      echo "build hit the OneDrive .next rmdir race; retrying once" >&2
      continue
    fi
    echo "build FAILED; tail .tmp-build.log" >&2
    tail -12 .tmp-build.log >&2
    exit 1
  done
fi

nohup npx next start -p "$PORT" > .tmp-serve.log 2>&1 &
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://localhost:${PORT}/" || true)
  [ "$code" = "200" ] && { echo "server up on ${PORT}"; exit 0; }
  sleep 1
done
echo "server did not come up; tail .tmp-serve.log" >&2
exit 1
