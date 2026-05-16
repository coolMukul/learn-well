# Task 3.6 — Integrate Claude Code into CI/CD pipelines

> **Domain 3 · Claude Code Configuration & Workflows** · 20% of the exam

## Why this matters

CI/CD is where Claude Code stops being an interactive co-pilot and becomes an unattended pipeline step — running on every push, posting PR comments, generating tests. The shift to non-interactive use introduces a small set of mechanics the exam tests directly: how to actually exit without waiting for a human (`-p` / `--print`), how to produce output the pipeline can route (`--output-format json` plus `--json-schema`), and how to feed project context (testing standards, fixtures, review criteria) without ad-hoc env-var schemes (CLAUDE.md). On top sit two design principles: **session context isolation** between generator and reviewer instances, and **passing prior artifacts** (existing tests, prior review findings) into the next run so the bot doesn't duplicate work or leak rationale. Scenario 5 leans on all of these, so this topic is high-yield for Domain 3's 20% weighting.

## `-p` / `--print` non-interactive flag

`claude` defaults to an interactive REPL. Run it from a CI job without telling it otherwise and the process attaches to a TTY that doesn't exist and **blocks waiting for input** — the job hangs until the runner's idle timeout kills it. The fix is **`-p`** (long form `--print`). With `-p`, Claude Code processes the prompt argument, writes its response to stdout, and exits with a normal exit code. A typical GitHub Actions step: `claude -p "$REVIEW_PROMPT" --output-format json > findings.json`. Forget `-p` and the job hangs for ~6 minutes, then fails with a confusing "no output" error rather than a clean failure pointing at the missing flag — which is why the exam likes this trap.

> **Common pitfall** — Inventing flags that don't exist (`--batch`, `--headless`, `--no-tty`) or relying on shell tricks (`< /dev/null`, `nohup`). Stdin redirection silences the prompt but doesn't change Claude Code's mode; the documented non-interactive switch is `-p`/`--print`.

**Quick recall**
- **Q:** Pipeline job hangs forever — first thing to check? → Did you pass `-p` / `--print`? Without it Claude Code waits for interactive input.
- **Q:** Long form of `-p`? → `--print`.

## `--output-format json` + `--json-schema` for parseable findings

Default Claude Code output is human-readable prose — fine for a developer at a terminal, terrible for a pipeline that needs to extract "list of issues with severity, file path, line number" and post inline PR comments. Parsing prose with regex is brittle: a wording change ("found a bug" → "noticed an issue") and the pipeline silently drops findings.

**`--output-format json`** switches output to a structured envelope. **`--json-schema <path>`** goes further: you supply a JSON Schema describing the exact shape of the findings array, and Claude Code constrains output to that schema. The pipeline can then `jq` over the findings and post each one as an inline review comment with no parsing logic. A workable schema: array of objects with `severity` enum (`info`/`warning`/`error`), required `file` (string), `line` (integer), `message` (string), optional `suggestion` (string).

> **Common pitfall** — Trying to coerce structure by saying "respond as JSON" inside the prompt instead of using `--output-format json` + `--json-schema`. Prompt-only JSON is best-effort: the model sometimes wraps it in prose, sometimes adds a trailing comment. The flags enforce structure at the harness layer.

**Quick recall**
- **Q:** Two flags that produce parseable findings the pipeline can route without regex? → `--output-format json` and `--json-schema <schema-path>`.
- **Q:** Why is "ask for JSON in the prompt" insufficient? → It's probabilistic; the harness flags enforce structure deterministically.

## CLAUDE.md as the CI context channel

Testing standards, fixture conventions, valuable-test criteria, review priorities — none of these belong in CLI flags or env vars. They are **project context**, and Claude Code's documented channel for project context is **CLAUDE.md**. When `claude -p` runs in CI it reads CLAUDE.md from the working directory (and the hierarchy above) just like an interactive session, so anything there shapes every CI invocation automatically.

For a test-generation pipeline a useful CLAUDE.md section reads: "Tests live next to source as `*.test.ts`. Use `mockUser()` / `mockOrder()` from `test/fixtures/`. A *valuable* test asserts behaviour the implementation could plausibly get wrong; don't write tests that re-state the implementation." For a review pipeline: "Review priorities: security, data integrity, error handling, readability. Don't flag style — that's handled by the linter." This keeps the pipeline command short (`claude -p "generate tests for $FILE"`) while ensuring every run honours team standards.

> **Common pitfall** — Encoding testing standards as environment variables (`TEST_FRAMEWORK=jest`, `FIXTURES_PATH=...`) or stuffing them into the prompt at every CI invocation. The standards are project context, not job parameters; they live in CLAUDE.md.

