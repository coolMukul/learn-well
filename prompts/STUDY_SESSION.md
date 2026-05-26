# Study Session — vendor-neutral assistant prompt

> **What this is:** A self-contained brief any AI assistant (Claude, ChatGPT, Gemini, …) can follow to run one study session for one topic of any course managed by this app.
>
> **Inputs the assistant needs before starting:**
> - **`<courseId>`** — the course slug (folder name under `courses/`, e.g. `ccaf-exam`). If not given, ask the user to pick one (list folders under `courses/`).
> - **`<topicId>`** *(optional)* — e.g. `1.3`. If not given, default to `currentTopicId` from the course's tracker.
>
> **Working directory convention:** Every path in this document is relative to the course root, i.e. `courses/<courseId>/`. So when the doc says `data/tracker.json`, read `courses/<courseId>/data/tracker.json`. The assistant resolves `<courseId>` once at the start and applies it everywhere.
>
> **Companion prompt:** [VERIFY_STUDY_SESSION.md](VERIFY_STUDY_SESSION.md) — the user runs this **in a fresh session** against your output. Do not run it yourself: the model that generated the materials is biased toward confirming its own choices, so an in-session self-check defeats the purpose.

## What the assistant is doing

The user studies one topic per session via a three-step UI flow: **pre-check → study lesson → test**. Your job is to prepare the materials for one topic so the UI can drive the user through those three steps. You do **not** run the quizzes — the UI does.

Per session, for one topic:

1. Identify the next topic to study (from the tracker).
2. Generate or extend the **per-topic lesson** at `topics/topic-<id>.md` — a real lesson, not a bullet skeleton.
3. Generate **10 pre-check questions** (`phase: "pre"`) — only on the first study, not on revisits.
4. Generate **10 test questions** (`phase: "post"`) — fresh on every revisit.
5. Update the tracker timestamps.
6. Stop and report. The user reads the lesson and runs the quizzes in the UI.

Note: an independent review (VERIFY_STUDY_SESSION.md) is required after this session — instruct the user to run it in a fresh assistant session before they trust the output. Do not self-verify.

## File map (paths relative to the course root)

| File | Role |
| --- | --- |
| [reference/sections/](reference/sections/) | **Per-topic syllabus excerpts** (`topic-<id>.md`) plus optional cross-cutting meta files (`_scenarios.md`, `_glossary.md`, etc.). **Read only the relevant excerpt for the current topic.** Excerpts are typically a few hundred to ~1000 tokens — vastly cheaper than the full guide. |
| [reference/](reference/) | The full original reference material (PDFs, the source guide, etc.). **Do not read** — read only the per-topic excerpts under `reference/sections/`. (When using Claude Code, a project hook may enforce this; with other assistants, follow it as a rule.) |
| [data/topics.json](data/topics.json) | Structured topic grid: chapters → topics → subtopics. Each topic has `excerptFile` and `lessonFile` pointers. Read-only — do **not** rewrite. |
| [data/tracker.json](data/tracker.json) | Per-topic progress: `started`, `finished`, `studyCompleted`, `preCheckResults`, `quizPasses`, `mastered`. **You update timestamps only.** |
| [data/questions/](data/questions/) | Question bank, **one file per topic** (`data/questions/<topic-id>.json`, e.g. `data/questions/2.3.json`). Append your new pre-check + post-test questions to the file matching the topic you're studying. **Never** write to a different topic's file. |
| [data/progress.json](data/progress.json) | Quiz attempt log written by the UI. **Read-only for the study session.** |
| [topics/topic-<id>.md](topics/) | **Per-topic lessons** (e.g. `topics/topic-1.1.md`). **You write these.** Format below. |
| [course.json](course.json) | Course metadata (id, name, description, optional `masteryThreshold`). Read-only. |
| [schedule/](schedule/) *(optional)* | Human-readable plans / methodology. Reference only. |

## Workflow — execute these steps in order

### Step 0 — Preflight: confirm the course is decomposed and structurally valid

Before doing anything, run the deterministic validator:

```bash
node scripts/validate-course.js <courseId>
```

Interpret the result:

