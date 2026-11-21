/*
 * Nouvelle chanson : bouton « Avancé » du Guitariste (l'arpégiateur Guitare d'Arp One dans l'étape).
 *   node tests/e2e/guitar-advanced.js   (capture : GTADV_SHOT=chemin)
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
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`); await page.waitForTimeout(1500);
  await page.click('#appMenuBtn'); await page.click('#bandBtn'); await page.waitForTimeout(400); await page.click('#brgSkip').catch(() => {}); await page.waitForTimeout(300);
  await page.click('#bandStyles [data-v="pop"]'); await page.click('#bandPresets .band-preset >> nth=0');
  for (let i = 0; i < 12 && !(await page.locator('#bwpGtView').count()); i++) { await page.dispatchEvent('#bwNext', 'click'); await page.waitForTimeout(250); }
  ok(await page.locator('#bwpGtView').count() === 1, 'étape du Guitariste');
  await page.click('#bandWiz .bh-scene >> nth=1'); await page.waitForTimeout(300);
  ok(await page.locator('#bwpGtView').count() === 1, 'sélecteur Guitare | Accords plaqués');
  await page.click('#bwpGtView [data-v="guitare"]'); await page.waitForTimeout(300);
  ok(await page.locator('#bandWiz .bwp-guitar').count() === 1 && (await page.locator('#bwpVoicing').count()) === 0, 'Guitare : motifs guitare seuls');
  await page.click('#bandWiz .bwp-guitar .bwp-mode[data-v="g:classA"]'); await page.waitForTimeout(300);
  ok(await page.locator('#bwGtAdv:not([disabled])').count() === 1, 'bouton Avancé…');
  await page.click('#bwGtAdv'); await page.waitForTimeout(300);
  ok(await page.locator('#bwGtDialog[open] .gt-diagram').count() === 1 && (await page.locator('#bwGtDialog .gt-tab .gt-note').count()) >= 6, 'fenêtre Avancé : schéma et tablature d’Arp One');
  await page.selectOption('#bwGtCapo', '5'); await page.waitForTimeout(300);
  ok(/"gtr":\{"capo":5\}/.test(await page.evaluate(() => JSON.stringify(SS.band._state.wiz.parts))), 'capodastre enregistré pour la scène');
  await page.click('#bwGtDialog .gt-chip[data-m="travis"]'); await page.waitForTimeout(300);
  ok(await page.locator('#bandWiz .bwp-mode.on[data-v="g:travis"]').count() === 1 && (await page.locator('#bwGtDialog[open]').count()) === 1, 'motif choisi dans la fenêtre, qui reste ouverte');
  if (process.env.GTADV_SHOT) await page.screenshot({ path: process.env.GTADV_SHOT });
  await page.click('#bwGtClose'); await page.waitForTimeout(200);
  await page.click('#bwpGtView [data-v="plaques"]'); await page.waitForTimeout(300);
  ok(await page.locator('#bandWiz .bwp-guitar').count() === 0 && (await page.locator('#bwpVoicing').count()) === 1, 'Accords plaqués : modes de nappe et voicing');
  if (process.env.GTADV_SHOT) await page.screenshot({ path: process.env.GTADV_SHOT.replace('.png', '-plaques.png') });
  await page.click('#bwpGtView [data-v="guitare"]'); await page.waitForTimeout(300);
  if (process.env.GTADV_SHOT) await page.screenshot({ path: process.env.GTADV_SHOT.replace('.png', '-guitare.png') });
  // une guitare en Arpège : les notes du moteur ne repassent pas dans l'arpégiateur de la piste (sinon toujours la même note)
  const arpMu = await page.evaluate(() => window.StepSeq.assistantMusicien({ ajouter: 'arpege', son: 'gm_acoustic_guitar_steel' }));
  ok(arpMu.ok && (await page.evaluate(() => SS.band.plannedTracks().filter((o) => o.type !== 'drum').every((o) => o.arpOn === false))), 'pistes du groupe sans 2e arpégiateur');
  ok(!errs.length, 'pas d’erreur JS ' + errs.join(' | '));
  await b.close(); server.close();
})();
