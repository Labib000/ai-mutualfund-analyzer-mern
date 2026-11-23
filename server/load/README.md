# Load testing and metrics

How to measure Hisaab under load: k6 sends the traffic and reports what a client sees, and `/internal/metrics` reports what the server sees. Prometheus and Grafana show both live. This is milestone R6 of Phase 4.4 (see `PLAN.md`). Take the Mongo-only numbers **before** adding Redis, so the before-and-after comparison is fair.

## One-time setup

1. **Use a separate database.** In `.env`, point `MONGODB_URI` at its own database, e.g. `/hisaab_load` instead of `/hisaab`. The seed only adds and removes its own data (`@load.test` users and AMFI codes from 990001), but a separate database keeps your dev data out of the numbers.
2. **Set `CRON_SECRET`** in `.env`. The metrics endpoint uses it.
3. **Start Docker** (`sudo systemctl start docker`). k6, Prometheus and Grafana all run in containers, so nothing is installed in the project.

## Running a test

```bash
npm run db:seed:load              # 50 users × 10 funds × 3 years of monthly purchases
npm run load:server               # built server on :3000, logging at warn only
npm run load -- dashboard         # in a second terminal
```

Each run resets the server metrics, runs the scenario, then saves two files in `server/load/results/` (gitignored):

- `<scenario>.json`: k6's summary (client side);
- `<scenario>-server.json`: `/internal/metrics` at the end of the run (server side).

You can change the load with environment variables:

```bash
RATE=50 DURATION=2m npm run load -- mixed   # 50 requests a second for 2 minutes
P95=300 npm run load -- dashboard           # fail the run if p95 > 300 ms
npm run db:seed:load -- --users=200 --holdings=15 --years=5
```

| Scenario | What it shows |
|---|---|
| `health` | Baseline: Express plus one Mongo ping. The floor for every other route |
| `login` | argon2 is CPU-bound, so watch event-loop lag and CPU, not just latency |
| `dashboard` | The heaviest common page: valuation, value history, changes, insights |
| `holdings` | The portfolio list plus a fund page |
| `compare` | Three funds' full NAV history and ratios. The app allows 30 a minute per user, so keep `RATE × 2` below the number of users |
| `mixed` | A realistic mix. Raise `RATE` run by run to find one instance's limit |

**Cold vs warm cache:** run `npm run db:seed:load -- --clear-cache`, then the scenario (cold), then the same scenario again (warm).

## Watching live in Grafana

Prometheus and Grafana run in Docker (`server/load/docker-compose.yml`), and both listen on `127.0.0.1` only.

```bash
npm run grafana:up                # Prometheus on :9090, Grafana on :3001
npm run load:server               # terminal 1
npm run load -- mixed             # terminal 2: k6 also pushes to Prometheus when it's up
```

Open **http://localhost:3001**. There's no login, and the **Hisaab load test** dashboard opens as the home page, refreshing every 5 seconds:

| Section | Panels |
|---|---|
| Overview | Requests a second, API p95, 5xx rate, event-loop p99 |
| k6 | k6's requests a second, p95 and p99 per request name, failed rate and virtual users. Only filled while a test runs |
| Routes | Requests a second, p95 and p99 per route, responses by status |
| MongoDB | Queries per request (the N+1 check), Mongo time per request, top commands by total time, command p95 |
| Cache | Hit ratio and operations a second per key prefix |
| Node process | Event-loop lag, CPU, memory (RSS and heap), GC time, job durations |

How the data gets there:

- **The server:** Prometheus scrapes `GET /internal/metrics/prometheus` (`prom-client`) every 5 seconds, sending `Authorization: Bearer $CRON_SECRET`.
- **k6:** `run.sh` adds `-o experimental-prometheus-rw` when Prometheus answers, so k6 pushes its numbers through remote write.

The Prometheus metrics are never reset, because Prometheus works from rates over time. Use Grafana's time picker to look at one run. Prometheus keeps 7 days. `npm run grafana:down` stops both and keeps the data; `docker volume rm hisaab-load_prometheus-data hisaab-load_grafana-data` deletes it.

To explore further, open **Explore** in Grafana and try queries such as:

```promql
histogram_quantile(0.95, sum by (le, route) (rate(hisaab_http_request_duration_seconds_bucket[1m])))
topk(5, sum by (command, collection) (rate(hisaab_mongodb_command_duration_seconds_sum[1m])))
nodejs_eventloop_lag_p99_seconds
```

## Reading the server metrics (JSON)

```bash
curl -s -H "X-Cron-Secret: $CRON_SECRET" localhost:3000/internal/metrics | jq
curl -s -X POST -H "X-Cron-Secret: $CRON_SECRET" localhost:3000/internal/metrics/reset
```

| Field | Meaning |
|---|---|
| `routes.<route>` | Latency count, mean, p50, p95, p99 and max, plus status counts (`2xx`, `4xx`, `5xx`). Ids in paths become `:id` |
| `routes.<route>.dbQueriesPerRequest` | Mongo commands per request. A number that grows with the data size means an N+1 pattern |
| `routes.<route>.dbMsPerRequest` | Mongo time per request, summed over commands. Queries run in parallel are all counted, so this can be more than the request's own time |
| `db.<command collection>` | Each kind of Mongo command (e.g. `find transactions`) by total time, so the slowest queries come first |
| `cache.<prefix>` | Hits, misses, writes and hit ratio per cache key prefix (`portfolio-history`, `scheme-stats`, …) |
| `eventLoop` | Event-loop delay. When p99 rises, something is blocking the main thread (argon2, XIRR, fund stats) and every request waits |
| `process` | RSS and heap in MB, and CPU as a percentage of one core since the reset |
| `jobs` | Runs, failures, durations and last result of `nav-import` and `sips-generate` |
| `requests.perSecond` | Throughput since the reset |

Percentiles cover the last 5,000 samples of each series, and counts cover everything since the reset. Reset before each run.

## Notes

- **Open model:** the scenarios use k6's `constant-arrival-rate` executor. Requests keep arriving at `RATE` per second even when the server slows down, so slowness shows up as latency instead of quietly reducing the load ("coordinated omission").
- **Two formats, one source:** `/internal/metrics` (JSON, resettable, percentiles over the last 5,000 samples) and `/internal/metrics/prometheus` (histograms, never reset) are fed by the same events in `server/src/lib/metrics.ts`.
- **One instance:** the metrics live in the server process's memory and cover only that process. They reset when it restarts.
- **Atlas M0:** if `MONGODB_URI` points at Atlas, network round trips are part of every query. The `db` section shows how much.

## Results

Fill in after each run. Dashboard numbers are for the warm cache unless noted.

| Date | Scenario | Store | Rate (req/s) | p50 | p95 | p99 | Errors | DB queries / req | Cache hit ratio | Event-loop p99 |
|---|---|---|---|---|---|---|---|---|---|---|
| | dashboard (cold) | Mongo | | | | | | | | |
| | dashboard (warm) | Mongo | | | | | | | | |
| | mixed | Mongo | | | | | | | | |
| | login | Mongo | | | | | | | | |
