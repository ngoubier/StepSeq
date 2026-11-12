/* Notes indépendantes superposées sur une piste Mono. */
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
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const project = { format: 'stepseq', version: 1, title: 'Poly Mono', tempo: 120, bars: 1,
      tracks: [{ id: 'mono', type: 'instrument', name: 'Mono', family: 'bass', instrument: 'syn_sub', category: 'mono', octave: 4, volume: 0.5, events: [] }], scenes: [], song: [] };
    await page.addInitScript(p => { if (!localStorage.getItem('stepseq.autosave')) localStorage.setItem('stepseq.autosave', JSON.stringify(p)); }, project);
    await page.goto(`http://localhost:${server.address().port}/`);
    await page.locator('.th-roll').click();
    const cell = (m, s) => page.locator(`.rcell[data-midi="${m}"][data-step="${s}"]`);
    const click = async (m, s) => { await cell(m, s).click({ position: { x: 5, y: 9 } }); await page.waitForTimeout(500); };
    const events = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')).tracks[0].events);
    await click(60, 0);
    await click(64, 0);
    ok((await events()).length === 2, 'deux notes simultanées en mode Mono');
    ok(await cell(60, 0).evaluate(e => e.classList.contains('on')), 'la première note reste affichée');
    await click(64, 0);
    ok((await events()).length === 1 && (await events())[0].notes[0] === 60, 'supprimer la seconde note conserve la première');
    await page.keyboard.press('Control+z'); await page.waitForTimeout(500);
    ok((await events()).length === 2, 'annuler restaure la superposition');
    await click(67, 2);
    const edge = await cell(64, 0).boundingBox();
    const end = await cell(64, 4).boundingBox();
    await page.mouse.move(edge.x + edge.width - 2, edge.y + edge.height / 2);
    await page.mouse.down();
    await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 8 });
    await page.mouse.up(); await page.waitForTimeout(500);
    ok((await events()).find(e => e.notes[0] === 64).len === 5, 'allonger une note au-delà des autres hauteurs');
    ok((await events()).find(e => e.notes[0] === 60).len === 1, 'la durée de la première note reste indépendante');
    await page.reload(); await page.locator('.th-roll').click();
    ok(await cell(60, 0).evaluate(e => e.classList.contains('on')) && await cell(64, 0).evaluate(e => e.classList.contains('on')), 'les notes superposées sont conservées au rechargement');
    ok(!errors.length, 'aucune erreur JavaScript : ' + errors.join('; '));
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
