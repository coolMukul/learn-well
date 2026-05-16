# Topic 5.6 — Provenance and multi-source synthesis

> **Domain 5 · Context Management & Reliability** · 15% of the exam

## Why this matters

A multi-agent research system only earns user trust when readers can answer two questions about every claim in the final report: **"Who said this?"** and **"When did they say it?"** The Scenario 3 architecture — a coordinator delegating to web-search, document-analysis, synthesis, and report-writing subagents — fails silently if any link in that chain compresses findings into prose without preserving the **claim-source mapping**. The final report still reads fluently; it just can't be audited, can't be defended when challenged, and can't tell the user that "GDP grew 2.1%" came from one source and "GDP grew 2.4%" came from another.

The exam tests this topic because every credible-looking failure mode here is structural rather than stylistic: lost source URLs, dropped publication dates, silently picked winners between conflicting credible sources, and one-size-fits-all rendering that buries financial precision inside narrative. Get the structured data shape right at the subagent layer, preserve it through synthesis, and let the report-writer choose the rendering — never the other way around.

## Source attribution lost when summaries don't preserve claim-source mappings

The most common provenance failure is a subagent returning a **prose summary** of what it found instead of a **structured list of claims with sources attached**. When the web-search subagent reports back "Recent estimates put global EV sales at roughly 14 million units in 2024, with strong growth in China and Europe," it has just deleted the URLs, the publication dates, the methodology notes, and the original wording. The synthesis agent receives a sentence; it has nothing to merge or reconcile against another sentence from the document-analysis subagent. By the time the report-writer runs, the citation footnotes are pure fabrication — there is no structured record of which claim came from which document.

**The fix is structural, not stylistic.** Require every subagent to emit findings as an array of `{claim, source_url, source_title, retrieved_at, excerpt}` objects, and require the synthesis agent to **carry those objects through merge** rather than re-prose them. Only the report-writer renders them as readable text — and at that point footnotes are mechanical, not invented.

> **Common pitfall** — Asking the synthesis agent to "produce a clean narrative summary." That phrasing implicitly tells it to drop structure. Instead, ask for a structured findings object plus a narrative — and let the report-writer compose them.

**Quick recall**
- **Q:** Why do free-form prose summaries lose provenance? → They compress claims and drop the source-URL/date/excerpt fields the report-writer needs to cite accurately.
- **Q:** What's the structural fix? → Subagents emit `{claim, source, url, retrieved_at}` records; synthesis preserves them; the report-writer renders prose **alongside** the structured record.

## Structured claim-source mappings preserved through synthesis

Preservation is the operative word. It isn't enough for the **search** subagent to return structured records if the **synthesis** subagent then flattens them into a single paragraph. Each handoff in the multi-agent pipeline is a place where structure can be lost — and once it's gone, no downstream stage can reconstruct it. The contract you want is: **every claim in the final report can be traced backward through the pipeline to a specific source record**, even after merging, deduplication, and conflict annotation.

The synthesis agent's job is to take the union of claim arrays from upstream subagents, deduplicate where the same fact has multiple sources (keeping the source **list**, not collapsing to one), annotate conflicts, and emit a merged claims array. The report-writer then renders. If you instead ask synthesis to "write a 500-word summary," you've put rendering in the wrong place — and you've lost the ability to cite later because the structured trail is already gone.

A useful test: can your synthesis output be re-rendered into a different format (table, list, prose) without going back to the original sources? If yes, structure was preserved.

> **Common pitfall** — Treating synthesis as "make it readable." Synthesis is a **merge-and-annotate** step over structured records; readability is the report-writer's job, one step later.

**Quick recall**
- **Q:** What's the contract between subagents and synthesis? → Subagents emit structured claim arrays; synthesis merges/dedupes/annotates **without** flattening them to prose.
- **Q:** What's the test that structure was preserved through synthesis? → The output can be re-rendered into a different format without going back to the original sources.

## Conflicting credible sources: annotate with attribution, don't pick one

When the document-analysis subagent reports "Q3 revenue was $4.2B (Source A — earnings release, Oct 27)" and the web-search subagent reports "Q3 revenue was $4.18B (Source B — analyst report, Nov 2)," the synthesis agent's job is **emphatically not** to pick one and discard the other. The right move is to keep **both**, annotated with attribution: the merged claims record reads `{topic: "Q3 revenue", values: [{value: "$4.2B", source: A, ...}, {value: "$4.18B", source: B, ...}]}`. The report-writer can then render it as "Source A reports $4.2B; Source B reports $4.18B" — letting the **reader** judge which to trust given the methodological context.

