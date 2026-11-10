const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function load(files) {
  const c = vm.createContext({ window: null });
  c.window = c;
  for (const f of files) vm.runInContext(fs.readFileSync(f, 'utf8'), c);
  return c.SS;
}
test('Système : consulter les mesures ne crée pas de contexte audio', () => {
  const SS = load(['js/audio.js']);
  const d = SS.audio.diagnostics();
  assert.equal(d.context, null);
  assert.equal(d.bufferBytes, 0);
  assert.equal(d.scheduling.lateSteps, 0);
  d.scheduling.lateSteps = 100;
  assert.equal(SS.audio.diagnostics().scheduling.lateSteps, 0, 'le relevé ne permet pas de modifier les compteurs');
});
test('Système : distingue les indices de saturation, retards et pression JS', () => {
  const S = load(['js/systempanel.js']).systemPanel;
  const d = { playing: true, scheduling: { lateSteps: 0 }, loadingAssets: 0, failedAssets: 0 };
  assert.match(S.warnings(d).join(), /Aucune anomalie dans les mesures disponibles/);
  d.scheduling = { lateSteps: 3, maxLateMs: 180 };
  d.output = { loudness: { tp: 1.3 } };
  const text = S.warnings(d, { heapRatio: 0.9, lag: 120 }).join('\n');
  assert.match(text, /3 pas programmés en retard/);
  assert.match(text, /risque de saturation/);
  assert.match(text, /tas JavaScript approche/);
  assert.match(text, /interface a subi des blocages/);
  assert.doesNotMatch(text, /RAM (totale|libre).*\d+ %/);
});
