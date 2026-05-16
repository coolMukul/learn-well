# Task 3.5 — Iterative refinement techniques

> **Domain 3 · Claude Code Configuration & Workflows** · 23% of the exam

## Why this matters

Most "Claude Code didn't do what I wanted" stories aren't about the model — they're about the **iteration loop**. The first prompt is rarely complete; what separates effective Claude Code use from frustrating sessions is how the developer responds when output drifts from intent. Iterative refinement is a small set of high-leverage techniques: pin the contract with **I/O examples**, drive convergence with **test failures** instead of restated prose, ask Claude to **interview** you when requirements are fuzzy, and group fixes by whether they **interact** or are independent. Recognise the symptom and the right intervention is usually obvious — and almost always cheaper than another paragraph of prose.

---

## Concrete input/output examples > prose for transformations

Natural language descriptions of transformations are interpreted inconsistently. "Convert these field names to snake_case" sounds unambiguous until Claude meets `XMLParser` (is it `xml_parser` or `x_m_l_parser`?), `userID`, or `iOSConfig`. Any boundary case the prose doesn't explicitly address becomes a guess.

The fix is to **show, not tell**: provide 2–3 concrete input/output examples that pin down the contract. The examples don't have to cover every case — they have to cover the cases where prose is ambiguous. Two well-chosen examples will out-perform a paragraph of edge-case description because examples are mechanical: Claude pattern-matches them and generalises correctly.

```
Convert these field names to snake_case. Examples:
  XMLParser  -> xml_parser
  userID     -> user_id
  iOSConfig  -> ios_config
  HTTPError  -> http_error
```

Now `iOSConfig -> ios_config` is unambiguous and Claude will apply the same rule to `JSONResponse`, `URLBuilder`, etc. without further negotiation. Compare to "convert acronyms to lowercase and treat them as one word" — true, but it leaves `iOS` (mixed-case acronym + lowercase prefix) unspecified.

> **Common pitfall** — Sending a 200-word prose specification of a transformation and assuming the long description compensates for the missing examples. It rarely does. The longer the prose, the more places interpretation can drift.

**Quick recall**
- **Q:** Why are concrete I/O examples more reliable than prose for transformations? → They pin the contract on specific cases where prose is ambiguous; Claude can pattern-match instead of inferring rules.
- **Q:** How many examples are usually enough? → 2–3 well-chosen ones that cover the cases where prose interpretation would drift.

## Test-driven iteration: write tests first, share failures

The most efficient iteration loop in Claude Code is test-driven. Write a test suite that captures the expected behaviour — including edge cases and (where relevant) performance requirements — *before* asking Claude to implement. Then iterate by running the tests and **sharing the failures** back, not by re-explaining the requirement in prose.

The reason this works is that **failure messages carry more signal than re-stated requirements**. A failing assertion like `expected 'user_id' but got 'user_i_d' for input 'userID'` tells Claude exactly which case is wrong, what the expected output is, and what it actually produced. A re-statement like "remember, acronyms collapse" is far weaker — it doesn't tell Claude which input it got wrong, just that something is.

Concretely, the loop looks like:

1. Write tests covering happy path, edge cases, performance bounds.
2. Ask Claude to implement against the tests.
3. Run the tests. If something fails, **paste the failure output** (assertion, expected vs actual, stack trace if relevant) into the next message.
4. Claude fixes the specific failing case. Re-run.
5. Repeat until green.

This is dramatically faster than rounds of "it's still wrong, the issue is..." prose. The failure output is the spec, in the most compressed form possible.

> **Common pitfall** — Running the tests yourself, then describing the failure in prose ("it's still breaking on the userID case") instead of pasting the actual failure output. You're throwing away the highest-signal artifact of the iteration.

**Quick recall**
- **Q:** Why share test failures rather than re-stated requirements? → Failure output carries more signal — exact input, expected, actual — than any re-phrased prose.
- **Q:** What goes in the test suite *before* implementation? → Happy path, edge cases, and (where relevant) performance bounds — anything that defines "done."

## Interview pattern: have Claude ask questions before implementing

When requirements are ambiguous or the domain is unfamiliar, jumping straight to code produces guess-driven implementations that need to be unwound later. The cheaper move is the **interview pattern**: explicitly ask Claude to ask *you* clarifying questions before writing any code.

A typical opener: *"Before you implement this, ask me any questions you have about cache invalidation, failure modes, or edge cases I might not have considered."* Claude will surface considerations the developer hadn't articulated — sometimes hadn't even realised were decisions: TTL vs eventual consistency, what happens on partial failure, whether the queue should be FIFO under contention, what counts as a duplicate request.

