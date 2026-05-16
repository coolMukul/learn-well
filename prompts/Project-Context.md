# Multi-Course Study Workspace

A small Express-based study app that holds **one or more courses**, each with its own per-topic lessons, question bank, tracker, and reference materials. Originally built for the **Claude Certified Architect — Foundations** exam (now living as the `ccaf-exam` course); the engine is course-agnostic and can host any exam-style or course-style curriculum.

## High-level layout

```
ClaudeCertification\
├── server.js, public\           ← engine (course-agnostic)
├── package.json, .env, README.md
├── CLAUDE.md                    ← thin pointer for Claude Code → prompts/Project-Context.md
├── scripts\                     ← engine-level CLI utilities
│   ├── sync-tracker.js          ← idempotent: ensure tracker.json has an entry for every topic in topics.json
│   ├── migrate-add-qids.js      ← idempotent: backfill a UUID `qid` on every question (run once per course; new questions are minted with qids by /study)
│   └── validate-course.js       ← deterministic structural validator (topics.json schema, question-file JSON, qid presence/uniqueness, etc.)
├── prompts\                     ← shared, vendor-neutral assistant prompts (any LLM)
│   ├── Project-Context.md       ← this file: workspace layout & conventions
│   ├── COURSE_SETUP.md          ← run by /new-course: scaffold a new course + reference intake
│   ├── DECOMPOSE_COURSE.md      ← run by /decompose: parse reference → chapters/topics/subtopics
│   ├── DELETE_COURSE.md         ← run by /delete-course: permanently remove a course (verbatim confirmation)
│   ├── VERIFY_COURSE.md         ← run by /verify-course: structural validation (wraps validate-course.js)
│   ├── STUDY_SESSION.md         ← run by /study: write one topic's lesson + questions
│   ├── VERIFY_STUDY_SESSION.md  ← run by /verify in a fresh session after /study (never self-checked in the generating session)
│   └── REVISE_QUESTIONS.md      ← run by /revise-questions: rewrite questions the user flagged in the UI, using their per-flag reason
├── .claude\                     ← Claude Code-specific config (slash commands, hooks, perms)
│   ├── commands\{new-course,decompose,delete-course,verify-course,study,verify,revise-questions}.md
│   └── settings.json
└── courses\
    └── <courseId>\              ← one folder per course; <courseId> is a slug
        ├── course.json          ← {id, name, description, createdAt}
        ├── data\
        │   ├── topics.json      ← syllabus structure (chapters → topics → subtopics)
        │   ├── tracker.json     ← per-topic progress (started, finished, mastered, etc.)
        │   ├── progress.json    ← UI's quiz attempt log (append-only)
        │   ├── starred.json     ← qids the user starred for re-practice: [{qid, topicId, createdAt}]
        │   ├── flagged.json     ← qids the user flagged for AI revision: [{qid, topicId, reason, status: "open"|"revised", createdAt, revisedAt?}]
        │   └── questions\<topic-id>.json   ← question bank, one file per topic; every question carries a stable UUID `qid`
        ├── topics\              ← per-topic lesson markdown (topic-<id>.md)
        ├── reference\           ← original source material
        │   └── sections\        ← per-topic excerpts written by /decompose (topic-<id>.md, _glossary.md, _scenarios.md, _sample_questions.md)
        ├── notes\, practice\, schedule\   ← optional human-managed content
        └── scripts\             ← optional one-off course-specific scripts
```

Today there is one course: `ccaf-exam`.

## Goal

Pass exams (or work through any structured curriculum) by studying one topic at a time via a three-step UI flow — pre-check → study lesson → test — tracking progress in `courses/<id>/data/tracker.json`.

## URL & API scheme

- `/` — courses-list screen (no sidebar). Pick a course or add a new one.
- `/course/<id>` — that course's dashboard (topic tree in sidebar, three-step UI in main panel).
- API: every course-scoped endpoint is `/api/courses/<id>/...`:
  - `GET  /api/courses` — list all courses
  - `POST /api/courses` — create (`{id, name, description}`); scaffolds folders + seed JSON files
  - `GET/PATCH /api/courses/:id/tracker`
  - `GET  /api/courses/:id/topics`, `/questions[?phase&topicId&starred=1&flagged=1]`, `/notes?path=...`, `/config`, `/progress`
  - `POST /api/courses/:id/progress`
  - `GET/POST /api/courses/:id/starred`, `DELETE /api/courses/:id/starred/:qid`
  - `GET/POST /api/courses/:id/flagged`, `PATCH/DELETE /api/courses/:id/flagged/:qid`

