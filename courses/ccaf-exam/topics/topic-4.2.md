# Topic 4.2 — Few-shot prompting for consistency

> **Domain 4 · Prompt Engineering & Structured Output** · 20% of the exam

## Why this matters

Few-shot prompting is the **single most effective technique** the exam recognises for forcing consistent, actionable output when prose instructions alone produce drift. The pattern shows up across Scenario 5 (CI code review with consistent severity tags) and Scenario 6 (structured extraction across messy document layouts), and it is the right answer to a recurring class of "the agent's instructions are clear but the output still varies" questions. The trap candidates fall into is either reaching for **more prose** or for **the wrong kind of examples** (ten near-duplicates that overfit instead of generalising). The exam tests whether you understand the *shape* of a good few-shot block: a small number of targeted examples that span the **ambiguity** you care about, demonstrate **reasoning** alongside output, and exhibit the **format** you want — location, issue, severity, suggested fix, or the equivalent. Get this right and downstream parsing, schema validation, and human review all become cheaper.

## 2-4 targeted examples for ambiguous scenarios

The right number of few-shot examples is **2 to 4** — small, targeted, and chosen to cover the **dimensions of ambiguity** in the task. One example is rarely enough: the model treats it as a template and matches surface features (length, vocabulary, ordering) instead of inferring the underlying rule. Ten or more examples produce diminishing returns: each new example adds context-window cost and rarely teaches anything the prior examples didn't, while increasing the chance the model overfits to incidental patterns shared across them.

A concrete case from Scenario 1: an agent must choose between `lookup_order` and `process_refund` on informal phrasing. **Two well-chosen examples** — one where the order isn't yet delivered (so `lookup_order` first) and one where the order is delivered and damaged (so `process_refund`) — beat ten near-duplicate "refund this" examples that all map to `process_refund`. The dimension to cover is *the ambiguity*, not *the volume*.

For format-only tasks 2 examples often suffice; for tasks where reasoning shapes the answer, 3-4 examples that span the decision space generalise better.

> **Common pitfall** — "The agent failed on case X, so I added a copy of case X to the few-shot list." That doesn't generalise — it just narrows the model's notion of the rule. Pick examples that cover the **principle**, not the **failing case** verbatim.

**Quick recall**
- **Q:** What's the recommended example count for a few-shot block? → **2 to 4**, chosen to span the ambiguity of the task.
- **Q:** Why are ten near-identical examples worse than four diverse ones? → They consume context without teaching new patterns and risk overfitting to incidental shared features.

## Demonstrating reasoning: why one action over plausible alternatives

A few-shot example that shows only the **chosen output** teaches the model *what* to produce but not *why*. The model has to guess which surface feature mattered. Examples that include a short **reasoning trace** — "user mentions order #1234 but no defect, so look up the order before discussing a refund" — teach the **decision principle** and generalise to novel cases that share the principle but not the surface form.

This is especially important when the alternative action is **plausible**. If only the right answer ever appears, the model may not realise there was a choice. The high-leverage shape is: short prompt → brief reasoning that names the alternative and rejects it → the chosen action. For example, in a code-review agent: *"This loop has no early exit, but the iterator is bounded by `MAX_ITEMS=20`, so this is not an infinite-loop bug; flagging would be a false positive."* That single sentence teaches the model to consider boundedness before flagging.

Worked Scenario 5 case: a CI review agent kept flagging `// TODO: revisit` comments. An example that *named the alternative* — "could be flagged as tech debt, but TODOs are acceptable in this repo's style" — cut the false-positive rate without weakening real-issue detection. Showing only the rejected output would have been weaker because it doesn't surface the rule.

> **Common pitfall** — Examples that show only the chosen action without the reasoning. Generalisation suffers because the model can't tell which feature mattered.

**Quick recall**
- **Q:** Why include reasoning in a few-shot example, not just the chosen output? → It teaches the underlying principle, which generalises better to novel inputs that share the principle but not the surface form.
- **Q:** What's special about referencing the **plausible alternative** in the reasoning? → It signals that there was a choice and which feature drove it, which sharpens the rule.

## Format demonstration: location / issue / severity / suggested fix

When the task is to produce a structured output (CI review comment, extraction record, triage ticket), demonstrating the **exact format** in examples is more reliable than describing it in prose. A schema sentence like "respond with location, issue, severity, suggested fix" is easy to misread or under-specify; a worked example with the four fields filled in is unambiguous.

