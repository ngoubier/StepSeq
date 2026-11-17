/*
 * Étape Mix de l'assistant (js/wizmix.js) : modèle, surcharges de scène, application et aperçu — sans navigateur.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
['library.js', 'dirt.js', 'sounds.js', 'harmony.js', 'arp.js', 'project.js', 'band-presets.js', 'band-songs.js', 'band-levels.js', 'band-drive.js', 'bandmix.js', 'drum-patterns.js', 'bandsong.js', 'wizmix.js'].forEach((f) => require('../js/' + f));
const SS = globalThis.SS;
const B = SS.Band;
const W = SS.wizMix;
const clone = (x) => JSON.parse(JSON.stringify(x));

/** Pistes « de l'assistant » (c.o) d'une inspiration : { type, band, levelKey }. */
function wizTracks(p, style) {
  const out = [];
  p.musicians.forEach((mu) => {
    if (mu.optional) return;
    if (mu.kits)
      mu.pieces.forEach((pc) => {
        const info = B.pieceOpts(mu.kits[0], pc);
        out.push({ ...info.opts, band: { style, key: `${mu.role}:${info.opts.sound}`, musician: mu.role }, levelKey: `${mu.kits[0]}|${pc}` });
      });
    else {
      const cat = mu.cat || B.ROLES[mu.role].cat;
      const o = B.choiceOpts(mu.pick[0], cat);
      out.push({ ...o, category: cat, band: { style, key: mu.role, musician: mu.role }, levelKey: `${mu.role}|${mu.pick[0]}|${cat}` });
    }
  });
  return out;
}

/** Comme addBandSong (js/main.js) : un projet Band mixé automatiquement. */
function makeSong(styleId, n = 0) {
  const st = B.STYLES.find((s) => s.id === styleId);
  const p = st.presets[n];
  const list = wizTracks(p, styleId);
  const project = SS.newProject();
  const levelKeys = new Map();
  project.tracks = list.map((o) => {
    const t = SS.newTrack(o, project);
    t.band = { ...o.band };
    levelKeys.set(t.id, o.levelKey);
    return t;
  });
  const res = SS.bandSong.build(SS.BandSongs[p.id], p.id, project.tracks, {});
  project.scenes = res.scenes.map(({ sec, spans, ...sc }) => sc); // eslint-disable-line no-unused-vars
  project.song = res.song;
  SS.bandMix.mixTracks(project.tracks, levelKeys, styleId);
  SS.bandMix.mixMaster(project, styleId, 0);
  return { project, res, list, style: styleId };
}

test('identifiants : un par élément de batterie réellement joué, puis les rôles', () => {
  const { project, list } = makeSong('synthwave');
  const ids = W.strips(list).map((s) => s.id);
  const drums = project.tracks.filter((t) => t.band.key.startsWith('drums:')).length;
  assert.equal(ids.filter((i) => !['bass', 'pad', 'arp', 'lead', 'keys', 'guitar', 'strings', 'sax', 'vox', 'fx'].includes(i)).length, drums);
  assert.ok(ids.includes('kick') && ids.includes('snare') && ids.includes('bass'));
  assert.equal(W.idOf({ band: { key: 'drums:cp' } }), 'clap');
  assert.equal(W.idOf({ band: { key: 'perc:cb' } }), 'perc:cb');
  assert.equal(W.idOf({}), null);
  const s = W.strips(list);
  assert.equal(s[0].group, 'drums');
  assert.equal(s[0].name, 'Kick');
});

test('defaults : reprend le mixage automatique (volume en dB, pan, eq, comp, envois, sidechain)', () => {
  for (const style of ['synthwave', 'edm', 'techno', 'ambient']) {
    const { project, list } = makeSong(style);
    const mix = W.defaults(style, list);
    assert.deepEqual(Object.keys(mix.tracks).sort(), [...new Set(project.tracks.map(W.idOf))].sort(), style);
    for (const t of project.tracks) if (typeof t.volume === 'number') assert.ok(Math.abs(mix.tracks[W.idOf(t)].vol - 20 * Math.log10(t.volume)) < 0.02, style + ' ' + t.band.key);
    const T = mix.tracks;
    if (T.kick) {
      assert.equal(T.kick.pan, 0);
      assert.equal(T.kick.fx.comp.on, true);
      assert.equal(T.kick.fx.eq.on, true);
    }
    if (T.hh) assert.equal(T.hh.pan, 0.25);
    if (T.snare) assert.equal(T.snare.fx.sends.plate > 0, true);
    assert.equal(mix.master.fx.comp.on, true);
    assert.equal(mix.master.vol, 0);
    assert.deepEqual(mix.tracks, mix.base.tracks);
    assert.deepEqual(mix.own, {});
  }
  const e = W.defaults('edm', makeSong('edm').list).tracks;
  assert.ok(Object.values(e).some((s) => s.fx.sidechain.on));
  const a = W.defaults('ambient', makeSong('ambient').list).tracks;
  assert.ok(Object.values(a).every((s) => !s.fx.sidechain.on));
});

