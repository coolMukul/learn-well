const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const ROOT = __dirname;
const COURSES_DIR = path.join(ROOT, 'courses');
const ENV_FILE = path.join(ROOT, '.env');
const TOPIC_ID_RE = /^\d+\.\d+$/;
const COURSE_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

// ----- minimal .env reader (no extra dependency) -----
// Only reads on startup. No app-specific vars are recognized today (kept as a
// hook for future course-overrideable settings).
function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) return;
  const text = fs.readFileSync(ENV_FILE, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (process.env[k] === undefined) process.env[k] = v;
  }
}
loadEnv();

// Grade tiers — global thresholds. Topic is "mastered" when a post-test scores
// at or above MASTERY_THRESHOLD (the green tier).
const GRADE_TIERS = [
  { min: 85, name: 'green' },
  { min: 75, name: 'blue' },
  { min: 65, name: 'yellow' },
  { min: 50, name: 'orange' },
  { min: 0,  name: 'red' },
];
const MASTERY_THRESHOLD = 85;

function gradeFor(percent) {
  for (const t of GRADE_TIERS) if (percent >= t.min) return t.name;
  return 'red';
}

// ----- helpers -----

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return null;
  }
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function isPathInside(child, parent) {
  const resolvedChild = path.resolve(child);
  const resolvedParent = path.resolve(parent);
  return resolvedChild === resolvedParent || resolvedChild.startsWith(resolvedParent + path.sep);
}

// ----- course resolution -----

function resolveCourse(courseId) {
  if (typeof courseId !== 'string' || !COURSE_ID_RE.test(courseId)) return null;
  const root = path.join(COURSES_DIR, courseId);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return null;
  return {
    id: courseId,
    root,
    courseJsonFile: path.join(root, 'course.json'),
    dataDir: path.join(root, 'data'),
    topicsDir: path.join(root, 'topics'),
    questionsDir: path.join(root, 'data', 'questions'),
    progressFile: path.join(root, 'data', 'progress.json'),
    topicsFile: path.join(root, 'data', 'topics.json'),
    trackerFile: path.join(root, 'data', 'tracker.json'),
    starredFile: path.join(root, 'data', 'starred.json'),
    flaggedFile: path.join(root, 'data', 'flagged.json'),
    todosFile: path.join(root, 'data', 'todos.json'),
  };
}

function withCourse(req, res, next) {
  const c = resolveCourse(req.params.courseId);
  if (!c) return res.status(404).json({ error: 'unknown course' });
  req.course = c;
  next();
}


// ----- courses index -----

