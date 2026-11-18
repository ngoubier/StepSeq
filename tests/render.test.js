/*
 * Export audio (js/render.js) : plan de l'arrangement, stems, projet envoyé au rendu, mesures EBU R128, WAV, ZIP.
 * Le rendu lui-même (cadre render.html) est testé de bout en bout : node tests/e2e/audio-export.js
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['dirt.js', 'sounds.js', 'harmony.js', 'project.js', 'render.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const R = SS.render;

const sine = (n, sr, f, amp, phase = 0) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * f * i) / sr + phase));

function songProject() {
  const p = SS.newProject();
  p.tempo = 120;
  const drum = (key, name) => ({ ...SS.newTrack({ name, color: '#f0f', type: 'drum', sound: 'bd' }, p), band: { key } });
  p.tracks = [drum('drums:bd', 'Kick'), drum('drums:sd', 'Caisse claire'), { ...SS.newTrack({ name: 'Basse', color: '#0f0', type: 'drum', sound: 'bd' }, p), band: { key: 'bass' } }, SS.newTrack({ name: 'Lead', color: '#00f', type: 'drum', sound: 'bd' }, p)];
  const a = p.scenes[0];
  a.bars = 2;
  p.bars = 2;
  p.scenes.push({ id: 'b', name: 'Refrain', bars: 4, data: {} });
  p.song = [{ scene: a.id, repeat: 2 }, { scene: 'b', repeat: 1 }];
  return p;
}

test('plan : arrangement ou scène en cours répétée, durée au tempo', () => {
  const p = songProject();
  const s = R.songPlan(p, { range: 'song' });
  assert.equal(s.bars, 2 * 2 + 4);
  assert.equal(s.seconds, 8 * 2); // 8 mesures de 4/4 à 120 BPM
  const sc = R.songPlan(p, { range: 'scene', loops: 3 });
  assert.deepEqual(sc.song, [{ scene: p.current, repeat: 3 }]);
  assert.equal(sc.bars, 6);
});

test('stems : par musicien (la batterie ensemble), par piste ; seules les pistes entendues', () => {
  const p = songProject();
  const g = R.stemGroups(p, 'musician');
  assert.deepEqual(g.map((x) => x.name), ['Batterie', 'Basse', 'Lead']);
  assert.equal(g[0].tracks.length, 2);
  assert.equal(R.stemGroups(p, 'track').length, 4);
  p.tracks[2].mute = true;
  assert.deepEqual(R.stemGroups(p, 'musician').map((x) => x.name), ['Batterie', 'Lead']);
  p.tracks[3].solo = true;
  assert.deepEqual(R.stemGroups(p, 'musician').map((x) => x.name), ['Lead']);
});

test('stems : noms en double numérotés', () => {
  const p = songProject();
  p.tracks[3].name = 'Basse';
  assert.deepEqual(R.stemGroups(p, 'track').map((x) => x.name).slice(2), ['Basse 1', 'Basse 2']);
});

test('projet de rendu : arrangement joué une fois, autres pistes à volume nul (pas en muet), Master neutre pour les stems', () => {
  const p = songProject();
  p.master = { volume: 0.8, mastering: { on: true, drive: 6 }, effects: { on: true } };
  const keep = [p.tracks[2].id];
  const r = R.prepare(p, { keep, neutralMaster: true });
  const q = JSON.parse(r.json);
  assert.equal(q.playMode, 'song');
  assert.equal(q.songLoop, false);
  assert.deepEqual(q.song.map((b) => b.repeat), [2, 1]);
  q.tracks.forEach((t) => {
    assert.equal(t.volume, keep.includes(t.id) ? 0.8 : 0);
    assert.ok(!t.mute, 'une piste muette ne tirerait pas les mêmes valeurs aléatoires (humanisation)');
  });
  assert.equal(q.master.mastering.on, false);
  assert.equal(q.master.effects.on, false);
  assert.equal(q.master.mix.comp.on, false);
  assert.equal(q.master.mix.lim.on, false);
  assert.equal(r.seconds, R.PREROLL + 16 + R.TAIL);
  // le projet de l'application n'est pas touché
  assert.equal(p.tracks[0].volume, 0.8);
  assert.equal(p.master.mastering.on, true);
  const m = JSON.parse(R.prepare(p, {}).json);
  assert.equal(m.master.mastering.drive, 6);
});

test('début du son : pré-roll moins les notes jouées en avance et l’humanisation', () => {
  const p = songProject();
  assert.ok(Math.abs(R.leadIn(p) - (R.PREROLL - 0.002)) < 1e-9);
  p.groove.human = 1;
  p.scenes[0].data.x = { events: [{ step: 0, len: 1, notes: [60], shift: -0.5 }] };
  const sd = 60 / 120 / 4;
  assert.ok(Math.abs(R.leadIn(p) - (R.PREROLL - 0.5 * sd - 0.015 - 0.002)) < 1e-9);
});

test('volume intégré : sinus 1 kHz à −20 dBFS sur les deux canaux ≈ −20 LUFS (BS.1770)', () => {
  for (const sr of [44100, 48000]) {
    const x = sine(sr * 5, sr, 997, 0.1);
    const m = R.measure(x, x, sr);
    assert.ok(Math.abs(m.integrated + 20) < 0.15, `${sr} : ${m.integrated}`);
    assert.ok(Math.abs(m.shortMax + 20) < 0.15);
    assert.ok(Math.abs(m.samplePeak + 20) < 0.01);
    assert.ok(Math.abs(m.corr - 1) < 1e-6);
    // un seul canal : −3 dB
    const z = new Float32Array(x.length);
    assert.ok(Math.abs(R.measure(x, z, sr).integrated + 23.01) < 0.15);
  }
});

test('volume intégré : la porte relative ignore les silences et les passages très doux', () => {
  const sr = 48000;
  const loud = sine(sr * 4, sr, 997, 0.1);
  const x = new Float32Array(sr * 12);
  x.set(loud, 0);
  x.set(sine(sr * 4, sr, 997, 0.001), sr * 8); // −60 dBFS : sous la porte relative
  const m = R.measure(x, x, sr);
  // les blocs de 400 ms à cheval sur le changement passent la porte : un peu sous −20
  assert.ok(Math.abs(m.integrated + 20) < 0.35, String(m.integrated));
  assert.ok(m.lra > 0);
});

test('crête vraie : retrouve la crête entre les échantillons', () => {
  const sr = 48000;
  const x = sine(sr, sr, sr / 4, 0.5, Math.PI / 4); // échantillons à 0,354, crête réelle 0,5
  const m = R.measure(x, x, sr);
  assert.ok(Math.abs(m.samplePeak - 20 * Math.log10(0.5 * Math.SQRT1_2)) < 0.01);
  assert.ok(Math.abs(m.truePeak - 20 * Math.log10(0.5)) < 0.3, String(m.truePeak));
});

test('bornes : pré-roll retiré, silence de fin coupé, fondu si la queue dure jusqu’au bout', () => {
  const sr = 1000;
  const L = new Float32Array(5000);
  L.fill(0.5, 80, 2500);
  const b = R.bounds(L, L, sr, 0.08, 2);
  assert.equal(b.from, 80);
  assert.equal(b.to, 2599); // dernier son (2499) + 0,1 s
  assert.equal(b.fade, 0);
  L.fill(0.5, 2500, 5000);
  const c = R.bounds(L, L, sr, 0.08, 2);
  assert.equal(c.to, 5000);
  assert.equal(c.fade, 500);
});

test('recalage du master : retrouve le retard du limiteur', () => {
  const sr = 8000;
  const n = sr * 4;
  const s = Float32Array.from({ length: n }, (_, i) => Math.sin(i * 0.37) * Math.sin(i * 0.011) + (i % 97 === 0 ? 0.8 : 0));
  const m = new Float32Array(n);
  for (let i = 40; i < n; i++) m[i] = 0.7 * s[i - 40];
  assert.equal(R.masterDelay(m, m, s, s, 0, sr), 40);
});

test('WAV : en-tête, 16 / 24 bits avec dither d’un pas, 32 bits flottant exact, fondu', () => {
  const L = Float32Array.from([0, 0.5, -0.5, 1, -1, 0.25]);
  const Rr = Float32Array.from([0.1, 0.2, 0.3, 0.4, 0.5, 0.6]);
  const w = R.encodeWav(L, Rr, 48000, 24);
  const v = new DataView(w.buffer);
  const tag = (o) => String.fromCharCode(...w.subarray(o, o + 4));
  assert.equal(tag(0), 'RIFF');
  assert.equal(tag(8), 'WAVE');
  assert.equal(v.getUint16(20, true), 1);
  assert.equal(v.getUint16(22, true), 2);
  assert.equal(v.getUint32(24, true), 48000);
  assert.equal(v.getUint16(34, true), 24);
  assert.equal(v.getUint32(40, true), 6 * 2 * 3);
  assert.equal(w.length, 44 + 36);
  const s24 = (i) => {
    const o = 44 + i * 3;
    const x = w[o] | (w[o + 1] << 8) | (w[o + 2] << 16);
    return x & 0x800000 ? x - 0x1000000 : x;
  };
  assert.ok(Math.abs(s24(2) - 0.5 * 8388607) <= 1);
  assert.ok(Math.abs(s24(4) + 0.5 * 8388607) <= 1);
  assert.equal(s24(6), 8388607); // écrêté proprement à la valeur maximale
  assert.equal(s24(8), -8388607); // symétrique : −1 donne −(2²³ − 1)
  const w16 = R.encodeWav(L, Rr, 44100, 16, { from: 1, to: 3 });
  const v16 = new DataView(w16.buffer);
  assert.equal(v16.getUint32(40, true), 2 * 2 * 2);
  assert.ok(Math.abs(v16.getInt16(44, true) - 16384) <= 1);
  const w32 = R.encodeWav(L, Rr, 44100, 32, { fade: 2 });
  const v32 = new DataView(w32.buffer);
  assert.equal(v32.getUint16(20, true), 3);
  assert.equal(v32.getFloat32(44 + 8, true), 0.5);
  assert.equal(v32.getFloat32(44 + 4 * 8, true), -1 * 0.5); // fondu : avant-dernier à 1/2
  // dither reproductible
  assert.deepEqual(R.encodeWav(L, Rr, 48000, 16), R.encodeWav(L, Rr, 48000, 16));
});

test('ZIP : CRC-32 et structure (méthode stockée, noms en UTF-8)', () => {
  assert.equal(R.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const files = [{ name: 'a.wav', data: new Uint8Array([1, 2, 3]) }, { name: 'stems/Batterie é.wav', data: new Uint8Array(10) }];
  const parts = R.zip(files);
  const all = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  parts.forEach((p) => {
    all.set(p, o);
    o += p.length;
  });
  const v = new DataView(all.buffer);
  assert.equal(v.getUint32(0, true), 0x04034b50);
  const end = all.length - 22;
  assert.equal(v.getUint32(end, true), 0x06054b50);
  assert.equal(v.getUint16(end + 10, true), 2);
  const cd = v.getUint32(end + 16, true);
  assert.equal(v.getUint32(cd, true), 0x02014b50);
  assert.equal(v.getUint32(cd + 16, true), R.crc32(files[0].data));
  const second = v.getUint32(cd + 46 + 5 + 42, true);
  assert.equal(second, 30 + 5 + 3);
  assert.equal(new TextDecoder().decode(all.subarray(second + 30, second + 30 + v.getUint16(second + 26, true))), 'stems/Batterie é.wav');
});
