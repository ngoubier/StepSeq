/*
 * Nouvelle chanson : « Mon motif de basse » (bouton Avancé… de l'étape Basse, js/bassedit.js), sur « Néons en fuite ».
 *   node tests/e2e/bass-custom.js   (captures : BASSCUSTOM_SHOT=chemin.png)
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
const SHOT = process.env.BASSCUSTOM_SHOT;
(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: SHOT ? 2 : 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`); await page.waitForTimeout(1500);
  await page.evaluate(() => window.StepSeq.assistantOuvrir());
  await page.waitForTimeout(400);
  await page.click('#brgSkip').catch(() => {});
  await page.evaluate(() => window.StepSeq.assistantStyle({ style: 'synthwave', inspiration: 'neons' }));
  await page.waitForTimeout(400);
  for (let i = 0; i < 14 && !(await page.locator('#bandWizSteps li.cur[data-kind="bass"]').count()); i++) { await page.dispatchEvent('#bwNext', 'click'); await page.waitForTimeout(250); }
  ok(await page.locator('#bwBassAdv').count() === 1, 'étape Basse : bouton Avancé…');
  await page.click('#bwBassAdv'); await page.waitForTimeout(500);
  ok(await page.locator('#bbeDialog[open]').count() === 1, 'fenêtre « Mon motif de basse » ouverte');
  ok(await page.locator('#bbeCells .bbe-note').count() === 8, 'départ : les 8 croches piquées de la séquence de Néons');
  const labs = await page.locator('.bbe-lab').allTextContents();
  ok(labs.some((t) => /^Fondamentale\s*Ré/.test(t)) && labs.some((t) => /^Septième\s*Do/.test(t)), 'lignes nommées sur le premier accord (Ré mineur) : ' + labs.slice(0, 9).join(' | '));
  const strip0 = await page.locator('#bbeStrip .bbe-n').count();
  ok(strip0 >= 8, `« Ce qu'on entend » : ${strip0} notes sur les accords de la scène`);
  // une approche au dernier pas (ligne « → Approche »), glissée
  const box = await page.locator('#bbeCells').boundingBox();
  const W = box.width / 16;
  await page.mouse.click(box.x + 14.5 * W, box.y + 10 * 22 + 11); // remplace la quinte du pas 14
  await page.waitForTimeout(150);
  await page.click('#bbeTool [data-v="slide"]');
  await page.mouse.click(box.x + 14.5 * W, box.y + 10 * 22 + 11);
  await page.click('#bbeTool [data-v="note"]');
  ok(await page.locator('#bbeCells .bbe-note.sp.slide').count() === 1, 'approche posée et glissée');
  // nuance : la première note devient fantôme
  const v0 = await page.locator('#bbeVel span').first().boundingBox();
  await page.mouse.click(v0.x + 5, v0.y + v0.height - 2);
  // deux mesures
  await page.click('#bbeBars [data-v="2"]');
  ok(await page.locator('#bbeCells .bbe-note').count() === 16, 'deux mesures : la 2e part d’une copie');
  await page.fill('#bbeName', 'Ma séquence néon');
  await page.click('#bbePlay'); await page.waitForTimeout(1200);
  ok(await page.evaluate(() => SS.band._state && document.querySelector('#bbePlay').classList.contains('on')), 'écoute de la scène en boucle');
  if (SHOT) await page.locator('#bbeDialog').screenshot({ path: SHOT });
  await page.click('#bbePlay');
  await page.click('#bbeOk'); await page.waitForTimeout(500);
  const st = await page.evaluate(() => {
    const w = SS.band._state.wiz;
    const ids = Object.keys(w.myBass || {});
    const modes = JSON.stringify(w.parts).match(/my_[\w-]+/g) || [];
    return { ids, modes, m: ids[0] && w.myBass[ids[0]], lib: SS.myBass.inLibrary(ids[0]) };
  });
  ok(st.ids.length === 1 && st.m.name === 'Ma séquence néon' && st.m.notes.length === 16, `motif dans la chanson : ${st.m && st.m.name}, ${st.m && st.m.notes.length} notes`);
  ok(st.modes.includes(st.ids[0]) && st.lib, 'la scène le joue ; gardé dans Mes motifs');
  ok(st.m.notes.some((x) => x[2] === 'a' && x[4] === 'g') && st.m.notes[0][3] < 0.5, 'approche glissée et première note fantôme gardées');
  ok(await page.locator('#bwMotif .mot-card.on .mot-badge.mine').count() === 1 && /Ma séquence néon/.test(await page.textContent('#bwMotif .mot-now')), 'carte « ✎ À moi » choisie dans « Mes motifs »');
  ok(await page.locator('#bwMotif .mot-fam[data-f="mine"].on').count() === 1 && (await page.locator('#bwBassNew').count()) === 1, 'famille « ✎ Mes motifs » + « ＋ Nouveau motif… »');
  if (SHOT) await page.locator('#bwMotif').screenshot({ path: SHOT.replace('.png', '-carte.png') });
  // Annuler un nouveau motif : rien ne change, le moteur l'oublie
  const before = await page.evaluate(() => JSON.stringify([SS.band._state.wiz.parts, SS.band._state.wiz.myBass, SS.bandSong.myBassIds()]));
  await page.click('#bwBassNew'); await page.waitForTimeout(400);
  await page.mouse.click(box.x + 3.5 * W, box.y + 4 * 22 + 11);
  await page.click('#bbeCancel'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => JSON.stringify([SS.band._state.wiz.parts, SS.band._state.wiz.myBass, SS.bandSong.myBassIds()])) === before, 'Annuler : rien ne change');
  // Claude : le même motif par la boîte à outils
  const r = await page.evaluate(async () => {
    try {
      return await window.StepSeq.assistantMotifBasse({ musicien: 'bass', scenes: 'toutes', nom: 'Par Claude', notes: [{ pas: 0, note: 'fondamentale', dur: 2 }, { pas: 6, note: 'octave' }, { pas: 14, note: 'approche', glisse: true }] });
    } catch (e) {
      return { err: e.message };
    }
  });
  ok(r && r.ok && /^my_/.test(r.motif), 'outil Claude assistantMotifBasse : ' + (r.message || r.erreur || r.err));
  ok(!errs.length, 'pas d’erreur JS ' + errs.join(' | '));
  await b.close(); server.close();
})();
