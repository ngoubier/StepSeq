/*
 * Test de bout en bout : Grille → Assistant, chaque instrument de la grille a son musicien, et les musiciens de l'assistant
 * absents de la grille sont muets (js/band.js readRows / takeGrid) :
 *   node tests/e2e/grid-orphans.js [dossier-captures]
 * Un brouillon d'assistant (pas encore dans la grille), puis une grille faite à la main (basse, kick, caisse claire) :
 * la fenêtre « Reprendre la grille » donne un musicien à chaque instrument (batterie : un seul pour le kit), même verrouillé,
 * et propose « Muet » pour les musiciens de l'assistant qui ne sont pas dans la grille.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '..', '..');
const SHOTS = process.argv[2];
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
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(800);
  await page.evaluate(() => localStorage.setItem('stepseq.autosave', SS.serialize(SS.newProject())));
  await page.reload();
  await page.waitForTimeout(1200);
  // un brouillon d'assistant, pas mis dans la grille
  await page.click('#viewWiz');
  await page.waitForTimeout(400);
  if (await page.isVisible('#brgSkip')) await page.click('#brgSkip');
  await page.click('#bandStyles .bsty:not(.bsty-blank)');
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => SS.band._state.group.list.map((r) => r.id));
  await page.click('#viewGrid');
  await page.waitForTimeout(2500);
  // la grille, faite à la main
  await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('stepseq.autosave'));
    p.tracks = [];
    const add = (o) => {
      const t = SS.newTrack(o, p);
      p.tracks.push(t);
      return t;
    };
    add({ type: 'instrument', name: 'Ma basse', family: 'bass', instrument: SS.findFamily('bass').instruments[0].id }).events.push({ step: 0, len: 4, notes: [36], vel: 1 });
    add({ type: 'drum', name: 'Kick', source: 'tdm', sound: 'bd', machine: 'RolandTR909' }).steps[0] = 1;
    add({ type: 'drum', name: 'Snare', source: 'tdm', sound: 'sd', machine: 'RolandTR909' }).steps[4] = 1;
    localStorage.setItem('stepseq.autosave', JSON.stringify(p));
  });
  await page.reload();
  await page.waitForTimeout(1200);
  await page.click('#viewWiz');
  await page.waitForTimeout(500);
  ok(await page.isVisible('#brgGo'), 'fenêtre « Reprendre la grille »');
  const absent = await page.evaluate(() => [...document.querySelectorAll('.brg-row.brg-absent')].map((r) => r.dataset.mu));
  ok(absent.length === before.length && before.every((id) => absent.includes(id)), 'les musiciens de l’assistant absents de la grille ont leur ligne : ' + absent.join(', '));
  ok(await page.evaluate(() => [...document.querySelectorAll('.brg-row.brg-absent')].every((r) => r.classList.contains('muted'))), '… muets par défaut');
  // le premier joue quand même
  await page.click(`.brg-row[data-mu="${before[0]}"] button[data-v="false"]`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'grille-musiciens-muets.png') });
  await page.click('#brgGo');
  await page.waitForTimeout(500);
  const g = await page.evaluate(() => {
    const S = SS.band._state;
    const cols = SS.band.plannedTracks().map((o) => o.band.musician);
    return { names: S.group.list.map((r) => r.name), gridInst: (S.gridInst || []).map((i) => i.type + '>' + i.mu), mute: [...S.wiz.mute], locks: Object.keys(S.wiz.locks || {}).length, cols };
  });
  ok(g.names.includes('Ma basse') && g.names.includes('Batterie'), 'un musicien pour la basse et un pour le kit : ' + g.names.join(', '));
  ok(g.gridInst.length === 2 && g.gridInst.some((x) => /^drums>x/.test(x)) && g.gridInst.some((x) => /^bass>x/.test(x)), 'ils jouent les pistes de la grille : ' + g.gridInst.join(', '));
  ok(g.locks === 3, 'pistes à notes écrites à la main : verrouillées (jouées telles quelles)');
  ok(!g.mute.some((id) => id.split(':')[0] === before[0]) && before.slice(1).every((m) => g.mute.some((id) => id.split(':')[0] === m)), 'muets : les musiciens absents de la grille, sauf celui gardé');
  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
