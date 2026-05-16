#!/usr/bin/env node
// validate-course.js — mechanical structural validation for a course.
//
// Catches the kinds of drift that decomposing/study assistants can introduce:
// wrong field names (`title` instead of `name`), subtopics as objects instead
// of strings, missing `lessonFile`/`excerptFile` paths, broken JSON in question
// files, etc. Fast, deterministic, vendor-agnostic — runnable by any prompt.
//
// Usage:
//   node scripts/validate-course.js <courseId>
//
// Exit codes:
//   0   all PASS (or only WARNs)
//   1   one or more FAIL
//   2   bad arguments / course not found

'use strict';

const fs = require('fs');
const path = require('path');

const COURSE_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const TOPIC_ID_RE = /^\d+\.\d+$/;
const QUESTION_FILE_RE = /^\d+\.\d+\.json$/;
const PHASES = new Set(['pre', 'post']);
// Loose UUID check — accepts any v1–v5 plus the nil UUID. We don't need to lock
// to v4 since the only requirement is uniqueness + a long random-enough id.
const QID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const findings = []; // { level: 'PASS'|'WARN'|'FAIL', section, message, where? }

function record(level, section, message, where) {
  findings.push({ level, section, message, where });
}
const pass = (s, m, w) => record('PASS', s, m, w);
const warn = (s, m, w) => record('WARN', s, m, w);
const fail = (s, m, w) => record('FAIL', s, m, w);

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// ----- A. course.json -----
function checkCourseJson(courseRoot) {
  const f = path.join(courseRoot, 'course.json');
  if (!fs.existsSync(f)) {
    fail('A.course.json', 'missing', f);
    return null;
  }
  let meta;
  try {
    meta = readJson(f);
  } catch (e) {
    fail('A.course.json', `invalid JSON: ${e.message}`, f);
    return null;
  }
  if (typeof meta.id !== 'string' || !meta.id) fail('A.course.json', 'missing or empty `id`', f);
  if (typeof meta.name !== 'string' || !meta.name) fail('A.course.json', 'missing or empty `name`', f);
  pass('A.course.json', `id="${meta.id}", name="${meta.name}"`, f);
  return meta;
}

// ----- B. topics.json (the hot one) -----
function checkTopicsJson(courseRoot) {
  const f = path.join(courseRoot, 'data', 'topics.json');
  if (!fs.existsSync(f)) {
    fail('B.topics.json', 'missing', f);
    return null;
  }
  let topics;
  try {
    topics = readJson(f);
  } catch (e) {
    fail('B.topics.json', `invalid JSON: ${e.message}`, f);
    return null;
  }
  if (!topics || typeof topics !== 'object') {
    fail('B.topics.json', 'top-level must be an object', f);
    return null;
  }
  if (!Array.isArray(topics.chapters)) {
    fail('B.topics.json', 'missing `chapters` array', f);
    return null;
  }
  if (topics.chapters.length === 0) {
    warn('B.topics.json', '`chapters` is empty (course not yet decomposed)', f);
    return topics;
  }

  const seenTopicIds = new Set();
  for (let ci = 0; ci < topics.chapters.length; ci++) {
    const c = topics.chapters[ci];
    const where = `${f} chapters[${ci}]`;
    if (!c || typeof c !== 'object') {
      fail('B.chapter', 'not an object', where);
      continue;
    }
    if (typeof c.id !== 'string' || !c.id) fail('B.chapter', 'missing string `id`', where);
    // The big one: name vs title
    if (typeof c.name !== 'string' || !c.name) {
      if (typeof c.title === 'string') {
        fail('B.chapter', 'has `title` but expected `name` (UI reads chapter.name)', where);
      } else {
        fail('B.chapter', 'missing string `name`', where);
      }
    }
    if (c.weight !== undefined && typeof c.weight !== 'number') {
      warn('B.chapter', '`weight` should be a number if present', where);
    }
    if (!Array.isArray(c.topics)) {
      fail('B.chapter', 'missing `topics` array', where);
      continue;
    }
    if (c.topics.length === 0) warn('B.chapter', '`topics` is empty', where);

    for (let ti = 0; ti < c.topics.length; ti++) {
      const t = c.topics[ti];
      const twhere = `${f} chapters[${ci}].topics[${ti}]`;
      if (!t || typeof t !== 'object') { fail('B.topic', 'not an object', twhere); continue; }
      if (typeof t.id !== 'string' || !TOPIC_ID_RE.test(t.id)) {
        fail('B.topic', `\`id\` must match ${TOPIC_ID_RE} (got ${JSON.stringify(t.id)})`, twhere);
      } else if (seenTopicIds.has(t.id)) {
        fail('B.topic', `duplicate id: ${t.id}`, twhere);
      } else {
        seenTopicIds.add(t.id);
      }
      if (typeof t.title !== 'string' || !t.title) fail('B.topic', 'missing string `title`', twhere);

      // Subtopics: array of strings (not objects)
      if (!Array.isArray(t.subtopics)) {
        fail('B.topic', 'missing `subtopics` array', twhere);
      } else if (t.subtopics.length === 0) {
        warn('B.topic', '`subtopics` is empty', twhere);
      } else {
        const nonString = t.subtopics.findIndex(s => typeof s !== 'string');
        if (nonString !== -1) {
          fail('B.topic', `subtopics must be an array of STRINGS, not objects. Element [${nonString}] is ${typeof t.subtopics[nonString]}`, twhere);
        }
      }

      // Required path fields
      if (typeof t.excerptFile !== 'string' || !t.excerptFile) {
        fail('B.topic', 'missing string `excerptFile`', twhere);
      }
      if (typeof t.lessonFile !== 'string' || !t.lessonFile) {
        fail('B.topic', 'missing string `lessonFile`', twhere);
      }
    }
  }

  if (findings.filter(x => x.section.startsWith('B.') && x.level === 'FAIL').length === 0) {
    const total = topics.chapters.reduce((n, c) => n + (c.topics?.length || 0), 0);
    pass('B.topics.json', `${topics.chapters.length} chapters, ${total} topics, all schema fields valid`, f);
  }
  return topics;
}

