# Course Setup — vendor-neutral assistant prompt

> **What this is:** A self-contained brief any AI assistant (Claude, ChatGPT, Gemini, …) can follow to add a new course to this workspace and stage its reference material for decomposition.
>
> **Scope:** Phases 1 & 2 only — folder scaffold + reference intake. Once reference material is in place, hand off to [DECOMPOSE_COURSE.md](DECOMPOSE_COURSE.md) (Phase 3) to generate the topic structure.
>
> **You will need a tool that can write files** to the project working tree. With Claude Code, that's the Write tool. With ChatGPT/Gemini, use a code interpreter or local-file mode; if you have neither, the prompt prints the JSON for the user to save manually.

## What you're doing

1. Get the course **name** and derive a slug **id** from it.
2. Scaffold `courses/<id>/` with empty seed JSON and the standard subfolders.
3. Get the user's **reference material** into `courses/<id>/reference/` — either by them dropping files, or by them pasting text that you write to a file.
4. Hand off to [DECOMPOSE_COURSE.md](DECOMPOSE_COURSE.md).

You do **not** generate `topics.json` content here — that's decomposition's job.

---

## Phase 1 — Skeleton

### Step 1.1 — Get the course name and id

Ask the user:

> "What's the name of the course? (e.g., *AWS Solutions Architect — Associate*)"

From the name, derive an **id slug**:
- lowercase
- words separated by hyphens
- alphanumerics + hyphens only
- must start with a letter or digit
- short and memorable (≤ 30 chars)

Examples:
| Name | Suggested id |
|---|---|
| `AWS Solutions Architect — Associate` | `aws-saa` |
| `Kubernetes Fundamentals` | `k8s-fundamentals` |
| `Postgres for Application Developers` | `postgres-app-dev` |

Show the proposed id to the user and let them override:

> "I'll use the id `aws-saa`. OK or pick a different slug?"

Wait for confirmation before continuing.

### Step 1.2 — Validate the id is unique

Check that `courses/<id>/` doesn't already exist. If it does, ask the user to pick a different id (or confirm they want to abort and edit the existing course manually).

### Step 1.3 — Optional description

Ask:

> "One-line description (optional)?"

Use whatever the user provides; empty string is fine.

### Step 1.4 — Scaffold the folder

Create the following file tree under `courses/<id>/`. Every JSON file gets the exact contents shown.

```
courses/<id>/
├── course.json
├── data/
│   ├── topics.json          → {"chapters": []}
│   ├── tracker.json         → {"topics": {}, "lastTopicId": null, "lastUpdated": null}
│   ├── progress.json        → []
│   └── questions/           (empty directory)
├── topics/                  (empty directory)
├── reference/               (empty directory)
│   └── sections/            (empty directory)
├── notes/                   (empty directory)
├── practice/                (empty directory)
└── schedule/                (empty directory)
```

`course.json` content (replace `<id>`, `<name>`, `<description>`, and today's date):

```json
{
  "id": "<id>",
  "name": "<name>",
  "description": "<description>",
  "createdAt": "<YYYY-MM-DD>"
}
```

If your tool can't create empty directories, drop a placeholder `.gitkeep` in each.

### Step 1.5 — Confirm scaffold

Print a one-line confirmation:

> "Created `courses/<id>/` with empty seed files."

---

## Phase 2 — Reference intake

### Step 2.1 — Ask how the user wants to provide reference material

Ask:

> "How would you like to add reference material?
>
> **(a)** I'll drop files (PDFs, .txt, .md, etc.) into `courses/<id>/reference/` and tell you when ready.
> **(b)** I'll paste the content here and you can save it for me.
> **(c)** Mix of both — I'll drop some files and paste some content.
>
> Note: PDFs work best if pre-converted to text/markdown — most LLMs read text far more reliably than binary."

Wait for the user's choice.

### Step 2.2 — Handle file drop (option a or c)

If the user is dropping files:
- Tell them to place files under `courses/<id>/reference/`. They can use subdirectories (e.g. `reference/chapters/01-intro.md`) or flat files — your choice.
- When they say "ready", **list the contents** of `courses/<id>/reference/` and confirm with the user that the listing matches what they expected.

### Step 2.3 — Handle pasted content (option b or c)

If the user is pasting content:
- Ask for a short **filename** (e.g., `course-syllabus.md`, `lecture-notes.md`). If they don't supply one, derive from the content (e.g., the first heading) or use `pasted-<n>.md`.
- Write the pasted content to `courses/<id>/reference/<filename>`.
- Loop: ask "Anything else to add?" and repeat until the user says no.

### Step 2.4 — Reference sanity check

Before handing off, verify:
- `courses/<id>/reference/` is **not empty** (excluding the `sections/` subdirectory). If empty, loop back to Step 2.1.
- Total reference content is plausibly enough to derive a course from. Rough heuristic: at least a few hundred words. If it's less than that, warn the user that the resulting structure will be very thin.

---

## Phase 3 — Hand off (REQUIRED — don't skip)

The course is now an empty skeleton with reference material. **It is not yet usable in the UI** — the dashboard will show the empty-state explainer until you decompose it. You must explicitly hand off to the decomposition step.

### Step 3.1 — Print the hand-off message

Print this verbatim (substituting the actual id):

```
✓ Course "<id>" set up.
  • Folder created:   courses/<id>/
  • Reference files:  <list of files now in reference/>
  • Topics generated: 0 (decomposition is the next step)

Next step (REQUIRED to make the course studyable):

  Claude Code:        /decompose <id>
  Any other LLM:      paste prompts/DECOMPOSE_COURSE.md and say "Course: <id>"

After decomposition, run /verify-course <id> to confirm the structure is browsable
in the UI. Then /study <id> to author lessons + questions one topic at a time.
```

### Step 3.2 — Stop

Do **not** run decomposition in the same session. Reasons:
- Decomposition is heavy (reading the full reference, proposing structure, writing 30+ files); a fresh context handles it better.
- It's re-runnable. If decomposition is bundled into setup and fails partway, recovery gets tangled.
- The user may want to add more reference material before decomposing.

If the user explicitly asks "go ahead and decompose now", politely insist on a fresh session/turn — paste them the `/decompose <id>` command and stop.

---

## Things you should NOT do

- Don't write to `data/topics.json` here — leave it as `{"chapters": []}`. Decomposition fills it.
- Don't generate any lessons under `topics/` — that's `STUDY_SESSION.md`'s job.
- Don't generate any questions under `data/questions/` — also `STUDY_SESSION.md`'s job.
- Don't slurp huge full-text reference documents (long PDFs, multi-hundred-page guides) wholesale — leave that triage to decomposition's per-topic reading strategy.
- Don't auto-advance to decomposition. The hand-off is intentional: separate sessions keep each phase focused and re-runnable.

## How the user invokes you

With Claude Code:

> `/new-course` (wraps this prompt)

With any other assistant:

> "Read prompts/COURSE_SETUP.md and walk me through adding a new course."