The canonical Scenario 5 shape is the four-field code-review entry:

```
location: src/payments/refund.ts:42
issue: missing null-check on customer object before calling .id
severity: high
suggested fix: guard with `if (!customer) throw new MissingCustomerError(...)`
```

Two or three examples in this exact shape — covering different severities, different file types, and at least one "no issue found" entry to demonstrate the empty case — produce far more consistent output than even a carefully written schema description. Downstream parsers see the same field names every time, and missing fields (or wrong order) drop dramatically.

The pattern generalises: extraction tasks use the same trick with `field_name: value` pairs; triage tasks use it with `category / priority / owner / next_action`. The **field names you use in the example are the field names the model will use** — pick them deliberately.

> **Common pitfall** — Describing the format in prose ("include location, issue, severity, suggested fix") without showing a filled-in example. Prose schemas leak: the model may add commentary, drop fields, or reorder them.

**Quick recall**
- **Q:** Most reliable way to lock in a four-field output (location/issue/severity/suggested fix)? → Show 2-3 worked examples with the exact field names and one "no issue" example.
- **Q:** Why do prose schema descriptions under-perform format examples? → They're easy to misread or under-specify; the model fills gaps with its own conventions.

## Generalisation to novel patterns vs matching only pre-specified cases

A well-constructed few-shot block teaches a **rule the model can apply to inputs the examples never showed**. A poorly constructed one teaches a **lookup table** — match the new input to the closest example, copy the output. The difference comes from whether the examples **span the decision space** or **cluster** in one corner of it.

