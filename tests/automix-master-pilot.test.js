const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../js/project.js');
require('../js/sounds.js');
require('../js/automix.js');
require('../js/automix-pilot.js');
const A = SS.automix, P = SS.automixPilot;
function fixture() {
  const master = structuredClone(SS.masterParams({}));
  master.volumeDb = 0;
  master.mastering.on = true;
  master.mastering.ceiling = -1;
  master.mix.comp.on = true;
  const sum = { secs: 12, mix: { n: 200, k: -10, prePeak: -6, bands: [...A.CURVES.streaming] }, master: { grMaster: 1.5, plr: 12, i: -14, tp: -1 } };
  return { sum, master };
}
test('Master : pas de geste sans écoute suffisante ou sur le silence', () => {
  const { sum, master } = fixture();
  assert.equal(P.planMaster({ ...sum, secs: 9 }, master), null);
  assert.equal(P.planMaster({ ...sum, mix: { ...sum.mix, k: -Infinity } }, master), null);
  assert.equal(P.planMaster(sum, master), null);
});
test('Master : EQ par demi-dB, borné à 4 dB et désactivable', () => {
  const { sum, master } = fixture();
  sum.mix.bands[8] += 8; sum.mix.bands[9] += 8;
  const d = P.planMaster(sum, master);
  assert.equal(d.module, 'eq');
  assert.equal(d.changes.find((c) => c.path.endsWith('high.g')).to, -0.5);
  master.mix.eq.high.g = -4;
  assert.equal(P.planMaster(sum, master), null);
  master.mix.eq.high.g = 0;
  assert.equal(P.planMaster(sum, master, 'streaming', new Set(['eq'])), null);
  assert.equal(P.planMaster(sum, master, 'streaming', new Set(), { mastereq: false }), null);
});
test('Master : compresseur léger puis relâche la compression excessive', () => {
  const { sum, master } = fixture();
  master.mix.comp.on = false;
  const d = P.planMaster(sum, master);
  assert.equal(d.module, 'comp');
  assert.equal(d.changes.find((c) => c.path === 'mix.comp.ratio').to, 1.5);
  assert.equal(d.changes.find((c) => c.path === 'mix.comp.th').to, -9);
  master.mix.comp.on = true; master.mix.comp.th = -15;
  sum.master.grMaster = 5;
  assert.equal(P.planMaster(sum, master).changes[0].to, -14);
});
test('Master : protection true peak et gain par demi-dB, sans deuxième limiteur', () => {
  const { sum, master } = fixture();
  master.mastering.ceiling = 0;
  let d = P.planMaster(sum, master);
  assert.equal(d.module, 'lim');
  assert.equal(d.changes[0].to, -1);
  assert.ok(d.changes.every((c) => !c.path.startsWith('mix.lim')));
  master.mastering.ceiling = -1;
  sum.master.i = -20;
  d = P.planMaster(sum, master);
  assert.equal(d.changes[0].to - d.changes[0].from, 0.5);
  master.mastering.on = false; master.mix.lim.on = false;
  assert.ok(P.planMaster(sum, master).changes.some((c) => c.path === 'mix.lim.on' && c.to));
});
test('Master : respecte les modules repris à la main et le budget de gestes', () => {
  const { sum, master } = fixture();
  sum.master.grMaster = 6;
  assert.equal(P.planMaster(sum, master, 'streaming', new Set(['comp'])), null);
  assert.equal(P.planMaster(sum, master, 'streaming', new Set(), {}, { comp: 8 }), null);
});
test('Master : ne pousse pas le gain quand les attaques sont déjà écrasées', () => {
  const { sum, master } = fixture();
  sum.master.i = -20; sum.master.plr = 4;
  assert.equal(P.planMaster(sum, master), null);
});
test('Master : desserre un limiteur trop sollicité sans dépasser −1 dB', () => {
  const { sum, master } = fixture();
  master.mastering.on = false; master.mix.lim.on = true; master.mix.lim.ceil = -12;
  sum.master.limGr = 6;
  const d = P.planMaster(sum, master);
  assert.equal(d.module, 'lim');
  assert.equal(d.changes.find((c) => c.path === 'mix.lim.ceil').to, -11);
});
