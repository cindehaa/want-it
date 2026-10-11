# Brief T — Keewano demand evidence, benchmark, demo script

## ▶ How to start (human)
1. `git clone https://github.com/cindehaa/want-it && cd want-it && pnpm install`
2. Do **T1 (accounts)** below yourself right away — it needs a browser, email OTP and phone verification.
3. Open Claude Code in the repo and paste the prompt below.

## ▶ Prompt to paste into your Claude Code agent
```
You are the Teammate (owner "T") on the want-it hackathon project. Hard deadlines (PT):
your branch pushed by 3:15 PM, freeze 3:45, recording 4:00. Check the clock with `date` first.

1. Read, in order: SPEC.md, WIP/briefs/TEAMMATE.md (your brief — follow it exactly),
   WIP/GRAPH.md (protocol + your rows T2–T5), WIP/LOG.md, lib/contracts.ts
   (DemandEvent, DemandEvidence, Benchmark), lib/keewano/index.ts (stub you implement;
   do not change the exported function signatures).
2. `git switch -c teammate`. Edit ONLY: lib/keewano/**, scripts/keewano/**,
   data/benchmark.json, demo/**. Never edit lib/contracts.ts or anything else — if you
   need a contract change, append a line to WIP/LOG.md and keep going.
3. Keys come from .env.local (KEEWANO_EVENT_KEY, KEEWANO_PAT). Never commit keys.
   If keys aren't there yet, build against the docs and ask me (the human) for them.
4. Work tasks in this order: T2 (event types + synthetic 90-day backfill — must be
   ingested by 2:45 because Keewano has ~5 min ingest→query latency), T4 (benchmark.json),
   T3 (live query → getDemandEvidence with cached/unavailable fallbacks), T5 (demo/SCRIPT.md).
5. Once at start: `git worktree add ../want-it-main main` (a second checkout of main used
   ONLY for WIP/ status edits). After each task: commit on `teammate` and push the branch;
   then in ../want-it-main: `git pull --rebase`, update your row's Status in WIP/GRAPH.md,
   append a timestamped line to WIP/LOG.md, commit `wip: T<n> <status>`, `git push`.
6. Never fabricate Keewano results. Label synthetic history as synthetic. Verify with
   `pnpm tsx scripts/keewano/check.ts` and paste its output into the handoff.
7. Finish with the handoff in WIP/LOG.md exactly as the "Handoff" section of the brief says.
```

Read `SPEC.md` first (5 min). Hard deadline: everything merged by **3:15 PM PT**; freeze 3:45; recording 4:00.

**Current repo state (2:05 PM):** L0 is done on `main` — Next.js app, `lib/contracts.ts`, `lib/db`, `lib/pool`, `lib/settle`, and the stub `lib/keewano/index.ts` (`recordEvent(event: DemandEvent)` and `getDemandEvidence(category): Promise<DemandEvidence>`, both must never throw). Lead's agents are building the UI, order APIs and Dial calls in parallel; the order routes already call `recordEvent` on `order_placed`, `max_price_stated` and `order_canceled`.

## Why this exists
Our product negotiates group prices for startups. The vendor only agrees if the pooled buyers are **new customers it's currently losing**. Keewano is where we prove that: a live query over demand history ("how many startups wanted SOC 2 software in 90 days, how many abandoned over price, what max price would they accept?"). That number goes into the AI's phone-call script and onto the screen. Keewano's prize requires the query to be **load-bearing** (it changes what the app does) and run **live** in the demo.

## Your ownership (edit ONLY these paths)
- `lib/keewano/**`, `scripts/keewano/**`, `data/benchmark.json`, `demo/**`
- Read anything. **Never edit** `lib/contracts.ts` or other paths — if you need a contract change, post it in `WIP/LOG.md` and Lead makes it.
- Work on branch `teammate` (`git switch -c teammate` after L0 lands). Push your branch; Lead merges. WIP/ status edits go straight to `main` (see `WIP/GRAPH.md` protocol).

## Tasks (update your rows in WIP/GRAPH.md as you go)

