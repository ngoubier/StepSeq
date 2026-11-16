/*
 * Profils mélodiques par émotion (js/melody-profiles.js) et leur effet sur les compositeurs de mélodie
 * (js/melody.js pour Key, js/bandsong.js pour Band).
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['dirt.js', 'dirt-tuning.js', 'sounds.js', 'harmony.js', 'project.js', 'emotions.js', 'melody-profiles.js', 'melody.js', 'band-presets.js', 'band-songs.js', 'bandsong.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const M = SS.melody;
const AD = { tonic: 'A', mode: 'dorian' };
const HOPEFUL = 'Am | Em | D | D | Am | Em | D | D';
const compose = (emo, extra = {}) =>
  M.compose({ grid: HOPEFUL, source: 'meter', fitGrid: true, key: AD, profile: emo ? SS.resolveMelodyProfile(emo, extra.over || {}, AD) : null, seed: 3, timeSig: [4, 4], complexity: 'balanced', ...extra });
/** Notes et silences couvrent exactement la mélodie, sans chevauchement. */
const exact = (res) => {
  let t = 0;
  for (const r of res.rows) {
    if (r.step !== t) return false;
    t = r.step + r.len;
  }
  return t === res.total;
};

test('un profil par émotion, aux réglages valides', () => {
  assert.equal(Object.keys(SS.MELODY_PROFILES).length, SS.EMOTIONS.length);
  for (const e of SS.EMOTIONS) {
    const p = SS.MELODY_PROFILES[e.id];
    assert.ok(p, `profil manquant : ${e.id}`);
    assert.equal(p.axes.length, SS.MELODY_AXES.length);
    assert.ok(p.axes.every((v) => v >= 0 && v <= 100), `${e.id} : axes 0–100`);
    assert.ok(SS.MELODY_CONTOURS[p.contour] && SS.MELODY_TARGETS[p.target] && SS.MELODY_ENDINGS[p.ending] && SS.MELODY_REPEATS[p.repeat] && SS.MELODY_MOTIFS[p.motif], `${e.id} : choix valides`);
    assert.ok(p.ornaments.every((o) => SS.MELODY_ORNAMENTS[o]), `${e.id} : ornements`);
    assert.ok(SS.bandSong.CHARACTERS[p.character], `${e.id} : caractère Band`);
  }
  assert.equal(SS.MELODY_AXES.filter((a) => a.main).length, 3);
});

test('les axes règlent densité, ambitus, registre ; la couleur suit la tonalité', () => {
  const calm = SS.resolveMelodyProfile('espoir', { axes: { energy: 0 } }, AD);
  const busy = SS.resolveMelodyProfile('espoir', { axes: { energy: 100 } }, AD);
  assert.ok(busy.density > calm.density);
  assert.ok(SS.resolveMelodyProfile('espoir', { axes: { space: 100 } }, AD).ambitus > SS.resolveMelodyProfile('espoir', { axes: { space: 0 } }, AD).ambitus);
  assert.ok(SS.resolveMelodyProfile('espoir', { axes: { light: 100 } }, AD).center > SS.resolveMelodyProfile('espoir', { axes: { light: 0 } }, AD).center);
  // espoir : la sixte majeure (F♯ en La dorien, A en Do majeur)
  assert.equal(SS.resolveMelodyProfile('espoir', {}, AD).colorPc, 6);
  assert.equal(SS.resolveMelodyProfile('espoir', {}, { tonic: 'C', mode: 'major' }).colorPc, 9);
  // absente de Ré mineur : la note visée devient la tierce, et c'est dit
  const dm = SS.resolveMelodyProfile('espoir', {}, { tonic: 'D', mode: 'minor' });
  assert.equal(dm.target, 'third');
  assert.match(dm.fallback, /sixte majeure \(B\) n’est pas dans Ré mineur/);
  // les retouches remplacent les choix du profil
  const r = SS.resolveMelodyProfile('espoir', { contour: 'arch', ending: 'closed', ornaments: [] }, AD);
  assert.deepEqual([r.contour, r.ending, r.ornamentRate], ['arch', 'closed', 0]);
});

test('composer avec chaque profil : temps exact, une voix, tessiture respectée', () => {
  for (const id of Object.keys(SS.MELODY_PROFILES))
    for (const seed of [1, 2, 3]) {
      const res = compose(id, { seed });
      assert.ok(res.ok, `${id} : ${res.errors}`);
      assert.ok(exact(res), `${id} (graine ${seed}) : couverture exacte et monophonie`);
      assert.ok(res.notes.every((x) => x.midi >= M.RANGES.profil.lo && x.midi <= M.RANGES.profil.hi), `${id} : tessiture`);
      assert.ok(res.profileReport.length >= 3, `${id} : contrôles du profil`);
      assert.equal(res.metrics.length, 6);
    }
});

test('Espoir sur Hopeful : montée, sixte majeure visée, fin ouverte, reprise en séquence', () => {
  const res = compose('espoir');
  const [target, contour, fin] = res.profileReport;
  assert.ok(target.ok && /couleur du mode \(F♯\)/.test(target.text), target.text);
  assert.ok(contour.ok, contour.text);
  assert.ok(fin.ok && /ouverte/.test(fin.text), fin.text);
  assert.ok(res.notes.some((x) => M.noteLabel(x.midi, AD).startsWith('F♯')));
  assert.ok(res.hypotheses.some((h) => /Profil « Montée retenue » \(Espoir\)/.test(h)));
  assert.match(res.summary.motif, /séquence/);
});

