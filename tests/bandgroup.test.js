/*
 * Band : le groupe éditable de l'assistant (js/bandgroup.js) et les musiciens ajoutés dans SS.bandSong.build / SS.wizMix.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['dirt.js', 'dirt-tuning.js', 'sounds.js', 'harmony.js', 'project.js', 'band-presets.js', 'bandgroup.js', 'band-songs.js', 'band-levels.js', 'bandmix.js', 'wizmix.js', 'drum-patterns.js', 'arp.js', 'motifs.js', 'melody.js', 'bandsong.js', 'wizdraft.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const BG = SS.bandGroup;
const BS = SS.bandSong;

const PRESETS = SS.Band.STYLES.flatMap((st) => st.presets.map((p) => ({ ...p, style: st.id })));
const SMALL = PRESETS.find((p) => p.id === 'smalltown');
/** Pistes d'un groupe : celles de l'assistant (un kit : une piste par élément), avec les marques de plannedTracks. */
const tracksOf = (p, list) =>
  list.flatMap((r) => {
    if (r.base) {
      const m = p.musicians.find((x) => x.id === r.base);
      return m.kits ? m.pieces.map((pc) => ({ id: m.id + ':' + pc, type: 'drum', sound: pc, band: { style: p.style, preset: p.id, musician: m.id, key: m.role + ':' + pc } })) : [{ id: m.id, type: 'instrument', band: { style: p.style, preset: p.id, musician: m.id, key: m.role } }];
    }
    const role = BG.ROLE_OF_TYPE[r.type];
    return r.type === 'drums'
      ? ['tb', 'sh'].map((pc) => ({ id: r.id + ':' + pc, type: 'drum', sound: pc, band: { style: p.style, preset: p.id, musician: r.id, key: role + ':' + pc, label: r.name } }))
      : [{ id: r.id, type: 'instrument', band: { style: p.style, preset: p.id, musician: r.id, key: role, label: r.name } }];
  });
const strip = (res) => JSON.stringify(res.scenes.map((sc) => ({ ...sc, id: 0 })));
const build = (p, tr, o = {}) => BS.build(SS.BandSongs[p.id], p.id, tr, o);

test('groupe par défaut : les musiciens non facultatifs de l\'inspiration, dans son ordre, noms uniques', () => {
  for (const p of PRESETS) {
    const g = BG.defaultGroup(p);
    assert.deepEqual(g.list.map((r) => r.id), p.musicians.filter((m) => !m.optional).map((m) => m.id), p.id);
    assert.ok(g.list.length >= BG.MIN && g.list.length <= BG.MAX, p.id);
    assert.equal(new Set(g.list.map((r) => r.name)).size, g.list.length, p.id + ' : noms uniques');
    assert.ok(g.list.every((r) => r.base === r.id && !BG.isExtraId(r.id)));
  }
});

test('sans retouche, la chanson est identique : le groupe par défaut ne change rien, un musicien ajouté ne touche pas aux autres', () => {
  for (const p of PRESETS) {
    const g = BG.defaultGroup(p);
    const base = tracksOf(p, g.list);
    const a = build(p, base);
    // mêmes pistes, passées avec des types explicites par défaut et des réglages vides : même chanson
    const same = {};
    BS.instIds(base).forEach((x, i) => (same[x.id] = base[i].type === 'drum' ? 'drums' : BS.kindOfRole(base[i].band.key.split(':')[0])));
    assert.equal(strip(build(p, base, { kinds: same, parts: {} })), strip(a), p.id);
    // un musicien ajouté a ses pistes à lui : celles des autres sont les mêmes notes
    const g2 = BG.defaultGroup(p);
    if (BG.add(g2, 'arp')) {
      const b = build(p, tracksOf(p, g2.list));
      a.scenes.forEach((sc, i) => base.forEach((t) => assert.deepEqual(b.scenes[i].data[t.id], sc.data[t.id], `${p.id} ${t.id}`)));
    }
  }
});

