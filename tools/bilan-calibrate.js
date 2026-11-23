/*
 * Étalonnage du bilan du son (js/bilan.js) : une chanson par style, créée par l'assistant comme par Claude,
 * puis StepSeq.bilan() ; imprime LUFS, crête, équilibre, basse sur kick, écart entre passages, par style.
 *   node tools/bilan-calibrate.js [styles séparés par des virgules]   (≈ 4 min par style)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.otf': 'font/otf' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
const STYLES = (process.argv[2] || 'synthwave,pop,edm,techno,funk,hiphop,soul,latin,dnb,ambient').split(',');

(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch();
  const out = [];
  for (const st of STYLES) {
    const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
    try {
    page.on('dialog', (d) => d.accept());
    await page.goto(`http://localhost:${server.address().port}/index.html`);
    await page.waitForTimeout(1000);
    await page.click('#appMenuBtn');
    await page.click('#newProject');
    await page.waitForTimeout(600);
    const ev = (fn, a) => page.evaluate(fn, a);
    const s = await ev((x) => StepSeq.assistantStyle({ style: x }), st);
    if (!s.ok) { console.log(st, s.erreur); await page.close(); continue; }
    const c = await ev(() => StepSeq.assistantCreer());
    if (c.attente) { await page.click('#bcfSong').catch(() => {}); }
    await page.waitForTimeout(800);
    const t0 = Date.now();
    const r = await ev(() => StepSeq.bilan({ pistes: false }));
    if (!r.ok) { console.log(st, r.erreur); await page.close(); continue; }
    const t1 = Date.now();
    const scs = await ev(() => StepSeq.etat().scenes.map((x) => x.nom));
    const sc = scs.find((n) => /refrain|chorus|drop/i.test(n)) || scs[Math.floor(scs.length / 2)];
    const r2 = await ev((n) => StepSeq.bilan({ scene: n }), sc);
    if (!r2.ok) { console.log(st, r2.erreur); await page.close(); continue; }
    r.musiciens = r2.musiciens;
    r.basseSurKick = r2.basseSurKick;
    r.sceneEq = r2.master.equilibre;
    const ps = r.passages.map((p) => p.lufs).filter((x) => x != null);
    const row = { style: st, insp: s.message, s: Math.round((t1 - t0) / 1000), s2: Math.round((Date.now() - t1) / 1000), sceneEq: r.sceneEq, lufs: r.master.lufs, crete: r.master.crete, ...r.master.equilibre, kick: r.basseSurKick, ecart: ps.length ? Math.round((Math.max(...ps) - Math.min(...ps)) * 10) / 10 : null, musiciens: r.musiciens.map((m) => `${m.nom} ${m.lufs}/${m.crete}`).join(', '), conseils: r.conseils.length + r2.conseils.length };
    console.log(JSON.stringify(row));
    out.push(row);
    } catch (e) {
      console.log(st, 'échec :', e.message.split('\n')[0]);
    }
    await page.close().catch(() => {});
  }
  fs.writeFileSync(process.env.OUT || '/dev/null', JSON.stringify(out, null, 1));
  await b.close();
  server.close();
})();
