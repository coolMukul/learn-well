# Task 4.3 — Structured output via tool_use and JSON schemas

> **Domain 4 · Prompt Engineering & Structured Output** · 20% of the exam

## Why this matters

When a downstream system parses Claude's reply — a DB insert, an ETL job, a workflow branching on `category == "invoice"` — "the model usually gets the JSON right" is an outage waiting to happen. Topic 4.3 is about the technique that **eliminates that whole class of failure**: declare the shape as a **JSON schema on a tool's `input_schema`**, give Claude that tool, and force the call. The API then guarantees the `tool_use.input` payload conforms — no free-form parsing, no regex.

The trap, and where Domain 4 questions concentrate, is over-trusting that guarantee. A schema enforces **shape** — keys, types, enums, required-ness. It does **not** enforce **semantics**: line items can fail to sum to total, the shipping address can land in the billing slot, a date can be syntactically valid in the wrong format. Mastery means knowing what tool_use buys you, what it doesn't, and where to push the rest — `tool_choice`, optional fields, well-designed enums, prompt-level normalisation.

---

## tool_use + JSON schema = guaranteed schema-compliant output

The mechanism: define a tool whose **`input_schema`** is the JSON schema for the output you want; register it. When Claude calls it, the API returns a `tool_use` block whose **`input`** is a JSON object conforming to your schema. There is no "trailing comma" failure — **the API enforces JSON-syntactic and schema-shape compliance** before the response leaves the server.

Canonical example: an invoice extractor declares `extract_invoice` with `input_schema` of `{type:"object", properties:{invoice_number:{type:"string"}, total:{type:"number"}, line_items:{type:"array",...}}, required:["invoice_number","total","line_items"]}`. Claude reads the source PDF, calls `extract_invoice`, and the harness reads `response.content[0].input.invoice_number` directly — no `json.loads`, no try/except for malformed braces.

Compare with the older "ask Claude for JSON in a code fence" pattern: that survives 95% of inputs and fails on the rest with prose preambles, inconsistent quoting, or markdown leakage. Tool use eliminates that failure mode by construction — there is no free-form text channel for the structured payload.

> **Common pitfall** — Treating tool use as "just a way to call functions" and missing that it doubles as the supported pattern for **structured data extraction**. The "tool" doesn't have to do anything; it can be a pure schema container the harness reads `input` from and never executes.

**Quick recall**
- **Q:** What does declaring a tool with a JSON `input_schema` guarantee about Claude's response? → That the `tool_use.input` payload conforms to the schema (valid JSON syntax, declared keys, types, required fields, enum values).
- **Q:** What problem does tool_use eliminate compared to "ask for JSON in a code fence"? → Free-form-text JSON parse failures (trailing commas, prose preambles, markdown fences, quoting inconsistencies).

## Schema enforces structure, NOT semantics

This is the most-tested distinction in the topic. The schema validator runs at the **shape** layer — *is `total` a number, are required keys present, is `currency` one of the declared enums?* It does **not** run at the **meaning** layer — *do the line items sum to the total, did the right address land in the billing field, is the invoice date plausibly in the fiscal year?*

A worked failure: an extractor returns `{"subtotal":80, "tax":8, "total":100, "line_items":[{"price":40},{"price":40}]}`. The schema is happy. But $80 + $8 ≠ $100 and line items sum to $80. **The pipeline accepts this row**; the discrepancy surfaces a week later in finance reconciliation.

A second class is **field-placement errors**. The shipping address is well-formed JSON but Claude wrote it into `billing_address` because the source labelling was ambiguous. Schema-valid, silently wrong. The fix is not "stricter schema" — schemas can't express "billing must come from 'Bill To'." It lives in the prompt (clarify label-to-field mapping) and **post-extraction validators** (Pydantic-style checks for sums, cross-field consistency, plausible dates).

