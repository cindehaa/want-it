# UI review and redesign direction (2026-10-11)

Design canvas with before shots and 7 interactive variations: https://claude.ai/artifact/12drwRfQxL6TsqxEEP7HBq (private until shared from its Share menu).

## 1. What is wrong today, in numbers

Measured in the browser at 1440 px wide with the fixture data (`?fixture=quoted`, `?fixture=running`, `?fixture=done`).

| Page | Words | Badges | Bordered boxes | Font sizes | Headings | Height (screens) |
|---|---:|---:|---:|---:|---:|---:|
| `/` storefront | 136 | 0 | 4 | 6 | 2 | 1.1 |
| `/pool` marketplace | 537 | 19 | 41 | 11 | 5 | 2.9 |
| `/negotiation` running | 1,149 | 31 | 36 | 12 | 9 | 2.2 |
| `/negotiation` done | 1,399 | 31 | 36 | 12 | 9 | 2.2 |


### Storefront `/`
- 136 words before the button for a one-product store. Hero headline plus a paragraph, then a product box that repeats the pitch, then four fields and a checkbox, then a green notice, then a disclaimer, then the button, then another disclaimer.
- The page never shows that the price is already moving. The one thing that makes this product different (price only goes down, and it is going down right now) is text, not a number.
- Company name and preferred vendor are asked before the user has committed. Baymard's research says field count hurts more than step count; both can move after "Place order".

### Marketplace `/pool`
- The largest element on the page is the 88 px hours counter ("Founder time given back"). The page is about a pool of seats and a price; the counter is a pitch metric for the video, not the buyer's job.
- Seven surfaces are expanded at the same time: header stats, demo clock, map, curve, time-saved hero, evidence card, negotiation panel with every transcript and quote and five policy rows. 41 bordered boxes. Nothing recedes, so nothing leads.
- No search, no way to join the pool from here. The "marketplace" cannot sell.
- Three different summaries of the same price (curve caption, quote tables, header).

### Negotiation `/negotiation`
- Five equal columns. The live call gets one fifth of the width and the same visual weight as four finished or waiting calls. There is no place for the eye to land.
- Per lane: 3 badges, a "best offer in hand" line, a 280 px transcript box, a quote block with a tier list and a four-row definition list, conditions, an italic quote, and a policy disclosure. 31 badges on screen.
- Below the lanes, the leaderboard, the ratchet chart and the settle footer each restate the best price. The time panel is a fourth, unrelated summary.
- Disclaimers (estimate, hidden from our agent, simulated vendor, recorded, Keewano cached, synthetic history) sit at the same level as the live content.

## 2. The three rules the redesign follows

1. One loud thing per screen. Storefront: the price and the button. Marketplace: the product with its live price and a way to join. Negotiation: who the agent is talking to right now and what the price is. Everything else goes behind "Details".
2. Structure is felt, not seen. Borders, badges and headings only where they carry information. One density system per page (16 px gap, 14 px body, 12 px captions, nothing smaller).
3. Motion only on real state change, and only on transform and opacity. A turn arrives, a quote lands, a startup joins, the price drops. No ambient loops except the one live dot and the one beam while a call is in progress.

Sources (verbatim phrases): Linear design refresh, "Don't compete for attention you haven't earned" and "Structure should be felt not seen". NN/g heuristic 8, "Every extra unit of information in an interface competes with the relevant units of information". NN/g progressive disclosure, "Designs that go beyond 2 disclosure levels typically have low usability". frontend-design skill, "Spend your boldness in one place" and "Visual structure is information". Rauno Freiberg, Web Interface Guidelines, "Only animate when it clarifies cause & effect or when it adds deliberate delight".

## 3. Variations on the canvas

### Storefront
- A, one-sentence order. The order is a sentence with two inline numbers (seats, optional cap), the product card shows the live group price with a pulse, one button. Company name and contact come after confirm. About 85 words, down from 136, and the live price is now on the page.
- B, product page. Product hero, list price struck, group price large, tier meter "249 of 300 seats to $18.00", three facts, an order box with a stepper. Closest to a normal store.

