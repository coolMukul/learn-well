# Revise Flagged Questions — vendor-neutral assistant prompt

> **What this is:** A self-contained brief any AI assistant (Claude, ChatGPT, Gemini, …) can follow to rewrite questions the user has flagged as problematic. The user supplies the guidance per-flag in the UI; your job is to act on it.
>
> **Inputs the assistant needs before starting:**
> - **`<courseId>`** — the course slug (folder name under `courses/`, e.g. `ccaf-exam`). If not given, ask the user to pick one (list folders under `courses/`).
> - *(optional)* a list of specific qids the user wants revised. If omitted, revise **every flag whose `status` is `"open"`** in `data/flagged.json`.
>
> **Working directory convention:** Every path in this document is relative to the course root, i.e. `courses/<courseId>/`.

## What the assistant is doing

The user flags questions in the UI when they think the question is bad — redundant, ambiguous, factually wrong, has implausible distractors, etc. Each flag carries a free-text **reason** (their guidance to you). Your job is to rewrite each flagged question per the user's reason, keeping the question's `qid` stable so any star/flag references survive.

After revision, you mark the flag `status: "revised"` so the UI stops surfacing it.

## File map (paths relative to the course root)

| File | Role |
| --- | --- |
| [data/flagged.json](data/flagged.json) | Array of `{ qid, topicId, reason, status, createdAt }`. **Source of truth for what to revise.** Read all entries with `status === "open"` (or only the qids the user specified). |
| [data/questions/](data/questions/) | One `<topic-id>.json` file per topic. **You edit these in place** — find the question whose `qid` matches the flag, rewrite it, write the file back. Never change a question's `qid`. |
| [reference/sections/topic-&lt;id&gt;.md](reference/sections/) | Per-topic excerpt — the source of truth for the lesson and its questions. **Read this** before rewriting any question for that topic so the revision stays anchored to the syllabus. |
| [data/topics.json](data/topics.json) | Maps topicId → chapter, title, subtopics. Read-only. |

## Workflow

### Step 1 — Load the work list

Read `courses/<courseId>/data/flagged.json`. Filter to `status === "open"`. If the user named specific qids, intersect with that list. If the resulting list is empty, **stop and report** "No open flags."

Group the work by `topicId` so you can read each topic's excerpt and question file at most once.

### Step 2 — For each topic in the work list

For every flagged qid under that topic:

1. **Read the per-topic excerpt** (`reference/sections/topic-<topicId>.md`). This is the only authoritative source for terminology and scope. **Do not** consult the full reference under `reference/`.
2. **Read the question file** `data/questions/<topicId>.json`, find the question with the matching `qid`. If the question is missing (e.g. a previous edit removed it), mark the flag `status: "revised"` with a `note: "question no longer exists"` and move on.
3. **Read the user's `reason`** carefully. The reason is your editorial brief — interpret it literally:
   - "Two distractors say the same thing" → rewrite the duplicate distractor with a genuinely different wrong intuition.
   - "Scenario is unrealistic" → swap the scenario for a plausible production setup that still tests the same concept.
   - "Correct answer is ambiguous" → tighten the question wording until exactly one option is defensible.
   - "Question tests trivia, not understanding" → reframe to test reasoning over a concrete situation.
   - If the reason is vague (e.g. "bad question"), do your best given the question itself but **do not invent a complaint** — keep the same concept in scope and improve clarity, distractor quality, and explanation specificity.
4. **Rewrite the question** in place, preserving:
   - **`qid`** — must stay identical. Stars and old flags reference it.
   - **`phase`** (`"pre"` or `"post"`).
   - **`topics`** (chapter + topic id tags).
   - **The concept being tested** — unless the reason explicitly says the concept is wrong/out-of-scope. The user is asking you to improve the *question*, not change the *topic*.

   Replace as needed:
   - **`question`** — the prompt itself.
   - **`options`** — exactly 4 plausible options.
   - **`explanations`** — exactly 4, parallel-indexed to `options`. Each is 1–2 sentences specific to *this* question — name the concept, the failure mode, or the trade-off. The correct option's explanation states *why* it's right; distractor explanations state *why the wrong intuition fails*.
   - **`answer`** — 0-based index into `options`. Mix correct-answer indices across the batch (don't always make A correct).

5. **Write the question file back** as one valid JSON array (read–parse–splice–write; never append-mode). After writing, parse it once more to confirm validity.

6. **Update `data/flagged.json`**: set this flag's `status` to `"revised"` and add a `revisedAt` ISO timestamp. Leave `reason` and `createdAt` intact (so the audit trail survives).

### Step 3 — Report

Print a concise summary:
- Course id and the number of flags processed.
- Per qid: a one-line summary of what changed (e.g. "1.3 / qid 7c…f0 — rewrote distractors B and C; tightened scenario to streaming").
- Any flags skipped because the question no longer exists.
- Reminder: starred entries pointing at any of these qids still resolve correctly, since `qid` was preserved.

## Hard rules — do not violate

- **Never change a question's `qid`.** Stars and historical flags reference it. If the question must be removed entirely, instead leave it in place and rewrite it fully — the qid stays.
- **Never change a question's `phase` or `topics`** unless the user's reason explicitly tells you to (e.g. "this question belongs in 1.4, not 1.3"). Even then, prefer to flag the issue back to the user instead of silently moving questions.
- **`options.length === explanations.length === 4`.** Both arrays parallel-indexed.
- **`answer` is the 0-based index** into `options` (0–3).
- **Anchor terminology in the excerpt.** Don't invent vocabulary. If the reason asks for content that's clearly out of scope per `reference/sections/topic-<topicId>.md`, push back in your report rather than fabricate it.
- **Do not read the full reference text** under `reference/`. Only the per-topic excerpt(s) under `reference/sections/`.
- **Read–parse–splice–write** for question files. Never append-mode (it produces invalid JSON).
- **One question file edit per topic batch.** Group your rewrites so you don't do N reads + N writes when 1+1 will do.

## How the user invokes you

With Claude Code: `/revise-questions <courseId>` (see [.claude/commands/revise-questions.md](../.claude/commands/revise-questions.md)).

With ChatGPT/Gemini/etc.: paste this doc and tell the assistant the course id (and optionally specific qids).