**T1 — accounts (start NOW, by 2:15)**
1. Keewano: sign up at keewano.com, create project, in the in-app chat (bottom-left) send `#SpeedHacks` (unlocks MCP + unlimited events). Settings → Project → API Keys → event key. Settings → Personal → Security → PAT (`kwpat-…`).
2. Dial: `npm i -g @getdial/cli` (Node 22+), `dial auth login <email>` → `verify-otp`; verify your phone number; get API key (`sk_live_…`). Ask Dial staff for a SpeedHacks coupon/credits.
3. Anthropic API key (for quote extraction).
4. Send keys to Cindy out-of-band (DM). Never commit keys. Post `keys ready` in `WIP/LOG.md`.

**T2 — event types + synthetic history (by 2:45 — Keewano has ~5 min ingest→query latency)**
- Ingest: `POST https://api.keewano.com/event/ingress/v1/json/in`, header `k-token: <event key>`. Body `{dataSessionId, batch, customEventsHash, installId:<uuid>, events:[{eventTypeId, dataType, timestamp, data}]}`. Register custom types (ids ≥2000) once via `POST https://api.keewano.com/event/ingress/v1/json/custom`. Swagger: `https://api.keewano.com/event/ingress/v1/json/swagger`. Docs: `docs.keewano.com/getting-started/speedhacks-quickstart.md`. SDK `@keewano/node-sdk` if easier.
- Each event carries **one** value (string ≤256 / uint / bool / price_usd_cent / timestamp). Model one `installId` per synthetic startup. Suggested types: `soc2_interest` (string category), `quote_requested`, `checkout_abandoned_price` (price_usd_cent they were shown), `max_price_stated` (price_usd_cent), `order_placed` (uint seats), `order_canceled`.
- `scripts/keewano/backfill.ts`: ~60 synthetic startups over the past 90 days with backdated timestamps. Make ~35% abandon over price, with stated max prices clustered below list ($30/seat list → maxes $18–$26). **Label synthetic** (e.g. a `synthetic` event or note in summary).
- Implement `recordEvent()` in `lib/keewano/index.ts` (signature fixed in the stub) so live orders/cancels also stream in. Fire-and-forget; never throw into the caller.

**T3 — live query → `getDemandEvidence()` (by 3:10)**
- Query via Keewano MCP (`https://api.keewano.com/mcp`, header `k-token: <PAT>`) — try its SQL tool (single events table, no JOINs/CTEs). Use `@modelcontextprotocol/sdk` client from Node, or a REST endpoint if docs show one. Find out which works first; post the answer in LOG.
- Return the `DemandEvidence` shape from `lib/contracts.ts`: `interestedBuyers90d`, `abandonedOverPrice90d`, `medianMaxPricePerSeatCents`, `queryText` (the actual SQL/question), `ranAt`, `source`.
- Fallbacks: cache last good result to `data/keewano-cache.json` → return `source:'keewano_cached'` (UI shows age). If nothing → `source:'unavailable'`. Timeout 8s.
- Add `scripts/keewano/check.ts` that prints the evidence so Lead can verify.

**T4 — `data/benchmark.json` (by 2:40)** — shape = `Benchmark` in contracts.
- Steps: find/compare vendors, contact sales + book call, sales call + quote, negotiate + follow-up, checkout.
- **Observed:** time yourself filling one real SOC 2 vendor's "contact sales"/demo form (do NOT submit) + note their stated response time. Tag `observed`.
- Others: honest estimates, tag `estimate`, one-line `note` each with the assumption. No invented statistics or citations.

**T5 — demo (by 3:40)** — `demo/SCRIPT.md` from SPEC §11, timed ≤ 4:45. You answer the phone as **"Certly" sales rep** (test vendor, $30/seat list; willing: $24 at 10+ seats, $20 at 25+, separate accounts OK, offer expires in 7 days). Cindy answers as **"Vantly"**. Rehearse once.

## Handoff (post in WIP/LOG.md when you push)
Files changed · how Keewano is queried (exact method) · `pnpm tsx scripts/keewano/check.ts` output · what is live vs cached vs synthetic · unresolved failures.
