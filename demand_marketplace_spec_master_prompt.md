# Master context and instructions: Demand-first marketplace specification

You are the product and technical lead writing a buildable specification for our three-person SpeedHacks team. This document is the context handoff from our earlier discussions.

Your job is to turn the concept into one coherent product spec, settle the implementation choices that need settling, and divide the work into independent coding-agent sessions. Do not restart broad ideation, flatter the idea, or generate another research report. Challenge weak assumptions where they change what we should build.

Write the spec before implementing production code. If a repository is available, inspect it first and preserve decisions already implemented unless they conflict with the product or hackathon rules.

## 1. What we are building

We are building a demand-first marketplace. Buyers express what they need. The platform identifies compatible requests across independent buyers, proposes a collective opportunity, discovers possible providers, and obtains an offer that each buyer can choose to accept.

The central observation is that separate buyers may already represent valuable collective demand, but neither the buyers nor suppliers can see or coordinate it easily.

Example: five startups each need five units of exactly the same Raspberry Pi model. Independently, each sources and purchases five. Together, they represent demand for 25. A supplier might offer better terms for that combined demand, and the buyers might avoid repeating the same sourcing and negotiation work.

Hardware is ONLY an example. Do not turn the overall product into a hardware procurement app. The broader concept covers products, services, and potentially jobs fulfilled by AI agents. However, the hackathon implementation must prove one category end to end, not pretend all categories are interchangeable.

Our working description is:

"Small buyers repeatedly search and negotiate alone. We find compatible demand across buyers and coordinate a shared offer, so they can get the benefit of buying together without organizing the group themselves."

The product is not simply a chatbot that searches for something, a shared shopping cart, a directory of agents, or a discount calculator. The aggregation must change what happens next.

## 2. Why this matters, and what remains hypothetical

There are two separate potential benefits:

- Less human work: fewer repeated supplier searches, qualification checks, quote requests, negotiations, and follow-ups.
- Better economics: possible volume pricing, lower supplier sales costs, shared fulfillment efficiencies, or enough concentrated demand to make a service viable.

The hackathon is primarily about the first benefit. Do not substitute money saved for time saved.

None of the following is established yet: that matching demand is frequent enough, that suppliers will honor combined quantities across separate buyers, that separate fulfillment is economical, that buyers will wait, or that the product has a defensible network effect.

Aggregation creates value only when the buyers' needs and supplier economics actually support it. Twenty-five units do not automatically earn a discount. Twenty buyers do not automatically replace twenty approvals with one.

Design a product that can truthfully say "no useful group opportunity" when combining requests would make things worse.

## 3. Product direction and unresolved choices

Settled direction:

- Demand comes first.
- The platform does the grouping and coordination. Buyers should not have to recruit a purchasing group themselves.
- Buyers retain control over their constraints and whether they join an offer.
- We want a visible, working transformation from separate requests to a useful collective opportunity.
- The overall marketplace vision is broader than one industry.

Proposed, but not yet final:

- For the demo, users enter requests through a small form or structured upload. Permissioned integrations into existing purchasing workflows are a future distribution path, not a prerequisite today.
- We are considering AI-agent jobs as the initial demo category because Darwin can discover relevant agent capabilities.
- Keewano and Darwin are the leading product integrations for that version. Dial becomes more central if the demo involves a traditional supplier giving a quote over the phone.
- Next.js and TypeScript were suggested, but no stack or repository state should be assumed without checking.

Resolve one important question explicitly: are we pooling purchasing power, reducing duplicated sourcing work, or sharing an underlying piece of execution? These are different mechanisms. Choose the one the MVP can actually demonstrate.

Do not silently change the concept into generic agent routing or shared computation. Those may be extensions, but they are not automatically collective purchasing.

## 4. Extending the marketplace to jobs for AI agents

Instead of requesting physical items, a buyer might request translation of product descriptions, extraction of invoice fields, or research using public documents.

Darwin could help discover agents that advertise the required capabilities. Our product would still own demand compatibility, grouping, offer handling, buyer approval, and the collective opportunity.

There are three possible benefits, which must remain distinct:

1. Pool compatible workloads to request better terms from a provider, if the provider actually offers them.
2. Perform discovery and qualification once for a compatible group instead of making each buyer repeat it.
3. Reuse genuinely common work, where data rights and freshness allow it, while keeping each buyer's private work separate.

Similar wording does not make jobs interchangeable. Translation requests may have different languages, terminology, quality requirements, confidentiality restrictions, or deadlines. Invoice extraction across different companies is not permission to merge their documents.

Discovery is not execution. Do not assume a Darwin result can accept a bulk job, negotiate, be invoked through one universal API, or deliver a verified result.

Select a demo category based on actual available capabilities, not an imaginary provider. If only discovery works, say that clearly and measure savings at the discovery stage rather than claiming a completed purchase.