test('un musicien ajouté de chaque type joue avec le générateur de son type', () => {
  const g = BG.defaultGroup(SMALL);
  const rec = {};
  for (const t of BG.TYPES) rec[t] = BG.add(g, t);
  assert.equal(g.list.length, 5 + 5);
  const res = build(SMALL, tracksOf(SMALL, g.list));
  const sc = res.scenes.find((x) => x.sec === 'chorus');
  const notes = (id) => sc.data[id].events.flatMap((e) => e.notes);
  // basse : une note par temps, registre grave
  assert.ok(sc.data[rec.bass.id].events.length > 4 && Math.max(...notes(rec.bass.id)) < 60, 'basse grave');
  // accords : plusieurs notes par événement
  assert.ok(sc.data[rec.chords.id].events.length > 0 && sc.data[rec.chords.id].events.every((e) => e.notes.length >= 3), 'accords plaqués');
  // arpège : des notes seules, nombreuses
  const arp = sc.data[rec.arp.id].events;
  assert.ok(arp.length > 16 && arp.every((e) => e.notes.length === 1), 'arpège');
  // mélodie : des notes, et pas celle du lead de l'inspiration (graine propre)
  assert.ok(sc.data[rec.melody.id].events.length > 4, 'mélodie');
  assert.notDeepEqual(sc.data[rec.melody.id].events, sc.data.lead.events, 'deuxième mélodie différente');
  // kit : des pas, un motif propre (différent du premier kit)
  const kit = ['tb', 'sh'].map((pc) => sc.data[`${rec.drums.id}:${pc}`].steps);
  assert.ok(kit.every((s) => s.some((v) => v > 0)), 'kit : des coups');
  // chaque scène a des notes pour chaque musicien ajouté (jamais muet d'office)
  res.scenes.forEach((s) => ['bass', 'chords', 'arp', 'melody'].forEach((t) => assert.ok(s.data[rec[t].id].events.length > 0, `${s.name} ${t}`)));
});

test('un musicien ajouté peut changer de type (kinds) : le générateur du nouveau type joue', () => {
  const g = BG.defaultGroup(SMALL);
  const r = BG.add(g, 'bass');
  const tr = tracksOf(SMALL, g.list);
  const id = `${r.id}:bass`;
  assert.ok(BS.instIds(tr).some((x) => x.id === id));
  const res = build(SMALL, tr, { kinds: { [id]: 'arp' } });
  const ev = res.scenes[1].data[r.id].events;
  assert.ok(ev.length > 16 && Math.min(...ev.flatMap((e) => e.notes)) >= 55, 'arpège au lieu de basse');
});

test('deux kits Drums : pièces, motifs et identifiants distincts ; bandSong.build et wizmix les gèrent', () => {
  const g = BG.defaultGroup(SMALL);
  const k = BG.add(g, 'drums');
  const k2 = BG.add(g, 'drums');
  assert.deepEqual([k.id, k2.id, k.name, k2.name], ['x1', 'x2', 'Batteur 2', 'Batteur 3']);
  const tr = tracksOf(SMALL, g.list);
  assert.equal(new Set(BS.instIds(tr).map((x) => x.id)).size, tr.length, 'ids d\'instrument uniques');
  const res = build(SMALL, tr);
  const sc = res.scenes.find((x) => x.sec === 'chorus');
  const a = sc.data[`${k.id}:tb`].steps;
  const b = sc.data[`${k2.id}:tb`].steps;
  assert.ok(a.some((v) => v > 0) && b.some((v) => v > 0));
  assert.notDeepEqual(a, b, 'motif propre à chaque kit');
  // le même musicien et la même pièce deux fois : « #n »
  const twice = [...tr, { ...tr[tr.length - 1], id: 'dup' }];
  assert.ok(BS.instIds(twice).some((x) => x.id.endsWith('#1')));
  // mix : une tranche par musicien ajouté
  const M = SS.wizMix;
  const cols = tr.map((t) => ({ type: t.type, sound: t.sound, band: t.band }));
  const ids = new Set(cols.map((c) => M.idOf(c)));
  assert.ok(ids.has('perc:tb@x1') && ids.has('perc:tb@x2') && ids.has('perc:sh@x1'));
  const mix = M.defaults('synthwave', cols);
  assert.ok(mix.tracks['perc:tb@x1'] && mix.tracks['perc:tb@x2'] && mix.tracks.kick);
  const names = M.strips(cols).map((s) => s.name);
  assert.ok(names.some((n) => n.includes('Batteur 3')), names.join());
});

