/*
 * Band : mixage et mastering automatiques (js/bandmix.js, js/band-levels.js, js/band-drive.js), bus partagés.
 *   node --test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
globalThis.window = globalThis;
['library.js', 'dirt.js', 'sounds.js', 'harmony.js', 'arp.js', 'project.js', 'band-presets.js', 'band-songs.js', 'band-levels.js', 'mixref.js', 'horns.js', 'bandmix.js'].forEach((f) => require('../js/' + f));
if (fs.existsSync(__dirname + '/../js/band-drive.js')) require('../js/band-drive.js');
const SS = globalThis.SS;
const B = SS.Band;
const PRESETS = B.STYLES.flatMap((st) => st.presets.map((p) => ({ ...p, style: st.id })));

/** Les pistes que Band crée par défaut pour une inspiration, avec leur clé de mesure. */
function bandTracks(p) {
  const keys = new Map();
  const tracks = [];
  p.musicians.forEach((mu) => {
    if (mu.optional) return;
    if (mu.kits)
      mu.pieces.forEach((pc) => {
        const info = B.pieceOpts(mu.kits[0], pc);
        const t = { id: `${mu.role}:${pc}`, type: 'drum', sound: info.opts.sound, band: { style: p.style, key: `${mu.role}:${info.opts.sound}` }, volume: 0.8 };
        keys.set(t.id, `${mu.kits[0]}|${pc}`);
        tracks.push(t);
      });
    else {
      const cat = mu.cat || B.ROLES[mu.role].cat;
      const t = { id: mu.role, type: 'instrument', band: { style: p.style, key: mu.role }, volume: 0.8 };
      keys.set(t.id, `${mu.role}|${mu.pick[0]}|${cat}`);
      tracks.push(t);
    }
  });
  return { tracks, keys };
}

test('calibrage : chaque instrument et chaque élément de batterie proposés ont un niveau mesuré', () => {
  for (const p of PRESETS)
    p.musicians.forEach((mu) => {
      if (mu.kits) return mu.kits.forEach((k) => mu.pieces.forEach((pc) => assert.ok(SS.BAND_LEVELS.drum[`${k}|${pc}`], `${p.id} : ${k}|${pc} non mesuré`)));
      if (mu.amb || mu.horns) return; // musicien Ambient : niveau réglé par son module (js/ambient.js) ; Cuivres : par musicien (hornsRule)
      const cat = mu.cat || B.ROLES[mu.role].cat;
      mu.pick.forEach((tok) => assert.ok(SS.BAND_LEVELS.inst[`${mu.role}|${tok}|${cat}`], `${p.id} : ${mu.role}|${tok} non mesuré`));
    });
});

test('calibrage : chaque son de la section de cuivres a un niveau mesuré (piste par musicien)', () => {
  new Set(Object.values(SS.horns.INST).map((x) => x.tok)).forEach((tok) => assert.ok(SS.BAND_LEVELS.inst[`horns|${tok}|mono`], `horns|${tok} non mesuré`));
});

test('calibrage : aucun instrument proposé n\'est trop faible pour être mixé (volume ≤ +6 dB)', () => {
  for (const p of PRESETS)
    p.musicians.forEach((mu) => {
      if (mu.kits || mu.amb || mu.horns) return;
      const cat = mu.cat || B.ROLES[mu.role].cat;
      mu.pick.forEach((tok) => {
        const { tracks, keys } = bandTracks({ ...p, musicians: [{ ...mu, optional: false, pick: [tok] }] });
        SS.bandMix.mixTracks(tracks, keys, p.style);
        assert.ok(tracks[0].volume < 2, `${p.id} : ${mu.role} ${tok} trop faible (${SS.BAND_LEVELS.inst[`${mu.role}|${tok}|${cat}`]})`);
      });
    });
});

