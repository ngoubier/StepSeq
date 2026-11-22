/*
 * Pistes Ambient (js/ambient.js, js/ambientpanel.js) : rôle « Ambient » dans « Nouvelle piste », une piste par module
 * (Jardin, Paysage, Fresque), lecture de la chanson (le moteur suit les accords des scènes), fenêtre de réglages.
 *   node tests/e2e/ambient.js [dossier-captures]
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
const SHOTS = process.argv[2];

// chanson de 2 scènes en Ré majeur : I – IV puis vi – V
const scene = (id, name, chords) => ({ id, name, bars: 4, data: {}, key: { tonic: 'D', mode: 'major' }, grid: { chords: chords.map(([degree, type], i) => ({ step: i * 32, len: 32, degree, type })) } });
const PROJECT = { format: 'stepseq', version: 1, title: 'Ambient', tempo: 70, bars: 4, tracks: [], scenes: [scene('s1', 'Aube', [[0, 'maj'], [3, 'maj']]), scene('s2', 'Brume', [[5, 'min'], [4, 'maj']])], current: 's1', song: [{ scene: 's1', repeat: 1 }, { scene: 's2', repeat: 1 }], playMode: 'song' };

(async () => {
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  let ok = 0, ko = 0;
  const check = (c, msg) => (c ? (ok++, console.log('OK  ', msg)) : (ko++, console.log('FAIL', msg)));
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => m.type() === 'warning' && /Ambient/.test(m.text()) && errs.push(m.text()));
    await page.addInitScript((p) => {
      localStorage.setItem('stepseq.autosave', JSON.stringify(p));
      localStorage.setItem('ss.diagMode', '0');
    }, PROJECT);
    page.setDefaultTimeout(15000);
    await page.goto(`http://localhost:${server.address().port}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.SS && SS.ui && SS.catalog && SS.ambient);

    // une piste par module, choisi dans « Nouvelle piste » › Ambient
    for (const mod of ['jardin', 'paysage', 'fresque']) {
      await page.click('#emptyAdd');
      await page.click('#dlgRoles button[data-v="ambient"]');
      const names = await page.$$eval('#dlgSndList .pl-item', (l) => l.map((x) => x.textContent));
      if (mod === 'jardin') check(names.length === 3 && /Jardin/.test(names[0]) && /Paysage/.test(names[1]) && /Fresque/.test(names[2]), 'rôle Ambient : ' + names.join(' | '));
      await page.click(`#dlgSndList .pl-item:nth-child(${['jardin', 'paysage', 'fresque'].indexOf(mod) + 1})`);
      await page.click('#dlgOk');
      await page.waitForFunction((n) => document.querySelectorAll('.track').length === n, ['jardin', 'paysage', 'fresque'].indexOf(mod) + 1);
    }
    const tracks = await page.evaluate(() => SS.audio && JSON.parse(localStorage.getItem('stepseq.autosave') || '{}').tracks);
    await page.waitForTimeout(1200);
    const saved = await page.evaluate(() => (JSON.parse(localStorage.getItem('stepseq.autosave') || '{}').tracks || []).map((t) => `${t.family}:${t.instrument}:${(t.fx || {}).sendSpace}`));
    check(saved.join() === 'ambient:jardin:0.5,ambient:paysage:0.5,ambient:fresque:0.45', 'pistes créées (module, envoi Cosmos) : ' + saved.join(', '));
    void tracks;

    // lecture de la chanson : chaque module tourne et suit l'accord de la scène
    await page.click('#play');
    await page.waitForTimeout(6000);
    const live = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('.track')].map((e) => e.dataset.id);
      return ids.map((id) => {
        const l = SS.ambient.live(id);
        return l ? { frac: +l.frac.toFixed(3), pcs: l.env.pcs, grains: (l.grains || []).length, seeds: l.lastSeed ? l.lastSeed.size : 0 } : null;
      });
    });
    check(live.every(Boolean), 'les 3 moteurs tournent : ' + JSON.stringify(live));
    check(live[0] && live[0].pcs.join() === '2,6,9', 'accord de la 1re scène (Ré) : ' + (live[0] && live[0].pcs));
    check(live[0] && live[0].grains > 20, 'Jardin : des grains partent');
    check(live[0] && live[0].frac > 0 && live[0].frac < 0.5, 'position dans la chanson : ' + (live[0] && live[0].frac));
    const level = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('.track')].map((e) => e.dataset.id);
      return ids.map((id) => {
        const l = SS.audio.levels && SS.audio.levels(id);
        return l ? Math.round((l.peak ?? l.rms ?? 0) * 1000) / 1000 : null;
      });
    });
    console.log('     niveaux', JSON.stringify(level));

    // fenêtre de réglages de chaque module
    const ids = await page.$$eval('.track', (l) => l.map((e) => e.dataset.id));
    for (const [i, mod] of ['jardin', 'paysage', 'fresque'].entries()) {
      await page.click(`.track[data-id="${ids[i]}"] .th-sd`);
      await page.waitForSelector('dialog.amb-dialog[open]');
      await page.waitForTimeout(1500);
      const title = await page.$eval('#ambTitle', (e) => e.textContent);
      check(new RegExp(mod, 'i').test(title.normalize('NFD').replace(/[̀-ͯ]/g, '')), `fenêtre ${mod} : ${title}`);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `ambient-${mod}.png`) });
      if (mod === 'paysage') {
        // planter une graine
        const box = await page.$eval('.amb-land', (c) => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
        await page.mouse.click(box.x + box.w * 0.6, box.y + box.h * 0.5);
        await page.waitForTimeout(400);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'ambient-paysage.png') });
        await page.click('dialog.amb-dialog button[type=submit]');
        await page.waitForTimeout(1300);
        const n = await page.evaluate(() => ((JSON.parse(localStorage.getItem('stepseq.autosave') || '{}').tracks[1].ambient || {}).paysage || {}).seeds?.length);
        check(n === 6, 'Paysage : graine plantée (' + n + ' graines)');
        continue;
      }
      await page.click('#ambCancel');
    }
    await page.click('#play');
    check(!errs.length, 'aucune erreur JS ' + errs.join(' / '));
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`${ok} OK, ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
})();
