/*
 * Nouvelle chanson sur téléphone (js/phonesong.js) : la recette (tempo, tonalité, musiciens, scènes) devient une chanson.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['library.js', 'dirt.js', 'sounds.js', 'harmony.js', 'arp.js', 'project.js', 'band-presets.js', 'band-songs.js', 'band-levels.js', 'band-drive.js', 'mixref.js', 'horns-motifs.js', 'horns.js', 'bandmix.js', 'melody.js', 'keys-motifs.js', 'motifpicker.js', 'keyboardist.js', 'drum-patterns.js', 'padmotifs.js', 'bandsong.js', 'mybass.js', 'bassmotifs.js', 'scenestars.js', 'phonesong.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const P = SS.phoneSong;

test('recette de départ : Do majeur, trois musiciens (la Nappe en option), structure courte', () => {
  const r = P.fresh();
  assert.equal(P.keyLabel(r), 'Do majeur');
  assert.deepEqual(P.MUSICIANS.map((m) => m.id), ['drums', 'bass', 'keys', 'pad']);
  assert.ok(P.MUSICIANS.every((m) => r.mus[m.id].on === (m.id !== 'pad') && P.sounds(m.id).length >= 3));
  assert.ok(P.MUSICIANS.every((m) => P.sounds(m.id).every((s) => !s.tok.startsWith('j:'))), 'pas de synthé Juno sur téléphone');
  assert.equal(P.chordsOf(r, 'verse'), 'C · G · Am · F');
});

test('la tonalité choisie donne les accords : La mineur, Do♯ mineur', () => {
  const r = { ...P.fresh(), tonic: 9, mode: 'minor' };
  assert.equal(P.keyLabel(r), 'La mineur');
  assert.equal(P.chordsOf(r, 'verse'), 'Am · F · C · G');
  assert.equal(P.keyLabel({ ...r, tonic: 1 }), 'Do♯ mineur');
  assert.equal(P.keyLabel({ ...r, tonic: 1, mode: 'major' }), 'Ré♭ majeur');
});

test('la chanson construite suit la recette', () => {
  const r = { ...P.fresh(), tempo: 92, tonic: 2, mode: 'minor', scenes: ['intro', 'verse', 'chorus', 'bridge', 'chorus', 'outro'] };
  r.mus.keys.on = false;
  const p = P.build(r, { id: 'abcd1234', title: 'Essai' });
  assert.equal(p.id, 'abcd1234');
  assert.equal(p.tempo, 92);
  assert.ok(p.tracks.some((t) => t.type === 'drum'), 'batterie');
  assert.ok(p.tracks.some((t) => t.band.key === 'bass'), 'basse');
  assert.ok(!p.tracks.some((t) => t.band.key === 'keys'), 'pas de clavier');
  assert.deepEqual(p.scenes.map((s) => s.name), ['Intro', 'Couplet', 'Refrain', 'Pont', 'Fin']);
  assert.deepEqual(p.song.map((b) => p.scenes.find((s) => s.id === b.scene).name), ['Intro', 'Couplet', 'Refrain', 'Pont', 'Refrain', 'Fin']);
  assert.ok(p.scenes.every((s) => s.key.tonic === 'D' && s.key.mode === 'minor'));
  const bass = p.tracks.find((t) => t.band.key === 'bass');
  assert.ok(p.scenes.some((s) => s.data[bass.id].events.length), 'la basse joue');
  assert.deepEqual(P.clean(p.phone), P.clean(r), 'la recette est rangée dans la chanson');
});

test('recette lue : bornée, inutilisable → null', () => {
  assert.equal(P.clean(null), null);
  assert.equal(P.clean({ v: 99 }), null);
  const r = P.clean({ v: 1, tempo: 999, tonic: 40, mode: 'x', mus: { bass: { on: false, pick: 50 } }, scenes: ['verse', 'nope'] });
  assert.equal(r.tempo, P.TEMPO_MAX);
  assert.equal(r.tonic, 11);
  assert.equal(r.mode, 'major');
  assert.equal(r.mus.bass.on, false);
  assert.ok(r.mus.bass.pick < P.sounds('bass').length);
  assert.deepEqual(r.scenes, ['verse']);
  assert.equal(P.build({ ...r, scenes: [] }), null, 'sans scène, pas de chanson');
});

test('Qui joue quoi : ★ par scène, partie du modèle, motif choisi', () => {
  const r = P.fresh();
  for (const mu of ['drums', 'bass', 'keys']) {
    assert.ok(P.motifs(mu).length >= 10, `${mu} : des motifs`);
    for (const sc of ['intro', 'verse', 'chorus']) assert.ok(P.stars(mu, sc).every((id) => P.motifs(mu).includes(id)), `${mu} ${sc} : ★ jouables`);
  }
  assert.deepEqual(P.partLabel(r, 'bass', 'intro'), { id: null, name: 'Ne joue pas', plays: false }, 'le modèle ne fait pas jouer la basse dans l’intro');
  assert.equal(P.partLabel(r, 'bass', 'verse').name, 'Croches');
  assert.ok(P.motifs('bass').every((id) => SS.bassMotifs.fits(id, 16)), 'basse : motifs en 4/4 seulement');
  P.setPart(r, 'bass', 'verse', 'gallop');
  assert.equal(P.partLabel(r, 'bass', 'verse').name, 'Galop');
  P.setPart(r, 'bass', 'verse', null);
  assert.deepEqual(r.parts, {}, 'retour au modèle');
});

test('Qui joue quoi : les parties choisies changent la chanson, et seulement leur scène', () => {
  const r = P.fresh();
  const base = P.build(r);
  const ev = (p, key, sec) => {
    const t = p.tracks.find((x) => x.band.key === key);
    const d = p.scenes.find((s) => s.sec === sec).data[t.id];
    return JSON.stringify(d.steps || d.events);
  };
  P.setPart(r, 'bass', 'verse', 'gallop');
  P.setPart(r, 'drums', 'verse', P.stars('drums', 'verse')[1]);
  P.setPart(r, 'keys', 'verse', P.stars('keys', 'verse')[0]);
  P.setPart(r, 'keys', 'chorus', 'off');
  const p = P.build(r);
  assert.notEqual(ev(p, 'bass', 'verse'), ev(base, 'bass', 'verse'), 'basse du couplet');
  assert.notEqual(ev(p, 'drums:bd', 'verse'), ev(base, 'drums:bd', 'verse'), 'grosse caisse du couplet');
  assert.notEqual(ev(p, 'keys', 'verse'), ev(base, 'keys', 'verse'), 'clavier du couplet');
  assert.equal(ev(p, 'keys', 'chorus'), '[]', 'clavier coupé au refrain');
  assert.equal(ev(p, 'bass', 'intro'), ev(base, 'bass', 'intro'), 'intro inchangée');
  assert.deepEqual(P.clean(JSON.parse(JSON.stringify(p.phone))).parts, r.parts, 'les parties sont gardées dans la chanson');
  assert.deepEqual(P.clean({ ...r, parts: { verse: { bass: 'inconnu', keys: 'off' }, nope: { bass: 'off' } } }).parts, { verse: { keys: 'off' } });
});

test('Pas : la partie retouchée remplace le motif dans sa scène, et voyage avec la chanson', () => {
  const r = P.fresh();
  const base = P.build(r);
  const ev = (p, key, sec) => {
    const t = p.tracks.find((x) => x.band.key === key);
    const d = p.scenes.find((s) => s.sec === sec).data[t.id];
    return d.steps || d.events;
  };
  const drums = P.startEdit(r, 'drums', 'verse');
  assert.deepEqual(Object.keys(drums), ['K', 'S', 'H', 'O']);
  assert.ok(drums.K.includes('x'), 'départ : le groove du modèle');
  P.setEdit(r, 'drums', 'verse', { ...drums, K: 'x---x---x---x---' });
  assert.equal(P.toggleBass([], 4, 7).length, 1);
  P.setEdit(r, 'bass', 'intro', P.toggleBass(P.toggleBass([], 0, 0), 8, 7)); // le modèle ne fait pas jouer la basse dans l'intro
  const keys = P.toggleKeys(P.startEdit(r, 'keys', 'verse'), 2, 'lh');
  assert.equal(keys[2], 'B');
  P.setEdit(r, 'keys', 'verse', P.keysPat(keys));
  const p = P.build(r);
  assert.equal(ev(p, 'drums:bd', 'verse').slice(0, 16).map((v) => (v ? 1 : 0)).join(''), '1000100010001000');
  assert.deepEqual(ev(p, 'bass', 'intro').slice(0, 2).map((e) => [e.step, e.notes[0]]), [[0, 36], [8, 43]], 'Do puis Sol (quinte)');
  assert.notEqual(JSON.stringify(ev(p, 'keys', 'verse')), JSON.stringify(ev(base, 'keys', 'verse')));
  assert.equal(JSON.stringify(ev(p, 'bass', 'chorus')), JSON.stringify(ev(base, 'bass', 'chorus')), 'refrain inchangé');
  assert.deepEqual(Object.keys(p.bassMotifs), [P.bassId(r.edits.intro.bass)], 'la basse écrite voyage avec la chanson');
  assert.deepEqual(P.clean(JSON.parse(JSON.stringify(p.phone))).edits, r.edits);
  P.setPart(r, 'bass', 'intro', 'gallop');
  assert.equal(P.editOf(r, 'bass', 'intro'), null, 'un autre motif oublie la retouche');
  P.setPart(r, 'keys', 'verse', 'off');
  assert.ok(!ev(P.build(r), 'keys', 'verse').length, 'Ne joue pas l’emporte');
});

test('Jouer : accord du pas et lignes de basse', () => {
  const r = { ...P.fresh(), mode: 'minor', tonic: 9 };
  assert.equal(P.chordAt(r, 'verse', 0).name, 'Am');
  assert.equal(P.chordAt(r, 'verse', 16).name, 'F');
  assert.equal(P.rowSemis('t', P.chordAt(r, 'verse', 0)), 3);
  assert.equal(P.rowSemis('t', P.chordAt(r, 'verse', 16)), 4);
  assert.deepEqual(P.toggleBass([[0, 4, 0, 0.8]], 0, 0, { keep: true }), [[0, 4, 0, 0.8]], 'enregistré : la note reste');
  assert.deepEqual(P.toggleKeys(['C', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''], 0, 'rh', { tok: 'c', keep: true })[0], 'c');
});

test('Modifier une chanson existante : compatible ou non', () => {
  const r = { ...P.fresh(), tempo: 92, tonic: 2, mode: 'minor' };
  r.mus.drums.pick = 2;
  r.mus.keys.pick = 1;
  const d = JSON.parse(SS.serialize(P.build(r)));
  assert.equal(P.fromProject(d).phone, true, 'faite sur le téléphone');
  delete d.phone; // comme une chanson de l'assistant
  const x = P.fromProject(d);
  assert.equal(x.phone, false);
  assert.deepEqual([x.recipe.tempo, x.recipe.tonic, x.recipe.mode, x.recipe.scenes], [92, 2, 'minor', r.scenes]);
  assert.deepEqual(P.MUSICIANS.map((m) => x.recipe.mus[m.id]), P.MUSICIANS.map((m) => r.mus[m.id]), 'mêmes musiciens et mêmes sons');
  // motifs choisis dans l'assistant (brouillon rangé dans la chanson)
  const wd = { state: { w: { parts: { verse: { drums: { pattern: P.stars('drums', 'verse')[0], style: 'pop' }, inst: { 'bass:bass': { mode: 'gallop' }, 'keys:keys': { mode: 'block4', keys: { pat: 'C . . . C . . . C . . . C . . .' } } } }, chorus: { off: ['keys'] } } } } };
  const y = P.fromProject({ ...d, wizard: wd }).recipe;
  assert.equal(P.partLabel(y, 'bass', 'verse').name, 'Galop');
  assert.equal(P.partLabel(y, 'drums', 'verse').id, P.stars('drums', 'verse')[0]);
  assert.ok(P.editOf(y, 'keys', 'verse'), 'motif réécrit du Clavier');
  assert.equal(P.partLabel(y, 'keys', 'chorus').id, 'off');
  // incompatibles
  const no = (patch, msg) => assert.equal(P.fromProject({ ...d, ...patch }), null, msg);
  no({ timeSig: [3, 4] }, '3/4');
  no({ tracks: [...d.tracks, { type: 'instrument', name: 'Ajoutée', family: 'keys', instrument: 'piano' }] }, 'piste de la Grille');
  no({ tracks: [...d.tracks, { ...d.tracks[5], band: { ...d.tracks[5].band, key: 'lead' } }] }, 'autre musicien');
  no({ scenes: d.scenes.map((s, i) => (i ? s : { ...s, key: { tonic: 'E', mode: 'minor' } })) }, 'changement de tonalité');
  no({ scenes: d.scenes.map((s, i) => (i ? s : { ...s, sec: 'prechorus' })) }, 'type de scène inconnu');
});

test('Écoute : M et S coupent ou isolent un musicien sans toucher à la recette', () => {
  const P = SS.phoneSong;
  const r = P.fresh();
  const before = JSON.stringify(r);
  const proj = P.listenMix(P.build(r, { id: 't', title: 't' }), { mute: ['bass'], solo: [] });
  const role = (t) => t.band.key.split(':')[0];
  assert.ok(proj.tracks.some((t) => role(t) === 'bass'));
  proj.tracks.forEach((t) => assert.equal(t.mute, role(t) === 'bass'));
  P.listenMix(proj, { mute: [], solo: ['drums'] });
  proj.tracks.forEach((t) => {
    assert.equal(t.mute, false);
    assert.equal(t.solo, role(t) === 'drums');
  });
  assert.equal(JSON.stringify(r), before);
});

test('Accords par scène : palette, grilles toutes prêtes, chanson construite avec les accords choisis', () => {
  const P = SS.phoneSong;
  const r = P.fresh();
  assert.deepEqual(P.chordList(r, 'verse'), ['I', 'V', 'vi', 'IV']);
  assert.equal(P.chordsEdited(r, 'verse'), false);
  // palette en Do majeur
  const pal = P.palette(r);
  assert.deepEqual(pal.map((c) => c.name), ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'B°', 'G7', 'B♭', 'Fm', 'A♭', 'E']);
  // chaque grille toute prête redonne les accords de js/harmony.js
  const key = { tonic: 'C', mode: 'major' };
  const grids = P.readyGrids(r);
  assert.ok(grids.length >= 10);
  SS.harmony.progressions(key).forEach((pr) => {
    const g = grids.find((x) => x.id === pr.id);
    assert.ok(g, pr.id);
    pr.chords.forEach((c, i) => {
      const p = SS.bandSong.parseChord(g.toks[i], key);
      assert.equal(p.rootPc, c.rootPc, pr.id + ' ' + g.toks[i]);
      assert.equal(p.type, c.type, pr.id + ' ' + g.toks[i]);
    });
  });
  // accords choisis : affichés, construits, gardés en degrés quand la tonalité change
  P.setChords(r, 'verse', ['vi', 'IV', 'I', 'V', 'nimp']);
  assert.deepEqual(P.chordList(r, 'verse'), ['vi', 'IV', 'I', 'V']);
  assert.equal(P.chordsOf(r, 'verse'), 'Am · F · C · G');
  assert.equal(P.chordAt(r, 'verse', 16).name, 'F');
  r.tonic = 7;
  assert.equal(P.chordsOf(r, 'verse'), 'Em · C · G · D');
  r.tonic = 0;
  const proj = P.build(r, { id: 't', title: 't' });
  assert.ok(proj && proj.tracks.length);
  // relue (fichier, IndexedDB) : les accords restent
  assert.deepEqual(P.clean(JSON.parse(JSON.stringify(r))).chords, { verse: ['vi', 'IV', 'I', 'V'] });
  // pas plus d'accords que de mesures (Intro : 4)
  P.setChords(r, 'intro', ['I', 'ii', 'iii', 'IV', 'V', 'vi']);
  assert.equal(P.chordList(r, 'intro').length, 4);
  P.setChords(r, 'verse', null);
  assert.equal(P.chordsEdited(r, 'verse'), false);
});

test('Nappe (téléphone) : absente au départ et dans les recettes déjà faites, modèle par scène, motifs de nappe', () => {
  const r = P.fresh();
  assert.equal(r.mus.pad.on, false);
  const old = JSON.parse(JSON.stringify(r));
  delete old.mus.pad;
  assert.equal(P.clean(old).mus.pad.on, false, 'une chanson faite avant la Nappe ne la gagne pas');
  assert.equal(P.build(r, { id: 't', title: 't' }).tracks.some((t) => t.band.key === 'pad'), false);
  assert.equal(P.sounds('pad')[0].label, 'Cordes');
  r.mus.pad.on = true;
  assert.equal(P.clean(JSON.parse(JSON.stringify(r))).mus.pad.on, true);
  const evOf = (proj, sc) => {
    const t = proj.tracks.find((x) => x.band.key === 'pad');
    return proj.scenes.find((x) => x.sec === sc).data[t.id].events;
  };
  const proj = P.build(r, { id: 't', title: 't' });
  assert.ok(evOf(proj, 'verse').length && evOf(proj, 'verse').every((e) => e.len === 16), 'Couplet : accords tenus');
  assert.deepEqual(P.planPart('pad', 'intro'), { id: 'swell', name: 'Montée douce' });
  assert.ok(P.motifs('pad').includes('pulse8') && P.stars('pad', 'chorus').length);
  P.setPart(r, 'pad', 'verse', 'pulse8');
  assert.ok(evOf(P.build(r, { id: 't', title: 't' }), 'verse').every((e) => e.len === 2), 'Croches');
  P.setPart(r, 'pad', 'verse', 'off');
  assert.equal(evOf(P.build(r, { id: 't', title: 't' }), 'verse').length, 0);
  // relue par « Modifier » : la Nappe et sa partie restent
  P.setPart(r, 'pad', 'verse', 'pulse8');
  const back = P.fromProject(JSON.parse(SS.serialize(P.build(r, { id: 't', title: 't' }))));
  assert.equal(back.recipe.mus.pad.on, true);
});

test('Styles : Pop rock, Dance, Latino (salsa) donnent leur départ, leurs sons, leurs motifs et une chanson qui joue', () => {
  assert.deepEqual(P.STYLES.map((s) => s.id), ['pop', 'dance', 'latin']);
  // une recette d'avant les styles reste en Pop rock
  const old = P.fresh();
  delete old.style;
  assert.equal(P.clean(old).style, 'pop');
  const role = (t) => t.band.key.split(':')[0];
  P.STYLES.forEach((st) => {
    const r = P.fresh(st.id);
    assert.equal(r.style, st.id);
    assert.equal(r.tempo, st.tempo);
    assert.equal(r.mus.pad.on, !!st.padOn);
    r.mus.pad.on = true;
    r.scenes = ['intro', 'verse', 'chorus', 'bridge', 'outro'];
    const proj = P.build(r, { id: 't', title: 't' });
    assert.ok(proj, st.id);
    assert.ok(proj.tracks.every((t) => t.band.style === st.band), st.id + ' : pistes du modèle');
    // chaque musicien qui joue dans le modèle a des notes dans la scène
    proj.scenes.forEach((sc) => {
      ['drums', 'bass', 'keys', 'pad'].forEach((mu) => {
        const n = proj.tracks.filter((t) => role(t) === mu).reduce((a, t) => a + (((sc.data[t.id] || {}).events || []).length + ((sc.data[t.id] || {}).steps || []).filter(Boolean).length), 0);
        assert.equal(n > 0, P.partLabel(r, mu, sc.sec).plays, `${st.id} ${sc.sec} ${mu}`);
      });
    });
    ['drums', 'bass', 'keys', 'pad'].forEach((mu) => {
      assert.ok(P.motifs(mu, r).length, `${st.id} ${mu} : motifs`);
      assert.ok(P.stars(mu, 'verse', r).every((id) => P.motifs(mu, r).includes(id)), `${st.id} ${mu} : ★ parmi les motifs`);
      assert.ok(P.sounds(mu, r).every((s) => !s.tok.startsWith('j:')), 'pas de Juno');
    });
    // relue par Modifier (chanson du téléphone, puis chanson de l'assistant du même modèle)
    assert.equal(P.fromProject(JSON.parse(SS.serialize(proj))).recipe.style, st.id);
    const pc = JSON.parse(SS.serialize(proj));
    delete pc.phone;
    assert.equal(P.fromProject(pc).recipe.style, st.id);
  });
  assert.equal(P.planPart('bass', 'verse', P.fresh('latin')).id, 'tumbao23');
  assert.equal(P.planPart('keys', 'verse', P.fresh('dance')).id, 'house');
  assert.equal(P.chordsOf(P.fresh('latin'), 'chorus'), 'Am · Dm · E7 · Am');
});

test('Musiciens : ajouter et retirer, un second Clavier avec sa propre partie', () => {
  const r = P.fresh();
  assert.deepEqual(P.players(r).map((m) => m.id), ['drums', 'bass', 'keys']);
  assert.equal(P.canAdd(r, 'drums'), false, 'une seule Batterie');
  assert.equal(P.addPlayer(r, 'keys'), 'keys2');
  assert.equal(P.playerInfo('keys2').label, 'Clavier 2');
  assert.equal(P.canAdd(r, 'keys'), false, 'deux Claviers au plus');
  // Clavier 2 : sa propre piste (musicien ajouté x2), sa partie dans chaque scène, autre que celle du Clavier
  let proj = P.build(r);
  const k2 = proj.tracks.find((t) => P.playerOfTrack(t) === 'keys2');
  assert.equal(k2.band.musician, 'x2');
  const verse = proj.scenes.find((s) => s.sec === 'verse');
  assert.ok(verse.data[k2.id].events.length > 0);
  assert.notEqual(P.planPart('keys2', 'verse', r).id, P.planPart('keys', 'verse', r).id);
  // une partie à lui : « Ne joue pas » ne fait taire que lui
  P.setPart(r, 'keys2', 'verse', 'off');
  proj = P.build(r);
  const v2 = proj.scenes.find((s) => s.sec === 'verse');
  const k1 = proj.tracks.find((t) => P.playerOfTrack(t) === 'keys');
  assert.equal(v2.data[proj.tracks.find((t) => P.playerOfTrack(t) === 'keys2').id].events.length, 0);
  assert.ok(v2.data[k1.id].events.length > 0, 'le Clavier joue encore');
  // M et S par musicien
  P.listenMix(proj, { mute: ['keys2'], solo: [] });
  proj.tracks.forEach((t) => assert.equal(t.mute, P.playerOfTrack(t) === 'keys2'));
  // retour sur le téléphone, et depuis l'ordinateur (musicien ajouté de l'assistant)
  const d = JSON.parse(SS.serialize(proj));
  assert.deepEqual(P.players(P.fromProject(d).recipe).map((m) => m.id), ['drums', 'bass', 'keys', 'keys2']);
  delete d.phone;
  assert.deepEqual(P.players(P.fromProject(d).recipe).map((m) => m.id), ['drums', 'bass', 'keys', 'keys2']);
  assert.equal(P.fromProject({ ...d, tracks: [...d.tracks, { ...k2, id: 'zz', band: { ...k2.band, musician: 'x7' } }] }), null, 'trois Claviers');
  // retirer oublie ses parties et ses retouches ; il reste toujours un musicien
  P.setEdit(r, 'keys2', 'chorus', 'C . . . C . . . C . . . C . . .');
  assert.equal(P.hasEdits(r, 'keys2'), true);
  P.removePlayer(r, 'keys2');
  assert.equal(P.hasEdits(r, 'keys2'), false);
  assert.equal(P.partLabel(r, 'keys2', 'verse').id, null);
  // 6 au plus ; une recette d'avant reste la même
  ['bass', 'pad', 'keys', 'pad'].forEach((k) => P.addPlayer(r, k));
  assert.equal(P.players(r).length, P.MAX_PLAYERS);
  assert.equal(P.addPlayer(r, 'bass'), null);
  const old = { v: 1, tempo: 100, tonic: 0, mode: 'major', mus: { drums: { on: true, pick: 0 }, bass: { on: true, pick: 0 }, keys: { on: true, pick: 0 } }, scenes: ['verse'] };
  assert.deepEqual(P.players(P.clean(old)).map((m) => m.id), ['drums', 'bass', 'keys']);
});
