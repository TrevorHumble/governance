// scripts/check-banned-words-core.js
// Pure banned-word matching for the banned-words CI gate; no process, filesystem, or git access
// here. Both lists are stored base64-encoded and decoded at load, so no listed word appears as a
// literal in this repo's source and the gate does not trip on itself.
'use strict';

const decode = (list) => list.map((s) => Buffer.from(s, 'base64').toString('utf8'));

const ANYWHERE_PHRASES = decode(['aG9zdGlsZQ==', 'YXNzaG9sZQ==', 'b3dlIHRoZSB3b3JrIG5vdGhpbmc=']);

const WHOLE_WORDS = decode([
  'ZWxlZ2FudGx5',
  'cm9idXN0bHk=',
  'c2VhbWxlc3NseQ==',
  'Y29tcHJlaGVuc2l2ZWx5',
  'aG9saXN0aWNhbGx5',
  'bm90YWJseQ==',
  'aW1wb3J0YW50bHk=',
  'bGV2ZXJhZ2Vz',
  'Y3V0dGluZy1lZGdl',
  'Z2FtZS1jaGFuZ2luZw==',
  'cG93ZXJmdWw=',
  'aW5ub3ZhdGl2ZQ==',
]);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Spaces inside a phrase match any run of whitespace, including a line break.
const phrasePattern = (phrase) =>
  new RegExp(phrase.split(' ').map(escapeRegex).join('\\s+'), 'giu');

const wordPattern = (word) => new RegExp(`(?<!\\p{L})${escapeRegex(word)}(?!\\p{L})`, 'giu');

const ANYWHERE_PATTERNS = ANYWHERE_PHRASES.map((word) => ({ word, re: phrasePattern(word) }));
const WHOLE_WORD_PATTERNS = WHOLE_WORDS.map((word) => ({ word, re: wordPattern(word) }));

function lineOf(text, index) {
  let line = 1;
  for (let i = text.indexOf('\n'); i !== -1 && i < index; i = text.indexOf('\n', i + 1)) line += 1;
  return line;
}

// files: [{ path, text, scope }], scope 'all' (phrases and filler) or 'phrases' (phrases only).
// Returns [{ path, line, word }] sorted by path, then line.
function findBannedWords(files) {
  const hits = [];
  for (const { path, text, scope } of files) {
    const patterns =
      scope === 'all' ? [...ANYWHERE_PATTERNS, ...WHOLE_WORD_PATTERNS] : ANYWHERE_PATTERNS;
    for (const { word, re } of patterns) {
      for (const m of text.matchAll(re)) hits.push({ path, line: lineOf(text, m.index), word });
    }
  }
  return hits.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line));
}

module.exports = { findBannedWords };