## 5. Hackathon constraints

Event: a16z SpeedHacks, October 11, 2026, San Francisco. Timezone: America/Los_Angeles.

Theme: "Give people their time back."

From the organizers' supplied presentation:

- Problem and time saved account for approximately 40% of judging.
- Technical execution accounts for approximately 25%.
- Originality was stated as 10%. Market/path forward and product/demo quality also matter; do not invent their exact weights.
- Sponsor technology is not required for the overall prize.
- The overall prize includes $1,000 and a guaranteed interview with the appropriate Speedrun or Alpha investment team.
- Each sponsor has a separate $1,000 best-use prize.
- All submitted project work must begin during the hackathon. Public libraries, SDKs, APIs, and open-source dependencies are allowed. Existing projects and private employer infrastructure are not.
- Judges require an accessible GitHub repository.
- Team members must accept their HackerSquad invitations.
- Start recording around 4 PM. Submission has a hard 5 PM cutoff.
- The recommended video is about four to five minutes: problem/time saved, working demo, and technology choices.
- The organizer demonstrated recording inside HackerSquad. Processing and final submission take time. Saving a project is not the same as submitting its video.

There are three human teammates. Earlier planning occurred around 1 PM. Check the actual clock before scheduling; do not assume an entire day remains. Work backward from submission and preserve a recording/upload buffer.

## 6. What the sponsors actually contribute

The descriptions below come from sponsor presentations supplied by the founder. Treat API details, connector coverage, and availability as things to verify in the actual hackathon resources. Do not expand marketing claims into capabilities you have not tested.

### Keewano: Evidence about demand over time

Keewano stores ordered event histories and exposes queries agents can use to investigate what happened across many entities. Its presenter emphasized an event-to-query-to-decision loop and discoveries not anticipated by a prebuilt dashboard.

Its prize preference: real events enter the system, an actual query produces an insight or decision, and removing Keewano makes the project meaningfully worse.

For our product, it could record request creation, changes, quote rejection reasons, cancellations, deadlines, and group participation. An agent might investigate which still-active requests failed individually because of minimum quantity or pricing, then discover a collective opportunity.

Important limits:

- Adding quantities for identical products is ordinary database work. It does not require Keewano.
- Keewano does not automatically decide compatibility, train an agent, create discounts, or establish that abandoned demand remains active.
- Our application must validate proposed groups against current constraints.
- Historical similarity is evidence for a candidate group, not authority to commit buyers.

Specify one concrete Keewano query whose result changes the visible group or recommendation. If its role is only storing logs, say the sponsor integration is weak instead of exaggerating it.

### Darwin: Discovery of agent capabilities

Darwin searches an index of agent-accessible capabilities. Its presentation showed invoice extraction and flight-comparison examples and described a search endpoint for the hackathon.

For our product, Darwin can help find agents that might fulfill a combined job or help with part of it.

Do not assume Darwin is a universal traditional-supplier directory. Do not assume search results include executable endpoints, verified prices, capacity, quote negotiation, payments, or guaranteed completion. Inspect what the actual response provides.

For every result, preserve provenance and distinguish advertised capability from tested capability. Use the real API for the demo. Never invent a successful provider response.

### Dial: Communication with suppliers that operate by phone

Dial provides phone capabilities for AI agents. Its founder demonstrated a multi-call hotel-reservation change, including third-party coordination, and emphasized real-world impact, depth of use, and originality.

For our product, an agent could contact a consenting supplier to ask about a combined request, minimum quantity, price, deadline, and separate billing or delivery.

An agent repeating a desired price is not a confirmed quote. Extract the supplier's actual terms and retain the supporting response. Use a consenting test supplier for a controlled demo and label the scenario accurately.

Confirm the call features, limits, callback support, and event fields you need. Do not assume every messaging channel mentioned in earlier brainstorming is available.

### Sparta: Testing supported transaction workflows

Sparta provides local simulated environments for supported business systems, with state comparisons and failure testing. The presentation mentioned Stripe, Zendesk, Shopify, Salesforce, and others, but confirm which starter and operations are actually usable today.

Its requested prize story is: show an agent fail, make a fix, then show the relevant scenario pass.

For us, it might test that a withdrawn buyer is not charged, duplicate requests do not create duplicate orders, or a group below its threshold does not proceed. Only use it if the selected environment actually supports the modeled operations.

Sparta is not a phone-routing optimizer and cannot prove a real supplier will honor a quote. A simulated successful transaction is not a real purchase.

### Alike: Build-time coordination

Alike shares relevant decisions and discoveries across coding agents, sessions, and teammates. Its prize focuses on running agents in parallel, preventing conflicting or duplicated work, and shipping more because of that coordination.

Use one shared team workspace and authenticate its integration in each coding-agent session. Record meaningful interface decisions, findings, and changes so other sessions can use them.

