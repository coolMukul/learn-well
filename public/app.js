// ===== state =====
const state = {
  topics: null,        // <course>/data/topics.json
  tracker: null,       // <course>/data/tracker.json
  config: { masteryThreshold: 85, grades: [] },
  courseId: null,
  courseMeta: null,    // { id, name, description, createdAt }
  screen: 'courses',   // 'courses' | 'course'
  currentTopicId: null,
  view: 'dashboard',   // inner mode within course screen
  quiz: null,
  starred: new Set(),  // Set<qid>
  flagged: new Map(),  // qid -> { reason, status, createdAt, ... }
};

// ===== api =====
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (!res.ok) {
    let msg = `${method} ${path} → ${res.status}`;
    try {
      const err = await res.json();
      if (err && err.error) msg = err.error;
    } catch {}
    throw new Error(msg);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

const courseUrl = (suffix) => '/api/courses/' + state.courseId + suffix;

const loadCoursesList = () => api('GET', '/api/courses');
const createCourseApi = (body) => api('POST', '/api/courses', body);

const loadTopics    = () => api('GET', courseUrl('/topics'));
const loadTracker   = () => api('GET', courseUrl('/tracker'));
const loadConfig    = () => api('GET', courseUrl('/config'));
const loadProgress  = () => api('GET', courseUrl('/progress'));
const loadQuestions = (params) => {
  const qs = new URLSearchParams(params || {}).toString();
  return api('GET', courseUrl('/questions') + (qs ? '?' + qs : ''));
};
const loadNotes     = (path) => api('GET', courseUrl('/notes') + '?path=' + encodeURIComponent(path));
const loadChapterTest = (chapterId) => api('GET', courseUrl('/chapter-test/' + encodeURIComponent(chapterId)));
const patchTracker  = (body) => api('PATCH', courseUrl('/tracker'), body);
const postProgress  = (record) => api('POST', courseUrl('/progress'), record);
const loadStarred   = () => api('GET', courseUrl('/starred'));
const postStar      = (body) => api('POST', courseUrl('/starred'), body);
const deleteStar    = (qid) => api('DELETE', courseUrl('/starred/' + encodeURIComponent(qid)));
const loadFlagged   = () => api('GET', courseUrl('/flagged'));
const postFlag      = (body) => api('POST', courseUrl('/flagged'), body);
const deleteFlag    = (qid) => api('DELETE', courseUrl('/flagged/' + encodeURIComponent(qid)));
const loadTodos     = () => api('GET', courseUrl('/todos'));
const postTodo      = (body) => api('POST', courseUrl('/todos'), body);
const patchTodo     = (id, body) => api('PATCH', courseUrl('/todos/' + encodeURIComponent(id)), body);
const deleteTodo    = (id) => api('DELETE', courseUrl('/todos/' + encodeURIComponent(id)));

// ===== router =====
function parseRoute(pathname) {
  const m = pathname.match(/^\/course\/([a-z0-9][a-z0-9-]*)\/?$/);
  if (m) return { screen: 'course', courseId: m[1] };
  return { screen: 'courses' };
}
function navigate(path) {
  if (location.pathname !== path) history.pushState(null, '', path);
  applyRoute();
}
async function applyRoute() {
  const r = parseRoute(location.pathname);
  if (r.screen === 'courses') return showCoursesScreen();
  await showCourseScreen(r.courseId);
}
window.addEventListener('popstate', applyRoute);

function slugify(s) {
  return (s || '').toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ===== helpers =====
function findTopic(topicId) {
  for (const d of state.topics.chapters) {
    for (const t of d.topics) {
      if (t.id === topicId) return { chapter: d, topic: t };
    }
  }
  return null;
}

function flatTopicIds() {
  const ids = [];
  for (const d of state.topics.chapters) for (const t of d.topics) ids.push(t.id);
  return ids;
}

function neighborTopicIds(topicId) {
  const ids = flatTopicIds();
  const i = ids.indexOf(topicId);
  return { prev: i > 0 ? ids[i - 1] : null, next: i >= 0 && i < ids.length - 1 ? ids[i + 1] : null };
}

const lessonCache = new Map();      // path -> boolean
const questionCountCache = new Map(); // `${phase}|${topicId}` -> number

async function lessonAvailable(path) {
  if (!path) return false;
  if (lessonCache.has(path)) return lessonCache.get(path);
  try {
    await loadNotes(path);
    lessonCache.set(path, true);
    return true;
  } catch (e) {
    lessonCache.set(path, false);
    return false;
  }
}

async function countQuestions(phase, topicId) {
  const key = `${phase}|${topicId}`;
  if (questionCountCache.has(key)) return questionCountCache.get(key);
  try {
    const pool = await loadQuestions({ phase, topicId });
    const n = Array.isArray(pool) ? pool.length : 0;
    questionCountCache.set(key, n);
    return n;
  } catch (e) {
    questionCountCache.set(key, 0);
    return 0;
  }
}

function statusOf(topicId) {
  const t = state.tracker?.topics?.[topicId];
  if (!t) return 'not-started';
  if (t.mastered) return 'mastered';
  if (t.studyCompleted || (Array.isArray(t.preCheckResults) && t.preCheckResults.length > 0)) return 'in-progress';
  return 'not-started';
}

function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function setMode(mode) {
  state.view = mode;
  const badge = document.getElementById('modeBadge');
  badge.className = 'badge mode-' + mode;
  const labels = { dashboard: 'Overview', topic: 'Topic', study: 'Study', quiz: 'Quiz', result: 'Result' };
  badge.textContent = labels[mode] || (mode.charAt(0).toUpperCase() + mode.slice(1));
}

function setCrumbs(html) {
  const el = document.getElementById('crumbs');
  const sep = ' <span class="sep">›</span> ';
  let out;
  if (state.screen === 'courses') {
    out = '<strong>Home</strong>';
  } else if (state.screen === 'course' && state.courseMeta) {
    const home = `<a href="/" class="crumb-link" data-nav="/">Home</a>`;
    const course = `<a href="/course/${state.courseMeta.id}" class="crumb-link" data-action="dashboard">${state.courseMeta.name}</a>`;
    out = home + sep + course + (html ? sep + html : '');
  } else {
    out = html;
  }
  el.innerHTML = out;
  el.querySelectorAll('[data-nav]').forEach(a => {
    a.onclick = (e) => { e.preventDefault(); navigate(a.dataset.nav); };
  });
  el.querySelectorAll('[data-action="dashboard"]').forEach(a => {
    a.onclick = (e) => { e.preventDefault(); renderDashboard(); };
  });
}

function setBrand(title, sub) {
  const t = document.querySelector('.brand-title');
  const s = document.querySelector('.brand-sub');
  if (t) t.textContent = title;
  if (s) s.textContent = sub || '';
}

function loadTemplate(id) {
  const tpl = document.getElementById(id);
  return tpl.content.cloneNode(true);
}

// minimal markdown rendering — headings, lists, bold, italic, inline code, paragraphs, fenced code, GFM tables
function renderMarkdown(md) {
  if (!md) return '<p class="notes-empty">No lesson content yet for this topic. Generate it via the STUDY_SESSION.md workflow in a fresh Claude session.</p>';
  const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = md.split('\n');
  const out = [];
  let inList = false;
  let inPara = [];
  let inCode = false;
  let codeBuf = [];
  const flushPara = () => { if (inPara.length) { out.push('<p>' + inline(inPara.join(' ')) + '</p>'); inPara = []; } };
  const flushList = () => { if (inList) { out.push('</ul>'); inList = false; } };
  function inline(s) {
    s = escape(s);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return s;
  }
  function splitRow(line) {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|')) s = s.slice(0, -1);
    return s.split('|').map(c => c.trim());
  }
  const isSeparatorRow = s => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(s);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, '');
    if (line.startsWith('```')) {
      flushPara(); flushList();
      if (!inCode) { inCode = true; codeBuf = []; }
      else { out.push('<pre><code>' + escape(codeBuf.join('\n')) + '</code></pre>'); inCode = false; codeBuf = []; }
      continue;
    }
    if (inCode) { codeBuf.push(raw); continue; }
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (line.trim().startsWith('|') && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      flushPara(); flushList();
      const header = splitRow(line);
      i += 1; // consume separator
      const rows = [];
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('|')) {
        i += 1;
        rows.push(splitRow(lines[i]));
      }
      const thead = '<thead><tr>' + header.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead>';
      const tbody = rows.length ? '<tbody>' + rows.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody>' : '';
      out.push(`<table>${thead}${tbody}</table>`);
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.+)$/);
    if (h) { flushPara(); flushList(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    const bq = line.match(/^>\s*(.*)$/);
    if (bq) { flushPara(); flushList(); out.push(`<blockquote>${inline(bq[1])}</blockquote>`); continue; }
    const li = line.match(/^[-*]\s+(.+)$/);
    if (li) { flushPara(); if (!inList) { out.push('<ul>'); inList = true; } out.push(`<li>${inline(li[1])}</li>`); continue; }
    inPara.push(line.trim());
  }
  flushPara(); flushList();
  if (inCode) out.push('<pre><code>' + escape(codeBuf.join('\n')) + '</code></pre>');
  return out.join('\n');
}

