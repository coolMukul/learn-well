# Verify Study Session — vendor-neutral assistant prompt

> **What this is:** A mechanical checklist any AI assistant runs after a [STUDY_SESSION.md](STUDY_SESSION.md) execution to confirm the outputs are valid. Also runs automatically as Step 7 of `STUDY_SESSION.md` before that prompt reports success.
>
> **Inputs the assistant needs:**
> - **`<courseId>`** — the course slug (folder under `courses/`). If not given, ask.
> - **`<topicId>`** — e.g. `1.3`. If not given, default to `tracker.currentTopicId` for the course.
>
> **Working directory convention:** Every path in this document is relative to the course root, i.e. `courses/<courseId>/`. Resolve `<courseId>` once and apply it everywhere.
>
> **Mode:** Mostly mechanical (file existence, JSON shape, counts, tracker invariants). A few items are judgment calls — those are flagged as **(judgment)**.

## Inputs

You need **one** topic ID to verify. Get it from:
- The user's prompt, or
- `data/tracker.json` → `currentTopicId`.

Set it as `TOPIC_ID` in your head — every command below references it.

Also extract chapter number: `DOMAIN_NUM = TOPIC_ID.split('.')[0]` (e.g. `1` for `1.1`).

## Execution model

Work through the checklist top-to-bottom. For each item:
- Run the command, judge the output.
- Mark **PASS** / **FAIL** / **WARN** in your final report.
- A FAIL on a hard rule (Section A invariants) blocks reporting success — fix the underlying file and re-run that check.
- Out-of-scope content discovery is a **(judgment)** call; cite the offending line in your finding.

The bash one-liners below assume the working directory is the **course root** (`courses/<courseId>/`). If your assistant tooling runs commands from the repo root instead, prefix paths with `courses/<courseId>/`. JSON inspection uses `node` (works on any platform with Node installed).

---

## A. Tracker invariants (hard fails)

### A1 — `started` is never overwritten
The session may set `started` if it was `null`, but must never change a non-null value.

```bash
node -e "
const j = require('./data/tracker.json');
const t = j.topics['$TOPIC_ID'];
console.log('started:', t.started, '  finished:', t.finished);
"
```

**Pass criteria:** `started` is non-null AND ≤ `finished`. If `started > finished`, the session overwrote it — FAIL.

If you suspect overwrite and the project isn't under version control, ask the user — they may have a backup.

### A2 — Session did NOT write to `preCheckResults`, `quizPasses`, or `mastered`

```bash
node -e "
const j = require('./data/tracker.json');
const t = j.topics['$TOPIC_ID'];
console.log('preCheckResults len:', t.preCheckResults.length);
console.log('quizPasses len:', t.quizPasses.length);
console.log('mastered:', t.mastered);
"
```

**Pass criteria:** these fields reflect only UI activity. If you ran STUDY_SESSION.md and the user has not yet taken any quiz, lengths must equal whatever they were *before* the session. Easiest spot-check: lengths are 0 on a brand-new topic.

### A3 — `lastUpdated` was updated

```bash
node -e "
const j = require('./data/tracker.json');
console.log('lastUpdated:', j.lastUpdated);
"
```

**Pass criteria:** `lastUpdated` is within the last few minutes (current ISO timestamp).

---

## B. Lesson file structure

### B1 — File exists at the expected path

```bash
ls -la "topics/topic-$TOPIC_ID.md"
```

**Pass criteria:** file present. Path must match `topics.json` → `topics[i].lessonFile`.

### B2 — All required sections present

Required headings (case-sensitive, exact text after `## `):
- `Why this matters`
- One `## ` section **per subtopic** in `topics.json` for this topic (subtopic name should match closely)
- `Anti-patterns`
- `Worked example` (heading line may include `— Scenario S?`) — only required if the course defines scenarios
- `Quick recall (full set)`

```bash
grep -nE "^## " "topics/topic-$TOPIC_ID.md"
```

Cross-check the headings against:

```bash
node -e "
const j = require('./data/topics.json');
const topic = j.chapters.flatMap(d => d.topics).find(t => t.id === '$TOPIC_ID');
console.log('subtopics required:'); topic.subtopics.forEach(s => console.log('  - ' + s));
"
```

**Pass criteria:** every subtopic has a corresponding `## ` heading. Headings need not match verbatim, but the keyword(s) of each subtopic should appear in a heading. **(judgment)** on minor wording differences.

### B3 — Per-subtopic depth

```bash
node -e "
const fs = require('fs');
const md = fs.readFileSync('topics/topic-$TOPIC_ID.md', 'utf8');
const sections = md.split(/^## /m).slice(1);
sections.forEach(s => {
  const title = s.split('\n')[0].trim();
  const wordCount = s.split(/\s+/).filter(Boolean).length;
  console.log(wordCount.toString().padStart(5), title);
});
"
```

