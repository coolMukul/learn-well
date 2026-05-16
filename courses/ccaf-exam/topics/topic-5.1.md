# Topic 5.1 — Conversation context preservation

> **Domain 5 · Context Management & Reliability** · 15% of the exam

## Why this matters

Long-running agent conversations — a 30-turn support thread, a multi-step research session, a coding task across a dozen files — accumulate context faster than people expect. Tool results balloon, summaries get applied, and critical facts silently disappear. **The exam tests whether you can name each failure mode and pair it with the right deterministic fix.**

The pattern is uniform: a customer states an exact dollar amount, deadline, and expectation; twenty turns later the agent confidently proposes "around $200 in store credit by next week." Nobody hallucinated — precision was *flattened* by progressive summarization, *positionally lost* in a long context, or *crowded out* by 40-field tool dumps. The wrong instinct is "give the model more context" / "increase the window." The right instincts are structural: persistent case-facts blocks, trimmed tool outputs, position-aware ordering.

## Progressive summarization risks: numbers, dates, customer-stated expectations get vague

**Progressive summarization** — periodically condensing earlier turns into a shorter recap to fit the window — has a sharp, predictable failure mode: **precise transactional details are exactly the token-dense content a summarizer flattens first**. Customer-quoted dollar amounts ("$247.50"), ISO dates ("2026-04-12"), order numbers ("ORD-88421"), and direct expectations ("full refund, not store credit") get smoothed into "the customer mentioned a refund and a deadline."

**Concrete example.** Turn 3, customer: *"My order ORD-88421 for $247.50 was supposed to arrive 2026-04-12 — I want a full refund to the original card."* By turn 25 the running summary reads *"Customer is unhappy about a late order and wants a refund."* The agent then proposes "store credit of approximately $250" — wrong on three axes (amount, mechanism, order ID).

The fix is **not** "write a better summarizer prompt." The fix is to never put those facts at the mercy of summarization in the first place — extract them once into a **persistent case facts block** (§4), and let the summary compress only the discussion *around* the facts.

> **Common pitfall** — Treating summarization quality as the lever. Even a perfect summarizer tradeoffs precision for brevity by definition; structurally exempt the precise facts from being summarized.

**Quick recall**
- **Q:** Which kinds of detail are most degraded by progressive summarization? → Precise numbers, dates, IDs, and customer-quoted expectations — the things that round to "approximately."
- **Q:** Why is "improve the summarizer prompt" not the right fix? → Summarization compresses by design; the fix is to keep precise facts *out of* the summarized stream.

## Lost-in-the-middle effect: middle sections may be omitted

The **"lost in the middle"** effect: in long inputs, content at the **beginning** and **end** is recalled reliably; information in the **middle** is more often missed, glossed over, or paraphrased away. It's a **positional** effect, not a window-size effect — making the window bigger does not help and may make it worse, because the middle gets longer.

**Concrete example.** Turn 12 of a 30-turn support conversation contains the most important fact: the customer's **shipping address changed mid-order**. The agent processes the refund correctly but ships the replacement to the old address — turn 12 sat in the middle, and the model latched onto first-turn intake and recent-turn pleasantries.

**Anti-trap:** candidates who answer "increase the context window" are wrong. The remediation is **position-aware ordering** (§6) — pull key findings to the **start**, organize the rest under explicit headers, let recency handle the tail. Move important facts *out of* the middle; don't make the middle bigger.

> **Common pitfall** — Diagnosing lost-in-the-middle as a window-size problem. The effect is positional; doubling the window doesn't fix it and can worsen it. Move the facts, don't grow the container.

**Quick recall**
- **Q:** Where in a long context are facts most likely to be omitted? → The **middle**; beginning and end are recalled most reliably.
- **Q:** Does increasing the context window fix lost-in-the-middle? → No — the effect is positional, not size-driven.

## Tool results consume disproportionate tokens (40+ fields when 5 are relevant)

A single `lookup_order` call can return 40+ fields: line items, prices, shipping carrier, tracking events, warehouse codes, GL account, SLA flags, and so on. For a refund decision the agent needs **five**: order ID, total, status, return-eligibility, and original payment method. The other 35 fields sit in history forever, **occupying tokens every turn**, crowding out the conversation.

**Concrete example.** A 20-turn session calls four tools, each returning ~3,000 tokens of raw JSON. By turn 10, tool results occupy ~12,000 tokens; actual dialogue is ~2,000. The model is "thinking through" mostly noise.

The fix is to **trim tool outputs *before* they enter accumulating context** — in the tool wrapper, a result-shaping step, or via a structured output schema. Trimming after the fact (post-summarization, post-compaction) is too late: the bloat already cost iterations of attention.

> **Common pitfall** — Letting tools return their full backend payload "for completeness" and planning to compress later. The cost is paid every turn between accumulation and compaction; trim at the boundary.

