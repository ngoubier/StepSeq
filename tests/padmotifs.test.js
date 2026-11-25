/*
 * Motifs de nappe de Nouvelle chanson : catalogue js/padmotifs.js, moteur js/bandsong.js (chordEvents, PAD_NEW,
 * padFxLanes) ; chaque motif joue des notes, ceux à mouvement de son écrivent leur automation dans la scène.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['dirt.js', 'dirt-tuning.js', 'sounds.js', 'harmony.js', 'project.js', 'band-presets.js', 'band-songs.js', 'drum-patterns.js', 'arp.js', 'motifs.js', 'melody.js', 'bandsong.js', 'motifpicker.js', 'padmotifs.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const B = SS.bandSong;
const P = SS.padMotifs;

const TR = ['bass', 'pad'].map((r) => ({ id: r, type: 'instrument', category: 'chord', band: { key: r } }));
const SPEC = { key: 'C minor', groove: 'synthpop', form: 'a', sections: { a: { bars: 4, chords: 'i | VI | III | VII', bass: '8', pad: 'sustain' } } };
const padOf = (mode) => B.build(SPEC, 'test', TR, { parts: { a: { pad: { mode } } } }).scenes[0].data.pad;
// Cm sur une mesure, puis G7 et A♭ sur une demi-mesure chacun
const SP = [
  { step: 0, len: 16, chord: { rootPc: 0, type: 'min' } },
  { step: 16, len: 8, chord: { rootPc: 7, type: '7' } },
  { step: 24, len: 8, chord: { rootPc: 8, type: 'maj' } },
];
const KP = [0, 2, 3, 5, 7, 8, 10];

test('chaque motif du catalogue est un mode de nappe du moteur et joue des notes propres', () => {
  assert.equal(new Set(P.all()).size, P.MODES.length);
  for (const id of P.all()) {
    const ev = B.chordEvents(SP, id, () => 0.5, { lo: 53, hi: 76, kp: KP });
    assert.ok(ev.length > 0, id);
    ev.forEach((e) => {
      assert.ok(e.len > 0 && e.step >= 0 && e.step + e.len <= 32, `${id} : durée`);
      assert.ok(e.notes.length > 0 && e.notes.every((n) => Number.isInteger(n) && n >= 28 && n <= 96), `${id} : notes ${e.notes}`);
    });
    assert.ok(padOf(id).events.length > 0, `${id} : joué dans la chanson`);
    assert.ok(P.GROUPS.some((g) => g[2].includes(id)) && ['tenue', 'rythme', 'mouv'].includes(P.kindOf(id)), `${id} : rangé`);
  }
});

test('degrés : septième et neuvième prises dans la gamme, accord tenu repris au changement d’accord', () => {
  const at = (id, s) => B.chordEvents(SP, id, () => 0.5, { lo: 53, kp: KP }).filter((e) => e.step === s);
  // A♭ en Do mineur : septième majeure (sol), pas la septième mineure (sol♭)
  const ab = at('deep', 26)[0];
  assert.ok(ab && ab.notes.some((n) => n % 12 === 7) && !ab.notes.some((n) => n % 12 === 6), `A♭ : ${ab && ab.notes}`);
  // G7 : neuvième mineure (la♭) dans la gamme de Do mineur
  assert.ok(at('add9', 16)[0].notes.some((n) => n % 12 === 8));
  // ligne descendante sur Cm : do, si, si♭, la
  assert.deepEqual(at('cliche', 0).concat(at('cliche', 4), at('cliche', 8), at('cliche', 12)).filter((e) => e.notes.length === 1).map((e) => e.notes[0] % 12), [0, 11, 10, 9]);
});

test('pompe, filtre et souffle inversé : automation de la scène ; les autres motifs n’en ajoutent pas', () => {
  const pump = padOf('pump').auto.volume;
  assert.equal(pump[0], 0.18);
  assert.equal(pump[3], 1);
  assert.equal(pump[4], 0.18);
  assert.equal(Object.keys(pump).length, 4 * 16);
  const filt = padOf('filt').auto.filter;
  assert.ok(filt[0] < filt[15] && filt[16] < filt[15]);
  const rev = padOf('rev').auto.volume;
  assert.ok(rev[0] < 0.1 && rev[15] === 1 && rev[16] < 0.1);
  assert.equal((padOf('sustain').auto || {}).volume, undefined);
  assert.equal(B.padFxLanes('stabs', 4), null);
});
