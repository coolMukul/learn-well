# Task 3.6 — Integrate Claude Code into CI/CD pipelines

> Domain 3: Claude Code Configuration & Workflows. Excerpted from the official guide.

## Knowledge of
- The `-p` (or `--print`) flag for running Claude Code in **non-interactive** mode in automated pipelines.
- `--output-format json` and `--json-schema` CLI flags for enforcing **structured output** in CI contexts.
- **CLAUDE.md** as the mechanism for providing project context (testing standards, fixture conventions, review criteria) to CI-invoked Claude Code.
- **Session context isolation**: why the same Claude session that generated code is less effective at reviewing its own changes compared to an independent review instance.

## Skills in
- Running Claude Code in CI with the `-p` flag to prevent interactive input hangs.
- Using `--output-format json` with `--json-schema` to produce machine-parseable structured findings for automated posting as inline PR comments.
- Including **prior review findings** in context when re-running reviews after new commits, instructing Claude to report only new or still-unaddressed issues to avoid duplicate comments.
- Providing **existing test files** in context so test generation avoids suggesting duplicate scenarios already covered by the test suite.
- Documenting testing standards, valuable test criteria, and available fixtures in CLAUDE.md to improve test generation quality and reduce low-value test output.
