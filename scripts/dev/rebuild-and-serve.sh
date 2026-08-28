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

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  # A killed build leaves a half-written .next that the next build cannot
  # unlink (EPERM on a directory), which reads as a permissions problem and
  # is not one. Start from nothing.
  rm -rf .next
  npm run build > .tmp-build.log 2>&1
  echo "build exit 0"
fi

nohup npx next start -p "$PORT" > .tmp-serve.log 2>&1 &
for i in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://localhost:${PORT}/" || true)
  [ "$code" = "200" ] && { echo "server up on ${PORT}"; exit 0; }
  sleep 1
done
echo "server did not come up; tail .tmp-serve.log" >&2
exit 1