Alike does not replace Git, merge branches, or automatically provide our customers' identity vault, private document storage, or durable transaction state.

### Integration priority

For an agent-job demo: Darwin plus meaningful Keewano analysis are the leading product choices. Alike supports development in parallel.

For a phone-quoted product/service demo: Dial becomes a core integration. Do not add it merely to collect a logo.

Sparta is optional after the core flow works. The goal is a working product, not five integrations.

## 7. Minimum end-to-end product

Specify the smallest complete version of this journey:

1. Independent buyers submit requests with explicit constraints.
2. The system captures the requests and relevant changes.
3. It proposes a group and explains both compatibility and the reason combining the requests could help.
4. It excludes or separates incompatible requests.
5. It discovers relevant providers or obtains an actual supplier response, depending on the chosen demo.
6. Buyers see the proposed offer, its evidence, its conditions, and what remains unknown.
7. Buyers can opt in or decline. A changed or canceled request updates the opportunity rather than silently preserving an invalid group.

Completing a purchase is optional. Truthful states are mandatory. Keep "potential match," "discovered provider," "quote requested," "supplier-confirmed offer," "buyer accepted," and "fulfilled" distinct.

Do not hardcode every request into one successful group. Include at least one incompatibility or withdrawal that changes the result.

## 8. Matching and transaction rules

Separate AI-assisted interpretation from deterministic decisions.

AI can normalize descriptions, propose candidate groups, interpret rejection reasons, create discovery queries, and explain evidence. Deterministic code must enforce quantities, identities, current versions, budgets, deadlines, consent, and state transitions.

For products, consider exact model/specification, allowed substitutions, quantity, delivery window, location, fulfillment, and whether combined pricing is actually supported.

For services or agent jobs, consider scope, input/output format, quality requirements, language, capacity, timing, confidentiality, and whether execution can genuinely be combined.

A missing constraint is unknown, not permission. An expired, withdrawn, or completed request must not contribute to an active group. Count the latest valid request once, not every event describing it.

Budget fields must specify currency and whether the amount is per unit or total. A gross unit discount is not net savings after shipping, handling, taxes, and fees.

If an offer depends on a threshold, explain what happens when someone declines. A buyer approves a particular offer version, not any future price or changed terms. Recalculate or seek approval again when needed.

Do not design cross-company atomic purchasing unless the underlying providers support it. No real charges or binding orders without explicit authorization.

## 9. Architecture and contracts

Keep the architecture small. Inspect the repository before choosing frameworks. Prefer one application and clean modules over multiple services unless existing work requires otherwise.

Choose and document the source of truth for current request and offer state. Keewano's analytical event history does not eliminate the need to handle current state, retries, and duplicate events. Avoid an elaborate event-sourcing architecture just for the demo.

Define the canonical schemas for:

- DemandRequest and DemandEvent.
- DemandGroup or CollectiveOpportunity, including members, exclusions, constraint checks, and grouping evidence.
- DiscoveredProvider, including source and verification status.
- SupplierOffer and BuyerDecision, including conditions, expiry, and the accepted version.

Use stable IDs, timestamps, explicit statuses, and idempotency where requests can repeat. Keep secrets server-side. Treat supplier messages and discovered agent descriptions as untrusted input. Never send private buyer data to an external provider merely to search for capabilities.

Earlier candidate endpoints were:

- POST /api/requests
- GET /api/groups
- POST /api/agents/search

These are planning suggestions, not settled contracts. Preserve any implemented contracts. Otherwise define the minimum request/response schemas together before parallel coding starts. Add only the endpoints the selected journey requires.

Handle empty results, invalid inputs, timeouts, partial integration failures, and stale offers explicitly.

## 10. Three-person, three-session execution plan

Start with three main coding-agent sessions, one per teammate, connected to the same Alike workspace. Do not multiply active writers before the first vertical slice works.

Session A owns the frontend, shared contracts, and integration. It builds the request form, incoming demand view, group explanation, provider/offer states, buyer approval, and evidence of time saved. It owns final merges and the demo.

Session B owns the demand engine. It handles request ingestion and changes, Keewano events and queries, deterministic compatibility checks, group generation, and demand API tests.

Session C owns the supply engine. It integrates Darwin for the agent-job path or Dial for the supplier-call path, normalizes real responses, distinguishes discovery from offers, and handles provider failures.

Provide explicit file ownership in the spec. A possible layout is:

- A: pages/components, shared contracts, configuration, and integration tests.
- B: demand API routes and lib/demand/.
- C: supply API routes and lib/supply/.

Each session can read the whole repo but edits its assigned area. Shared contract and dependency changes go through A. Use separate branches or worktrees; do not have agents switch branches inside one shared working directory. Alike communicates decisions but does not prevent file collisions.