> **Common pitfall** — "The schema will catch the math error." It won't. JSON schema validates types and presence, not arithmetic relationships between fields. Add a downstream validator if cross-field consistency matters.

**Quick recall**
- **Q:** Will a JSON schema catch line items that don't sum to the declared total? → No — schemas validate shape (types, required-ness, enums), not arithmetic or cross-field consistency.
- **Q:** Where does the work of catching "right value in wrong field" belong? → In the prompt (disambiguate which source label maps to which schema field) and in a downstream semantic validator (e.g., Pydantic), not in the schema itself.

## tool_choice: 'auto' vs 'any' vs forced tool

`tool_choice` decides **whether and which** tool Claude must call. Three values to know cold:

- **`tool_choice: "auto"`** (the default) — Claude **may** call a tool **or** reply with plain text. Right for conversational agents. **Wrong** for "I need structured output next" because the model can decide to chat instead of calling the extractor.
- **`tool_choice: "any"`** — Claude **must** call a tool but is free to pick **which**. Right when you have **multiple extraction schemas** (e.g., `extract_invoice`, `extract_purchase_order`, `extract_receipt`) and the document type is unknown — guaranteed structured output, Claude picks the matching schema.
- **`tool_choice: {"type": "tool", "name": "extract_metadata"}`** — Claude **must call exactly that tool**. Right when the next stage requires a specific schema: "emit `extract_metadata` now, enrichment in a follow-up turn."

Pattern: a document-ingest pipeline runs **forced** `extract_metadata` on turn one to guarantee the payload, then drops to `auto` on turn two so Claude can decide whether enrichment tools are needed.

> **Common pitfall** — Using `tool_choice: "auto"` and being surprised when Claude returns text on the turn you needed JSON. If the next step requires structured output, force the tool.

**Quick recall**
- **Q:** Three documents may arrive (invoice / PO / receipt) and you want guaranteed structured output without hard-coding which schema to use. Which `tool_choice`? → `"any"`.
- **Q:** You need `extract_metadata` to run before any enrichment step. Which `tool_choice`? → Forced: `{"type": "tool", "name": "extract_metadata"}`.
- **Q:** Default `tool_choice` and what risk does it carry for extraction? → `"auto"` — Claude may reply with text instead of calling the tool, so you can't rely on it for guaranteed structured output.

## Optional / nullable fields prevent fabrication

If a field is **required** and Claude can't find it in the source, the model is **incentivised to invent one** to satisfy the schema. Phone numbers get fabricated, dates get guessed, addresses get pattern-matched to plausible strings. The schema accepts them — they're well-typed — and the pipeline writes garbage to the DB.

The fix: **mark fields that may legitimately be absent as optional or nullable**. Either omit from `required` (model can leave it out) or declare `"type":["string","null"]` (model can return `null`). When the source doesn't mention a phone number, Claude returns `null`, the harness writes `NULL`, and the truth — *we don't know this customer's phone* — is preserved.

Worked example: an `extract_contact` tool has `email`, `phone`, `address` as nullable strings. Source lists only an email. Claude returns `{"email":"x@y.com","phone":null,"address":null}` — honest, schema-valid; downstream code branches on `null` to skip enrichment.

> **Common pitfall** — Making every field `required` "to keep the schema strict." Converts a missing-data problem into a fabrication problem. Required is for fields the document **always** contains; everything else nullable.

**Quick recall**
- **Q:** Source document doesn't contain a phone number, but the schema marks `phone` as a required string. What does Claude tend to do? → Fabricate a plausible-looking phone number to satisfy the schema.
- **Q:** How do you let Claude honestly signal "the document didn't contain this value"? → Mark the field optional (omit from `required`) or nullable (`type: ["string","null"]`) so the model can return `null`.

## Enums with 'unclear' / 'other' + detail for extensible categories