**Pass criteria:**
- Each subtopic section is **≥ 120 words** (target 150–300). Sections under 80 words are placeholders — FAIL.
- Total file is roughly **1500–2500 words**. Under 800 = thin lesson, FAIL.

### B4 — Quick-recall flashcards present per subtopic
Each `## <subtopic>` section should contain at least one `**Q:**` line. The final `## Quick recall (full set)` should have 5–10.

```bash
grep -cE "\*\*Q:\*\*" "topics/topic-$TOPIC_ID.md"
```

**Pass criteria:** count ≥ (number of subtopics) + 5.

### B5 — Code/example specificity **(judgment)**
Spot-check that worked examples name **specific tools, methods, or signals** from the excerpt — not vague phrases like "use the right approach." Open the file and skim. If every example reads like a paraphrase of "do the thing," FAIL.

---

## C. Question bank

### C0 — Question file is valid JSON (HARD FAIL — must run first)

If `data/questions/$TOPIC_ID.json` exists, it MUST parse as a JSON array. The most common corruption is from "append-text" instead of read-parse-append-write, producing files like `\n,\n  {...}` (missing leading `[`).

```bash
node -e "
const fs = require('fs');
const p = './data/questions/$TOPIC_ID.json';
if (!fs.existsSync(p)) { console.log('no file (OK if first study didn\\'t write yet)'); process.exit(0); }
const text = fs.readFileSync(p, 'utf8');
let j;
try { j = JSON.parse(text); } catch (e) {
  console.error('FAIL: not valid JSON:', e.message);
  console.error('First 80 chars:', JSON.stringify(text.slice(0, 80)));
  process.exit(1);
}
if (!Array.isArray(j)) { console.error('FAIL: top-level is not an array'); process.exit(1); }
console.log('OK: valid JSON array with', j.length, 'entries');
"
```

**Pass criteria:** exit 0. **If this FAILs, every other C check below will also fail** — and STUDY_SESSION.md broke its read-parse-append-write protocol. The fix is to manually repair the file (often just adding a leading `[`) or delete it and re-run `/study` for this topic.

### C1 — Pre-check count (informational)

```bash
node -e "
const j = require('./data/questions/$TOPIC_ID.json');
const pre = j.filter(q => q.phase === 'pre');
console.log('pre count:', pre.length);
"
```

**Reporting only — never a FAIL.** Print the count for the report. Pre-check is locked once generated; that invariant is enforced in `STUDY_SESSION.md`, not here. This prompt does not gate on numeric count.

### C2 — Post-test count (informational)

```bash
node -e "
const j = require('./data/questions/$TOPIC_ID.json');
const post = j.filter(q => q.phase === 'post');
console.log('post total:', post.length);
"
```

**Reporting only — never a FAIL.** Print the count for the report. The 30-per-topic cap is a `STUDY_SESSION.md` generation rule, not a verifier gate. A bank with more than 30 (e.g., from sessions before the cap was introduced) is acceptable and must not fail verification.

### C3 — Question shape

```bash
node -e "
const target = require('./data/questions/$TOPIC_ID.json');
const errs = [];
for (const q of target) {
  if (typeof q.question !== 'string' || !q.question.trim()) errs.push('missing question');
  if (!Array.isArray(q.options) || q.options.length !== 4) errs.push('options must be length 4: ' + q.question.slice(0,60));
  if (!Array.isArray(q.explanations) || q.explanations.length !== 4) errs.push('explanations must be length 4: ' + q.question.slice(0,60));
  if (typeof q.answer !== 'number' || q.answer < 0 || q.answer > 3) errs.push('answer out of range: ' + q.question.slice(0,60));
  if (!Array.isArray(q.topics) || !q.topics.includes('$TOPIC_ID')) errs.push('missing topic tag: ' + q.question.slice(0,60));
  const dom = 'Chapter ' + '$TOPIC_ID'.split('.')[0];
  if (!q.topics.includes(dom)) errs.push('missing chapter tag (' + dom + '): ' + q.question.slice(0,60));
  if (q.phase !== 'pre' && q.phase !== 'post') errs.push('phase missing/invalid: ' + q.question.slice(0,60));
}
console.log('total checked:', target.length, '  errors:', errs.length);
errs.forEach(e => console.log('  ' + e));
"
```

**Pass criteria:** zero errors.

### C4 — Answer-index distribution
For each phase set, the four `answer` indices (0–3) should be roughly even — no more than 5 of the 10 share the same index.