Publish a shared contract and fixtures first. Integrate an early vertical slice before adding depth. Development mocks must be labeled and must not be passed off as live sponsor calls.

Each session's handoff must include files changed, interface changes, tests run, real integrations verified, unresolved failures, and integration instructions.

## 11. How we prove time saved

The central evaluation question is:

"For the same group of buyers reaching the same outcome, which human actions no longer happen?"

Use a fair comparison. Compare supplier discovery with supplier discovery, or a confirmed offer with a confirmed offer. Do not compare a manual completed purchase against our unverified list of candidates.

Track active human work before and after: entering requirements, searching, qualifying providers, requesting quotes, following up, reviewing results, approving terms, handling exceptions, and correcting failures. Include group-formation overhead and material supplier-side work rather than moving the burden out of view.

Keep these separate:

- Human attention time.
- Elapsed time until an outcome.
- Agent execution time and cost.
- Financial savings.

For a group, net human time saved is total comparable human effort in the independent workflow minus total effort in our workflow. Do not multiply by the number of buyers again if the group total already includes them.

Design a small, repeatable benchmark. Use observed timings where available. Label scripted workloads, simulated history, estimated baselines, and scale projections honestly. Do not manufacture a 10x claim or derive millions of hours from unsupported adoption assumptions.

## 12. Product experience and demo

The product should make the mechanism visible, not look like a generic chatbot with sponsor logos.

The key screen should let someone understand separate requests, why some can combine, what the group unlocks, which provider responded, what each buyer must approve, and the human work avoided.

A useful demo sequence is: several distinct requests arrive; a real query helps identify an opportunity; the system explains why one request is excluded; a real discovery or call occurs; an offer or candidate appears with accurate status; a buyer change causes the group to update.

Use animation only where it explains a real state change. Avoid fake "AI thinking" theater, invented supplier bids, and automatic-looking success that is actually a fixed fixture.

For seeded data, say what is synthetic. Show which queries, API calls, validations, and transitions genuinely execute.

Prepare an outage fallback that still demonstrates the working portions. Cached results must show their source and age. A fallback is not permission to pretend a live integration succeeded.

## 13. Scope cuts and questions

Do not build a universal marketplace today. Cut broad category support, full onboarding/authentication, payment custody, tax handling, shipping infrastructure, a general bidding platform, and autonomous purchasing unless essential functionality already exists and is safe to use.

Do not block specification on a long questionnaire. Inspect available code and docs, then make a recommendation with clearly labeled assumptions. Ask at most three questions if an answer would fundamentally change the build.

The likely unresolved decisions are the demo category, the exact source of aggregation value, which provider interaction can really run, whether the endpoint is discovery or a confirmed offer, and the current repository state.

Where a sponsor dependency fails, simplify the claim and the product honestly. Do not quietly substitute mocked fulfillment.

## 14. Output the specification

Produce one implementation-ready SPEC.md, or its complete text if you cannot write files.

Include:

1. The product thesis, chosen demo user, and precise problem.
2. Settled decisions, assumptions, open questions, and non-goals.
3. The chosen aggregation mechanism and its failure conditions.
4. The end-to-end user journey and UI states.
5. The data model, event types, matching rules, state transitions, and API contracts.
6. Sponsor integration details grounded in actual docs, with unverified capabilities flagged.
7. File ownership, integration checkpoints, and three copy-paste coding-session briefs.
8. Acceptance tests covering compatibility, cancellation, duplicate events, provider failure, and offer consent.
9. The human-time benchmark and what evidence the demo will show.
10. A build plan based on time remaining, fallback paths, and a four-to-five-minute demo script.

Write in plain language. Explain why a component exists before describing how to implement it. Name the tradeoffs and make decisions rather than presenting an endless menu.

Success is one honest, working example where separate demand becomes a useful collective opportunity and people demonstrably do less work. The spec should give three agents enough clarity to build that example without inventing incompatible products.

## Reference material

The founder supplied these sponsor presentations. Use them for intent and prize guidance, then verify implementation details in the current hackathon documentation:

- Alike: https://www.youtube.com/watch?v=3Q9svOgVb0c
- Darwin: https://www.youtube.com/watch?v=8VHwB8DzBxQ
- Keewano: https://www.youtube.com/watch?v=Dze41VXU0JE
- Sparta: https://www.youtube.com/watch?v=P-Z4lLUSUvc
- Dial: https://www.youtube.com/watch?v=qTXdYPvL8PM

Darwin resources mentioned on stage: https://darwin.so/speedhacks
Alike documentation mentioned on stage: https://alike.help
Other sponsor starter files and resources were provided through HackerSquad.

Do not rely on earlier brainstorming as proof of product capabilities, competitors, or market statistics. If outside research is needed, prefer primary documentation and dated 2025–2026 evidence available on or before October 11, 2026. Keep research focused on choices that affect today's build.
