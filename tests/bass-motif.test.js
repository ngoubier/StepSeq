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

// motifs courants ajoutés (nov. 2026) sur Am F C G : anticipation liée, approche chromatique, montée vers l'accord
const notesOf = (id) => {
  bass.follow = SS.FOLLOW.clean({ play: 'motif', motif: id, oct: 2 });
  return SS.playEvents(p, bass);
};
let e2 = notesOf('anticip');
const push = e2.find((e) => e.step === 14);
assert.strictEqual(push.notes[0] % 12, 5, 'anticipation : Fa dès le « et » du 4 de la mesure de La m');
assert.strictEqual(push.len, 4, 'anticipation : la note se lie au 1 suivant');
assert.ok(!e2.some((e) => e.step === 16), 'anticipation : pas de nouvelle attaque sur le 1');
e2 = notesOf('chroma');
assert.strictEqual(e2.find((e) => e.step === 14).notes[0] % 12, 4, 'approche chromatique : Mi, demi-ton sous Fa');
e2 = notesOf('walkup');
assert.deepStrictEqual(e2.filter((e) => e.step >= 8 && e.step < 16).map((e) => e.notes[0] % 12), [0, 2, 4], 'montée vers Fa : Do, Ré, Mi');
['boomchick', 'chacha', 'cumbia', 'baiao', 'twostep'].forEach((id) => assert.ok(notesOf(id).length >= 8, id));
assert.ok(['anticip', 'walkup', 'chroma', 'boomchick', 'chacha', 'cumbia', 'baiao', 'twostep'].every((id) => SS.bandSong.BASS_NEW.some((c) => c[0] === id)));
bass.follow = SS.FOLLOW.clean({ play: 'motif', motif: 'disco16', oct: 2 });

// sans accords : silence
sc.grid.chords = [];
assert.strictEqual(SS.playEvents(p, bass).length, 0, 'pas d’accords : la basse se tait');

// ancien réglage sans motif : défaut ; réglage invalide écarté
assert.strictEqual(SS.FOLLOW.clean({ play: 'motif', motif: 'x y', motifs: { a: 5 } }).motif, SS.FOLLOW.MOTIF_DEFAULT);
console.log('OK bass-motif');
