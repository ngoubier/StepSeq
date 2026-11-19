/*
 * Test de bout en bout : mode Jouer (js/live.js).
 *   node tests/e2e/live-keyboard.js
 * 1. ² active le mode Jouer : bandeau, piste armée. 2. Une touche tenue 1,2 s sonne tout du long (note tenue),
 *    puis se tait au relâchement. 3. Entrée enregistre (décompte, boucle) : les notes jouées s'inscrivent dans la piste,
 *    avec leur vélocité ; un seul Ctrl+Z efface tout l'enregistrement.
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
const ok = (c, m) => {
  console.log((c ? 'OK   ' : 'FAIL ') + m);
  if (!c) process.exitCode = 1;
};
const OUT = process.env.SHOTS || '/tmp';

(async () => {
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const origin = `http://localhost:${server.address().port}`;
    const song = {
      format: 'stepseq', version: 1, title: 'Clavier', tempo: 120, bars: 1,
      tracks: [{ id: 'lead', type: 'instrument', name: 'Lead', family: 'lead', instrument: 'syn_sub', category: 'lead', volume: 0.7, events: [] }],
      scenes: [], song: [],
    };
    await page.addInitScript((p) => {
      localStorage.setItem('stepseq.autosave', JSON.stringify(p));
      localStorage.setItem('ss.diagMode', '0');
      localStorage.removeItem('stepseq.live');
    }, song);
    await page.goto(origin + '/index.html');
    await page.waitForFunction(() => window.SS && SS.live);

    // 1. mode Jouer
    await page.keyboard.press('Backquote');
    const on = await page.evaluate(() => ({ body: document.body.classList.contains('kb-on'), dock: !document.querySelector('#kbDock').hidden, armed: SS.live.armedId(), btn: !!document.querySelector('.track.armed .th-btn.arm.on') }));
    ok(on.body && on.dock && on.armed === 'lead' && on.btn, `² : mode Jouer, bandeau visible, piste « lead » armée (${JSON.stringify(on)})`);

    // 2. note tenue
    const peak = () => page.evaluate(() => SS.audio.probe().out.peak);
    await page.keyboard.down('KeyQ');
    await page.waitForTimeout(1200);
    const held = await peak();
    const lit = await page.evaluate(() => document.querySelector('.kb-key.down') && document.querySelector('.kb-key.down').dataset.code);
    await page.keyboard.up('KeyQ');
    await page.waitForTimeout(1200);
    const after = await peak();
    ok(held > 0.01, `touche tenue 1,2 s : toujours audible (crête ${held.toFixed(3)})`);
    ok(after < held / 10, `relâchée : la note s'éteint (crête ${after.toFixed(4)})`);
    ok(lit === 'KeyQ', 'la touche s’allume sur le clavier à l’écran');

    // 3. enregistrement
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => SS.audio.isPlaying() && SS.audio.stepAt(SS.audio.heardTime()) > 1, null, { timeout: 8000 });
    const status = await page.textContent('#kbStatus');
    for (const k of ['KeyQ', 'KeyE', 'KeyT']) {
      await page.keyboard.down(k);
      await page.waitForTimeout(240);
      await page.keyboard.up(k);
      await page.waitForTimeout(260);
    }
    await page.keyboard.down('Shift');
    await page.keyboard.down('KeyI');
    await page.waitForTimeout(240);
    await page.keyboard.up('KeyI');
    await page.keyboard.up('Shift');
    await page.keyboard.press('Enter');
    const rec = await page.evaluate(() => ({ rec: SS.live.isRecording() }));
    await page.waitForTimeout(600); // sauvegarde locale
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')).tracks[0].events);
    const notes = saved.flatMap((e) => e.notes).sort((a, b) => a - b);
    ok(!rec.rec, 'Entrée arrête l’enregistrement');
    ok(/Enregistrement · tour 1/.test(status), 'statut : ' + status.trim());
    ok(JSON.stringify(notes) === JSON.stringify([60, 64, 67, 72]), 'notes enregistrées : ' + JSON.stringify(saved));
    ok(saved.some((e) => e.notes.includes(72) && e.vel === 1) && saved.some((e) => e.notes.includes(60) && Math.abs(e.vel - 96 / 127) < 0.01), 'vélocités gardées (Maj = accent)');
    await page.screenshot({ path: path.join(OUT, 'live-keyboard.png') });

    await page.click('#stop');
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(600);
    const undone = await page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')).tracks[0].events.length);
    ok(undone === 0, 'un seul Ctrl+Z efface tout l’enregistrement');
    ok(!errors.length, 'aucune erreur JavaScript' + (errors.length ? ' : ' + errors.join(' | ') : ''));
  } finally {
    await browser.close();
    server.close();
  }
})();