- **Exit 0 with no FAILs** → course is healthy. Continue to Step 1.
- **Exit 0 with FAILs in section B (topics.json) WHERE the only FAIL is "`chapters` is empty"** → course isn't decomposed yet. Stop and tell the user:

  > "Course `<courseId>` has no topics yet. Run `/decompose <courseId>` first (or paste `prompts/DECOMPOSE_COURSE.md`) to generate the chapter / topic / subtopic structure."

- **Exit 1 with other FAILs** → course is broken. Stop and tell the user:

  > "Course `<courseId>` has structural issues. Run `/verify-course <courseId>` for the details and fixes (most often: re-run `/decompose <courseId>`). Studying on a broken course will produce work that the UI can't render."

- **Tracker missing entries** (validator section E FAIL) → tell the user to run `node scripts/sync-tracker.js <courseId>`.

If your environment can't run shell commands, do the same checks by hand:
1. Read `data/topics.json` — `chapters` must be a non-empty array; each chapter must have `name` (not `title`); each topic must have `id` matching `^\d+\.\d+$`, `subtopics` as an **array of strings**, and `excerptFile`/`lessonFile` paths.
2. Read `data/tracker.json` — `topics` object must have an entry for every topic in `topics.json`.

### Step 1 — Pick the next topic

Read [data/tracker.json](data/tracker.json):
- If the user named a specific topic ID in the prompt, use that.
- Else use `currentTopicId`. If that topic's `mastered` is set, advance to the next unmastered topic in the order topics appear in `topics.json` (walk chapters in order, topics in order within each chapter).
- Determine whether this is a **first study** (`studyCompleted == false` AND `preCheckResults` is empty) or a **revisit**. Revisits happen when the user wants to re-study after a failed test.

Read the matching topic entry in [data/topics.json](data/topics.json) for `title`, `subtopics`, `excerptFile`, `lessonFile`.

### Step 2 — Read the syllabus excerpt

Read **only** the per-topic excerpt file (path is `topics[i].excerptFile`, e.g. `reference/sections/topic-1.1.md`). It contains the official _Knowledge of_ and _Skills in_ lists for that one topic.

If the excerpt references a scenario by name and the course has `reference/sections/_scenarios.md`, read that for context. Same for `_sample_questions.md` (sample-question style) and `_glossary.md` (glossary terms). Skip any of these the course doesn't ship.

**Do not** attempt to read the full reference text under `reference/` — read only the per-topic excerpt(s) under `reference/sections/`. The excerpts are the source of truth for sessions.

### Step 3 — Write the detailed lesson

Open or create `topics/topic-<id>.md` (path is in `topics.json` at `topics[i].lessonFile`).

Use this structure. A good lesson is ~1500–2500 words total — enough that a learner can study from it without going back to the excerpt.

```markdown
# Topic <id> — <title>

> **Chapter <N> · <Chapter Name>** · <weight>% of the exam (if the course tracks chapter weights)
>
> _Optional one-liner: when this lesson was last revised and what changed._

## Why this matters

2–4 sentences on why this topic is worth studying. What downstream topics depend on this concept? What's the typical exam-question pattern that probes it? Connect it to one of the scenarios in `topics.json` if the course has them and the connection is real.

## <Subtopic 1 — exact subtopic name from topics.json>

3–6 paragraphs. Explain the concept like you're teaching it, not like you're listing facts. Use **bold** for the keyword the candidate needs to recognize. Include a **concrete example** mid-section — short pseudo-code, a brief workflow, or a "before/after" snippet — that makes the abstract concrete.

End the section with a **Common pitfall** callout: 1–2 sentences on the wrong intuition the exam tests for.

**Quick recall**
- **Q:** <question> → <one-line answer>.
- **Q:** <question> → <one-line answer>.

## <Subtopic 2>

… (one section per subtopic listed in topics.json for this topic)

## Anti-patterns

A short list of the wrong-answer patterns the exam loves to surface as distractors. **Each anti-pattern is a pair of bullets**: a red ❌ line that names the anti-pattern and explains what breaks (~2 sentences), followed by a green ✅ line on the next bullet stating the correct pattern (one terse sentence — no extra explanation, since the ❌ line already carries the *why*).

Format:

```markdown
- ❌ **<Anti-pattern name>** — 1–2 sentences naming the wrong move and the failure mode it causes.
- ✅ **<Correct pattern>** — one short sentence on what to do instead.
```

If the corrective has a non-obvious caveat (e.g., "do X, but only when Y"), add the caveat as a single clause on the ✅ line — don't expand it into a paragraph.

## Worked example — Scenario <S?> (<Scenario Name>)

3–6 sentences walking through one of the scenarios applying the techniques from this topic. Concrete: name the tools, name the failure mode, name the fix. (Skip this section if the course doesn't define scenarios.)

## Quick recall (full set)

5–10 flashcards consolidating the per-section ones. Format:
- **Q:** <question> → <answer>.
```