// ===== sidebar =====
function renderSidebar() {
  const tree = document.getElementById('topicTree');
  tree.innerHTML = '';
  const chapters = state.topics?.chapters || [];
  if (chapters.length === 0) {
    tree.innerHTML = '<p class="empty-hint">No topics yet.</p>';
    document.getElementById('progressSummary').innerHTML = '<div class="empty-hint">Course is empty.</div>';
    const resumeBtn = document.getElementById('resumeBtn');
    if (resumeBtn) { resumeBtn.disabled = true; resumeBtn.textContent = 'No topics yet'; }
    const starredBtn = document.getElementById('starredBtn');
    if (starredBtn) starredBtn.disabled = true;
    return;
  }
  const starredBtn = document.getElementById('starredBtn');
  if (starredBtn) {
    const n = state.starred.size;
    starredBtn.disabled = n === 0;
    starredBtn.textContent = n === 0 ? '⭐ Starred practice' : `⭐ Starred practice (${n})`;
  }
  for (const chapter of chapters) {
    const node = document.createElement('div');
    node.className = 'chapter-node';
    if (state.currentTopicId && chapter.topics.some(t => t.id === state.currentTopicId)) node.classList.add('open');

    const toggle = document.createElement('button');
    toggle.className = 'chapter-toggle';
    const pct = chapter.weight !== undefined ? `<span class="chapter-pct">${chapter.weight}%</span>` : '';
    toggle.innerHTML = `
      <span><span class="chev">▶</span>&nbsp;&nbsp;${chapter.id} · ${chapter.name}</span>
      ${pct}
    `;
    toggle.onclick = () => node.classList.toggle('open');
    node.appendChild(toggle);

    const list = document.createElement('ul');
    list.className = 'topic-list';
    for (const topic of chapter.topics) {
      const li = document.createElement('li');
      li.className = 'topic-item';
      if (topic.id === state.currentTopicId) li.classList.add('active');
      const grade = latestGradeFor(topic.id);
      li.innerHTML = `
        <span class="topic-item-id">${topic.id}</span>
        <span class="topic-item-title">${topic.title}</span>
        <span class="topic-item-grade grade-${grade.tier}" title="${grade.label}">${grade.glyph}</span>
      `;
      li.onclick = () => openTopic(topic.id);
      list.appendChild(li);
    }
    node.appendChild(list);
    tree.appendChild(node);
  }

  // progress summary
  const total = chapters.reduce((n, c) => n + c.topics.length, 0);
  let started = 0, mastered = 0;
  for (const c of chapters) for (const t of c.topics) {
    const s = statusOf(t.id);
    if (s === 'mastered') { mastered++; started++; }
    else if (s === 'in-progress') started++;
  }
  document.getElementById('progressSummary').innerHTML = `
    <div><strong>${mastered}</strong> / ${total} mastered</div>
    <div>${started} in progress</div>
  `;
}

// Compute the grade tier of the most recent post-test for a topic.
// Returns { tier: 'green'|'blue'|'yellow'|'orange'|'red'|'none', glyph, label }.
function latestGradeFor(topicId) {
  const t = state.tracker?.topics?.[topicId];
  const passes = t?.quizPasses || [];
  if (passes.length === 0) {
    return { tier: 'none', glyph: '○', label: 'Not yet attempted' };
  }
  const last = passes[passes.length - 1];
  const tier = tierForPercent(last.percent);
  const glyph = t?.mastered ? '●' : '◐';
  return { tier, glyph, label: `${last.percent}% (${tier})` };
}

function tierForPercent(percent) {
  for (const t of (state.config.grades || [])) {
    if (percent >= t.min) return t.name;
  }
  return 'red';
}

function chapterTestStatsFor(chapterId) {
  const entries = (state.progress || []).filter(
    e => e && e.phase === 'chapter-test' && e.chapterId === chapterId && typeof e.total === 'number' && e.total > 0
  );
  if (entries.length === 0) return { attempts: 0, best: null, last: null };
  const percents = entries.map(e => Math.round((e.score / e.total) * 100));
  return {
    attempts: entries.length,
    best: Math.max(...percents),
    last: percents[percents.length - 1],
  };
}