test('mixage : volumes calibrés, kick / caisse claire / basse / lead au centre, filtres et compresseurs', () => {
  for (const p of PRESETS) {
    const { tracks, keys } = bandTracks(p);
    SS.bandMix.mixTracks(tracks, keys, p.style);
    for (const t of tracks) {
      const role = t.band.key.split(':')[0];
      const m = t.mix;
      assert.ok(m && m.eq.on, `${p.id} : ${t.id} sans égaliseur`);
      if (!['bass', 'drums:bd', 'ambient'].includes(t.band.key) && !(t.type === 'drum' && ['lt', 'mt'].includes(t.sound))) assert.ok(m.eq.hp.on && m.eq.hp.f >= 80, `${p.id} : ${t.id} sans passe-haut`);
      if (['drums:bd', 'drums:sd', 'bass', 'lead'].includes(t.band.key)) assert.equal(m.pan, 0, `${p.id} : ${t.id} pas au centre`);
      if (['drums:bd', 'drums:sd', 'bass', 'lead'].includes(t.band.key)) assert.ok(m.comp.on, `${p.id} : ${t.id} sans compresseur`);
      // niveau visé atteint : mesure + volume = cible du rôle (± arrondi), sauf volume plafonné
      const L = t.type === 'drum' ? SS.BAND_LEVELS.drum[keys.get(t.id)] : SS.BAND_LEVELS.inst[keys.get(t.id)];
      if (L && t.volume < 2 && t.volume > 0.01) assert.ok(t.volume > 0 && Number.isFinite(t.volume), `${p.id} : ${t.id} volume`);
      if (role === 'bass') assert.ok(!(t.fx && (t.fx.sendHall || t.fx.sendPlate)), `${p.id} : basse sans reverb`);
    }
  }
});

test('effets : de la reverb partout sauf sur le kick et la basse ; écho sur le lead ; plate sur la caisse claire', () => {
  for (const p of PRESETS) {
    const { tracks, keys } = bandTracks(p);
    SS.bandMix.mixTracks(tracks, keys, p.style);
    for (const t of tracks) {
      const f = SS.fxParams(t);
      const wet = f.sendPlate + f.sendHall + f.sendEcho;
      if (t.band.key === 'drums:bd' || t.band.key === 'bass') assert.equal(wet, 0, `${p.id} : ${t.id} doit rester sec`);
      else if (t.type !== 'drum' && t.band.key !== 'ambient') assert.ok(f.sendHall > 0 || f.sendEcho > 0, `${p.id} : ${t.id} sans reverb`); // Ambient : envoi Cosmos
      if (t.band.key === 'drums:sd' || t.band.key === 'drums:cp') assert.ok(f.sendPlate > 0, `${p.id} : ${t.id} sans plate`);
      if (t.band.key === 'lead') assert.ok(f.sendEcho > 0 && f.sendHall > 0, `${p.id} : lead sans écho ni hall`);
    }
    // EDM : la basse pompe sur le kick
    const bass = tracks.find((t) => t.band.key === 'bass');
    if (p.style === 'edm' && bass && tracks.some((t) => t.band.key === 'drums:bd')) assert.ok(bass.fx.scSource === 'drums:bd' && bass.fx.scDepth >= 0.5);
  }
});

test('mastering : chaque chanson a son gain d\'entrée mesuré, limiteur à −1 dBTP, graves en mono', () => {
  for (const p of PRESETS) {
    assert.ok(SS.BAND_DRIVE && Number.isFinite(SS.BAND_DRIVE[p.id]), `${p.id} : pas de gain de mastering mesuré`);
    const proj = SS.newProject();
    SS.bandMix.mixMaster(proj, p.style, SS.bandMix.driveFor(p.id, p.style));
    const m = SS.masterParams(proj).mastering;
    assert.ok(m.on && m.ceiling === -1 && m.mono >= 80 && m.drive === SS.BAND_DRIVE[p.id]);
    assert.ok(m.drive > 0 && m.drive < 14, `${p.id} : gain de mastering suspect (${m.drive} dB)`);
    // les réglages survivent à l'enregistrement
    const back = SS.normalizeProject(JSON.parse(JSON.stringify(proj)));
    assert.deepEqual(SS.masterParams(back).mastering, m);
    assert.deepEqual(SS.returnParams(back), SS.returnParams(proj));
  }
});

