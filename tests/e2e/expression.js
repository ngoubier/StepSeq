/*
 * Expression et articulations (js/expression.js), dans Chromium :
 *   node tests/e2e/expression.js            (SHOTS=dossier : captures de l'onglet Jeu et du menu de la note)
 * 1. rendu hors temps réel (js/render.js) d'une phrase de violon : sans expression, Naturelle, Expressive (arc de la
 *    phrase, soufflet de la note longue, fin qui s'éteint), et articulations écrites (staccato plus court) ;
 * 2. nouvelle piste de cordes : expression Naturelle d'office ; piste de basse : rien ;
 * 3. onglet Jeu du Sound design : niveaux, phrasé, Annuler qui rend le réglage, Réinitialiser qui garde le jeu ;
 * 4. menu de la note : rangée « Jeu », marque sur la note, infobulle, enregistrement, copier-coller.
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
  const port = server.address().port;
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${port}/index.html`);
  await page.waitForTimeout(800);

  // 1. Rendu : enveloppe (dB par croche) d'une phrase de violon
  const env = await page.evaluate(async () => {
    const mk = (expr, art) => {
      const p = SS.newProject();
      p.tempo = 90;
      p.bars = 4;
      p.scenes[0].bars = 4;
      const t = SS.newTrack({ name: 'Violon', color: '#a0f', type: 'instrument', family: 'strings', instrument: 'gm_violin' }, p);
      const line = [[0, 4, 69], [4, 4, 71], [8, 4, 72], [12, 4, 74], [16, 16, 76], [32, 2, 74], [34, 2, 72], [36, 2, 71], [38, 2, 69], [48, 16, 69]];
      t.events = line.map(([step, len, m]) => ({ step, len, notes: [m], vel: 0.8 }));
      if (art) t.events.forEach((e, i) => i < 4 && (e.art = art));
      if (expr) t.sd = { expr };
      else delete t.sd;
      p.tracks = [t];
      SS.commitScene(p);
      return p;
    };
    const out = {};
    for (const [name, expr, art] of [['off', null], ['natural', 'natural'], ['expressive', 'expressive'], ['stac', null, 'stac']]) {
      const pp = SS.render.prepare(mk(expr, art), { range: 'scene', loops: 1 });
      const r = await SS.render.renderOnce(pp.json, { seconds: pp.seconds, sampleRate: 44100, seed: 3 });
      const sd = 60 / 90 / 4;
      const from = Math.round(0.08 * 44100);
      const e = [];
      for (let k = 0; k < 32; k++) {
        let s = 0;
        const a = from + Math.round(k * 2 * sd * 44100);
        const z = from + Math.round((k + 1) * 2 * sd * 44100);
        for (let i = a; i < z; i++) s += r.left[i] ** 2;
        e.push(10 * Math.log10(s / (z - a) + 1e-12));
      }
      out[name] = e;
    }
    return out;
  });
  const fmt = (a) => a.map((v) => Math.round(v)).join(' ');
  console.log('     sans       : ' + fmt(env.off));
  console.log('     naturelle  : ' + fmt(env.natural));
  console.log('     expressive : ' + fmt(env.expressive));
  ok(env.off.some((v, i) => Math.abs(v - env.natural[i]) > 1), 'Naturelle : la nuance change');
  ok(env.natural[6] > env.natural[0] + 1, 'arc : la phrase monte (début plus doux que la montée)');
  ok(env.expressive[9] < env.expressive[8] - 1.5 && env.expressive[14] > env.expressive[9] + 2, 'Expressive : « fp » sur la ronde (recul puis crescendo)');
  ok(env.natural[31] < env.off[31] - 1, 'la dernière note s’éteint');
  ok(Math.max(...env.natural) <= Math.max(...env.off) + 0.5, 'jamais plus fort que la note écrite');
  ok(env.stac[1] < env.off[1] - 6, `staccato : la 2e croche de chaque note est presque silencieuse (${Math.round(env.stac[1])} contre ${Math.round(env.off[1])} dB)`);

  // 2. Expression d'office
  const def = await page.evaluate(() => {
    const p = SS.newProject();
    const v = SS.newTrack({ type: 'instrument', family: 'strings', instrument: 'gm_cello', name: 'C' }, p);
    const bass = SS.newTrack({ type: 'instrument', family: 'bass', instrument: 'syn_sawbass', name: 'B' }, p);
    const arp = SS.newTrack({ type: 'instrument', family: 'strings', instrument: 'gm_violin', name: 'A', arpOn: true }, p);
    return [v.sd && v.sd.expr, bass.sd, arp.sd];
  });
  ok(def[0] === 'natural' && !def[1] && !def[2], 'nouvelle piste de cordes : expression Naturelle ; basse et arpège : rien');

  // 3. Onglet Jeu
  await page.evaluate(() => {
    const p = SS.newProject();
    p.tempo = 100;
    const t = SS.newTrack({ type: 'instrument', family: 'strings', instrument: 'gm_violin', name: 'Violon', color: '#a070ff' }, p);
    t.events = [0, 4, 8, 12].map((step, i) => ({ step, len: 4, notes: [69 + i * 2], vel: 0.8 }));
    p.tracks.push(t);
    localStorage.setItem('stepseq.autosave', JSON.stringify(p));
  });
  await page.reload();
  await page.waitForTimeout(800);
  const track = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')).tracks[0]);
  const openSd = async () => {
    await page.click('.track .th-sd');
    await page.waitForSelector('#soundDialog[open]');
    await page.click('#sdTabs [data-tab="play"]');
    await page.waitForTimeout(200);
  };
  await openSd();
  const opened = await page.evaluate(() => document.querySelector('#soundDialog').open);
  ok(opened, 'Sound design ouvert depuis la piste');
  ok(await page.isVisible('[data-pane="play"]'), 'onglet Jeu');
  ok(await page.isVisible('#sdExpr [data-v="natural"].active'), 'expression Naturelle choisie (piste de cordes)');
  ok(/phrasé/.test(await page.textContent('#sdState_play')), `résumé sous l’onglet : ${await page.textContent('#sdState_play')}`);
  ok(/Cordes frottées/.test(await page.textContent('#sdExprFamily')), 'famille : cordes frottées');
  await page.click('#sdExpr [data-v="expressive"]');
  await page.uncheck('#sdPhrase');
  await page.waitForTimeout(200);
  if (SHOTS) await page.locator('#soundDialog').screenshot({ path: path.join(SHOTS, 'expression-jeu.png') });
  await page.click('#sdReset');
  await page.waitForTimeout(200);
  ok(await page.isVisible('#sdExpr [data-v="expressive"].active') && !(await page.isChecked('#sdPhrase')), 'Réinitialiser garde le jeu');
  await page.click('#sdCancel');
  await page.waitForTimeout(700);
  let t = await track();
  ok(t.sd && t.sd.expr === 'natural' && t.sd.phrase === undefined, 'Annuler : le réglage d’avant revient');
  await openSd();
  await page.click('#sdExpr [data-v="off"]');
  await page.click('#soundDialog button[type="submit"]');
  await page.waitForTimeout(700);
  t = await track();
  ok(!t.sd || !t.sd.expr, 'Aucune : plus d’expression enregistrée');

  // 4. Menu de la note
  await page.click('.track .cell[data-step="4"]', { button: 'right' });
  await page.waitForTimeout(200);
  ok((await page.locator('.ctx-arts button').count()) === 6, 'menu de la note : Auto + 5 articulations');
  ok(await page.isVisible('.ctx-arts button[data-v=""].on'), 'Auto par défaut');
  await page.click('.ctx-arts button[data-v="leg"]');
  if (SHOTS) await page.locator('.ctx-picker').screenshot({ path: path.join(SHOTS, 'expression-note.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  t = await track();
  ok(t.events.find((e) => e.step === 4).art === 'leg', 'articulation enregistrée sur la note');
  ok((await page.locator('.track .cell[data-step="4"] .art-mark').textContent()) === '⌒', 'marque ⌒ sur la note');
  ok(/legato/.test(await page.getAttribute('.track .cell[data-step="4"]', 'title')), 'infobulle : « legato »');
  // rechargement : gardée ; une articulation inconnue est retirée
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('stepseq.autosave'));
    p.tracks[0].events[0].art = 'bidon';
    localStorage.setItem('stepseq.autosave', JSON.stringify(p));
  });
  await page.reload();
  await page.waitForTimeout(800);
  const arts = await page.evaluate(() => SS.normalizeProject(JSON.parse(localStorage.getItem('stepseq.autosave'))).tracks[0].events.map((e) => e.art || ''));
  ok(arts.join(',') === ',leg,,', `après rechargement : ${arts.join(',')}`);

  // lecture : aucune erreur
  await page.click('#play');
  await page.waitForTimeout(1500);
  await page.click('#stop');
  ok(!errs.length, 'aucune erreur de page' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
