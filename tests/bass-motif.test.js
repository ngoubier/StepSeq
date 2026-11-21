/*
 * Motif de basse dans la Grille (js/chords.js, follow.play 'motif') : la piste joue un motif de Nouvelle chanson
 * (js/bandsong.js, bassEvents) sur la piste Accords ; motif par scène ; hauteur ; réglage nettoyé.
 *   node tests/bass-motif.test.js
 */
global.window = global;
global.SS = {};
['dirt.js', 'dirt-tuning.js', 'sounds.js', 'arp.js', 'project.js', 'harmony.js', 'chords.js', 'melody.js', 'bandsong.js'].forEach((f) => require('../js/' + f));
const assert = require('assert');

const p = SS.newProject();
p.bars = 4;
const sc = SS.currentScene(p);
sc.key = { tonic: 'A', mode: 'minor' };
sc.grid = SS.normalizeGrid({ chords: [0, 5, 2, 6].map((degree, i) => ({ step: i * 16, len: 16, degree, type: degree === 0 ? 'min' : 'maj' })), initialized: true });
const bass = SS.newTrack({ name: 'Basse', type: 'instrument', family: 'bass', instrument: SS.findFamily('bass').instruments[0].id, follow: { play: 'motif', motif: 'disco16' } }, p);
p.tracks.push(bass);

assert.deepStrictEqual(bass.follow, { play: 'motif', motif: 'disco16', oct: 2 }, 'réglage nettoyé, hauteur C2 par défaut');
assert.ok(SS.playsMotif(bass) && SS.followsGhost(bass), 'piste en motif = affichage fantôme');
const ev = SS.playEvents(p, bass);
assert.ok(ev.length > 30, `disco syncopée : ${ev.length} notes`);
assert.strictEqual(ev[0].notes[0], 33, 'première note : La1 (fondamentale de Am)');
assert.ok(ev.some((e) => e.step >= 16 && e.step < 32 && e.notes[0] % 12 === 5), 'mesure 2 sur Fa');
assert.deepStrictEqual(SS.playEvents(p, bass), ev, 'même motif, mêmes notes (vélocités stables)');

bass.follow = SS.FOLLOW.clean({ ...bass.follow, oct: 3 });
assert.strictEqual(SS.playEvents(p, bass)[0].notes[0], 45, 'hauteur C3 : une octave au-dessus');

// motif par scène
bass.follow = SS.FOLLOW.clean({ ...bass.follow, oct: 2, motifs: { [sc.id]: 'whole' } });
assert.strictEqual(SS.bassMotifOf(bass, sc), 'whole');
assert.strictEqual(SS.playEvents(p, bass).length, 4, 'Tenue dans cette scène : une note par accord');

// sans accords : silence
sc.grid.chords = [];
assert.strictEqual(SS.playEvents(p, bass).length, 0, 'pas d’accords : la basse se tait');

// ancien réglage sans motif : défaut ; réglage invalide écarté
assert.strictEqual(SS.FOLLOW.clean({ play: 'motif', motif: 'x y', motifs: { a: 5 } }).motif, SS.FOLLOW.MOTIF_DEFAULT);
console.log('OK bass-motif');
