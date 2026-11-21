/*
 * Mode tutoriel « Musique de film » (js/tutorial.js) : le coach, la scène d'exercice et les leçons 1 à 3.
 *   node tests/e2e/tutorial.js [dossier-captures]
 * 🎓 Tutoriel sur la carte de scène → parcours ; la scène d'exercice ; une question fausse puis juste ; les gestes dans
 * l'assistant (émotion, entrée, fin, repère à 42 s, synchro, tempo 80) réussissent les étapes ; progression gardée ; Échap.
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
const SHOTS = process.argv[2] || null;
const shot = async (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, name) });

(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1200);
  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);
  await page.locator('#bandStyles .bsty[data-v="film"]').click();
  await page.waitForTimeout(400);

  const fb = () => page.textContent('#tutCoach .tut-fb');
  const fbOk = async () => (await page.getAttribute('#tutCoach .tut-fb', 'class')).includes('ok');
  const next = async () => {
    await page.waitForTimeout(700); // vérification périodique du coach
    await page.click('#tutCoach .tut-next');
    await page.waitForTimeout(150);
  };
  const film = () => page.evaluate(() => SS.band.claude.film());

  await page.click('#bfmTuto');
  ok(await page.isVisible('#tutCoach'), 'le coach s’ouvre à droite de l’assistant');
  ok((await page.locator('#tutCoach .tut-les').count()) === 3, 'parcours : trois leçons');
  await shot(page, 'tuto-parcours.png');
  await page.click('#tutCoach .tut-go');
  ok(await page.isVisible('#tutCoach .tut-open-ex'), 'la scène d’exercice est proposée avant la première leçon');
  await page.click('#tutCoach .tut-open-ex');
  await page.waitForTimeout(300);
  ok((await film()).titre === 'Exercice : le couloir', 'scène d’exercice ouverte');

  // Leçon 1 : lecture, deux questions, écoute A/B, l'émotion du premier passage
  ok(await page.$eval('#bandSong .bs-desc', (e) => e.classList.contains('tut-spot')), 'projecteur sur le récit de la scène');
  await next();
  await page.click('#tutCoach .tut-quiz .chip >> nth=0');
  ok(/Trop vague/.test(await fb()), 'réponse fausse expliquée');
  ok(await page.isDisabled('#tutCoach .tut-next'), 'Suivant attend la bonne réponse');
  await page.click('#tutCoach .tut-quiz .chip >> nth=1');
  ok(await fbOk(), 'bonne réponse acceptée');
  await next();
  await page.click('#tutCoach .tut-quiz .chip >> nth=0');
  await next();
  await page.click('#tutCoach .tut-quiz .chip >> nth=0');
  await next();
  await page.selectOption('.bfm-cues tbody tr:first-child .bfm-emo', 'nostalgie');
  await page.waitForTimeout(800);
  ok(await fbOk(), 'émotion Nostalgie choisie dans l’assistant : étape réussie');
  await shot(page, 'tuto-lecon1.png');
  await next();

  // Leçon 2 : la scène sans musique, entrée, fin, repère à 42 s, synchro, arrivée
  ok(/Repérer/.test(await page.textContent('#tutCoach .tut-title')), 'leçon 2 enchaînée');
  await page.click('#tutCoach .tut-play');
  await page.waitForTimeout(300);
  await page.click('#tutCoach .tut-play'); // arrêt
  await next();
  await page.fill('#bfmStart', '6');
  await page.dispatchEvent('#bfmStart', 'change');
  await next();
  await page.fill('#bfmEnd', '54');
  await page.dispatchEvent('#bfmEnd', 'change');
  await next();
  await page.click('#bfmAdd');
  await page.waitForTimeout(200);
  await page.fill('.bfm-cues tbody tr:last-child .bfm-time', '42');
  await page.dispatchEvent('.bfm-cues tbody tr:last-child .bfm-time', 'change');
  await next();
  await page.check('.bfm-cues tbody tr:last-child input[name="bfmSync"]');
  await page.waitForTimeout(800);
  ok(await fbOk(), 'synchro posée sur le relais à 00:42');
  await shot(page, 'tuto-lecon2.png');
  await next();
  await page.click('#tutCoach .tut-quiz .chip >> nth=1');
  await next();

  // Leçon 3 : le calcul, les métronomes, le tempo calé
  await page.fill('#tutCoach .tut-num', '48');
  await next();
  await page.fill('#tutCoach .tut-num', '79');
  ok(/2 880/.test(await fb()), 'calcul faux : un indice');
  await page.fill('#tutCoach .tut-num', '80');
  await next();
  for (const k of [0, 1]) {
    await page.click(`#tutCoach .tut-play >> nth=${k}`);
    await page.waitForTimeout(200);
  }
  await page.click('#tutCoach .tut-play >> nth=1');
  await next();
  if (await page.$('.bfm-opts [data-bpm="80"]')) await page.click('.bfm-opts [data-bpm="80"]');
  await page.waitForTimeout(800);
  const f = await film();
  ok(f.bpm === 80 && f.reperes.find((r) => r.synchro).mesure === 13, `80 BPM, synchro mesure 13 (${f.bpm} BPM)`);
  ok(await fbOk(), 'tempo calé : étape réussie');
  await shot(page, 'tuto-lecon3.png');
  await next();
  ok((await page.locator('#tutCoach .tut-les.done').count()) === 3, 'les trois leçons sont cochées');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.tutorial.film')).done);
  ok(saved.intent && saved.spot && saved.tempo, 'progression gardée dans le navigateur');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  ok(!(await page.isVisible('#tutCoach')), 'Échap ferme le coach');
  ok(await page.evaluate(() => document.body.classList.contains('wizard-mode')), '… et l’assistant reste ouvert');
  ok((await page.locator('.tut-spot').count()) === 0, 'plus de projecteur, coach fermé');
  ok(!errs.length, 'aucune erreur : ' + errs.join(' | '));
  await b.close();
  server.close();
})();
