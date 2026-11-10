/*
 * Test de bout en bout : pilote auto des faders (Auto Mix) sur une chanson Band jouée en temps réel.
 *   node tests/e2e/automix-pilot.js
 * La basse est baissée de 12 dB ; le pilote doit la remonter par petits gestes, sans toucher au reste plus que
 * nécessaire, puis laisser tranquille un fader repris à la main.
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
  await page.click('#bandPresets .band-preset >> nth=1');
  await page.click('#bandSongBtn');
  await page.waitForTimeout(200);
  if (await page.isVisible('#bcfSong')) await page.click('#bcfSong');
  await page.waitForTimeout(1500);
  const vols = () => page.evaluate(() => Object.fromEntries(window.__p().tracks.map((t) => [t.band ? t.band.key : t.id, 20 * Math.log10(t.volume)])));
  await page.evaluate(() => {
    window.__p = () => JSON.parse(localStorage.getItem('stepseq.autosave'));
  });

  await page.click('#mixerBtn');
  await page.waitForTimeout(400);
  await page.click('#amBtn');
  await page.waitForTimeout(300);
  ok(await page.isVisible('#amPilotBtn'), 'bouton du pilote auto dans le panneau');
  await page.uncheck('#amPilotProcessing'); // ce scénario isole le pilotage des faders
  const hasNullText = () => page.locator('#amPilot').evaluate((el) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim() === 'null'));
  ok(!(await hasNullText()), 'pilote au repos : aucun texte « null » à la place de l’action');
  const width = await page.locator('#automix').evaluate((el) => el.getBoundingClientRect().width);
  const grip = await page.locator('#amResize').boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + 80);
  await page.mouse.down();
  await page.mouse.move(grip.x - 120, grip.y + 80, { steps: 8 });
  await page.mouse.up();
  ok(await page.locator('#automix').evaluate((el) => el.getBoundingClientRect().width) > width + 100, 'bord gauche : panneau élargi');
  await page.locator('#amResize').focus();
  await page.keyboard.press('Home');
  ok(await page.locator('#automix').evaluate((el) => el.getBoundingClientRect().width) === 320, 'largeur réglable au clavier');
  await page.keyboard.press('ArrowLeft');

  // la basse perd 12 dB (fader à la main)
  const leadId = await page.evaluate(() => window.__p().tracks.find((t) => t.band && t.band.key === 'bass').id);
  const fader = page.locator(`#mixerStrips .strip[data-id="${leadId}"] .fader`);
  await fader.evaluate((el) => {
    for (let i = 0; i < 24; i++) el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  });
  await page.waitForTimeout(800);
  const v0 = await vols();

  await page.click('#amPilotBtn');
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => SS.audio.isPlaying()), 'le pilote lance la lecture');
  ok(/Arrêter/.test(await page.textContent('#amPilotBtn')), 'bouton : arrêter le pilote');
  ok(!(await hasNullText()), 'pilote en écoute : aucun texte « null » sans action en cours');
  ok(!(await page.isVisible('#amCards')) && !(await page.isVisible('#amFoot')) && !(await page.isVisible('#amScore')),
    'pilote actif : conseils et commandes manuelles masqués');
  // pendant un geste, le fader glisse (plusieurs valeurs intermédiaires)
  const seen = new Set();
  let highlighted = false;
  let taskShown = false;
  for (let i = 0; i < 300; i++) {
    seen.add(await fader.getAttribute('aria-valuetext'));
    highlighted ||= await page.locator('#mixerStrips .strip.selected.pilot-working .fader.pilot-control').count() > 0;
    taskShown ||= await page.locator('#amPilot .am-pilot-task').count() > 0;
    await page.waitForTimeout(100);
  }
  const v1 = await vols();
  ok(v1.bass > v0.bass + 4, `basse remontée par le pilote : ${v0.bass.toFixed(1)} → ${v1.bass.toFixed(1)} dB`);
  ok(seen.size >= 4, `le fader glisse par petits pas (${seen.size} positions vues)`);
  ok(highlighted, 'pendant le geste : tranche sélectionnée et fader illuminé');
  ok(taskShown, 'action en cours : piste et niveaux de départ et d’arrivée affichés');
  ok(await page.locator('#amPilot .am-pilot-log time').count() > 0, 'journal des actions horodaté');
  const others = Object.keys(v0).filter((k) => k !== 'bass');
  const drift = Math.max(...others.map((k) => Math.abs(v1[k] - v0[k] - (v1[others[0]] - v0[others[0]]))));
  ok(drift < 6, `les autres pistes gardent leur équilibre entre elles (écart ${drift.toFixed(1)} dB)`);
  ok((await page.locator('#amPilot .am-pilot-log li').count()) >= 2, 'journal des gestes du pilote');
  ok(!(await page.locator('#amCards .am-card[data-id^="bal:"]').count()), 'les conseils de fader sont confiés au pilote');

  // reprise en main : on touche le fader de la basse, le pilote la laisse
  await fader.evaluate((el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
  await page.waitForTimeout(1500);
  const locked = await page.evaluate((id) => SS.automixPanel._state().pilot.locked.has(id), leadId);
  ok(locked, 'fader touché à la main : repris par l\'utilisateur');
  ok(/à la main/.test(await page.textContent('#amPilot .am-pilot-log')), 'le journal le signale');

  // Déclencher un geste de niveau d'ensemble pour vérifier le repérage du gain Master.
  await page.evaluate(() => {
    const plan = SS.automixPilot.plan;
    const p = window.__p();
    const state = SS.automixPanel._state().pilot;
    state.lastMove = -Infinity;
    SS.automixPilot.plan = () => {
      SS.automixPilot.plan = plan;
      return { kind: 'stage', delta: -1.5, why: 'marge du mix', moves: p.tracks.map((t) => ({ id: t.id, from: 20 * Math.log10(t.volume), to: 20 * Math.log10(t.volume) - 1.5 })) };
    };
  });
  await page.waitForSelector('#mixerDetail [data-control="mastering.drive"].pilot-control');
  ok(await page.locator('#mixerStrips .strip.master.selected.pilot-working').count() === 1, 'gain d’ensemble : Master sélectionné');
  ok(await page.locator('#mixerStrips .fader.pilot-control').count() > 1, 'gain d’ensemble : tous les faders concernés illuminés');
  await page.screenshot({ path: '/tmp/stepseq-pilot-ui.png' });

  await page.click('#amPilotBtn');
  await page.waitForTimeout(300);
  ok(!(await page.evaluate(() => SS.automixPanel._state().pilot)), 'pilote arrêté');
  ok(!(await hasNullText()), 'pilote arrêté : aucun texte « null » résiduel');
  ok(await page.isVisible('#amCards') && await page.isVisible('#amFoot'), 'arrêt du pilote : conseils manuels réaffichés');
  ok(await page.locator('.pilot-working, .pilot-control').count() === 0, 'arrêt : aucun réglage ne reste illuminé');
  ok(/Démarrer le pilote auto/.test(await page.textContent('#amPilotBtn')), 'bouton revenu à « Pilote auto »');
  await page.click('#amClose');
  await page.click('#amBtn');
  ok(await page.locator('#automix').evaluate((el) => el.getBoundingClientRect().width) === 340, 'largeur conservée à la réouverture');
  await page.setViewportSize({ width: 800, height: 900 });
  ok(!(await page.isVisible('#amResize')), 'petit écran : panneau empilé sans poignée latérale');
  ok(await page.locator('#automix').evaluate((el) => el.getBoundingClientRect().right <= window.innerWidth), 'petit écran : largeur contenue dans la fenêtre');
  await page.click('#amClose');
  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
