/*
 * Nouvelle chanson : étape du Clavier (type « keys », js/keyboardist.js) : Jeu Accords | Arpèges, puces de style, cartes
 * par famille, main gauche, potentiomètres ; Pianiste d'une inspiration devenu Clavier ; Clavier ajouté.
 *   node tests/e2e/wizard-keys.js   (captures : KEYS_SHOT=chemin.png)
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
const SHOT = process.env.KEYS_SHOT;
const parts = (page) => page.evaluate(() => JSON.stringify(SS.band._state.wiz.parts));
(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: SHOT ? 2 : 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`); await page.waitForTimeout(1500);
  await page.click('#viewWiz'); await page.waitForTimeout(400); await page.click('#brgSkip').catch(() => {}); await page.waitForTimeout(300);
  // une inspiration pop avec un pianiste : il devient un Clavier
  await page.click('#bandStyles [data-v="pop"]'); await page.click('#bandPresets .band-preset[data-id="lettre"], #bandPresets .band-preset >> nth=2');
  await page.waitForTimeout(400);
  // la page de départ a une grille : le groupe la reprend (batterie, basse, nappe) ; on ajoute un Clavier
  const add = await page.evaluate(() => window.StepSeq.assistantMusicien({ ajouter: 'clavier' }));
  ok(add.ok !== false, 'Clavier ajouté ' + JSON.stringify(add).slice(0, 160));
  for (let i = 0; i < 12 && !(await page.locator('#bwKeys').count()); i++) { await page.dispatchEvent('#bwNext', 'click'); await page.waitForTimeout(250); }
  ok(await page.locator('#bwKeys').count() === 1 && (await page.locator('#bwParts[data-kind="keys"]').count()) === 1, 'étape du Clavier');
  await page.click('#bandWiz .bh-scene >> nth=1'); await page.waitForTimeout(300);
  ok(await page.locator('#bwkJeu [data-v="acc"]').count() === 1 && (await page.locator('#bwkJeu [data-v="arp"]').count()) === 1, 'Jeu Accords | Arpèges');
  ok(await page.locator('#bwkStyle .mot-chip.mark[data-v="pop"]').count() === 1, 'puce Pop marquée (style de la chanson)');
  await page.click('#bwkJeu [data-v="acc"]'); await page.waitForTimeout(300);
  ok(/"mode":"/.test(await parts(page)), 'Accords : un motif choisi pour la scène');
  await page.click('#bwkStyle [data-v="all"]'); await page.waitForTimeout(200);
  for (const f of ['deux', 'rythme', 'tenu']) ok(await page.locator(`#bwKeys .bwp-grp[data-fam="${f}"]`).count() === 1, 'Accords : famille ' + f);
  await page.click('#bwKeys .bwp-mode[data-v="k:pop8"]'); await page.waitForTimeout(300);
  ok(await page.locator('#bwKeys .bwp-mode.on[data-v="k:pop8"]').count() === 1 && /"mode":"k:pop8"/.test(await parts(page)), 'motif Pop croches choisi');
  ok(await page.locator('#bwKeys .bwg-knobs .arp-knob').count() === 4, '4 potentiomètres');
  await page.click('#bwkLh [data-v="aucune"]'); await page.waitForTimeout(300);
  ok(/"keys":\{"lh":"aucune"\}/.test(await parts(page)), 'main gauche : aucune');
  await page.focus('#bwkK-voice'); await page.keyboard.press('End'); await page.waitForTimeout(300);
  ok(/"voice":1/.test(await parts(page)), 'voicing large enregistré');
  const notes = await page.evaluate(() => {
    const s = SS.band._state.wiz.res.scenes.find((x) => x.sec === SS.band._state.wiz.hscene) || SS.band._state.wiz.res.scenes[1];
    return Object.values(s.data).flatMap((d) => d.events || []).length;
  });
  ok(notes > 0, 'la chanson se refait');
  if (SHOT) { await page.evaluate(() => document.querySelector('#bwParts').scrollIntoView()); await page.waitForTimeout(200); await page.screenshot({ path: SHOT }); }
  await page.click('#bwkJeu [data-v="arp"]'); await page.waitForTimeout(300);
  await page.click('#bwkStyle [data-v="all"]'); await page.waitForTimeout(200);
  ok(await page.locator('#bwKeys[data-jeu="arp"] .bwp-grp[data-fam="brise"]').count() === 1 && (await page.locator('#bwKeys .bwp-grp[data-fam="arpeg"]').count()) === 1, 'Arpèges : Piano brisé, Arpégiateur');
  await page.click('#bwKeys .bwp-mode[data-v="k:alberti"]'); await page.waitForTimeout(300);
  ok(await page.locator('#bwkK-reg').count() === 1 && (await page.locator('#bwkK-accent').count()) === 1, 'Arpèges : Registre et Accent');
  if (SHOT) { await page.evaluate(() => document.querySelector('#bwParts').scrollIntoView()); await page.waitForTimeout(200); await page.screenshot({ path: SHOT.replace('.png', '-arpeges.png') }); }
  // outils de Claude
  const mot = await page.evaluate(() => window.StepSeq.assistantMotifs({ musicien: 'Clavier' }));
  ok(mot.type === 'clavier' && mot.motifs.some((m) => m.id === 'k:stride'), 'assistantMotifs : motifs du Clavier');
  const j = await page.evaluate(() => window.StepSeq.assistantJeu({ musicien: 'Clavier', scenes: 'toutes', motif: 'k:stride', mainGauche: 'octaves' }));
  ok(j.ok !== false && /"lh":"oct"/.test(await parts(page)), 'assistantJeu : motif et main gauche ' + JSON.stringify(j).slice(0, 160));
  ok(!errs.length, 'pas d’erreur de page ' + errs.join(' | '));
  await b.close();
  server.close();
})();