function renderEmptyCourse(view) {
  const cm = state.courseMeta || {};
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <h1 class="card-title">${cm.name || cm.id || 'New course'}</h1>
    <p class="card-lead">This course doesn't have any topics yet.</p>

    <h3 class="subhead">Next steps</h3>
    <ol class="setup-list">
      <li>Drop your reference material (PDFs, markdown, slides, links) into <code>courses/${cm.id}/reference/</code>. Plain text and markdown work best — convert PDFs first if you can.</li>
      <li>Run <strong>/decompose ${cm.id}</strong> in Claude Code (or paste <code>prompts/DECOMPOSE_COURSE.md</code> into any other LLM and tell it the course id) to parse the references into a chapter → topic → subtopic structure.</li>
      <li>Run <strong>/study ${cm.id}</strong> to author one topic's lesson and question bank at a time.</li>
    </ol>

    <p class="hint">Tip: if you haven't created this course yet via the API or UI form, the <strong>/new-course</strong> command does the whole flow (scaffold + reference intake + hand-off to decompose) in one assistant session.</p>

    <div class="cta-row">
      <button class="btn btn-ghost" data-nav="/" type="button">← All courses</button>
    </div>
  `;
  view.appendChild(card);
  card.querySelectorAll('[data-nav]').forEach(b => {
    b.onclick = (e) => { e.preventDefault(); navigate(b.dataset.nav); };
  });
}

// ===== dashboard =====
function renderDashboard() {
  setMode('dashboard');
  setCrumbs('<strong>Overview</strong>');
  const view = document.getElementById('view');
  view.innerHTML = '';

  // empty course (no topics yet) — show a setup explainer instead of the normal dashboard
  if (!state.topics?.chapters || state.topics.chapters.length === 0) {
    renderEmptyCourse(view);
    return;
  }

  view.appendChild(loadTemplate('tpl-dashboard'));

  const total = state.topics.chapters.reduce((n, c) => n + c.topics.length, 0);
  let mastered = 0, started = 0, attempts = 0;
  for (const c of state.topics.chapters) for (const t of c.topics) {
    const s = statusOf(t.id);
    if (s === 'mastered') mastered++;
    if (s === 'in-progress' || s === 'mastered') started++;
    attempts += state.tracker?.topics?.[t.id]?.quizPasses?.length || 0;
  }

  const lastId = state.tracker?.lastTopicId;
  const lastTopic = lastId ? findTopic(lastId) : null;
  const dashLead = document.getElementById('dashLead');
  if (lastTopic) {
    dashLead.innerHTML = `Last studied: <strong>${lastTopic.topic.id} — ${lastTopic.topic.title}</strong> on ${fmtDate(state.tracker.topics[lastId].finished)}.`;
  }

  document.getElementById('dashStats').innerHTML = `
    <div class="stat"><div class="stat-label">Mastered</div><div class="stat-value">${mastered}</div><div class="stat-sub">of ${total} topics</div></div>
    <div class="stat"><div class="stat-label">In progress</div><div class="stat-value">${started - mastered}</div><div class="stat-sub">started, not yet mastered</div></div>
    <div class="stat"><div class="stat-label">Test attempts</div><div class="stat-value">${attempts}</div><div class="stat-sub">across all topics</div></div>
    <div class="stat"><div class="stat-label">Mastery</div><div class="stat-value">${state.config.masteryThreshold}%</div><div class="stat-sub">green tier on a post-test</div></div>
  `;

  const grid = document.getElementById('chapterGrid');
  for (const c of state.topics.chapters) {
    const cMastered = c.topics.filter(t => statusOf(t.id) === 'mastered').length;
    const pct = Math.round((cMastered / c.topics.length) * 100);
    const pendingTestTopics = c.topics.filter(t => {
      const tt = state.tracker?.topics?.[t.id];
      return !tt || !Array.isArray(tt.quizPasses) || tt.quizPasses.length === 0;
    });
    const eligible = pendingTestTopics.length === 0;

    const card = document.createElement('div');
    card.className = 'chapter-card';
    const weight = c.weight !== undefined ? ` · ${c.weight}%` : '';
    const testStats = chapterTestStatsFor(c.id);
    let testLine = '';
    if (testStats.attempts > 0) {
      const bestTier = tierForPercent(testStats.best);
      const lastBit = testStats.attempts > 1 && testStats.last !== testStats.best
        ? ` · last ${testStats.last}%`
        : '';
      const attemptLabel = testStats.attempts === 1 ? '1 attempt' : `${testStats.attempts} attempts`;
      testLine = `<div class="chapter-card-test">Chapter test: <span class="grade-${bestTier}">best ${testStats.best}%</span><span class="chapter-card-test-sub">${lastBit} · ${attemptLabel}</span></div>`;
    }
    card.innerHTML = `
      <div class="chapter-card-id">${c.id}${weight}</div>
      <div class="chapter-card-name"></div>
      <div class="chapter-card-meta">${cMastered} / ${c.topics.length} mastered</div>
      <div class="chapter-card-bar"><div style="width:${pct}%"></div></div>
      ${testLine}
      <div class="chapter-card-actions">
        <button class="btn btn-secondary chapter-test-btn" type="button"></button>
      </div>
    `;
    card.querySelector('.chapter-card-name').textContent = c.name;
    const btn = card.querySelector('.chapter-test-btn');
    btn.textContent = `Take chapter test (${c.topics.length * 3} questions)`;
    if (eligible) {
      btn.disabled = false;
      btn.title = '3 questions per topic, drawn from the last 10 test questions of each.';
    } else {
      btn.disabled = true;
      btn.title = `Take the topic test for each topic first. Pending: ${pendingTestTopics.map(t => t.id).join(', ')}`;
    }
    btn.onclick = (e) => {
      e.stopPropagation();
      if (eligible) startChapterTest(c.id);
    };
    card.onclick = () => openTopic(c.topics[0].id);
    grid.appendChild(card);
  }

  const resumeBtn = document.getElementById('dashResume');
  if (lastId) {
    resumeBtn.onclick = () => openTopic(lastId);
  } else {
    resumeBtn.disabled = true;
    resumeBtn.textContent = 'No prior topic';
  }
  document.getElementById('dashOverview').onclick = () => {
    document.querySelector('.sidebar').scrollIntoView({ behavior: 'smooth' });
  };
}

// ===== topic landing (3 steps) =====
async function openTopic(topicId) {
  const found = findTopic(topicId);
  if (!found) return;
  state.currentTopicId = topicId;
  setMode('topic');
  setCrumbs(`<strong>${found.chapter.id}</strong> · ${found.chapter.name} <span class="sep">›</span> <strong>${found.topic.id}</strong> ${found.topic.title}`);

  const view = document.getElementById('view');
  view.innerHTML = '';
  view.appendChild(loadTemplate('tpl-topic'));

  document.getElementById('topicChapter').textContent = `${found.chapter.id} · ${found.chapter.name}`;
  document.getElementById('topicTitle').textContent = `${found.topic.id} — ${found.topic.title}`;

  const trackerTopic = state.tracker.topics[topicId] || {};
  const meta = [];
  if (trackerTopic.started) meta.push(`Started ${fmtDate(trackerTopic.started)}`);
  if (trackerTopic.finished) meta.push(`Last studied ${fmtDate(trackerTopic.finished)}`);
  if (trackerTopic.mastered) meta.push(`<span style="color:var(--success);font-weight:600;">Mastered</span>`);
  document.getElementById('topicMeta').innerHTML = meta.join(' <span class="sep">·</span> ');

  const subList = document.getElementById('topicSubtopicList');
  subList.innerHTML = '';
  for (const s of found.topic.subtopics) {
    const li = document.createElement('li');
    li.textContent = s;
    subList.appendChild(li);
  }

  // wire prev/next
  const { prev, next } = neighborTopicIds(topicId);
  const prevBtn = document.getElementById('topicPrevBtn');
  const nextBtn = document.getElementById('topicNextBtn');
  if (prev) {
    const p = findTopic(prev);
    prevBtn.disabled = false;
    prevBtn.title = `${p.topic.id} ${p.topic.title}`;
    prevBtn.textContent = `← ${p.topic.id} ${p.topic.title}`;
    prevBtn.onclick = () => openTopic(prev);
  } else {
    prevBtn.disabled = true;
    prevBtn.textContent = '← Previous topic';
    prevBtn.title = 'You are on the first topic.';
    prevBtn.onclick = null;
  }
  if (next) {
    const n = findTopic(next);
    nextBtn.disabled = false;
    nextBtn.title = `${n.topic.id} ${n.topic.title}`;
    nextBtn.textContent = `${n.topic.id} ${n.topic.title} →`;
    nextBtn.onclick = () => openTopic(next);
  } else {
    nextBtn.disabled = true;
    nextBtn.textContent = 'Next topic →';
    nextBtn.title = 'You are on the last topic.';
    nextBtn.onclick = null;
  }

  // initial render with availability unknown — buttons disabled until probed
  renderTopicSteps(topicId, { preCount: null, postCount: null, lessonAvail: null });
  renderSidebar();

  // probe availability and re-render once known
  const [preCount, postCount, lessonAvail] = await Promise.all([
    countQuestions('pre', topicId),
    countQuestions('post', topicId),
    lessonAvailable(found.topic.lessonFile),
  ]);
  // bail if user navigated away
  if (state.currentTopicId !== topicId || state.view !== 'topic') return;
  renderTopicSteps(topicId, { preCount, postCount, lessonAvail });
}

function renderTopicSteps(topicId, availability = {}) {
  const t = state.tracker.topics[topicId] || {};
  const preResults = Array.isArray(t.preCheckResults) ? t.preCheckResults : [];
  const postResults = Array.isArray(t.quizPasses) ? t.quizPasses : [];
  const cutoff = state.config.masteryThreshold;
  const { preCount, postCount, lessonAvail } = availability;
  const probing = preCount === null || postCount === null || lessonAvail === null;

  // Step 1 — pre-check
  const stepPre = document.getElementById('stepPre');
  const stepPreStatus = document.getElementById('stepPreStatus');
  const stepPreBtn = document.getElementById('stepPreBtn');
  if (preResults.length === 0) {
    stepPreStatus.innerHTML = '<span class="status-pill status-pending">Not yet taken</span>';
    stepPreBtn.textContent = 'Take pre-check';
    stepPre.classList.remove('done');
  } else {
    const last = preResults[preResults.length - 1];
    stepPreStatus.innerHTML = `<span class="status-pill status-done">Last result: ${last.score}/${last.total} (${last.percent}%)</span> <span class="status-sub">${preResults.length} attempt${preResults.length === 1 ? '' : 's'} · last ${fmtDate(last.timestamp)}</span>`;
    stepPreBtn.textContent = 'Retake pre-check';
    stepPre.classList.add('done');
  }
  if (probing) {
    stepPreBtn.disabled = true;
    stepPreBtn.title = 'Checking…';
  } else if (preCount === 0) {
    stepPreBtn.disabled = true;
    stepPreBtn.title = `No pre-check questions tagged for ${topicId} yet.`;
    stepPreStatus.innerHTML = '<span class="status-pill status-pending">Not available</span> <span class="status-sub">no pre-check questions generated yet</span>';
  } else {
    stepPreBtn.disabled = false;
    stepPreBtn.title = '';
  }
  stepPreBtn.onclick = () => startQuiz(topicId, 'pre');

  // Step 2 — study
  const stepStudy = document.getElementById('stepStudy');
  const stepStudyStatus = document.getElementById('stepStudyStatus');
  const stepStudyBtn = document.getElementById('stepStudyBtn');
  if (!t.studyCompleted) {
    stepStudyStatus.innerHTML = '<span class="status-pill status-pending">Not started</span>';
    stepStudyBtn.textContent = 'Open lesson';
    stepStudy.classList.remove('done');
  } else {
    stepStudyStatus.innerHTML = `<span class="status-pill status-done">Read</span> <span class="status-sub">last on ${fmtDate(t.finished)}</span>`;
    stepStudyBtn.textContent = 'Re-open lesson';
    stepStudy.classList.add('done');
  }
  if (probing) {
    stepStudyBtn.disabled = true;
    stepStudyBtn.title = 'Checking…';
  } else if (lessonAvail === false) {
    stepStudyBtn.disabled = true;
    stepStudyBtn.title = 'Lesson content not generated yet.';
    if (!t.studyCompleted) {
      stepStudyStatus.innerHTML = '<span class="status-pill status-pending">Not available</span> <span class="status-sub">lesson not generated yet</span>';
    }
  } else {
    stepStudyBtn.disabled = false;
    stepStudyBtn.title = '';
  }
  stepStudyBtn.onclick = () => openLesson(topicId);

  // Step 3 — test
  const stepTest = document.getElementById('stepTest');
  const stepTestStatus = document.getElementById('stepTestStatus');
  const stepTestBtn = document.getElementById('stepTestBtn');
  document.getElementById('stepTestCutoff').textContent = `(≥${cutoff}% to pass)`;
  const stepTestPool = document.getElementById('stepTestPool');
  stepTestPool.textContent = probing ? '' : ` · pool of ${postCount} total`;
  if (postResults.length === 0) {
    stepTestStatus.innerHTML = '<span class="status-pill status-pending">Not yet attempted</span>';
    stepTestBtn.textContent = 'Take test';
  } else {
    const last = postResults[postResults.length - 1];
    const passed = last.percent >= cutoff;
    let lead;
    const scoreText = `${last.score}/${last.total} (${last.percent}%)`;
    if (t.mastered) lead = `<span class="status-pill status-mastered">Mastered: ${scoreText}</span>`;
    else if (passed) lead = `<span class="status-pill status-pass">Last passed: ${scoreText}</span>`;
    else lead = `<span class="status-pill status-fail">Last failed: ${scoreText}</span>`;
    stepTestStatus.innerHTML = `${lead} <span class="status-sub">${postResults.length} attempt${postResults.length === 1 ? '' : 's'} · last ${fmtDate(last.timestamp)}</span>`;
    stepTestBtn.textContent = t.mastered ? 'Take test again' : 'Retake test';
    if (t.mastered) stepTest.classList.add('done');
  }
  const stepTestFullBtn = document.getElementById('stepTestFullBtn');
  if (probing) {
    stepTestBtn.disabled = true;
    stepTestBtn.title = 'Checking…';
    stepTestFullBtn.disabled = true;
    stepTestFullBtn.title = 'Checking…';
    stepTestFullBtn.textContent = 'Take full test';
  } else if (postCount === 0) {
    stepTestBtn.disabled = true;
    stepTestBtn.title = `No test questions tagged for ${topicId} yet.`;
    stepTestFullBtn.disabled = true;
    stepTestFullBtn.title = `No test questions tagged for ${topicId} yet.`;
    stepTestFullBtn.textContent = 'Take full test';
    if (postResults.length === 0) {
      stepTestStatus.innerHTML = '<span class="status-pill status-pending">Not available</span> <span class="status-sub">no test questions generated yet</span>';
    }
  } else if (!t.studyCompleted) {
    stepTestBtn.disabled = true;
    stepTestBtn.title = 'Read the lesson first.';
    stepTestFullBtn.disabled = true;
    stepTestFullBtn.title = 'Read the lesson first.';
    stepTestFullBtn.textContent = `Take full test (${postCount})`;
  } else {
    stepTestBtn.disabled = false;
    stepTestBtn.title = '';
    stepTestFullBtn.disabled = false;
    stepTestFullBtn.title = `Run all ${postCount} test questions in one attempt.`;
    stepTestFullBtn.textContent = `Take full test (${postCount})`;
  }
  stepTestBtn.onclick = () => startQuiz(topicId, 'post');
  stepTestFullBtn.onclick = () => startQuiz(topicId, 'post', true);
}

// ===== study (lesson reading) =====
async function openLesson(topicId) {
  const found = findTopic(topicId);
  if (!found) return;
  state.currentTopicId = topicId;
  setMode('study');
  setCrumbs(`<strong>${found.topic.id}</strong> ${found.topic.title} <span class="sep">›</span> <strong>Lesson</strong>`);

  const view = document.getElementById('view');
  view.innerHTML = '';
  view.appendChild(loadTemplate('tpl-study'));

  document.getElementById('studyChapter').textContent = `${found.chapter.id} · ${found.chapter.name}`;
  document.getElementById('studyTitle').textContent = `${found.topic.id} — ${found.topic.title}`;

  const trackerTopic = state.tracker.topics[topicId] || {};
  const meta = [];
  if (trackerTopic.started) meta.push(`Started ${fmtDate(trackerTopic.started)}`);
  if (trackerTopic.finished) meta.push(`Last studied ${fmtDate(trackerTopic.finished)}`);
  document.getElementById('studyMeta').innerHTML = meta.join(' <span class="sep">·</span> ');

  // load the per-topic lesson
  const notesEl = document.getElementById('notesContent');
  const hintEl = document.getElementById('notesHint');
  notesEl.innerHTML = '<p class="notes-empty">Loading lesson…</p>';
  let md = null;
  try {
    md = await loadNotes(found.topic.lessonFile);
  } catch (e) {
    md = null;
  }
  notesEl.innerHTML = renderMarkdown(md);
  hintEl.textContent = md
    ? `Source: ${found.topic.lessonFile}`
    : `Expected: ${found.topic.lessonFile}`;

  const proceed = document.getElementById('proceedBtn');
  // already-read: pre-check the box and let them re-confirm
  if (trackerTopic.studyCompleted) {
    document.getElementById('confirmRead').checked = true;
    proceed.disabled = false;
    proceed.textContent = 'Mark as re-read';
  }
  document.getElementById('confirmRead').onchange = (e) => {
    proceed.disabled = !e.target.checked;
  };
  proceed.onclick = async () => {
    try {
      const res = await patchTracker({ topicId: topicId, action: 'study-finish' });
      state.tracker.topics[topicId] = res.topic;
      state.tracker.lastTopicId = topicId;
    } catch (e) { /* non-fatal */ }
    openTopic(topicId);
  };
  document.getElementById('backBtn').onclick = () => openTopic(topicId);
}

// ===== chapter-wise test =====
async function startChapterTest(chapterId) {
  let data;
  try {
    data = await loadChapterTest(chapterId);
  } catch (e) {
    alert(`Could not load chapter test: ${e.message}`);
    return;
  }
  if (!data.questions || data.questions.length === 0) {
    alert('No test questions are available for this chapter yet.');
    return;
  }
  state.quiz = {
    mode: 'chapter',
    chapterId: data.chapterId,
    chapterName: data.chapterName,
    phase: 'post',
    full: false,
    questions: data.questions,
    answers: new Array(data.questions.length).fill(null),
    submitted: new Array(data.questions.length).fill(false),
    idx: 0,
    startTs: Date.now(),
  };
  renderQuiz();
}

// ===== quiz (starred practice) =====
async function startStarredQuiz() {
  let pool;
  try {
    pool = await loadQuestions({ starred: '1' });
  } catch (e) {
    alert(`Could not load starred questions: ${e.message}`);
    return;
  }
  if (!Array.isArray(pool) || pool.length === 0) {
    alert('No starred questions yet. Tap the ⭐ on a question during a quiz to star it.');
    return;
  }
  const limit = Math.min(20, pool.length);
  const shuffled = pool.slice().sort(() => Math.random() - 0.5).slice(0, limit);
  state.quiz = {
    mode: 'starred',
    phase: 'post',
    full: false,
    questions: shuffled,
    answers: new Array(shuffled.length).fill(null),
    submitted: new Array(shuffled.length).fill(false),
    idx: 0,
    startTs: Date.now(),
    starredTotal: pool.length,
  };
  renderQuiz();
}

// ===== quiz (pre or post) =====
async function startQuiz(topicId, phase, full = false) {
  const found = findTopic(topicId);
  if (!found) return;
  let pool;
  try {
    pool = await loadQuestions({ phase, topicId });
  } catch (e) {
    alert(`Could not load questions: ${e.message}`);
    return;
  }
  if (pool.length === 0) {
    const phaseLabel = phase === 'pre' ? 'pre-check' : 'test';
    alert(`No ${phaseLabel} questions tagged for ${topicId} yet. Generate them via STUDY_SESSION.md.`);
    return;
  }
  // full mode: shuffle and use the entire pool. otherwise: shuffle and take up to 10.
  const limit = full ? pool.length : Math.min(10, pool.length);
  const shuffled = pool.slice().sort(() => Math.random() - 0.5).slice(0, limit);
  state.quiz = {
    mode: 'topic',
    topicId,
    phase,
    full,
    questions: shuffled,
    answers: new Array(shuffled.length).fill(null),
    submitted: new Array(shuffled.length).fill(false),
    idx: 0,
    startTs: Date.now(),
  };
  renderQuiz();
}

function renderQuiz() {
  setMode('quiz');
  const mode = state.quiz.mode;
  let pillText, phaseLabel, phaseClass;
  if (mode === 'chapter') {
    pillText = `${state.quiz.chapterId} · ${state.quiz.chapterName}`;
    phaseLabel = 'Chapter test';
    phaseClass = 'phase-chapter';
    setCrumbs(`<strong>${state.quiz.chapterId}</strong> ${state.quiz.chapterName} <span class="sep">›</span> <strong>${phaseLabel}</strong>`);
  } else if (mode === 'starred') {
    pillText = `⭐ Starred practice`;
    phaseLabel = 'Starred';
    phaseClass = 'phase-starred';
    setCrumbs(`<strong>Starred practice</strong>`);
  } else {
    const found = findTopic(state.quiz.topicId);
    phaseLabel = state.quiz.phase === 'pre' ? 'Pre-check' : 'Test';
    phaseClass = state.quiz.phase === 'pre' ? 'phase-pre' : 'phase-post';
    pillText = `${found.topic.id} · ${found.topic.title}`;
    setCrumbs(`<strong>${found.topic.id}</strong> ${found.topic.title} <span class="sep">›</span> <strong>${phaseLabel}</strong>`);
  }

  const view = document.getElementById('view');
  view.innerHTML = '';
  view.appendChild(loadTemplate('tpl-quiz'));

  document.getElementById('quizTopicPill').textContent = pillText;
  const phasePill = document.getElementById('quizPhasePill');
  phasePill.textContent = phaseLabel;
  phasePill.className = 'badge ' + phaseClass;

  drawQuestion();
  startTimer();

  document.getElementById('quizExit').onclick = () => {
    stopTimer();
    if (confirm('Exit the quiz? Your progress will be lost.')) {
      if (state.quiz.mode === 'chapter' || state.quiz.mode === 'starred') renderDashboard();
      else openTopic(state.quiz.topicId);
    }
  };
  document.getElementById('quizSubmit').onclick = submitCurrent;
  document.getElementById('quizNext').onclick = nextQuestion;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function drawQuestion() {
  const q = state.quiz.questions[state.quiz.idx];
  const total = state.quiz.questions.length;
  document.getElementById('quizCounter').textContent = `Question ${state.quiz.idx + 1} of ${total}`;
  document.getElementById('quizProgress').style.width = `${((state.quiz.idx) / total) * 100}%`;
  document.getElementById('quizQuestion').textContent = q.question;
  const opts = document.getElementById('quizOptions');
  opts.innerHTML = '';
  q.options.forEach((opt, i) => {
    const label = document.createElement('label');
    label.className = 'option';
    label.innerHTML = `
      <input type="radio" name="answer" value="${i}" />
      <span class="opt-letter">${LETTERS[i]}</span>
      <span class="opt-text"></span>
    `;
    label.querySelector('.opt-text').textContent = opt;
    label.querySelector('input').onchange = () => {
      opts.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
      label.classList.add('selected');
      state.quiz.answers[state.quiz.idx] = i;
    };
    opts.appendChild(label);
  });
  document.getElementById('quizFeedback').textContent = '';
  document.getElementById('quizFeedback').className = 'feedback';
  const expl = document.getElementById('quizExplanations');
  expl.innerHTML = '';
  expl.hidden = true;
  document.getElementById('quizSubmit').disabled = false;
  document.getElementById('quizNext').disabled = true;
  document.getElementById('quizNext').textContent = 'Next';

  // Copy button: pre-check shows it always; post hides until submit.
  const copyBtn = document.getElementById('quizCopyBtn');
  copyBtn.hidden = state.quiz.phase === 'post';
  copyBtn.classList.remove('copied');
  copyBtn.querySelector('.btn-icon-label').textContent = 'Copy';
  copyBtn.onclick = () => copyCurrentQuestion();

  // Star + flag buttons. Both require a qid; if missing, hide them.
  const starBtn = document.getElementById('quizStarBtn');
  const flagBtn = document.getElementById('quizFlagBtn');
  if (!q.qid) {
    starBtn.hidden = true;
    flagBtn.hidden = true;
  } else {
    starBtn.hidden = false;
    flagBtn.hidden = false;
    refreshStarBtn(q.qid);
    refreshFlagBtn(q.qid);
    starBtn.onclick = () => toggleStar(q);
    flagBtn.onclick = () => openFlagModal(q);
  }
}

function refreshStarBtn(qid) {
  const btn = document.getElementById('quizStarBtn');
  if (!btn) return;
  const on = state.starred.has(qid);
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.title = on ? 'Starred — click to unstar' : 'Star this question to practice it later';
  btn.querySelector('.btn-icon-label').textContent = on ? 'Starred' : 'Star';
  btn.querySelector('svg path').setAttribute('fill', on ? 'currentColor' : 'none');
}

function refreshFlagBtn(qid) {
  const btn = document.getElementById('quizFlagBtn');
  if (!btn) return;
  const on = state.flagged.has(qid);
  btn.classList.toggle('on', on);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.title = on ? 'Flagged for AI revision — click to view or change' : 'Flag this question for AI revision';
  btn.querySelector('.btn-icon-label').textContent = on ? 'Flagged' : 'Flag';
}

async function toggleStar(q) {
  const qid = q.qid;
  if (!qid) return;
  const topicId = quizTopicIdFor(q);
  const wasOn = state.starred.has(qid);
  // optimistic
  if (wasOn) state.starred.delete(qid); else state.starred.add(qid);
  refreshStarBtn(qid);
  updateStarredSidebarCount();
  try {
    if (wasOn) await deleteStar(qid);
    else await postStar({ qid, topicId });
  } catch (e) {
    // rollback
    if (wasOn) state.starred.add(qid); else state.starred.delete(qid);
    refreshStarBtn(qid);
    updateStarredSidebarCount();
    alert(`Could not ${wasOn ? 'unstar' : 'star'}: ${e.message}`);
  }
}

function updateStarredSidebarCount() {
  const btn = document.getElementById('starredBtn');
  if (!btn) return;
  const n = state.starred.size;
  btn.disabled = n === 0;
  btn.textContent = n === 0 ? '⭐ Starred practice' : `⭐ Starred practice (${n})`;
}

function quizTopicIdFor(q) {
  // Topic ID from question.topics if present (e.g. "1.1"), else fall back to current quiz topic.
  if (Array.isArray(q.topics)) {
    const t = q.topics.find(s => /^\d+\.\d+$/.test(s));
    if (t) return t;
  }
  return state.quiz?.topicId || null;
}

let flagModalCtx = null;
function openFlagModal(q) {
  const modal = document.getElementById('flagModal');
  const reasonEl = document.getElementById('flagReason');
  const errEl = document.getElementById('flagModalError');
  const removeBtn = document.getElementById('flagRemoveBtn');
  const submitBtn = document.getElementById('flagSubmitBtn');
  const ctxEl = document.getElementById('flagModalQuestion');
  errEl.hidden = true;
  ctxEl.textContent = q.question || '';
  const existing = state.flagged.get(q.qid);
  reasonEl.value = existing?.reason || '';
  removeBtn.hidden = !existing;
  submitBtn.textContent = existing ? 'Update flag' : 'Save flag';
  flagModalCtx = { qid: q.qid, topicId: quizTopicIdFor(q) };
  modal.hidden = false;
  setTimeout(() => reasonEl.focus(), 0);
}

function closeFlagModal() {
  const modal = document.getElementById('flagModal');
  modal.hidden = true;
  flagModalCtx = null;
}

async function submitFlag() {
  if (!flagModalCtx) return;
  const reason = document.getElementById('flagReason').value.trim();
  const errEl = document.getElementById('flagModalError');
  if (!reason) {
    errEl.textContent = 'A reason is required so the AI knows what to fix.';
    errEl.hidden = false;
    return;
  }
  const { qid, topicId } = flagModalCtx;
  try {
    await postFlag({ qid, topicId, reason });
    state.flagged.set(qid, { qid, topicId, reason, status: 'open', createdAt: new Date().toISOString() });
    refreshFlagBtn(qid);
    closeFlagModal();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.hidden = false;
  }
}

async function removeFlag() {
  if (!flagModalCtx) return;
  const { qid } = flagModalCtx;
  try {
    await deleteFlag(qid);
    state.flagged.delete(qid);
    refreshFlagBtn(qid);
    closeFlagModal();
  } catch (e) {
    const errEl = document.getElementById('flagModalError');
    errEl.textContent = e.message;
    errEl.hidden = false;
  }
}

function copyCurrentQuestion() {
  const q = state.quiz.questions[state.quiz.idx];
  const idx = state.quiz.idx;
  const submitted = state.quiz.submitted[idx];
  const reveal = submitted;
  let topicLine;
  if (state.quiz.mode === 'chapter') {
    const tid = (q.topics || []).find(t => /^\d+\.\d+$/.test(t));
    const f = tid ? findTopic(tid) : null;
    topicLine = f
      ? `${f.topic.id} — ${f.topic.title} (chapter test ${state.quiz.chapterId} · ${state.quiz.chapterName})`
      : `Chapter ${state.quiz.chapterId} — ${state.quiz.chapterName}`;
  } else if (state.quiz.mode === 'starred') {
    const tid = (q.topics || []).find(t => /^\d+\.\d+$/.test(t));
    const f = tid ? findTopic(tid) : null;
    topicLine = f ? `${f.topic.id} — ${f.topic.title} (starred practice)` : `Starred practice`;
  } else {
    const found = findTopic(state.quiz.topicId);
    topicLine = found ? `${found.topic.id} — ${found.topic.title}` : state.quiz.topicId;
  }
  const userPick = state.quiz.answers[idx];
  const gotItRight = reveal && userPick === q.answer;

  let preamble;
  if (!reveal) {
    preamble =
      `I'm studying for the Claude Certified Architect — Foundations exam.\n` +
      `Topic: ${topicLine}.\n\n` +
      `Help me understand this practice question. Explain the underlying concept being tested, walk through each option, identify the correct answer with clear reasoning, and provide a concrete code or workflow example so I can recognize this pattern next time.`;
  } else if (gotItRight) {
    preamble =
      `I'm studying for the Claude Certified Architect — Foundations exam.\n` +
      `Topic: ${topicLine}.\n\n` +
      `I answered this practice question correctly. Help me deepen my understanding: explain in detail why the correct answer is right (the principle being tested), why each distractor is a tempting wrong pick, and give a concrete code or workflow example I can refer back to.`;
  } else {
    preamble =
      `I'm studying for the Claude Certified Architect — Foundations exam.\n` +
      `Topic: ${topicLine}.\n\n` +
      `I answered this practice question incorrectly. Help me understand my mistake: explain in detail why the correct answer is right, why my pick was wrong (what intuition I was following and what it misses), why each other distractor is also wrong, and give a concrete code or workflow example so I can recognize the pattern next time.`;
  }

  const lines = [preamble, '', `Q: ${q.question}`, ''];
  q.options.forEach((opt, i) => lines.push(`${LETTERS[i]}) ${opt}`));
  if (reveal) {
    lines.push('');
    lines.push(`Correct answer: ${LETTERS[q.answer]}`);
    if (userPick !== null && userPick !== undefined) {
      lines.push(`My answer: ${LETTERS[userPick]}${gotItRight ? ' (correct)' : ' (incorrect)'}`);
    }
  }
  const text = lines.join('\n');

  const btn = document.getElementById('quizCopyBtn');
  const finish = (ok) => {
    btn.classList.toggle('copied', ok);
    btn.querySelector('.btn-icon-label').textContent = ok ? 'Copied' : 'Copy failed';
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.querySelector('.btn-icon-label').textContent = 'Copy';
    }, 1600);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => finish(true)).catch(() => finish(false));
  } else {
    // fallback: textarea + execCommand
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
    finish(ok);
  }
}

