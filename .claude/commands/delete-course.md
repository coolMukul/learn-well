---
description: Permanently delete a course and all its data (lessons, questions, quiz history)
argument-hint: "[course-id]  e.g. aws-saa (optional — will ask if omitted)"
---

Delete a course following the vendor-neutral workflow at [prompts/DELETE_COURSE.md](../../prompts/DELETE_COURSE.md).

**Arguments:** `$ARGUMENTS` (treat as `<courseId>` if non-empty).

**This is destructive and irreversible.** The repo is not under version control.

## Step 0 — Resolve `<courseId>`

If `$ARGUMENTS` is empty:
1. List the courses: read each `courses/*/course.json` and show `id` + `name` (one line each).
2. **Ask the user** which course to delete. **Never default to a single course** — for a destructive operation, always make the user pick explicitly, even if only one exists.

If `<courseId>` is provided, validate `courses/<courseId>/` exists. If not, list available courses and stop.

## Execute the workflow

Follow every step in [prompts/DELETE_COURSE.md](../../prompts/DELETE_COURSE.md) in order:

1. Validate the course exists.
2. **Print the deletion summary** (course metadata + content counts + progress counts). If any progress field is non-zero, include the explicit data-loss warning.
3. **Ask the user to type `<courseId>` verbatim** to confirm. If the response doesn't match exactly, abort with "nothing was deleted" — do not loop.
4. After verbatim match, delete `courses/<courseId>/` recursively (`rm -rf courses/<courseId>`). The harness may prompt for `rm` permission — that's expected.
5. Verify `<courseId>` is gone from `courses/` and report what was removed.

## Hard rules — see DELETE_COURSE.md for full text

- **Verbatim confirmation is mandatory** — exact, case-sensitive match of the course id. Anything else aborts cleanly.
- **Never delete anything outside `courses/<courseId>/`.** No other paths, no other courses.
- **Don't loop** on a mistyped confirmation. One try, then abort. The user can re-invoke if they meant it.
- **Never default to a single course** in Step 0. Always make the user name it.
