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

test('mesures ternaires : les motifs de guitare de la mesure jouent en croches calées sur la mesure ; arpège du plan remplacé', () => {
  const TR = [{ id: 'pad', type: 'instrument', category: 'chord', band: { key: 'pad' } }, { id: 'arp', type: 'instrument', category: 'chord', band: { key: 'arp' } }];
  const SPEC = { key: 'C minor', groove: 'synthpop', form: 'a', sections: { a: { bars: 4, chords: 'i | VI | III | VII', pad: 'sustain', arp: 'updown16' } } };
  const GA = SS.GuitarArp;
  for (const [sig, n] of [['3/4', 12], ['6/8', 12], ['12/8', 24]]) {
    const mine = GA.MOTIFS.filter((m) => SS.bandSong.meterOK('chords', 'g:' + m.id, sig));
    assert.ok(mine.length >= 3, `${sig} : au moins trois motifs de guitare`);
    for (const m of mine) {
      const ev = SS.bandSong.build(SPEC, 't', TR, { sig, parts: { a: { pad: { mode: 'g:' + m.id } } } }).scenes[0].data.pad.events;
      const bars = [0, 1, 2, 3].map((b) => ev.filter((e) => e.step >= b * n && e.step < (b + 1) * n).map((e) => e.step - b * n));
      assert.ok(bars[0].length && bars[0].every((s) => s % 2 === 0), `${sig} ${m.id} : sur les croches (${bars[0]})`);
      assert.ok(bars[0].includes(0) && bars[2].includes(0), `${sig} ${m.id} : chaque mesure commence sur le 1`);
    }
    const arp = SS.bandSong.build(SPEC, 't', TR, { sig }).scenes[0].data.arp.events;
    if (sig !== '3/4') assert.ok(arp.every((e) => e.step % 2 === 0), `${sig} : arpège du plan en croches ternaires`);
  }
  assert.equal(SS.bandSong.meterOK('chords', 'g:pimami', '4/4'), true);
  SS.bandSong.setMeter('4/4');
});