The server has an SPA fallback so deep links like `/course/ccaf-exam` survive a refresh.

## Running the practice app

```bash
npm install
npm start          # auto-picks an open port in 3090–3099
PORT=3091 npm start  # or pin a port
```

Open the URL printed to the console. Port selection logic lives in `choosePort()` at [server.js](server.js).

## Adding a course

Three ways, in order of completeness:

1. **AI-assisted (recommended)** — let an assistant scaffold the course AND ingest reference material:
   - Claude Code: `/new-course` → `/decompose <id>` → `/verify-course <id>` → `/study <id>`
   - Any other LLM: open [prompts/COURSE_SETUP.md](COURSE_SETUP.md), then [prompts/DECOMPOSE_COURSE.md](DECOMPOSE_COURSE.md), then [prompts/VERIFY_COURSE.md](VERIFY_COURSE.md), then [prompts/STUDY_SESSION.md](STUDY_SESSION.md)
   - End state after the first three: a fully populated course with `topics.json`, per-topic excerpts, initialized tracker — ready for `/study`. `/verify-course` is recommended after every `/decompose` (catches schema drift before you author content on top of a broken structure).
2. **Via the UI** — go to `/`, fill the "Add a new course" form, submit. Creates the empty skeleton only; you still need reference material + decomposition.
3. **Via the API** — `POST /api/courses` with `{id, name, description}` (id must match `^[a-z0-9][a-z0-9-]*$`). Same as the UI: skeleton only.

A brand-new course (paths 2 or 3) shows an empty-state dashboard prompting the user to add reference material and run `/decompose`.

**Structural validator:** `node scripts/validate-course.js <id>` runs deterministic checks on a course (schema of `topics.json`, validity of question files, tracker sync, etc.). Used by `/verify-course` and called from `/study`'s preflight. Exit 0 on PASS, 1 on FAIL.

## Deleting a course

**Destructive and irreversible** — the repo isn't version-controlled, so deletion permanently removes all lessons, question banks, and quiz history.

- Claude Code: `/delete-course <id>` — prints a deletion summary and requires the user to type the course id verbatim before anything is removed.
- Any other LLM: open [prompts/DELETE_COURSE.md](DELETE_COURSE.md).

There is no API or UI delete today — the prompt is the only path, deliberately, to make the destructive operation explicit.

## Authoring lessons + questions

Once a course is decomposed (has `topics.json`), use **STUDY_SESSION.md** (one topic per session) to author lessons and generate question banks:

- Claude Code: `/study <courseId> <topicId>` (or just `/study` to ask for both)
- Any other LLM: open [prompts/STUDY_SESSION.md](STUDY_SESSION.md) and tell it the course + topic

`/verify` (or [prompts/VERIFY_STUDY_SESSION.md](VERIFY_STUDY_SESSION.md)) runs a checklist against the outputs.

## Per-course conventions

- **Adding a question** — append to `courses/<id>/data/questions/<topic-id>.json`. Shape: `{ qid (UUID), question, options[4], explanations[4], answer (0-based index), topics: ["Chapter N", "<topic-id>"], phase: "pre"|"post" }`. The server resolves the file by topic ID, so the filename must match the topic tag. **`qid` is mandatory and immutable** — minted fresh per question, never reused, never edited (stars and flags reference it).
- **Starring & flagging** — the UI lets the learner star a question for later practice (`⭐ Starred practice` in the sidebar) or flag a bad question with a free-text reason. Stars and flags are stored in `data/starred.json` / `data/flagged.json`, both keyed by `qid`. Run `/revise-questions <courseId>` to have an AI rewrite every open flag using the user's reason as guidance — qids are preserved across rewrites.
- **Recording quiz results** — POST to `/api/courses/:id/progress` (the UI does this); entries are appended, never rewritten.
- **Grading** — every quiz attempt gets a tier:

  | Score | Tier |
  |---|---|
  | ≥ 85 | green (mastered) |
  | 75–84 | blue |
  | 65–74 | yellow |
  | 50–64 | orange |
  | < 50 | red |

  A topic is "mastered" the first time it hits **green** on a post-test. Thresholds are global, hardcoded in `server.js`.

## Notes for future sessions

- This is a Windows environment; bash is available via the Bash tool. Use forward slashes in paths.
- There is no test suite or linter configured. Verify changes by running `npm start` and exercising the UI.
- The repo is not a git repository — don't run `git` commands expecting history.
- The engine (`server.js`, `public/`, `scripts/`) and the shared prompts (`prompts/`) are course-agnostic. Don't bake a specific course id into either.
- Keep edits focused on study content; avoid restructuring directories without an explicit ask.
