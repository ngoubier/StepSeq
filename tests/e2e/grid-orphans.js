/*
 * Test de bout en bout : Grille → Assistant, chaque instrument de la grille a son musicien, et les musiciens de l'assistant
 * absents de la grille sont muets (js/band.js readRows / takeGrid) :
 *   node tests/e2e/grid-orphans.js [dossier-captures]
 * Un brouillon d'assistant (pas encore dans la grille), puis une grille faite à la main (basse, kick, caisse claire) :
 * la fenêtre « Reprendre la grille » donne un musicien à chaque instrument (la basse, même verrouillée), les pistes de
 * batterie (kick, caisse claire, charleston) rejoignent toutes le batteur de l'assistant, et « Muet » est proposé pour les
 * musiciens de l'assistant qui ne sont pas dans la grille.
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
  await page.click('#bandStyles .bsty[data-v="synthwave"]');
  await page.waitForTimeout(300);
  await page.dispatchEvent('#bwNext', 'click');
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => SS.band._state.group.list.map((r) => r.id));
  const drummer = await page.evaluate(() => SS.band._state.group.list.find((r) => r.id === 'drums').id);
  const pieces0 = await page.evaluate(() => SS.band.plannedTracks().filter((o) => o.band.musician === 'drums').length);
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
    add({ type: 'drum', name: 'Snare', source: 'tdm', sound: 'sd', machine: 'RolandTR808' }).steps[4] = 1;
    add({ type: 'drum', name: 'Charley', source: 'tdm', sound: 'hh', machine: 'RolandTR909' }).steps[2] = 1;
    localStorage.setItem('stepseq.autosave', JSON.stringify(p));
  });
  await page.reload();
  await page.waitForTimeout(1200);
  await page.click('#viewWiz');
  await page.waitForTimeout(500);
  ok(await page.isVisible('#brgGo'), 'fenêtre « Reprendre la grille »');
  const absent = await page.evaluate(() => [...document.querySelectorAll('.brg-row.brg-absent')].map((r) => r.dataset.mu));
  const others = before.filter((id) => id !== drummer);
  ok(absent.length === others.length && others.every((id) => absent.includes(id)), 'les musiciens de l’assistant absents de la grille ont leur ligne, sauf le batteur : ' + absent.join(', '));
  ok(await page.evaluate(() => [...document.querySelectorAll('.brg-row.brg-absent')].every((r) => r.classList.contains('muted'))), '… muets par défaut');
  // le premier joue quand même
  await page.click(`.brg-row[data-mu="${others[0]}"] button[data-v="false"]`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'grille-musiciens-muets.png') });
  await page.click('#brgGo');
  await page.waitForTimeout(500);
  const g = await page.evaluate(() => {
    const S = SS.band._state;
    const drums = SS.band.plannedTracks().filter((o) => o.band.musician === 'drums');
    return { ids: S.group.list.map((r) => r.id), names: S.group.list.map((r) => r.name), gridInst: (S.gridInst || []).map((i) => i.type + '>' + i.mu), mute: [...S.wiz.mute], locks: Object.keys(S.wiz.locks || {}).length, drums: drums.length, machines: drums.slice(-3).map((o) => o.sound + '@' + o.machine) };
  });
  ok(g.ids.length === before.length + 1 && g.names.includes('Ma basse'), 'un seul musicien de plus, pour la basse : ' + g.names.join(', '));
  ok(g.drums === pieces0 + 3 && g.machines.join() === 'bd@RolandTR909,sd@RolandTR808,hh@RolandTR909', 'kick, caisse claire et charleston ajoutés au même batteur, avec leur son : ' + g.machines.join(', '));
  ok(g.gridInst.length === 2 && g.gridInst.includes('drums>drums') && g.gridInst.some((x) => /^bass>x/.test(x)), 'ils jouent les pistes de la grille : ' + g.gridInst.join(', '));
  ok(g.locks === 1, 'la basse (notes écrites à la main) est verrouillée ; la batterie est jouée par le batteur');
  ok(!g.mute.some((id) => id.split(':')[0] === others[0] || id.split(':')[0] === drummer) && others.slice(1).every((m) => g.mute.some((id) => id.split(':')[0] === m)), 'muets : les musiciens absents de la grille, sauf celui gardé et le batteur');
  ok(!errs.length, 'aucune erreur JS' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
