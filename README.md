# Learn Well

A small Express-based study workspace that holds **one or more courses**, each with its own per-topic lessons, question bank, progress tracker, and reference materials. Originally built for the *Claude Certified Architect — Foundations* exam (now the `ccaf-exam` course); the engine is course-agnostic and can host any exam-style or course-style curriculum.

The full project context — repo layout, URL/API scheme, course-creation flow, conventions — lives in [prompts/Project-Context.md](prompts/Project-Context.md). That same file is what you hand to ChatGPT, Gemini, Claude, or any other assistant when working in this repo.

## What it does

Study one topic at a time through a three-step flow:

1. **Pre-check** — short diagnostic before you read anything.
2. **Lesson** — the topic's markdown lesson.
3. **Post-test** — graded attempt that updates your tracker.

Every attempt is scored and tiered (red → orange → yellow → blue → green); a topic is "mastered" the first time a post-test hits green (≥ 85).

Learners can ⭐ **star** good questions for re-practice and 🚩 **flag** bad ones with a free-text reason, then have an assistant rewrite the flagged ones via `/revise-questions`.

## Running it

```bash
npm install
npm start            # auto-picks an open port in 3090–3099
PORT=3091 npm start  # or pin a port
```

Open the printed URL. The home page (`/`) lists every course; pick one to land on its dashboard at `/course/<id>`. Deep links survive a refresh — the server has an SPA fallback.

Requires Node.js. No test suite or linter is configured; verify changes by running the server and exercising the UI.

## Working with courses

Three ways to add a course, in order of completeness:

1. **AI-assisted (recommended)** — let an assistant scaffold a course folder *and* ingest your reference material:
   - Claude Code: `/new-course` → `/decompose <id>` → `/verify-course <id>` → `/study <id>`
   - Any other LLM: walk through [prompts/COURSE_SETUP.md](prompts/COURSE_SETUP.md) → [prompts/DECOMPOSE_COURSE.md](prompts/DECOMPOSE_COURSE.md) → [prompts/VERIFY_COURSE.md](prompts/VERIFY_COURSE.md) → [prompts/STUDY_SESSION.md](prompts/STUDY_SESSION.md)
2. **Via the UI** — submit the "Add a new course" form at `/`. Creates an empty skeleton only; you still need to add reference material and run `/decompose`.
3. **Via the API** — `POST /api/courses` with `{id, name, description}` (`id` must match `^[a-z0-9][a-z0-9-]*$`). Same skeleton-only result.

Deleting a course is **destructive and irreversible** — use `/delete-course <id>` (Claude Code) or follow [prompts/DELETE_COURSE.md](prompts/DELETE_COURSE.md). There's deliberately no UI or API delete.

## Repository layout (top-level)

| Path | Purpose |
|---|---|
| [server.js](server.js), [public/](public/) | Course-agnostic engine + SPA |
| [prompts/](prompts/) | Vendor-neutral assistant prompts (any LLM) |
| [.claude/](.claude/) | Claude Code slash commands, hooks, permissions |
| [scripts/](scripts/) | Engine-level CLI utilities (`sync-tracker`, `migrate-add-qids`, `validate-course`) |
| [courses/](courses/) | One folder per course; today only `ccaf-exam` |

Per-course layout, JSON schemas, and conventions are documented in [prompts/Project-Context.md](prompts/Project-Context.md).

## License

[MIT](LICENSE)
