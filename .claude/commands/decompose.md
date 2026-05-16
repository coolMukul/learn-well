---
description: Decompose a course's reference material into chapters / topics / subtopics
argument-hint: "[course-id]  e.g. aws-saa (optional — will ask if omitted)"
---

Decompose the course's reference material into a structural skeleton following the vendor-neutral workflow at [prompts/DECOMPOSE_COURSE.md](../../prompts/DECOMPOSE_COURSE.md).

**Arguments:** `$ARGUMENTS` (treat as the `<courseId>` if non-empty).

## Step 0 — Resolve `<courseId>`

If `$ARGUMENTS` is empty:
1. List the courses: read each `courses/*/course.json` and show `id` + `name` (one line each).
2. **Ask the user** which course to decompose. If exactly one course exists you may default to it, but mention so in your report.

If `<courseId>` is provided, validate `courses/<courseId>/` exists and `courses/<courseId>/reference/` is non-empty. If reference is empty, tell the user to run `/new-course` (or its Phase 2) first to add material.

## Execute the workflow

Treat `courses/<courseId>/` as the working root for this session — every path the workflow doc references (`data/...`, `reference/...`, `topics/...`) is resolved under that course.

Follow every step in [prompts/DECOMPOSE_COURSE.md](../../prompts/DECOMPOSE_COURSE.md) in order:

1. Survey `reference/` and pick a reading strategy by total size.
2. Read the reference and identify chapters → topics → subtopics (+ optional out-of-scope, scenarios, weights).
3. **CHECKPOINT**: present the proposed structure as a tree and **wait for explicit user confirmation**. Apply requested changes and re-present until the user approves.
4. After approval, write `courses/<courseId>/data/topics.json` with the agreed structure.
5. Write per-topic excerpts to `courses/<courseId>/reference/sections/topic-<id>.md` (~500–1500 tokens each). Optionally write `_glossary.md`, `_scenarios.md`, `_sample_questions.md` if the source provides them.
6. Initialize the tracker by running `node scripts/sync-tracker.js <courseId>`.
7. Report: course id, N chapters / M topics, files written, next action (`/study <courseId>` to start authoring lessons + questions one topic at a time).

## Hard rules — see DECOMPOSE_COURSE.md for full text

- **Do not proceed past the CHECKPOINT** without explicit user approval. The structure shapes 30+ files.
- Don't write `topics/` lesson markdown or `data/questions/` here — those are `STUDY_SESSION.md`'s job.
- Don't read full huge reference text wholesale — use per-topic reading strategy from Step 1.
- When re-decomposing an existing course, preserve all `tracker.json` per-topic progress and quiz history (the `sync-tracker.js` helper handles this).
- One course per decomposition session. Don't auto-advance into `STUDY_SESSION.md`.