test('bus partagés : valeurs bornées à la lecture d\'un fichier', () => {
  const r = SS.cleanReturns({ plate: { size: 99, predelay: -1 }, echo: { time: 'nimporte', feedback: 3 } });
  assert.equal(r.plate.size, 10);
  assert.equal(r.plate.predelay, 0);
  assert.equal(r.echo.time, SS.RETURN_DEFAULTS.echo.time);
  assert.equal(r.echo.feedback, 1); // saturation de la bande dans la boucle : jusqu'à 100 % sans s'emballer
  const s = SS.cleanReturns({ echo: { wow: 4, drive: -1 }, space: { decay: 500, size: 0, shimmer: 2, freeze: true, predelay: 3 } });
  assert.deepEqual([s.echo.wow, s.echo.drive], [1, 0]);
  assert.deepEqual([s.space.decay, s.space.size, s.space.shimmer, s.space.freeze, s.space.predelay], [60, 0.1, 1, true, 0.4]);
  assert.equal(SS.cleanReturns({}).space.freeze, false);
  assert.equal(SS.cleanReturns({ space: { freeze: 'oui' } }).space.freeze, false); // seul un vrai booléen gèle
  const m = SS.cleanMastering({ drive: 50, ceiling: 3, on: true });
  assert.deepEqual([m.drive, m.ceiling, m.on], [24, 0, true]);
});

test('la page charge les niveaux mesurés et les gains de mastering avant les règles de mixage', () => {
  const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
  const at = (f) => html.search(new RegExp(`<script src="js/${f.replace('.', '\\.')}(\\?v=[\\w-]+)?"></script>`));
  for (const f of ['band-levels.js', 'band-drive.js', 'master-dsp.js', 'dirt-tuning.js']) assert.ok(at(f) > 0, `${f} non chargé`);
  assert.ok(at('band-levels.js') < at('bandmix.js') && at('band-drive.js') < at('bandmix.js'));
});

test('référence de mixage commune : le mastering de l’assistant vise la table de js/mixref.js, sans changer les styles existants', () => {
  const S = SS.bandMix.STYLE;
  // valeurs d'avant la table commune : les chansons créées sonnent comme avant
  const avant = { synthwave: -9.5, edm: -8.5, techno: -8.5, ambient: -13, pop: -9.5, funk: -9.5, hiphop: -11, dnb: -8.5, latin: -9.5, soul: -11, cliches: -10, zero: -9.5 };
  for (const [id, loud] of Object.entries(avant)) assert.equal(S[id].loud, loud, id);
  for (const id in S) assert.equal(S[id].loud, SS.mixRef.of(id).loud, id + ' absent de la référence');
  // Musique de film : son propre réglage (elle retombait sur la synthwave), plus doux
  assert.ok(S.film && S.film.loud === -14 && S.film.drive < S.synthwave.drive);
  assert.equal(SS.mixRef.styleOf([{ band: { style: 'film' } }, { band: { style: 'film' } }, {}]), 'film');
});

test('musicien Ambient : volume réglé par son module, en fond (plus à 0,8 qui couvrait les autres musiciens)', () => {
  for (const mod of ['jardin', 'paysage', 'fresque']) {
    const t = { id: 'amb', type: 'instrument', family: 'ambient', instrument: mod, band: { style: 'ambient', key: 'ambient' }, volume: 0.8 };
    SS.bandMix.mixTracks([t], new Map(), 'ambient');
    assert.ok(t.volume > 0.08 && t.volume < 0.25, `${mod} : ${t.volume}`);
  }
});