**Quick recall**
- **Q:** Why are verbose tool outputs disproportionately expensive? → They sit in history every turn, multiplying token cost long after the call.
- **Q:** When should the trim happen? → **Before** accumulation — at the tool wrapper / result-shaping step — not after the context is already polluted.

## Persistent "case facts" block included in each prompt outside summarized history

The deterministic remedy for both progressive-summarization vagueness *and* lost-in-the-middle is a **persistent case facts block**: a structured panel of transactional facts (customer ID, order ID, amounts, dates, root cause, agreed remedy) **injected into every prompt outside the summarized history**. Because it sits *outside* the summarized stream, the summarizer can't smooth it. Because it lives in a fixed position (right after the system prompt, or just before the latest user turn), the model sees it consistently — no positional drift.

**Concrete example.** A support session pins:

```
CASE FACTS
- Customer: CUST-7741 (Maya Patel, Gold tier)
- Order: ORD-88421, $247.50, placed 2026-04-08
- Promised delivery: 2026-04-12 (4 days late)
- Customer expectation: full refund to original card (not store credit)
- Root cause: carrier mis-route, tracking event T-3309
```

Whatever the summarizer does to the chat history, those lines arrive verbatim every turn. The "approximately $250" / "store credit" / "couple weeks ago" failure modes become **structurally impossible** — not "less likely with a better prompt." The pattern generalizes: research agents pin a "key findings" block; coding agents pin a "task contract + acceptance criteria" block; multi-issue sessions pin one block per open ticket.

> **Common pitfall** — Relying on the summarizer or the model's "memory" to preserve case facts. Both are best-effort; the case-facts block is the *deterministic* fix.

**Quick recall**
- **Q:** What is the deterministic fix for losing precise customer details in a long support conversation? → A **persistent case facts block** injected each turn outside the summarized history.
- **Q:** Why does it work when better summarization doesn't? → It bypasses summarization entirely — the facts are never compressed, and they sit in a stable, recalled position.

## Trimming verbose tool outputs to relevant fields before context accumulation

The implementation companion to §3 is the actual **trimming step**: the moment a tool returns, project the result down to the fields the agent will use; only the trimmed projection enters history. The verbose original is logged elsewhere (observability, audit).

**Concrete example.** `lookup_order` returns 40 fields. Your wrapper keeps `{ order_id, total, status, return_eligible, payment_method }`. The `tool_result` appended to history is a 5-field JSON object, not 40. Across 20 turns and four tools, you've removed tens of thousands of tokens of cumulative bloat.

Two correctness rules. First, **don't drop the `tool_result` block itself** (Topic 1.1) — every `tool_use` needs a matching `tool_result` correlated by `tool_use_id`. You're trimming the *content*, not removing the block. Second, **trim before accumulation, not after** — once verbose results are in history, removing them later breaks the `tool_use_id` linkage. Best practice: **make the tool itself return the trimmed shape** — that's an architecture, not a patch.

> **Common pitfall** — Trimming after the fact (during compaction or summarization) instead of at the tool boundary. By then the tokens have already cost you turns of attention dilution.

**Quick recall**
- **Q:** Where in the loop should verbose tool outputs be trimmed? → At the tool wrapper / result-shaping step, **before** the `tool_result` block enters history.
- **Q:** What must you preserve when trimming a tool result? → The `tool_result` block itself (and its `tool_use_id`); only trim the *content*.

## Position-aware ordering: key findings at start, organized headers

Given lost-in-the-middle, **how you order content** within an aggregated input determines what the model recalls. **Position-aware ordering**: put **key findings / decisions at the start**, **detailed evidence behind explicit headers**, and let recent dialogue sit at the tail. Don't bury the headline in paragraph 9.

**Concrete example.** A research subagent returns a 4,000-token chronological report ("Step 1, Step 2, ... Conclusion"). After a few more turns, the conclusion lands in the middle of the next agent's context. Fix: lead with **TL;DR / KEY FINDINGS**, then an **EVIDENCE** section with headers (`## Source A`, `## Source B`, `## Methodology`). The headline is now at the start, and the middle is *organized* rather than *free prose*.

The principle applies to subagent contracts: require structured outputs with **metadata** — dates, source citations, relevance scores, key findings up top — so the caller doesn't have to mine prose. The case-facts block sits *before* the summarized history for the same reason: "before" is a recalled position.

> **Common pitfall** — Trusting chronological or "natural" ordering. Long inputs aren't read like a novel; the model attends most strongly to the head and tail, so put the load-bearing content there.

**Quick recall**
- **Q:** Where should key findings sit in a long aggregated input? → At the **start**, with detailed evidence behind explicit section headers.
- **Q:** Why do explicit headers help mitigate lost-in-the-middle? → They give the model navigable structure rather than undifferentiated prose, and they cluster related material so positional drop-off applies to *less* critical content.

