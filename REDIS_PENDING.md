# Redis: Pending

Part D (Docker basics), then Part 0 (R0). Topic numbers refer to `REDIS_STUDY_GUIDE.md`.

## Part D: Docker basics

- [ ] Read `D.1`–`D.7`
- [x] Install Docker Engine and set it up to run without sudo (`D.2`)
- [ ] `docker run hello-world` prints "Hello from Docker!"
- [ ] Start Redis with `docker run`, check it with `docker ps`, and get `PONG` from `redis-cli` (`D.3`)
- [ ] Stop and remove the container (`D.3`)

**D1. What's the difference between an image and a container?**

Answer: Docker Container - Its a single bundle where we keep our application along with their dependency.

Docker Image - It's an executable file which contains the instructions to build a docker container.

**D2. What does `-p 6379:6379` do?**

Answer:Port Binding - when we map out host machines port with the container port that process is known as port binding 
     
          Command - docker run -p8080:3306 IMAGE_NAME


## Part 0: To do

- [ ] Read "The whole thing in plain English" and Part 0 (`0.1`–`0.7`)
- [ ] Try the `redis-cli` commands in `0.4`
- [ ] Look at `server/src/lib/cache.ts` and `server/src/nav/schemeStats.ts` to see cache-aside today (`0.1`, `0.2`)
- [ ] Answer the questions below

## Questions

Rough answers are fine. Answer in English, Hindi or Hinglish.

**1. Why is it fine to lose the cache, but not the `transactions` collection?**

Answer:

**2. Why is `INCR` safe with two requests at once, while "read, add 1, write" in our code isn't?**

Answer:

**3. If Redis is down, what should `/api/dashboard` do?**

Answer:

**4. Hisaab already keeps its cache and counters in Mongo. What does Redis actually add?**

Answer:

## Next

Tell Claude when this is done. We'll go through your answers, then start R1. R1 needs approval for `ioredis`.
