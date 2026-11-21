/*
 * Test de bout en bout : fiche Scène (js/scenesheet.js). Double-clic sur une scène → tiroir ; renommage ;
 * émotion et énergie ; « Muet » dans la scène : la piste se tait à la lecture, ses notes restent, et le réglage
 * survit à l'enregistrement.
 *   node tests/e2e/scene-sheet.js [dossier] [capture.png]
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', '..');
const SHOT = process.argv[3] || null;
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

(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1500);

  await page.dblclick('#sceneList .scene-chip.active .scene-name');
  ok(await page.isVisible('#sceneSheet'), 'double-clic sur la scène : la fiche s\'ouvre');
  ok((await page.$$('#sceneSheet .ssh-sec')).length >= 6, 'rubriques Tempo, Émotion, Accords, Instruments, Mouvement, Entrée/sortie');

  await page.fill('#sceneSheet .ssh-name', 'Refrain test');
  await page.press('#sceneSheet .ssh-name', 'Enter');
  await page.waitForTimeout(100);
  ok(/Refrain test/.test(await page.textContent('#sceneList')), 'renommage dans la fiche : la ligne Scènes suit');

  await page.click('#sceneSheet .ssh-combo-btn');
  ok(await page.isVisible('#sceneSheet .ssh-emo-panel'), 'émotion : le bouton ouvre le panneau des émotions');
  await page.click('#sceneSheet .ssh-emo-panel [data-emo="espoir"]');
  ok(!(await page.isVisible('#sceneSheet .ssh-emo-panel')) && /Espoir/.test(await page.textContent('#sceneSheet .ssh-combo-btn')), 'une émotion piochée : le panneau se ferme, le bouton l\'affiche');
  await page.click('#sceneSheet .ssh-lvl >> nth=0 >> button >> nth=3');
  const meta = await page.evaluate(() => {
    const sc = SS.currentScene(SS.claudeTools._project());
    return { emotion: sc.emotion, energy: sc.energy };
  });
  ok(meta.emotion === 'espoir' && meta.energy === 4, `émotion et énergie voulue rangées (${JSON.stringify(meta)})`);

  // piste qui joue : la nappe du projet de démo
  const rows = await page.$$eval('#sceneSheet .ssh-tr', (els) => els.map((e) => ({ id: e.dataset.track, name: e.querySelector('.ssh-tname').textContent, st: !!e.querySelector('.ssh-st3') })));
  const pad = rows.find((r) => /Pad/.test(r.name) && r.st) || rows.find((r) => r.st);
  const peak = (ms = 600) =>
    page.evaluate(async ({ id, ms }) => {
      let m = 0;
      for (let k = 0; k < ms / 50; k++) {
        const l = SS.audio.levels(id);
        m = Math.max(m, l ? l.peak : 0);
        await new Promise((r) => setTimeout(r, 50));
      }
      return m;
    }, { id: pad.id, ms });
  await page.click('#play');
  await page.waitForTimeout(2500);
  ok((await peak()) > 0.05, `${pad.name} joue`);
  await page.click(`#sceneSheet .ssh-tr[data-track="${pad.id}"] .ssh-st3 button >> nth=1`);
  await page.waitForTimeout(150);
  ok((await peak()) < 0.002, 'Muet dans la scène : la piste se tait aussitôt');
  ok(await page.$eval(`.track[data-id="${pad.id}"]`, (el) => el.classList.contains('scene-muted')), 'la piste est grisée dans la grille');
  const kept = await page.evaluate((id) => {
    const p = SS.claudeTools._project();
    const t = p.tracks.find((x) => x.id === id);
    const n = t.type === 'drum' ? t.steps.filter(Boolean).length : t.events.length;
    const q = SS.normalizeProject(JSON.parse(SS.serialize(p)));
    const sc = SS.currentScene(q);
    return { notes: n, saved: !!(sc.mute && sc.mute[id]), global: t.mute };
  }, pad.id);
  ok(kept.notes > 0 && !kept.global, 'les notes restent, la piste n\'est pas muette ailleurs');
  ok(kept.saved, 'le muet de la scène survit à l\'enregistrement');
  await page.click('#stop');

  // tempo propre à la scène : la lecture va deux fois plus vite, la barre du haut l'affiche en doré
  const rate = async () => {
    await page.evaluate(() => {
      window.__steps = 0;
      if (!window.__wrapped) {
        const f = SS.ui.setPlayhead;
        SS.ui.setPlayhead = (st) => { if (st >= 0) window.__steps++; return f(st); };
        window.__wrapped = true;
      }
    });
    await page.click('#play');
    await page.waitForTimeout(700);
    const a = await page.evaluate(() => window.__steps);
    await page.waitForTimeout(2000);
    const n = (await page.evaluate(() => window.__steps)) - a;
    await page.click('#stop');
    return n / 2;
  };
  const song = await page.evaluate(() => SS.claudeTools._project().tempo);
  const r1 = await rate();
  await page.click('#sceneSheet .ssh-seg button >> nth=1');
  await page.fill('#sceneSheet input.ssh-bpm', String(song * 2));
  await page.press('#sceneSheet input.ssh-bpm', 'Enter');
  await page.waitForTimeout(100);
  const st = await page.evaluate(() => {
    const p = SS.claudeTools._project();
    return { scene: SS.currentScene(p).tempo, song: p.tempo, bar: document.getElementById('tempo').value, gold: document.getElementById('tempo').classList.contains('scene-tempo'), chip: document.querySelector('#sceneList .scene-chip.active').textContent };
  });
  ok(st.scene === song * 2 && st.song === song, `Propre : la scène a son tempo, la chanson garde le sien (${JSON.stringify(st)})`);
  ok(st.bar === String(song * 2) && st.gold, 'barre du haut : tempo de la scène, en doré');
  ok(st.chip.includes(`· ${song * 2}`), 'la pastille de la scène montre son tempo');
  const r2 = await rate();
  ok(r1 > 0 && Math.abs(r2 / r1 - 2) < 0.3, `la lecture suit le tempo de la scène (${r1} → ${r2} pas/s)`);
  await page.click('#sceneSheet .ssh-seg button >> nth=0');
  ok(await page.evaluate(() => SS.currentScene(SS.claudeTools._project()).tempo === undefined), '= Chanson : la scène reprend le tempo de la chanson');

  if (SHOT) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: SHOT });
  }
  await page.keyboard.press('Escape');
  ok(!(await page.isVisible('#sceneSheet')), 'Échap ferme la fiche');
  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
