# Study Methodology — Claude Certified Architect (Foundations)

This document defines **how** to study each topic. The **what** and **when** live in [schedule/full_study_plan.md](full_study_plan.md) (topic grid with target dates).

- **Plan starts:** 2026-04-29
- **Exam pass score:** 720 / 1000 scaled (~72%)
- **Daily quiz study target:** ≥90% per topic — a single post-test at ≥90% marks the topic "mastered". Set higher than the exam bar to leave headroom for exam-day variance.

## Per-topic study cycle

For each task statement in the [topic grid](full_study_plan.md):

1. **Read** — the relevant section in [reference/Claude Certified Architect – Foundations Certification Exam Guide.txt](../reference/Claude%20Certified%20Architect%20%E2%80%93%20Foundations%20Certification%20Exam%20Guide.txt) plus any linked Anthropic docs.
2. **Summarize** — write or extend the topic note in [topics/](../topics/) using [topics/template.md](../topics/template.md). Capture: *Knowledge of* bullets, *Skills in* bullets, common anti-patterns, 1–2 worked scenario applications.
3. **Flashcards** — add 5–10 cards in [notes/](../notes/) using [notes/flashcards_template.md](../notes/flashcards_template.md).
4. **Hands-on** — when the task statement implies a buildable artifact (tool description, JSON schema, hook, slash command, agentic loop, MCP config), draft or pseudocode it.
5. **Quiz** — 10 topic-filtered MCQs from [data/questions.json](../data/questions.json). Retake with a fresh draw until ≥90%.
6. **Mark Started** in the topic grid the first time steps 1–5 are completed for the day.
7. **Mark Mastered** in the topic grid after a ≥90% post-test pass, with the topic note and any hands-on artifact in place.

## Quiz mechanics

- Source: [data/questions.json](../data/questions.json), filtered by `topics`.
- Every attempt is recorded in [data/progress.json](../data/progress.json) with `timestamp`, `topics`, `score`, `total`, `duration_seconds`, `question_ids`.
- Avoid reusing the same question IDs within a 7-day window.
- If two attempts on the same topic land below 90%, **stop and re-read the guide section** before retrying — random retries waste questions.

## Definition of "Mastered"

A topic is mastered when **all** are true:

- Topic note exists in [topics/](../topics/) and reflects the current guide content
- Most recent topic-filtered quiz ≥90%
- Any hands-on artifact for the topic is drafted (where applicable)
- The topic appears correctly applied in at least one scenario walkthrough (Scenarios 1–6 in the topic grid)

## Suggested rhythm

The topic grid in [full_study_plan.md](full_study_plan.md) is the source of truth. A workable cadence on top of it:

- **Mon–Fri:** one task statement per day (study cycle above)
- **Sat:** scenario walkthrough or hands-on exercise
- **Sun:** cumulative quiz (30 Qs across all `Started` topics) + flashcard review + update tracking columns

Slip dates as needed — coverage and mastery matter more than calendar adherence.

## Final stretch (last 1–2 weeks before exam)

Once all 28 task statements are mastered:

1. Walk through all six scenarios end-to-end (one design doc each).
2. Complete any outstanding hands-on exercises.
3. Take the official Anthropic Practice Exam.
4. Run two timed full mock exams from the local question bank — aim ≥80% on both.
5. Light review of weak spots; rest the day before.

## Out-of-scope topics

See the explicit list in [full_study_plan.md](full_study_plan.md). Don't burn study cycles on fine-tuning, vision, computer use, streaming, OAuth, cloud-provider specifics, or MCP hosting infrastructure — they will not appear on the exam.