// ----- C. excerpts referenced by topics exist -----
function checkExcerptsExist(courseRoot, topics) {
  if (!topics || !Array.isArray(topics.chapters)) return;
  let missing = 0, present = 0;
  for (const c of topics.chapters) {
    for (const t of (c.topics || [])) {
      if (typeof t.excerptFile !== 'string') continue;
      const p = path.join(courseRoot, t.excerptFile);
      if (fs.existsSync(p)) {
        present++;
      } else {
        missing++;
        warn('C.excerpts', `excerptFile missing: ${t.excerptFile} (topic ${t.id})`, p);
      }
    }
  }
  if (missing === 0 && present > 0) pass('C.excerpts', `all ${present} per-topic excerpts present`);
  else if (missing > 0) warn('C.excerpts', `${missing} of ${missing + present} excerpts missing — run /decompose to (re)generate`);
}

// ----- D. question files -----
function checkQuestionFiles(courseRoot, topics) {
  const dir = path.join(courseRoot, 'data', 'questions');
  if (!fs.existsSync(dir)) {
    fail('D.questions', 'data/questions/ directory missing', dir);
    return;
  }
  const expectedIds = new Set();
  if (topics && Array.isArray(topics.chapters)) {
    for (const c of topics.chapters) for (const t of (c.topics || [])) {
      if (TOPIC_ID_RE.test(t.id)) expectedIds.add(t.id);
    }
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  let okFiles = 0;
  const seenQids = new Map(); // qid -> "<file>[<i>]"
  for (const fname of files) {
    if (!QUESTION_FILE_RE.test(fname) && fname !== '_unassigned.json') {
      warn('D.questions', `unexpected filename (won't be served): ${fname}`, path.join(dir, fname));
      continue;
    }
    const fp = path.join(dir, fname);
    let arr;
    try {
      arr = readJson(fp);
    } catch (e) {
      fail('D.questions', `invalid JSON: ${e.message}`, fp);
      continue;
    }
    if (!Array.isArray(arr)) {
      fail('D.questions', 'top-level must be an ARRAY of question objects', fp);
      continue;
    }

    const topicId = fname.replace(/\.json$/, '');
    const expectedChapterTag = TOPIC_ID_RE.test(topicId) ? `Chapter ${topicId.split('.')[0]}` : null;
    let issues = 0;
    for (let i = 0; i < arr.length; i++) {
      const q = arr[i];
      const where = `${fp} [${i}]`;
      if (!q || typeof q !== 'object') { fail('D.question', 'not an object', where); issues++; continue; }
      if (typeof q.qid !== 'string' || !QID_RE.test(q.qid)) {
        fail('D.question', '`qid` missing or not a UUID — run `node scripts/migrate-add-qids.js <courseId>`', where); issues++;
      } else if (seenQids.has(q.qid)) {
        fail('D.question', `duplicate \`qid\` (also in ${seenQids.get(q.qid)})`, where); issues++;
      } else {
        seenQids.set(q.qid, `${fname}[${i}]`);
      }
      if (typeof q.question !== 'string' || !q.question.trim()) { fail('D.question', 'missing string `question`', where); issues++; }
      if (!Array.isArray(q.options) || q.options.length !== 4) { fail('D.question', '`options` must be array of length 4', where); issues++; }
      if (!Array.isArray(q.explanations) || q.explanations.length !== 4) { fail('D.question', '`explanations` must be array of length 4', where); issues++; }
      if (typeof q.answer !== 'number' || q.answer < 0 || q.answer > 3 || !Number.isInteger(q.answer)) {
        fail('D.question', '`answer` must be integer 0–3', where); issues++;
      }
      if (!PHASES.has(q.phase)) { fail('D.question', '`phase` must be "pre" or "post"', where); issues++; }
      if (!Array.isArray(q.topics)) {
        fail('D.question', '`topics` must be an array', where); issues++;
      } else {
        if (TOPIC_ID_RE.test(topicId) && !q.topics.includes(topicId)) {
          fail('D.question', `\`topics\` must include topic id "${topicId}"`, where); issues++;
        }
        if (expectedChapterTag && !q.topics.includes(expectedChapterTag)) {
          fail('D.question', `\`topics\` must include chapter tag "${expectedChapterTag}"`, where); issues++;
        }
      }
    }
    if (issues === 0) {
      pass('D.questions', `${fname}: ${arr.length} questions, all valid`);
      okFiles++;
    }
  }

  // Topics with no question file (informational)
  if (expectedIds.size > 0) {
    const haveFile = new Set(files.filter(f => QUESTION_FILE_RE.test(f)).map(f => f.replace(/\.json$/, '')));
    const missing = [...expectedIds].filter(id => !haveFile.has(id));
    if (missing.length > 0) {
      warn('D.questions', `${missing.length} topics have no question file yet (will be created by /study): ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''}`);
    }
  }
}

// ----- E. tracker -----
function checkTracker(courseRoot, topics) {
  const f = path.join(courseRoot, 'data', 'tracker.json');
  if (!fs.existsSync(f)) {
    fail('E.tracker', 'missing', f);
    return;
  }
  let tracker;
  try {
    tracker = readJson(f);
  } catch (e) {
    fail('E.tracker', `invalid JSON: ${e.message}`, f);
    return;
  }
  if (!tracker.topics || typeof tracker.topics !== 'object') {
    fail('E.tracker', 'missing `topics` object', f);
    return;
  }
  if (topics && Array.isArray(topics.chapters)) {
    const expected = [];
    for (const c of topics.chapters) for (const t of (c.topics || [])) expected.push(t.id);
    const missing = expected.filter(id => !tracker.topics[id]);
    if (missing.length > 0) {
      fail('E.tracker', `tracker missing ${missing.length} topics from topics.json: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''}. Run: node scripts/sync-tracker.js <id>`, f);
    } else {
      pass('E.tracker', `${expected.length} tracker entries, all topics present`, f);
    }
  } else {
    pass('E.tracker', `${Object.keys(tracker.topics).length} entries`, f);
  }
}

// ----- F. progress.json -----
function checkProgress(courseRoot) {
  const f = path.join(courseRoot, 'data', 'progress.json');
  if (!fs.existsSync(f)) { fail('F.progress.json', 'missing', f); return; }
  try {
    const p = readJson(f);
    if (!Array.isArray(p)) fail('F.progress.json', 'top-level must be an array', f);
    else pass('F.progress.json', `${p.length} log entries`, f);
  } catch (e) {
    fail('F.progress.json', `invalid JSON: ${e.message}`, f);
  }
}

// ----- main -----
function main(argv) {
  const courseId = argv[0];
  if (!courseId) {
    console.error('Usage: node scripts/validate-course.js <courseId>');
    process.exit(2);
  }
  if (!COURSE_ID_RE.test(courseId)) {
    console.error(`invalid courseId: ${courseId} (must match ${COURSE_ID_RE})`);
    process.exit(2);
  }
  const repoRoot = path.resolve(__dirname, '..');
  const courseRoot = path.join(repoRoot, 'courses', courseId);
  if (!fs.existsSync(courseRoot)) {
    console.error(`course not found: ${courseRoot}`);
    process.exit(2);
  }

  checkCourseJson(courseRoot);
  const topics = checkTopicsJson(courseRoot);
  checkExcerptsExist(courseRoot, topics);
  checkQuestionFiles(courseRoot, topics);
  checkTracker(courseRoot, topics);
  checkProgress(courseRoot);

  // Report
  const counts = { PASS: 0, WARN: 0, FAIL: 0 };
  for (const f of findings) counts[f.level]++;
  console.log(`\nvalidate-course: ${courseId}`);
  console.log(`  PASS: ${counts.PASS}   WARN: ${counts.WARN}   FAIL: ${counts.FAIL}\n`);

  for (const lvl of ['FAIL', 'WARN', 'PASS']) {
    const items = findings.filter(f => f.level === lvl);
    if (items.length === 0) continue;
    console.log(`  ${lvl}:`);
    for (const it of items) {
      console.log(`    [${it.section}] ${it.message}`);
      if (it.where) console.log(`        ${it.where}`);
    }
    console.log('');
  }

  process.exit(counts.FAIL > 0 ? 1 : 0);
}

main(process.argv.slice(2));