**Quick recall**
- **Q:** Where do testing standards, fixture conventions, and review criteria belong for a CI Claude Code job? → CLAUDE.md (committed to the repo), not flags or env vars.
- **Q:** Why is the CLAUDE.md pattern preferable to inlining standards in every prompt? → It's read automatically on every run, version-controlled, and keeps the pipeline command simple.

## Session context isolation: generator vs reviewer instances

A tempting anti-pattern is to have one Claude Code session generate code and then ask the same session to review what it just produced. The session has the full generation rationale in context — trade-offs considered, assumptions made, corners cut — and that **biases the review**. The model defends its earlier choices instead of surfacing their weaknesses, because it "knows" why they were made.

The fix is **session context isolation**: spawn an independent Claude Code instance for review with no access to the generator's transcript. The reviewer sees only artifacts (diff, code, review prompt), not generation reasoning. In a CI pipeline this is automatic because each `claude -p` invocation is a fresh process — as long as you don't `--resume` the generator's session into the reviewer step. The trap is scripted setups that "save time" by reusing a session id across both steps, re-introducing the bias isolation was meant to prevent.

> **Common pitfall** — "Reuse the generator's session for review to save context tokens / API cost." Cost savings come at the price of a biased review that defends generation choices.

**Quick recall**
- **Q:** Why should a reviewer instance be a fresh Claude Code session, not the same one that generated the code? → Generation rationale in shared context biases the review toward defending the original choices.
- **Q:** How is isolation achieved in a typical CI pipeline? → Each `claude -p` invocation is a fresh process; just don't `--resume` the generator's session into the review step.

## Including prior review findings to avoid duplicate comments on re-runs

A PR review bot runs on the initial push. The developer pushes a fixup commit. The bot runs again and posts the same five comments — even though only one file changed. From the developer's perspective the bot is spamming. From the bot's perspective it's just doing its job: it has no memory of what it said last time.

The solution is to **pass prior review findings into the next run as input context** and instruct Claude to "report only issues that are new in this revision or remain unaddressed; suppress findings already in the prior list." The bot dedupes against itself; comments only appear when something genuinely changed.

In practice the pipeline reads prior findings (from PR comment metadata, a workflow artifact, or a sidecar file) and passes them as part of the prompt and/or as an attached file. The same pattern applies to test generation: pass the **existing test files** so the test-generator doesn't propose already-covered scenarios.

> **Common pitfall** — "Increase the model's caution / lower its temperature / tell it to be more conservative" to fix duplicate comments. The duplication isn't a confidence issue; it's a missing-context issue. Provide the prior findings.

**Quick recall**
- **Q:** Re-run review bot is posting duplicate comments. Fix? → Include the prior review findings in the next run's context with instructions to suppress already-reported issues.
- **Q:** Wrong fix to the same problem? → Tightening the model's caution / temperature — the model is missing context, not being reckless.

## Providing existing test files in context to avoid duplicate test scenarios

Test-generation has the same shape. A bot asked to "generate tests for `payment.ts`" produces a suite that re-tests scenarios already covered by `payment.test.ts` next door — duplicate happy-path tests, duplicate input validation, sometimes tests that contradict the existing ones because the bot inferred different behaviour than the existing assertions.

The fix is to **provide the existing test files in context** and instruct Claude to "extend coverage — do not duplicate scenarios already asserted. Identify gaps (uncovered branches, missing error paths, edge cases) and write tests for those." A solid pipeline loads three things into context: (1) source under test, (2) existing test file(s) for that source, (3) the testing-standards section of CLAUDE.md.

> **Common pitfall** — Generating tests with only the source file in context. The bot can't dedupe against scenarios it can't see; the result is a noisy PR with overlapping tests the developer has to triage.

**Quick recall**
- **Q:** How do you stop a test-generation bot from proposing scenarios already covered? → Pass the existing test file(s) into the run and instruct Claude to extend coverage rather than duplicate it.
- **Q:** Three things a CI test-generation pipeline should load into context? → Source under test, existing tests for that source, testing-standards section of CLAUDE.md.

## Anti-patterns

