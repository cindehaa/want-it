# Brief L — app, pooling engine, Dial negotiation (≈75%)

Owner: Cindy's Claude Code session. Read `SPEC.md`. Own everything except the teammate paths (`lib/keewano/**`, `scripts/keewano/**`, `data/benchmark.json`, `demo/**`). Sole owner of `lib/contracts.ts`; announce changes in `WIP/LOG.md`.

## Order of work (update WIP/GRAPH.md rows)
- **L0 (2:10)** `create-next-app` (TS, Tailwind, App Router, pnpm) → deps: `better-sqlite3 zod leaflet react-leaflet recharts @anthropic-ai/sdk`. Write `lib/contracts.ts` (SPEC §5), `lib/keewano/index.ts` stub (`recordEvent`, `getDemandEvidence` → `unavailable`), `data/benchmark.json` stub, `.env.example` (`DIAL_API_KEY, DIAL_FROM_NUMBER, CERTLY_PHONE, VANTLY_PHONE, ANTHROPIC_API_KEY, KEEWANO_EVENT_KEY, KEEWANO_PAT, DEMO_MODE`). Commit + push to main. Post in LOG.
- **L1 (2:30)** SQLite schema; `lib/clock.ts` (`now()` = real + offset); `lib/seed.ts` (14 simulated SF/Bay startups incl. 1 wrong category, 1 deadline before window; mix of max prices); `lib/pool/` membership + exclusions (SPEC §4).
- **L2 (2:40)** Storefront form + `POST /api/orders` (idempotent) + order page with status timeline + cancel.
- **L3 (2:45)** `/pool`: Leaflet map, Recharts demand/price curve, exclusions list. **→ V0: commit, tag `v0`.**
- **L4 (2:55)** `lib/dial/`: create call (REST, Bearer), poll call until `transcriptTurns`; `lib/dial/prompt.ts` builds instruction from pool facts (+ evidence, + prior quotes). Max 180s calls. Store call; failures → `failed`.
- **L5 (3:05)** `lib/quote/extract.ts` (Claude `claude-sonnet-5-5`, structured JSON → `Quote`, keep evidence snippet; null for anything not stated). `lib/settle/` SPEC §4 single pass. Simulated capture.
- **L6 (3:10)** Call panel with transcript, quote cards, time-saved counter from `data/benchmark.json`, demo clock controls.
- **X1 (3:15)** Real call with T as Certly. Save for `recorded_replay`. Merge `teammate` branch. **→ V1: tag `v1`.**
- **L7 (3:30)** Evidence card + evidence numbers in call instruction; call `recordEvent` from order/cancel routes.
- **L8 (3:40)** Vantly call citing Certly's quote. Cut if late. **→ V2: tag `v2`.**

## Rules
Deterministic code owns money/state; AI only extracts quotes. Never fabricate a call, quote, or Keewano result; label simulated/synthetic/replay/cached everywhere. Secrets server-side only. Run SPEC §9 acceptance checks before freeze.
