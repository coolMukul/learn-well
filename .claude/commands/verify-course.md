---
description: Verify a course's structural validity (topics.json schema, excerpts, question files, tracker)
argument-hint: "[course-id]  e.g. ccaf-exam (optional — will ask if omitted)"
---

Verify a course's structural validity following the vendor-neutral workflow at [prompts/VERIFY_COURSE.md](../../prompts/VERIFY_COURSE.md).

**Arguments:** `$ARGUMENTS` (treat as `<courseId>` if non-empty).

## Step 0 — Resolve `<courseId>`

If `$ARGUMENTS` is empty:
1. List the courses: read each `courses/*/course.json` and show `id` + `name` (one line each).
2. **Ask the user** which course to verify. If exactly one course exists you may default to it, but mention so in your report.

## Execute the workflow

Follow [prompts/VERIFY_COURSE.md](../../prompts/VERIFY_COURSE.md) in order:

1. Run `node scripts/validate-course.js <courseId>` and capture the output + exit code.
2. If FAILs are reported, translate each into an actionable fix using the table in Step 2 of the workflow.
3. (Optional) Add judgment observations the script can't make — mark each `(judgment)`.
4. Report PASS or FAIL with a concrete next action:
   - PASS → user should run `/study <courseId>`
   - FAIL → most common fix is re-running `/decompose <courseId>`; then re-run `/verify-course <courseId>`.

## Hard rules — see VERIFY_COURSE.md for full text

- **This prompt is read-only.** Do not edit any course files. Report; the user (or another command) fixes.
- Don't skip the validator. Eyeballing the files misses drift.
- Don't delete a question file unless the user explicitly asks (JSON corruption can sometimes be fixed by hand without losing the questions).
- Mark judgment observations clearly with `(judgment)`. Don't fail a course on judgment alone.