The interview pattern is most valuable when:
- The domain is unfamiliar to you (you don't know what you don't know).
- The interface is small but the semantics are subtle (caches, retries, locking).
- The problem has hidden state (background jobs, distributed systems, schema migrations).

It's *less* valuable for tightly-scoped, well-specified tasks ("rename this variable across these 3 files") — there the interview is just overhead. The signal that you should reach for it is when you find yourself writing a long prose spec and discovering ambiguities as you write; pivot and let Claude surface them instead.

> **Common pitfall** — Skipping the interview because "the requirements seem clear." If the domain is one you're not fluent in (cache coherence, retry semantics, ordering), they're rarely as clear as they feel.

**Quick recall**
- **Q:** When should you use the interview pattern? → When requirements are ambiguous or the domain is unfamiliar — let Claude surface considerations you didn't anticipate.
- **Q:** What's the explicit prompt shape? → "Before you implement, ask me any questions you have about <X, Y, Z>." Claude then asks; you answer; *then* it codes.

## Single message for interacting fixes vs sequential for independent issues

When iterating on multiple problems, the choice between **one message with everything** and **sequential messages** depends on whether the issues **interact**.

- **Interacting issues** — fixing one changes the constraints on another. Example: "the cache eviction is too aggressive" and "the cache hit rate metric is wrong" — both touch the same eviction path; fixing one in isolation can re-break the other or invalidate the diagnosis. Send these in a **single detailed message** so Claude can reason about them jointly and produce a coherent fix.
- **Independent issues** — fixes don't touch each other. Example: "rename this variable in `auth.ts`" and "the README has a broken link" — completely orthogonal. Send these **sequentially**, one per message. Each iteration is faster (smaller diff to review), cleaner (no risk of one fix masking another's regression), and you can stop early if one of them turns out to be wrong.

The trap is treating every multi-issue session as a "batch everything" exercise. Bundling truly independent issues into one mega-message produces a long, hard-to-review diff and obscures which fix introduced which regression. Conversely, splitting interacting issues into sequential messages forces Claude to re-discover the joint constraints each turn, often producing oscillating fixes.

The decision rule is simple: ask "**does fixing A change how I'd fix B?**" If yes — single message. If no — sequential.

> **Common pitfall** — Defaulting to "send everything at once" because it feels efficient. For independent issues that's actually slower, because review and rollback get harder.

**Quick recall**
- **Q:** Two interacting bugs in the same module — how do you send them? → Single message with both, so Claude reasons about them jointly.
- **Q:** Two unrelated bugs in different files — how do you send them? → Sequentially, one per message — faster, cleaner, easier to roll back.
- **Q:** What's the deciding question? → "Does fixing A change how I'd fix B?" Yes → single. No → sequential.

## Specific test cases with example input + expected output for edge cases

Edge cases are where prose specifications fail most often. "Handle null values gracefully" is interpreted differently depending on context: skip the row? insert a default? raise an error? log a warning and continue? The fix mirrors the transformation case: provide a **specific test case with the exact input and the exact expected output**.

Worked example — a migration script that's supposed to backfill `customer.region` based on `customer.country`. After the first pass, you discover that 17 rows have `country = NULL`. Rather than describing the issue ("handle null countries"), provide the test case directly:

```
Input row:    { id: 42, country: null, region: null }
Expected:     { id: 42, country: null, region: 'unknown' }
(Do not raise; do not skip; insert literal 'unknown'.)
```

Now the contract is unambiguous. Claude knows the row should pass through, what region to set, and that an exception is *not* the desired behaviour. Compare to "handle nulls properly" — every word of which is interpretable.

This technique compounds with test-driven iteration: each edge case you discover becomes a new test (with its input + expected output), and the test suite becomes the canonical contract. Future regressions are caught by re-running the tests, not by re-explaining what "properly" meant.

> **Common pitfall** — Describing edge cases in narrative ("when the country is missing, do something sensible"). The narrative version is what produced the bug in the first place; restating it doesn't fix it.

**Quick recall**
- **Q:** How do you fix a null-handling bug in a migration script most efficiently? → Provide a specific test case: exact input row, exact expected output row, and what *not* to do (raise / skip).
- **Q:** Why does "handle nulls properly" not work? → "Properly" is interpretable; the implementation that produced the bug already thought it was handling them properly.

## Anti-patterns