function renderExplanations(q, sel, inspected = null) {
  const expl = document.getElementById('quizExplanations');
  if (!Array.isArray(q.explanations) || q.explanations.length === 0) {
    expl.hidden = true;
    expl.innerHTML = '';
    return;
  }
  const isCorrect = sel === q.answer;
  const blocks = [];
  const fillers = [];
  // primary block: user's choice
  blocks.push(`
    <div class="expl-block ${isCorrect ? 'correct' : 'incorrect'}">
      <div class="expl-label">Your answer · ${LETTERS[sel]}</div>
      <div class="expl-text"></div>
    </div>
  `);
  fillers.push(q.explanations[sel] || '(no explanation provided)');
  if (!isCorrect) {
    blocks.push(`
      <div class="expl-block correct">
        <div class="expl-label">Correct answer · ${LETTERS[q.answer]}</div>
        <div class="expl-text"></div>
      </div>
    `);
    fillers.push(q.explanations[q.answer] || '(no explanation provided)');
  }
  // optional inspected (third) block — when the user clicks a distractor that's
  // neither their pick nor the correct answer, surface its explanation too.
  if (inspected !== null && inspected !== sel && inspected !== q.answer) {
    blocks.push(`
      <div class="expl-block incorrect">
        <div class="expl-label">Option ${LETTERS[inspected]} — why this is wrong</div>
        <div class="expl-text"></div>
      </div>
    `);
    fillers.push(q.explanations[inspected] || '(no explanation provided)');
  }
  expl.innerHTML = blocks.join('');
  const texts = expl.querySelectorAll('.expl-text');
  texts.forEach((el, i) => { el.textContent = fillers[i]; });
  expl.hidden = false;
}

