# WIP log (append-only, newest at bottom)

Format: `HH:MM [L|T] message`

- 14:05 [L] Spec locked (SPEC.md). Graph in WIP/GRAPH.md. Briefs in WIP/briefs/. L0 scaffold in progress — T start T1 (accounts) now; branch for T2 after L0 lands.
- 14:04 [L] L0 done: Next.js scaffold, lib/contracts.ts, lib/db, lib/clock, lib/pool, lib/settle, lib/keewano stub, data/benchmark.json stub, .env.example. T: branch `teammate` from main now.
- 14:05 [L] Parallel Sonnet agents running: buyer flow+APIs (L1/L2), pool dashboard (L3/L6), Dial+quote extraction (L4/L5). Merge target ~2:45.
- 14:07 [L] TEAMMATE.md now has a copy-paste agent prompt at the top. T: clone, do T1 accounts, paste the prompt.
- 14:09 [L] CHANGE: vendors are Dial AI agents (number B inboundInstruction per vendor), no human on phone. T1 Dial step updated: buy number B, send Cindy API key + number A id + number B id/E.164. Ask Dial staff for credits.
- 14:10 [L] Merged L1/L2: storefront, order page, order/pool/settle/demo APIs, 14-buyer seed. Waiting on dashboard (L3/L6) + Dial (L4/L5).
- 14:15 [L] V0 DONE (tag v0): storefront + order page + /pool dashboard (map, curve, time-saved, evidence card, negotiation panel) on real API. L6 UI built; waiting on Dial engine (L4/L5) + keys.
- 14:16 [L] Merged L4/L5: Dial engine (persona PATCH on number B, call A→B, poll, Claude quote extraction, replay/record). GET /api/pool now advances active calls. BLOCKED on .env.local Dial keys for X1 (first real call).
- 14:23 [T] Teammate started T2-T5 on branch teammate. Friend handles T1/accounts and keys. Keewano keys are currently missing locally; building documented ingestion and MCP query with truthful fallbacks. Only teammate-owned code paths will change.
- 14:26 [L] Acceptance script merged (scripts/acceptance.ts): 142/142 pass. Settle now requires separateAccountsConfirmed===true; over-max cancel releases hold (holdAmountCents=0). Run: BASE_URL=http://localhost:3000 ALLOW_DEMO_DB=1 DB_PATH=data/want-it.db pnpm tsx scripts/acceptance.ts (resets demo DB).

- 14:34 [T] Teammate branch pushed; integration tests pass and teammate paths pass lint/typecheck. Full pnpm lint now fails in lead-owned scripts/acceptance.ts: no-explicit-any at 71, 73, 81, 502 and prefer-const at 481. Lead should fix these before full build/PR verification. Keewano keys still missing locally. Benchmark remains estimates per user direction; no vendor form submitted.