**Generation rules:**
- Anchor terminology in the **excerpt** (and the glossary if the course ships one). Don't invent vocabulary.
- If you reference a feature not in the excerpt, mark it `(supplementary)` so a reviewer can spot it.
- If a subtopic is also listed in `topics.json` `outOfScope`, **skip it** — don't synthesise content for out-of-scope material.
- On a **revisit**, update the existing file: refresh sharpened bullets, incorporate any quiz questions the user told you they missed, add new flashcards. Don't duplicate sections.

### How to safely append to `data/questions/<topic-id>.json` (read this once before Steps 4 & 5)

The question files are **JSON arrays**. They must be valid JSON at all times — the UI calls `JSON.parse` on them and silently shows zero questions if parsing fails. **Never** append text directly with an "append-to-file" mode; that produces files like `[{...}]\n,\n  {...}` which look like appends but aren't valid JSON.

Always use this **read–parse–append–write** pattern:

1. **Read** `data/questions/<topic-id>.json` if it exists.
2. **Parse** as JSON. The result MUST be an `Array`. If the file doesn't exist, start with `[]`. If parsing fails, **stop and warn the user** — don't silently overwrite their work.
3. **Append** the new question objects to the array (`arr.push(...newQuestions)`).
4. **Write** the entire array back as JSON, formatted with 2-space indent. The whole file must be exactly one JSON array, starting with `[` and ending with `]`.

Pseudocode:

```js
let arr = [];
if (fileExists(path)) {
  const text = readFile(path);
  arr = JSON.parse(text);          // throws on corruption — stop, don't overwrite
  if (!Array.isArray(arr)) throw new Error('not an array');
}
arr.push(...newQuestions);
writeFile(path, JSON.stringify(arr, null, 2) + '\n');
```

After writing, **verify** the file is still valid JSON by reading and parsing it once more. If the parse fails, fix it before continuing — the corruption is your write, not pre-existing.

### Step 4 — Generate the pre-check questions (FIRST STUDY ONLY)

Skip this step if `tracker.topics["<id>"].preCheckResults.length > 0` — pre-check is the **baseline**, locked in once and not regenerated.

Generate **10** MCQs and append them to `data/questions/<topic-id>.json` (e.g. `data/questions/2.3.json`) following the read–parse–append–write protocol above. Each entry has this exact shape:

```json
{
  "qid": "<UUID v4 — generate one fresh per question>",
  "question": "Realistic scenario-based question, 1–3 sentences. Mention production context.",
  "options": ["A", "B", "C", "D"],
  "explanations": [
    "1–2 sentences explaining why A is wrong (or right). Specific to this question — not generic.",
    "Why B is wrong (or right).",
    "Why C is wrong (or right).",
    "Why D is wrong (or right)."
  ],
  "answer": 0,
  "topics": ["Chapter <N>", "<topic-id>"],
  "phase": "pre"
}
```