Many wrong answers will tempt you to write rules like "prefer the most recent source" or "if values are within 1%, average them." Each loses information the reader needs. The most-recent source might be a press summary of an older primary; averaging hides the disagreement entirely.

The discipline is: **synthesis preserves disagreement; rendering communicates it.** The only legitimate filtering is at the **credibility gate** before sources enter the pipeline at all. Once a source has cleared that gate, its claims are first-class data and don't get silently overridden by a peer.

> **Common pitfall** — Rules like "always pick the most-recent source" or "rephrase so claims sound unified." The first is wrong when the older source is more authoritative; the second hides legitimate disagreement from the reader.

**Quick recall**
- **Q:** Two credible sources give different values for the same claim. What does synthesis do? → Keep both, annotated with source attribution; let the reader judge.
- **Q:** Why is "always pick the most recent source" a wrong rule? → A more recent source can be a derivative summary of an older, more authoritative primary source — recency is not authority.

## Required publication / collection dates to disambiguate temporal data

Temporal metadata is the second non-negotiable field in every claim record (alongside the source itself). A claim like "the unemployment rate is 4.1%" is **only useful with the date attached** — without it, a January 2024 figure and a January 2026 figure look identical, and apparent contradictions in the synthesis step are actually just two snapshots of a moving target. Worse, a single-figure answer with no date can become silently wrong months later, when the report is re-read by someone who assumes "current" means today.

Two date fields matter, and the exam treats them as distinct:

- **Publication date** — when the source was published (when the document, article, or press release went out).
- **Data collection date** — the period the data describes (e.g., "Q3 2025 earnings" published in October 2025; "January 2026 jobs report" published in February 2026).

The synthesis agent uses both. If two sources report different unemployment rates but one collected in 2024 Q4 and the other in 2025 Q4, that's not a conflict to annotate — it's a **time series**, and the right rendering is two rows in a table with the period column populated. Conversely, if two sources report different rates for the same period, that's a real conflict and gets annotated.

The structural requirement: **every subagent must include `published_at` and (where applicable) `data_period` in its claim records**, even if the values are nulls when unavailable — explicit nulls are auditable; missing fields are silently lost.

> **Common pitfall** — Including the **publication date** but not the **data collection period**. The two diverge by months for any quarterly economic indicator, and synthesis can't tell apparent contradictions from time-series points without both.

**Quick recall**
- **Q:** Why are publication dates required in structured outputs? → Without them, temporal differences masquerade as contradictions, and "current" facts go stale silently.
- **Q:** Why aren't publication dates alone enough? → Many domains (financial, economic, scientific) have a gap between when data was collected and when it was published; both fields are needed to interpret correctly.

## Render content-type-appropriately: financial as tables, news as prose, technical as lists

Content type drives format choice, and "convert everything to prose for readability" is the exam's classic wrong answer. Financial data demands **tables** because columns let the reader compare values at a glance and decimal precision matters; the same numbers buried in a paragraph become an unreadable wall. News and qualitative findings render naturally as **prose** — narrative connects events causally. Technical findings (steps, configurations, error symptoms) render as **structured lists** — ordered when sequence matters — so the reader can follow them without parsing sentences.

Concretely, the synthesis output should mark each claim group with a `content_type` hint (`financial`, `news`, `technical`, `narrative`) so the rendering decision is data-driven. A briefing covering financial results, market news, and a technical incident report should **mix all three rendering modes** within one document, not flatten them into prose for "consistency." Rendering is a downstream concern that depends on the content type of each group, not a top-level style choice applied uniformly.

> **Common pitfall** — A "uniform style" mandate that converts financial tables into prose paragraphs. It looks tidier but destroys the at-a-glance comparison the table provides and obscures decimal precision.

**Quick recall**
- **Q:** Why is "summarise everything as prose for readability" a wrong default? → Different content types have different ideal renderings: financial → tables (precision/comparison), news → prose (narrative), technical → lists (steps).
- **Q:** Where does the rendering decision belong in the pipeline? → At the report-writer (downstream of synthesis), driven by a `content_type` hint carried in each claim group's metadata.

## Anti-patterns

