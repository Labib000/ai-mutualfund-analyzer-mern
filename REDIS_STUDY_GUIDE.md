# Redis Study Guide

This guide covers what we're building in Phase 4.4 (Redis), why we're building it, and what you need to learn to understand all of it. It assumes you know the Hisaab code but have never used Redis.

The build plan is in [PLAN.md](PLAN.md), and your checklist is in [REDIS_PENDING.md](REDIS_PENDING.md). This file is for learning.

---

## How to use this guide

It works the same way as the RAG guide:

1. **Study** the milestone's topics here.
2. **Build** it together. I write the code and explain it, and you ask questions.
3. **Explain it back** using the "Check yourself" questions.
4. **Move on** only when you're ready.

**Must know** topics come up in backend interviews all the time. **Good to know** topics only need a rough idea.

---

## The whole thing in plain English

Every time you open the dashboard, the server works out your portfolio's value history: hundreds of NAVs times units, week by week. That's slow, so we already save the result and reuse it. That saved copy is a **cache**. Today it lives in a MongoDB collection called `cache`.

MongoDB keeps data on disk and is built to store data safely. **Redis** keeps data in memory and is built to be fast. Reading a key from Redis usually takes well under a millisecond inside the server. That's why Redis is the usual home for things that are:

- **temporary:** a cache, which can be rebuilt if lost;
- **hit very often:** rate-limit counters, which change on every login attempt;
- **about coordination:** "is someone already running the NAV import?" (a lock).

Hisaab already does all three with Mongo, behind four small files:

```
server/src/lib/cache.ts           cacheGet / cachePut      -> R2
server/src/lib/rateLimitStore.ts  login/reset/AI limits    -> R3
server/src/lib/jobLock.ts         cron overlap guard       -> R4
server/src/lib/session.ts         login sessions           -> R5 (maybe)
```

We'll add a Redis version behind each one. The rest of the app won't know which is in use.

```
request -> route -> cacheGet("portfolio-history:<user>")
                        |
                REDIS_URL set?
                 yes -> Redis GET  (fast; if Redis errors -> fall back to Mongo)
                 no  -> Mongo findOne (as today)
```

### Where Redis runs

| Where | What | Why |
|---|---|---|
| Your laptop and CI | Docker, `redis:7-alpine` | Free and offline; throw it away and start fresh any time |
| Production | Upstash (or Redis Cloud) | Hostinger shared hosting can't run Redis, so we use a hosted one |
| Nowhere (`REDIS_URL` unset) | Mongo, as today | Nothing breaks if Redis isn't configured |

**Is a platform like Upstash needed?** Redis itself is free, open-source software you can run anywhere: Docker, a VPS, your laptop. You only need a hosted service when your host can't run it, and Hostinger shared hosting can't. Two good free options:

- **Redis Cloud:** run by Redis, the company behind Redis. Free 30 MB database.
- **Upstash:** a third-party "serverless Redis". Free tier, a Mumbai region, and you pay per request beyond that.

Both speak the standard Redis protocol, so our code is the same either way. Only `REDIS_URL` changes.

---

## Part D: Docker basics (before R0)

You only need enough Docker to run Redis on your laptop. That's about an hour. Skip anything not listed here.

### D.1 What Docker is: images and containers

_Must know._

- **What it is:** normally, to run Redis you install it on your machine, and it depends on your OS version, libraries and settings. Docker gives you a **sealed, ready-made box** with the program and everything it needs inside, and it runs the same everywhere.
  - An **image** is the box's blueprint, downloaded once (for example `redis:7-alpine`: Redis 7 on a tiny Linux called Alpine).
  - A **container** is one running copy of an image. You can start, stop and throw away containers. The image stays.
  - Analogy: the image is a recipe, and a container is a dish made from it. You can cook many dishes from one recipe.
- **Why we need it here:** the same Redis on your laptop, in GitHub Actions CI and on anyone else's machine, with nothing installed on your system and nothing to clean up.
- **Check yourself:**
  - What's the difference between an image and a container?
  - If you delete a container, is the image gone too?
- **Resources:** [Docker: What is a container?](https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-a-container/), [Docker: What is an image?](https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-an-image/)

### D.2 Installing Docker on Ubuntu

_Must know (just do it once)._

