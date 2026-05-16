# Delete Course — vendor-neutral assistant prompt

> **What this is:** A self-contained brief any AI assistant (Claude, ChatGPT, Gemini, …) can follow to safely delete a course (its folder + all data) from this workspace.
>
> **This is destructive and irreversible.** The repo is not version-controlled, so deletion permanently removes lessons, question banks, and quiz history. The prompt requires the user to type the course id verbatim before anything is removed.
>
> **Inputs:**
> - **`<courseId>`** — the course slug to delete. If not given, ask the user (list folders under `courses/`).

## What you're doing

1. Validate the course exists.
2. Print a **deletion summary** showing exactly what will be lost.
3. Ask the user to type the course id **verbatim** to confirm. If it doesn't match, abort.
4. Delete `courses/<id>/`.
5. Confirm deletion.

## Step 1 — Validate

Check that `courses/<courseId>/` exists. If not:

> "No course with id `<courseId>`. Available: <comma-separated list from `courses/*/course.json`>."

Stop.

## Step 2 — Build the deletion summary

Read these inside `courses/<courseId>/`:

- `course.json` → `name`, `description`, `createdAt`
- `data/topics.json` → count `chapters`, count `topics` (sum across chapters)
- `data/tracker.json` → count topics with progress:
  - `started` (any topic with `started !== null`)
  - `mastered` (any topic with `mastered !== null`)
  - **total quiz attempts** (sum of `quizPasses.length` across all topics)
  - **total pre-checks taken** (sum of `preCheckResults.length`)
- `data/progress.json` → array length (UI quiz log entries)
- `data/questions/` → file count
- `topics/` → markdown file count
- `reference/` → file count (recursive, excluding empty dirs)

Print a compact summary like this:

```
Course to delete:
  id:          <courseId>
  name:        <course.json name>
  description: <course.json description or '(none)'>
  created:     <course.json createdAt>

Content:
  chapters:    <N>
  topics:      <M>
  lessons:     <count of files in topics/>
  question files: <count in data/questions/>
  reference files: <count in reference/>

Progress (will be lost):
  topics started:  <count>
  topics mastered: <count>
  pre-checks taken: <count>
  quiz attempts:   <count>
  progress.json log entries: <count>
```

If **any** progress field is non-zero, also print this warning line:

> "⚠️  This course has progress data — quiz history and mastery records will be permanently lost."

## Step 3 — Verbatim confirmation

Ask:

> "To confirm deletion, type the course id exactly: `<courseId>`
>
> (Or anything else to cancel.)"

Wait for the user's response. **Compare exactly** — case-sensitive, no leading/trailing whitespace tolerated beyond a normal trim. If the response doesn't equal `<courseId>`:

> "Confirmation didn't match. Aborted — nothing was deleted."

Stop.

## Step 4 — Delete

After verbatim match, delete the directory tree:

- **Shell available:** `rm -rf courses/<courseId>` (or `Remove-Item -Recurse -Force "courses/<courseId>"` on PowerShell-only environments).
- **No shell:** use your file-system tool's recursive delete on `courses/<courseId>/`.

The user's harness may prompt for permission on the `rm` — that's expected, approve it.

## Step 5 — Confirm

After the delete:
- List `courses/` and verify `<courseId>` is no longer present.
- Print:

> "Deleted course `<courseId>` (`<course name>`). <N> chapters, <M> topics, <quiz-count> quiz attempts removed."

If a browser tab is open on `/course/<courseId>`, the user will need to refresh — the course will 404 from the API. (Mention only if relevant.)

## Things you should NOT do

- Don't delete anything else outside `courses/<courseId>/`.
- Don't proceed past Step 3 without an exact verbatim match.
- Don't offer to "back up first" — the repo isn't version-controlled and there's no archive convention. If the user wants a backup, they should make it themselves before invoking this prompt.
- Don't loop on a mistyped confirmation. If the user types it wrong once, abort cleanly. They can re-invoke if they meant it.

## How the user invokes you

With Claude Code:

> `/delete-course <courseId>` (wraps this prompt)

With any other assistant:

> "Read prompts/DELETE_COURSE.md. Course: `<courseId>`."
