/*
 * Guitariste de « Nouvelle chanson » (js/bandsong.js) : les modes « g:<motif> » sont joués par le mode Guitare
 * d'Arp One (js/guitar-arp.js).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['dirt.js', 'dirt-tuning.js', 'sounds.js', 'harmony.js', 'project.js', 'arp.js', 'guitar-arp.js', 'band-presets.js', 'band-songs.js', 'melody.js', 'bandsong.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;

test('Guitariste en mode « g:travis » : notes de guitare corde par corde, sur toute la scène', () => {
  const presets = SS.Band.STYLES.flatMap((st) => st.presets);
  const p = presets.find((x) => x.musicians.some((m) => m.role === 'guitar') && SS.BandSongs[x.id]);
  assert.ok(p, 'une inspiration avec un guitariste');
  const tr = p.musicians.filter((m) => !m.injected).flatMap((m) =>
    m.kits ? m.pieces.map((pc) => ({ id: m.role + ':' + pc, type: 'drum', sound: pc, band: { key: m.role + ':' + pc } })) : [{ id: m.role, type: 'instrument', category: 'chord', band: { key: m.role } }]
  );
  const base = SS.bandSong.build(SS.BandSongs[p.id], p.id, tr);
  const sc0 = base.scenes.find((sc) => sc.data.guitar && sc.data.guitar.events.length) || base.scenes[0];
  const s = SS.bandSong.build(SS.BandSongs[p.id], p.id, tr, { parts: { [sc0.sec]: { guitar: { mode: 'g:travis' } } } });
  const ev = s.scenes.find((sc) => sc.sec === sc0.sec).data.guitar.events;
  assert.ok(ev.length >= sc0.bars * 8, `au moins 8 attaques par mesure (${ev.length})`);
  assert.ok(ev.every((e) => e.notes.length === 1 && e.notes[0] >= 38 && e.notes[0] <= 90), 'une note par attaque, dans la tessiture de la guitare');
  assert.ok(ev.some((e) => e.len > 1), 'des cordes qui résonnent');
});

test('Guitariste « Avancé » : les réglages guitare de la scène (gtr : capodastre…) changent les notes', () => {
  const presets = SS.Band.STYLES.flatMap((st) => st.presets);
  const p = presets.find((x) => x.musicians.some((m) => m.role === 'guitar') && SS.BandSongs[x.id]);
  const tr = p.musicians.filter((m) => !m.injected).flatMap((m) =>
    m.kits ? m.pieces.map((pc) => ({ id: m.role + ':' + pc, type: 'drum', sound: pc, band: { key: m.role + ':' + pc } })) : [{ id: m.role, type: 'instrument', category: 'chord', band: { key: m.role } }]
  );
  const sec = SS.bandSong.build(SS.BandSongs[p.id], p.id, tr).scenes[0].sec;
  const notes = (gtr) => SS.bandSong.build(SS.BandSongs[p.id], p.id, tr, { parts: { [sec]: { guitar: { mode: 'g:aller', ...(gtr ? { gtr } : {}) } } } }).scenes.find((sc) => sc.sec === sec).data.guitar.events.map((e) => e.notes[0]);
  const plain = notes(null);
  const capo = notes({ capo: 5 });
  assert.equal(plain.length, capo.length, 'même motif');
  assert.notDeepEqual(plain, capo, 'le capodastre déplace la forme sur le manche');
});