1. Follow [Install Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/), using the "Install using the apt repository" section.
2. Follow [Linux post-install: manage Docker as a non-root user](https://docs.docker.com/engine/install/linux-postinstall/), so you don't need `sudo`. Log out and back in afterwards.
3. Check it works:
   ```
   docker run hello-world
   ```
   You should see "Hello from Docker!".

You don't need Docker Desktop. Docker Engine is enough on Linux.

### D.3 The five commands you need

_Must know._

```
# Start Redis in the background (-d), name it "redis", open port 6379 (see D.4)
docker run -d --name redis -p 6379:6379 redis:7-alpine

# What's running?
docker ps

# What did it print? (useful when something fails)
docker logs redis

# Open redis-cli *inside* the container
docker exec -it redis redis-cli
#   127.0.0.1:6379> PING
#   PONG

# Stop it, then delete the container (the image stays downloaded)
docker stop redis
docker rm redis
```

The first `docker run` downloads the image, which takes a few seconds. Later runs start instantly. `docker start redis` restarts a stopped container without making a new one.

- **Check yourself:**
  - What does `-d` do? What happens without it?
  - What's the difference between `docker stop` and `docker rm`?

### D.4 Ports

_Must know._

- **What it is:** inside its box, Redis listens on port 6379. The box is sealed, so your app can't reach it until you open a door. `-p 6379:6379` means "port 6379 on my laptop → port 6379 in the container". The left number is your laptop's, the right one is the container's.
- **Why it matters:** once that's set, the Hisaab server reaches Redis at `redis://localhost:6379`, as if Redis were installed normally.
- **Check yourself:**
  - What would `-p 6380:6379` change, and what `REDIS_URL` would you use then?

### D.5 Containers forget: volumes, briefly

_Good to know._

- When you `docker rm` a container, everything stored inside it is gone. That's fine for a cache. It's exactly the "Redis can lose data" situation from `0.3`.
- A **volume** is a folder that survives the container. Databases you care about use one. We don't need one for Redis, and our Mongo is on Atlas, not in Docker.

### D.6 docker compose

_Must know._

- **What it is:** instead of typing a long `docker run` line, you describe the container in a file, `docker-compose.yml`, and start it with one command. We'll add this file in R1. It will look roughly like this:
  ```yaml
  services:
    redis:
      image: redis:7-alpine
      ports:
        - "6379:6379"
  ```
- **Commands:**
  ```
  docker compose up -d    # start everything in the file
  docker compose ps       # what's running
  docker compose down     # stop and remove it
  ```
- **Check yourself:**
  - Why is a file better than a `docker run` command you have to remember?

### D.7 What you don't need yet

Dockerfiles (building your own images), Docker Hub publishing, networks between containers, and Kubernetes. They matter if Hisaab ever moves off Hostinger to a VPS, and we can cover them then.

---

## Part 0: Before anything else (R0)

### 0.1 What a cache is, and cache-aside

_Must know._

- **What it is:** a fast copy of something slow to compute or fetch. In the **cache-aside** pattern, the app looks in the cache first. On a miss, it computes the value, stores it, and returns it.
- **Where it is in Hisaab:** `server/src/portfolio/portfolioPerformance.ts` and `server/src/nav/schemeStats.ts` already do exactly this with `cacheGet`/`cachePut`.
- **Check yourself:**
  - What's a cache hit, and what's a cache miss?
  - Why is it fine to lose the whole cache, but not to lose the `transactions` collection?

### 0.2 Cache invalidation: TTL and versioned keys

_Must know._

- **What it is:** a cache is wrong once the real data changes. Two fixes: let entries expire after a time (**TTL**), or put a **version** in the key, so changed data produces a new key and the old one is simply never read again.
- **Where it is in Hisaab:** the dashboard history key includes a hash of each fund's latest NAV date and transaction count. Scheme stats use `latestNavDate|historySyncedAt` as their version.
- **Check yourself:**
  - Why does a version in the key mean we never have to delete stale entries by hand?
  - What goes wrong if the TTL is too long? Too short?
- **Resources:** [Redis: EXPIRE](https://redis.io/docs/latest/commands/expire/)

### 0.3 What Redis is: an in-memory key-value store

_Must know._

- **What it is:** a server that holds keys and values in RAM. You talk to it with short commands (`SET`, `GET`, `INCR`, `DEL`) over a network connection, much like you talk to Mongo.
- **Key ideas:**
  - **Fast** because it's memory, not disk.
  - **Single-threaded command execution:** one command runs at a time, so a single command like `INCR` is atomic without any locks.
  - **Limited by RAM:** when memory is full, Redis either refuses writes or **evicts** keys, depending on its `maxmemory-policy` setting.
  - **Persistence is optional:** a restart can lose data, so treat Redis as a cache, not as the source of truth.
- **Check yourself:**
  - Why is Redis faster than Mongo for a simple `GET`?
  - Why don't we keep transactions or holdings in Redis?
- **Resources:** [Redis: Get started](https://redis.io/docs/latest/develop/), [Redis: Try Redis online](https://redis.io/try-free/)

### 0.4 Data types: strings, hashes, TTL

_Must know (strings and TTL). Good to know (the rest)._

- **Strings:** the basic type. We'll store each cache entry as JSON text, using `SET key value EX 3600` to set it and `GET key` to read it.
- **Counters:** `INCR key` adds 1 atomically and returns the new value. This is the core of the rate limiter.
- **Hashes, lists, sets, sorted sets:** other data types. We won't use them, but know they exist (a sorted set is the classic leaderboard).
- **Try it:** start Redis as in `D.3` (`docker run -d --name redis -p 6379:6379 redis:7-alpine`), open `docker exec -it redis redis-cli`, then type:
  ```
  SET greeting hello EX 10
  GET greeting
  TTL greeting
  INCR hits
  INCR hits
  ```
  Wait 10 seconds and run `GET greeting` again.
- **Check yourself:**
  - What does `TTL` return for a key with no expiry? For a key that doesn't exist?
  - Why is `INCR` safe when two requests hit it at the same moment, while a "read, add 1, write" in app code isn't?
- **Resources:** [Redis: Strings](https://redis.io/docs/latest/develop/data-types/strings/), [Redis: SET](https://redis.io/docs/latest/commands/set/)

### 0.5 The costs: network hop, failure, consistency

_Must know._

- **Network hop:** Upstash isn't on the same machine as Hostinger, so every call crosses the network (a few ms within Mumbai). That's still faster than recomputing the dashboard, but slower than you'd expect from "in-memory". R6 measures it.
- **Failure:** Redis can be down or slow. Our rule: a Redis error must never break a request. Log a warning and use Mongo instead. Short timeouts make this work.
- **Two sources of truth:** if Redis and Mongo disagree, Mongo wins. The cache only stores values we can rebuild.
- **Check yourself:**
  - What should happen to `/api/dashboard` if Redis is unreachable?
  - Why does the Redis client need a short connect timeout?

### 0.6 Hosted Redis for production

_Good to know._ (Running Redis locally is covered in Part D.)

- **What it is:** someone else runs the Redis server, and you get a URL. [Upstash: Get started](https://upstash.com/docs/redis/overall/getstarted) or [Redis Cloud](https://redis.io/try-free/). Both give you a `rediss://` URL. The extra `s` means TLS (encrypted).
- **We set this up at R6 or in Phase 6.** You don't need an account yet.
- **Check yourself:**
  - Why does production use `rediss://` while local Docker uses `redis://`?

### 0.7 What "scalability" actually means here

_Must know for interviews._

- **Vertical scaling:** a bigger server. **Horizontal scaling:** more servers behind a load balancer.
- **Why Redis matters for horizontal scaling:** with two app servers, anything kept in one server's memory (a counter, a lock) is invisible to the other. Shared state has to live outside the app, in Redis or a database. Hisaab already keeps it in Mongo, which is also shared, so Redis here is about **speed and the right tool for each job**, not correctness.
- **Honest scope:** Hisaab on Hostinger runs one app instance. We're building this to learn the patterns and measure them, not because the app is struggling.
- **Check yourself:**
  - Why would an in-memory `Map` rate limiter break with two servers?
  - Name two things in Hisaab that would still need work to run on five servers. (Hint: cron jobs, and the Atlas M0 connection limit.)

---

## Part 1: Connection (R1)

- **1.1 Clients and connection pools:** `ioredis` keeps one connection open and queues commands on it. Options we care about: `connectTimeout`, `maxRetriesPerRequest`, `lazyConnect`.
- **1.2 Config and secrets:** `REDIS_URL` is optional in the Zod config. It goes in `.env`, never in git.
- **1.3 Health checks:** `PING` → `PONG`.
- **Resources:** [ioredis on GitHub](https://github.com/redis/ioredis)

## Part 2: Cache (R2)

- **2.1 Interfaces and adapters:** one `CacheStore` shape, two versions (Mongo and Redis). Callers don't change. Interviewers call this the "ports and adapters" or "strategy" pattern.
- **2.2 Serialisation:** Redis stores strings, so values go through `JSON.stringify`/`JSON.parse`. Dates come back as strings.
- **2.3 Fallback:** catch errors, log them, use Mongo.

## Part 3: Rate limits (R3)

- **3.1 Fixed window vs sliding window vs token bucket.** We use a fixed window, as the Mongo store does today.
- **3.2 `MULTI`/`EXEC`:** runs `INCR` and `PEXPIRE` together, so a key can't be left without an expiry.
- **Resources:** [Redis: Transactions](https://redis.io/docs/latest/develop/interact/transactions/)

## Part 4: Job lock (R4)

- **4.1 `SET key owner NX PX ttl`:** "set only if it doesn't exist, expire in ttl ms". One atomic command takes the lock.
- **4.2 Safe release:** delete only if the value is still *our* owner id, using a tiny Lua script. Otherwise a slow run could delete someone else's lock.
- **Resources:** [Redis: Distributed locks](https://redis.io/docs/latest/develop/use/patterns/distributed-locks/)

## Part 5: Sessions (R5)

- **5.1 Trade-off:** sessions in Redis are faster, but a Redis flush logs everyone out, and "log out other devices" needs a per-user index. We decide here, and either way we write down why.

## Part 6: Measuring (R6)

- **6.1 Latency, p50 and p95:** time `/api/dashboard` with and without Redis. Report the median and the slow tail, not a single run.

---

## Glossary

- **Atomic:** happens all at once. Nothing else can run in the middle.
- **Cache hit / miss:** found in the cache / not found, so we compute it.
- **Container:** one running copy of a Docker image. You can start, stop and delete it.
- **Docker image:** the ready-made blueprint for a container, such as `redis:7-alpine`.
- **Port:** a numbered door a program listens on. Redis uses 6379. `-p 6379:6379` connects your laptop's door to the container's.
- **Eviction:** Redis removing keys to free memory.
- **Idempotent:** safe to run twice with the same result.
- **TLS:** encryption for network connections (`rediss://`).
- **TTL:** time to live, meaning how long until a key expires.