test('wizmix : les tranches d\'un musicien ajouté sont les siennes, celles de l\'inspiration ne changent pas', () => {
  const M = SS.wizMix;
  const g0 = BG.defaultGroup(SMALL);
  const g = BG.defaultGroup(SMALL);
  BG.add(g, 'bass');
  BG.add(g, 'melody');
  const cols = (gg) => tracksOf(SMALL, gg.list).map((t) => ({ type: t.type, sound: t.sound, band: t.band }));
  const a = M.defaults('synthwave', cols(g0));
  const b = M.defaults('synthwave', cols(g));
  Object.keys(a.tracks).forEach((id) => assert.deepEqual(b.tracks[id], a.tracks[id], id));
  assert.ok(b.tracks['bass@x1'] && b.tracks['lead@x2']);
  // sync : retirer le musicien supprime sa tranche
  const s = M.sync(b, 'synthwave', cols(g0));
  assert.ok(!s.tracks['bass@x1'] && s.tracks.bass);
});

test('limites : 2 à 10 musiciens, ids stables jamais réutilisés, noms au premier numéro libre', () => {
  const g = BG.defaultGroup(SMALL);
  assert.equal(g.list.length, 5);
  assert.equal(BG.add(g, 'bass').name, 'Bassiste 2');
  assert.equal(BG.add(g, 'bass').name, 'Bassiste 3');
  assert.ok(BG.remove(g, 'x1'));
  assert.equal(BG.add(g, 'bass').name, 'Bassiste 2', 'premier numéro libre');
  assert.equal(BG.add(g, 'bass').id, 'x4', 'id jamais réutilisé');
  while (g.list.length < BG.MAX) assert.ok(BG.add(g, 'arp'));
  assert.equal(BG.add(g, 'arp'), null, 'pas plus de 10');
  assert.ok(!BG.canAdd(g));
  while (g.list.length > BG.MIN) assert.ok(BG.remove(g, g.list[g.list.length - 1].id));
  assert.equal(BG.remove(g, g.list[0].id), false, 'pas moins de 2');
  assert.equal(BG.add(g, 'inconnu'), null);
});

test('ordre, renommer, copie', () => {
  const g = BG.defaultGroup(SMALL);
  const ids = () => g.list.map((r) => r.id).join();
  assert.equal(ids(), 'drums,bass,pad,arp,lead');
  assert.ok(BG.move(g, 'lead', -1) && ids() === 'drums,bass,pad,lead,arp');
  assert.ok(!BG.move(g, 'drums', -1) && !BG.move(g, 'arp', 1));
  assert.ok(BG.moveTo(g, 'arp', 'drums') && ids() === 'arp,drums,bass,pad,lead');
  assert.ok(BG.rename(g, 'bass', 'Fred') && BG.find(g, 'bass').name === 'Fred' && BG.find(g, 'bass').custom);
  assert.ok(BG.rename(g, 'bass', '  ', 'Bassiste') && BG.find(g, 'bass').name === 'Bassiste' && !BG.find(g, 'bass').custom);
  assert.equal(BG.copyName(g, 'Bassiste'), 'Bassiste 2');
});

test('retrait : les réglages, le type, le muet / solo et le volume du musicien disparaissent', () => {
  const w = {
    kinds: { 'x1:lead': 'arp', 'bass:bass': 'melody' }, off: new Set(['x1:lead', 'bass:bass']), mute: new Set(['x1:lead']), solo: new Set(['x1:lead']), vol: new Map([['x1:lead', 3]]),
    parts: { verse: { inst: { 'x1:lead': { mode: 'up16' }, 'bass:bass': { mode: 'oct' } } }, chorus: { inst: { 'x1:lead': { off: true } } } },
    melPanel: { 'x1:lead|verse': {}, 'bass:bass|verse': {} }, plans: {}, pseeds: {}, chars: {},
  };
  BG.purge(w, ['x1', 'x1:lead']);
  assert.deepEqual(w.kinds, { 'bass:bass': 'melody' });
  assert.deepEqual([...w.off], ['bass:bass']);
  assert.equal(w.mute.size + w.solo.size + w.vol.size, 0);
  assert.deepEqual(Object.keys(w.parts), ['verse']);
  assert.deepEqual(Object.keys(w.parts.verse.inst), ['bass:bass']);
  assert.deepEqual(Object.keys(w.melPanel), ['bass:bass|verse']);
});

test('changer d\'inspiration : même style, les musiciens ajoutés restent ; autre style, le groupe du nouveau style', () => {
  const g = BG.defaultGroup(SMALL);
  BG.remove(g, 'lead');
  const x = BG.add(g, 'arp', { ms: { pick: 2, custom: null, tok: 'gm_celesta' } });
  const other = PRESETS.find((p) => p.id === 'nightcall');
  const r = BG.rebase(g, other, true);
  assert.deepEqual(r.list.map((q) => q.id), [...other.musicians.filter((m) => !m.optional).map((m) => m.id), x.id]);
  assert.equal(r.list.at(-1).ms.tok, 'gm_celesta');
  const edm = PRESETS.find((p) => p.style === 'edm');
  assert.deepEqual(BG.rebase(g, edm, false).list.map((q) => q.id), BG.defaultGroup(edm).list.map((q) => q.id));
});

