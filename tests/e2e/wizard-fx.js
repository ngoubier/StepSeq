/*
 * Test de bout en bout de l'étape « Effets et transitions » de l'assistant « Nouvelle chanson » (js/band.js, js/bandsong.js) :
 *   node tests/e2e/wizard-fx.js
 * Entre Mélodie et Mix ; sans retouche la chanson créée est celle d'avant ; longueur de la montée, coupure, cymbale inversée,
 * impact, descente, passe-haut global ; copie vers les autres drops ; percussions (matrice scènes × boucles) ; message quand le
 * musicien manque ; écoute de la transition ; brouillon (dont un brouillon de l'ancienne numérotation).
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
const SHOTS = process.env.SHOTS;
const ok = (c, m) => {
  console.log((c ? 'OK   ' : 'FAIL ') + m);
  if (!c) process.exitCode = 1;
};

(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch();
  const errs = [];
  const url = `http://localhost:${server.address().port}/index.html`;
  /** Une page neuve, l'assistant ouvert sur un style et sa première inspiration. */
  async function open(style, nth = 0, viewport = { width: 1500, height: 920 }) {
    const page = await b.newPage({ viewport });
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(url);
    await page.waitForTimeout(1000);
    await page.click('#appMenuBtn');
    await page.click('#newProject');
    await page.waitForTimeout(500);
    await page.click(`#bandStyles [data-v="${style}"]`);
    await page.click(`#bandPresets .band-preset >> nth=${nth}`);
    return page;
  }
  const num = (page, ref) => page.evaluate((r) => SS.band.stepNum(r), ref);
  const go = async (page, ref) => {
    await page.click(`#bandWizSteps li[data-step="${await num(page, ref)}"] button`);
    await page.waitForTimeout(350);
  };
  const wiz = (page, expr) => page.evaluate((e) => new Function('W', 'S', `return (${e})`)(SS.band._state.wiz, SS.band._state), expr);
  /** Données d'une scène (par nom) pour la piste dont l'identifiant commence par `pre`. */
  const dataOf = (page, scene, pre) =>
    page.evaluate(([n, p]) => {
      const sc = SS.band._state.wiz.res.scenes.find((x) => x.name === n);
      const id = Object.keys(sc.data).find((k) => k.endsWith(p));
      return id ? JSON.parse(JSON.stringify(sc.data[id])) : null;
    }, [scene, pre]);
  const on = (page, k) => page.getAttribute(`#fxon-${k}`, 'aria-checked');
  const P = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));

  // ---------- 1. L'étape : entre Mélodie et Mix, numérotation, clavier
  const page = await open('techno');
  const labels = await page.$$eval('#bandWizSteps li', (l) => l.map((x) => ({ n: +x.dataset.step, kind: x.dataset.kind, group: x.dataset.group || null, name: x.querySelector('.bw-sn').textContent.trim() })));
  const iFx = labels.findIndex((x) => x.name === 'Effets et transitions');
  ok(iFx > 1 && labels[iFx - 1].name === 'Arrangement' && labels[iFx - 2].kind === 'melody' && labels[iFx + 1].name === 'Mix' && labels[iFx + 2].name === 'Intégration', 'étape « Effets et transitions » entre l’Arrangement et le Mix, Intégration après');
  ok(labels[iFx - 1].group === 'Finaliser' && labels[iFx].group === null && labels[iFx + 1].group === null && labels.length === labels[iFx].n + 2, 'Arrangement ouvre « Finaliser » ; les numéros suivent (Mix + 1, Intégration + 2)');
  const ref = await page.evaluate(() => [SS.band.stepNum('fx'), SS.band.stepNum('mix'), SS.band.stepNum('pick'), SS.band.stepRef(SS.band.stepNum('fx')), SS.band.stepRef(SS.band.stepNum('mix'))]);
  ok(ref[1] === ref[0] + 1 && ref[2] === ref[0] + 2 && ref[3] === 'fx' && ref[4] === 'mix', 'stepNum / stepRef : fx, mix, pick se suivent');
  await go(page, 'fx');
  ok((await page.locator('#bwStepHead h1').textContent()).startsWith(String(ref[0])) && (await page.locator('#bwStepHead h1').textContent()).includes('Effets et transitions'), 'tête d’étape : numéro et nom');
  await page.keyboard.press('Alt+ArrowRight');
  await page.waitForTimeout(300);
  ok((await wiz(page, 'W.step')) === ref[1], 'Alt + → : de l’étape Effets à Mix');
  await page.keyboard.press('Alt+ArrowLeft');
  await page.waitForTimeout(300);
  ok((await wiz(page, 'W.step')) === ref[0], 'Alt + ← : de Mix à l’étape Effets');

  // ---------- 2. La frise, la jonction choisie, ce que fait déjà le plan
  const sceneNames = await page.$$eval('.fx-block b', (l) => l.map((x) => x.textContent));
  ok(sceneNames.join(',') === 'Intro,Groove,Montée,Drop,Break,Montée 2,Drop final,Outro' && (await page.locator('.fx-tm button').count()) === sceneNames.length - 1, `frise : ${sceneNames.length} blocs dans l’ordre de l’arrangement, une pastille entre deux blocs`);
  ok((await page.locator('.fx-tm button.sel').getAttribute('data-j')) === '2' && (await page.textContent('#fxTrans h3')).includes('Transition avant « Drop »'), 'jonction choisie par défaut : avant le premier drop');
  ok((await page.locator('.fx-tm button').nth(2).textContent()) === '4' && (await page.locator('.fx-tm button').nth(0).textContent()) === '+', 'la pastille compte les effets actifs (4 avant le drop, « + » quand il n’y en a pas)');
  ok((await on(page, 'riser')) === 'true' && (await on(page, 'hp')) === 'true' && (await on(page, 'gap')) === 'true' && (await on(page, 'impact')) === 'true' && (await on(page, 'rev')) === 'false' && (await on(page, 'down')) === 'false', 'état initial : ce que fait le plan (montée, passe-haut, coupure, impact), ni cymbale ni descente');
  // longueurs lues dans le plan : la montée dure toute la scène d'avant (8 ou 16 mesures), pas 8 en dur
  const B = await wiz(page, 'W.res.scenes.find((s) => s.name === "Montée").bars');
  const B2 = await wiz(page, 'W.res.scenes.find((s) => s.name === "Montée 2").bars');
  const N = B * 16; // pas de la montée avant le premier drop
  ok(B >= 8 && B2 >= 4, `plan : montées de ${B} et ${B2} mesures`);
  ok((await page.locator('#fxlen-riser [aria-pressed="true"]').getAttribute('data-v')) === String(Math.min(B, 16)) && (await page.locator('#fxgap [aria-pressed="true"]').getAttribute('data-v')) === '4', `montée de ${B} mesures (toute la scène), coupure d’un temps`);
  ok((await page.locator(`#fxlen-riser [data-v="${B}"]`).count()) === 0 || !(await page.locator(`#fxlen-riser [data-v="${B}"]`).isDisabled()), 'la longueur du plan est proposée');
  await page.click('.fx-tm button >> nth=5'); // la montée de 8 mesures : 16 refusées
  await page.waitForTimeout(200);
  ok(B2 < 16 && (await page.locator('#fxlen-riser [data-v="16"]').isDisabled()), `la montée est plafonnée à la longueur de la scène d’avant (16 mesures refusées sur ${B2})`);
  await page.click('.fx-tm button >> nth=2');
  await page.waitForTimeout(200);
  ok((await page.textContent('#bandWizSteps li.cur .bw-ss')).includes('transition'), 'le résumé du stepper compte les transitions');
  ok((await wiz(page, 'JSON.stringify(W.fx)')) === '{}', 'visiter l’étape ne retouche rien');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'fx-overview.png') });

  // ---------- 3. Montée de bruit : sa longueur change la piste Effets
  const riser0 = await dataOf(page, 'Montée', 'fx');
  ok(riser0.events.length === 1 && riser0.events[0].step === 0 && riser0.events[0].len === N - 4, 'montée du plan : une note tenue sur toute la scène (jusqu’à la coupure)');
  await page.click('#fxlen-riser [data-v="4"]');
  await page.waitForTimeout(300);
  const riser4 = await dataOf(page, 'Montée', 'fx');
  ok(riser4.events.length === 1 && riser4.events[0].step === N - 64 && riser4.events[0].len === 60, 'montée de 4 mesures : la note ne couvre que les 4 dernières mesures');
  ok(Object.keys(riser4.auto.filter).every((s) => +s >= N - 65) && riser4.auto.volume[N - 64] === 0.15, 'les courbes (filtre, volume) suivent la montée');
  ok((await wiz(page, 'W.fx.junctions["build>drop"].riser.len')) === 4, 'S.wiz.fx.junctions : réglage rangé par couple de scènes');
  await page.selectOption('#fxfilter-riser', 'hp');
  await page.waitForTimeout(250);
  const hpR = await dataOf(page, 'Montée', 'fx');
  ok(hpR.auto.filter[N - 64] === 0.85, 'filtre « Passe-haut qui s’ouvre » : la courbe part du passe-haut fermé');
  await page.selectOption('#fxfilter-riser', 'none');
  await page.waitForTimeout(250);
  ok(!(await dataOf(page, 'Montée', 'fx')).auto.filter, 'sans filtre : pas de courbe de filtre');
  await page.click('#fxon-riser');
  await page.waitForTimeout(250);
  ok((await dataOf(page, 'Montée', 'fx')).events.length === 0, 'montée coupée : plus de note sur la piste Effets');
  await page.click('#fxon-riser');
  await page.click('#fxfilter-riser', { trial: true }).catch(() => {});
  await page.selectOption('#fxfilter-riser', 'lp');
  await page.click(`#fxlen-riser [data-v="${B}"]`);
  await page.waitForTimeout(250);
  ok(JSON.stringify((await dataOf(page, 'Montée', 'fx')).events) === JSON.stringify(riser0.events), 'revenir au réglage du plan redonne la montée d’origine');

  // ---------- 4. Coupure : une mesure de silence avant le drop
  await page.click('#fxgap [data-v="16"]');
  await page.waitForTimeout(300);
  const quiet = await page.evaluate((n) => {
    const sc = SS.band._state.wiz.res.scenes.find((x) => x.name === 'Montée');
    return Object.entries(sc.data).map(([id, d]) => [id, d.steps ? d.steps.slice(n - 16).some((v) => v > 0) : d.events.some((e) => e.step >= n - 16)]);
  }, N);
  ok(quiet.length > 4 && quiet.every(([, loud]) => !loud), 'coupure d’une mesure : plus rien ne joue sur la dernière mesure de la montée (toutes les pistes)');
  const before = await dataOf(page, 'Montée', 'pad');
  await page.click('#fxgap [data-v="0"]');
  await page.waitForTimeout(250);
  const none = await dataOf(page, 'Montée', 'pad');
  ok(none.events.some((e) => e.step === N - 16 && e.len === 16) && !before.events.some((e) => e.step >= N - 16) && (await on(page, 'gap')) === 'false', '« Aucune » : la dernière mesure joue (la nappe tient jusqu’au drop), l’interrupteur est éteint');
  await page.click('#fxgap [data-v="4"]');
  await page.waitForTimeout(250);

  // ---------- 5. Cymbale inversée, impact, descente, passe-haut
  ok((await dataOf(page, 'Drop', 'fx')).events.length === 1, 'le drop du plan : un impact sur la piste Effets');
  await page.click('#fxon-rev');
  await page.waitForTimeout(250);
  const rev = (await dataOf(page, 'Montée', 'fx')).events.find((e) => e.step === N - 16);
  ok(!!rev && rev.len === 16 && (await dataOf(page, 'Montée', 'fx')).auto.volume[N - 1] > 0.5, 'cymbale inversée (1 mesure) : une montée de bruit qui finit sur le premier temps du drop, hors de la coupure');
  await page.click('#fxlen-rev [data-v="4"]');
  await page.waitForTimeout(250);
  ok((await dataOf(page, 'Montée', 'fx')).events.some((e) => e.step === N - 4 && e.len === 4), 'cymbale inversée d’un temps : 4 pas avant le drop');
  await page.click('#fxon-down');
  await page.waitForTimeout(250);
  const drop2 = await dataOf(page, 'Drop', 'fx');
  ok(drop2.events.length === 2 && drop2.events.some((e) => e.step === 4 && e.len === 32), 'descente de 2 mesures : une note qui retombe après l’impact');
  await page.click('#fxlen-down [data-v="4"]');
  await page.waitForTimeout(250);
  ok((await dataOf(page, 'Drop', 'fx')).events.some((e) => e.step === 4 && e.len === 64), 'descente de 4 mesures');
  await page.selectOption('#fxtype-impact', 'crash');
  await page.waitForTimeout(250);
  ok((await dataOf(page, 'Drop', 'fx')).events.every((e) => e.step !== 0) && (await dataOf(page, 'Drop', 'drums:cr')).steps[0] > 0, 'type « Crash seul » : plus d’impact grave, le crash de la batterie reste');
  await page.selectOption('#fxtype-impact', 'impact');
  await page.waitForTimeout(250);
  ok((await dataOf(page, 'Drop', 'fx')).events.some((e) => e.step === 0) && (await dataOf(page, 'Drop', 'drums:cr')).steps[0] === 0, 'type « Impact grave » : l’impact seul, le crash est retiré');
  await page.selectOption('#fxtype-impact', 'both');
  await page.waitForTimeout(250);
  const padBase = await dataOf(page, 'Montée', 'pad');
  ok(Math.abs(padBase.auto.filter[N - 1] - 0.55) < 1e-6, 'passe-haut global du plan : 0,55 sur la nappe (777 Hz)');
  await page.evaluate(() => {
    const e = document.querySelector('#fxhp-freq');
    e.value = 2000;
    e.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  const padHp = await dataOf(page, 'Montée', 'pad');
  ok(padHp.auto.filter[N - 1] > 0.65 && padHp.auto.filter[N - 1] < 0.75, 'passe-haut à 2000 Hz : l’ouverture finale de la nappe suit le réglage (0,69)');
  await page.click('#fxon-hp');
  await page.waitForTimeout(250);
  ok(!(await dataOf(page, 'Montée', 'pad')).auto || !(await dataOf(page, 'Montée', 'pad')).auto.filter, 'passe-haut éteint : plus de courbe de filtre sur la nappe');
  ok((await dataOf(page, 'Montée', 'pad')).events.length > 0, '… mais la nappe joue toujours');
  if (SHOTS) {
    await page.click('#fxon-hp');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SHOTS, 'fx-all-on.png') });
  }

  // ---------- 5 bis. Procédés d'écriture T01–T05 (formation, chap. 23) : éteints par défaut, ils réécrivent les parties
  // (jonction Groove > Montée : le groove a sa grosse caisse et sa basse jusqu'au bout ; remise « Comme le plan » ensuite)
  await page.click('.fx-tm button >> nth=1');
  await page.waitForTimeout(250);
  const NG = (await wiz(page, 'W.res.scenes.find((x) => x.name === "Groove").bars')) * 16;
  ok((await page.locator('#fxWriteHead').count()) === 1 && (await page.locator('#fxrow-retrait, #fxrow-frag, #fxrow-pedal, #fxrow-widen, #fxrow-susp').count()) === 5, 'procédés d’écriture : titre et cinq lignes (T01–T05), la coupure porte T06');
  ok((await on(page, 'retrait')) === 'false' && (await on(page, 'susp')) === 'false', 'procédés éteints dans le plan');
  const pastille = async () => +(await page.locator('.fx-tm button.sel').textContent()) || 0;
  const p0 = await pastille();
  const bdBefore = await dataOf(page, 'Groove', ':bd');
  await page.click('#fxon-retrait');
  await page.waitForTimeout(250);
  const bdAfter = await dataOf(page, 'Groove', ':bd');
  ok(bdAfter.steps.slice(NG - 16).every((v) => v === 0) && bdBefore.steps.slice(NG - 16).some((v) => v > 0) && JSON.stringify(bdAfter.steps.slice(0, NG - 16)) === JSON.stringify(bdBefore.steps.slice(0, NG - 16)), 'T01 retrait : la grosse caisse se tait sur la dernière mesure du groove, seulement là');
  ok((await pastille()) === p0 + 1, 'la pastille compte le procédé');
  await page.click('#fxon-pedal');
  await page.waitForTimeout(250);
  const ped = (await dataOf(page, 'Groove', 'bass')).events.filter((e) => e.step >= NG - 32);
  ok(ped.length === 2 && ped.every((e) => e.len === 16 && e.notes[0] === ped[0].notes[0]), 'T03 pédale : une note tenue par mesure sur les 2 dernières mesures');
  await page.click('#fxon-susp');
  await page.waitForTimeout(250);
  ok((await page.locator('.fx-pl[data-k="susp"]').count()) === 1, 'l’aperçu montre la suspension après la jonction');
  if (SHOTS) await page.locator('#fxTrans').screenshot({ path: path.join(SHOTS, 'fx-procedes.png') });
  await page.click('#fxReset');
  await page.waitForTimeout(250);
  ok((await pastille()) === p0 && JSON.stringify((await dataOf(page, 'Groove', ':bd')).steps) === JSON.stringify(bdBefore.steps), '« Comme le plan » : la batterie revient');
  await page.click('.fx-tm button >> nth=2');
  await page.waitForTimeout(250);

  // ---------- 6. Copier vers les autres drops
  await page.click('#fxlen-riser [data-v="4"]');
  await page.waitForTimeout(200);
  await page.click('#fxCopy');
  await page.waitForTimeout(300);
  const J = await wiz(page, 'JSON.parse(JSON.stringify(W.fx.junctions))');
  ok(!!J['build2>drop2'] && J['build2>drop2'].riser.len === 4 && J['build2>drop2'].rev.on === true && J['build2>drop2'].down.len === 4, 'copie : la jonction vers le second drop reçoit les mêmes réglages');
  ok(!J['groove>build'] && !J['intro>groove'], 'les jonctions qui ne mènent pas à un drop ne bougent pas');
  ok((await page.textContent('#fxCopied')).includes('Copié vers 1'), 'confirmation « Copié vers 1 jonction »');
  await page.click('.fx-tm button >> nth=5');
  await page.waitForTimeout(250);
  ok((await page.textContent('#fxTrans h3')).includes('Drop final') && (await on(page, 'rev')) === 'true' && (await page.locator('#fxlen-down [aria-pressed="true"]').getAttribute('data-v')) === '4', 'autre jonction : l’aperçu et les réglages suivent');

  // ---------- 7. Écoute de la transition
  await page.click('#fxJListen');
  await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 8000 });
  const lis = await page.evaluate(() => ({ n: SS.band._listen().scenes.length, bars: SS.band._listen().scenes.map((s) => s.bars), loop: SS.band._listen().songLoop }));
  ok(lis.n === 2 && lis.bars.join() === '4,4' && lis.loop === true, 'écoute : 4 dernières mesures de la scène d’avant, 4 premières de la suivante, en boucle');
  ok((await page.textContent('#fxJListen')).includes('Arrêter'), 'le bouton devient « Arrêter »');
  await page.click('#fxJListen');
  await page.waitForTimeout(300);
  ok(!(await page.evaluate(() => SS.audio.isPlaying())), 'second clic : arrêt');
  await page.click('#fxJListen');
  await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 8000 });
  await page.click('.fx-tm button >> nth=3'); // un réglage ailleurs : l'écoute reprend avec les nouveaux réglages
  await page.click('#fxon-gap');
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => SS.audio.isPlaying()), 'un réglage changé pendant l’écoute : elle reprend');
  await go(page, 'mix');
  ok(!(await page.evaluate(() => SS.audio.isPlaying())), 'quitter l’étape arrête l’écoute de la transition');

  // ---------- 8. Percussions : message, ajout du musicien, matrice
  await go(page, 'fx');
  ok((await page.locator('#fxMissPerc').count()) === 1 && (await page.locator('#fxAddPerc').isVisible()) && (await page.locator('.fx-cb').count()) === 0, 'sans Percussionniste : un message et un bouton, pas de matrice');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'fx-perc-missing.png') });
  const n0 = await wiz(page, 'S.group.list.length');
  const f0 = await num(page, 'fx');
  await page.click('#fxAddPerc');
  await page.waitForTimeout(500);
  ok((await wiz(page, 'S.group.list.length')) === n0 + 1 && (await page.evaluate(() => SS.band.insSteps().some((t) => t.role === 'perc'))), 'le bouton ajoute le Percussionniste au groupe (une étape instrument de plus)');
  ok((await num(page, 'fx')) === f0 + 1 && (await wiz(page, 'W.step')) === f0 + 1 && (await page.locator('#fxMissPerc').count()) === 0, 'les numéros suivent, on reste sur l’étape Effets');
  ok((await page.locator('.fx-ptab tbody tr').count()) === 3 && (await page.locator('.fx-ptab th').count()) === (await wiz(page, 'W.res.scenes.length')) + 1, 'matrice : trois boucles (shaker, conga, tom) × une colonne par scène (pas par bloc)');
  // le plan joue déjà le shaker (et la conga) : l'affichage le montre
  const shOn = await page.$$eval('.fx-cb[data-loop="sh"]', (l) => l.map((x) => x.getAttribute('aria-pressed') === 'true'));
  ok(shOn.join() === 'true,true,true,true,false,true,true,true', `le shaker du plan : joué partout (intro DJ en « light » comprise) sauf dans le break (${shOn.join(' ')})`);
  // tout éteindre, puis allumer le shaker dans Groove et Drop seulement
  for (const loop of ['sh', 'cg', 'tom'])
    for (const sec of await page.$$eval(`.fx-cb[data-loop="${loop}"]`, (l) => l.map((x) => x.dataset.sec)))
      if ((await page.getAttribute(`.fx-cb[data-loop="${loop}"][data-sec="${sec}"]`, 'aria-pressed')) === 'true') await page.click(`.fx-cb[data-loop="${loop}"][data-sec="${sec}"]`);
  await page.click('.fx-cb[data-loop="sh"][data-sec="groove"]');
  await page.click('.fx-cb[data-loop="sh"][data-sec="drop"]');
  await page.waitForTimeout(400);
  const secs = await page.evaluate(() => SS.band._state.wiz.res.scenes.map((s) => s.name));
  const shaker = await page.evaluate(() => {
    const out = {};
    SS.band._state.wiz.res.scenes.forEach((sc) => {
      const id = Object.keys(sc.data).find((k) => k.startsWith('perc:') && k.endsWith(':sh'));
      out[sc.name] = sc.data[id].steps.filter((v) => v > 0).length;
    });
    return out;
  });
  ok(secs.every((n) => (n === 'Groove' || n === 'Drop' ? shaker[n] > 0 : shaker[n] === 0)), `le shaker ne joue que dans Groove et Drop (${JSON.stringify(shaker)})`);
  const otherPerc = await page.evaluate(() => SS.band._state.wiz.res.scenes.every((sc) => Object.keys(sc.data).filter((k) => k.startsWith('perc:') && !k.endsWith(':sh')).every((k) => !sc.data[k].steps.some((v) => v > 0))));
  ok(otherPerc, 'les autres percussions (conga, tom) sont coupées partout');
  ok((await wiz(page, 'JSON.stringify(W.fx.perc.loops.groove)')) === '{"sh":true}' || (await wiz(page, 'W.fx.perc.loops.groove.sh')) === true, 'S.wiz.fx.perc.loops : réglages rangés par scène');
  ok((await page.locator('.fx-cb[data-loop="tom"]').first().isDisabled()) && (await page.locator('.fx-addp[data-loop="tom"]').count()) === 1, 'le kit du Percussionniste n’a pas la pièce du tom : la ligne est grisée, « + ajouter la pièce »');
  await page.click('.fx-addp[data-loop="tom"]');
  await page.waitForTimeout(400);
  ok(!(await page.locator('.fx-cb[data-loop="tom"]').first().isDisabled()), 'la pièce ajoutée : la ligne du tom devient utilisable');
  // la pièce « misc » jouait déjà (comme un shaker) dans le plan : éteindre puis rallumer donne la boucle de tom du style
  if ((await page.getAttribute('.fx-cb[data-loop="tom"][data-sec="drop"]', 'aria-pressed')) === 'true') await page.click('.fx-cb[data-loop="tom"][data-sec="drop"]');
  await page.click('.fx-cb[data-loop="tom"][data-sec="drop"]');
  await page.click('.fx-cb[data-loop="cg"][data-sec="drop"]');
  await page.waitForTimeout(300);
  const toms = await page.evaluate(() => {
    const sc = SS.band._state.wiz.res.scenes.find((x) => x.name === 'Drop');
    const id = Object.keys(sc.data).find((k) => k.endsWith(':misc'));
    return sc.data[id].steps.filter((v) => v > 0).length;
  });
  ok(toms > 0, 'le tom roulant grave s’allume dans le drop');
  const stepsOf = () => page.evaluate(() => JSON.stringify(SS.band._state.wiz.res.scenes.find((x) => x.name === 'Drop').data[Object.keys(SS.band._state.wiz.res.scenes.find((x) => x.name === 'Drop').data).find((k) => k.startsWith('perc:') && k.endsWith(':sh'))].steps));
  const techno = await stepsOf();
  await page.selectOption('#fxPercStyle', 'latin');
  await page.waitForTimeout(300);
  ok((await stepsOf()) !== techno, 'le style des percussions change la boucle');
  await page.click('#fxPercListen');
  await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 8000 });
  ok((await page.evaluate(() => SS.band._listen().scenes.length)) >= 5, '« Écouter » joue la scène avec les percussions');
  await page.click('#fxPercListen');
  await page.waitForTimeout(200);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'fx-perc.png') });
  // la chanson créée porte les percussions choisies
  await go(page, 'pick');
  await page.click('#bwCreate');
  await page.waitForTimeout(1000);
  const pr = await P(page);
  const track = (k) => pr.tracks.find((t) => t.band && t.band.key === k);
  const inScene = (n, k) => pr.scenes.find((s) => s.name === n).data[track(k).id].steps.some((v) => v > 0);
  ok(['Intro', 'Montée', 'Break', 'Montée 2', 'Drop final', 'Outro'].every((n) => !inScene(n, 'perc:sh')) && inScene('Groove', 'perc:sh') && inScene('Drop', 'perc:sh') && inScene('Drop', 'perc:misc') && !inScene('Groove', 'perc:perc'), 'la chanson créée : percussions seulement dans les scènes choisies');
  const fxT = track('fx:fx') || track('fx');
  const dropFx = pr.scenes.find((s) => s.name === 'Drop').data[fxT.id].events;
  const buildFx = pr.scenes.find((s) => s.name === 'Montée').data[fxT.id].events;
  ok(dropFx.some((e) => e.step === 4 && e.len === 64) && buildFx.some((e) => e.step === N - 16 || e.step === N - 4), 'la chanson créée : descente, cymbale inversée et montée réglées');
  await page.close();

  // ---------- 9. Sans retouche, la chanson créée est celle d'avant
  async function created(visit) {
    const pg = await open('techno');
    if (visit) {
      await go(pg, 'fx');
      for (let i = 0; i < 4; i++) {
        await pg.click(`.fx-tm button >> nth=${i}`);
        await pg.waitForTimeout(120);
      }
      await pg.click('#fxJListen');
      await pg.waitForTimeout(600);
      await pg.click('#fxJListen');
      await go(pg, 'mix');
    }
    await go(pg, 'pick');
    await pg.click('#bwCreate');
    await pg.waitForTimeout(1000);
    const p = await P(pg);
    await pg.close();
    return JSON.stringify(p.scenes.map((sc) => p.tracks.map((t) => [t.band && t.band.key, JSON.stringify(sc.data[t.id])])));
  }
  const plain = await created(false);
  const visited = await created(true);
  ok(plain.length > 1000 && plain === visited, 'visiter l’étape sans rien changer : la chanson créée est identique, note pour note');

  // ---------- 10. Retouche explicite égale au plan : même chanson (pistes Effets recalculées)
  const same = await (async () => {
    const pg = await open('techno');
    await go(pg, 'fx');
    await pg.click(`#fxlen-riser [data-v="${Math.min(B, 16)}"]`); // réglage explicite, égal à celui du plan
    await pg.waitForTimeout(300);
    const a = await pg.evaluate(() => JSON.stringify(SS.band._state.wiz.res.scenes.map((s) => Object.values(s.data))));
    await pg.click('#fxReset');
    await pg.waitForTimeout(300);
    const c = await pg.evaluate(() => JSON.stringify(SS.band._state.wiz.res.scenes.map((s) => Object.values(s.data))));
    await pg.close();
    return a === c;
  })();
  ok(same, 'un réglage explicite égal au plan donne les mêmes notes et courbes ; « Comme le plan » efface les retouches');

  // ---------- 11. Un groupe sans Effets : message, ajout, puis effets sur la piste Effets
  const sw = await open('synthwave');
  await go(sw, 'fx');
  ok((await sw.locator('#fxMissFx').count()) === 1 && (await sw.locator('#fxon-riser').count()) === 0 && (await sw.locator('#fxon-hp').count()) === 1 && (await sw.locator('#fxon-gap').count()) === 1, 'sans Effets : un message à la place des montées, impacts et descentes ; passe-haut et coupure restent');
  if (SHOTS) await sw.screenshot({ path: path.join(SHOTS, 'fx-missing.png') });
  const jBefore = await wiz(sw, 'S.group.list.length');
  await sw.click('#fxAddFx');
  await sw.waitForTimeout(500);
  ok((await wiz(sw, 'S.group.list.length')) === jBefore + 1 && (await sw.locator('#fxMissFx').count()) === 0 && (await sw.locator('#fxon-riser').count()) === 1, 'le bouton ajoute l’Effets au groupe : les réglages apparaissent');
  ok((await sw.locator('.fx-cb').count()) === 0 && (await sw.locator('#fxMissPerc').count()) === 1, 'le Percussionniste manque toujours : son message reste');
  await sw.click('#fxon-riser');
  await sw.waitForTimeout(300);
  const fxScene = await sw.evaluate(() => {
    const j = SS.band._state.wiz.fx.junctions;
    const key = Object.keys(j)[0];
    const sec = key.split('>')[0];
    const sc = SS.band._state.wiz.res.scenes.find((x) => x.sec === sec);
    const id = Object.keys(sc.data).find((k) => k.startsWith('fx'));
    return { key, ev: sc.data[id].events, bars: sc.bars };
  });
  ok(fxScene.ev.length === 1 && fxScene.ev[0].step + fxScene.ev[0].len <= fxScene.bars * 16 && fxScene.ev[0].len >= 16, `montée allumée sur ${fxScene.key} : la piste Effets joue`);
  await sw.close();

  // ---------- 12. Brouillon : l'état revient, et un brouillon de l'ancienne numérotation retrouve sa place
  const dr = await open('techno');
  await go(dr, 'fx');
  await dr.click('#fxlen-riser [data-v="4"]');
  await dr.click('#fxon-down');
  await dr.click('.fx-tm button >> nth=5');
  await dr.waitForTimeout(300);
  const state0 = await wiz(dr, 'JSON.stringify(W.fx)');
  const snap = await dr.evaluate(() => JSON.parse(JSON.stringify(SS.band.wizSnapshot())));
  ok(snap.v === 4 && JSON.stringify(snap.state.w.fx) === state0 && snap.state.w.step === (await num(dr, 'fx')), 'brouillon (v4) : les réglages et l’étape sont rangés');
  await dr.evaluate((s) => SS.band.wizRestore(s), snap);
  await dr.waitForTimeout(500);
  ok((await wiz(dr, 'JSON.stringify(W.fx)')) === state0 && (await wiz(dr, 'W.step')) === (await num(dr, 'fx')) && (await dr.locator('#fxTrans').count()) === 1, 'rouvrir le brouillon : mêmes réglages, même étape Effets');
  // ancienne numérotation (v2) : Mix était l'étape arr (fx − 1), Intégration la suivante
  const fxN = (await num(dr, 'fx')) - 1;
  const old = JSON.parse(JSON.stringify(snap));
  old.v = 2;
  delete old.state.w.fx;
  old.state.w.step = fxN; // avant : c'était Mix
  old.state.w.seen = [1, 2, 3, fxN];
  await dr.evaluate((s) => SS.band.wizRestore(s), old);
  await dr.waitForTimeout(500);
  ok((await dr.evaluate(() => SS.band.stepRef(SS.band._state.wiz.step))) === 'mix' && (await wiz(dr, 'W.seen.has(SS.band.stepNum("mix"))')) && !(await wiz(dr, 'W.seen.has(SS.band.stepNum("fx"))')), 'brouillon v2 : l’ancienne étape Mix reste Mix, celle d’Intégration reste Intégration');
  old.state.w.step = fxN + 1;
  await dr.evaluate((s) => SS.band.wizRestore(s), old);
  await dr.waitForTimeout(400);
  ok((await dr.evaluate(() => SS.band.stepRef(SS.band._state.wiz.step))) === 'pick', 'brouillon v2 sur Intégration : on retrouve Intégration');
  old.state.w.step = fxN - 1; // dernier instrument : inchangé
  await dr.evaluate((s) => SS.band.wizRestore(s), old);
  await dr.waitForTimeout(400);
  ok((await wiz(dr, 'W.step')) === fxN - 1 && (await dr.evaluate(() => SS.band.stepRef(SS.band._state.wiz.step).inst)) !== undefined, 'brouillon v2 sur une étape instrument : inchangée');
  // le vrai cycle : fermer, reprendre
  await go(dr, 'fx');
  await dr.waitForTimeout(1500);
  await dr.click('#bandClose');
  await dr.waitForTimeout(500);
  await dr.evaluate(() => SS.band.resume());
  await dr.waitForTimeout(700);
  ok((await dr.evaluate(() => SS.band.stepRef(SS.band._state.wiz.step))) === 'fx', 'fermer puis reprendre : retour à l’étape Effets');
  await dr.close();

  // ---------- 13. Téléphone : 390 px
  const mob = await open('techno', 0, { width: 390, height: 844 });
  await go(mob, 'fx');
  await mob.waitForTimeout(300);
  const over = await mob.evaluate(() => {
    const f = document.querySelector('.fx-frieze');
    return { fz: f.scrollWidth > f.clientWidth, doc: document.documentElement.scrollWidth <= window.innerWidth + 1, card: document.querySelector('#fxTrans').getBoundingClientRect().right <= window.innerWidth + 1 };
  });
  ok(over.fz && over.doc && over.card, 'téléphone 390 px : la frise défile, rien ne dépasse la page');
  if (SHOTS) await mob.screenshot({ path: path.join(SHOTS, 'fx-mobile.png') });
  await mob.close();

  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
