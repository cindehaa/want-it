# want-it demo script

The target recording length is 4 minutes 35 seconds.
The final 10 seconds before the 4:45 limit are a buffer.
One vendor call is the core demo.
A second vendor call is optional and should only appear if already verified and time permits.
This changes the two-call draft in SPEC section 11 because a live call can take up to three minutes on its own.

## Before recording

Use the checked main app, not a fixture URL.
Confirm the server and database with the lead before resetting anything.
Place a real Dial call to the AI test vendor and save it with "Save as fallback recording" before recording the demo.
Confirm the recording exists; an empty recording file is not a fallback.
Run the Keewano backfill and allow about five minutes for ingestion.
Run `pnpm tsx scripts/keewano/check.ts` and confirm `source` is `keewano_live`.
If it is cached or unavailable, say so and do not claim the live-query requirement passed.
Read the actual counts, quote terms and order prices from the app.
Keep all human time numbers labeled as estimates until someone measures the same task.

## 0:00 to 0:25, problem

Show the storefront.

"A founder who needs SOC 2 software usually has to compare vendors, contact sales and negotiate alone.
We pool demand across startups and let a procurement agent ask for a group price.
The buyer sets a maximum price, and each startup keeps its own vendor account."

## 0:25 to 0:55, place an order

Enter a demo buyer name, five seats, a $24 maximum per seat and no preferred vendor.
Place the order.
Read the resulting order confirmation and maximum total from the page.

"I placed an order with a maximum of $24 per seat.
This pilot simulates the payment hold and collects no card details.
If the final offer is above my cap, the order is canceled and the hold is released."

## 0:55 to 1:30, pool and demand evidence

Open `/pool`.
Show the included startups, seat total and exclusions.
Open "Show the query" in the demand evidence card.
Read the counts and source badge actually shown.

"The map uses simulated startups.
The pool excludes the wrong category and orders whose deadline is before the buying window closes.
Keewano stores our demand events and answers this 90-day query.
This history is synthetic for the demo.
The query's answer goes into the procurement agent's call instructions, so the agent can explain how much demand walks away over price."

Only say "This is a live query" when the source is `keewano_live`.
If the source is cached, read its timestamp and say it is cached.
If it is unavailable, say "Demand evidence is unavailable, so the agent has no historical demand numbers to cite."

## 1:30 to 3:05, negotiation

Select "Call next vendor" only after the lead confirms Dial is configured.
Show the vendor's private pricing policy and the transcript as it arrives.
Read an extracted quote only when the vendor has actually stated it.

"Certly is a fictional test vendor.
In AI mode, another agent plays its sales representative on Dial.
In human mode, a teammate answers using the configured vendor policy.
The procurement agent starts with our pool's facts and historical demand evidence.
It does not receive the vendor's private price floor.
We extract the supplier's stated terms from the transcript.
Asking for a price is not the same as receiving a quote."

At 2:45, assess whether the call and extraction will finish within this scene.
If the call remains active, use the verified earlier recording only after the live call reaches a terminal state; the UI disables replay while a call is active.
If necessary, record this scene separately and edit the video with an explicit "recorded call replay" caption and the recorded timestamp.
Do not present that edit as an uninterrupted live call.
If no verified recording exists, show the failure or pending state and omit the quote claim.
A failed call is a real result, not a reason to invent a discount.

## 3:05 to 3:55, settlement

Once the call is no longer active, select "Settle pool".
Return to the demo buyer's order page and read the final price or cancellation state.
Show one seeded over-max buyer if an actual supplier quote makes it cancel.

"The AI extracts the quote, but ordinary code applies the money rules.
A price must respect the buyer's cap and confirm separate accounts.
An order is canceled if the final price exceeds its buyer's cap.
If there is no better deal, an eligible buyer pays list price.
The redemption links and payment holds in this pilot are simulated."

The current app has an explicit settlement button.
Advancing the demo clock alone does not settle orders.
Do not promise automatic capture or a working vendor redemption service.

## 3:55 to 4:35, time and close

Show the time-saved counter and its estimate label.
Read the actual displayed buyer count and total.

"Our current comparison is an estimated 101 minutes of active human work per buyer directly, versus one minute of checkout with want-it.
That is an estimated 100 minutes saved per buyer under these assumptions.
It is not a measured customer outcome.
We show agent call time, waiting and money separately.
The working loop is an order, pooled demand, a vendor call, a supplier quote and deterministic settlement."

Stop by 4:35.

## Human-vendor fallback

Use this only when the lead selects `VENDOR_MODE=human` and confirms the receiving phone number.
Follow [the lead's vendor scripts](../WIP/VENDOR_SCRIPTS.md), which match `lib/dial/vendorPersonas.ts`.
Do not use the older fixed $24/$20 fallback from the original brief; the current policy has different tiers and concessions.
The lead selected human mode at 14:34 because the account currently has one Dial number.
Confirm the current mode before recording.
State only the policy the lead has configured for the call.
Do not call a real vendor or submit a real sales request as part of this demo.

## Rehearsal status

A complete live rehearsal requires keys, a verified Dial recording and a queryable Keewano project.
An offline browser walkthrough checks the buyer flow and visible fallback states.
An offline walkthrough does not satisfy the live-call or live-query gates.
Record the actual rehearsal result in `demo/HANDOFF.md`.