test('ornements : seulement sans paroles, marqués, sans fausser le compte des syllabes', () => {
  const res = compose('tristesse');
  const orn = res.notes.filter((x) => x.ornament);
  assert.ok(orn.length > 0, 'tristesse : appoggiatures ou retards');
  assert.ok(orn.every((x) => /ornement|retour de broderie/.test(x.role)));
  assert.ok(res.checks.filter((c) => /^Vers/.test(c.text)).every((c) => c.ok));
  const lyr = M.compose({ grid: 'C | G6', source: 'text', text: 'Le soir tombe\nsur les toits de verre', fitGrid: true, key: { tonic: 'C', mode: 'major' }, profile: SS.resolveMelodyProfile('tristesse', {}, { tonic: 'C', mode: 'major' }), seed: 1, timeSig: [4, 4] });
  assert.ok(lyr.ok);
  assert.ok(!lyr.notes.some((x) => x.ornament), 'paroles : une note par syllabe');
});

test('fin suspendue, note pivot et motif de départ', () => {
  const sus = compose('suspense');
  const last = sus.notes[sus.notes.length - 1];
  const chord = sus.spans.find((sp) => last.step >= sp.step && last.step < sp.step + sp.len).chord;
  assert.ok(!chord.tones.includes(last.midi % 12), 'fin suspendue : hors de l’accord');
  // notes communes : E (Am, Em) et A (Am, D)
  const piv = M.pivotNotes(M.parseGrid('Am | Em | D', { spb: 16 }).spans, AD);
  assert.deepEqual(piv.map((p) => p.name), ['E', 'A']);
  assert.deepEqual(piv[0].roles, ['quinte de Am', 'fondamentale de Em']);
  assert.deepEqual(M.pivotNotes(M.parseGrid('Em | F', { spb: 16 }).spans, AD), []);
  // arche 1–3–5–3 : la phrase A commence par fondamentale, tierce, quinte, tierce de Am
  const arch = compose('espoir', { over: { motif: 'arch' }, complexity: 'simple' });
  assert.deepEqual(arch.notes.slice(0, 4).map((x) => M.noteLabel(x.midi, AD).replace(/\d/, '')), ['A', 'C', 'E', 'C']);
});

test('sans profil, le compositeur garde son comportement', () => {
  const a = compose(null);
  const b = M.compose({ grid: HOPEFUL, source: 'meter', fitGrid: true, key: AD, seed: 3, timeSig: [4, 4], complexity: 'balanced', style: 'simple', ending: 'closed', range: 'voix' });
  assert.deepEqual(a.notes.map((x) => [x.step, x.len, x.midi]), b.notes.map((x) => [x.step, x.len, x.midi]));
  assert.equal(a.profile, null);
  assert.deepEqual(a.profileReport, []);
});

test('variante B : un seul levier change', () => {
  const p = SS.resolveMelodyProfile('espoir', {}, AD);
  for (let n = 0; n < 4; n++) {
    const v = SS.melodyVariantB(p, {}, n);
    assert.equal(Object.keys(v.over).length, 1, v.text);
    const q = SS.resolveMelodyProfile('espoir', v.over, AD);
    const diff = ['contour', 'ending', 'target', 'repeat'].filter((k) => q[k] !== p[k]);
    assert.equal(diff.length, 1, v.text);
  }
});

test('Band : l’émotion de la scène guide la mélodie (profil), et peut être ignorée', () => {
  const preset = SS.Band.STYLES.flatMap((st) => st.presets)[0];
  const tracks = preset.musicians.flatMap((m) => (m.kits ? [] : [{ id: m.role, type: 'instrument', band: { key: m.role } }]));
  const spec = SS.BandSongs[preset.id];
  const secs = Object.keys(spec.sections);
  const emotions = Object.fromEntries(secs.map((s) => [s, 'tristesse']));
  const lead = (song) => song.scenes.flatMap((sc) => Object.entries(sc.data).filter(([id]) => /lead|vox|sax/.test(id)).flatMap(([, d]) => d.events || []));
  const plain = lead(SS.bandSong.build(spec, preset.id, tracks, { melody: {} }));
  const sad = lead(SS.bandSong.build(spec, preset.id, tracks, { melody: {}, harmony: { emotions } }));
  const off = lead(SS.bandSong.build(spec, preset.id, tracks, { melody: { useProfile: false }, harmony: { emotions } }));
  if (!plain.length) return; // inspiration sans chanteur
  assert.notDeepEqual(sad.map((e) => e.notes[0]), plain.map((e) => e.notes[0]), 'le profil change la mélodie');
  assert.deepEqual(off.map((e) => e.notes[0]), plain.map((e) => e.notes[0]), 'ignoré : comme sans émotion');
  // sombre (tristesse) : registre plus grave en moyenne
  const avg = (ev) => ev.reduce((a, e) => a + e.notes[0], 0) / ev.length;
  assert.ok(avg(sad) < avg(plain), `registre : ${avg(sad).toFixed(1)} < ${avg(plain).toFixed(1)}`);
});
