# Task 2.1 — Design effective tool interfaces with clear descriptions and boundaries

> **Domain 2 · Tool Design & MCP Integration** · 18% of the exam
>
> _Focus: descriptions as the selection signal, eliminating overlap, splitting generics, auditing prompts that override descriptions._

## Why this matters

Every other Domain 2 task — error handling (2.2), `tool_choice` and catalog sizing (2.3), MCP servers (2.4), built-in tools (2.5) — assumes the model can pick the right tool from your catalog. The exam probes this with two recurring patterns: "two tools have near-identical descriptions and the agent misroutes — what do you fix?" and "the system prompt and the tool descriptions disagree — which wins, and what do you change?". This lesson maps directly to **Scenario 1 (Customer Support)** and **Scenario 3 (Multi-Agent Research)**, where custom MCP tools succeed or fail on description quality alone.

## Descriptions as primary tool-selection signal for LLMs

The model does not read your code. When Claude decides whether to call `lookup_order` or `get_customer`, it compares the **user's intent** to each tool's **description** plus its **input schema**. The description is the dominant signal — names and parameter types help, but a vague or generic description ("Looks up data") forces the model to guess based on tool name alone, and that guess degrades fast as the catalog grows past a handful of similar-sounding tools.

Write the description as if a new engineer is reading it cold and must decide, in one read, *when to reach for this tool and when not to*. It should answer: **what does it return**, **what inputs does it expect**, and **what does it explicitly not do**. Minimal one-liners ("Get the order") describe what the tool *is* but not *when it applies*, so the model fills the gap probabilistically.

**Example.** Compare these two descriptions for the same MCP tool:

- Bad: `lookup_order` — "Look up an order."
- Good: `lookup_order` — "Retrieves a single order by `order_id` (format: `ORD-` followed by 8 digits, e.g. `ORD-00451209`). Returns line items, status, and shipping events. Use this when the user gives you a specific order ID; use `search_orders_by_customer` instead when you only have the customer email or name."

The good version anchors the model on inputs, outputs, and **the boundary with a sibling tool**.

> **Common pitfall** — Treating descriptions as cosmetic documentation for humans. The exam often shows a system that "works fine in testing" but misroutes in production once a second similar tool is added; the fix is almost always *strengthen the description*, not "add a router."

**Quick recall**
- **Q:** What is the dominant signal Claude uses to choose between similar tools? → The tool **description** (with input schema as a secondary cue).
- **Q:** Why do minimal descriptions degrade as the tool catalog grows? → The model has no boundary criteria to disambiguate, so selection becomes a name-similarity guess.

## Including input formats, examples, edge cases, and boundary explanations

A strong description has four parts the exam expects you to recognize: **input format** (with a literal example), **expected output**, **example queries / when-to-use** phrasing, and **edge cases / boundary explanations** (what this tool does *not* handle, and which sibling handles it instead). All four together form the "contract" the model reasons over.

Concretely, for an MCP tool `process_refund`, a contract-shaped description looks like: "Issues a refund against an existing order. Inputs: `order_id` (`ORD-` + 8 digits) and `amount_cents` (integer ≤ order subtotal). Returns a `refund_id` and the new order status. **Use when** the customer has been verified, the order is in a refundable state (delivered or cancelled-with-payment), and the refund amount is at-or-below the line-item subtotal. **Do not use** for store-credit or replacement requests — call `issue_store_credit` or `create_replacement_order` for those."

Notice three things this does:
1. The **literal input format** ("`ORD-` + 8 digits", "integer ≤ order subtotal") prevents the model from inventing free-form values or sending dollars instead of cents.
2. The **when-to-use** sentence anchors selection on situational criteria, not just tool name.
3. The **do-not-use** sentence redirects misroutes to the right sibling, eliminating overlap before it happens.

