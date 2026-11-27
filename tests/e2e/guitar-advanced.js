/*
 * Nouvelle chanson : étape du Guitariste (type « guitar », js/guitarist.js) : Jeu Arpèges | Accords, puces de style,
 * cartes par famille, potentiomètres, « Avancé… » (l'arpégiateur Guitare d'Arp One), Guitariste ajouté.
 *   node tests/e2e/guitar-advanced.js   (captures : GTADV_SHOT=chemin.png)
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
const SHOT = process.env.GTADV_SHOT;
(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: SHOT ? 2 : 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`); await page.waitForTimeout(1500);
  await page.click('#viewWiz'); await page.waitForTimeout(400); await page.click('#brgSkip').catch(() => {}); await page.waitForTimeout(300);
  await page.click('#bandStyles [data-v="pop"]'); await page.click('#bandPresets .band-preset >> nth=0');
  // la page de départ a une grille : le groupe la reprend (batterie, basse, nappe) ; on ajoute un Guitariste
  const add0 = await page.evaluate(() => window.StepSeq.assistantMusicien({ ajouter: 'guitariste', son: 'gm_acoustic_guitar_steel' }));
  ok(add0.ok, 'Guitariste ajouté (type à part) ' + JSON.stringify(add0).slice(0, 160));
  for (let i = 0; i < 10 && !(await page.locator('#bwGuitarist').count()); i++) { await page.dispatchEvent('#bwNext', 'click'); await page.waitForTimeout(250); }
  ok(await page.locator('#bwGuitarist').count() === 1, 'étape du Guitariste (type Guitariste)');
  ok(await page.locator('#bwParts[data-kind="guitar"]').count() === 1, 'type guitar');
  await page.click('#bandWiz .bh-scene >> nth=1'); await page.waitForTimeout(300);
  ok(await page.locator('#bwgJeu [data-v="arp"]').count() === 1 && (await page.locator('#bwgJeu [data-v="acc"]').count()) === 1, 'Jeu Arpèges | Accords');
  ok(await page.locator('#bwgStyle .mot-opt.mark').count() === 1, 'puce du style de la chanson marquée');
  await page.click('#bwgJeu [data-v="arp"]'); await page.waitForTimeout(300);
  ok(await page.locator('#bwGuitarist .mot-fam[data-f="doigts"]').count() === 1, 'Arpèges : famille Doigts');
  await page.click('#bwgStyle .mot-style-btn'); await page.click('#bwgStyle [data-g="all"]'); await page.waitForTimeout(200);
  await page.click('#bwGuitarist .mot-card[data-id="g:travis"]'); await page.waitForTimeout(300);
  ok(await page.locator('#bwGuitarist .mot-card.on[data-id="g:travis"]').count() === 1, 'motif Travis choisi');
  ok(await page.locator('#bwGuitarist .bwg-knobs .arp-knob').count() === 4, '4 potentiomètres');
  await page.focus('#bwgK-ring'); await page.keyboard.press('End'); await page.waitForTimeout(300);
  ok(/"gtr":\{"ring":1\}/.test(await page.evaluate(() => JSON.stringify(SS.band._state.wiz.parts))), 'Résonance au maximum enregistrée pour la scène');
  if (SHOT) await page.screenshot({ path: SHOT });
  await page.click('#bwgJeu [data-v="acc"]'); await page.waitForTimeout(300);
  ok(await page.locator('#bwGuitarist .mot-fam[data-f="gratte"]').count() === 1, 'Accords : famille Grattage');
  await page.click('#bwgStyle .mot-style-btn'); await page.click('#bwgStyle [data-g="all"]'); await page.waitForTimeout(200);
  ok(await page.locator('#bwGuitarist .mot-fam[data-f="etouffe"]').count() === 1 && (await page.locator('#bwGuitarist .mot-fam[data-f="plaque"]').count()) === 1, 'Accords : Étouffés et Plaqués');
  await page.click('#bwGuitarist .mot-card[data-id="g:pop"]'); await page.waitForTimeout(300);
  if (SHOT) await page.screenshot({ path: SHOT.replace('.png', '-accords.png') });
  await page.click('#bwGtAdv'); await page.waitForTimeout(300);
  ok(await page.locator('#bwGtDialog[open] .gt-diagram').count() === 1 && (await page.locator('#bwGtDialog .gt-tab .gt-note').count()) >= 6, 'fenêtre Avancé : schéma et tablature d’Arp One');
  await page.selectOption('#bwGtCapo', '5'); await page.waitForTimeout(300);
  ok(/"capo":5/.test(await page.evaluate(() => JSON.stringify(SS.band._state.wiz.parts))), 'capodastre enregistré pour la scène');
  await page.click('#bwGtDialog .gt-chip[data-m="rock"]'); await page.waitForTimeout(300);
  ok(await page.locator('#bwGuitarist .mot-card.on[data-id="g:rock"]').count() === 1 && (await page.locator('#bwGtDialog[open]').count()) === 1, 'motif choisi dans la fenêtre, qui reste ouverte');
  if (SHOT) await page.screenshot({ path: SHOT.replace('.png', '-avance.png') });
  // éditeur pas à pas des coups (grattage) : un clic change le coup, le motif devient « ✎ »
  ok(await page.locator('#bwGtDialog #bwgEd .bwg-cell').count() === 16, 'éditeur des coups : 16 pas');
  await page.click('#bwGtDialog #bwgEd [data-s="1"]'); await page.waitForTimeout(300);
  ok(/"pat":"D D /.test(await page.evaluate(() => JSON.stringify(SS.band._state.wiz.parts))), 'coup ajouté au pas 2 (motif réécrit)');
  await page.click('#bwGtClose'); await page.waitForTimeout(200);
  ok(await page.locator('#bwgAdvChip').count() === 1, 'pastille ✎ Réglages avancés');
  // Riffs : jeu, cartes, potentiomètres, fenêtre RIFF avec l'éditeur des degrés
  await page.click('#bwgJeu [data-v="riff"]'); await page.waitForTimeout(300);
  await page.click('#bwgStyle .mot-style-btn'); await page.click('#bwgStyle [data-g="all"]'); await page.waitForTimeout(200);
  ok(await page.locator('#bwGuitarist[data-jeu="riff"] .mot-fam[data-f="quintes"]').count() === 1 && (await page.locator('#bwGuitarist .mot-fam[data-f="lignes"]').count()) === 1, 'Riffs : Quintes et octaves, Lignes');
  await page.click('#bwGuitarist .mot-card[data-id="r:boogie"]'); await page.waitForTimeout(300);
  ok(await page.locator('#bwGuitarist .mot-card.on[data-id="r:boogie"]').count() === 1 && (await page.locator('#bwgK-swing').count()) === 1, 'riff Boogie, potentiomètre Swing');
  await page.focus('#bwgK-swing'); await page.keyboard.press('End'); await page.waitForTimeout(300);
  ok(/"riff":\{"swing":1\}/.test(await page.evaluate(() => JSON.stringify(SS.band._state.wiz.parts))), 'swing enregistré pour la scène');
  if (SHOT) await page.screenshot({ path: SHOT.replace('.png', '-riffs.png') });
  await page.click('#bwGtAdv'); await page.waitForTimeout(300);
  ok(await page.locator('#bwGtDialog[open] #bwRiffAdvanced').count() === 1 && (await page.locator('#bwGtDialog .bwgt-brand').textContent()) === 'RIFF', 'fenêtre RIFF');
  await page.click('#bwGtDialog #bwgRiffEd [data-k="b7"][data-s="2"]'); await page.waitForTimeout(300);
  await page.click('#bwgRiffFixed [data-v="fixed"]'); await page.waitForTimeout(300);
  ok(/"riff":\{[^}]*"fixed":true[^}]*"pat":"R5 \. b7 /.test(await page.evaluate(() => JSON.stringify(SS.band._state.wiz.parts))), 'riff réécrit + notes fixes ' + (await page.evaluate(() => JSON.stringify(SS.band._state.wiz.parts))).slice(0, 300));
  if (SHOT) await page.screenshot({ path: SHOT.replace('.png', '-riff-avance.png') });
  await page.click('#bwGtClose'); await page.waitForTimeout(200);
  await page.click('#bwgSurprise'); await page.waitForTimeout(300);
  ok(await page.locator('#bwGuitarist .mot-card.on').count() === 1, 'Surprends-moi : un motif choisi');
  // Guitariste ajouté par les outils Claude : le moteur de guitare d'office, motifs listés
  const add = await page.evaluate(() => window.StepSeq.assistantMusicien({ ajouter: 'guitariste', son: 'gm_acoustic_guitar_nylon' }));
  ok(add.ok, 'assistantMusicien({ ajouter: "guitariste" }) ' + JSON.stringify(add).slice(0, 200));
  const mo = await page.evaluate(() => window.StepSeq.assistantMotifs({ musicien: 'Guitariste 2' }));
  ok(mo.ok && mo.type === 'guitariste' && mo.motifs.some((m) => m.id === 'g:travis' && m.jeu === 'arpèges'), 'assistantMotifs : motifs du guitariste ' + JSON.stringify(mo).slice(0, 200));
  const j = await page.evaluate(() => window.StepSeq.assistantJeu({ musicien: 'Guitariste 2', scenes: 'toutes', motif: 'g:bossa' }));
  ok(j.ok, 'assistantJeu : bossa partout ' + JSON.stringify(j).slice(0, 200));
  ok(await page.evaluate(() => SS.band.plannedTracks().filter((o) => o.type !== 'drum').every((o) => o.arpOn === false)), 'pistes du groupe sans 2e arpégiateur');
  ok(!errs.length, 'pas d’erreur JS ' + errs.join(' | '));
  await b.close(); server.close();
})();
