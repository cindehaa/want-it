# Pooled — agentic group procurement demo

Bun + React + Vite + Tailwind v4 + shadcn/ui.

```bash
nix develop        # bun + node
bun install
bun run dev        # http://localhost:5173
```

Or in one go: `nix run`. Without nix: `npm install && npm run dev`.

## One real Dial call

The **Negotiate by phone** step places ONE real call through the want-it backend
(`app/api/hack/call`) and streams Dial's transcript into the call card as it arrives.
Vite proxies `/api` to `http://localhost:3000`, so run `pnpm dev` in the repo root too, with
`DIAL_API_KEY`, `DIAL_FROM_NUMBER_ID` and the number to dial set in `.env.local`
(`HACK_VENDOR_PHONE`, else `HUMAN_VENDOR_ID` + `<VENDOR>_PHONE`, else `DIAL_VENDOR_PHONE`).
If the call can't be placed, the card falls back to the scripted call and says so ("Simulated call").

Demo flow: Marketplace → **Procure** → describe what you need (click the example) →
agent parses the request & scans pools → merge into POOL-2291 → threshold reached →
agent procures (incl. a phone call with the dealer) → order complete.
Everything after the description step is hardcoded to the Herman Miller Aeron.
