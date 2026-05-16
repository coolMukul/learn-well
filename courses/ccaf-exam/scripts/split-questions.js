// One-time migration: data/questions.json -> data/questions/<taskId>.json
// Run with: node scripts/split-questions.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'questions.json');
const OUT_DIR = path.join(ROOT, 'data', 'questions');
const TASK_RE = /^\d+\.\d+$/;

const all = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const buckets = {};
for (const q of all) {
  const taskTags = (q.topics || []).filter(t => TASK_RE.test(t));
  const key = taskTags.length === 1 ? taskTags[0] : '_unassigned';
  (buckets[key] ||= []).push(q);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const summary = [];
for (const [key, list] of Object.entries(buckets).sort()) {
  const file = path.join(OUT_DIR, `${key}.json`);
  fs.writeFileSync(file, JSON.stringify(list, null, 2) + '\n', 'utf8');
  summary.push(`${key}: ${list.length}`);
}
console.log(`Wrote ${Object.keys(buckets).length} files to ${OUT_DIR}`);
console.log(summary.join('\n'));
