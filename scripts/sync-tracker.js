#!/usr/bin/env node
// sync-tracker.js — ensure courses/<id>/data/tracker.json has an empty
// progress entry for every topic in courses/<id>/data/topics.json.
//
// Idempotent: existing tracker entries are preserved. Safe to re-run any
// time topics.json is edited. Used by DECOMPOSE_COURSE.md (Step 6) and
// can be re-run by hand whenever the course structure changes.
//
// Usage:
//   node scripts/sync-tracker.js <courseId>

'use strict';

const fs = require('fs');
const path = require('path');

const COURSE_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const TOPIC_ID_RE = /^\d+\.\d+$/;

function emptyTopic() {
  return {
    started: null,
    finished: null,
    studyCompleted: false,
    preCheckResults: [],
    quizPasses: [],
    mastered: null,
  };
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function main(argv) {
  const courseId = argv[0];
  if (!courseId) {
    console.error('Usage: node scripts/sync-tracker.js <courseId>');
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
    process.exit(1);
  }

  const topicsFile = path.join(courseRoot, 'data', 'topics.json');
  const trackerFile = path.join(courseRoot, 'data', 'tracker.json');

  if (!fs.existsSync(topicsFile)) {
    console.error(`topics.json missing: ${topicsFile}`);
    process.exit(1);
  }

  let topics;
  try {
    topics = readJson(topicsFile);
  } catch (e) {
    console.error(`topics.json invalid JSON: ${e.message}`);
    process.exit(1);
  }

  const chapters = Array.isArray(topics.chapters) ? topics.chapters : [];
  const expectedIds = [];
  const invalidIds = [];
  for (const ch of chapters) {
    if (!Array.isArray(ch.topics)) continue;
    for (const t of ch.topics) {
      if (!t || typeof t.id !== 'string') continue;
      if (TOPIC_ID_RE.test(t.id)) expectedIds.push(t.id);
      else invalidIds.push(t.id);
    }
  }

  if (invalidIds.length > 0) {
    console.error(`topics.json contains topic ids that don't match ${TOPIC_ID_RE}:`);
    for (const id of invalidIds) console.error('  ' + id);
    process.exit(1);
  }

  let tracker;
  if (fs.existsSync(trackerFile)) {
    try {
      tracker = readJson(trackerFile);
    } catch (e) {
      console.error(`tracker.json exists but invalid JSON: ${e.message}`);
      process.exit(1);
    }
  } else {
    tracker = { topics: {}, lastTopicId: null, lastUpdated: null };
  }
  if (!tracker.topics || typeof tracker.topics !== 'object') tracker.topics = {};

  let added = 0;
  for (const id of expectedIds) {
    if (!tracker.topics[id]) {
      tracker.topics[id] = emptyTopic();
      added++;
    }
  }

  // Topics that exist in tracker but not in topics.json — leave them alone
  // (the user may have removed a topic, but their quiz history shouldn't be
  // silently deleted). Just report.
  const stale = Object.keys(tracker.topics).filter(id => !expectedIds.includes(id));

  tracker.lastUpdated = new Date().toISOString();
  writeJson(trackerFile, tracker);

  console.log(`sync-tracker: ${courseId}`);
  console.log(`  topics in topics.json:  ${expectedIds.length}`);
  console.log(`  added to tracker:       ${added}`);
  console.log(`  preserved (already there): ${expectedIds.length - added}`);
  if (stale.length) {
    console.log(`  stale (in tracker, not in topics.json): ${stale.length} -> ${stale.join(', ')}`);
    console.log(`  (left untouched — remove manually if intentional)`);
  }
  console.log(`  tracker.json updated.`);
}

main(process.argv.slice(2));
