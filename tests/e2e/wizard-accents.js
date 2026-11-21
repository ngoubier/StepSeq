/*
 * Test de bout en bout des accents de la basse dans l'assistant « Nouvelle chanson » (js/band.js, js/bandsong.js) :
 *   node tests/e2e/wizard-accents.js [dossier-captures]
 * Panneau « Accents » masqué par défaut, ouvert par le menu du bouton Automation (basse seulement), fermer garde les accents.
 * Clic sur une note (accent + chevron), ligne « Accents » synchronisée, motif « Temps forts », Force, filtre, résumé du stepper et pastille
 * de scène, accents propres à chaque scène, changement de mode de jeu, copie, brouillon restauré, chanson créée (vélocité plus forte).
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
const SHOTS = process.argv[2] || process.env.SHOTS;
const ok = (c, m) => {
  console.log((c ? 'OK   ' : 'FAIL ') + m);
  if (!c) process.exitCode = 1;
};

(async () => {
  await new Promise((r) => server.listen(0, r));
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const demo = JSON.parse(fs.readFileSync(path.join(ROOT, 'demos', 'train-de-nuit.stepseq.json'), 'utf8'));
  await page.addInitScript((p) => {
    if (!sessionStorage.seed) {
      localStorage.setItem('stepseq.autosave', JSON.stringify(p));
      sessionStorage.seed = '1';
    }
  }, demo);
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1200);
  const P = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));
  const next = async (n = 1) => {
    for (let i = 0; i < n; i++) await page.dispatchEvent('#bwNext', 'click');
    await page.waitForTimeout(250);
  };
  const scene = async (name) => {
    await page.click(`.bh-scene:has(.bh-sname b:text-is("${name}"))`);
    await page.waitForTimeout(150);
  };
  /** Accents de la basse pour une scène (réglage de l'instrument). */
  const acc = (sec) =>
    page.evaluate((s) => {
      const T = SS.band.insSteps().find((t) => t.role === 'bass');
      const pp = SS.band._state.wiz.parts[s];
      return (pp && pp.inst && pp.inst[T.key] && pp.inst[T.key].accents) || null;
    }, sec);
  /** Notes de basse de la scène dans l'aperçu. */
  const notes = (name) =>
    page.evaluate((n) => {
      const sc = SS.band._state.wiz.res.scenes.find((x) => x.name === n);
      const id = Object.keys(sc.data).find((k) => /:bass/.test(k));
      return sc.data[id].events.map((e) => ({ step: e.step, vel: e.vel, acc: e.acc, accAmt: e.accAmt }));
    }, name);

  /** Ouvre le panneau « Accents » de la scène par le menu du bouton Automation (puis ferme le menu). */
  const openAcc = async () => {
    if (await page.locator('#bwAccPanel').count()) return;
    await page.click('#bwAutoBtn');
    await page.click('#bwauAcc');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  };

  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=0');
  await next(3);
  await page.click('.bw-sc-dup[aria-label*="Couplet"]'); // « Couplet 2 » : une copie, du même type
  await next(2);
  await page.click('#bandWizSteps li[data-kind="bass"] button');
  await page.waitForTimeout(300);
  await scene('Couplet');
  await page.click('#bwMotif .mot-chip[data-g="all"]');
  await page.click('#bwMotif .mot-card[data-id="8"]'); // croches : une note tous les deux pas
  const base = await notes('Couplet');
  // par défaut : ni ligne ni carte « Accents » ; l'entrée du menu les ouvre
  ok((await page.locator('#bwAccPanel').count()) === 0 && (await page.locator('#bwAcc').count()) === 0 && (await page.locator('.bw-acell').count()) === 0, 'panneau Accents masqué par défaut (ni ligne, ni carte)');
  ok((await page.locator('#bwRoll .bw-rnb').count()) === base.length, 'les notes restent cliquables, panneau masqué');
  await page.click('#bwAutoBtn');
  ok((await page.locator('.bwau-menu .bwau-msep').textContent()) === 'Accents' && (await page.getAttribute('#bwauAcc', 'aria-checked')) === 'false' && /^Accents/.test(await page.textContent('#bwauAcc')), 'menu Automation : section « Accents » et entrée non cochée');
  await page.click('#bwauAcc');
  ok((await page.locator('#bwAccPanel').count()) === 1 && (await page.getAttribute('#bwauAcc', 'aria-checked')) === 'true', 'l’entrée ouvre le panneau, entrée cochée');
  await page.keyboard.press('Escape');
  await page.click('#bwAccFold');
  ok((await page.locator('#bwAccPanel .bw-acell').count()) === 0 && (await page.getAttribute('#bwAccFold', 'aria-expanded')) === 'false', 'chevron : panneau replié sur sa tête');
  await page.click('#bwAccFold');
  ok((await page.locator('#bwAccPanel .bw-acell').count()) === base.length, 'chevron : panneau rouvert');
  ok(base.length > 8 && base.every((e) => e.acc === undefined), `couplet en croches, sans accent (${base.length} notes)`);
  ok((await page.locator('#bwRoll .bw-rnb').count()) === base.length && (await page.locator('#bwAccPanel .bw-acell').count()) === base.length, 'une note cliquable et un point d’accent par note');
  ok(!(await acc('verse')) && (await page.locator('#bwAcc').count()) === 1 && (await page.locator('.bwa-pat').count()) === 7, 'carte « Accents » : 7 motifs prêts, rien d’accentué');

  // clic sur une note (panneau fermé) : l'accent est posé, le panneau reste fermé ; fermer ne perd rien
  await page.click('#bwAccClose');
  await page.click('#bwRoll .bw-rnb[data-s="0"]');
  ok((await page.locator('#bwAccPanel').count()) === 0 && (await acc('verse')) && (await page.locator('#bwRoll .bw-rnb.ac').count()) > 1, 'panneau fermé : clic sur une note accentue, notes vives et chevron, pas de panneau');
  await page.click('#bwRoll .bw-rnb[data-s="0"]');
  ok(!(await acc('verse')), 'clic sur une note accentuée : retirée');
  await page.click('#bwRoll .bw-rnb[data-s="0"]');
  await openAcc();
  ok((await page.locator('#bwAccPanel .bw-acell.ac').count()) > 1 && /1 accent\b/.test(await page.textContent('.bh-scene.on .bwa-badge')), 'réouvert par le menu : accents gardés, pastille « 1 accent »');
  ok(/Accents · 1/.test(await (async () => { await page.click('#bwAutoBtn'); const t = await page.textContent('#bwauAcc'); await page.keyboard.press('Escape'); return t; })()), 'entrée du menu : « Accents · 1 »');
  await page.click('#bwRoll .bw-rnb[data-s="0"]');
  ok(!(await acc('verse')), 'accent retiré avant la suite');
  // clic sur une note : accent, chevron, ligne synchronisée
  await page.click('#bwRoll .bw-rnb[data-s="0"]');
  let a = await acc('verse');
  ok(a && JSON.stringify(a.steps) === '[0]' && a.repeat === 1 && a.force === 75, 'clic sur la première note : accent au pas 0 (répété à chaque mesure)');
  ok((await page.locator('#bwRoll .bw-rnb.ac').count()) > 1 && (await page.locator('#bwAccPanel .bw-acell.ac').count()) === (await page.locator('#bwRoll .bw-rnb.ac').count()), 'la note devient vive et la ligne « Accents » suit (une par mesure)');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('#bwRoll .bw-rnb.ac'), '::before').content !== 'none'), 'chevron « > » sur la note accentuée');
  let n1 = await notes('Couplet');
  ok(n1.filter((e) => e.step % 16 === 0).every((e, i) => e.vel > base.filter((x) => x.step % 16 === 0)[i].vel) && n1.filter((e) => e.step % 16 !== 0).every((e, i) => e.vel === base.filter((x) => x.step % 16 !== 0)[i].vel), 'seules les notes du pas 1 de chaque mesure sont plus fortes');
  ok(/1 sur \d+ notes|\d+ sur \d+ notes/.test(await page.textContent('#bwAccCount')) && /1 accent\b/.test(await page.textContent('.bh-scene.on .bwa-badge')), 'décompte sous la ligne et pastille « 1 accent » dans la colonne des scènes');
  // clic sur le point : retire
  await page.click('#bwAccPanel .bw-acell[data-s="0"]');
  ok(!(await acc('verse')) && (await page.locator('#bwRoll .bw-rnb.ac').count()) === 0, 'clic sur le point : accent retiré, le réglage disparaît');

  // motif « Temps forts »
  await page.click('.bwa-pat[data-id="strong"]');
  a = await acc('verse');
  ok(a && JSON.stringify(a.steps) === '[0,8]' && (await page.locator('.bwa-pat.on').getAttribute('data-id')) === 'strong', 'Temps forts : pas 0 et 8, motif repéré');
  ok(/Basse.* · Croches · 2 accents/.test((await page.textContent('#bandWizSteps li.cur')).replace(/\s+/g, ' ')) && /2 accents/.test(await page.textContent('.bh-scene.on .bwa-badge')), 'résumé du stepper « Basse … · Croches · 2 accents » et pastille « 2 accents »');
  // le motif se répète : repeat 2 ne change pas le jeu (le motif d'une mesure est recopié)
  await page.click('#bwAccRep [data-v="2"]');
  a = await acc('verse');
  ok(a.repeat === 2 && JSON.stringify(a.steps) === '[0,8,16,24]', 'chaque 2 mesures : le motif est recopié, même rendu');
  await page.click('#bwAccRep [data-v="1"]');
  ok((await acc('verse')).repeat === 1 && JSON.stringify((await acc('verse')).steps) === '[0,8]', 'retour à chaque mesure');

  // Force : flèches du potentiomètre
  const v75 = (await notes('Couplet')).find((e) => e.step === 0).vel;
  await page.focus('#bwAccForce');
  await page.keyboard.press('End');
  a = await acc('verse');
  const v100 = (await notes('Couplet')).find((e) => e.step === 0).vel;
  ok(a.force === 100 && v100 > v75 && /\+6 dB \/ vélocité 127/.test(await page.textContent('#bwAccForceText')), `Force 100 : légende « +6 dB / vélocité 127 », note plus forte (${v75} → ${v100})`);
  await page.focus('#bwAccForce');
  await page.keyboard.press('Home');
  ok((await acc('verse')).force === 0 && (await notes('Couplet')).find((e) => e.step === 0).vel < v75, 'Force 0 : plus d’effet sur la vélocité');
  await page.focus('#bwAccForce');
  for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowUp');
  ok((await acc('verse')).force === 75, 'Force remise à 75 aux flèches');

  // filtre
  ok((await page.locator('#bwAccBright').count()) === 0, 'Brillance cachée tant que le filtre est fermé');
  await page.click('#bwAccFilter');
  a = await acc('verse');
  ok(a.filter === true && (await page.locator('#bwAccBright').count()) === 1, '« Ouvre le filtre » : interrupteur allumé, potentiomètre Brillance');
  await page.focus('#bwAccBright');
  await page.keyboard.press('End');
  const nf = await notes('Couplet');
  ok((await acc('verse')).bright === 100 && nf.filter((e) => e.acc).length > 0 && nf.filter((e) => e.acc).every((e) => e.step % 16 % 8 === 0 && e.accAmt === 1) && nf.filter((e) => !e.acc).every((e) => e.accAmt === undefined), 'notes accentuées : accent du séquenceur (acc) et brillance 1');

  // changement de mode : on garde les accents qui tombent encore sur une note
  await page.click('#bwMotif .mot-chip[data-g="all"]');
  await page.click('#bwMotif .mot-card[data-id="offbeat"]'); // notes sur les contretemps : pas 2, 6, 10, 14
  ok(!(await acc('verse')) || (await acc('verse')).steps.length === 0, 'Contretemps : plus aucune note sur les pas 0 et 8, accents retirés');
  await page.click('#bwMotif .mot-chip[data-g="all"]');
  await page.click('#bwMotif .mot-card[data-id="8"]');
  await page.click('.bwa-pat[data-id="strong"]');
  await page.click('#bwMotif .mot-chip[data-g="all"]');
  await page.click('#bwMotif .mot-card[data-id="quarter"]'); // noires : pas 0 4 8 12
  ok(JSON.stringify((await acc('verse')).steps) === '[0,8]', 'Noires : les accents 0 et 8 tombent toujours sur des notes, gardés');
  await page.click('#bwMotif .mot-chip[data-g="all"]');
  await page.click('#bwMotif .mot-card[data-id="8"]');

  // chaque scène a ses accents
  await scene('Refrain');
  ok((await page.locator('#bwAccPanel').count()) === 0, 'Refrain : le panneau est masqué (affichage propre à chaque scène)');
  await openAcc();
  ok(!(await acc('chorus')) && (await page.locator('.bw-rnb.ac').count()) === 0 && !(await page.locator('.bh-scene:has(.bh-sname b:text-is("Refrain")) .bwa-badge').count()), 'Refrain : aucun accent (ceux du couplet ne passent pas)');
  await page.click('.bwa-pat[data-id="beat"]');
  ok(JSON.stringify((await acc('chorus')).steps) === '[0,4,8,12]' && JSON.stringify((await acc('verse')).steps) === '[0,8]', 'Refrain : Chaque temps, le couplet garde les siens');
  await scene('Couplet');
  await openAcc();
  ok((await page.locator('.bwa-pat.on').getAttribute('data-id')) === 'strong' && /2 accents/.test(await page.textContent('.bh-scene.on .bwa-badge')), 'retour au couplet : ses accents, sa pastille');

  // Aléatoire, Effacer
  await page.click('.bwa-pat[data-id="rand"]');
  ok((await page.locator('.bwa-pat.on').getAttribute('data-id')) === 'rand', 'Aléatoire léger : motif repéré');
  await page.click('.bwa-pat[data-id="strong"]');
  await page.click('#bwAccClear');
  ok(!(await acc('verse')) || (await acc('verse')).steps.length === 0, 'Effacer : plus d’accents');
  await page.click('.bwa-pat[data-id="strong"]');
  ok((await acc('verse')).filter === true && (await page.getAttribute('#bwAccFilter', 'aria-checked')) === 'true', 'Effacer garde Force et filtre : le filtre reste allumé');

  // copie vers les scènes du même type : le couplet copié reçoit les accents (et la force, le filtre)
  ok((await page.locator('.bh-scene').count()) === 6, 'six scènes (couplet dupliqué)');
  await page.click('#bwpSame');
  await page.waitForTimeout(200);
  const msg = await page.textContent('.bwp-msg');
  const all = await page.evaluate(() => SS.band._state.wiz.parts);
  const T = await page.evaluate(() => SS.band.insSteps().find((t) => t.role === 'bass').key);
  const other = Object.keys(all).find((k) => k !== 'verse' && k !== 'chorus' && all[k].inst && all[k].inst[T] && all[k].inst[T].accents);
  ok(/^Copié vers/.test(msg) && other && JSON.stringify(all[other].inst[T].accents) === JSON.stringify(all.verse.inst[T].accents) && all[other].inst[T].accents.filter === true, `copie : accents, force et filtre copiés vers ${msg.replace('Copié vers ', '')}`);
  ok(JSON.stringify(all.chorus.inst[T].accents.steps) === '[0,4,8,12]' && !all.chorus.inst[T].accents.filter, 'copie : le refrain n’est pas touché');

  // écoute : la scène joue en boucle avec les accents (elle a démarré au dernier réglage)
  await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 8000 });
  const heard = await page.evaluate(() => {
    const L = SS.band._listen();
    const sc = L.scenes.find((x) => x.name === 'Couplet');
    const t = L.tracks.find((x) => /bass/.test((x.band && x.band.key) || ''));
    return sc.data[t.id].events.filter((e) => e.acc).length;
  });
  ok(heard > 0, `l'écoute de la scène porte les notes accentuées (${heard})`);

  // pas de défilement horizontal de la page, à 390 px
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  const ov = await page.evaluate(() => {
    const d = document.querySelector('#bandDialog');
    return [document.documentElement.scrollWidth - document.documentElement.clientWidth, d.scrollWidth - d.clientWidth, document.querySelector('#bwParts').scrollWidth - document.querySelector('#bwParts').clientWidth];
  });
  ok(ov.every((x) => x <= 1), `390 px : pas de défilement horizontal (${ov})`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'accents-390.png') });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.waitForTimeout(300);

  // brouillon : les accents sont rangés et restaurés
  const before = await page.evaluate(() => JSON.stringify(SS.band._state.wiz.parts));
  const viewBefore = await page.evaluate(() => JSON.stringify(SS.band._state.wiz.accView || {}));
  const snap = await page.evaluate(() => SS.band.wizSnapshot());
  ok(JSON.stringify(snap.state.w.accView || {}) === viewBefore, `brouillon : l’état du panneau Accents est rangé (${viewBefore})`);
  ok(JSON.stringify(snap).includes('"accents"') && JSON.stringify(snap).includes('"steps":[0,8]'), 'brouillon : les accents sont dans l’instantané');
  await page.click('#bandClose');
  await page.waitForTimeout(500);
  const okRestore = await page.evaluate((s) => SS.band.wizRestore(s), snap);
  await page.waitForTimeout(600);
  ok(okRestore && (await page.evaluate(() => JSON.stringify(SS.band._state.wiz.parts))) === before, 'wizRestore : mêmes accents dans toutes les scènes');
  await page.click('#bandWizSteps li[data-kind="bass"] button');
  await page.waitForTimeout(300);
  ok((await page.evaluate(() => JSON.stringify(SS.band._state.wiz.accView || {}))) === viewBefore, 'wizRestore : même état du panneau Accents');
  const wasOpen = /"open"/.test(viewBefore);
  ok((await page.locator('.bw-rnb.ac').count()) > 0, 'l’onglet Basse retrouve les notes accentuées');
  // le panneau est tel qu'on l'avait laissé ; puis fermé, il reste fermé après restauration
  if (wasOpen) {
    ok((await page.locator('#bwAccPanel').count()) === 1, 'panneau Accents rouvert comme on l’avait laissé');
    await page.click('#bwAccClose');
    await page.waitForTimeout(300);
  }
  ok((await page.locator('#bwAccPanel').count()) === 0, 'panneau Accents fermé');
  const snap2 = await page.evaluate(() => SS.band.wizSnapshot());
  await page.click('#bandClose');
  await page.waitForTimeout(500);
  await page.evaluate((s) => SS.band.wizRestore(s), snap2);
  await page.waitForTimeout(600);
  await page.click('#bandWizSteps li[data-kind="bass"] button');
  await page.waitForTimeout(300);
  ok((await page.locator('#bwAccPanel').count()) === 0 && (await page.locator('.bw-rnb.ac').count()) > 0, 'fermé dans le brouillon : fermé après restauration, accents gardés');
  await openAcc();
  ok((await page.locator('.bwa-sw[aria-checked="true"]').count()) === 1, 'panneau rouvert : filtre allumé');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'accents-real.png') });

  // Créer la chanson : notes de basse accentuées, vélocité plus forte, filtre
  for (let i = 0; i < 10 && !(await page.isVisible('#bwCreate')); i++) await next();
  await page.click('#bwCreate');
  await page.waitForTimeout(1200);
  const p = await P();
  const bass = p.tracks.find((t) => t.band && t.band.key === 'bass');
  const verse = p.scenes.find((s) => s.name === 'Couplet');
  const ev = verse.data[bass.id].events;
  const hit = ev.filter((e) => e.step % 16 === 0 || e.step % 16 === 8);
  const rest = ev.filter((e) => e.step % 16 !== 0 && e.step % 16 !== 8);
  const avg = (l) => l.reduce((s, e) => s + e.vel, 0) / (l.length || 1);
  ok(hit.length > 0 && hit.every((e) => e.acc === true && e.accAmt > 0) && rest.every((e) => !e.acc), `projet : ${hit.length} notes de basse accentuées (acc), les autres non`);
  ok(avg(hit) > avg(rest), `projet : vélocité plus forte sur les accents (${avg(hit).toFixed(2)} > ${avg(rest).toFixed(2)})`);
  const chorus = p.scenes.find((s) => s.name === 'Refrain');
  ok(chorus.data[bass.id].events.filter((e) => e.step % 4 === 0).every((e) => e.vel >= 0.5) && !chorus.data[bass.id].events.some((e) => e.acc), 'projet : le refrain a ses accents de vélocité, sans filtre');
  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})().catch((e) => {
  console.error('FAIL plantage', e);
  process.exit(1);
});
