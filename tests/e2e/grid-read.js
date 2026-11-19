/*
 * Test de bout en bout : l'assistant relit la grille (js/band.js showGridRead) et garde les pistes verrouillées 🔒 :
 *   node tests/e2e/grid-read.js [dossier-captures]
 * Grille faite à la main (2 scènes, arrangement, tempo, tonalité, accords, batterie, basse, lead) → fenêtre « Reprendre la
 * grille » ; batterie et basse sont confiées à l'assistant, le lead verrouillé ; tempo, scènes, arrangement, accords repris ; le lead
 * s'entend dans l'écoute et reste tel quel à la création ; on ne redemande pas tant que la grille ne change pas.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const SHOTS = process.argv[2];
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.otf': 'font/otf' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
const ok = (c, m) => {
  console.log((c ? 'OK   ' : 'FAIL ') + m);
  if (!c) process.exitCode = 1;
};

(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.accept());
  const shot = (n) => SHOTS && page.screenshot({ path: path.join(SHOTS, n) });
  const url = `http://localhost:${server.address().port}/index.html`;
  const P = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));
  await page.goto(url);
  await page.waitForTimeout(800);
  const LEAD = [76, 74, 72, 71];
  await page.evaluate((LEAD) => {
    const p = SS.newProject();
    p.title = 'Grille à relire';
    p.tempo = 104;
    p.bars = 4;
    const add = (o) => {
      const t = SS.newTrack(o, p);
      p.tracks.push(t);
      return t;
    };
    const kick = add({ type: 'drum', name: 'Kick', source: 'tdm', sound: 'bd', machine: 'RolandTR808' });
    const bass = add({ type: 'instrument', name: 'Basse', family: 'bass', instrument: SS.findFamily('bass').instruments[0].id });
    const lead = add({ type: 'instrument', name: 'Lead', family: 'synth', instrument: SS.findFamily('synth').instruments[0].id });
    const fill = (k) => {
      kick.steps = new Array(64).fill(0).map((_, i) => (i % 4 === 0 ? 1 : 0));
      bass.events = [{ step: 0, len: 8, notes: [33 + k], vel: 1 }];
      lead.events = LEAD.map((n, i) => ({ step: i * 4, len: 3, notes: [n + k], vel: 1 }));
    };
    const key = { tonic: 'A', mode: 'minor' };
    const A = { id: SS.uid(), name: 'Couplet', bars: 4, key, data: {} };
    const B = { id: SS.uid(), name: 'Refrain', bars: 4, key, data: {}, grid: { chords: [5, 6, 0, 4].map((d, i) => ({ step: i * 16, len: 16, degree: d, type: d === 0 || d === 4 ? 'min' : 'maj', acc: 0 })), initialized: true } };
    p.scenes = [A, B];
    fill(0);
    A.data = SS.snapshotTracks(p);
    fill(0);
    B.data = SS.snapshotTracks(p);
    p.current = A.id;
    SS.loadScene(p, A.id, { commit: false });
    p.song = [{ scene: A.id, repeat: 1 }, { scene: B.id, repeat: 2 }];
    localStorage.setItem('stepseq.autosave', SS.serialize(p));
  }, LEAD);
  await page.goto(url);
  await page.waitForTimeout(1200);
  const ids = (await P()).tracks.map((t) => t.id);
  await page.click('#viewWiz');
  await page.waitForTimeout(700);
  ok(await page.isVisible('#brgGo'), 'grille faite à la main : fenêtre « Reprendre la grille dans l’assistant »');
  const items = await page.evaluate(() => [...document.querySelectorAll('.brg-item input')].map((x) => x.dataset.k));
  ok(['tempo', 'chords', 'struct'].every((k) => items.includes(k)), 'repris : ' + items.join(', '));
  const lockOf = (id) => page.evaluate((id) => document.querySelector(`.brg-row[data-id="${id}"]`).classList.contains('locked'), id);
  ok((await lockOf(ids[0])) && (await lockOf(ids[1])) && (await lockOf(ids[2])), 'pistes avec des notes écrites à la main : verrouillées par défaut');
  await page.click(`.brg-row[data-id="${ids[0]}"] button[data-v="false"]`);
  await page.click(`.brg-row[data-id="${ids[1]}"] button[data-v="false"]`);
  await shot('grille-relue-fenetre.png');
  await page.click('#brgGo');
  await page.waitForTimeout(600);
  const w = await page.evaluate(() => {
    const W = SS.band._state.wiz;
    return { tempo: W.tempo, form: W.form, secs: W.secs, grids: Object.keys(W.grids).length, locks: Object.keys(W.locks), skey: W.skey };
  });
  ok(w.tempo === 104, 'tempo repris (104)');
  ok(w.form && w.form.length === 2 && w.form[1].repeat === 2, 'arrangement repris : ' + JSON.stringify(w.form));
  ok(w.grids >= 1 && w.skey && w.skey.tonic === 'A', 'accords et tonalité repris');
  ok(w.locks.length === 1 && w.locks[0] === ids[2], 'le lead est verrouillé, batterie et basse confiées à l’assistant');
  // l'écoute : le lead verrouillé y est, avec ses notes
  await page.evaluate(() => SS.band.togglePlay());
  await page.waitForTimeout(500);
  await page.evaluate(() => SS.band.stopListen());
  const L = await page.evaluate(() => {
    const p = SS.band._listen();
    const t = p && p.tracks.find((x) => x.locked);
    return t ? { n: p.scenes.map((sc) => (sc.data[t.id].events || []).length), names: p.scenes.map((sc) => sc.name) } : null;
  });
  ok(!!L && L.n.every((n) => n === 4), 'écoute : le lead verrouillé joue ses notes dans chaque scène ' + JSON.stringify(L));
  // étape Instruments : la tuile verrouillée
  await page.dispatchEvent('#bwNext', 'click');
  await page.waitForTimeout(400);
  ok((await page.locator('.band-mus.locked').count()) === 1, 'étape Instruments : un musicien 🔒');
  await shot('grille-relue-instruments.png');
  // accords du Refrain changés dans l'assistant : alerte, puis déverrouillage pour le Refrain seulement
  const chorus = await page.evaluate(() => {
    const W = SS.band._state.wiz;
    const id = W.form[1].id;
    W.grids[id] = W.grids[id].map((c) => ({ ...c, degree: (c.degree + 1) % 7 }));
    return id;
  });
  for (let i = 0; i < 3; i++) await page.dispatchEvent('#bwNext', 'click');
  await page.waitForTimeout(500);
  const warn = await page.evaluate(() => document.querySelector('#bwLockWarn') && document.querySelector('#bwLockWarn').textContent);
  ok(!!warn && /Refrain/.test(warn) && /Lead/.test(warn) && !/Couplet/.test(warn), 'alerte : accords du Refrain changés sous le Lead 🔒');
  await shot('verrou-alerte.png');
  await page.click('.bw-lockfree');
  await page.waitForTimeout(400);
  ok(!(await page.isVisible('#bwLockWarn')), 'déverrouillée pour le Refrain : plus d’alerte');
  const L2 = await page.evaluate(() => {
    SS.band.togglePlay();
    SS.band.stopListen();
    const p = SS.band._listen();
    const lk = p.tracks.find((x) => x.locked);
    const gen = p.tracks.filter((x) => !x.locked && x.band && /lead|melody|vox/.test(x.band.key) && !x.lockMute);
    const n = (t, sc) => (sc.data[t.id] && sc.data[t.id].events ? sc.data[t.id].events.length : 0);
    return { lock: p.scenes.map((sc) => n(lk, sc)), gen: gen.map((t) => p.scenes.map((sc) => n(t, sc))) };
  });
  ok(L2.lock[0] === 4 && L2.lock[1] === 0 && L2.gen.length && L2.gen.every((g) => g[0] === 0 && g[1] > 0), 'écoute : Lead verrouillé au Couplet, l’assistant le joue au Refrain ' + JSON.stringify(L2));
  // création
  await page.evaluate(() => SS.band.create());
  await page.waitForTimeout(400);
  if (await page.isVisible('#bcfSong')) await page.click('#bcfSong');
  await page.waitForTimeout(1500);
  const pr = await P();
  const lead = pr.tracks.find((t) => t.id === ids[2]);
  const evs = (sc) => (sc.data[ids[2]] && sc.data[ids[2]].events) || [];
  ok(!!lead && evs(pr.scenes[0]).map((e) => e.notes[0]).join() === LEAD.join() && !evs(pr.scenes[1]).length, 'chanson créée : le lead verrouillé, tel quel au Couplet, vide au Refrain');
  const part = pr.tracks.filter((t) => t.band && t.band.part);
  const pe = (t, sc) => ((sc.data[t.id] && sc.data[t.id].events) || []).length;
  ok(part.length >= 1 && part.every((t) => pe(t, pr.scenes[0]) === 0 && pe(t, pr.scenes[1]) > 0), 'chanson créée : le lead de l’assistant ne joue que le Refrain');
  ok(!pr.tracks.some((t) => t.id === ids[1]) && pr.tracks.some((t) => t.band && /bass/.test(t.band.key)), 'la basse de la grille est remplacée par celle de l’assistant');
  ok(pr.tempo === 104 && pr.scenes.map((sc) => sc.name).join() === 'Couplet,Refrain' && pr.song[1].repeat === 2, 'tempo, scènes et arrangement de la grille');
  await page.click('#viewWiz');
  await page.waitForTimeout(600);
  ok(!(await page.isVisible('#brgGo')), 'grille pas changée depuis : l’assistant s’ouvre sans redemander');
  // la grille change (tempo) : on redemande
  await page.click('#viewGrid');
  await page.waitForTimeout(400);
  await page.fill('#tempo', '96');
  await page.press('#tempo', 'Enter');
  await page.waitForTimeout(400);
  await page.click('#viewWiz');
  await page.waitForTimeout(600);
  const it2 = await page.evaluate(() => [...document.querySelectorAll('.brg-item')].map((x) => x.textContent));
  ok(await page.isVisible('#brgGo') && it2.some((x) => /Tempo 96/.test(x)), 'tempo changé dans la grille : la fenêtre revient, « Tempo 96 »');
  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
