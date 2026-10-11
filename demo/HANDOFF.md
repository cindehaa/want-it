# Teammate handoff

This branch owns `lib/keewano/**`, `scripts/keewano/**`, `data/benchmark.json` and `demo/**`.
The shared contracts and lead's UI and call code are unchanged by the teammate work.
The friend handles accounts and keys.

## Keewano setup

Set `KEEWANO_EVENT_KEY` and `KEEWANO_PAT` in `.env.local` on the machine that will run the demo.
The event key must be an SDK/event key, not a server key.
The PAT must have access to the same project receiving the events.
Do not commit or paste keys into logs.

Inspect the generated history first.

```sh
pnpm tsx scripts/keewano/backfill.ts
```

Send it once the project is ready.

```sh
pnpm tsx scripts/keewano/backfill.ts --send
```

The script registers ten custom event types and sends 360 typed events across 60 synthetic startups.
Twenty-one startups abandon over the fictional $30 list price.
Maximum prices are between $18 and $26 per seat.
The default dry run makes no network requests.
Each startup has stable UUIDs and a stable batch identity.
The receipt saves the time anchor and is tied to the event key, so switching projects cannot silently skip the upload.
An uncertain batch stops the script; inspect the receipt before explicitly retrying that same batch.

```sh
pnpm tsx scripts/keewano/backfill.ts --send --retry-pending
```

A zero-event acknowledgement can mean a duplicate or invalid batch.
It does not prove ingestion succeeded.
Verify the live query after about five minutes.

```sh
pnpm tsx scripts/keewano/check.ts --discover
pnpm tsx scripts/keewano/check.ts
```

The application uses Streamable HTTP MCP at `https://api.keewano.com/mcp` with the `k-token` header.
It initializes a session, lists the actual tools, selects the unique SQL tool by its name/description and input schema, then runs two SQL queries.
The first counts distinct interested buyers, buyers who abandoned over price and synthetic buyers over the past 90 days.
The second computes Keewano's estimated median over maximum-price event values, not a per-buyer latest-value median.
The exact SQL is returned in `queryText`.
If discovery reports a required project identifier, set `KEEWANO_PROJECT_ID` to the project UUID.
If discovery reports another required argument, multiple SQL tools or non-JSON results, hand off the discovery output for an adapter update.
Those details cannot be confirmed without the live PAT; the docs do not publish the tool schema.

A full query has an eight-second deadline.
Concurrent pool requests share only the pending query.
A successful response has `source: keewano_live` and the actual query time.
A failure uses the last valid result for that category/account/project as `keewano_cached`, retaining the original timestamp.
No valid cache means `unavailable` with null counts.
No synthetic local number is promoted to live evidence.
Application events use an order-derived identity because the existing contract has no stable startup identifier.
Historical demo startups each have one distinct identity.

The cache lives in `data/keewano-cache/` and backfill progress in `data/keewano-backfill-receipt.json`.
Keep both out of commits.
This checkout excludes them locally through `.git/info/exclude`; other checkouts need the same local exclusions.

## Benchmark

The five steps are now explicit estimates rather than placeholders.
The assumed totals are 101 active human minutes directly and one minute with want-it per buyer.
The difference is 100 estimated minutes per buyer.
No measured human baseline or customer savings claim is made.
The human-timing requirement in T4 remains pending; it is not required for the app to function.
The user asked to focus on implementation rather than a vendor demo request.
No vendor sales form was submitted.

## Verification commands

```sh
pnpm tsx --test lib/keewano/*.test.ts
pnpm exec tsc --noEmit
pnpm exec eslint lib/keewano scripts/keewano
pnpm build
```

The repository also has the lead's `scripts/acceptance.ts`.
It resets its target database, so use an isolated server and temporary database rather than the recording database.
Its fixtures exercise settlement behavior and do not prove real supplier calls.

## Open gates

T2 is ready for upload, but ingestion is not done until the project accepts the events.
T3 has tested transport/fallback behavior, but the real SQL schema and results still need the live-key check.
T4's estimate data is complete; the requested observed human timing remains unmeasured.
T5's script targets 4:35; a full live rehearsal remains pending.
The lead still owns first real call, saving a fallback recording and final demo freeze.
No deployment is planned in the local-only specification.

## Sources

The ingestion and custom-event payloads follow the [official REST API reference](https://api.keewano.com/event/ingress/v1/json/swagger).
The five-minute ingestion guidance and synthetic-history option come from the [SpeedHacks quickstart](https://docs.keewano.com/getting-started/speedhacks-quickstart.md).
The query transport follows [MCP for agents](https://docs.keewano.com/analytics/mcp-for-agents.md).
Distinct-buyer counting and the estimated percentile follow the [SQL guide](https://docs.keewano.com/sql-query-studio/guide.md) and [SQL reference](https://docs.keewano.com/sql-query-studio/reference.md).
