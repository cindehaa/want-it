# Certly flow verification

Verified on 2026-10-11 against a local production server on port 3103.
The source version is `2a5420c`; later changes in this PR only document the evidence.
The server used an isolated SQLite database under `/tmp/want-it-certly-flow-01a12cd6`.
Automatic negotiation, live dialing, and demand-event ingestion were disabled on the test server.
Quote extraction used the configured real API key and the stored real Certly transcript.

## Reproduced failures and fixes

| Failure | Result after the fix |
|---|---|
| The $21 quote required 96 seats, but two over-budget buyers left only 88 seats. | Settlement recomputes the volume supported by each vendor's assigned buyers and refuses unsupported tiers. |
| Expired quotes still became deals. | Settlement, buyer previews, charts, and rankings reject expired and unconfirmed offers. |
| Replaying a call restarted its seven-day expiry. | Extraction resolves relative deadlines against the original call date. |
| Replay subtracted its new start from the original end, producing negative minutes. | Recorded calls use transcript timing; live calls use real time rather than the demo clock. |
| Buyer cancellation left a hold amount in the stored order. | Cancellation sets the hold to zero. |
| Checkout accepted whitespace names, invalid dates, and orders after the window closed. | Input validation rejects invalid values; closed and settled pools reject new orders while preserving idempotent retries. |
| Settlement and reset could discard an active negotiation or extraction. | These actions return HTTP 409 until the run is stopped and the current call finishes. |
| Stopping a run during a refresh still started the next call. | The runner reads the current stop state after asynchronous work. |
| The UI used $28 list while checkout used $30, and it claimed every buyer paid less or had been charged. | The UI uses the checkout reference price and reports deals, cancellations, and simulated payments separately. |
| The offline acceptance script invoked real extraction and used outdated vendor assumptions. | Extraction requires an explicit opt-in; offline checks use the agreed reference list price. |

## Real transcript result

The stored call was recorded at `2026-10-11T22:03:25.569Z`.
Real extraction returned $21 per seat at 96 or more seats, separate accounts, no per-account fee, and an expiry of `2026-10-18T22:03:25.569Z`.
The renewal price remains a condition rather than another year-one tier.
The evidence contains the supplier's actual words.

The original 96-seat pool now declines the unsupported discount through the production settlement API.
Capped buyers cancel with zero holds, and uncapped buyers receive the reference list price.

For the successful checkout path, the test added a clearly named ten-seat verification buyer at a $24 cap to the separate test database.
That brought the initial pool to 106 seats.
After two over-budget buyers canceled, 11 orders covering 98 seats qualified for the supplier's $21 offer.
The verification buyer's final total is $210 for ten seats, with a labeled test redemption link.
Repeated settlement leaves the final orders unchanged.

## Checks and evidence

All 28 regression tests pass.
Full lint, TypeScript, and the optimized production build pass.
The offline production acceptance suite passes 136 checks with zero failures and two explicit skips.
The skipped recorded extraction was tested separately through the real API flow.
The skipped live-call check did not place a new phone call.
Buyer and marketplace browser checks found no console errors or warnings and exposed the results through the accessibility tree.
This does not claim a VoiceOver session or customer validation.

Receipts and screenshots are retained under `/tmp/want-it-certly-flow-01a12cd6`.
The real extraction receipt is `latest-production/receipt.json`.
The rejected-volume receipt is `unsupported-volume-receipt.json`.
The regression log is `tests-final-ui.log`, and the offline acceptance log is `final-acceptance.log`.

To repeat the real extraction check, start a separate production server with `DB_PATH` under `/tmp`, `AUTO_NEGOTIATE=off`, and live Dial and Keewano ingestion keys disabled.
Keep the quote-extraction key configured on that server.
Then run the following command with the same database path:

```sh
BASE_URL=http://localhost:3103 DB_PATH=/tmp/want-it-certly-check.db pnpm tsx scripts/verify-certly.ts
```

Run `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit`, and `pnpm build` for local checks.

## Remaining limits

Settlement validates a conservative allocation rather than searching every feasible vendor assignment.
The demo uses fictional vendors, simulated payments, and test account links.
A full live demo rehearsal and video recording are separate from this verification.
The current Vercel SQLite configuration stores data in per-instance `/tmp`, which is not durable shared storage.
Persistent production deployment was outside the original local-only MVP and has not been validated here.
