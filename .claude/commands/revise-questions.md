---
description: Rewrite questions the user has flagged in the UI, using the per-flag reason as guidance
argument-hint: "<course-id> [qid] [qid] ...   (qids optional — defaults to every open flag)"
---

Revise flagged questions following the vendor-neutral workflow at [prompts/REVISE_QUESTIONS.md](../../prompts/REVISE_QUESTIONS.md).

**Arguments:** `$ARGUMENTS`

## Step 0 — Resolve `<courseId>`

Parse `$ARGUMENTS`:
- 0 args → ask the user which course (list `courses/*/course.json` ids and names).
- 1+ args → first arg is `<courseId>`. Remaining args (if any) are qids to restrict the work to.

If `<courseId>` doesn't match `^[a-z0-9][a-z0-9-]*$` or `courses/<courseId>/` doesn't exist, abort with a clear error.

## Step 1+ — Execute the workflow

Treat `courses/<courseId>/` as the working root. Follow every step in [prompts/REVISE_QUESTIONS.md](../../prompts/REVISE_QUESTIONS.md):

1. Read `data/flagged.json` and filter to `status === "open"` (intersect with the user's qid list if provided).
2. Group the work by `topicId`.
3. For each topic:
   - Read `reference/sections/topic-<topicId>.md` for terminology.
   - Read `data/questions/<topicId>.json`.
   - For each flagged qid, rewrite the matching question per the user's `reason` while preserving `qid`, `phase`, `topics`.
   - Write the question file back as one valid JSON array.
4. Update each processed flag in `data/flagged.json` to `status: "revised"` with a `revisedAt` ISO timestamp.
5. Report: per-qid one-liner of what changed, plus any skipped (missing question) and any in-batch concerns.

## Hard rules — see REVISE_QUESTIONS.md for full text

- **Never change a question's `qid`** — stars and old flags reference it.
- Don't change `phase` or `topics` unless the reason explicitly asks for it.
- Anchor every rewrite in `reference/sections/topic-<topicId>.md`. Do **not** read the full reference text.
- `options.length === explanations.length === 4`, parallel-indexed. `answer` is 0-based.
- Use read–parse–splice–write for question files (never append-mode).