test('apply : mix non retouché => projet strictement identique (tous les styles)', () => {
  for (const style of ['synthwave', 'edm', 'techno', 'ambient']) {
    const { project, res, list } = makeSong(style);
    const before = JSON.stringify(project);
    const mix = W.defaults(style, list);
    const rep = W.apply(project, mix, res.scenes);
    assert.equal(JSON.stringify(project), before, style);
    assert.deepEqual(rep, { changed: 0, automated: 0, ignored: [] });
  }
});

test('eff / set / reset / ownCount / copyToSameType', () => {
  const { list } = makeSong('synthwave');
  const mix = W.defaults('synthwave', list);
  const v0 = mix.tracks.pad.vol;
  W.set(mix, 'intro', 'pad', 'vol', -20);
  W.set(mix, 'intro', 'pad', ['fx', 'filter', 'on'], true);
  W.set(mix, 'intro', 'pad', 'fx.filter.cut', 35);
  assert.equal(W.eff(mix, 'intro', 'pad').vol, -20);
  assert.equal(W.eff(mix, 'verse', 'pad').vol, v0);
  assert.equal(W.eff(mix, 'song', 'pad').vol, v0);
  assert.equal(W.eff(mix, 'intro', 'pad').fx.filter.cut, 35);
  assert.equal(W.eff(mix, 'intro', 'pad').fx.chorus.mix, mix.tracks.pad.fx.chorus.mix); // fusion profonde
  assert.equal(mix.tracks.pad.vol, v0);
  assert.equal(W.ownCount(mix, 'intro'), 3);
  assert.equal(W.ownCount(mix, 'verse'), 0);
  assert.equal(W.copyToSameType(mix, 'intro', ['intro', 'outro', 'bridge']), 2);
  assert.equal(W.ownCount(mix, 'outro'), 3);
  W.reset(mix, 'outro', 'pad');
  assert.equal(W.ownCount(mix, 'outro'), 0);
  W.reset(mix, 'intro');
  assert.equal(W.ownCount(mix, 'intro'), 0);
  W.set(mix, 'song', 'master', 'vol', 1.5);
  assert.equal(W.eff(mix, 'bridge', 'master').vol, 1.5);
});

test('apply : réglages de la chanson (volume, pan, comp, chorus, envois) sur les bonnes pistes', () => {
  const { project, res, list } = makeSong('synthwave');
  const mix = W.defaults('synthwave', list);
  const snare = project.tracks.find((t) => t.band.key === 'drums:sd');
  const kick = project.tracks.find((t) => t.band.key === 'drums:bd');
  const v0 = snare.volume;
  const kv = kick.volume;
  W.set(mix, 'song', 'snare', 'vol', mix.tracks.snare.vol + 6);
  W.set(mix, 'song', 'snare', 'pan', 0.4);
  W.set(mix, 'song', 'snare', 'fx.sends.hall', 50);
  W.set(mix, 'song', 'snare', 'fx.chorus.on', true);
  W.set(mix, 'song', 'snare', 'fx.comp.amount', 100);
  W.set(mix, 'song', 'master', 'fx.eq.high', 4);
  const rep = W.apply(project, mix, res.scenes);
  assert.ok(Math.abs(snare.volume / v0 - 2) < 0.01);
  assert.equal(snare.mix.pan, 0.4);
  assert.equal(snare.fx.sendHall, 0.5);
  assert.equal(snare.fx.chorus, 0.3);
  assert.equal(snare.mix.comp.ratio, 6);
  assert.equal(kick.volume, kv); // les autres éléments de batterie ne bougent pas
  assert.equal(project.master.mix.eq.high.g, 4 + 0 * 1 + (project.master.mix.eq.high.g - 4));
  assert.ok(rep.changed >= 5);
  assert.equal(rep.automated, 0);
});