### Marketplace
- A, map first. The map is the whole stage. A search field top left, one stat pill top right (seats, startups, best price), a floating order dock bottom center (product, stepper, "Join the pool, at most $190"), Details and a demo kebab bottom right. Curve, evidence, transcripts and policies live in the Details drawer.
- B, search and grid. Search bar, category tabs, product cards with list vs group price and a tier meter, "Join the pool" on the card. Requested-pool cards use bracket placeholders; do not invent products for them.

### Negotiation
- A, Stage (recommended). Price hero with the list price struck and the delta. Vendor rail across the top, a progress line fills as calls finish. The live call takes two thirds of the width and shows the last three turns, the newest one larger with a waveform next to the speaker. Right column: what the agent is citing, a sparkline of price after each call, one Details link. One Settle button, enabled only when the run ends.
- B, Switchboard. The agent in the middle, five vendors on an arc, a dashed beam travels to the vendor on the phone, nodes fill when a quote lands, a caption bar carries the live line. Best for the demo video and for a screen on a wall. Weakest for reading transcripts.
- C, Call log. One row per call, time, vendor, duration, quote. Only the active row is expanded and streams turns. Sticky price header. Closest to Vercel deploy logs and Linear activity. Best when there are more than five vendors.

All three negotiation boards run the same scripted sequence (Auditly call, quote lands at $18.50, ComplyKit call, no better offer, run finished) so they can be compared side by side. Links between boards work in Play.

## 4. Motion spec

| Event | Treatment | Duration, easing |
|---|---|---|
| New transcript turn | Opacity 0 to 1, translateY 8 px to 0 | 320 ms, cubic-bezier(.2,.8,.2,1) |
| Quote lands, price changes | Number rises in from 10 px, color accent then ink | 600 ms, same curve |
| Startup joins the pool | One ripple ring from the dot, 0 to 28 px, fades | 1.4 s, ease-out, once |
| Counter changes (seats, startups) | Flash color accent to ink; number-flow digit roll when adopted | 1.2 s ease-out |
| Call in progress | 8 px dot with a 1.6 s pulse ring; waveform bars next to the speaker | infinite, pauses when hidden |
| Beam to the vendor on the phone (Switchboard only) | 8/9 dash travelling along the line | 800 ms linear, infinite |
| Leaderboard reorder (if kept in Details) | FLIP transform | 550 ms, cubic-bezier(.22,1,.36,1) |
| Vendor rail progress | width transition | 550 ms, same curve |
| Button press | scale to 0.97 | 120 ms ease-in, release 200 ms ease-out |
| Reduced motion | every animation above collapses to an instant state change; the live dot stays static | |

Rules: nothing above 600 ms except the one-shot ripple; never animate width, height, top, left or font-size on anything that re-renders; put `animate-spin` and transforms on a wrapper div, not on the SVG; polling updates go through `startTransition`; a chart holds its previous render at 70 percent opacity while data reloads, no skeleton flash.

Libraries, all React 19 compatible as of today: `motion` (import from `motion/react`, use `LazyMotion` with `domAnimation`, about 20 kB) for AnimatePresence and layout reorders; `@number-flow/react` (6 kB) for the price and counters; `@formkit/auto-animate` (3 kB) for transcript rows if we do not want motion there. Magic UI's Animated Beam is the reference for the Switchboard beam, but the CSS dash in the mockup is enough.

## 5. Tells to remove from the current code

Things that read as generated and that the mockups avoid. Each line is a grep target.