- ❌ **Long prose specification of a transformation with no examples.** Every ambiguous boundary case becomes a guess.
- ✅ **2–3 concrete input → output examples that cover the cases where prose drifts.**
- ❌ **Re-stating the requirement when a test fails ("it's still wrong, the rule is...").** Discards the highest-signal artifact (the failure output) in favour of the lowest-signal (re-phrased prose).
- ✅ **Paste the actual test failure** (assertion, expected, actual) — let Claude fix the specific case.
- ❌ **Jumping to implementation when the domain is unfamiliar.** Produces guess-driven code that has to be unwound.
- ✅ **Use the interview pattern**: ask Claude to surface clarifying questions before any code is written.
- ❌ **Bundling independent fixes into one mega-message.** Long diff, harder to review, regressions get masked.
- ✅ **Sequential messages for independent issues**, one fix per turn.
- ❌ **Splitting interacting issues across sequential messages.** Claude re-discovers the joint constraints each turn; fixes oscillate.
- ✅ **Single detailed message for interacting issues** so Claude reasons about them jointly.
- ❌ **Describing edge cases in narrative ("handle nulls properly").** The narrative is what produced the bug.
- ✅ **Specific test case: exact input + exact expected output** for the edge case, plus an explicit note on what *not* to do.

---

## Worked example — Scenario S2 (Code Generation with Claude Code)

A team uses Claude Code to refactor a legacy invoice formatter. The first prompt is a paragraph: *"Refactor `formatInvoice` to support multiple currencies and locales, handle null line items gracefully, round consistently."* Claude produces a plausible refactor — but converts `null` line items to `0` (the dev wanted them skipped), formats `1000.5` as `"1,000.5"` in `de-DE` (the dev wanted always-2-decimal-places), and the existing tests don't cover currency.

The disciplined iteration:

1. **Write tests first** for cases that matter: currency × locale combinations, null line items, rounding boundaries (`0.005`, `0.045`, `0.105`).
2. **Use I/O examples** for locale formatting: `(1000.5, 'en-US') -> "$1,000.50"`, `(1000.5, 'de-DE') -> "1.000,50 €"`. Claude no longer guesses locale conventions.
3. **Interview before implementing null-handling**: *"Before you change null-handling, ask me what should happen for null `quantity` vs null `unitPrice` vs an entirely null row."* The dev clarifies; the contract becomes explicit.
4. **Independent fixes go sequentially** — the README typo and the unrelated logging bug each get their own one-liner. Each is fast, easy to review, easy to roll back.
5. **Interacting fixes go together** — when the rounding fix turns out to interact with locale formatting (rounding before vs after locale conversion produces different strings), both are sent in **one** detailed message with joint test cases.

After two cycles the tests are green and the diff is reviewable. Every iteration carried a failure or a concrete example.

---

## Quick recall (full set)

- **Q:** Why are concrete I/O examples more reliable than prose for transformations? → They pin the contract on specific cases where prose is ambiguous.
- **Q:** Roughly how many examples do you need? → 2–3, chosen to cover the boundaries where prose interpretation drifts.
- **Q:** What's the highest-signal thing to send back when iterating with tests? → The actual test failure output (assertion, expected, actual) — not a re-phrased requirement.
- **Q:** What goes into the test suite before implementation? → Happy path, edge cases, and where relevant performance bounds.
- **Q:** What's the interview pattern? → Ask Claude to ask *you* clarifying questions before it implements — surfaces hidden constraints in unfamiliar domains.
- **Q:** When does the interview pattern pay off? → Ambiguous requirements or unfamiliar domains (cache coherence, retries, distributed semantics).
- **Q:** When does the interview pattern *not* pay off? → Tightly-scoped, well-specified tasks where the questions are just overhead.
- **Q:** Two interacting bugs in the same module — single message or sequential? → Single, detailed message so Claude reasons about them jointly.
- **Q:** Two independent bugs in unrelated files — single message or sequential? → Sequential — faster, cleaner, easier to roll back.
- **Q:** Decision rule for batching fixes? → "Does fixing A change how I'd fix B?" Yes → single. No → sequential.
- **Q:** How do you fix an edge case (e.g. null handling) most efficiently? → Provide a specific test case: exact input + exact expected output + an explicit note on what *not* to do.
- **Q:** Why does "handle nulls properly" fail as a fix instruction? → The buggy implementation already thought it was handling them properly; "properly" is interpretable.
- **Q:** A team has rewritten the same prompt three times in escalating detail and the output still drifts. What's the higher-leverage move? → Stop adding prose; switch to concrete I/O examples (or write a failing test and share its output).
- **Q:** A README link is broken and a util function has a bug — single or sequential? → Sequential; they're independent.
- **Q:** What test artefact carries more signal than re-stated requirements? → The failing assertion's expected vs actual values for the specific input.
