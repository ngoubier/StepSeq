/*
 * « Mes motifs » de basse (js/mybass.js) : motif écrit nettoyé, joué par le moteur comme les autres (bassEvents, glissé,
 * notes qui regardent l'accord suivant), départ d'après un motif de l'appli, voyage avec le projet et le brouillon.
 *   node --test tests/mybass.test.js
 */
global.window = global;
global.SS = {};
const store = {};
global.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)) };
['dirt.js', 'dirt-tuning.js', 'sounds.js', 'arp.js', 'project.js', 'harmony.js', 'chords.js', 'melody.js', 'bandsong.js', 'mybass.js', 'wizdraft.js'].forEach((f) => require('../js/' + f));
const test = require('node:test');
const assert = require('assert');
const BS = SS.bandSong;
const MB = SS.myBass;

// la séquence de « Néons en fuite », avec une approche glissée à la fin
const NEON = [[0, 1, 0, 0.92], [2, 1, 12, 0.68], [4, 1, 0, 0.84], [6, 1, 7, 0.7], [8, 1, 0, 0.9], [10, 1, 12, 0.68], [12, 1, 's', 0.74], [14, 1, 'a', 0.7, 'g']];
const DM_AM = [
  { step: 0, len: 16, bar: 0, chord: { rootPc: 2, type: 'min', tok: 'Dm' } },
  { step: 16, len: 16, bar: 1, chord: { rootPc: 9, type: 'min', tok: 'Am' } },
];
const names = (ev) => ev.map((e) => SS.noteNameFr(e.notes[0]));

test('un motif écrit est nettoyé : une note par pas, dans deux mesures, lignes de l’éditeur', () => {
  const m = MB.clean({ id: 'my_a1', name: '  ', notes: [[0, 1, 0, 0.9], [0, 2, 7, 0.9], [3, 0, 10, 2], [40, 1, 0, 0.8], [5, 1, 'u3', 0.7], ['x']] });
  assert.strictEqual(m.name, 'Mon motif');
  assert.strictEqual(m.meter, '4/4');
  assert.deepStrictEqual(m.notes, [[0, 1, 0, 0.9], [3, 1, 's', 1], [5, 1, 'a', 0.7]]);
  assert.strictEqual(MB.clean({ id: 'pas-a-moi', notes: [] }), null);
  assert.strictEqual(MB.barsOf(MB.clean({ id: 'my_b', notes: [[20, 1, 0, 0.8]] })), 2);
});

test('le moteur joue un motif écrit : degrés, septième, approche glissée de l’accord suivant', () => {
  MB.register([{ id: 'my_neon', name: 'Ma séquence néon', notes: NEON }]);
  assert.ok(BS.MODES().bass.includes('my_neon'));
  const ev = BS.bassEvents(DM_AM, 'my_neon', () => 0.5, [2, 4, 5, 7, 9, 10, 0]);
  assert.deepStrictEqual(names(ev).slice(0, 7), ['Ré2', 'Ré3', 'Ré2', 'La2', 'Ré2', 'Ré3', 'Do3']);
  const last = ev.find((e) => e.step === 14);
  assert.ok(last.slide, 'la note d’approche glisse depuis la précédente');
  assert.strictEqual(SS.noteNameFr(last.notes[0]), 'Si♭1', 'approche : la voisine de La dans la gamme, du côté d’où l’on vient');
  // aperçu de l'éditeur : mêmes notes sans rien enregistrer
  assert.deepStrictEqual(names(BS.previewBass(DM_AM, NEON, { tonic: 'D', mode: 'minor' })), names(ev));
  assert.ok(!BS.myBass('my__draft'));
});

test('un motif oublié ne joue plus ; introuvable, la basse joue des croches', () => {
  MB.register([{ id: 'my_tmp', notes: [[0, 16, 0, 0.8]] }]);
  const v = MB.version();
  MB.unregister('my_tmp');
  assert.ok(MB.version() > v);
  assert.ok(!BS.MODES().bass.includes('my_tmp'));
  const ev = BS.bassEvents(DM_AM.slice(0, 1), 'my_tmp', () => 0.5, [2, 4, 5, 7, 9, 10, 0]);
  assert.strictEqual(ev.length, 8, 'des croches');
});

test('départ d’après un motif de l’appli : lettres gardées, motif de code relu', () => {
  assert.deepStrictEqual(MB.fromMotif('sequence8')[6], [12, 1, 's', 0.74]);
  const g = MB.fromMotif('gallop');
  assert.strictEqual(g.length, 12, 'galop : croche et deux doubles, une mesure');
  assert.ok(g.every((x) => x[2] === 0));
  assert.deepStrictEqual(MB.fromMotif('oct').map((x) => x[2]), [0, 12, 0, 12, 0, 12, 0, 12]);
});

test('bibliothèque du navigateur, projet et brouillon', () => {
  MB.keep({ id: 'my_lib', name: 'Gardé', notes: NEON });
  assert.ok(MB.inLibrary('my_lib'));
  MB.forget('my_lib');
  assert.ok(!MB.inLibrary('my_lib'));
  // projet : le motif voyage avec le fichier et revient au moteur au chargement
  const p = SS.newProject();
  p.tracks.push(SS.newTrack({ name: 'Basse', type: 'instrument', family: 'bass', instrument: SS.findFamily('bass').instruments[0].id, follow: { play: 'motif', motif: 'my_neon' } }, p));
  MB.toProject(p, 'my_neon');
  MB.unregister('my_neon');
  const q = SS.normalizeProject(JSON.parse(JSON.stringify(p)));
  assert.deepStrictEqual(Object.keys(q.bassMotifs), ['my_neon']);
  assert.strictEqual(q.tracks[0].follow.motif, 'my_neon');
  assert.ok(BS.myBass('my_neon'), 'chargé : le moteur le connaît');
  // brouillon de l'assistant : rien en plus tant qu'aucun motif n'est écrit (empreinte des anciens brouillons inchangée)
  const empty = SS.wizDraft.pack({ w: { parts: {} } });
  assert.ok(!('myBass' in empty.w));
  const st = SS.wizDraft.pack({ w: { parts: {}, myBass: { my_neon: MB.get('my_neon') } } });
  assert.strictEqual(SS.wizDraft.unpack(st).w.myBass.my_neon.name, 'Ma séquence néon');
});

test('mesure : un motif écrit en 3/4 a 12 pas par mesure', () => {
  MB.register([{ id: 'my_valse', meter: '3/4', notes: [[0, 4, 0, 0.9], [4, 4, 7, 0.7], [8, 4, 12, 0.7], [12, 4, 0, 0.9]] }]);
  assert.strictEqual(BS.motifBar('my_valse'), 12);
  assert.strictEqual(BS.motifBars('my_valse'), 2);
  assert.strictEqual(MB.meterOf(12, 6), '6/8');
});
