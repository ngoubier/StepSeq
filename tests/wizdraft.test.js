/*
 * Brouillon de l'assistant (js/wizdraft.js) : mise en forme JSON de l'état, valeurs par défaut, versions — sans navigateur.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['library.js', 'dirt.js', 'sounds.js', 'harmony.js', 'arp.js', 'project.js', 'wizdraft.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const D = SS.wizDraft;

const live = () => ({
  mode: 'create', styleId: 'synthwave', presetId: 'p1', cover: null, cache: { p1: { bass: { on: true, pick: 2, custom: null } } },
  hide: new Set(['a:b']), mel: { character: 'inspiration', notes: 3 }, accOpen: true, tracksOpen: false,
  w: {
    step: 7, seen: new Set([1, 2, 7]), seed: 4, off: new Set(['x']), mute: new Set(['m']), solo: new Set(), vol: new Map([['bass', -3], ['pad', 0]]),
    mix: { tracks: { bass: { vol: 2 } }, own: {} }, mixScope: 'song', mixOpen: null, mixTab: 'eq', hscene: 's2', hsec: 'chorus', tempo: 123, tempoFor: 'p1',
    plans: {}, pseeds: {}, keys: { verse: { tonic: 2 } }, grids: { verse: [1, 2] }, emos: {}, chars: {}, parts: { verse: { inst: { bass: { mode: 'octave' } } } }, kinds: { pad: 'arp' },
    melPanel: { 'lead|verse': { seed: 9, res: { ok: true } } }, melSec: null, form: [{ id: 'verse', repeat: 2 }], secs: { verse: { bars: 8 } }, skey: { tonic: 5, mode: 'minor' },
    snap: 'beat', gsel: 1, efilter: 0, fresh: true, sig: 'à ne pas garder', res: { gros: 'cache' }, insp: { fenetre: true }, mel: {}, melMount: true,
  },
});

test('pack : JSON pur, Sets et Map en listes, caches et fenêtres exclus', () => {
  const st = D.pack(live());
  assert.deepEqual(JSON.parse(JSON.stringify(st)), st);
  assert.deepEqual(st.w.seen, [1, 2, 7]);
  assert.deepEqual(st.w.vol, [['bass', -3]]); // un volume nul n'est pas un réglage
  assert.equal(st.w.sig, undefined);
  assert.equal(st.w.res, undefined);
  assert.equal(st.w.insp, undefined);
  assert.equal(st.w.melMount, undefined);
});

test('pack puis unpack rend le même état', () => {
  const src = live();
  const x = D.unpack(D.pack(src));
  assert.equal(x.w.step, 7);
  assert.deepEqual([...x.w.seen], [1, 2, 7]);
  assert.equal(x.w.vol.get('bass'), -3);
  assert.deepEqual(x.w.parts, src.w.parts);
  assert.deepEqual(x.w.melPanel, src.w.melPanel);
  assert.deepEqual(x.w.mix, src.w.mix);
  assert.deepEqual(x.cache, src.cache);
  assert.ok(x.hide.has('a:b') && x.accOpen && x.w.fresh && x.w.tempo === 123 && x.w.hscene === 's2' && x.w.gsel === 1);
  assert.deepEqual(D.pack({ ...x, w: x.w }), D.pack(src)); // stable
});

test('pack copie : modifier l\'état vivant ne touche pas le brouillon', () => {
  const src = live();
  const st = D.pack(src);
  src.w.parts.verse.inst.bass.mode = 'autre';
  src.w.seen.add(9);
  assert.equal(st.w.parts.verse.inst.bass.mode, 'octave');
  assert.ok(!st.w.seen.includes(9));
});

test('unpack : champs manquants ou de mauvais type, valeurs par défaut', () => {
  const x = D.unpack({ styleId: 3, w: { step: 'x', seen: 'non', vol: [['a', 'b'], 7, ['ok', 1]], parts: [], form: 'non', gsel: 1.5, tempo: NaN } });
  assert.equal(x.styleId, null);
  assert.equal(x.mode, 'create');
  assert.equal(x.w.step, 1);
  assert.deepEqual([...x.w.seen], [1]);
  assert.deepEqual([...x.w.vol], [['ok', 1]]);
  assert.deepEqual(x.w.parts, {});
  assert.equal(x.w.form, null);
  assert.equal(x.w.gsel, null);
  assert.equal(x.w.tempo, null);
  assert.equal(x.w.mixTab, 'eq');
  assert.equal(x.w.snap, 'beat');
  assert.equal(D.unpack(null), null);
  assert.equal(D.unpack('x'), null);
  assert.ok(D.unpack({}));
});

test('clean : version et enveloppe', () => {
  assert.equal(D.clean(null), null);
  assert.equal(D.clean({ v: 1 }), null);
  assert.equal(D.clean({ v: 99, state: {} }), null); // écrit par une version plus récente : ignoré
  const d = D.clean({ v: 1, savedAt: 5, createdAt: 9, state: { a: 1 }, extra: 'x' });
  assert.deepEqual(d, { v: 1, savedAt: 5, createdAt: 9, state: { a: 1 } });
  assert.equal(D.clean({ state: {} }).v, 1);
  assert.equal('createdAt' in D.clean({ v: 1, state: {} }), false);
});

test('le projet garde le brouillon (normalizeProject, serialize) et l\'historique ne le suit pas', () => {
  const p = SS.newProject();
  p.wizard = { v: 1, savedAt: 1, createdAt: 2, state: D.pack(live()) };
  const back = SS.normalizeProject(JSON.parse(SS.serialize(p)));
  assert.deepEqual(back.wizard, p.wizard);
  assert.equal('wizard' in JSON.parse(SS.serialize(p, { wizard: false })), false);
  assert.equal(SS.normalizeProject(JSON.parse(JSON.stringify({ ...p, wizard: { v: 7, state: {} } }))).wizard, undefined);
  assert.equal(SS.normalizeProject(JSON.parse(SS.serialize(SS.newProject()))).wizard, undefined);
});