app.get('/api/courses', (req, res) => {
  if (!fs.existsSync(COURSES_DIR)) return res.json([]);
  const out = [];
  for (const name of fs.readdirSync(COURSES_DIR)) {
    const full = path.join(COURSES_DIR, name);
    if (!fs.statSync(full).isDirectory()) continue;
    const meta = readJson(path.join(full, 'course.json'));
    if (!meta) continue;
    out.push({
      id: meta.id || name,
      name: meta.name || name,
      description: meta.description || '',
      createdAt: meta.createdAt || null,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  res.json(out);
});

app.post('/api/courses', (req, res) => {
  const { id, name, description } = req.body || {};
  if (typeof id !== 'string' || !COURSE_ID_RE.test(id)) {
    return res.status(400).json({ error: 'invalid id (lowercase alphanumeric and hyphens, must start with letter or digit)' });
  }
  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name required' });
  }
  const root = path.join(COURSES_DIR, id);
  if (fs.existsSync(root)) return res.status(409).json({ error: 'course already exists' });

  fs.mkdirSync(path.join(root, 'data', 'questions'), { recursive: true });
  fs.mkdirSync(path.join(root, 'topics'), { recursive: true });
  fs.mkdirSync(path.join(root, 'notes'), { recursive: true });
  fs.mkdirSync(path.join(root, 'practice'), { recursive: true });
  fs.mkdirSync(path.join(root, 'schedule'), { recursive: true });
  fs.mkdirSync(path.join(root, 'reference'), { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const meta = {
    id,
    name: name.trim(),
    description: typeof description === 'string' ? description.trim() : '',
    createdAt: today,
  };
  writeJson(path.join(root, 'course.json'), meta);
  writeJson(path.join(root, 'data', 'topics.json'), { chapters: [] });
  writeJson(path.join(root, 'data', 'tracker.json'), { topics: {}, lastUpdated: null });
  writeJson(path.join(root, 'data', 'progress.json'), []);
  writeJson(path.join(root, 'data', 'starred.json'), []);
  writeJson(path.join(root, 'data', 'flagged.json'), []);
  writeJson(path.join(root, 'data', 'todos.json'), []);

  res.status(201).json({ id: meta.id, name: meta.name, description: meta.description, createdAt: meta.createdAt });
});

// ----- course-scoped: config -----

app.get('/api/courses/:courseId/config', withCourse, (req, res) => {
  const meta = readJson(req.course.courseJsonFile) || {};
  res.json({
    grades: GRADE_TIERS,
    masteryThreshold: MASTERY_THRESHOLD,
    course: {
      id: meta.id || req.course.id,
      name: meta.name || req.course.id,
      description: meta.description || '',
      createdAt: meta.createdAt || null,
    },
  });
});

// ----- course-scoped: questions -----

function readQuestions(course, topicId) {
  if (topicId) {
    if (!TOPIC_ID_RE.test(topicId)) return [];
    const file = path.join(course.questionsDir, `${topicId}.json`);
    if (!fs.existsSync(file)) return [];
    return readJson(file) || [];
  }
  if (!fs.existsSync(course.questionsDir)) return [];
  const out = [];
  for (const name of fs.readdirSync(course.questionsDir)) {
    if (!name.endsWith('.json')) continue;
    const list = readJson(path.join(course.questionsDir, name));
    if (Array.isArray(list)) out.push(...list);
  }
  return out;
}

app.get('/api/courses/:courseId/questions', withCourse, (req, res) => {
  const { phase, topicId, starred, flagged } = req.query;
  let out = readQuestions(req.course, typeof topicId === 'string' ? topicId : null);
  if (phase === 'pre' || phase === 'post') {
    out = out.filter(q => q.phase === phase);
  }
  if (starred === '1' || starred === 'true') {
    const s = readJson(req.course.starredFile) || [];
    const set = new Set(s.map(e => e.qid));
    out = out.filter(q => q.qid && set.has(q.qid));
  }
  if (flagged === '1' || flagged === 'true') {
    const f = readJson(req.course.flaggedFile) || [];
    const set = new Set(f.filter(e => e.status !== 'revised').map(e => e.qid));
    out = out.filter(q => q.qid && set.has(q.qid));
  }
  res.json(out);
});

// ----- course-scoped: starred questions -----
// starred.json shape: [{ qid, topicId, createdAt }]

app.get('/api/courses/:courseId/starred', withCourse, (req, res) => {
  res.json(readJson(req.course.starredFile) || []);
});

app.post('/api/courses/:courseId/starred', withCourse, (req, res) => {
  const { qid, topicId } = req.body || {};
  if (typeof qid !== 'string' || !qid) return res.status(400).json({ error: 'qid required' });
  if (typeof topicId !== 'string' || !topicId) return res.status(400).json({ error: 'topicId required' });
  const list = readJson(req.course.starredFile) || [];
  if (list.some(e => e.qid === qid)) return res.json({ ok: true, alreadyStarred: true });
  list.push({ qid, topicId, createdAt: new Date().toISOString() });
  try { writeJson(req.course.starredFile, list); }
  catch (e) { return res.status(500).json({ error: 'failed to write starred.json' }); }
  res.json({ ok: true });
});

app.delete('/api/courses/:courseId/starred/:qid', withCourse, (req, res) => {
  const qid = req.params.qid;
  const list = readJson(req.course.starredFile) || [];
  const next = list.filter(e => e.qid !== qid);
  if (next.length === list.length) return res.json({ ok: true, alreadyAbsent: true });
  try { writeJson(req.course.starredFile, next); }
  catch (e) { return res.status(500).json({ error: 'failed to write starred.json' }); }
  res.json({ ok: true });
});

// ----- course-scoped: flagged questions -----
// flagged.json shape: [{ qid, topicId, reason, status: 'open'|'revised', createdAt, revisedAt? }]

app.get('/api/courses/:courseId/flagged', withCourse, (req, res) => {
  res.json(readJson(req.course.flaggedFile) || []);
});

app.post('/api/courses/:courseId/flagged', withCourse, (req, res) => {
  const { qid, topicId, reason } = req.body || {};
  if (typeof qid !== 'string' || !qid) return res.status(400).json({ error: 'qid required' });
  if (typeof topicId !== 'string' || !topicId) return res.status(400).json({ error: 'topicId required' });
  if (typeof reason !== 'string' || !reason.trim()) return res.status(400).json({ error: 'reason required' });
  const list = readJson(req.course.flaggedFile) || [];
  // Update existing open flag instead of creating duplicates.
  const existing = list.find(e => e.qid === qid && e.status !== 'revised');
  const now = new Date().toISOString();
  if (existing) {
    existing.reason = reason.trim();
    existing.topicId = topicId;
    existing.updatedAt = now;
  } else {
    list.push({ qid, topicId, reason: reason.trim(), status: 'open', createdAt: now });
  }
  try { writeJson(req.course.flaggedFile, list); }
  catch (e) { return res.status(500).json({ error: 'failed to write flagged.json' }); }
  res.json({ ok: true });
});

app.patch('/api/courses/:courseId/flagged/:qid', withCourse, (req, res) => {
  const qid = req.params.qid;
  const { status, reason } = req.body || {};
  const list = readJson(req.course.flaggedFile) || [];
  const entry = list.find(e => e.qid === qid && e.status !== 'revised');
  if (!entry) return res.status(404).json({ error: 'no open flag for that qid' });
  if (typeof status === 'string') {
    if (status !== 'open' && status !== 'revised') return res.status(400).json({ error: 'status must be open|revised' });
    entry.status = status;
    if (status === 'revised') entry.revisedAt = new Date().toISOString();
  }
  if (typeof reason === 'string' && reason.trim()) {
    entry.reason = reason.trim();
    entry.updatedAt = new Date().toISOString();
  }
  try { writeJson(req.course.flaggedFile, list); }
  catch (e) { return res.status(500).json({ error: 'failed to write flagged.json' }); }
  res.json({ ok: true, entry });
});

app.delete('/api/courses/:courseId/flagged/:qid', withCourse, (req, res) => {
  const qid = req.params.qid;
  const list = readJson(req.course.flaggedFile) || [];
  const next = list.filter(e => e.qid !== qid);
  if (next.length === list.length) return res.json({ ok: true, alreadyAbsent: true });
  try { writeJson(req.course.flaggedFile, next); }
  catch (e) { return res.status(500).json({ error: 'failed to write flagged.json' }); }
  res.json({ ok: true });
});

// ----- course-scoped: todos -----
// todos.json shape: [{ id, text, done, topicId?, createdAt, completedAt? }]
// Lightweight floating reminders the learner jots down while studying.

app.get('/api/courses/:courseId/todos', withCourse, (req, res) => {
  res.json(readJson(req.course.todosFile) || []);
});

app.post('/api/courses/:courseId/todos', withCourse, (req, res) => {
  const { text, topicId } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: 'text required' });
  const list = readJson(req.course.todosFile) || [];
  const entry = {
    id: crypto.randomUUID(),
    text: text.trim(),
    done: false,
    topicId: typeof topicId === 'string' && topicId ? topicId : null,
    createdAt: new Date().toISOString(),
  };
  list.push(entry);
  try { writeJson(req.course.todosFile, list); }
  catch (e) { return res.status(500).json({ error: 'failed to write todos.json' }); }
  res.json({ ok: true, entry });
});

app.patch('/api/courses/:courseId/todos/:id', withCourse, (req, res) => {
  const id = req.params.id;
  const { text, done } = req.body || {};
  const list = readJson(req.course.todosFile) || [];
  const entry = list.find(e => e.id === id);
  if (!entry) return res.status(404).json({ error: 'unknown todo id' });
  if (typeof text === 'string' && text.trim()) entry.text = text.trim();
  if (typeof done === 'boolean') {
    entry.done = done;
    entry.completedAt = done ? new Date().toISOString() : null;
  }
  try { writeJson(req.course.todosFile, list); }
  catch (e) { return res.status(500).json({ error: 'failed to write todos.json' }); }
  res.json({ ok: true, entry });
});

app.delete('/api/courses/:courseId/todos/:id', withCourse, (req, res) => {
  const id = req.params.id;
  const list = readJson(req.course.todosFile) || [];
  const next = list.filter(e => e.id !== id);
  if (next.length === list.length) return res.json({ ok: true, alreadyAbsent: true });
  try { writeJson(req.course.todosFile, next); }
  catch (e) { return res.status(500).json({ error: 'failed to write todos.json' }); }
  res.json({ ok: true });
});

// Chapter-wise test: pull the last 10 post-phase questions from each topic in
// the chapter into a per-topic pool, then pick 3 at random from each pool.
// Returns a flat shuffled array so topics interleave during the test.
app.get('/api/courses/:courseId/chapter-test/:chapterId', withCourse, (req, res) => {
  const topicsData = readJson(req.course.topicsFile);
  if (!topicsData) return res.status(500).json({ error: 'topics.json missing or invalid' });
  const chapter = (topicsData.chapters || []).find(c => c.id === req.params.chapterId);
  if (!chapter) return res.status(404).json({ error: 'unknown chapter' });

  const POOL_PER_TOPIC = 10;
  const PICK_PER_TOPIC = 3;
  const out = [];
  const perTopic = [];
  for (const topic of chapter.topics) {
    const post = readQuestions(req.course, topic.id).filter(q => q.phase === 'post');
    const pool = post.slice(-POOL_PER_TOPIC);
    const picked = pool.slice().sort(() => Math.random() - 0.5).slice(0, PICK_PER_TOPIC);
    perTopic.push({ topicId: topic.id, available: post.length, poolSize: pool.length, picked: picked.length });
    out.push(...picked);
  }
  // interleave across topics
  out.sort(() => Math.random() - 0.5);
  res.json({
    chapterId: chapter.id,
    chapterName: chapter.name,
    questions: out,
    perTopic,
  });
});

// ----- course-scoped: progress -----

app.get('/api/courses/:courseId/progress', withCourse, (req, res) => {
  const p = readJson(req.course.progressFile) || [];
  res.json(p);
});

app.post('/api/courses/:courseId/progress', withCourse, (req, res) => {
  const record = req.body;
  if (!record || typeof record !== 'object') return res.status(400).json({ error: 'invalid payload' });
  const p = readJson(req.course.progressFile) || [];
  p.push(record);
  try {
    writeJson(req.course.progressFile, p);
  } catch (e) {
    return res.status(500).json({ error: 'failed to write progress' });
  }
  res.json({ ok: true });
});

// ----- course-scoped: topics & tracker -----

app.get('/api/courses/:courseId/topics', withCourse, (req, res) => {
  const t = readJson(req.course.topicsFile);
  if (!t) return res.status(500).json({ error: 'topics.json missing or invalid' });
  res.json(t);
});

app.get('/api/courses/:courseId/tracker', withCourse, (req, res) => {
  const t = readJson(req.course.trackerFile);
  if (!t) return res.status(500).json({ error: 'tracker.json missing or invalid' });
  res.json(t);
});

app.patch('/api/courses/:courseId/tracker', withCourse, (req, res) => {
  const { topicId, action, payload } = req.body || {};
  if (!topicId || !action) return res.status(400).json({ error: 'topicId and action required' });

  const tracker = readJson(req.course.trackerFile);
  if (!tracker) return res.status(500).json({ error: 'tracker.json missing or invalid' });
  if (!tracker.topics[topicId]) return res.status(404).json({ error: `unknown topicId: ${topicId}` });

  const now = new Date().toISOString();
  const topic = tracker.topics[topicId];
  if (!Array.isArray(topic.preCheckResults)) topic.preCheckResults = [];

  if (action === 'study-start' || action === 'study-finish') {
    if (topic.started === null) topic.started = now;
    topic.finished = now;
    topic.studyCompleted = true;
  } else if (action === 'pre-check-result') {
    const { score, total } = payload || {};
    if (typeof score !== 'number' || typeof total !== 'number' || total <= 0) {
      return res.status(400).json({ error: 'pre-check-result requires payload.score and payload.total numbers' });
    }
    if (topic.started === null) topic.started = now;
    const percent = Math.round((score / total) * 100);
    topic.preCheckResults.push({ timestamp: now, score, total, percent });
  } else if (action === 'quiz-result') {
    const { score, total } = payload || {};
    if (typeof score !== 'number' || typeof total !== 'number' || total <= 0) {
      return res.status(400).json({ error: 'quiz-result requires payload.score and payload.total numbers' });
    }
    const percent = Math.round((score / total) * 100);
    const grade = gradeFor(percent);
    topic.quizPasses.push({ timestamp: now, score, total, percent, grade });
    if (percent >= MASTERY_THRESHOLD) {
      if (!topic.mastered) topic.mastered = now;
    } else {
      topic.mastered = null;
    }
  } else {
    return res.status(400).json({ error: `unknown action: ${action}` });
  }

  tracker.lastUpdated = now;

  try {
    writeJson(req.course.trackerFile, tracker);
  } catch (e) {
    return res.status(500).json({ error: 'failed to write tracker' });
  }
  res.json({ ok: true, topic });
});

// ----- course-scoped: lesson / notes markdown -----
// Read a markdown file under <course>/topics/. `path` query is relative to the course root.
// Example: /api/courses/ccaf-exam/notes?path=topics/task-1.1.md
app.get('/api/courses/:courseId/notes', withCourse, (req, res) => {
  const rel = req.query.path;
  if (!rel || typeof rel !== 'string') return res.status(400).json({ error: 'path query required' });
  const abs = path.resolve(req.course.root, rel);
  if (!isPathInside(abs, req.course.topicsDir)) return res.status(403).json({ error: 'access outside topics/ forbidden' });
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'file not found' });
  try {
    const content = fs.readFileSync(abs, 'utf8');
    res.type('text/markdown').send(content);
  } catch (e) {
    res.status(500).json({ error: 'failed to read notes' });
  }
});

// ----- SPA fallback -----
// Any non-/api GET that didn't match a static file falls through to index.html
// so deep links like /course/ccaf-exam survive a refresh.
app.get(/^\/(?!api(\/|$)).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ----- port selection -----

const net = require('net');

function testPort(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port);
  });
}

async function choosePort() {
  if (process.env.PORT) return parseInt(process.env.PORT, 10);
  const start = 3090, end = 3099;
  for (let p = start; p <= end; p++) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await testPort(p);
    if (ok) return p;
  }
  return 3090;
}

(async () => {
  const PORT = await choosePort();
  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`Mastery threshold: ${MASTERY_THRESHOLD}% (green tier)`);
    if (!process.env.PORT) console.log(`Auto-selected port ${PORT} from range 3090-3099`);
  });
})();
