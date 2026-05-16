#!/usr/bin/env node
// migrate-add-qids.js — backfill a stable UUID `qid` on every existing question.
//
// The starred / flagged features both reference questions by qid. Without a
// stable id, regenerating a topic's questions silently breaks every star and
// flag pointing into that topic. This migration is idempotent: questions that
// already have a `qid` are left alone.
//
// Usage:
//   node scripts/migrate-add-qids.js              # all courses
//   node scripts/migrate-add-qids.js <courseId>   # one course

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const COURSE_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

function listCourses(coursesDir) {
  if (!fs.existsSync(coursesDir)) return [];
  return fs.readdirSync(coursesDir).filter(name => {
    const full = path.join(coursesDir, name);
    return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, 'course.json'));
  });
}

function migrateCourse(courseRoot) {
  const qDir = path.join(courseRoot, 'data', 'questions');
  if (!fs.existsSync(qDir)) return { files: 0, added: 0, alreadyHad: 0 };
  const files = fs.readdirSync(qDir).filter(f => f.endsWith('.json'));
  let added = 0, alreadyHad = 0, touchedFiles = 0;
  for (const fname of files) {
    const fp = path.join(qDir, fname);
    const text = fs.readFileSync(fp, 'utf8');
    let arr;
    try {
      arr = JSON.parse(text);
    } catch (e) {
      console.error(`  SKIP ${fname}: invalid JSON (${e.message})`);
      continue;
    }
    if (!Array.isArray(arr)) {
      console.error(`  SKIP ${fname}: top-level not an array`);
      continue;
    }
    let mutated = false;
    for (const q of arr) {
      if (!q || typeof q !== 'object') continue;
      if (typeof q.qid === 'string' && q.qid) {
        alreadyHad++;
      } else {
        q.qid = crypto.randomUUID();
        added++;
        mutated = true;
      }
    }
    if (mutated) {
      fs.writeFileSync(fp, JSON.stringify(arr, null, 2) + '\n', 'utf8');
      touchedFiles++;
    }
  }
  return { files: touchedFiles, scanned: files.length, added, alreadyHad };
}

function main(argv) {
  const repoRoot = path.resolve(__dirname, '..');
  const coursesDir = path.join(repoRoot, 'courses');
  let targets;
  if (argv[0]) {
    if (!COURSE_ID_RE.test(argv[0])) {
      console.error(`invalid courseId: ${argv[0]}`);
      process.exit(2);
    }
    const root = path.join(coursesDir, argv[0]);
    if (!fs.existsSync(root)) {
      console.error(`course not found: ${root}`);
      process.exit(2);
    }
    targets = [argv[0]];
  } else {
    targets = listCourses(coursesDir);
    if (targets.length === 0) {
      console.log('No courses found.');
      return;
    }
  }
  for (const id of targets) {
    const courseRoot = path.join(coursesDir, id);
    console.log(`migrate ${id}:`);
    const r = migrateCourse(courseRoot);
    console.log(`  files scanned: ${r.scanned}, files rewritten: ${r.files}, qids added: ${r.added}, already had: ${r.alreadyHad}`);
  }
}

main(process.argv.slice(2));