function inspectOption(optIdx) {
  const idx = state.quiz.idx;
  if (!state.quiz.submitted[idx]) return;
  const q = state.quiz.questions[idx];
  const sel = state.quiz.answers[idx];
  // only highlight a "third" inspection — clicks on the user's pick or the correct
  // answer just snap back to the default pair view.
  const isExtra = optIdx !== sel && optIdx !== q.answer;
  const opts = document.getElementById('quizOptions').querySelectorAll('.option');
  opts.forEach((o, i) => o.classList.toggle('inspected', isExtra && i === optIdx));
  renderExplanations(q, sel, isExtra ? optIdx : null);
}

function submitCurrent() {
  const idx = state.quiz.idx;
  const sel = state.quiz.answers[idx];
  if (sel === null || sel === undefined) {
    const fb = document.getElementById('quizFeedback');
    fb.textContent = 'Please choose an option first.';
    fb.className = 'feedback incorrect';
    return;
  }
  state.quiz.submitted[idx] = true;
  const q = state.quiz.questions[idx];
  const isCorrect = sel === q.answer;
  const opts = document.getElementById('quizOptions').querySelectorAll('.option');
  opts.forEach((o, i) => {
    o.querySelector('input').disabled = true;
    if (i === q.answer) o.classList.add('correct');
    else if (i === sel) o.classList.add('incorrect');
    o.classList.add('post-submit');
    o.onclick = (e) => { e.preventDefault(); inspectOption(i); };
  });
  const fb = document.getElementById('quizFeedback');
  const verdict = isCorrect ? 'Correct.' : `Incorrect. Correct answer: ${LETTERS[q.answer]} — ${q.options[q.answer]}`;
  fb.innerHTML = `${verdict} <span class="feedback-hint">Click any option to see why it's right or wrong.</span>`;
  fb.className = 'feedback ' + (isCorrect ? 'correct' : 'incorrect');
  renderExplanations(q, sel);
  // Reveal copy button on test once an answer is submitted.
  if (state.quiz.phase === 'post') {
    const copyBtn = document.getElementById('quizCopyBtn');
    copyBtn.hidden = false;
  }
  document.getElementById('quizSubmit').disabled = true;
  document.getElementById('quizNext').disabled = false;
  if (state.quiz.idx === state.quiz.questions.length - 1) {
    document.getElementById('quizNext').textContent = 'See result';
  }
}

