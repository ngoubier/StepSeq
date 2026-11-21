/*
 * Test de bout en bout : figer une piste en audio (js/freeze.js, bouton ❄).
 *   node tests/e2e/freeze.js            (SHOTS=dossier : captures)
 * Chanson synthwave de l'assistant (4 synthés Juno, 5 scènes) : on fige la Nappe, on attend ses enregistrements (un par
 * bloc différent de l'arrangement et par boucle de scène), puis on vérifie : bouton et forme d'onde, lecture depuis l'enregistrement (aucune note jouée par
 * l'instrument, la piste sonne), verrou d'édition (fenêtre Dégeler), « à réenregistrer » après un changement de tempo
 * de la scène, dégel, et la mémoire du navigateur (rechargement de la page : rien n'est recalculé).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.otf': 'font/otf' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
const SHOTS = process.env.SHOTS;
const ok = (c, m) => {
  console.log((c ? 'OK   ' : 'FAIL ') + m);
  if (!c) process.exitCode = 1;
};

(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const url = `http://localhost:${server.address().port}/index.html`;
  await page.addInitScript(() => {
    if (sessionStorage.getItem('frz.init')) return;
    sessionStorage.setItem('frz.init', '1');
    localStorage.clear();
    localStorage.setItem('stepseq.autosave', JSON.stringify({ format: 'stepseq', version: 1, title: 'Figer', tempo: 110, bars: 1, tracks: [], scenes: [], song: [] }));
  });
  await page.goto(url);
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    StepSeq.assistantOuvrir();
    StepSeq.assistantStyle({ style: 'synthwave' });
    StepSeq.assistantCreer();
  });
  await page.waitForTimeout(2000);

  const padId = await page.evaluate(() => StepSeq.etat().pistes.find((p) => /Nappe/.test(p.nom)).id);
  ok(!!(await page.$(`.track[data-id="${padId}"] .th-frz`)), 'la Nappe a un bouton ❄');
  const sel = `.track[data-id="${padId}"]`;
  const drums = await page.$$eval('.track', (els) => els.filter((e) => e.querySelector('.th-btn.mute') && !e.querySelector('.th-frz')).length);
  ok(drums >= 1, 'pas de ❄ sur les pistes de batterie');

  // 1. figer
  const t0 = Date.now();
  await page.click(`${sel} .th-frz`);
  await page.waitForTimeout(300);
  ok(/busy/.test(await page.getAttribute(`${sel} .th-frz`, 'class')), 'clic sur ❄ : enregistrement en cours');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'figer-en-cours.png'), clip: { x: 0, y: 0, width: 1600, height: 760 } });
  const done = await page.evaluate(() => SS.freeze.ready(120000));
  const secs = (Date.now() - t0) / 1000;
  ok(done, `enregistrements prêts en ${secs.toFixed(1)} s`);
  const info = await page.evaluate((id) => {
    const el = document.querySelector(`.track[data-id="${id}"]`);
    return { frozen: el.classList.contains('frozen'), btn: el.querySelector('.th-frz').className, wave: !!el.querySelector('canvas.frz-wave'), saved: localStorage.getItem('stepseq.autosave').includes('"freeze"') };
  }, padId);
  ok(info.frozen && /\bon\b/.test(info.btn), `piste figée (${info.btn})`);
  ok(info.wave, 'forme d’onde de la scène sur la grille');
  ok(info.saved, 'l’état figé est enregistré avec la chanson');
  const segs = await page.evaluate(() => SS.freeze._mem.size);
  ok(segs >= 5, `${segs} enregistrements (blocs et boucles de scène)`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'figer-app.png'), clip: { x: 0, y: 0, width: 1600, height: 760 } });

  // 2. lecture de la chanson : la piste joue son enregistrement
  await page.evaluate(() => StepSeq.jouer({ chanson: true }));
  let peak = 0;
  let playing = false;
  for (let k = 0; k < 60; k++) {
    await page.waitForTimeout(100);
    const r = await page.evaluate((id) => ({ l: SS.audio.levels(id), f: SS.audio._frozenPlaying() }), padId);
    if (r.l) peak = Math.max(peak, r.l.peak);
    if (r.f.includes(padId)) playing = true;
  }
  ok(playing, 'lecture : la Nappe est jouée depuis son enregistrement');
  ok(peak > 0.01, `la piste figée sonne (crête ${peak.toFixed(3)})`);
  await page.evaluate(() => StepSeq.stop());

  // 3. verrou : clic dans la grille de la piste figée
  await page.click(`${sel} .track-grid .cell >> nth=0`, { force: true });
  await page.waitForTimeout(200);
  ok(await page.isVisible('dialog.frz-dialog[open]'), 'modifier une piste figée ouvre la fenêtre Dégeler');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'figer-degeler.png') });
  await page.click('dialog.frz-dialog .frz-cancel');

  // 4. tempo de la scène changé : réenregistré en arrière-plan
  const before = await page.evaluate(() => SS.freeze._mem.size);
  await page.evaluate(() => StepSeq.tempo({ bpm: 120 }));
  await page.waitForTimeout(100);
  const st = await page.evaluate((id) => document.querySelector(`.track[data-id="${id}"] .th-frz`).className, padId);
  ok(/partial|busy/.test(st), `après un changement de tempo : à réenregistrer (${st})`);
  ok(await page.evaluate(() => SS.freeze.ready(120000)), 'réenregistrée');
  ok((await page.evaluate(() => SS.freeze._mem.size)) > before, 'nouveaux enregistrements');

  // 5. rechargement : enregistrements repris de la mémoire du navigateur
  await page.reload();
  await page.waitForTimeout(1500);
  const t1 = Date.now();
  ok(await page.evaluate(() => SS.freeze.ready(60000)), 'après rechargement : piste figée prête');
  const re = (Date.now() - t1) / 1000;
  ok(re < secs, `repris de la mémoire du navigateur en ${re.toFixed(1)} s (enregistrement : ${secs.toFixed(1)} s)`);

  // 6. dégeler
  await page.click(`${sel} .th-frz`);
  await page.waitForTimeout(200);
  ok(!(await page.evaluate((id) => document.querySelector(`.track[data-id="${id}"]`).classList.contains('frozen'), padId)), 'dégelée');

  ok(!errs.length, 'aucune erreur de page' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