Closed enums are powerful — `"category": {"enum":["invoice","purchase_order","receipt"]}` guarantees one of three known strings. But real streams are messy: a document may be a **credit memo**, or **ambiguous** from the snippet. A strict three-value enum forces Claude to pick the **least-wrong** option, silently corrupting the dataset.

Two patterns to know:

1. **`"unclear"` as an enum value** — for cases the model can't confidently classify. With a review queue, this surfaces ambiguous documents instead of miscategorising them.
2. **`"other"` + detail string** — for legitimately new categories. `{"category":{"enum":[...,"other"]}, "category_detail":{"type":["string","null"]}}` lets Claude return `{"category":"other","category_detail":"credit memo"}`. The harness flags it for review and periodically promotes frequent `category_detail` values into the enum.

A 90%-accurate classifier with `unclear`/`other` produces a ~10% review queue humans triage; without them, a 10% silently-wrong dataset no one inspects.

> **Common pitfall** — Tightening enums "to force precision." It produces more confident wrong answers, not more right ones. Add `"unclear"` and an `"other"` + detail pattern; review the resulting tail offline.

**Quick recall**
- **Q:** Why is `"unclear"` a useful enum value alongside the real categories? → It surfaces ambiguous documents to a review queue instead of forcing Claude to pick a least-wrong category that silently corrupts the dataset.
- **Q:** How do you keep an enum extensible without rewriting it? → Add `"other"` plus a `category_detail` string; periodically promote frequent details into named enum values.

## Format normalization rules in the prompt alongside the schema

The schema can say `"date": {"type":"string"}`. It cannot say "ISO 8601, UTC." It can say `"amount": {"type":"number"}` but not "two decimals, USD, no `$` prefix." Format rules — date formats, currency precision, casing, trimming — belong in the **prompt**, because the schema's expressive power stops at "is this a string."

The pattern: list normalisation rules concisely in the system or user prompt. *"Dates as `YYYY-MM-DD`. Amounts as numbers (no symbols, two decimals). Countries as ISO-3166 alpha-2. Trim whitespace. Missing values: return `null`, do not guess."* Then provide the schema. Claude obeys both: schema for shape, prompt rules for format.

Example: source dates appear as `"April 4, 2026"`, `"4/4/26"`, `"04-Apr-2026"`. The schema accepts any string. With "**Dates must be `YYYY-MM-DD`**" in the prompt, Claude normalises all three to `"2026-04-04"`. Without the rule, the warehouse gets three formats.

> **Common pitfall** — Encoding format rules as regex `pattern` constraints in the schema. Some are expressible, most aren't. Even when expressible, a schema-validation failure is a worse signal than a value Claude formatted correctly the first time.

**Quick recall**
- **Q:** Where do format rules (date format, currency precision, casing) belong — schema or prompt? → Prompt. The schema enforces shape; format normalisation is a content rule the schema can't express cleanly.
- **Q:** Why is "schema with strict regex pattern for every string field" not the answer? → Most format rules aren't expressible as regex, and a schema-validation failure is a poorer signal than Claude producing the correctly normalised value the first time.

---

## Anti-patterns

- ❌ **"Reply in JSON inside a code fence" prompts for production extraction.** Fails on the long tail with malformed JSON, prose preambles, or markdown leakage.
- ✅ **Define an extraction tool with a JSON `input_schema`; read `tool_use.input` directly.**
- ❌ **`tool_choice: "auto"` when the next stage requires structured output.** Claude may reply with text and break the pipeline.
- ✅ **Force the specific tool (`{"type":"tool","name":"extract_metadata"}`) or use `"any"` when multiple schemas are valid.**
- ❌ **"The schema will catch the math error."** Schemas don't validate cross-field consistency; line items can fail to sum and the schema is happy.
- ✅ **Add a downstream semantic validator (e.g., Pydantic) for arithmetic and cross-field rules.**
- ❌ **Marking every field `required` to "keep the schema strict."** Converts missing data into fabricated data.
- ✅ **Required only for fields the document always contains; everything else nullable.**
- ❌ **Tightening enums to a small closed set "to force precision."** Forces least-wrong picks on ambiguous documents.
- ✅ **Include `"unclear"` for ambiguous cases and `"other"` + a detail string for extensible categories.**
- ❌ **Encoding date/currency/casing rules as regex `pattern` constraints in the schema.** Most rules aren't cleanly expressible; validation failures are a worse signal than a normalised value.
- ✅ **List format normalisation rules in the prompt; let the schema enforce shape only.**
- ❌ **Using `tool_choice: "any"` with a single registered extraction tool "to be safe."** Less explicit than forcing the tool by name.
- ✅ **Force the specific tool by name when there's only one valid schema.**