function nextQuestion() {
  if (state.quiz.idx < state.quiz.questions.length - 1) {
    state.quiz.idx++;
    drawQuestion();
  } else {
    finishQuiz();
  }
}

let timerHandle = null;
function startTimer() {
  stopTimer();
  state.quiz.startTs = Date.now();
  const tick = () => {
    const s = Math.round((Date.now() - state.quiz.startTs) / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    const el = document.getElementById('quizTimer');
    if (el) el.textContent = `${mm}:${ss}`;
  };
  tick();
  timerHandle = setInterval(tick, 1000);
}
function stopTimer() {
  if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
}

async function finishQuiz() {
  stopTimer();
  const q = state.quiz;
  const total = q.questions.length;
  const score = q.questions.reduce((acc, qq, i) => acc + (q.answers[i] === qq.answer ? 1 : 0), 0);
  const percent = Math.round((score / total) * 100);
  const duration = Math.round((Date.now() - q.startTs) / 1000);

  let updatedTopic = null;
  if (q.mode === 'chapter') {
    const record = {
      timestamp: Date.now(),
      chapterId: q.chapterId,
      phase: 'chapter-test',
      score, total, duration_seconds: duration,
    };
    try {
      await postProgress(record);
      if (!Array.isArray(state.progress)) state.progress = [];
      state.progress.push(record);
    } catch (e) { /* non-fatal */ }
  } else if (q.mode === 'starred') {
    try {
      await postProgress({
        timestamp: Date.now(),
        phase: 'starred',
        score, total, duration_seconds: duration,
        question_qids: q.questions.map(qq => qq.qid).filter(Boolean),
      });
    } catch (e) { /* non-fatal */ }
  } else {
    const found = findTopic(q.topicId);
    const action = q.phase === 'pre' ? 'pre-check-result' : 'quiz-result';
    try {
      const res = await patchTracker({ topicId: q.topicId, action, payload: { score, total } });
      updatedTopic = res.topic;
      state.tracker.topics[q.topicId] = updatedTopic;
    } catch (e) { /* non-fatal */ }

    // legacy progress.json log
    try {
      await postProgress({
        timestamp: Date.now(),
        topics: [q.topicId, found?.chapter?.id].filter(Boolean),
        phase: q.phase,
        score, total, duration_seconds: duration,
        question_ids: q.questions.map((qq, i) => i),
      });
    } catch (e) { /* non-fatal */ }
  }

  renderResult({ score, total, percent, duration, updatedTopic });
}

function renderResult({ score, total, percent, duration, updatedTopic }) {
  setMode('result');
  const mode = state.quiz.mode;
  const isChapter = mode === 'chapter';
  const isStarred = mode === 'starred';
  const phase = state.quiz.phase;
  if (isChapter) {
    setCrumbs(`<strong>${state.quiz.chapterId}</strong> ${state.quiz.chapterName} <span class="sep">›</span> <strong>Chapter test result</strong>`);
  } else if (isStarred) {
    setCrumbs(`<strong>Starred practice result</strong>`);
  } else {
    const phaseLabel = phase === 'pre' ? 'Pre-check' : 'Test';
    const found = findTopic(state.quiz.topicId);
    setCrumbs(`<strong>${found.topic.id}</strong> ${found.topic.title} <span class="sep">›</span> <strong>${phaseLabel} result</strong>`);
  }

  const view = document.getElementById('view');
  view.innerHTML = '';
  view.appendChild(loadTemplate('tpl-result'));

  const cutoff = state.config.masteryThreshold;
  const passed = (isChapter || isStarred || phase === 'post') && percent >= cutoff;
  const scoreEl = document.getElementById('resultScore');
  scoreEl.textContent = `${percent}%`;
  if (!isChapter && !isStarred && phase === 'pre') {
    // pre-check: informational only — no pass/fail color
    scoreEl.classList.add('info');
  } else if (isStarred) {
    scoreEl.classList.add('info');
  } else {
    scoreEl.classList.add(passed ? 'pass' : 'fail');
  }

  const passes = updatedTopic?.quizPasses || [];
  const masteredNow = updatedTopic?.mastered;

  const titleEl = document.getElementById('resultTitle');
  const leadEl = document.getElementById('resultLead');
  if (isChapter) {
    if (passed) {
      titleEl.textContent = 'Chapter test passed';
      leadEl.textContent = `${score}/${total} (${percent}%) in ${formatDuration(duration)} on the ${state.quiz.chapterName} chapter test.`;
    } else {
      titleEl.textContent = 'Chapter test below cutoff';
      leadEl.textContent = `${score}/${total} (${percent}%) in ${formatDuration(duration)}. Re-visit the topics in ${state.quiz.chapterName} and try again — passing cutoff is ${cutoff}%.`;
    }
  } else if (isStarred) {
    titleEl.textContent = 'Starred practice complete';
    const starredTotal = state.quiz.starredTotal || total;
    leadEl.textContent = `${score}/${total} (${percent}%) in ${formatDuration(duration)}. Drawn from your ${starredTotal} starred question${starredTotal === 1 ? '' : 's'}. Unstar a question from inside any quiz once you no longer need it.`;
  } else if (phase === 'pre') {
    titleEl.textContent = 'Pre-check complete';
    leadEl.textContent = `Baseline: ${score}/${total} in ${formatDuration(duration)}. This score is informational — head into the lesson next.`;
  } else if (masteredNow) {
    titleEl.textContent = 'Mastered';
    leadEl.textContent = `${score}/${total} (${percent}%) in ${formatDuration(duration)}. Passed at ≥${cutoff}% — topic mastered.`;
  } else if (passed) {
    titleEl.textContent = 'Passed';
    leadEl.textContent = `${score}/${total} (${percent}%) in ${formatDuration(duration)}.`;
  } else {
    titleEl.textContent = 'Below cutoff';
    leadEl.textContent = `${score}/${total} (${percent}%) in ${formatDuration(duration)}. Re-read the lesson and try again — you need ≥${cutoff}%.`;
  }

  const breakdownParts = [
    `<div class="result-stat"><div class="result-stat-label">Score</div><div class="result-stat-value">${score}/${total}</div></div>`,
    `<div class="result-stat"><div class="result-stat-label">Percent</div><div class="result-stat-value">${percent}%</div></div>`,
    `<div class="result-stat"><div class="result-stat-label">Time</div><div class="result-stat-value">${formatDuration(duration)}</div></div>`,
  ];
  if (!isChapter) {
    const attempts = phase === 'pre'
      ? (updatedTopic?.preCheckResults?.length || 0)
      : passes.length;
    breakdownParts.push(`<div class="result-stat"><div class="result-stat-label">Attempts</div><div class="result-stat-value">${attempts}</div></div>`);
  }
  document.getElementById('resultBreakdown').innerHTML = breakdownParts.join('');

  if (isChapter) {
    document.getElementById('resultRetake').onclick = () => startChapterTest(state.quiz.chapterId);
    const restudyBtn = document.getElementById('resultRestudy');
    restudyBtn.hidden = true;
    const backBtn = document.getElementById('resultBack');
    backBtn.textContent = 'Back to overview';
    backBtn.onclick = () => renderDashboard();
  } else if (isStarred) {
    document.getElementById('resultRetake').onclick = () => startStarredQuiz();
    const restudyBtn = document.getElementById('resultRestudy');
    restudyBtn.hidden = true;
    const backBtn = document.getElementById('resultBack');
    backBtn.textContent = 'Back to overview';
    backBtn.onclick = () => renderDashboard();
  } else {
    document.getElementById('resultRetake').onclick = () => startQuiz(state.quiz.topicId, phase);
    document.getElementById('resultRestudy').onclick = () => openLesson(state.quiz.topicId);
    document.getElementById('resultBack').onclick = () => openTopic(state.quiz.topicId);
  }

  renderSidebar();
}

function formatDuration(s) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

// ===== screens =====
async function showCoursesScreen() {
  state.screen = 'courses';
  state.courseId = null;
  state.courseMeta = null;
  state.currentTopicId = null;
  state.quiz = null;
  document.body.classList.add('no-sidebar');
  const badge = document.getElementById('modeBadge');
  if (badge) badge.hidden = true;
  setBrand('Courses', 'Pick one to study');
  setCrumbs('');
  hideTodoWidget();

  let courses;
  try {
    courses = await loadCoursesList();
  } catch (e) {
    document.getElementById('view').innerHTML =
      `<div class="card"><h1 class="card-title">Failed to load courses</h1><p class="card-lead">${e.message}</p></div>`;
    return;
  }
  renderCoursesScreen(courses);
}

function renderCoursesScreen(courses) {
  const view = document.getElementById('view');
  view.innerHTML = '';
  view.appendChild(loadTemplate('tpl-courses'));

  const grid = document.getElementById('courseGrid');
  grid.innerHTML = '';
  if (!courses || courses.length === 0) {
    grid.innerHTML = '<p class="hint">No courses yet — add one below.</p>';
  } else {
    for (const c of courses) {
      const card = document.createElement('div');
      card.className = 'course-card';
      card.innerHTML = `
        <div class="course-card-id"></div>
        <div class="course-card-name"></div>
        <div class="course-card-desc"></div>
        <div class="course-card-meta"></div>
      `;
      card.querySelector('.course-card-id').textContent = c.id;
      card.querySelector('.course-card-name').textContent = c.name;
      card.querySelector('.course-card-desc').textContent = c.description || '';
      card.querySelector('.course-card-meta').textContent = c.createdAt ? 'Created ' + c.createdAt : '';
      card.onclick = () => navigate('/course/' + c.id);
      grid.appendChild(card);
    }
  }

  const form = document.getElementById('newCourseForm');
  const nameEl = document.getElementById('newCourseName');
  const idEl = document.getElementById('newCourseId');
  const descEl = document.getElementById('newCourseDesc');
  const errEl = document.getElementById('newCourseError');
  let idTouched = false;
  idEl.addEventListener('input', () => { idTouched = true; });
  nameEl.addEventListener('input', () => {
    if (!idTouched) idEl.value = slugify(nameEl.value);
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    const id = idEl.value.trim();
    const name = nameEl.value.trim();
    const description = descEl.value.trim();
    if (!id || !name) {
      errEl.textContent = 'Name and ID are required.';
      errEl.hidden = false;
      return;
    }
    try {
      await createCourseApi({ id, name, description });
      navigate('/course/' + id);
    } catch (err) {
      errEl.textContent = err.message;
      errEl.hidden = false;
    }
  };
}

async function showCourseScreen(courseId) {
  state.screen = 'course';
  state.courseId = courseId;
  state.currentTopicId = null;
  state.quiz = null;
  document.body.classList.remove('no-sidebar');
  const badge = document.getElementById('modeBadge');
  if (badge) badge.hidden = false;

  // clear any cached lesson/question results from a previous course
  lessonCache.clear();
  questionCountCache.clear();

  try {
    const [topics, tracker, config, starred, flagged, progress] = await Promise.all([
      loadTopics(), loadTracker(), loadConfig(),
      loadStarred().catch(() => []),
      loadFlagged().catch(() => []),
      loadProgress().catch(() => []),
    ]);
    state.topics = topics;
    state.tracker = tracker;
    state.progress = Array.isArray(progress) ? progress : [];
    state.config = {
      masteryThreshold: config.masteryThreshold || 85,
      grades: config.grades || [],
    };
    state.courseMeta = config.course || { id: courseId, name: courseId, description: '' };
    state.starred = new Set((Array.isArray(starred) ? starred : []).map(e => e.qid));
    state.flagged = new Map();
    for (const e of (Array.isArray(flagged) ? flagged : [])) {
      if (e && e.qid && e.status !== 'revised') state.flagged.set(e.qid, e);
    }
  } catch (e) {
    state.courseMeta = { id: courseId, name: courseId, description: '' };
    setBrand(courseId, '');
    document.getElementById('view').innerHTML =
      `<div class="card"><h1 class="card-title">Failed to load course</h1>` +
      `<p class="card-lead">${e.message}</p>` +
      `<div class="cta-row"><button class="btn btn-ghost" data-nav="/">← All courses</button></div></div>`;
    document.querySelectorAll('[data-nav]').forEach(b => {
      b.onclick = (ev) => { ev.preventDefault(); navigate(b.dataset.nav); };
    });
    return;
  }

  // brand: split "Foo — Bar" into title/sub if possible, else course name + id
  const cm = state.courseMeta;
  const parts = (cm.name || cm.id).split(/\s+—\s+/);
  setBrand(parts[0] || cm.id, parts[1] || cm.id);
  renderSidebar();
  renderDashboard();
  mountTodoWidget();
}

// ===== floating todo widget =====
const todo = {
  items: [],
  loaded: false,
};

function renderTodo() {
  const list = document.getElementById('todoList');
  const count = document.getElementById('todoCount');
  list.innerHTML = '';
  const openCount = todo.items.filter(i => !i.done).length;
  if (openCount > 0) {
    count.textContent = openCount;
    count.hidden = false;
  } else {
    count.hidden = true;
  }
  // Open items first, then done items.
  const sorted = todo.items.slice().sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });
  for (const item of sorted) {
    const li = document.createElement('li');
    li.className = 'todo-item' + (item.done ? ' done' : '');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'todo-check';
    check.checked = !!item.done;
    check.onchange = () => toggleTodo(item.id, check.checked);
    const text = document.createElement('span');
    text.className = 'todo-text';
    text.textContent = item.text;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'todo-del';
    del.innerHTML = '&times;';
    del.title = 'Delete';
    del.onclick = () => removeTodo(item.id);
    li.append(check, text, del);
    list.appendChild(li);
  }
}