The pre-check is meant to surface what the user already knows — calibrate so a candidate with general background knowledge in the field would get **3–5 of 10** without studying. Mix:
- 3–4 questions on **core concepts** (definitions, signal names, when to use what)
- 3–4 **scenario diagnosis** questions (system X is doing Y — what's the most likely cause?)
- 2–3 **anti-pattern recognition** questions (which option is the wrong approach?)

### Step 5 — Generate the post-test questions

Run this step on first study **and** revisits, but the post-test bank for a topic is **capped at 30 questions**. Use the read–parse–append–write protocol above to read `data/questions/<topic-id>.json` and count existing entries with `phase === "post"`. Compute `slots = 30 - <existing post count for this topic>`:

- `slots >= 10` → append **10** fresh MCQs.
- `0 < slots < 10` → append exactly `slots` fresh MCQs (don't pad with weaker questions to hit 10) and note the cap-approach in the report.
- `slots == 0` → **append nothing.** Report that the topic's post bank is at the cap and let the UI keep drawing from the existing 30.

Each appended MCQ uses this shape:

```json
{
  "qid": "<UUID v4 — generate one fresh per question>",
  "question": "…",
  "options": ["…", "…", "…", "…"],
  "explanations": ["…", "…", "…", "…"],
  "answer": 0,
  "topics": ["Chapter <N>", "<topic-id>"],
  "phase": "post"
}
```

The post-test gates mastery (≥ mastery threshold on the most recent attempt — see the course's `course.json` `masteryThreshold`, or the global default in `.env`'s `MASTERY_THRESHOLD`, default 90%). Calibrate higher than pre-check — well-prepared candidates should clear ≥90% reliably; partial knowledge should land 60–80%. Mix:
- 4–5 **scenario application** questions (apply the concept to a fresh production setup)
- 2–3 **anti-pattern diagnosis** with plausible distractors
- 2–3 **comparison** questions (when to choose technique X over Y)

**Hard rules for both sets:**
- `qid` is the **stable per-question identifier**. Mint a fresh UUID v4 (e.g. `crypto.randomUUID()` or `uuidgen`) for every new question. **Never reuse** another question's qid. The starred-practice and flagged-question features both reference `qid` — without it they silently break.
- `answer` is the **0-based index** into `options`.
- `options.length === explanations.length === 4`. Both arrays are required and parallel — `explanations[i]` explains `options[i]`.
- Each explanation must be **specific to this question** (1–2 sentences), naming the concept, the failure mode, or the trade-off — not generic boilerplate like "this is wrong because it's not the best choice."
- The correct option's explanation states *why* it's right (the principle being tested). Distractor explanations state *why the wrong intuition fails* — what real-world bug or miscalibration that pick would cause.
- `topics` MUST include both the chapter label (`"Chapter N"`) AND the topic ID (`"1.1"`, `"2.3"`, …) so the UI filters at topic granularity.
- `phase` MUST be `"pre"` or `"post"`. Untagged questions are ignored by the UI.
- Distractors must be **plausible** — the kind of answer a candidate with partial knowledge might pick. Avoid obviously-wrong filler.
- Mix the four `answer` indices roughly evenly across each 10-question set (don't always make A correct).
- On a revisit, **regenerate the post-test set** with new question text — do not duplicate text from prior `phase:"post"` entries with the same topic ID.
- **Per-topic post-test cap is 30.** Never let a topic's `phase:"post"` count exceed 30. Compute remaining slots before generating; append `min(10, 30 - existing)`. If the cap is already met, generate zero and report it.
- **One file per topic — never edit another topic's file.** If you're studying topic 2.3, you only write to `data/questions/2.3.json`. Don't touch `data/questions/2.1.json` or any other topic's file. This rule lets parallel sessions run on different topics without colliding.

### Step 6 — Update the tracker

Edit [data/tracker.json](data/tracker.json):

- `topics["<id>"].started` — if currently `null`, set it to the current ISO 8601 datetime with timezone offset (e.g. `"2026-04-29T09:14:32+05:30"`). **If already set, leave it alone — `started` is locked once.**
- `topics["<id>"].finished` — **always** set to the current ISO 8601 datetime. Reflects most recent study/revisit.
- `topics["<id>"].studyCompleted` — leave as-is. The UI sets this when the user clicks "Mark as read."
- `topics["<id>"].preCheckResults` — **do not write.** The UI appends to this when the user takes the pre-check.
- `topics["<id>"].quizPasses` — **do not write.** The UI appends to this when the user takes the test.
- `topics["<id>"].mastered` — leave as-is. The UI manages mastery.
- `currentTopicId` — leave as-is. Advance only when the user confirms.
- `lastUpdated` — current ISO 8601 datetime.

### Step 7 — Hand off to an independent reviewer

Do **not** verify your own output in this session. The model that generated the lesson and questions retains its generation reasoning and is biased toward confirming its own choices — an in-session self-check would defeat the purpose of review and miss the errors a fresh reviewer would catch.

Instead, stop here and tell the user (in your Step 8 report) to open a **fresh assistant session** and run the verification checklist at [VERIFY_STUDY_SESSION.md](VERIFY_STUDY_SESSION.md) against this topic. Claude Code users can run `/verify <courseId> <topicId>`. A fresh session has no memory of how the materials were generated, so it can question them honestly.

If the user comes back with FAILs from that review, fix them in another session and ask them to re-verify in another fresh one.

### Step 8 — Report and stop

Print a concise summary to the user:
- Course id and topic studied (id + title)
- First study or revisit
- Path to the lesson file written/updated
- Counts: pre-check questions appended (0 if revisit), post-test questions appended
- **Reminder: open a fresh assistant session and run `/verify <courseId> <topicId>` (or paste VERIFY_STUDY_SESSION.md) before trusting these outputs.** A fresh reviewer is required because this session is biased toward its own work.
- Then in the UI: take the pre-check (if first study), read the lesson, take the test.

Do **not** start the next topic in the same session. **One topic per study session.**

## Key invariants (do not violate)

- **`started` is locked once.** Never overwrite.
- **You don't write quiz results.** `preCheckResults` and `quizPasses` are UI-managed.
- **Pre-check is generated once.** Never regenerate it on revisits — the baseline is the baseline.
- **Post-test bank is capped at 30 per topic.** On any revisit, append `min(10, 30 - existing post count)` fresh questions. Never exceed 30 for a single topic.
- **Source of truth is the per-topic excerpt.** If a subtopic in `topics.json` doesn't appear in the excerpt, flag it and skip rather than inventing content. Don't read the full reference text.
- **Out-of-scope topics** (listed in `topics.json` under `outOfScope`) must not appear in lessons or questions.
- **Question topic tag MUST include the topic ID** (e.g., `"1.1"`) AND the chapter label.
- **`qid` is mandatory and immutable.** Mint a fresh UUID v4 per new question. Never reuse a qid; never edit an existing question's qid.
- **`phase` is mandatory** on every new question (`"pre"` or `"post"`).
- **`explanations` is mandatory** on every new question. Same length as `options`, parallel index. The UI shows them when a learner submits an answer.
- **Lesson depth > question count.** A great lesson with 8 sharp questions per phase beats a thin lesson with 12 mediocre ones.

## Things you should NOT do

- Don't rewrite [data/topics.json](data/topics.json) — it's the syllabus structure.
- Don't touch [data/progress.json](data/progress.json) — that's the UI's quiz log.
- Don't delete or rewrite questions already in the bank with the same `(taskId, phase)` — append new ones.
- Don't auto-advance `currentTopicId` past the user's mastery confirmation.
- Don't generate questions on out-of-scope topics — see `topics.json` `outOfScope` for the per-course list.
- Don't read the full reference text under `reference/` — read only the per-topic excerpt(s) under `reference/sections/`.

## How the user invokes you

The user opens a fresh assistant session and points it at this prompt. With Claude Code, that's `/study` (see [.claude/commands/study.md](.claude/commands/study.md)). With ChatGPT/Gemini/etc., paste the doc or upload it and tell the assistant the course id and (optionally) the topic id.

Examples:

> "Read prompts/STUDY_SESSION.md. Course: ccaf-exam. Continue from currentTopicId."

> "Read prompts/STUDY_SESSION.md. Course: ccaf-exam, topic 2.3 — I scored 75% and missed the questions about tool_choice forced selection."

Treat any specifics they provide (which topic, which questions they missed) as overrides to Step 1. Otherwise, follow the workflow as written.
