/*
 * Tests du catalogue Band (js/band-presets.js) — sans navigateur.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../js/library.js');
require('../js/vsco.js');
require('../js/dirt.js');
require('../js/sounds.js');
require('../js/juno.js');
require('../js/band-presets.js');
require('../js/drum-patterns.js');
const B = globalThis.SS.Band;
const SS = globalThis.SS;

test('10 styles + « Créer de zéro » : 10 inspirations pour les 4 premiers, une chanson de démo pour les autres ; identifiants uniques', () => {
  assert.deepEqual(B.STYLES.map((s) => s.id), ['synthwave', 'edm', 'ambient', 'techno', 'pop', 'funk', 'hiphop', 'dnb', 'latin', 'soul', 'zero']);
  assert.ok(B.STYLES.at(-1).blank && !B.STYLES.slice(0, -1).some((s) => s.blank), 'seul « Créer de zéro » est un départ vierge');
  assert.equal(new Set(B.STYLES.flatMap((s) => s.presets.map((p) => p.id))).size, 47);
  B.STYLES.forEach((s, i) => {
    const n = i < 4 ? 10 : 1;
    assert.equal(s.presets.length, n, s.id);
    assert.equal(new Set(s.presets.map((p) => p.id)).size, n);
    if (i >= 4) {
      assert.ok(s.swing >= 0 && s.swing <= 100, s.id + ' : swing');
      // « Créer de zéro » n'a pas de bibliothèque de motifs à lui : l'assistant lui donne celle de la pop
      if (!s.blank) assert.ok(SS.DRUM_PATTERNS[s.id] && SS.DRUM_PATTERNS[s.id].length, s.id + ' : bibliothèque de motifs');
    }
    s.presets.forEach((p) => {
      assert.ok(p.tempo >= 60 && p.tempo <= 200, p.id);
      assert.equal(p.musicians.filter((m) => m.role === 'drums').length, 1, p.id + ' : un batteur');
      assert.equal(new Set(p.musicians.map((m) => m.id)).size, p.musicians.length);
    });
  });
});

test('chaque instrumentiste a 1 instrument phare + 5 conseillés, tous existants et distincts', () => {
  B.STYLES.forEach((s) =>
    s.presets.forEach((p) =>
      p.musicians.filter((m) => !m.kits).forEach((m) => {
        const where = `${p.id}/${m.id}`;
        assert.ok(B.ROLES[m.role], where + ' rôle inconnu');
        assert.equal(m.pick.length, 6, where);
        assert.equal(new Set(m.pick).size, 6, where + ' doublon');
        m.pick.forEach((tok) => {
          if (tok.startsWith('j:')) assert.ok(SS.JUNO_PATCHES.some((x) => x.id === tok.slice(2)), where + ' patch ' + tok);
          else assert.ok(SS.FAMILIES.some((f) => f.instruments.some((i) => i.id === tok)), where + ' instrument ' + tok);
          const o = B.choiceOpts(tok, 'mono');
          assert.ok(B.describe(o).name, where + ' ' + tok);
        });
      })
    )
  );
});

test('batteurs : 6 kits connus, éléments valides, chaque élément se résout', () => {
  const types = SS.DRUM_TYPES.map((t) => t.id);
  B.STYLES.forEach((s) =>
    s.presets.forEach((p) =>
      p.musicians.filter((m) => m.kits).forEach((m) => {
        const where = `${p.id}/${m.id}`;
        assert.equal(m.kits.length, 6, where);
        m.kits.forEach((k) => assert.ok(B.KITS[k], where + ' kit ' + k));
        m.pieces.forEach((pc) => assert.ok(types.includes(pc.split('@')[0]), where + ' ' + pc));
        m.kits.forEach((k) =>
          m.pieces.forEach((pc) => {
            const r = B.pieceOpts(k, pc);
            assert.equal(r.opts.type, 'drum');
            assert.ok(r.opts.source === 'tdm' ? B.kitHas(r.opts.machine, r.opts.sound) : r.opts.bank, where + ' ' + k + ' ' + pc);
          })
        );
      })
    )
  );
});

test('un élément absent du kit est emprunté à un kit de secours', () => {
  const r = B.pieceOpts('RolandTR606', 'cp');
  assert.equal(r.borrowed, true);
  assert.equal(r.opts.machine, 'RolandTR808');
  const d = B.pieceOpts('dirt808', 'bd');
  assert.deepEqual([d.opts.source, d.opts.bank, d.borrowed], ['dirt', '808bd', false]);
});

test('kits acoustiques (VCSL, General MIDI) : le kit de base est complet, rien n’est emprunté à la TR-808', () => {
  ['vcsl', 'gm'].forEach((k) =>
    ['bd', 'sd', 'rim', 'hh', 'oh', 'cp', 'cr', 'rd', 'lt', 'mt', 'ht'].forEach((pc) => {
      const r = B.pieceOpts(k, pc);
      assert.equal(r.borrowed, false, k + ' ' + pc);
      assert.equal(r.opts.source, k, k + ' ' + pc);
      assert.equal(B.kitLabelOf(r.opts), B.KITS[k].label, k + ' ' + pc + ' : nom du kit, pas « Roland TR-808 »');
    })
  );
  // « banque#n » : l'échantillon choisi dans la banque (caisse claire timbre en place, charleston ouvert)
  assert.deepEqual([B.pieceOpts('vcsl', 'sd').opts.bank, B.pieceOpts('vcsl', 'sd').opts.variant], ['snare_modern', 14]);
  assert.deepEqual([B.pieceOpts('vcsl', 'oh').opts.bank, B.pieceOpts('vcsl', 'oh').opts.variant], ['hihat', 13]);
  assert.equal(B.kitLabelOf({ source: 'tdm', machine: 'RolandTR909' }), 'Roland TR-909');
});

test('choix → options de piste compatibles avec SS.newTrack', () => {
  const j = B.choiceOpts('j:A48', 'mono');
  assert.deepEqual([j.type, j.analog, j.patch], ['synth', 'juno106', 'A48']);
  const i = B.choiceOpts('dirt_moog', 'mono');
  assert.deepEqual([i.type, i.family, i.instrument], ['instrument', 'bass', 'dirt_moog']);
});

test('la marque Band d’une piste est gardée à l’enregistrement / l’ouverture, et nettoyée', () => {
  require('../js/arp.js');
  require('../js/project.js');
  const p = SS.newProject();
  const opts = { ...B.choiceOpts('syn_moogbass', 'mono'), name: 'Basse', color: '#3fcf3f' };
  const band = SS.newTrack(opts, p);
  band.band = { style: 'synthwave', preset: 'nightcall', musician: 'bass', key: 'bass', extra: 'x'.repeat(10) };
  const user = SS.newTrack(opts, p);
  p.tracks.push(band, user);
  const back = SS.normalizeProject(JSON.parse(SS.serialize(p)));
  assert.deepEqual(back.tracks[0].band, { style: 'synthwave', preset: 'nightcall', musician: 'bass', key: 'bass' });
  assert.equal(back.tracks[1].band, undefined);
});