async function addTodo(text) {
  const trimmed = text.trim();
  if (!trimmed) return;
  try {
    const { entry } = await postTodo({ text: trimmed, topicId: state.currentTopicId || null });
    todo.items.push(entry);
    renderTodo();
  } catch (e) {
    console.warn('addTodo failed', e);
  }
}

async function toggleTodo(id, done) {
  const item = todo.items.find(i => i.id === id);
  if (!item) return;
  const prev = item.done;
  item.done = done;
  renderTodo();
  try {
    await patchTodo(id, { done });
  } catch (e) {
    item.done = prev;
    renderTodo();
  }
}

async function removeTodo(id) {
  const idx = todo.items.findIndex(i => i.id === id);
  if (idx < 0) return;
  const [removed] = todo.items.splice(idx, 1);
  renderTodo();
  try {
    await deleteTodo(id);
  } catch (e) {
    todo.items.splice(idx, 0, removed);
    renderTodo();
  }
}

function setTodoCollapsed(collapsed) {
  const widget = document.getElementById('todoWidget');
  const body = document.getElementById('todoBody');
  const head = document.getElementById('todoHead');
  widget.classList.toggle('collapsed', collapsed);
  body.hidden = collapsed;
  head.setAttribute('aria-expanded', String(!collapsed));
  try { localStorage.setItem('todo-collapsed', collapsed ? '1' : '0'); } catch {}
}

