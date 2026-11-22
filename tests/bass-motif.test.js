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

// Noire pointée : noire pointée, croche, blanche, toujours la fondamentale de l'accord
bass.follow = SS.FOLLOW.clean({ ...bass.follow, motif: 'pointee' });
const pt = SS.playEvents(p, bass);
assert.deepStrictEqual(pt.filter((e) => e.step < 16).map((e) => [e.step, e.len]), [[0, 6], [6, 2], [8, 8]], 'rythme d’une mesure');
assert.ok(pt.every((e) => e.notes[0] % 12 === [9, 5, 0, 7][Math.floor(e.step / 16)]), 'même note : la fondamentale');
bass.follow = SS.FOLLOW.clean({ ...bass.follow, motif: 'disco16' });

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
// triolets : position en fraction de pas = pas entier + décalage ; motif de deux mesures
e2 = notesOf('walkskip');
const skip = e2.find((e) => e.step === 11);
assert.ok(skip && skip.shift === -0.33 && skip.vel < 0.5, 'walking avec skip : triolet fantôme à 10,67 pas');
e2 = notesOf('montuno');
assert.strictEqual(SS.bandSong.motifBars('montuno'), 2);
assert.ok(!e2.some((e) => e.step === 3) && e2.some((e) => e.step === 19), 'son montuno : la relance seulement dans la 2e mesure');
assert.strictEqual(SS.bandSong.motifBars('rock8'), 1);
// glissé : la note glissée part de la précédente, tenue jusqu'à elle
e2 = notesOf('drill');
const sl = e2.find((e) => e.slide);
const from = e2[e2.indexOf(sl) - 1];
assert.ok(sl && from.slideFrom, 'drill : note glissée et note de départ marquées');
assert.ok(from.step + from.len >= sl.step + (sl.shift || 0), 'drill : la note de départ tient jusqu’au glissé');
assert.ok(!notesOf('rock8').some((e) => e.slide || e.slideFrom), 'sans glissé, rien de marqué');
bass.follow = SS.FOLLOW.clean({ play: 'motif', motif: 'disco16', oct: 2 });

// 3/4 et 6/8 : mesure de 12 pas ; les motifs de 12 pas ne vont qu'en 3/4 et 6/8
{
  const q = SS.newProject();
  q.bars = 4;
  q.timeSig = [3, 4];
  const qs = SS.currentScene(q);
  qs.key = { tonic: 'A', mode: 'minor' };
  qs.grid = SS.normalizeGrid({ chords: [0, 5, 2, 6].map((degree, i) => ({ step: i * 12, len: 12, degree, type: degree === 0 ? 'min' : 'maj' })), initialized: true });
  const qb = SS.newTrack({ name: 'Basse', type: 'instrument', family: 'bass', instrument: SS.findFamily('bass').instruments[0].id, follow: { play: 'motif', motif: 'valsejazz' } }, q);
  q.tracks.push(qb);
  const qe = SS.playEvents(q, qb);
  assert.deepStrictEqual(qe.slice(0, 4).map((e) => e.step), [0, 4, 8, 12], 'valse jazz : une noire par temps, 3 temps par mesure');
  assert.strictEqual(qe[2].notes[0] % 12, 4, 'valse jazz : Mi, demi-ton sous Fa, sur le 3e temps');
  qb.follow = SS.FOLLOW.clean({ play: 'motif', motif: 'valse', oct: 2 });
  assert.deepStrictEqual(SS.playEvents(q, qb).map((e) => e.step), [0, 12, 24, 36], 'valse : une note par mesure de 12 pas');
  qb.follow = SS.FOLLOW.clean({ play: 'motif', motif: 'rock8', oct: 2 });
  assert.ok(SS.playEvents(q, qb).every((e) => e.step % 12 < 12) && SS.playEvents(q, qb).filter((e) => e.step < 12).length === 6, 'motif 4/4 en 3/4 : la fin de la mesure est coupée');
  assert.strictEqual(SS.bandSong.motifBar('ballade68'), 12);
}

// sans accords : silence
sc.grid.chords = [];
assert.strictEqual(SS.playEvents(p, bass).length, 0, 'pas d’accords : la basse se tait');

// ancien réglage sans motif : défaut ; réglage invalide écarté
assert.strictEqual(SS.FOLLOW.clean({ play: 'motif', motif: 'x y', motifs: { a: 5 } }).motif, SS.FOLLOW.MOTIF_DEFAULT);
console.log('OK bass-motif');
