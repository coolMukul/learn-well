---
description: Run a study session for one topic of a course
argument-hint: "[course-id] [topic-id]  e.g. ccaf-exam 1.3 (both optional)"
---

Run a study session following the vendor-neutral workflow at [prompts/STUDY_SESSION.md](../../prompts/STUDY_SESSION.md).

**Arguments:** `$ARGUMENTS`

## Step 0 — Resolve `<courseId>` and `<topicId>` before starting

Parse `$ARGUMENTS`:
- 0 args → both unknown.
- 1 arg → if it matches `^\d+\.\d+$` it's a `<topicId>` (course unknown); otherwise it's a `<courseId>` (topic defaults to `currentTopicId`).
- 2 args → first is `<courseId>`, second is `<topicId>`.

If `<courseId>` is unknown:
1. List the courses: read each `courses/*/course.json` and show `id` + `name` (one line each).
2. **Ask the user** which course to operate on. Do not guess if there are multiple. If there is exactly one course, you may default to it but mention it in the report.

If `<topicId>` is unknown, read `courses/<courseId>/data/tracker.json`'s `currentTopicId` per Step 1 of the workflow.

## Step 1+ — Execute the workflow

Treat `courses/<courseId>/` as the working root for this session — every path the workflow doc references (`data/...`, `topics/...`, `reference/...`) is resolved under that course.

Follow every step in [prompts/STUDY_SESSION.md](../../prompts/STUDY_SESSION.md) in order:

1. Pick the topic.
2. Read the per-topic excerpt at `courses/<courseId>/reference/sections/topic-<id>.md`. **Do not read the full reference text** — it's hook-blocked when present in `reference/` and is in any case forbidden by Step 2 of the workflow.
3. Write the detailed lesson to `courses/<courseId>/topics/topic-<id>.md`.
4. Generate 10 pre-check questions (only on first study, never on revisits).
5. Generate post-test questions (fresh on every revisit). Append `min(10, 30 - existing post count for this topic)` — the post-test bank is **capped at 30 per topic**. If already at 30, append 0 and note it in the report.
6. Update `courses/<courseId>/data/tracker.json` (`started`, `finished`, `lastTopicId`, `lastUpdated` only — never write to `preCheckResults`/`quizPasses`/`mastered`).
7. **Independent review** — launch the `study-reviewer` subagent via the Agent tool (`subagent_type: study-reviewer`, defined at [.claude/agents/study-reviewer.md](../agents/study-reviewer.md)). Pass it **only** the course id and topic id — do **not** include the lesson text, generated questions, or any reasoning from this session. A fresh context is the point: the model that generated the materials retains its generation reasoning and is biased toward confirming its own choices, so an in-session self-check defeats the purpose of review. If the subagent reports any FAILs, fix them in this session and re-spawn a fresh `study-reviewer` until it passes.
8. Report concisely: course id, topic ID + title, first study or revisit, lesson path, question counts appended, independent-review result (PASS / FAILs fixed), next action.

## Hard rules — see STUDY_SESSION.md for full text

- Each new question MUST have `phase` (`"pre"` or `"post"`), `topics` containing both `"Chapter N"` and the topic ID, parallel `options`/`explanations` arrays of length 4, and `answer` index 0–3.
- Pre-check is **locked** — never regenerate once the user has any pre-check entries.
- Post-test bank is **capped at 30 per topic** — never let a topic's `phase:"post"` count exceed 30.
- One topic per session. Do not advance to the next topic in the same session.