async function mountTodoWidget() {
  const widget = document.getElementById('todoWidget');
  widget.hidden = false;
  const collapsed = (() => {
    try { return localStorage.getItem('todo-collapsed') === '1'; } catch { return false; }
  })();
  setTodoCollapsed(collapsed);
  try {
    const items = await loadTodos();
    todo.items = Array.isArray(items) ? items : [];
  } catch (e) {
    todo.items = [];
  }
  todo.loaded = true;
  renderTodo();
}

function hideTodoWidget() {
  const widget = document.getElementById('todoWidget');
  if (widget) widget.hidden = true;
  todo.items = [];
  todo.loaded = false;
}

function wireTodoWidget() {
  const head = document.getElementById('todoHead');
  const form = document.getElementById('todoForm');
  const input = document.getElementById('todoInput');
  if (!head || !form || !input) return;
  head.onclick = () => {
    const widget = document.getElementById('todoWidget');
    setTodoCollapsed(!widget.classList.contains('collapsed'));
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    const v = input.value;
    input.value = '';
    addTodo(v);
  };
}

// ===== bootstrap =====
function boot() {
  const brand = document.getElementById('brand');
  if (brand) brand.onclick = () => navigate('/');
  document.getElementById('resumeBtn').onclick = () => {
    const id = state.tracker?.lastTopicId || state.tracker?.currentTopicId;
    if (id) openTopic(id);
  };
  const starredBtn = document.getElementById('starredBtn');
  if (starredBtn) starredBtn.onclick = () => startStarredQuiz();
  wireTodoWidget();
  // Flag modal wiring
  const modal = document.getElementById('flagModal');
  if (modal) {
    modal.querySelectorAll('[data-modal-close]').forEach(el => {
      el.onclick = () => closeFlagModal();
    });
    document.getElementById('flagSubmitBtn').onclick = submitFlag;
    document.getElementById('flagRemoveBtn').onclick = removeFlag;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden) closeFlagModal();
    });
  }
  applyRoute();
}

boot();