test('conseillés réels par type : ceux de l\'inspiration, sinon du style', () => {
  const rb = BG.recommended('bass', 'synthwave', 'smalltown');
  assert.deepEqual(rb.pick, SMALL.musicians.find((m) => m.role === 'bass').pick);
  assert.equal(rb.pick.length, 6);
  // « Rej » (techno) : le lead est facultatif mais reste la source des conseillés mélodie
  const rej = BG.recommended('melody', 'techno', 'rej');
  assert.deepEqual(rej.pick, PRESETS.find((p) => p.id === 'rej').musicians.find((m) => m.role === 'lead').pick);
  for (const t of ['bass', 'chords', 'arp', 'melody']) for (const p of PRESETS) assert.equal(BG.recommended(t, p.style, p.id).pick.length, 6, `${t} ${p.id}`);
  const dr = BG.recommended('drums', 'synthwave', 'smalltown');
  assert.deepEqual(dr.kits, SMALL.musicians.find((m) => m.role === 'drums').kits);
  assert.ok(dr.pieces.length > 0);
});

test('brouillon v1 : migration (musiciens « dans le groupe » → liste), v1 toujours accepté', () => {
  // v1 : la batterie, la basse en moins (décochée), le percussionniste facultatif en plus (coché)
  const cache = { drums: { on: true }, perc: { on: true }, bass: { on: false }, pad: { on: true }, arp: { on: true }, lead: { on: true } };
  const g = BG.fromV1(SMALL, cache);
  assert.deepEqual(g.list.map((r) => r.id), ['drums', 'perc', 'pad', 'arp', 'lead']);
  assert.deepEqual(BG.fromV1(SMALL, null).list.map((r) => r.id), BG.defaultGroup(SMALL).list.map((r) => r.id));
  assert.deepEqual(BG.fromV1(SMALL, { drums: { on: false }, bass: { on: false }, pad: { on: false }, arp: { on: false } }).list.map((r) => r.id), BG.defaultGroup(SMALL).list.map((r) => r.id), 'moins de 2 : groupe par défaut');
  const d = SS.wizDraft.clean({ v: 1, savedAt: 1, state: { styleId: 'synthwave', presetId: 'smalltown', cache: { smalltown: cache } } });
  assert.ok(d && d.v === 1);
  const u = SS.wizDraft.unpack(d.state);
  assert.equal(u.group, null);
  assert.deepEqual(BG.fromV1(SMALL, u.cache.smalltown).list.map((r) => r.id), g.list.map((r) => r.id));
});

test('brouillon v2 : le groupe est rangé et relu tel quel ; un groupe incohérent est refusé', () => {
  const g = BG.defaultGroup(SMALL);
  BG.add(g, 'bass', { name: 'Fred', ms: { on: true, pick: 1, custom: null, tok: 'x', picked: true } });
  BG.add(g, 'drums', { ms: { on: true, kit: 'LinnDrum', pieces: [{ piece: 'tb', on: true }] } });
  BG.move(g, 'lead', -2);
  const packed = SS.wizDraft.pack({ styleId: 'synthwave', presetId: 'smalltown', group: g, cache: {}, w: { step: 2 } });
  assert.equal(SS.wizDraft.VERSION, 4);
  const back = BG.clean(SS.wizDraft.unpack(JSON.parse(JSON.stringify(packed))).group, SMALL);
  assert.deepEqual(back.list.map((r) => [r.id, r.name, r.type || null]), g.list.map((r) => [r.id, r.name, r.type || null]));
  assert.equal(back.list.find((r) => r.id === 'x1').ms.tok, 'x');
  assert.equal(back.list.find((r) => r.id === 'x2').ms.kit, 'LinnDrum');
  assert.equal(BG.clean({ nextId: 1, list: [{ id: 'bass', base: 'bass', name: 'a' }] }, SMALL), null, 'moins de 2');
  assert.equal(BG.clean({ nextId: 1, list: [{ id: 'zzz', base: 'zzz', name: 'a' }, { id: 'bass', base: 'bass', name: 'b' }] }, SMALL), null, 'musicien inconnu');
  assert.equal(BG.clean(null, SMALL), null);
});
