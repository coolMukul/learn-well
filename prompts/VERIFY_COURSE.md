# Verify Course — vendor-neutral assistant prompt

> **What this is:** A vendor-neutral checklist any AI assistant can run to verify that a course is **structurally valid** — `topics.json` matches the engine's schema, all per-topic excerpts exist, every question file is valid JSON with the right shape, and the tracker is in sync.
>
> **When to run:** After `/decompose` (to confirm the structure was written correctly), after manual edits to `topics.json`, or whenever the UI looks broken for a course.
>
> **Inputs:**
> - **`<courseId>`** — the course slug. If not given, ask the user (list folders under `courses/`).
>
> **Companion to:** [VERIFY_STUDY_SESSION.md](VERIFY_STUDY_SESSION.md), which checks one topic's lesson + question outputs after `/study`. This prompt checks the *whole course's structure*, not the per-topic study work.

## What you're doing

1. Run the deterministic validator: `node scripts/validate-course.js <courseId>`.
2. If it exits 0 with no FAIL findings → report PASS and tell the user the next step.
3. If it has FAIL findings → list them with the fix to apply, and tell the user how to re-run after fixing.
4. Optionally add **judgment** observations the script can't make (subtopic naming quality, excerpt coverage). Mark these `(judgment)`.

You do **not** edit any course files in this prompt. You report; the user (or `/decompose`) fixes.

## Step 1 — Run the validator

```bash
node scripts/validate-course.js <courseId>
```

Capture the output and exit code:
- **Exit 0** → all schema/file checks pass. Continue to Step 2 for judgment notes (optional) and Step 3 to report.
- **Exit 1** → one or more FAIL items. Continue to Step 2 to surface them as actionable fixes.
- **Exit 2** → bad arguments or course not found. Stop and surface the error verbatim.

If your environment can't run shell commands, perform the same checks by reading the files manually:

- `course.json` exists, has `id` and `name` strings.
- `data/topics.json` parses, has `chapters: []`. Each chapter has `name` (NOT `title`), `topics: []`. Each topic has `id` matching `\d+\.\d+`, `title`, `subtopics` (array of **strings**, not objects), `excerptFile`, `lessonFile` (both strings).
- For every topic, `<courseRoot>/<excerptFile>` exists.
- `data/questions/<topicId>.json` (where present) parses as a JSON **array**. Each item has `question` (str), `options[4]`, `explanations[4]`, `answer` (int 0–3), `phase` ("pre"|"post"), `topics` (array including the topic id and the chapter tag `"Chapter <N>"`).
- `data/tracker.json` has an entry for every topic id in `topics.json`.
- `data/progress.json` is a JSON array.

## Step 2 — Translate FAILs into actionable fixes

For each FAIL the validator reports, map it to a concrete next action:

| FAIL pattern | Likely cause | Fix |
|---|---|---|
| `chapter has \`title\` but expected \`name\`` | Decomposer used wrong field name | Re-run `/decompose <id>`. Decomposition will overwrite `topics.json` with the correct schema. |
| `subtopics must be an array of STRINGS, not objects` | Decomposer wrapped subtopics in `{id, title}` objects | Re-run `/decompose <id>`. |
| `missing string \`excerptFile\`` or `\`lessonFile\`` | Decomposer skipped the path fields | Re-run `/decompose <id>`. |
| `topic \`id\` must match /^\d+\.\d+$/` | Topic ids have wrong format (e.g., `1.1.1`) | Re-run `/decompose <id>` and at the CHECKPOINT correct the IDs to `<chapter>.<topic>`. |
| `excerptFile missing` (file on disk) | Decompose Step 5 was skipped or failed | Re-run `/decompose <id>` — Step 5 will write all excerpts. |
| `data/questions/<id>.json invalid JSON` | Question authoring tool corrupted the file (likely an "append-text" instead of read-parse-write) | Either fix the file by hand (open it, ensure it's a valid `[...]` array) or delete it and re-run `/study <id> <topicId>` to regenerate. **Warn the user that deletion loses any handwritten questions.** |
| `\`topics\` must include topic id "<id>"` | Question record missing its task tag | Edit the file by hand to add the missing tag; or re-run `/study <id> <topicId>` for a fresh generation. |
| `tracker missing N topics from topics.json` | `sync-tracker.js` wasn't run after a fresh `topics.json` | Run `node scripts/sync-tracker.js <id>`. |

If the validator FAIL message has a clear file path, repeat it in your fix recommendation so the user can jump to the file.

## Step 3 — Optional judgment notes

These can't be automated — the assistant can offer them but should mark them clearly:

- **Subtopic naming quality** *(judgment)* — open `topics.json` and skim 2–3 topics. Are subtopic strings phrased as concrete learning objectives (e.g., "Universal law of gravitation") rather than vague headers (e.g., "Stuff about gravity")? Flag thin or vague subtopic lists.
- **Excerpt coverage** *(judgment)* — open one or two `reference/sections/topic-<id>.md` files and check they actually contain content from the source reference (not empty placeholders). Flag empty or one-line excerpts.
- **Topic granularity** *(judgment)* — does any chapter have only 1 topic with 14+ subtopics that should arguably be 2–3 topics? Or 8 thin topics that could collapse to 4? Flag and suggest re-decompose.

These are advisory. Don't mark a course "broken" because of judgment notes — only because of mechanical FAILs.

## Step 4 — Report

Print a concise summary:

```
Verification of <courseId> — <PASS | FAIL>

Mechanical checks (validate-course.js):
  PASS: <n>   WARN: <n>   FAIL: <n>

<If FAIL > 0:>
Issues to fix:
  1. <FAIL section> — <message>
     Fix: <action from Step 2 table>
  2. ...

<If judgment notes:>
Judgment observations:
  - <note>

Next action:
  <if PASS:>  Course structure looks good. Run `/study <courseId>` to start authoring lessons + questions.
  <if FAIL:>  Apply the fixes above (most common: re-run `/decompose <courseId>`), then re-run `/verify-course <courseId>`.
```

## Things you should NOT do

- Don't edit any course files here. This prompt only verifies and reports.
- Don't delete a question file unless the user explicitly asks. JSON corruption can sometimes be fixed by hand (one missing bracket) and the user may have invested effort in those questions.
- Don't skip the validator and just eyeball the files. The validator catches drift the human eye misses.

## How the user invokes you

With Claude Code:

> `/verify-course <courseId>` (wraps this prompt)

With any other assistant:

> "Read prompts/VERIFY_COURSE.md. Course: `<courseId>`."
