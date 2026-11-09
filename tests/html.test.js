/*
 * index.html : chaque id est unique (deux éléments avec le même id : le code n'en trouve qu'un).
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('index.html : pas deux éléments avec le même id', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const seen = new Map();
  for (const m of html.matchAll(/\sid="([^"]+)"/g)) seen.set(m[1], (seen.get(m[1]) || 0) + 1);
  const dup = [...seen].filter(([, n]) => n > 1).map(([id]) => id);
  assert.deepEqual(dup, [], 'ids en double : ' + dup.join(', '));
});