- ❌ **Prose-only summaries between subagents.** "Recent reports suggest X" deletes the URL, date, and excerpt; downstream synthesis cannot cite or reconcile.
- ✅ **Structured `{claim, source, url, retrieved_at, excerpt}` records preserved through every handoff; prose only at the final report-writer stage.**
- ❌ **Synthesis agent picks a "winner" between conflicting credible sources.** Silent loss of information; reader has no way to evaluate the disagreement.
- ✅ **Synthesis annotates the conflict ("Source A: X; Source B: Y") and lets the reader judge.**
- ❌ **"Always prefer the most recent source"** as a synthesis rule. Wrong when the older source is the primary and the newer one is a derivative summary.
- ✅ **All credible sources are first-class; preserve both with attribution and let the reader weigh them.**
- ❌ **Omitting publication or data-collection dates from claim records.** Temporal gaps look like contradictions; "current" claims go stale silently.
- ✅ **Require `published_at` and `data_period` fields on every claim — explicit null beats missing.**
- ❌ **Uniform-style rendering that converts everything to prose.** Buries financial precision, hides comparisons, and turns technical steps into unscannable paragraphs.
- ✅ **Content-type-appropriate rendering: financial → tables, news → prose, technical → lists; carry a `content_type` hint from synthesis to report-writer.**
- ❌ **Asking synthesis to "produce a clean narrative."** That phrasing tells it to discard structure; rendering belongs to the report-writer.
- ✅ **Synthesis = merge + dedupe + annotate over structured records; rendering happens downstream.**

## Worked example — Scenario S3 (Multi-Agent Research System)

A user asks the research system: *"Summarise the Q3 2025 financial performance and recent regulatory news for AcmeCorp."* A correctly designed pipeline runs:

1. **Web-search subagent** returns a structured array: each entry has `claim`, `source_url`, `source_title`, `published_at`, `data_period`, `excerpt`, and `content_type`. Q3 revenue from the press release becomes one record (`content_type: "financial"`, `data_period: "2025 Q3"`), regulatory news becomes another (`content_type: "news"`).
2. **Document-analysis subagent** returns its own structured array from the 10-Q PDF: an *independent* Q3 revenue figure with its own source record. Note: it might be `$4.2B` while the press summary said `$4.18B`.
3. **Synthesis subagent** merges. It groups by topic, deduplicates where source records agree, and **annotates the conflict** on Q3 revenue — both values survive with attribution. It carries every `content_type`, `published_at`, and `data_period` field through unchanged.
4. **Report-writer** renders: financial claims become a table with columns "Metric / Source A / Source B / Period"; the regulatory news claims become a prose section; any technical incident notes (none here) would render as a bulleted list. Footnotes are generated mechanically from the still-present `source_url` fields.

A common bug: the synthesis subagent receives a "summarise the findings" instruction and emits prose. The report-writer now has nothing structured to render, so it either invents footnotes (hallucinated provenance) or drops citations entirely (unsourced report). The **same** four agents with the **same** model produce a credible or a useless report depending entirely on whether the synthesis stage preserves structured claim-source mappings.

## Quick recall (full set)

- **Q:** Why do prose-only summaries between subagents break provenance? → They drop the URL, date, and excerpt fields the report-writer needs to cite; downstream stages cannot reconstruct what was lost.
- **Q:** Minimum field set for a claim record? → `claim`, `source_url`, `source_title`, `published_at`, `excerpt` (plus `data_period` and `content_type` where applicable).
- **Q:** What is synthesis's actual job? → **Merge + dedupe + annotate** over structured claim records — *not* "write a narrative summary."
- **Q:** What is the report-writer's job? → Render the structured synthesis output, applying content-type-appropriate formatting and generating citations from the preserved source records.
- **Q:** How is the test "was structure preserved through synthesis?" applied? → Try to re-render the synthesis output in a different format. If it requires going back to the original sources, structure was lost.
- **Q:** Two credible sources disagree on a value. What does the system do? → Annotate the disagreement with attribution; preserve both values; let the reader judge.
- **Q:** Why is "always pick the most recent source" wrong? → Recency ≠ authority; a recent derivative summary can override an older primary source.
- **Q:** Why is "average the two values when they're close" wrong? → Hides the disagreement and creates a third number that no actual source endorses.
- **Q:** Why are publication and data-collection dates **both** required? → They diverge by months for quarterly/economic data; without both, time-series points masquerade as contradictions.
- **Q:** What's the difference between a real conflict and a time-series gap? → Real conflict: same `data_period`, different values. Time-series: different `data_period` — render as a table with a period column instead.
- **Q:** Right rendering for financial data? → Tables (precision and comparison).
- **Q:** Right rendering for news/qualitative findings? → Prose (narrative flow).
- **Q:** Right rendering for technical steps/configs/diagnostics? → Structured lists (scannable, ordered when sequence matters).
- **Q:** Where does the rendering decision belong? → Report-writer, driven by a `content_type` hint carried through synthesis from the originating subagent.
- **Q:** Anti-trap: "summarise everything as prose for readability." → Loses provenance, dates, and content-type formatting; the right answer is structured records through synthesis, rendering at the final stage.