Edge-case statements ("returns empty list when the customer has no orders — that is **not** an access failure") also defuse a common downstream confusion (Task 2.2's empty-vs-error distinction). The description is the cheapest place to land that disambiguation.

> **Common pitfall** — Listing parameters in the schema but not in the prose description, then assuming the model "will infer" the format. JSON-schema types tell the model that `amount_cents` is an integer, but only the description tells it that the unit is cents and that it is bounded by the order subtotal.

**Quick recall**
- **Q:** What four things should a complete tool description contain? → Input format with example, expected output, when-to-use criteria, and do-not-use / boundary statements.
- **Q:** Where should you state that an empty result is *not* an error? → In the tool description itself, so the model handles it correctly without a follow-up call.

## Eliminating overlap by renaming and re-scoping

When two tools have near-identical descriptions, the model misroutes — sometimes deterministically (it always picks the alphabetically-first one), sometimes erratically across runs. The fix on the exam is almost never "add reasoning" or "lower temperature" — it is to **rename and re-scope** so each tool has a non-overlapping purpose.

The canonical example: a research agent has both `analyze_content` and `analyze_document` with descriptions like "Analyzes content" and "Analyzes a document." The model can't tell them apart, so it calls `analyze_content` on PDFs (wrong) and `analyze_document` on web pages (also wrong). The fix: rename `analyze_content` to **`extract_web_results`** and rewrite its description to be web-page-specific ("Extracts the headline, body text, and outbound links from a fetched HTML page; use after `fetch_url`"). The renamed tool now has a *different shape of purpose* than `analyze_document`, and the model's selection rate jumps because the tools no longer compete for the same intent.

**Example workflow** — before:

- `analyze_content(text)` — "Analyzes content."
- `analyze_document(doc)` — "Analyzes a document."

After:

- `extract_web_results(html)` — "Extracts headline, body, and links from a fetched web page (HTML)."
- `extract_pdf_sections(pdf_bytes)` — "Returns the section tree, body text, and tables from a PDF."

Each tool now corresponds to a distinct **input modality** and **output shape**, so the model has unambiguous selection criteria.

> **Common pitfall** — Trying to fix overlap by editing the system prompt ("when the input is a PDF, use `analyze_document`"). This is fragile: the system prompt may help today but breaks the moment a third similar tool joins, and it doesn't solve the underlying ambiguity. Rename and re-scope instead.

**Quick recall**
- **Q:** Two tools with near-identical descriptions — what is the right fix? → Rename one and rewrite its description so the tools no longer compete for the same intent.
- **Q:** Why is "let the system prompt route between similar tools" an anti-pattern? → It papers over the ambiguity instead of removing it; each new similar tool re-introduces the bug.

## Splitting generic tools into purpose-specific ones with defined contracts

A single generic tool ("`analyze_document`") forces every caller into the same input/output contract regardless of intent. That collapses three different jobs — pulling structured fields, condensing a long passage, and verifying a specific claim — into one prompt-driven call where the model decides the output shape on the fly. The result is unstable outputs and brittle downstream parsers.

The fix is **decomposition**: split the generic tool into multiple purpose-specific tools, each with its own narrow input/output contract:

- `extract_data_points(doc, fields)` → returns `{ field: value }` per requested field.
- `summarize_content(doc, max_words)` → returns a single summary string of bounded length.
- `verify_claim_against_source(claim, doc)` → returns `{ supported: bool, evidence_span: string }`.

Each of these has a stable, machine-checkable output shape. Downstream code can validate against a schema. The model's selection becomes deterministic because the *intent* maps cleanly to one tool — extract vs summarize vs verify are different verbs.

The trade-off the exam probes: more tools means a larger catalog, which can hurt selection if it explodes (Task 2.3 covers the ~18-tool overload failure mode). Split *purposefully* along distinct verbs / contracts, not per micro-feature.

> **Common pitfall** — Splitting a generic tool but giving each child a vague description ("`extract_data_points` — extracts data points"). The new tools then collide with each other or with the original, and you've added catalog size without buying selection clarity. Each split must come with a sharpened, contract-shaped description.

**Quick recall**
- **Q:** Why split `analyze_document` into `extract_data_points` / `summarize_content` / `verify_claim_against_source`? → Each has a narrow input/output contract, so outputs are stable and the model's selection maps cleanly to the user's verb (extract / summarize / verify).
- **Q:** What's the catalog-size trade-off when splitting tools? → Too many tools degrades selection (Task 2.3); split only along distinct verbs and contracts, not per micro-feature.

## Auditing system prompts for keyword-sensitive instructions that override descriptions

Even with strong descriptions, a poorly worded system prompt can quietly **re-route tool selection by keyword association**. Phrases like "when you see anything financial, always call `audit_log`" or "any user mention of 'urgent' should trigger `escalate_to_human`" create implicit rules that fire on substring matches and will override what your tool descriptions say.

This shows up on the exam as: "the team added a sentence to the system prompt and now `tool_X` is being called for every customer message." The diagnosis is to **audit the system prompt for keyword-sensitive instructions** — phrases that make tool selection a function of input substrings rather than the model's reasoning over descriptions. Two failure modes:

1. **Unintended association.** A prompt sentence designed to handle one edge case ("if the customer mentions a 'chargeback', call `freeze_account`") fires on every benign mention of the word, including in quotes from old emails the customer is forwarding.
2. **Description override.** When the prompt's keyword rule conflicts with a tool's description ("use only after verification"), the keyword rule tends to win because it is more concrete and recently positioned in the prompt.

**Example fix.** Before: system prompt says "always call `process_refund` when the customer says 'refund'." After: remove that sentence; rely on `process_refund`'s description ("Use when the customer is verified, the order is in a refundable state, and the requested amount is at-or-below the order subtotal"). Selection now reasons over situational criteria instead of substring presence.

> **Common pitfall** — Adding system-prompt rules to "help" tool selection, then debugging the resulting misroutes by adding more rules. The net effect is a prompt full of keyword triggers that fight your descriptions. Strip the keyword rules and invest in description quality instead.

**Quick recall**
- **Q:** What kind of system-prompt phrasing tends to override tool descriptions? → Keyword-sensitive instructions ("when you see X, always call Y") that make selection a substring rule.
- **Q:** How do you fix a tool that suddenly fires on every message after a system-prompt edit? → Audit the prompt for the keyword rule that introduced the association; remove it and let the tool description carry the selection logic.

## Anti-patterns

- ❌ **One-line "Looks up data" descriptions.** Tells the model what the tool is, not when it applies. Selection collapses as soon as a second similar tool exists.
- ✅ **Write contract-shaped descriptions: input format, output, when-to-use, do-not-use.**
- ❌ **Two tools with near-identical descriptions.** Misroutes deterministically (or worse, erratically) because the model has no boundary to disambiguate.
- ✅ **Rename and re-scope so each tool has a non-overlapping purpose.**
- ❌ **Fixing overlap with system-prompt routing rules.** Fragile — each new similar tool re-introduces the bug, and the rules accumulate into a prompt that contradicts itself.
- ✅ **Fix overlap structurally in the descriptions; never paper over it with prompt rules.**
- ❌ **Generic do-everything tools (`analyze_document`).** Collapses distinct verbs (extract / summarize / verify) into one fuzzy contract; outputs become unstable and downstream parsing brittle.
- ✅ **Split into purpose-specific tools, one per verb, each with a narrow input/output contract.**
- ❌ **Splitting tools without sharpening descriptions.** Adds catalog size without buying selection clarity; the children collide with each other.
- ✅ **Pair every split with sharpened, contract-shaped descriptions for each child.**
- ❌ **Keyword-sensitive system-prompt instructions.** ("If user says 'urgent', call `escalate`.") Fires on substring matches and overrides tool descriptions.
- ✅ **Let the tool description carry selection logic — strip keyword rules from the system prompt.**
- ❌ **Documenting input format only in JSON schema.** The model knows the type but not the unit, range, or business constraint.
- ✅ **Put units, ranges, and business constraints in the prose description alongside the schema.**
- ❌ **Treating empty results as access errors in the description's silence.** Forces downstream callers to re-implement the distinction.
- ✅ **State explicitly in the description that an empty result is a valid, non-error outcome.**

## Worked example — Scenario S1 (Customer Support Resolution Agent)

A team builds the support agent with four MCP tools: `get_customer`, `lookup_order`, `process_refund`, `escalate_to_human`. In production they observe that whenever a customer's message contains the word "issue", the agent calls `escalate_to_human` immediately — even for trivial questions. They also see `get_customer` and `lookup_order` being interchanged, with the agent calling `get_customer` and then trying to read order fields from it.

Diagnosis: the escalation behavior points at a **keyword-sensitive system-prompt instruction** ("when the customer raises an issue, escalate"). Remove that sentence; sharpen `escalate_to_human`'s description to enumerate when-to-use criteria (explicit human request, policy gap, repeated failed resolution). The `get_customer` / `lookup_order` confusion is **description overlap** — both said "Looks up customer data." Rename and rewrite: `get_customer` → "Returns customer profile by `customer_id` or email; **does not return orders** — use `lookup_order` for order data." `lookup_order` → "Returns a single order by `order_id`; takes no customer parameters." Misroutes drop and escalations return to baseline.

## Quick recall (full set)

- **Q:** What is the dominant signal Claude uses to choose between similar tools? → The tool **description** (with input schema as a secondary cue).
- **Q:** Name the four parts of a complete tool description. → Input format with example, expected output, when-to-use criteria, and do-not-use / boundary statements naming the right sibling.
- **Q:** Two tools with near-identical descriptions misroute — what's the fix? → Rename one and rewrite its description so the tools no longer compete for the same intent; don't try to route in the system prompt.
- **Q:** Why split `analyze_document` into `extract_data_points`, `summarize_content`, `verify_claim_against_source`? → Each has a narrow input/output contract, stabilising outputs and mapping cleanly to the user's verb.
- **Q:** What's the catalog-size trade-off when splitting tools? → Too many tools degrades selection (Task 2.3); split only along distinct verbs / contracts, not per micro-feature.
- **Q:** What kind of system-prompt phrasing silently overrides tool descriptions? → Keyword-sensitive instructions ("when you see X, always call Y") that turn selection into a substring rule.
- **Q:** Where do you state that an empty result is *not* an access failure? → In the tool description itself, so the model handles it correctly without a follow-up call.
- **Q:** Why is the JSON schema alone insufficient to describe an `amount_cents` parameter? → The schema gives the type but not the unit, range, or business constraint; those belong in the prose description.
- **Q:** A team adds a system-prompt sentence and `tool_X` starts firing on every message — what's the diagnostic step? → Audit the system prompt for the keyword rule that introduced the unintended association and remove it.
- **Q:** What's the right number of tools to split a generic tool into? → As many as there are distinct verbs / contracts — not one per micro-feature; sharpened descriptions are required for each.