```bash
node -e "
const j = require('./data/questions/$TOPIC_ID.json');
for (const phase of ['pre', 'post']) {
  const set = j.filter(q => q.phase === phase);
  if (!set.length) continue;
  const counts = [0,0,0,0];
  set.forEach(q => counts[q.answer]++);
  console.log(phase + ':', counts.join(','), '(of', set.length, ')');
}
"
```

**Pass criteria:** no single index ≥ 6 in a 10-question set. WARN if 5/10 share an index; FAIL if 6+.

### C5 — No duplicate question text within a (taskId, phase) group

```bash
node -e "
const j = require('./data/questions/$TOPIC_ID.json');
for (const phase of ['pre', 'post']) {
  const set = j.filter(q => q.phase === phase);
  const seen = new Map();
  for (const q of set) {
    const key = q.question.trim().toLowerCase().slice(0, 80);
    if (seen.has(key)) console.log('DUP', phase, ':', q.question.slice(0,100));
    seen.set(key, true);
  }
}
"
```

**Pass criteria:** no `DUP` lines.

### C6 — Explanation quality **(judgment)**
Sample 3 random questions and read their explanations. Each must:
- Be **1–2 sentences**, specific to that option (not generic boilerplate)
- For the correct option, state **why** it's right (the principle, not just "this is correct")
- For distractors, name the **failure mode** the wrong pick would cause (a real bug, a miscalibration, a missed concept)

```bash
node -e "
const set = require('./data/questions/$TOPIC_ID.json');
const pick = () => set[Math.floor(Math.random()*set.length)];
for (let k = 0; k < 3; k++) {
  const q = pick();
  console.log('---');
  console.log('Q:', q.question);
  q.explanations.forEach((e, i) => console.log('  ' + 'ABCD'[i] + (i===q.answer?'*':' ') + ': ' + e));
}
"
```

If any explanation is shorter than the option text it's explaining, that's a red flag.

### C7 — Out-of-scope content **(judgment)**

```bash
node -e "
const j = require('./data/topics.json');
console.log('out of scope:'); (j.outOfScope || []).forEach(s => console.log('  - ' + s));
"
```

Skim the new lesson and the new questions for any of the listed out-of-scope items. If you spot one, FAIL — STUDY_SESSION.md explicitly forbids it.

---

## D. Cross-cutting checks

### D1 — `topics.json` was NOT rewritten
The session is read-only on `topics.json`. If its mtime or content changed, FAIL — fix by reverting.

```bash
node -e "
const fs = require('fs');
const s = fs.statSync('data/topics.json');
console.log('topics.json mtime:', s.mtime.toISOString());
"
```

**Pass criteria:** mtime predates the session start by enough that you're confident it wasn't touched. **(judgment)**

### D2 — `progress.json` was NOT touched
That file is UI-managed (quiz attempt log).

```bash
node -e "
const fs = require('fs');
console.log('progress.json mtime:', fs.statSync('data/progress.json').mtime.toISOString());
"
```

### D3 — Reference hook is intact *(Claude Code only)*
This check is only meaningful when the user is running with Claude Code, where a project hook in `.claude/settings.json` blocks reads of the full reference text. Other assistants don't have hooks — for them, the rule is enforced by this prompt itself (Step 2 of STUDY_SESSION.md). Skip this section if you're not running under Claude Code, or if the project has no `.claude/settings.json`.

```bash
node -e "
const fs = require('fs');
if (!fs.existsSync('../../.claude/settings.json')) { console.log('no .claude/settings.json — skip'); process.exit(0); }
const j = JSON.parse(fs.readFileSync('../../.claude/settings.json', 'utf8'));
const h = j.hooks?.PreToolUse?.[0];
console.log('matcher:', h?.matcher);
console.log('cmd present:', !!h?.hooks?.[0]?.command);
"
```

**Pass criteria:** matcher includes `Read|Grep|Glob|Edit|Write|MultiEdit|NotebookEdit|Bash`; command exists. The hook prevents reads of the full reference text — STUDY_SESSION.md must not have disabled it.

---

## E. Final report format

Return a short summary to the user — table of section results plus any FAIL details:

```
Verification of <courseId> topic <TOPIC_ID> — <result>

Section                              Status   Notes
A. Tracker invariants                PASS
B. Lesson structure                  PASS     1500 words, 7 subtopic sections
C. Question bank                     PASS     10 pre, 10 post; answers 3/2/3/2
D. Cross-cutting (no stray edits)    PASS

Issues / WARN:
  (none)

Ready for the user to: take pre-check → study → take test in the UI.
```

If any **FAIL** items exist, list them with the file/line and the fix to apply, and **do not** mark the session as complete. Loop back to STUDY_SESSION.md, fix, re-verify.