test('apply : surcharges de scène => automation (volume, muet, envois, filtre), le reste est signalé', () => {
  const { project, res, list } = makeSong('techno');
  const mix = W.defaults('techno', list);
  const lead = project.tracks.find((t) => t.band.key === 'lead');
  const pad = project.tracks.find((t) => t.band.key === 'pad');
  const bass = project.tracks.find((t) => t.band.key === 'bass');
  const secs = res.scenes.map((s) => s.sec);
  const s0 = res.scenes[0];
  const s1 = res.scenes.find((s) => s.sec !== s0.sec);
  const base = pad.volume;
  const bdb = mix.tracks.pad.vol;
  W.set(mix, s0.sec, 'pad', 'vol', bdb - 6); // plus bas dans la 1re scène
  W.set(mix, s0.sec, 'pad', 'fx.sends.echo', 30);
  W.set(mix, s0.sec, 'pad', 'fx.filter.on', true);
  W.set(mix, s0.sec, 'pad', 'fx.filter.cut', 40);
  W.set(mix, s0.sec, 'pad', 'pan', -0.8);
  W.set(mix, s1.sec, 'bass', 'mute', true);
  const rep = W.apply(project, mix, res.scenes);
  assert.equal(pad.volume, base); // fixe = scène la plus forte (la chanson)
  const d0 = project.scenes.find((s) => s.id === s0.id).data[pad.id];
  assert.ok(Math.abs(d0.auto.volume[0] - Math.pow(10, -6 / 20)) < 0.002);
  assert.equal(d0.auto.filter[0], -0.6);
  assert.equal(d0.auto.echo[0] > 0.29 && d0.auto.echo[0] <= 0.3 + 1e-9, true);
  const d1 = project.scenes.find((s) => s.id === s1.id).data[bass.id];
  assert.equal(d1.auto.volume[0], 0);
  assert.ok(!bass.mute);
  assert.ok(rep.ignored.some((x) => x.scene === s0.sec && x.track === 'pad' && x.param === 'pan'));
  assert.ok(secs.length > 1 && lead);
  // la scène 0 baisse, la scène 1 reste à 1 : pas de courbe de volume ajoutée là où rien n'est surchargé
  const d1p = project.scenes.find((s) => s.id === s1.id).data[pad.id];
  assert.ok(!d1p.auto || !d1p.auto.volume || Object.values(d1p.auto.volume).every((v) => v <= 1));
});

test('apply : une scène plus forte que la chanson relève le volume fixe et atténue les autres', () => {
  const { project, res, list } = makeSong('synthwave');
  const mix = W.defaults('synthwave', list);
  const lead = project.tracks.find((t) => t.band.key === 'lead');
  const v0 = lead.volume;
  const chorus = res.scenes.find((s) => s.sec === 'chorus') || res.scenes[1];
  W.set(mix, chorus.sec, 'lead', 'vol', mix.tracks.lead.vol + 6);
  W.apply(project, mix, res.scenes);
  assert.ok(Math.abs(lead.volume / v0 - 2) < 0.01);
  const other = res.scenes.find((s) => s.id !== chorus.id);
  const d = project.scenes.find((s) => s.id === other.id).data[lead.id];
  assert.ok(Math.abs(d.auto.volume[0] - 0.5) < 0.01);
  assert.equal(project.scenes.find((s) => s.id === chorus.id).data[lead.id].auto, undefined);
});

test('preview : gain relatif au mixage automatique, pan, muet et solo', () => {
  const { list } = makeSong('synthwave');
  const mix = W.defaults('synthwave', list);
  let pv = W.preview(mix, 'verse');
  assert.equal(pv.tracks.kick.gainDb, 0);
  assert.equal(pv.tracks.kick.gain, 1);
  assert.equal(pv.tracks.kick.audible, true);
  W.set(mix, 'verse', 'kick', 'vol', mix.tracks.kick.vol - 6);
  W.set(mix, 'song', 'bass', 'solo', true);
  W.set(mix, 'verse', 'pad', 'mute', true);
  pv = W.preview(mix, 'verse');
  assert.ok(Math.abs(pv.tracks.kick.gain - 0.501) < 0.01);
  assert.equal(pv.anySolo, true);
  assert.equal(pv.tracks.bass.audible, true);
  assert.equal(pv.tracks.kick.audible, false);
  assert.equal(W.preview(mix, 'intro').tracks.kick.gainDb, 0);
  assert.equal(W.preview(mix, null).tracks.pad.mute, false);
  assert.equal(pv.tracks.pad.audible, false);
  assert.equal(pv.master.gain, 1);
});

test('sync : garde les réglages des pistes conservées, ajoute les nouvelles, abandonne les retirées', () => {
  const { list } = makeSong('synthwave');
  const mix = W.defaults('synthwave', list);
  W.set(mix, 'song', 'bass', 'vol', -3);
  W.set(mix, 'intro', 'arp', 'vol', -30);
  const fewer = list.filter((t) => t.band.key !== 'arp' && t.band.key !== 'drums:oh');
  const m2 = W.sync(mix, 'synthwave', fewer);
  assert.equal(m2.tracks.bass.vol, -3);
  assert.ok(!m2.tracks.arp && !m2.own.intro);
  assert.ok(!m2.tracks.oh);
  assert.deepEqual(clone(W.sync(m2, 'synthwave', list).tracks.arp), clone(mix.base.tracks.arp));
});
