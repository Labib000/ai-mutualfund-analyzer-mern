#!/usr/bin/env bash
# Runs one k6 scenario in Docker against a local server, then saves the
# server's own metrics next to k6's results.
#
#   npm run load -- dashboard
#   RATE=50 DURATION=2m npm run load -- mixed
#
# Needs: Docker running, the server up (npm run load:server), load data seeded
# (npm run db:seed:load) and CRON_SECRET set in .env (for /internal/metrics).
set -euo pipefail

scenario="${1:-}"
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"

if [[ -z "$scenario" || ! -f "$here/scenarios/$scenario.js" ]]; then
    echo "Usage: npm run load -- <scenario>" >&2
    echo "Scenarios: $(cd "$here/scenarios" && ls *.js | sed 's/\.js$//' | tr '\n' ' ')" >&2
    exit 1
fi

if [[ ! -f "$here/data/seed.json" ]]; then
    echo "No load data yet: run npm run db:seed:load first." >&2
    exit 1
fi

base_url="${BASE_URL:-http://localhost:3000}"
secret="${CRON_SECRET:-$(grep -E '^CRON_SECRET=' "$root/.env" 2>/dev/null | cut -d= -f2- || true)}"
mkdir -p "$here/results"

server_metrics() {
    [[ -n "$secret" ]] || return 0
    curl -fsS "$@" -H "X-Cron-Secret: $secret" "$base_url/internal/metrics${path:-}"
}

if ! curl -fsS "$base_url/api/health" >/dev/null; then
    echo "The server isn't answering at $base_url. Start it with npm run load:server." >&2
    exit 1
fi

if [[ -n "$secret" ]]; then
    path=/reset server_metrics -X POST >/dev/null
else
    echo "CRON_SECRET isn't set: skipping the server-side metrics." >&2
fi

# With Prometheus up (npm run grafana:up), k6 also pushes its metrics there live.
k6_output=()
prometheus_url="${PROMETHEUS_URL:-http://localhost:9090}"
if curl -fsS "$prometheus_url/-/ready" >/dev/null 2>&1; then
    k6_output=(-o experimental-prometheus-rw --tag "testid=$scenario-$(date +%H%M%S)")
    echo "Sending k6 metrics to Prometheus: watch http://localhost:3001"
fi

# Inside the container, "localhost" is the container itself: reach this machine
# as host.docker.internal (built into Docker Desktop, added here for Docker Engine).
in_docker() { echo "${1/\/\/localhost/\/\/host.docker.internal}"; }

docker run --rm -i \
    --add-host=host.docker.internal:host-gateway \
    --user "$(id -u):$(id -g)" \
    -v "$here:/load" \
    -e BASE_URL="$(in_docker "$base_url")" \
    -e ORIGIN -e RATE -e DURATION -e VUS -e MAX_VUS -e P95 \
    -e K6_PROMETHEUS_RW_SERVER_URL="$(in_docker "$prometheus_url")/api/v1/write" \
    -e K6_PROMETHEUS_RW_TREND_STATS="p(50),p(95),p(99),max" \
    grafana/k6:1.0.0 run "${k6_output[@]}" "/load/scenarios/$scenario.js" || status=$?

if [[ -n "$secret" ]]; then
    server_metrics > "$here/results/$scenario-server.json"
    echo
    echo "Saved server/load/results/$scenario.json (k6) and $scenario-server.json (server)."
fi

exit "${status:-0}"
