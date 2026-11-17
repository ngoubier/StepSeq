/*
 * Test de bout en bout de l'automation par scène dans l'assistant « Nouvelle chanson » (js/band.js, js/bandsong.js) :
 *   node tests/e2e/wizard-auto.js [dossier-captures]
 * Rien d'affiché par défaut ; menu « Automation » (clavier, Échap, clic extérieur) ; ajout de Cutoff ; forme Montée et réglages ;
 * glisser un point → « Dessinée » ; masquer / afficher ; supprimer ; pastille et résumé du stepper ; autre scène sans courbe ;
 * Vélocité ; copie ; autres types d'instrument ; brouillon restauré ; Créer la chanson (courbe `filter` de la bonne scène, vélocités).
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
  const kindTab = async (kind) => {
    await page.click(`#bandWizSteps li[data-kind="${kind}"] button`);
    await page.waitForTimeout(300);
  };
  /** Courbes de l'instrument donné (role) pour une section. */
  const auto = (role, sec) =>
    page.evaluate(([r, s]) => {
      const T = SS.band.insSteps().find((t) => t.role === r);
      const pp = SS.band._state.wiz.parts[s];
      return (pp && pp.inst && pp.inst[T.key] && pp.inst[T.key].auto) || null;
    }, [role, sec]);
  const bassNotes = (name) =>
    page.evaluate((n) => {
      const sc = SS.band._state.wiz.res.scenes.find((x) => x.name === n);
      const id = Object.keys(sc.data).find((k) => /:bass/.test(k));
      return sc.data[id].events.map((e) => ({ step: e.step, vel: e.vel }));
    }, name);
  const menuItem = (id) => page.locator(`.bwau-item[data-param="${id}"]`);

  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=0');
  await next(3);
  await page.click('.bw-sc-dup[aria-label*="Couplet"]'); // « Couplet 2 » : du même type
  await next(2);
  await kindTab('bass');
  await scene('Couplet');
  await page.click('.bwp-mode[data-v="8"]');
  const base = await bassNotes('Couplet');

  // rien par défaut
  ok((await page.locator('#bwAuto').count()) === 0 && (await page.locator('.bwau-ln').count()) === 0, 'aucune carte d’automation par défaut');
  ok(/^Automation ▾$/.test((await page.textContent('#bwAutoBtn')).trim()) && !(await page.locator('.bwau-menu').count()), 'bouton « Automation ▾ », menu fermé');
  ok(!(await page.locator('.bh-scene .bwau-badge').count()) && !/auto/.test(await page.textContent('#bandWizSteps li.cur')), 'ni pastille ni « auto » dans le résumé');

  // menu : ouverture, 10 réglages, clavier, Échap
  await page.click('#bwAutoBtn');
  ok((await page.getAttribute('#bwAutoBtn', 'aria-expanded')) === 'true' && (await page.locator('.bwau-item').count()) === 10, 'le menu s’ouvre : 10 réglages');
  const names = await page.$$eval('.bwau-item', (l) => l.map((x) => x.querySelector('span').textContent.trim().split(' · ')[0]));
  ok(JSON.stringify(names) === JSON.stringify(['Cutoff (Filtre)', 'Résonance', 'Vélocité', 'Volume', 'Reverb', 'Écho', 'Cosmos', 'Cutoff du son', 'Decay du filtre', 'Quantité des LFO']), 'noms : ' + names.join(', '));
  const disabled = await page.$$eval('.bwau-item:disabled', (l) => l.map((x) => x.dataset.param));
  const synth = await page.evaluate(() => {
    const T = SS.band.insSteps().find((t) => t.role === 'bass');
    const t = SS.newTrack(T.col.o, SS.newProject());
    return SS.autoParamsFor(t).some((P) => P.voice);
  });
  ok(synth ? disabled.length === 0 : JSON.stringify(disabled) === JSON.stringify(['vcf', 'fdecay', 'lfoamt']), `réglages du son grisés selon l’instrument (synthé : ${synth}) : ${disabled.join(',') || 'aucun'}`);
  ok(await page.evaluate(() => document.activeElement.classList.contains('bwau-item')), 'le focus entre dans le menu');
  await page.keyboard.press('ArrowDown');
  ok((await page.evaluate(() => document.activeElement.dataset.param)) === 'res', 'flèche bas : réglage suivant');
  await page.keyboard.press('Escape');
  ok(!(await page.locator('.bwau-menu').count()) && (await page.locator('#bandDialog[open]').count()) === 1 && (await page.evaluate(() => document.activeElement.id)) === 'bwAutoBtn', 'Échap ferme le menu (pas la fenêtre) et rend le focus au bouton');
  await page.click('#bwAutoBtn');
  await page.click('.bwp-ch >> nth=0'); // clic extérieur
  ok(!(await page.locator('.bwau-menu').count()), 'clic à l’extérieur : menu fermé');

  // ajouter Cutoff
  await page.click('#bwAutoBtn');
  await menuItem('filter').click();
  await page.waitForTimeout(250);
  ok((await page.locator('.bwau-menu').count()) === 1 && (await menuItem('filter').isDisabled()) && /ajouté/.test(await menuItem('filter').textContent()), 'Cutoff ajouté : le menu reste ouvert, « ajouté »');
  ok((await page.locator('#bwAuto .bwau-ln').count()) === 1 && /Automation · 1/.test(await page.textContent('#bwAutoBtn')), 'un panneau « Cutoff », bouton « Automation · 1 »');
  let a = await auto('bass', 'verse');
  ok(a && a.filter && a.filter.shape === 'flat' && Math.abs(a.filter.a - 0.5) < 0.01, 'données : filter plate au neutre');
  ok((await page.locator('.bwau-ln[data-param="filter"] .bwau-shp').count()) === 9 && (await page.locator('.bwau-ln .bwau-pt').count()) === 2, '9 formes prêtes, 2 points sur la courbe plate');
  // aligné sur les mesures du piano-roll
  const geo = await page.evaluate(() => {
    const r = document.querySelector('#bwRoll .bw-rbody').getBoundingClientRect();
    const c = document.querySelector('.bwau-ln .bwau-cv').getBoundingClientRect();
    return [Math.round(r.left), Math.round(c.left), Math.round(r.width), Math.round(c.width)];
  });
  ok(Math.abs(geo[0] - geo[1]) <= 2 && Math.abs(geo[2] - geo[3]) <= 2, `la courbe a les mesures du piano-roll (${geo})`);
  ok((await page.locator('#bwRoll').evaluate((e) => e.compareDocumentPosition(document.querySelector('#bwAuto')) & Node.DOCUMENT_POSITION_FOLLOWING)) > 0 && (await page.locator('#bwAuto').evaluate((e) => e.compareDocumentPosition(document.querySelector('#bwAcc')) & Node.DOCUMENT_POSITION_FOLLOWING)) > 0, 'panneau sous le piano-roll, avant « Accents »');
  await page.click('#bwAutoBtn'); // ferme
  ok(!(await page.locator('.bwau-menu').count()), 'le bouton referme le menu');

  // forme Montée + Début / Fin
  await page.click('.bwau-ln[data-param="filter"] [data-shape="rise"]');
  a = await auto('bass', 'verse');
  ok(a.filter.shape === 'rise' && /→/.test(await page.textContent('.bwau-rd')), `forme Montée : ${await page.textContent('.bwau-rd')}`);
  ok((await page.locator('.bwau-shp.on').getAttribute('data-shape')) === 'rise', 'la puce Montée est choisie');
  await page.fill('#bwau-filter-a', '0');
  await page.dispatchEvent('#bwau-filter-a', 'change');
  await page.fill('#bwau-filter-b', '100');
  await page.dispatchEvent('#bwau-filter-b', 'change');
  a = await auto('bass', 'verse');
  ok(a.filter.a === 0 && a.filter.b === 1 && /−1,00 → \+1,00/.test(await page.textContent('.bwau-rd')), `Début 0 / Fin 100 : ${await page.textContent('.bwau-rd')}`);

  // glisser un point → Dessinée
  const pt = page.locator('.bwau-ln[data-param="filter"] .bwau-pt').nth(1);
  await pt.scrollIntoViewIfNeeded();
  const bb = await pt.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width / 2 - 30, bb.y + bb.height / 2 + 40, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  a = await auto('bass', 'verse');
  ok(a.filter.shape === 'drawn' && a.filter.from === 'rise' && a.filter.points.length === 2 && a.filter.points[1][0] === 255 && a.filter.points[1][1] < 1, `glisser le dernier point : « Dessinée » (${JSON.stringify(a.filter.points)})`);
  ok((await page.locator('.bwau-shp.drawn').count()) === 1 && /Revenir à la forme « Montée »/.test(await page.textContent('.bwau-rev')), 'puce « Dessinée » et « ↺ Revenir à la forme « Montée » »');
  ok((await page.locator('.bwau-ln[data-param="filter"] .bwau-k').count()) === 0, 'les curseurs laissent la place au retour');
  // double-clic ajoute, clic droit supprime
  const cv = page.locator('.bwau-ln[data-param="filter"] .bwau-cv');
  await page.evaluate(() => document.querySelectorAll('[data-xs], .bw-rscr').forEach((e) => (e.scrollLeft = 0)));
  const cb = await cv.boundingBox();
  await page.mouse.dblclick(cb.x + 300, cb.y + 20);
  await page.waitForTimeout(300);
  ok((await page.locator('.bwau-ln[data-param="filter"] .bwau-pt').count()) === 3, 'double-clic : un point de plus');
  await page.locator('.bwau-ln[data-param="filter"] .bwau-pt').nth(1).click({ button: 'right' });
  await page.waitForTimeout(300);
  ok((await page.locator('.bwau-ln[data-param="filter"] .bwau-pt').count()) === 2, 'clic droit : le point est enlevé');
  await page.locator('.bwau-ln[data-param="filter"] .bwau-pt').nth(0).click({ button: 'right' });
  ok((await page.locator('.bwau-ln[data-param="filter"] .bwau-pt').count()) === 2, 'les extrémités ne s’enlèvent pas');
  await page.click('.bwau-rev');
  a = await auto('bass', 'verse');
  ok(a.filter.shape === 'rise' && !a.filter.points && a.filter.a === 0 && a.filter.b === 1, 'Revenir à la forme : Montée 0 → 1 retrouvée');

  // pastille et résumé
  ok(/auto/.test(await page.textContent('.bh-scene.on .bwau-badge')) && /Basse · Croches · auto/.test((await page.textContent('#bandWizSteps li.cur')).replace(/\s+/g, ' ')), 'pastille « auto » de la scène et résumé « Basse · Croches · auto »');
  // chaque scène a ses courbes
  await scene('Refrain');
  ok((await page.locator('#bwAuto').count()) === 0 && !(await auto('bass', 'chorus')) && !(await page.locator('.bh-scene:has(.bh-sname b:text-is("Refrain")) .bwau-badge').count()) && !/auto/.test(await page.textContent('#bandWizSteps li.cur')), 'Refrain : pas de courbe, pas de pastille, pas de « auto »');
  ok(/^Automation ▾$/.test((await page.textContent('#bwAutoBtn')).trim()), 'Refrain : bouton sans compteur');
  await scene('Couplet');
  ok((await page.locator('.bwau-ln').count()) === 1, 'retour au couplet : sa courbe');

  // Vélocité
  await page.click('#bwAutoBtn');
  await menuItem('vel').click();
  await page.waitForTimeout(250);
  await page.click('.bwau-menu >> text=Panneaux'); // reste ouvert
  await page.click('.bwau-ln[data-param="vel"] [data-shape="fall"]');
  await page.fill('#bwau-vel-a', '10');
  await page.dispatchEvent('#bwau-vel-a', 'change');
  await page.fill('#bwau-vel-b', '100');
  await page.dispatchEvent('#bwau-vel-b', 'change');
  a = await auto('bass', 'verse');
  const velNotes = await bassNotes('Couplet');
  ok(a.vel && a.vel.shape === 'fall' && /vél\. 40 → vél\. 127/.test(await page.textContent('.bwau-ln[data-param="vel"] .bwau-rd')), `Vélocité : ${await page.textContent('.bwau-ln[data-param="vel"] .bwau-rd')}`);
  ok(velNotes[0].vel < base[0].vel && velNotes[velNotes.length - 1].vel >= base[base.length - 1].vel, `les notes suivent la courbe (${base[0].vel} → ${velNotes[0].vel} au début)`);
  const projAuto = await page.evaluate(() => {
    const sc = SS.band._state.wiz.res.scenes.find((x) => x.name === 'Couplet');
    const id = Object.keys(sc.data).find((k) => /:bass/.test(k));
    return Object.keys(sc.data[id].auto || {});
  });
  ok(JSON.stringify(projAuto) === '["filter"]', 'Vélocité n’est pas une courbe de piste : seule « filter » est écrite');
  // masquer / afficher
  await page.click('.bwau-ln[data-param="vel"] .bwau-fold');
  ok((await page.locator('.bwau-ln.fold').count()) === 1 && (await page.locator('.bwau-ln.fold .bwau-pt').count()) === 0 && (await page.locator('.bwau-ln.fold .bwau-cv svg').count()) === 1 && /Descente/.test(await page.textContent('.bwau-ln.fold .bwau-rd')), 'courbe repliée : une ligne fine, mini-courbe, résumé');
  ok((await auto('bass', 'verse')).vel.hidden === true && JSON.stringify(await bassNotes('Couplet')) === JSON.stringify(velNotes), 'repliée : elle joue quand même (mêmes vélocités)');
  await page.click('#bwAutoBtn');
  await page.click('#bwauHideAll');
  ok((await page.locator('.bwau-ln.fold').count()) === 2, 'Tout masquer : deux lignes repliées');
  ok(await page.isDisabled('#bwauHideAll'), '« Tout masquer » grisé quand tout l’est');
  await page.click('#bwauShowAll');
  ok((await page.locator('.bwau-ln.fold').count()) === 0 && (await page.locator('.bwau-ln').count()) === 2, 'Tout afficher : les deux panneaux');
  await page.keyboard.press('Escape');

  // supprimer
  await page.click('.bwau-ln[data-param="vel"] .bwau-del');
  a = await auto('bass', 'verse');
  ok(!a.vel && a.filter && JSON.stringify(await bassNotes('Couplet')) === JSON.stringify(base), 'supprimer Vélocité : plus de courbe, les notes retrouvent leurs vélocités');

  // captures : menu ouvert, puis deux courbes dont une repliée
  await page.click('#bwAutoBtn');
  await menuItem('vel').click();
  await page.waitForTimeout(300);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'auto-real-menu.png') });
  await page.keyboard.press('Escape');
  await page.click('.bwau-ln[data-param="vel"] [data-shape="breath"]');
  await page.click('.bwau-ln[data-param="vel"] .bwau-fold');
  await page.evaluate(() => document.querySelector('#bwAuto').scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'auto-real-2courbes.png') });
  await page.evaluate(() => (document.querySelector('#bwParts').scrollTop = 0));
  await page.click('.bwau-ln[data-param="vel"] .bwau-del');

  // copie vers les scènes du même type
  await page.click('#bwpSame');
  const all = await page.evaluate(() => SS.band._state.wiz.parts);
  const T = await page.evaluate(() => SS.band.insSteps().find((t) => t.role === 'bass').key);
  const other = Object.keys(all).find((k) => k !== 'verse' && k !== 'chorus' && all[k].inst && all[k].inst[T] && all[k].inst[T].auto);
  ok(other && JSON.stringify(all[other].inst[T].auto) === JSON.stringify(all.verse.inst[T].auto), `copie : l’automation suit vers ${other}`);
  ok(!(all.chorus && all.chorus.inst && all.chorus.inst[T] && all.chorus.inst[T].auto), 'copie : le refrain n’est pas touché');
  await scene('Refrain');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'auto-real-scene-sans-courbe.png') });
  await scene('Couplet');

  // les autres types d'instrument ont le bouton
  const kinds = await page.$$eval('#bandWizSteps li[data-kind]', (l) => l.map((x) => x.dataset.kind));
  for (const k of kinds) {
    await kindTab(k);
    ok((await page.locator('#bwAutoBtn').count()) === 1, `onglet ${k} : bouton « Automation »`);
  }
  await kindTab('drums');
  await page.click('#bwAutoBtn');
  const dis = await page.$$eval('.bwau-item:disabled', (l) => l.map((x) => x.dataset.param));
  ok(JSON.stringify(dis) === JSON.stringify(['vcf', 'fdecay', 'lfoamt']), 'batterie : réglages du son grisés (« synthés seulement »)');
  await menuItem('volume').click();
  await page.keyboard.press('Escape');
  ok((await page.locator('#bwAuto .bwau-ln').count()) === 1, 'batterie : le panneau Volume apparaît');
  await page.click('.bwau-ln[data-param="volume"] [data-shape="fall"]');
  await kindTab('melody');
  ok((await page.locator('#bwAutoBtn').count()) === 1 && (await page.locator('#bwAuto .bwau-ln').count()) === 0, 'mélodie : bouton, rien d’affiché');
  await page.click('#bwAutoBtn');
  await menuItem('reverb').click();
  await page.keyboard.press('Escape');
  ok((await page.locator('#bwAuto .bwau-ln').count()) === 1 && (await page.locator('#bwauCopy').count()) === 1, 'mélodie : le panneau Reverb apparaît, avec sa copie');
  await page.click('.bwau-ln[data-param="reverb"] [data-shape="rise"]');
  await kindTab('bass');

  // pas de défilement horizontal à 390 px
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.click('#bwAutoBtn');
  await page.waitForTimeout(200);
  const ov = await page.evaluate(() => {
    const d = document.querySelector('#bandDialog');
    const m = document.querySelector('.bwau-menu').getBoundingClientRect();
    return [document.documentElement.scrollWidth - document.documentElement.clientWidth, d.scrollWidth - d.clientWidth, document.querySelector('#bwParts').scrollWidth - document.querySelector('#bwParts').clientWidth, Math.round(m.left), Math.round(m.right)];
  });
  ok(ov.slice(0, 3).every((x) => x <= 1) && ov[3] >= 0 && ov[4] <= 390, `390 px : pas de défilement horizontal, menu dans l’écran (${ov})`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'auto-real-390.png') });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.waitForTimeout(300);

  // écoute : la scène entend les courbes
  await scene('Couplet');
  await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 8000 });
  const heard = await page.evaluate(() => {
    const L = SS.band._listen();
    const sc = L.scenes.find((x) => x.name === 'Couplet');
    const t = L.tracks.find((x) => /bass/.test((x.band && x.band.key) || ''));
    return sc.data[t.id].auto && sc.data[t.id].auto.filter;
  });
  ok(heard && heard[0] === -1 && heard[255] !== undefined, `l’écoute de la scène porte la courbe de filtre (${JSON.stringify(heard)})`);

  // brouillon
  const before = await page.evaluate(() => JSON.stringify(SS.band._state.wiz.parts));
  const snap = await page.evaluate(() => SS.band.wizSnapshot());
  ok(JSON.stringify(snap).includes('"auto"') && JSON.stringify(snap).includes('"shape":"rise"'), 'brouillon : les courbes sont dans l’instantané');
  await page.click('#bandClose');
  await page.waitForTimeout(500);
  const okRestore = await page.evaluate((s) => SS.band.wizRestore(s), snap);
  await page.waitForTimeout(600);
  ok(okRestore && (await page.evaluate(() => JSON.stringify(SS.band._state.wiz.parts))) === before, 'wizRestore : mêmes courbes dans toutes les scènes');
  await kindTab('bass');
  ok((await page.locator('#bwAuto .bwau-ln[data-param="filter"]').count()) === 1 && /Automation · 1/.test(await page.textContent('#bwAutoBtn')), 'l’onglet Basse retrouve sa courbe');

  // Créer la chanson
  await page.click('#bwAutoBtn');
  await menuItem('vel').click();
  await page.click('.bwau-ln[data-param="vel"] [data-shape="fall"]');
  const wantVel = await bassNotes('Couplet');
  for (let i = 0; i < 8 && !(await page.isVisible('#bwCreate')); i++) await next();
  await page.click('#bwCreate');
  await page.waitForTimeout(1200);
  const p = await P();
  const bass = p.tracks.find((t) => t.band && t.band.key === 'bass');
  const verse = p.scenes.find((s) => s.name === 'Couplet');
  const chorus = p.scenes.find((s) => s.name === 'Refrain');
  const f = verse.data[bass.id].auto && verse.data[bass.id].auto.filter;
  ok(f && f[0] === -1 && f[verse.bars * 16 - 1] > 0.9, `projet : le couplet a la courbe filter (${JSON.stringify(f)})`);
  ok(!(chorus.data[bass.id].auto && chorus.data[bass.id].auto.filter), 'projet : le refrain n’a pas la courbe');
  const ev = verse.data[bass.id].events.map((e) => ({ step: e.step, vel: e.vel }));
  if (JSON.stringify(ev) !== JSON.stringify(wantVel)) console.log(JSON.stringify(ev.slice(0, 6)), JSON.stringify(wantVel.slice(0, 6)), ev.length, wantVel.length);
  ok(JSON.stringify(ev) === JSON.stringify(wantVel) && ev[0].vel > ev[ev.length - 1].vel, 'projet : les vélocités suivent la courbe Vélocité');
  const kick = p.tracks.find((t) => t.band && t.band.key === 'drums:bd');
  ok(kick && verse.data[kick.id].auto && verse.data[kick.id].auto.volume, 'projet : la courbe Volume de la batterie est sur la grosse caisse (et le kit)');
  ok(errs.length === 0, 'aucune erreur de page' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})().catch((e) => {
  console.error('FAIL plantage', e);
  process.exit(1);
});
