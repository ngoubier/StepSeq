/*
 * Test de bout en bout : panneau Auto Mix de la console (écoute, diagnostic, conseils, A/B, préférences).
 *   node tests/e2e/automix-ui.js
 * Joue une chanson Band synthwave en temps réel pendant une quinzaine de secondes.
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

(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1600, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1000);
  await page.click('#bandBtn');
  await page.waitForTimeout(400);
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=1'); // Nightcall
  await page.click('#bandSongBtn');
  await page.waitForTimeout(200);
  if (await page.isVisible('#bcfSong')) await page.click('#bcfSong');
  await page.waitForTimeout(1500);
  const P = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));
  const S = () => page.evaluate(() => {
    const s = SS.automixPanel._state();
    return { ready: !!(s.diag && s.diag.ready), total: s.diag && s.diag.total, ids: s.diag ? s.diag.suggestions.map((x) => x.id) : [], decided: [...s.decisions.keys()], target: s.targetId, ab: s.ab, prefs: s.prefs };
  });

  // ouverture
  await page.click('#mixerBtn');
  await page.waitForTimeout(400);
  ok(await page.isVisible('#amBtn'), 'console : bouton Auto Mix');
  await page.waitForTimeout(300);
  ok(await page.isVisible('#automix'), 'le panneau s\'ouvre à droite');
  ok(/Lance la lecture/.test(await page.textContent('#amStatus')), 'arrêté : invite à lancer la lecture');
  ok((await S()).target === 'synthwave', 'objectif proposé d\'après le style du Band : synthwave');
  ok(!(await page.isVisible('#amTargets')) && !(await page.locator('.am-play').count()), 'objectif et bouton Lecture masqués');

  // préférences
  await page.click('#amPrefsBtn');
  await page.waitForTimeout(200);
  ok(await page.isVisible('#automixPrefs'), 'fenêtre des préférences');
  ok((await page.locator('#automixPrefs input[type=checkbox]').count()) === 8, '8 familles de réglages à autoriser');
  await page.selectOption('#amMinSecs', '10');
  await page.click('#amScope_sends');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.automix')));
  ok(stored.minSecs === 10 && stored.scopes.sends === false, 'préférences enregistrées dans le navigateur');
  await page.click('#automixPrefs .mx-close');

  // écoute
  await page.click('#amAssistantBtn');
  await page.waitForTimeout(14000);
  let s = await S();
  ok(s.ready, 'diagnostic prêt après 10 s d\'écoute');
  ok(s.total >= 0 && s.total <= 100 && (await page.locator('#amScore .am-crit').count()) === 7, `score pro (${s.total}) et 7 critères`);
  ok(/Écoute en cours/.test(await page.textContent('#amStatus')), 'statut : écoute en cours');
  ok(!s.ids.some((id) => /^(dry|wet):/.test(id)), 'les envois de reverb interdits ne sont pas proposés');

  // objectif Club (−8 LUFS) : la chanson Band (≈ −13 LUFS) est trop faible → gain d'entrée du mastering
  await page.click('#amPrefsBtn');
  await page.check('#am_amTarget_club');
  await page.click('#automixPrefs .mx-close');
  await page.waitForTimeout(300);
  s = await S();
  ok(s.target === 'club' && s.ids.includes('loud'), 'objectif changé : conseil de volume pour le club');
  await page.click('#amCards .am-tab >> nth=1');
  const before = (await P()).master.mastering.drive;
  await page.click('#amCards .am-card[data-id="loud"] .am-accept');
  await page.waitForTimeout(1200);
  const after = (await P()).master.mastering.drive;
  ok(after > before + 2, `conseil accepté : gain d'entrée ${before} → ${after} dB`);
  ok(/Appliqué/.test(await page.textContent('#amCards .am-card[data-id="loud"]')), 'la carte passe à « Appliqué »');
  ok(await page.isEnabled('#amFoot .am-ab button >> nth=0'), 'A/B disponible après un conseil accepté');
  await page.click('#amFoot .am-ab button >> nth=0');
  await page.waitForTimeout(300);
  ok((await S()).ab === 'A', 'écoute A (mix d\'origine)');
  ok((await P()).master.mastering.drive === after, 'l\'écoute A ne touche pas au projet');
  await page.click('#amFoot .am-ab button >> nth=1');

  // ajuster : intensité 50 %
  await page.click('#amCards .am-card[data-id="loud"] button >> text=Ajuster');
  await page.locator('#amCards .am-card[data-id="loud"] input[type=range]').fill('0.5');
  await page.waitForTimeout(1200);
  const half = (await P()).master.mastering.drive;
  ok(Math.abs(half - (before + (after - before) / 2)) < 0.6, `intensité 50 % : gain d'entrée ${half} dB`);

  // annulation (Ctrl+Z) : le conseil redevient à décider
  await page.click('#amCards .am-card[data-id="loud"] button >> text=Annuler');
  await page.waitForTimeout(1200);
  ok(Math.abs((await P()).master.mastering.drive - before) < 0.05, 'Annuler remet le réglage d\'avant');

  // Ctrl+Z annule un conseil accepté comme toute retouche ; la carte redevient « à décider »
  await page.click('#amCards .am-card[data-id="loud"] .am-accept');
  await page.waitForTimeout(800); // l'historique enregistre l'étape après 350 ms
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(1200);
  ok(Math.abs((await P()).master.mastering.drive - before) < 0.05, 'Ctrl+Z annule le conseil accepté');
  ok(!(await S()).decided.includes('loud') && (await page.isVisible('#amCards .am-card[data-id="loud"] .am-accept')), 'après Ctrl+Z, le conseil est de nouveau proposé');

  // refuser
  await page.click('#amCards .am-card[data-id="loud"] button >> text=Refuser');
  ok(/Écarté/.test(await page.textContent('#amCards .am-card[data-id="loud"]')), 'conseil refusé : écarté');

  // pastilles sur les tranches
  ok((await page.locator('#mixerStrips .am-badge').count()) > 0, 'pastilles de conseils sur les tranches');

  // réécouter
  await page.click('#amFoot button >> text=Réécouter');
  await page.waitForTimeout(600);
  s = await S();
  ok(!s.ready && s.decided.includes('loud'), 'réécouter : nouvelle écoute, les refus sont gardés');

  // fermeture : garder les réglages appliqués, repartir sans diagnostic ni écoute
  await page.waitForTimeout(11000);
  await page.click('#amCards .am-card[data-id="loud"] button >> text=Annuler');
  await page.click('#amCards .am-card[data-id="loud"] .am-accept');
  await page.waitForTimeout(1200);
  const keptDrive = (await P()).master.mastering.drive;
  await page.click('#amFoot .am-ab button >> nth=0');
  await page.click('#amClose');
  ok(!(await page.isVisible('#automix')), 'fermeture du panneau');
  const closed = await page.evaluate(() => ({
    secs: SS.automixListen.secs(), listening: SS.automixListen.listening(),
    playing: SS.audio.isPlaying(), paused: SS.audio.isPaused(), diag: SS.automixPanel._state().diag,
  }));
  ok(closed.secs === 0 && !closed.listening && !closed.playing && !closed.paused && closed.diag === null,
    'fermer efface les mesures et le diagnostic et remet la lecture à zéro');
  ok((await S()).decided.length === 1 && (await S()).decided[0] === 'loud' && (await S()).ab === 'B',
    'seule la proposition appliquée est conservée, écoute B restaurée');
  await page.click('#amBtn');
  await page.click('#amAssistantBtn');
  ok(await page.locator('#amCards .am-card').count() === 1 && /Appliqué/.test(await page.textContent('#amCards .am-card[data-id="loud"]')),
    'réouverture : proposition appliquée visible, aucune proposition en attente');
  ok((await P()).master.mastering.drive === keptDrive && await page.evaluate(() => SS.audio.isPlaying()),
    'réglage appliqué conservé, nouvelle écoute lancée par Assistant');
  await page.click('#amClose');
  await page.click('#play');
  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