- Unicode glyph icons in text: "✓", "✕", "→" (`app/orders/[id]/page.tsx`, `TimeSavedHero`, order page links). Use inline SVG or words.
- Em dashes in UI copy: "Place order — simulated card hold", "Any — let us compare". Use a comma or a second sentence.
- Middle-dot meta strings: "Simulated vendor · AI agent", "Recorded · time", "Call 4 of 5 · Auditly". Use a comma, or separate spans with a gap.
- Badge soup: five tones of `Badge` on one line. One status per surface, as text, colored only when it is the live or best state.
- Cards inside cards with the same 12 px radius and border at every level (lane, quote block, policy block, tier list). One border per surface; inner groups separated by a hairline or by spacing.
- Accent-soft green wash boxes around every positive thing (quote cards, leverage banner, hold notice). Reserve the green fill for the one live or best element.
- Italic quoted evidence with a left border (`blockquote` in quote cards). Move to Details as plain text.
- A tracked 11 px label above every number (header stats, evidence stats). Label after the number, same size, muted.
- Disclaimers inline with content ("not human time", "estimate", "synthetic history", "hidden from our agent"). One footnote line per page or a tooltip on the label.
- The slogan hero on the storefront ("Buy like you have a procurement team"). Product name as the heading.
- Five font sizes under 13 px. Minimum 12, caption 12, body 14, one display size per page.

## 6. Skills

Already installed and worth invoking on every UI change:
- `frontend-design` (one bold element, structure as information, motion sparingly, reduced-motion floor).
- `vercel:react-best-practices` (Suspense boundaries, `useTransition` for polling, `useDeferredValue` for charts, no inline components, animate the wrapper not the SVG).
- `vercel:shadcn` (one density system per page, zinc base plus one accent, no nested cards).
- `dataviz` (hero figure at least 48 px and exactly one per view, 2 px lines, hairline solid gridlines, label selectively, hold previous render on refetch).
- `hyperframes-animation` and `motion-graphics` are for the demo video, not the product. Their timing tables transfer (entrances 0.3 to 0.5 s, exits faster, stagger total under 500 ms, no overshoot on data).

Worth adding:
- Vercel Web Interface Guidelines as an agent command, `npx skills add https://github.com/vercel-labs/agent-skills --skill web-design-guidelines`, then run `/web-interface-guidelines` on a PR. Rules: interactions under 200 ms, never scale from 0, never `transition: all`, skeleton show-delay 150 to 300 ms, status dots carry a text label.
- shadcn official skill, `npx skills add shadcn/ui`, if we adopt shadcn components for Sheet, Tabs and Dialog (the Details drawer).
- `ibelick/ui-skills`, `fixing-motion-performance` sub-skill, `npx skills add ibelick/ui-skills --skill fixing-motion-performance`.
- `pproenca/dot-skills` `emilkowal-animations` is a small third-party rules file (ease-out default, under 300 ms, never from scale 0). Use it as a checklist, not a dependency.
- `nextlevelbuilder/ui-ux-pro-max-skill` is popular but runs Python scripts that write files into the project. Review before installing; not needed for this scope.

Not used: the organization's Skyvern design system (dark slate, Inter). want-it has its own light tokens in `app/globals.css`, and the mockups use those.

## 7. Rollout plan

1. Negotiation Stage (1 day). New `components/negotiation/Stage.tsx` reusing `derive.ts`. Keep `VendorLane`, `Leaderboard`, `RatchetChart`, `TimePanel` and the policy disclosures inside a `Details` sheet. Delete per-lane badges.
2. Storefront A (half a day). Rewrite `app/page.tsx`: product card with live group price from `/api/pool`, inline seats and cap, one button, post-confirm company field on the order page.
3. Marketplace A (1 day). `PoolClient` becomes map plus pill plus dock; `TimeSavedHero`, `EvidenceCard`, `NegotiationPanel`, `PriceCurve` move into the Details sheet; demo clock into a kebab.
4. Motion pass (half a day). Add `@number-flow/react` for the price and counters, `motion` for the sheet and reorders, `startTransition` around the two polling loops.
5. Tells pass (2 hours). Grep list in section 5.

What this does not change: data contracts, API routes, settlement rules, the fixture stages, or the labeling requirements in SPEC section 2 (simulated vendors, recorded replay timestamps, estimate tags). Those labels move to footnotes and tooltips; they do not disappear.

## 8. Update, later on 2026-10-11: the flow Cindy described, and the process from Lenny's article

