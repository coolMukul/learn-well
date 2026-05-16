---
description: Add a new course (folder scaffold + reference intake)
argument-hint: "[course name]  optional — will be asked if omitted"
---

Walk the user through adding a new course following the vendor-neutral workflow at [prompts/COURSE_SETUP.md](../../prompts/COURSE_SETUP.md).

**Arguments:** `$ARGUMENTS` (treat as the course name if non-empty; otherwise ask the user in Step 1.1).

## Execute the workflow

Follow every step in [prompts/COURSE_SETUP.md](../../prompts/COURSE_SETUP.md) in order:

1. **Phase 1 — Skeleton**: get name, derive id slug (and let user override), check uniqueness, ask for description, then scaffold `courses/<id>/` with the standard subfolders and seed JSON files (use the Write tool).
2. **Phase 2 — Reference intake**: ask the user how they want to provide reference material (file drop / paste / mix), handle each, sanity-check that `reference/` is non-empty before continuing.
3. **Phase 3 — Hand off**: tell the user to run `/decompose <id>` next, and **stop**. Do not run decomposition in the same session.

## Hard rules — see COURSE_SETUP.md for full text

- Course id must match `^[a-z0-9][a-z0-9-]*$`. If `courses/<id>/` already exists, refuse and ask for a different id.
- Never write to `data/topics.json` here — leave it as `{"chapters": []}`. Decomposition fills it.
- Never generate lessons (`topics/`) or questions (`data/questions/`) here. Those are `STUDY_SESSION.md`'s job.
- The hand-off to `/decompose` is intentional — separate sessions keep each phase focused and re-runnable.