---

## Worked example — Scenario S6 (Structured Data Extraction)

A finance team needs invoices extracted from PDFs into a warehouse. Each row needs `invoice_number`, `vendor_name`, `total_amount`, `currency`, `invoice_date`, optional `due_date`, and `line_items`. The "ask Claude for JSON" approach produced a 4% malformed-row rate breaking nightly ETL.

The disciplined design:

1. **Define `extract_invoice`** with the row shape as `input_schema`. Required: `invoice_number`, `vendor_name`, `total_amount`, `currency`, `invoice_date`, `line_items`. Nullable: `due_date`. `currency` enum: `["USD","EUR","GBP","other"]` plus nullable `currency_detail`.
2. **Force the tool**: `tool_choice: {"type":"tool","name":"extract_invoice"}` — next stage needs the row, no exceptions.
3. **Prompt rules**: dates as `YYYY-MM-DD`; amounts as numbers, two decimals, no symbol; vendor names trimmed and title-cased; missing values → `null`, don't guess.
4. **Read `response.content[0].input`** directly — no JSON parse, no regex.
5. **Post-extraction Pydantic validator**: `sum(line_items.amount) == total_amount` within 1¢, `invoice_date <= due_date` if both present, `currency_detail` required when `currency == "other"`. Failures route to a review queue.

Malformed-row rate drops to zero. Semantic errors become the validator's responsibility — failing loudly, not silently. When "row 8421 has total $100 but line items summing $80" flags, the team knows which document to re-process; in the old pipeline that row was accepted and invisible until reconciliation.

---

## Quick recall (full set)

- **Q:** What does a tool with JSON `input_schema` guarantee? → `tool_use.input` conforms to the schema (valid JSON, declared keys, types, required fields, enums).
- **Q:** What error class does tool_use **not** prevent? → Semantic errors — line items not summing, values in the wrong field, dates in the wrong format.
- **Q:** Where does cross-field consistency live? → A downstream validator (e.g., Pydantic), not the schema.
- **Q:** `tool_choice: "auto"`? → Model may call a tool or reply with text — default, unsafe for guaranteed structured output.
- **Q:** `tool_choice: "any"`? → Must call a tool, free to pick which — right when multiple schemas exist and the document type is unknown.
- **Q:** `tool_choice: {"type":"tool","name":"extract_metadata"}`? → Must call **that** tool — right when the next stage needs that exact schema.
- **Q:** Required field, value missing in source — what does Claude tend to do? → Fabricate a plausible value to satisfy the schema.
- **Q:** Fix? → Mark the field optional or nullable so Claude can return `null` honestly.
- **Q:** Why include `"unclear"`? → Surfaces ambiguous documents to a review queue instead of forcing a least-wrong category.
- **Q:** Why `"other"` + detail string? → Keeps the enum extensible; promote frequent details into named values periodically.
- **Q:** Format rules — schema or prompt? → Prompt. Schema enforces shape; format normalisation is a content rule.
- **Q:** Single registered extraction tool — `"any"` or forced? → Forced by name; `"any"` works but is less explicit.
- **Q:** Why is "every field required" a bad default? → Forces fabrication when the document is silent; nullable preserves the truth.
