/*
 * Musicien Ambient de l'assistant « Nouvelle chanson » : type du groupe (js/bandgroup.js), courbes de présence et de hasard
 * par scène (js/bandsong.js, ambientCurves / ambientApply), piste générative sans notes dans SS.bandSong.build.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['dirt.js', 'dirt-tuning.js', 'sounds.js', 'harmony.js', 'project.js', 'ambient.js', 'band-presets.js', 'bandgroup.js', 'band-songs.js', 'drum-patterns.js', 'arp.js', 'motifs.js', 'melody.js', 'bandsong.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const BG = SS.bandGroup;
const BS = SS.bandSong;

test('type ambient : un musicien ajouté qui porte son module, relu du brouillon', () => {
  assert.ok(BG.TYPES.includes('ambient'));
  assert.equal(BG.typeOfRole('ambient'), 'ambient');
  assert.deepEqual(BG.recommended('ambient', 'ambient', 'airports').pick, ['jardin', 'paysage', 'fresque']);
  const p = SS.Band.STYLES.find((s) => s.id === 'ambient').presets[0];
  const g = BG.defaultGroup(p);
  const rec = BG.add(g, 'ambient', { name: 'Paysage', ms: { on: true, mod: 'paysage', amb: { rand: 0.3, presence: [1, 1] } } });
  assert.equal(rec.type, 'ambient');
  const back = BG.clean(JSON.parse(JSON.stringify(g)), p);
  const r = back.list.find((x) => x.id === rec.id);
  assert.equal(r.ms.mod, 'paysage');
  assert.equal(r.ms.amb.rand, 0.3);
  assert.equal(r.ms.amb.presence, undefined, 'la présence vient des scènes, pas des réglages du module');
  // module inconnu : Jardin
  assert.equal(BG.clean({ nextId: 2, list: [...g.list.filter((x) => x.base), { id: 'x9', base: null, name: 'A', type: 'ambient', ms: { mod: 'xxx' } }] }, p).list.at(-1).ms.mod, 'jardin');
});

test('piste générative de la grille → musicien Ambient : module, réglages, courbe dessinée et envoi Cosmos repris', () => {
  const opts = { type: 'instrument', family: 'ambient', instrument: 'fresque', keep: { ambient: { follow: false, presence: [0, 0.5, 1], rands: [0.1] } } };
  const ms = BG.msFromGrid({ type: 'ambient', opts, drawn: true, space: 0.7 }, null, 'ambient', 'airports');
  assert.equal(ms.mod, 'fresque');
  assert.equal(ms.amb.follow, false);
  assert.equal(ms.amb.rands, undefined);
  assert.deepEqual(ms.drawn, [0, 0.5, 1]);
  assert.equal(ms.space, 0.7);
  assert.equal(BG.msFromGrid({ type: 'ambient', opts, drawn: false }, null, 'ambient', 'airports').drawn, undefined, 'courbe posée par l’assistant : refaite depuis les scènes');
});

const SPEC = { key: 'C', form: 'intro theme*2 outro', sections: { intro: { bars: 4 }, theme: { bars: 8 }, outro: { bars: 4 } } };

test('ambientCurves : présence et mouvement de chaque scène sur toute la chanson, 0 où il se tait', () => {
  const plain = BS.ambientCurves(SPEC, null, 'x1:ambient', { n: 25 });
  assert.equal(plain.presence.length, 25);
  assert.ok(plain.presence.every((v) => v === BS.AMB_LEVELS.mid), 'sans réglage : Présent partout');
  assert.equal(plain.rands, null, 'sans hasard par scène : celui du module');
  const parts = {
    intro: { inst: { 'x1:ambient': { amb: { p: 'far', mv: 'up' } } } },
    theme: { inst: { 'x1:ambient': { amb: { p: 'front', r: 0.9 } } } },
    outro: { inst: { 'x1:ambient': { off: true } } },
  };
  const c = BS.ambientCurves(SPEC, parts, 'x1:ambient', { n: 25 });
  // 24 mesures : intro 0–4, thème 4–20 (deux fois), outro 20–24 ; un point par mesure
  assert.ok(c.presence[0] < c.presence[3] && c.presence[3] <= BS.AMB_LEVELS.far, 'Intro lointaine qui monte');
  assert.equal(c.presence[10], 1, 'Thème au premier plan');
  assert.equal(c.presence[24], 0, 'Outro : il se tait');
  assert.equal(c.rands[10], 0.9);
  assert.equal(c.rands[0], null, 'scène sans hasard : celui du module');
  const t = { ambient: { rand: 0.2 } };
  assert.equal(BS.ambientApply(t, c), true);
  assert.equal(t.ambient.rands[0], 0.2);
  assert.equal(t.ambient.rands[10], 0.9);
  const drawn = { ambient: { presence: [0.4, 0.4] } };
  assert.equal(BS.ambientApply(drawn, c), false, 'courbe dessinée : gardée');
  assert.deepEqual(drawn.ambient.presence, [0.4, 0.4]);
});

test('build : le musicien Ambient n’écrit pas de notes et reçoit ses courbes ; les autres pistes ne changent pas', () => {
  const p = SS.Band.STYLES.find((s) => s.id === 'ambient').presets[0];
  const spec = SS.BandSongs[p.id];
  const base = p.musicians.filter((m) => !m.optional && !m.kits && !m.amb).map((m) => ({ id: m.id, type: 'instrument', band: { style: 'ambient', preset: p.id, musician: m.id, key: m.role } }));
  const amb = { id: 'x1:ambient', type: 'instrument', band: { style: 'ambient', preset: p.id, musician: 'x1', key: 'ambient', label: 'Jardin' } };
  const a = BS.build(spec, p.id, base);
  const b = BS.build(spec, p.id, [...base, amb]);
  assert.equal(JSON.stringify(a.scenes.map((sc) => base.map((t) => sc.data[t.id]))), JSON.stringify(b.scenes.map((sc) => base.map((t) => sc.data[t.id]))));
  assert.ok(b.scenes.every((sc) => sc.data[amb.id] && sc.data[amb.id].events.length === 0));
  assert.equal(b.ambient[amb.id].presence.length, SS.ambient.PN);
  assert.equal(a.ambient, undefined);
});

test('les modèles du style Ambient ont un musicien Ambient d’office', () => {
  const st = SS.Band.STYLES.find((s) => s.id === 'ambient');
  st.presets.forEach((p) => {
    const mu = p.musicians.find((m) => m.role === 'ambient');
    assert.ok(mu && mu.amb && !mu.optional && BG.AMB_MODS.includes(mu.pick[0]), p.id);
    assert.ok(BG.defaultGroup(p).list.some((r) => r.base === mu.id), p.id + ' : dans le groupe par défaut');
  });
});
