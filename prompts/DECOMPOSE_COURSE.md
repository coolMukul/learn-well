# Decompose Course — vendor-neutral assistant prompt

> **What this is:** A self-contained brief any AI assistant (Claude, ChatGPT, Gemini, …) can follow to read a course's reference material and produce its structural skeleton (`topics.json` + per-topic excerpts + initialized tracker).
>
> **Prerequisite:** The course must already exist with reference material in `courses/<id>/reference/`. Use [COURSE_SETUP.md](COURSE_SETUP.md) first if it doesn't.
>
> **Inputs:**
> - **`<courseId>`** — the course slug. If not given, ask the user (list folders under `courses/`).
>
> **Working directory convention:** every path below is relative to the course root, i.e. `courses/<courseId>/`.

## What you're doing

Read the course's reference material, propose a **chapters → topics → subtopics** structure, **pause for user confirmation**, then write:

1. `data/topics.json` — the structural skeleton.
2. `reference/sections/topic-<id>.md` — one per-topic excerpt, sliced from the reference. These are what `STUDY_SESSION.md` reads later (cheap, focused).
3. `data/tracker.json` — initialized with an empty progress entry per topic.

You do **not** generate lessons or questions. Those come later via `STUDY_SESSION.md`, one topic at a time.

---

## Step 0 — Preflight

Before reading any reference material, check the course's existing state. `COURSE_SETUP.md` left these as **stubs** that this prompt will overwrite:

| File | Expected stub state | What you'll do |
|---|---|---|
| `data/topics.json` | `{"chapters": []}` | **Overwrite** with the agreed structure (Step 4). |
| `data/tracker.json` | `{"topics": {}, "lastTopicId": null, "lastUpdated": null}` | **Update** by adding an entry per topic (Step 6). Existing entries preserved. |
| `data/progress.json` | `[]` | Don't touch. UI manages this. |
| `reference/sections/` | empty directory | Populate with one `topic-<id>.md` per topic (Step 5). |

Read the two stub files now to confirm:
- If `data/topics.json` is **not** present at all, stop and tell the user the course wasn't set up correctly (rerun `/new-course`).
- If `data/topics.json.chapters` is **non-empty**, this is a **re-decompose** (course was already decomposed earlier). Confirm with the user that they want to overwrite the existing structure (`tracker.json` per-topic progress is preserved automatically).
- Otherwise it's a fresh decompose — proceed.