### The product flow (replaces the map-first marketplace)
Cindy's direction, in order: a real marketplace you can browse and search (no map; matching is back-end), pick a product, fill in buying info, place the purchase order, then watch the live call room where agents negotiate. Plus a second entry point: a "New listing" button where you describe what you need in plain words, a short "Matching" screen, a match (hard-coded to a Certly group that was 10 seats short of its tier), "threshold reached", an auto-buy that runs itself, and a "Settled" receipt.

The canvas top row is now that flow, boards 1 to 5, linked so Play walks through it:
1. Marketplace: sidebar (sections, categories, your need), high-contrast search, one card per vendor product with the quote for this pool as the largest figure and a Join button; "Any vendor" pinned first; "New listing" button in the header and sidebar.
2. Product and purchase order: product, best price, a table of the five quotes for this pool with the live one marked, three facts; the order form with seats, optional cap, company, work email, a note for the agent, "about $185 at today's best, never above $280", one button.
3. Order placed: one sheet with the facts, the never-above amount, a five-step status with the live step pulsing, one button into the live room, cancel as a quiet link.
4. Live room, from Cindy's sketch: every live Dial call is a large tile (vendor, elapsed time, level meter, last two turns, offer on the table); finished calls are a ranked table with the quote as the largest figure; click any call to join: transcript fills the screen in two columns (speaker, text), a Sound on/off toggle, the other calls in a rail. Settle unlocks when every call has ended.
5. New listing: five screens in one board. Plain-words textarea with a "Read as" parse, Matching (three steps), Match found with the threshold meter filling to 50 of 50, Buying for you (four steps tick in), Settled with the receipt and the redemption link. It advances on its own in Play.

Open dependency for board 4: hearing the call needs a listen-in audio stream or a recording URL from Dial. Transcript polling already exists; audio does not.

### Process, following "How to turn your AI into a world-class designer" (Anshu Chimala, Lenny's Newsletter, 2026-09-01)
- Seed strings for variety (Discover): `scripts/design-seed.sh` prints a random 40-character seed and derives a direction from it (mood, layout archetype, type, accent hue, motion). Eight seeds produced eight directions; the one that was furthest from the house look became the dark "Timing tower" room (board D), which the critic scored highest for hierarchy. Keep the script; run it when a screen feels generic.
- Separate critic (Define): `WIP/design-critic.md` is the fixed critic prompt. It runs in a fresh subagent on a stronger model that sees only screenshots and ranks every screen, befores included. Round 1 scores (out of 10): timing tower 7, stage 6, order placed 6, order form 5.5, call log 5.5, marketplace 5, call wall 4.5, joined call 4, storefront before 4, switchboard 3.5, marketplace before 3, negotiation before 2.5. Its top gaps were applied to the flow boards: quote as the largest figure, explicit Join buttons, search first and high contrast, no monogram tiles, no placeholder hero, live calls as the hero and finished calls as a ranked table, two-column transcripts instead of bubbles, one live accent (green with a text label, never red), strike only the number, one list anchor ($28.00, the lowest list), consistent counts (249 seats, 12 startups).
- Cut (Deliver): removed from the flow boards after the critique: the "Pools opening soon" placeholder cards, the need-by field, the duplicate "Join a call" link, the check disc on the confirmation, idle meter glyphs on finished calls, the "citing" card inside the grid.
- Not done: image generation and video generation (techniques 4 and 5) need an OpenAI, Gemini or fal.ai key with a spend limit in a gitignored `.env.agents`; nothing in this product wants hero imagery, so skip unless the demo video needs it. Technique 7 is paywalled.
- Round 2 of the critic is pending: the in-app browser pane was closed mid-run, so the fixed boards could not be screenshotted. Reopen the browser pane (or say so) and the loop continues; expect one more round before scores plateau.

### Vendor and list anchors used across the boards
Certly $30.00, Vantly $32.00, Trustwise $28.00, Auditly $34.00, ComplyKit $29.00 list. Quotes for the pool: Auditly $18.50 (on the phone), Vantly $19.00, Trustwise $20.00, Certly $22.93 with a $40 account fee, ComplyKit not called. "List from $28.00" is the anchor everywhere; the storefront's old $30 anchor is gone.
