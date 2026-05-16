# Task 5.1 — Manage conversation context to preserve critical information across long interactions

> Domain 5: Context Management & Reliability. Excerpted from the official guide.

## Knowledge of
- **Progressive summarization risks**: condensing numerical values, percentages, dates, and customer-stated expectations into vague summaries.
- The **"lost in the middle"** effect: models reliably process information at the beginning and end of long inputs but may omit findings from middle sections.
- How tool results accumulate in context and consume tokens disproportionately to their relevance (e.g., 40+ fields per order lookup when only 5 are relevant).
- The importance of passing complete conversation history in subsequent API requests to maintain conversational coherence.

## Skills in
- Extracting transactional facts (amounts, dates, order numbers, statuses) into a **persistent "case facts" block** included in each prompt, **outside** summarized history.
- Extracting and persisting structured issue data (order IDs, amounts, statuses) into a **separate context layer** for multi-issue sessions.
- **Trimming verbose tool outputs** to only relevant fields before they accumulate in context (e.g., keeping only return-relevant fields from order lookups).
- Placing key findings summaries at the **beginning** of aggregated inputs and organizing detailed results with explicit section headers to mitigate position effects.
- Requiring subagents to include **metadata** (dates, source locations, methodological context) in structured outputs to support accurate downstream synthesis.
- Modifying upstream agents to return **structured data** (key facts, citations, relevance scores) instead of verbose content and reasoning chains when downstream agents have limited context budgets.