If your file-write tool requires reading a file before overwriting it (e.g., Claude Code's `Write` tool), the reads above also satisfy that requirement for Steps 4 and 6.

---

## Step 1 — Survey the reference

List `reference/` (excluding the `sections/` subdirectory). For each file, note:
- name
- size (rough — bytes or word count)
- type (markdown, plain text, …)

Decide your reading strategy:
- **Small total reference (< 10k tokens):** read it all up front.
- **Larger:** scan headings / table of contents first; read sections on demand as you propose structure.
- **Very large (huge guide, multi-hundred-page text):** read the table of contents and chapter-opening pages first; defer the rest until decomposition decides which sections matter.

If `reference/` is **empty** (only `sections/` subdir, or nothing), stop and tell the user to add material first via [COURSE_SETUP.md](COURSE_SETUP.md) Phase 2.

## Step 2 — Read enough to propose structure

Read the reference (per your Step 1 strategy) to identify:

- **Chapters** — the top-level grouping. Each chapter is a coherent section of the course (~5–10 chapters is typical, but follow the source). Assign each an id like `C1`, `C2`, … or just `1`, `2`, … whatever the source suggests.
- **Topics within each chapter** — the unit of one study session. Number them `<chapter>.<topic>`: `1.1`, `1.2`, `2.1`, …
- **Subtopics within each topic** — the bullet-level objectives. These become the `## ` sections of the per-topic lesson later. Aim for 3–6 per topic. Phrase as short noun phrases or "knowledge of …" / "skill in …" statements.
- **Out-of-scope items** *(optional)* — concepts the reference explicitly excludes. Keep as a flat list.
- **Scenarios** *(optional)* — recurring use-case patterns the reference defines (named scenarios, case studies). Keep as a list with `id` + `name` + short description.
- **Chapter weights** *(optional)* — only if the source assigns coverage % per chapter (e.g., exam weight). Otherwise omit.

Topic id rules:
- Format: `<chapter-num>.<topic-num>` — exactly one dot, both numbers ≥ 1.
- Sequential within a chapter: 1.1, 1.2, 1.3, …
- No gaps unless the source has them deliberately.

## Step 3 — CHECKPOINT: present the proposal and wait

Print the proposed structure as a compact tree, like:

```
Proposed structure for "<course name>" (<courseId>):

Chapter 1 — Foundations  (weight: 20%)
  1.1  Tail vs head recursion
       subtopics: base-case identification; stack growth pattern; conversion to iteration; when the compiler optimizes
  1.2  Mutual recursion
       subtopics: ...
  ...

Chapter 2 — Data structures
  2.1  ...
  ...

Out of scope: parallel recursion, lazy evaluation
Scenarios: (none)
```

Then ask:

> "Confirm to proceed (I'll write `topics.json`, the per-topic excerpts, and initialize the tracker), or tell me what to change. Examples:
>
> - merge 2.1 and 2.2
> - rename Chapter 1 to 'Recursion basics'
> - add a topic 1.5 covering tail-call optimization
> - drop subtopic 'X' from 1.3"

**Wait for explicit user approval.** Do not proceed on silence. If the user requests changes, apply them and re-present.

## Step 4 — Write `data/topics.json`

`data/topics.json` **already exists** as the empty stub `{"chapters": []}` from `COURSE_SETUP.md`. **Overwrite** it with the agreed structure — do **not** treat this as a "create new file" operation. (You already read it in Step 0, which satisfies any read-before-write requirement.)

After approval, the file contents become exactly this shape:

```json
{
  "chapters": [
    {
      "id": "C1",
      "name": "<chapter name>",
      "weight": 20,
      "topics": [
        {
          "id": "1.1",
          "title": "<topic title>",
          "subtopics": [
            "<subtopic 1>",
            "<subtopic 2>",
            "..."
          ],
          "excerptFile": "reference/sections/topic-1.1.md",
          "lessonFile": "topics/topic-1.1.md"
        }
      ]
    }
  ],
  "outOfScope": ["..."],
  "scenarios": [
    { "id": "S1", "name": "...", "description": "..." }
  ]
}
```

### Field reference (required vs optional, exact spelling)

The engine reads these exact field names. **Wrong field name = silent UI break.** The validator (`scripts/validate-course.js`) catches drift.

**Top level**

| Field | Required | Type | Notes |
|---|---|---|---|
| `chapters` | yes | array | Top-level grouping. Empty array allowed only for stub state. |
| `outOfScope` | no | array of strings | **Omit the key entirely** if nothing to list. Don't include `[]`. |
| `scenarios` | no | array of objects | **Omit the key entirely** if the course has none. |

**Each chapter object**

| Field | Required | Type | Notes |
|---|---|---|---|
| `id` | yes | string | e.g., `"C1"` or `"1"`. |
| `name` | yes | string | **NOT `title`.** The UI sidebar reads `chapter.name` and renders `undefined` if you used `title`. |
| `weight` | no | number | Only include if the source assigns coverage % per chapter. Omit otherwise. |
| `topics` | yes | array | At least one topic. |

**Each topic object**

| Field | Required | Type | Notes |
|---|---|---|---|
| `id` | yes | string | Must match `^\d+\.\d+$` — exactly `<chapter>.<topic>`, e.g., `"1.1"`, `"2.3"`. **Two-level only.** Don't use `"1.1.1"` for subtopic ids — subtopics aren't ids in this schema. |
| `title` | yes | string | The display name of the topic. |
| `subtopics` | yes | **array of plain strings** | **NOT array of objects.** Each string becomes a `## ` heading in the lesson `STUDY_SESSION.md` writes later. Example: `["Need for measurement", "Units (CGS, MKS, SI)", "Errors in measurement"]`. **Do not** wrap in `{id, title}` objects. |
| `excerptFile` | yes | string | Always exactly `"reference/sections/topic-<id>.md"`. You write this file in Step 5. |
| `lessonFile` | yes | string | Always exactly `"topics/topic-<id>.md"`. `STUDY_SESSION.md` writes this file later. |

**Each scenario object** (only if `scenarios` is present)

| Field | Required | Type |
|---|---|---|
| `id` | yes | string (e.g., `"S1"`) |
| `name` | yes | string |
| `description` | yes | string |

### Self-check before continuing to Step 5

After writing `topics.json`, run:

```bash
node scripts/validate-course.js <courseId>
```

If it reports any FAIL under section B (topics.json), **stop and fix** before generating excerpts — there's no point writing 30 excerpts pointing at a broken structure. WARNs are fine.

## Step 5 — Write per-topic excerpts

For each topic, write a focused excerpt to `reference/sections/topic-<id>.md`. Each excerpt is the slice of the source reference that pertains to that one topic.

Target: **~500–1500 tokens per excerpt**. Long enough to teach the subtopics; short enough that `STUDY_SESSION.md` can read it cheaply (one excerpt per topic vs. the full reference).

Format:

```markdown
# Topic <id> — <title>

> Source: <chapter name> (and any sub-section names from the reference).

## Knowledge of

- <key concept 1>
- <key concept 2>
- ...

## Skills in

- <skill 1>
- <skill 2>
- ...

## Notes from the source

<verbatim or near-verbatim slice from the reference covering this topic — direct quotes preferred over paraphrase, so STUDY_SESSION.md anchors lessons in the source's vocabulary>
```

If your source isn't structured as "Knowledge of / Skills in" lists, replace those headings with whatever fits — but keep the *Notes from the source* section, which is the lesson-grounding payload.

If the same source paragraph applies to multiple topics, copy it into each — excerpts are independent reference slices, not de-duplicated.

If you can also extract cross-cutting material (a glossary, a sample-question section, a scenarios catalog), write those to:
- `reference/sections/_glossary.md`
- `reference/sections/_scenarios.md`
- `reference/sections/_sample_questions.md`

These are optional — only write what the source provides.

## Step 6 — Initialize the tracker

`data/tracker.json` **already exists** as the empty stub `{"topics": {}, "lastTopicId": null, "lastUpdated": null}` from `COURSE_SETUP.md`. This step **overwrites** it (or, on a re-decompose, merges into it preserving any existing per-topic progress).

Preferred: run the deterministic CLI helper:

```bash
node scripts/sync-tracker.js <courseId>
```

This reads the new `topics.json`, ensures every topic id has an empty entry in `tracker.json`, **preserves any existing per-topic progress**, and updates `lastUpdated`.

If you have no shell access (some assistant environments), write `data/tracker.json` directly. Read the current file first (already done in Step 0). For each topic id in the new `topics.json`, ensure the file has the shape:

```json
{
  "topics": {
    "1.1": {
      "started": null,
      "finished": null,
      "studyCompleted": false,
      "preCheckResults": [],
      "quizPasses": [],
      "mastered": null
    },
    "1.2": { ...same... },
    ...
  },
  "lastTopicId": null,
  "lastUpdated": "<current ISO 8601>"
}
```

Preserve any existing entries. Keys are topic ids; values are the empty schema above.

## Step 7 — Validate and report

**First, run the validator:**

```bash
node scripts/validate-course.js <courseId>
```

If it reports any FAIL, **stop and fix** before reporting success — the most common cause is a Step 4 schema slip (wrong field name, subtopics as objects, missing `excerptFile`/`lessonFile`). Re-do Step 4 with the corrected shape and re-run the validator.

Then print a concise summary:

- Course id
- N chapters, M topics
- Wrote: `data/topics.json`, M per-topic excerpts under `reference/sections/`, `data/tracker.json` initialized
- Optional cross-cutting refs written: glossary / scenarios / sample-questions (whichever you produced)
- Validator: PASS / WARN-only / FAIL details
- **Next actions** (tell the user *both* steps — they are not optional):
  1. **Verify** the structure: `/verify-course <courseId>` (Claude Code) or [prompts/VERIFY_COURSE.md](VERIFY_COURSE.md). Belt-and-suspenders: confirms the structure is browsable in the UI before authoring lessons.
  2. **Author** the first topic: `/study <courseId>` (or [prompts/STUDY_SESSION.md](STUDY_SESSION.md)). One topic per session.

Don't auto-advance into `STUDY_SESSION.md` — same rationale as the SETUP → DECOMPOSE handoff. One topic per study session.

---

## Things you should NOT do

- Don't write `topics/` lesson markdown — that's `STUDY_SESSION.md`'s job, one topic at a time.
- Don't write `data/questions/<topic-id>.json` — also `STUDY_SESSION.md`'s job.
- Don't proceed past Step 3 without explicit user confirmation. The structure shapes 30+ files; the cost of getting it wrong is high.
- Don't modify any existing `tracker.json` entries beyond adding new ones for new topics. If a course is being re-decomposed (rare), preserve all `started`/`finished`/`mastered`/quiz history.
- Don't invent topics that aren't in the reference. If the source is thin, propose a thin structure — don't pad.
- Don't skip the per-topic excerpts. They're what makes `STUDY_SESSION.md` cheap (read one ~1k-token excerpt vs. the whole reference per session).

## Re-running decomposition

It's safe to re-run this prompt later if the user adds more reference material. The behavior:

- The CHECKPOINT in Step 3 will show a new proposal incorporating the new material. The user can accept, reject, or merge with the existing structure.
- `topics.json` is rewritten — preserve any topics the user wants kept.
- Per-topic excerpts are rewritten — fine, since they're derived data.
- `tracker.json` is updated via `sync-tracker.js`, which **preserves** existing per-topic progress. Quiz history is never touched.

## Recovering from a failed decomposition

If a previous decompose run failed partway through (e.g., your file-write tool refused to overwrite `data/topics.json`, or you ran out of context mid-Step-5), the course will be in an inconsistent state — typically a populated `topics.json` but missing or partial excerpts under `reference/sections/`, and a tracker that may not have entries for all topics.

**Recovery is just re-running this prompt.** All steps are idempotent:
- Step 4 unconditionally overwrites `topics.json` with the freshly-agreed structure.
- Step 5 unconditionally rewrites every per-topic excerpt — old excerpts are replaced, missing ones get created.
- Step 6 (`sync-tracker.js`) adds entries for any topics missing from `tracker.json` and preserves any that already exist.

You don't need to manually reset the course. Just re-run `/decompose <id>` and confirm the structure at the CHECKPOINT.

## How the user invokes you

With Claude Code:

> `/decompose <courseId>` (wraps this prompt)

With any other assistant:

> "Read prompts/DECOMPOSE_COURSE.md. Course: <courseId>."
