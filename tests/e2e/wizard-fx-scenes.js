/*
 * Carte « Musicien Effets, scène par scène » de l'étape Effets et transitions (js/band.js fxSceneCard, js/bandsong.js withSceneFx) :
 *   node tests/e2e/wizard-fx-scenes.js
 * Rôle par scène (Ambiance, Montée, Descente, Rien), options, niveau, retour au plan, lien avec la montée de la jonction.
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
  const b = await chromium.launch();
  const errs = [];
  const url = `http://localhost:${server.address().port}/index.html`;
  /** Une page neuve, l'assistant ouvert sur un style et sa première inspiration. */
  async function open(style, nth = 0, viewport = { width: 1500, height: 920 }) {
    const page = await b.newPage({ viewport });
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(url);
    await page.waitForTimeout(1000);
    await page.click('#appMenuBtn');
    await page.click('#newProject');
    await page.waitForTimeout(500);
    await page.click(`#bandStyles [data-v="${style}"]`);
    await page.click(`#bandPresets .band-preset >> nth=${nth}`);
    return page;
  }
  const num = (page, ref) => page.evaluate((r) => SS.band.stepNum(r), ref);
  const go = async (page, ref) => {
    await page.click(`#bandWizSteps li[data-step="${await num(page, ref)}"] button`);
    await page.waitForTimeout(350);
  };
  const wiz = (page, expr) => page.evaluate((e) => new Function('W', 'S', `return (${e})`)(SS.band._state.wiz, SS.band._state), expr);
  const dataOf = (page, scene, pre) =>
    page.evaluate(([n, p]) => {
      const sc = SS.band._state.wiz.res.scenes.find((x) => x.name === n);
      const id = Object.keys(sc.data).find((k) => k.endsWith(p));
      return id ? JSON.parse(JSON.stringify(sc.data[id])) : null;
    }, [scene, pre]);

  const page = await open('techno');
  await go(page, 'fx');
  ok(await page.isVisible('#fxScenes'), 'carte « Musicien Effets, scène par scène » visible');
  const rows = await page.$$eval('#fxScenes .fx-srow', (l) => l.map((x) => [x.dataset.sec, x.querySelector('.fx-roles [aria-pressed="true"]').textContent]));
  ok(rows.length >= 5, `une ligne par scène (${rows.map((r) => r.join(':')).join(', ')})`);
  const intro = rows.find((r) => r[0] === 'intro');
  const build = rows.find((r) => r[0] === 'build');
  ok(intro && intro[1] === 'Ambiance' && build && build[1] === 'Montée', 'rôles du plan : Ambiance sur l’intro, Montée sur la montée');
  const before = await dataOf(page, 'Intro', 'fx');
  ok(before && before.events.length > 0, 'l’intro a une ambiance au départ');

  // Rien sur l'intro
  await page.click('#fxscn-intro [data-v="none"]');
  await page.waitForTimeout(400);
  ok((await dataOf(page, 'Intro', 'fx')).events.length === 0, 'Rien : la piste Effets se tait dans l’intro');
  ok((await wiz(page, 'JSON.stringify(W.parts.intro.fx)')) === '{"mode":"none"}', 'réglage gardé dans parts.intro.fx');
  ok((await page.textContent('#fxScenes .fx-srow[data-sec="intro"] small')).includes('retouché'), 'la ligne dit « retouché »');

  // Ambiance chaque mesure
  await page.click('#fxscn-intro [data-v="swell"]');
  await page.waitForTimeout(400);
  ok((await wiz(page, 'W.parts.intro ? JSON.stringify(W.parts.intro.fx || null) : null')) == null || (await wiz(page, '!(W.parts.intro && W.parts.intro.fx)')), 'revenir au rôle du plan efface le réglage');
  await page.click('#fxscn-every-intro [data-v="1"]');
  await page.waitForTimeout(400);
  const bars = (await wiz(page, 'W.res.scenes.find((s) => s.sec === "intro").bars'));
  ok((await dataOf(page, 'Intro', 'fx')).events.length === bars, `Ambiance chaque mesure : ${bars} notes`);

  // Montée de 4 mesures : la note, et la jonction qui en sort suit
  await page.click('#fxscn-len-build [data-v="4"]');
  await page.waitForTimeout(400);
  const ev = (await dataOf(page, 'Montée', 'fx')).events;
  const bb = await wiz(page, 'W.res.scenes.find((s) => s.sec === "build").bars');
  ok(ev.length === 1 && ev[0].step === (bb - 4) * 16 && ev[0].len >= 60 && ev[0].len <= 64, 'Montée de 4 mesures : une note sur les 4 dernières mesures (moins la coupure)');

  // Niveau
  const v0 = (await dataOf(page, 'Montée', 'fx')).events[0].vel;
  await page.$eval('#fxscn-level-build', (e) => { e.value = 0.5; e.dispatchEvent(new Event('change')); });
  await page.waitForTimeout(400);
  const v1 = (await dataOf(page, 'Montée', 'fx')).events[0].vel;
  ok(Math.abs(v1 - v0 * 0.5) < 0.02, `niveau 50 % : vélocité ${v0} → ${v1}`);

  // ↺ : retour au plan
  await page.click('#fxScenes .fx-srow[data-sec="build"] .fx-undo');
  await page.waitForTimeout(400);
  ok(!(await wiz(page, '!!(W.parts.build && W.parts.build.fx)')), '↺ : la montée revient au plan');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'fx-scenes.png'), fullPage: false });
  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