In Scenario 6, an extraction agent was given five examples all from one vendor's invoice template. It worked on that template and **failed on every other vendor**, returning empty or hallucinated values. The fix wasn't more examples of the same template; it was **three examples from three different layouts** (PDF table, plain-text email, OCR'd scan), so the model could infer "find the invoice number wherever it appears" rather than "look at row 3 of the top table."

The generalisation test for any few-shot block: if I removed the examples and described the task in prose, would my candidate inputs still feel like the same task? If yes, the examples are teaching a rule. If the task suddenly feels under-specified, the examples were doing the load-bearing work and they need to span more of the input space.

> **Common pitfall** — Picking examples that all share the same surface structure. The model learns the structure, not the rule, and fails as soon as the input deviates.

**Quick recall**
- **Q:** What property makes a few-shot block generalise vs overfit? → The examples span the dimensions of variation in the input space, not just the corner where the easy cases live.
- **Q:** Five examples from one invoice template fail on a second template. Right fix? → Replace several examples with samples from different layouts so the model learns the rule, not the template.

## Reducing extraction hallucination with examples of varied document structures

Extraction hallucination — fields filled with plausible-but-wrong values, or empty fields where data is present in an unfamiliar layout — is one of the most common Scenario 6 failure modes. The tested mitigation is a few-shot block that **spans document-structure variants** the model is likely to see in production.

Consider a research-paper extraction agent that needs to pull citations. Some papers use **inline citations** (`(Smith et al., 2023)`); others use **numbered footnotes** (`[12]` resolving to a bibliography). Some embed methodology in a labelled section; others scatter it across the introduction. If the few-shot examples only show inline-citation papers, the agent confidently extracts something for footnote-style papers — usually a hallucinated author name copied from elsewhere — because nothing in its examples taught it to recognise "this is a different layout" and adjust.

The fix is two or three examples that **explicitly span the structural variants**: one inline-citation paper, one footnote-bibliography paper, one with informal author mentions. Each example shows the correct extraction *for that layout*, including showing an empty field where the layout legitimately doesn't contain that data. That last detail matters: an example with `methodology: null, reason: "no methods section in this short essay"` teaches the model that **null is a legitimate output** and reduces the rate of confidently-filled-but-wrong extractions.

The same pattern applies to informal measurements, inconsistent date formats, multilingual content, and any axis along which production documents vary.

> **Common pitfall** — Single-template few-shot examples for extraction tasks. Anything off-template returns either a hallucinated value or a wrong empty.

**Quick recall**
- **Q:** Most effective few-shot shape for reducing extraction hallucination across document layouts? → 2-3 examples drawn from **different structures** (inline vs footnote citation, table vs prose, etc.) including at least one legitimate empty/null case.
- **Q:** Why include a "no data here" example? → It teaches the model that null is a valid output and reduces confidently-wrong fill-ins.

## Anti-patterns

- ❌ **Adding a copy of the failing case as a new example.** Teaches the lookup of that one case rather than the underlying rule.
- ✅ **Pick examples that span the principle**, especially the ambiguity dimension that caused the failure.
- ❌ **Ten near-duplicate examples.** Burn context and overfit to incidental shared features.
- ✅ **2-4 targeted examples** chosen to cover the decision space.
- ❌ **One example as "a quick demo."** The model treats it as a template and matches surface features rather than inferring the rule.
- ✅ **At least 2 examples**, ideally with a contrast (chosen action vs plausible alternative).
- ❌ **Examples that show only the chosen output, no reasoning.** Generalisation suffers because the model can't tell which feature mattered.
- ✅ **Include a short reasoning trace** that names the plausible alternative and why it was rejected.
- ❌ **Prose-only schema description ("respond with these fields…").** Prone to drift; field names and order drift across responses.
- ✅ **Show 2-3 worked examples in the exact format** with the field names you want and at least one "no issue / null" case.
- ❌ **All examples from one document template / layout.** Model learns the template, fails on every novel layout.
- ✅ **Span structural variants** — inline vs footnote citation, table vs prose, different vendors.
- ❌ **No examples of the empty / null case.** Model fills in plausible-but-wrong values rather than admitting absence.
- ✅ **Include at least one legitimate-empty example** so null is a known valid output.
- ❌ **Treating few-shot examples as documentation comments** the model ignores. They're high-signal context the model conditions on heavily.
- ✅ **Curate them deliberately** — every example earns its place by covering a distinct ambiguity, layout, or decision boundary.

## Worked example — Scenario S6 (Structured Data Extraction)

A team builds an extraction agent that pulls four fields from research papers: `title`, `methodology`, `key_findings`, `citations`. The first version uses a long prose schema. On the validation set it scores 94% on the lab's own template and **52%** on third-party papers, most failures being a confidently-wrong `methodology` field for short essays with no methods section.

The disciplined fix: **(1)** swap the prose schema for **three worked examples** drawn from three different layouts — a full IMRaD article, a short opinion essay (where `methodology: null` is right), an informal blog post with footnote-style citations; **(2)** in each example, demonstrate the **exact field names** plus a one-line reasoning trace ("no methods section present, so methodology is null"); **(3)** keep the count at three so the model must generalise rather than match a template.

After the change, third-party accuracy rises to ~85%, hallucinated-methodology rate drops by ~70%, and the agent confidently emits `null` on essays instead of fabricating a section. The win came from spanning layouts and from showing the legitimate empty case — not from longer prose or more examples.

## Quick recall (full set)

- **Q:** Why is few-shot prompting the recommended fix for inconsistent output despite detailed instructions? → It's the most effective technique for forcing consistent format/judgement when prose alone underspecifies.
- **Q:** Recommended example count? → **2 to 4**, chosen to span the ambiguity dimensions of the task.
- **Q:** Why is "add a copy of the failing case" a weak fix? → It teaches the lookup of that case, not the underlying rule; pick examples that span the principle instead.
- **Q:** Why include the **plausible alternative** in the reasoning trace? → It signals that there was a choice and which feature drove it, sharpening the rule for novel inputs.
- **Q:** Most reliable way to lock in a four-field structured output? → 2-3 worked examples with the exact field names (location/issue/severity/suggested fix), at least one "no issue" case.
- **Q:** Why do prose schema descriptions underperform format examples? → Easy to misread, easy to under-specify; the model fills gaps with its own conventions.
- **Q:** What property of a few-shot block determines whether it generalises? → Whether the examples span the input space's dimensions of variation, not whether they are numerous.
- **Q:** Five examples from one invoice template fail on a second template. Best fix? → Replace several with samples from different layouts so the model learns the rule, not the template.
- **Q:** Most effective shape for reducing extraction hallucination across layouts? → 2-3 examples from different structures plus at least one legitimate empty/null case.
- **Q:** Why include a "no data here" example? → To teach the model that null is a valid output, reducing confidently-wrong fill-ins.
- **Q:** Trade-off of using 10+ examples instead of 3? → Diminishing returns plus context cost plus risk of overfitting to incidental shared features.
- **Q:** Difference between an example that teaches a **rule** vs one that teaches a **template**? → The rule-teaching example reasons about the decision; the template-teaching example just shows the surface form.