- ❌ **Running `claude "prompt"` in CI without `-p`.** The job hangs waiting for interactive input until the runner times out.
- ✅ **Always pass `-p` / `--print` for non-interactive pipeline invocations.**
- ❌ **Parsing prose output with regex** to extract findings. One wording change and the pipeline silently drops issues.
- ✅ **Use `--output-format json` plus `--json-schema` so the pipeline reads structured data directly.**
- ❌ **Asking for JSON inside the prompt** ("respond as JSON…") instead of using the harness flags. Probabilistic compliance; occasional prose wrappers and trailing comments.
- ✅ **Enforce structure at the harness layer with `--output-format json` + `--json-schema`.**
- ❌ **Encoding testing standards / review criteria as env vars** or inlining them in every prompt.
- ✅ **Put project context (standards, fixtures, criteria) in CLAUDE.md; the CI invocation reads it automatically.**
- ❌ **Reusing the generator's session for review** to save tokens. Generation rationale biases the review toward defending original choices.
- ✅ **Spawn an isolated reviewer instance with no access to the generator's transcript.**
- ❌ **Re-review bot posts duplicate comments → "increase the model's caution / lower temperature."** Wrong root cause; the model is missing context, not being reckless.
- ✅ **Pass prior review findings into the re-run with instructions to report only new/unaddressed issues.**
- ❌ **Generating tests with only the source file in context.** Bot can't dedupe against scenarios it can't see, produces overlapping tests.
- ✅ **Pass the existing test file(s) into the run and instruct the model to extend coverage, not duplicate it.**
- ❌ **`--resume` the generator session into the reviewer step "to share context."** That's exactly the context you're trying *not* to share.
- ✅ **Each role (generate, review) gets a fresh session; share artifacts (diffs, prior findings, existing tests), not transcripts.**

## Worked example — Scenario S5 (Claude Code for Continuous Integration)

A team integrates Claude Code into their PR workflow: generate tests for new functions, review the diff for security issues, post inline comments. The first iteration ships and produces three complaints.

Complaint 1: *"The job hangs for six minutes on every PR."* The pipeline runs `claude "review this diff"`. **Fix:** add `-p`. The job now exits in ~30 seconds.

Complaint 2: *"The comment-posting step crashes — can't find the severity field."* The pipeline pipes prose output through a regex extractor. **Fix:** `claude -p "..." --output-format json --json-schema schemas/findings.json`. The schema requires `severity`, `file`, `line`, `message`. Wording changes no longer break the pipeline.

Complaint 3: *"After a fixup commit, the bot re-posts the same five comments."* The re-run has no memory of prior findings. **Fix:** fetch prior findings (stored as a workflow artifact keyed by PR number) and pass them into the next run with instructions to suppress already-reported issues. (A teammate proposes "lower the temperature so the bot is more careful" — rejected as the wrong root cause.)

A fourth issue surfaces in retro: the test-generation bot proposes tests already in the suite, and same-session reviews approve everything. Fixes: (a) pass the existing `*.test.ts` file into the test-generation run with "extend coverage; don't duplicate"; (b) keep review as a separate `claude -p` invocation with no `--resume` so generator/reviewer sessions stay isolated. Testing standards and review priorities move into CLAUDE.md so every CI invocation honours them without per-job prompts.

## Quick recall (full set)

- **Q:** What flag makes Claude Code non-interactive in CI? → `-p` (long form `--print`).
- **Q:** Symptom of forgetting `-p` in a pipeline? → Job hangs waiting for input until the runner idle-timeout kills it.
- **Q:** Two flags for parseable structured findings? → `--output-format json` and `--json-schema <schema>`.
- **Q:** Why prefer `--output-format json` + `--json-schema` over "respond as JSON" in the prompt? → Harness-level structure is enforced; prompt-level JSON is probabilistic and occasionally wrapped in prose.
- **Q:** Where do testing standards, fixture conventions, and review criteria live for a CI job? → In CLAUDE.md, version-controlled with the repo.
- **Q:** Why not env vars for testing standards? → They are project context, not job parameters; CLAUDE.md is the documented channel and is read on every invocation.
- **Q:** Why must generator and reviewer be isolated sessions? → Generation rationale in shared context biases the review toward defending the original choices.
- **Q:** How is isolation typically achieved in a CI pipeline? → Each `claude -p` invocation is a fresh process; do not `--resume` the generator session into the review step.
- **Q:** Re-run review bot is posting duplicate comments. Right fix? → Pass the prior findings into the next run with instructions to suppress already-reported issues.
- **Q:** Why is "lower temperature / increase caution" the wrong fix for duplicate comments? → The bot isn't being reckless; it's missing the context of what it already said.
- **Q:** How do you stop a test-generation bot from proposing already-covered scenarios? → Provide the existing test file(s) in context and instruct it to extend coverage rather than duplicate.
- **Q:** Three things a CI test-generation pipeline should load into context? → Source under test, existing tests for that source, testing-standards section of CLAUDE.md.
- **Q:** What does the review pipeline share between generator and reviewer? → Artifacts (diffs, prior findings, existing tests) — not transcripts or session state.
- **Q:** Why is parsing prose output with regex an anti-pattern? → A wording change silently drops findings; structure must be enforced at the harness layer.