## Anti-patterns

- ❌ **"Just increase the context window."** Doesn't fix lost-in-the-middle (positional, not size-driven) and worsens tool-result bloat by enabling more accumulation.
- ✅ **Apply structural fixes: case-facts block, trimmed tool outputs, position-aware ordering.**
- ❌ **Letting precise customer facts (amounts, dates, expectations) live only inside the summarized history.** Summarization compresses precision into vagueness — "around $250," "a couple weeks ago."
- ✅ **Pin precise transactional facts in a persistent case-facts block injected every turn outside the summary.**
- ❌ **Returning the full 40-field tool payload and planning to "compress later."** Every turn between accumulation and compaction pays the bloat tax.
- ✅ **Trim at the tool boundary — return only the fields the agent uses, log the rest separately.**
- ❌ **Dropping the `tool_result` block itself to save tokens.** Breaks the `tool_use_id` linkage; Claude re-issues calls or hallucinates.
- ✅ **Trim the *content* of the result; keep the block and its `tool_use_id` correlation.**
- ❌ **Burying the conclusion at the end (or worse, the middle) of a long subagent report.** The caller's window pushes it into a low-recall position.
- ✅ **Lead with TL;DR / key findings; organize evidence under explicit headers.**
- ❌ **Asking the summarizer to "preserve all numbers and dates."** Best-effort and unverifiable; failures are silent.
- ✅ **Move the precise facts out of the summarized stream entirely (case-facts block) so summarization can't touch them.**

## Worked example — Scenario S1 (Customer Support Resolution)

Turn 1: *"I'm Maya, CUST-7741. Order ORD-88421 for $247.50 was promised on 2026-04-12 and still hasn't arrived. I want a full refund to my original card — not store credit."* The agent calls `get_customer`, `lookup_order`, `get_tracking`. Each tool returns 30+ fields; the wrapper trims to the five fields the caller actually uses. After the third call, the agent extracts a pinned block:

```
CASE FACTS
- Customer: CUST-7741 (Maya Patel, Gold tier)
- Order: ORD-88421, $247.50, placed 2026-04-08
- Promised delivery: 2026-04-12 (overdue)
- Customer expectation: full refund to original card (NOT store credit)
- Root cause: carrier mis-route, tracking event T-3309
```

Twenty turns of verification, policy check, and supervisor escalation follow. Progressive summarization compresses *that discussion*, but the case-facts block is injected outside the summary every turn. When the agent finally calls `process_refund`, it issues `$247.50` to the **original card** — because the precise amount, mechanism, and expectation stayed in a recalled position the entire time. Without that block, by turn 22 the summary would read "customer wants a refund" and the agent would propose store credit "around $250."

## Quick recall (full set)

- **Q:** Which kinds of detail does progressive summarization degrade most? → Precise numbers, dates, IDs, customer-quoted expectations.
- **Q:** Where in a long context are facts most likely to be lost? → The middle; beginning and end are recalled most reliably.
- **Q:** Does increasing the context window fix lost-in-the-middle? → No — it's positional, not size-driven; doubling the window can make it worse.
- **Q:** What is the deterministic fix for losing precise customer details across a long support conversation? → A persistent case-facts block injected every turn outside the summarized history.
- **Q:** Why does the case-facts block work when "better summarization" doesn't? → It bypasses summarization entirely; precise facts are never compressed and sit in a recalled position.
- **Q:** Where should verbose tool outputs be trimmed? → At the tool wrapper / result-shaping step, before the `tool_result` enters history.
- **Q:** What must you preserve when trimming a tool result? → The `tool_result` block itself and its `tool_use_id`; only trim the content.
- **Q:** Why is "trim later during compaction" too late? → The bloat has cost attention dilution every turn between accumulation and compaction.
- **Q:** Where should key findings sit in a long aggregated input? → At the **start**, with evidence under explicit section headers.
- **Q:** Why do headers mitigate lost-in-the-middle? → They give the model navigable structure and cluster related material, reducing positional drop-off on critical content.
- **Q:** A subagent returns a 4,000-token chronological report. What's the position-aware fix? → Lead with TL;DR / key findings; move methodology and evidence behind headers.
- **Q:** A 40-field tool payload when you need 5 — single biggest cost of leaving it untrimmed? → Cumulative token bloat across every subsequent turn, plus attention dilution onto irrelevant fields.
- **Q:** "$247.50, original card, not store credit" → twenty turns later, agent proposes "around $250 in store credit." Root cause? → Progressive summarization flattened amount, mechanism, expectation; no case-facts block pinned.
- **Q:** Why is "improve the summarizer prompt" not structural? → Summarization compresses by design; keep precise facts *out of* the summarized stream.
- **Q:** Metadata subagents should include in structured outputs? → Dates, source locations, relevance scores, methodological context.
