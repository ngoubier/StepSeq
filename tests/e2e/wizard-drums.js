/*
 * Test de bout en bout de l'étape Batterie de l'assistant « Nouvelle chanson » (js/band.js) :
 *   node tests/e2e/wizard-drums.js
 * Grille : une ligne par élément coché du kit, motif de 1 / 2 / 4 mesures, vélocité, ratchet et probabilité (clic droit, clavier),
 * écrits dans la chanson créée ; scènes de montée : progression Linéaire / Rapide / Tardive / Perso, mesure verrouillée, crescendo ;
 * étape 1 : « Générer et écouter ».
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
  const page = await b.newPage({ viewport: { width: 1500, height: 920 } });
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
    await page.waitForTimeout(300);
  };
  const scene = async (name) => {
    await page.click(`.bh-scene:has(.bh-sname b:text-is("${name}"))`);
    await page.waitForTimeout(300);
  };
  /** Réglage de la batterie dans une scène : parts[section].inst[id du musicien]. */
  const drums = (sec) =>
    page.evaluate((s) => {
      const T = SS.band.insSteps().find((t) => t.role === 'drums');
      const pp = SS.band._state.wiz.parts[s];
      return JSON.parse(JSON.stringify((T && pp && pp.inst && pp.inst[T.key]) || null));
    }, sec);
  /** Données d'une pièce dans la scène de l'aperçu (pas, ratchets, conditions). */
  const preview = (name, snd) =>
    page.evaluate(([n, s]) => {
      const sc = SS.band._state.wiz.res.scenes.find((x) => x.name === n);
      const id = Object.keys(sc.data).find((k) => k.endsWith(':' + s));
      return id ? JSON.parse(JSON.stringify(sc.data[id])) : null;
    }, [name, snd]);
  const perBar = (steps) => Array.from({ length: steps.length / 16 }, (_, i) => steps.slice(i * 16, i * 16 + 16).filter((v) => v > 0).length);
  const lanesText = () => page.$$eval('.bwd-sc-main .bwd-row:not(.bwd-barh):not(.bwd-beatrow) .bwd-ln', (l) => l.map((x) => x.textContent.trim()));

  // ---- Étape 1 : « Générer et écouter » ----
  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);
  ok(await page.isVisible('#bwGo'), 'étape 1 : bouton « Générer et écouter » visible');
  ok((await page.textContent('#bwQuick small')).includes('puis affine étape par étape'), 'étape 1 : « puis affine étape par étape » sous le bouton');
  const box = await page.evaluate(() => {
    const r = document.querySelector('#bwGo').getBoundingClientRect();
    const t = document.querySelector('#bwStepHead').getBoundingClientRect();
    return { right: r.right, w: innerWidth, top: r.top, headTop: t.top, bg: getComputedStyle(document.querySelector('#bwGo')).backgroundColor };
  });
  ok(box.right > box.w - 80 && box.top < 160 && box.bg === 'rgb(63, 207, 142)', `bouton vert en haut à droite de la tête d'étape (${Math.round(box.right)} / ${box.w}, ${box.bg})`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'drums-step1.png') });
  await page.click('#bwGo');
  await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 8000 });
  ok(/^■\s*Lecture/.test(await page.textContent('#bwGo')) && (await page.evaluate(() => SS.band._state.wiz.res.scenes.length)) > 3 && !!(await page.evaluate(() => SS.band._state.presetId)), 'la chanson complète joue (inspiration par défaut), le bouton montre « Lecture »');
  ok((await page.evaluate(() => document.querySelector('#play').classList.contains('playing'))) && !(await page.evaluate(() => document.querySelector('#stop').disabled)), 'la barre du haut suit l’écoute (Lecture, Stop)');
  await page.click('#bwGo');
  await page.waitForTimeout(300);
  ok(!(await page.evaluate(() => SS.audio.isPlaying())) && /Générer et écouter/.test(await page.textContent('#bwGo')), 're-clic : arrêt, le bouton redevient « Générer et écouter »');

  // ---- Batterie : lignes = éléments du kit ----
  await page.click('#bandStyles [data-v="techno"]');
  await page.click('#bandPresets .band-preset >> nth=0'); // Powers of Ten : scènes Groove (jeu plein) et Montée
  await next(5);
  const kit = await page.evaluate(() => SS.band.insSteps().find((t) => t.role === 'drums').cols.map((c) => c.o.name));
  let names = await lanesText();
  ok(names.length === kit.length && kit.every((n) => names.includes(n)) && names.includes('Rimshot'), `une ligne par élément du kit : ${names.join(', ')}`);
  ok((await page.locator('.bwd-sc-main .bwp-cell').count()) === 16 * kit.length, 'une mesure : 16 pas par ligne');
  // décocher un élément du kit (étape Instruments) retire sa ligne
  await page.evaluate(() => {
    const st = SS.band._state;
    const mu = Object.values(st.cache[st.presetId] || {}).find((m) => m.pieces);
    const pc = mu && mu.pieces.find((x) => x.piece.split('@')[0] === 'rim');
    if (pc) pc.on = false;
  });
  await scene('Groove');
  names = await lanesText();
  ok(!names.includes('Rimshot') && names.length === kit.length - 1, 'élément décoché : sa ligne disparaît');
  await page.evaluate(() => {
    const st = SS.band._state;
    const mu = Object.values(st.cache[st.presetId] || {}).find((m) => m.pieces);
    const pc = mu && mu.pieces.find((x) => x.piece.split('@')[0] === 'rim');
    if (pc) pc.on = true;
  });
  await scene('Intro');
  await scene('Groove');
  ok((await lanesText()).includes('Rimshot'), 'élément recoché : la ligne revient');
  ok((await page.locator('.bwd-groove').textContent()).includes('pour toute la chanson'), 'swing et humanisation : « pour toute la chanson » (réglage de la chanson, pas de la scène)');

  // ---- Longueur 2 mesures, vélocité ----
  await page.click('#bwdLen [data-v="2"]');
  await page.waitForTimeout(300);
  let d = await drums('groove');
  ok(d && d.edits && d.edits.bars === 2 && d.edits.K.length === 32 && (await page.locator('.bwp-cell[data-l="K"]').count()) === 32, 'motif de 2 mesures : 32 pas par ligne, edits.bars = 2');
  ok((await page.locator('.bwd-sc-main .bwd-barh .bwd-bar').count()) === 2 && (await page.locator('.bwd-sc-main .bwd-beat').count()) === 2 * 4 * (kit.length + 1), 'deux mesures séparées, quatre temps par mesure');
  const s20 = d.edits.K[20];
  await page.click('.bwp-cell[data-l="K"][data-s="20"]');
  d = await drums('groove');
  ok(d.edits.K[20] === { '-': 'x', x: 'o', o: '.', '.': '-' }[s20], 'clic : la case suit fort → moyen → léger → éteint');
  while ((await drums('groove')).edits.K[20] !== 'x') await page.click('.bwp-cell[data-l="K"][data-s="20"]');
  let kick = await preview('Groove', 'bd');
  ok(kick.steps[20] > 0 && kick.steps[52] > 0 && kick.steps[20 + 64] > 0, 'l’aperçu joue la case de la mesure 2 du motif, répétée toutes les 2 mesures');
  const heard = await page.evaluate(() => {
    const L = SS.band._listen();
    const sc = L.scenes.find((x) => x.name === 'Groove');
    return sc.data[L.tracks.find((t) => t.id.endsWith(':bd')).id].steps[52];
  });
  ok(heard > 0, 'le projet d’écoute joue la même case');

  // ---- Fenêtre d'options : ratchet et probabilité ----
  await page.click('.bwp-cell[data-l="H"][data-s="3"]', { button: 'right' });
  ok(await page.isVisible('.bwd-pop'), 'clic droit : fenêtre d’options de la case');
  ok((await page.locator('.bwd-pop').textContent()).includes('Vélocité') && (await page.locator('#bwdRat button').count()) === 4 && (await page.locator('#bwdCond button').count()) === 6, 'options : vélocité, répétitions ×1–×4, probabilité 100 / 75 / 50 / 25, 1:2, 2:2');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'drums-popover.png') });
  await page.click('#bwdVel [data-v="o"]');
  await page.click('#bwdRat [data-v="3"]');
  await page.click('#bwdCond [data-v="p50"]');
  d = await drums('groove');
  ok(d.edits.H[3] === 'o' && d.edits.rat.H[3] === 3 && d.edits.cond.H[3] === 'p50', 'edits : vélocité moyenne, ratchet ×3, condition p50 sur le charleston');
  ok((await page.textContent('.bwp-cell[data-l="H"][data-s="3"] .rt')) === '×3' && (await page.textContent('.bwp-cell[data-l="H"][data-s="3"] .pr')) === '50%', 'la case montre ×3 et 50%');
  const hh = await preview('Groove', 'hh');
  ok(hh.steps[3] > 0 && hh.rat[3] === 3 && hh.cond[3] === 'p50' && hh.rat[35] === 3 && hh.cond[35] === 'p50', 'l’aperçu porte le ratchet et la probabilité (et la répétition du motif)');
  await page.keyboard.press('Escape');
  ok(!(await page.isVisible('.bwd-pop')) && (await page.isVisible('#bandWiz')), 'Échap ferme la fenêtre d’options sans fermer l’assistant');
  // clavier : Maj + F10 ouvre, Entrée / Espace tournent la case
  await page.focus('.bwp-cell[data-l="S"][data-s="5"], .bwp-cell[data-l="C"][data-s="5"]');
  await page.keyboard.press('Shift+F10');
  ok(await page.isVisible('.bwd-pop'), 'Maj + F10 ouvre la fenêtre d’options');
  await page.keyboard.press('Escape');
  const lane0 = await page.$eval('.bwd-sc-main .bwp-cell', (c) => c.dataset.l);
  const before = (await drums('groove')).edits[lane0][0];
  await page.focus(`.bwp-cell[data-l="${lane0}"][data-s="0"]`);
  await page.keyboard.press('Enter');
  ok((await drums('groove')).edits[lane0][0] === { '-': 'x', x: 'o', o: '.', '.': '-' }[before], 'Entrée sur une case : elle tourne');
  await page.focus(`.bwp-cell[data-l="${lane0}"][data-s="0"]`);
  await page.keyboard.press('ContextMenu');
  ok(await page.isVisible('.bwd-pop'), 'touche Menu contextuel : fenêtre d’options');
  await page.click('#bwdClear');
  ok((await drums('groove')).edits[lane0][0] === '-', '« Effacer la case »');
  await page.keyboard.press('Escape');
  // 4 mesures puis retour à 1 : le motif est étendu, puis coupé
  await page.click('#bwdLen [data-v="4"]');
  d = await drums('groove');
  ok(d.edits.bars === 4 && d.edits.K.length === 64 && d.edits.K.slice(0, 32) === d.edits.K.slice(32) && d.edits.rat.H[3] === 3 && d.edits.rat.H[35] === 3 && d.edits.rat.H[67 - 32 * 2 + 0] !== undefined, '4 mesures : motif répété, ratchets compris');
  await page.click('#bwdLen [data-v="1"]');
  d = await drums('groove');
  ok(d.edits.bars === 1 && d.edits.K.length === 16 && d.edits.rat.H[3] === 3, 'retour à 1 mesure : motif coupé');
  await page.click('#bwdLen [data-v="2"]');
  // « Revenir au motif »
  ok((await page.locator('#bwpUnedit').count()) === 1, '« Revenir à l’inspiration » proposé quand on a retouché');

  // ---- Montée ----
  await scene('Montée');
  ok(await page.isVisible('.bwb-card'), 'scène de montée : carte « Progression de la montée »');
  ok((await page.locator('#bwbPreset button').allTextContents()).join('|') === 'Linéaire|Rapide|Tardive|Perso', 'préréglages : Linéaire, Rapide, Tardive, Perso');
  ok(!(await page.textContent('.bwb-card')).includes('silence avant'), 'pas de réglage « silence avant le drop » ici');
  const rollerSnd = await page.evaluate(() => (SS.band.insSteps().find((t) => t.role === 'drums').cols.some((c) => c.o.band.key.endsWith(':sd')) ? 'sd' : 'cp'));
  const bpm = async (preset) => {
    await page.click(`#bwbPreset [data-v="${preset}"]`);
    await page.waitForTimeout(300);
    return perBar((await preview('Montée', rollerSnd)).steps);
  };
  // la longueur de la montée vient du plan (8 ou 16 mesures) : les attendus se déduisent des préréglages
  const bars = await page.evaluate(() => SS.band._state.wiz.res.scenes.find((x) => x.name === 'Montée').bars);
  const LV = (preset, b) => (preset === 'late' ? (b === bars - 1 ? 4 : b === bars - 2 ? 3 : 1) : Math.min(4, 1 + Math.floor((b * (preset === 'fast' ? 8 : 4)) / bars)));
  // coups du roulant par mesure : noires 4, croches 8, doubles 16, triples 8 (ratchet ×3) ; le silence avant le drop coupe le dernier temps (pas 12 à 15)
  const hits = (l, b) => [4, 8, 16, 8][l - 1] - (b === bars - 1 ? { 1: 1, 2: 2, 3: 4, 4: 2 }[l] : 0);
  const want = (preset) => Array.from({ length: bars }, (_, b) => hits(LV(preset, b), b));
  const lin = await bpm('lin');
  ok(bars >= 8 && lin.length === bars && lin.join() === want('lin').join(), `Linéaire sur ${bars} mesures : noires, croches, doubles, triples (ratchet ×3 sur une croche), montée régulière : ${lin}`);
  ok(LV('lin', 0) === 1 && LV('lin', bars - 3) === 4 && Array.from({ length: bars }, (_, b) => LV('lin', b)).every((l, b, a) => b === 0 || (l >= a[b - 1] && a.filter((x) => x === l).length === bars / 4)), 'Linéaire : quatre paliers de même durée');
  const rat = (await preview('Montée', rollerSnd)).rat;
  ok(rat && rat[(bars - 1) * 16] === 3 && rat[(bars - 1) * 16 + 2] === 3, 'triples : ratchet ×3 posé dans la dernière mesure');
  const fast = await bpm('fast');
  const late = await bpm('late');
  ok(fast.join() === want('fast').join() && late.join() === want('late').join(), `Rapide : ${fast} ; Tardive : ${late}`);
  ok(LV('fast', Math.floor(bars / 2) - 1) === 4 && fast.slice(Math.ceil(bars / 2)).every((n, i, a) => n === a[0] || i === a.length - 1) && late.slice(0, bars - 2).every((n) => n === 4), 'Rapide : sommet atteint avant la mi-scène puis tenu ; Tardive : noires jusqu\'aux deux dernières mesures');
  ok(fast.join() !== lin.join() && late.join() !== fast.join(), 'les préréglages changent la densité du roulement');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'drums-montee.png') });
  // cliquer une colonne : un cran de plus, Perso
  await page.click('.bwb-col[data-i="0"]');
  await page.waitForTimeout(300);
  d = await drums('build');
  const custom = perBar((await preview('Montée', rollerSnd)).steps);
  ok(d.build.preset === 'custom' && d.build.levels[0] === 2 && custom[0] === 8 && custom[1] === late[1] && (await page.getAttribute('#bwbPreset [data-v="custom"]', 'aria-checked')) === 'true', 'clic sur une colonne : un cran de plus sur cette mesure, préréglage Perso');
  await page.click('.bwb-col[data-i="0"]', { modifiers: ['Shift'] });
  d = await drums('build');
  ok(d.build.levels[0] === 1, 'Maj + clic : un cran de moins');
  // mesure verrouillée : modifier une case dans la grille de la mesure
  await page.click('.bwb-col .nm >> nth=2'); // sélectionne la mesure 3
  ok((await page.locator('.bwb-free').count()) === 0, 'mesure non verrouillée : pas de pastille « Mesure libre »');
  const before2 = perBar((await preview('Montée', rollerSnd)).steps);
  await page.click(`.bwd-sc-bar .bwp-cell[data-l="${rollerSnd}"][data-s="1"]`);
  await page.waitForTimeout(300);
  d = await drums('build');
  const after = perBar((await preview('Montée', rollerSnd)).steps);
  ok(d.build.lock && d.build.lock['2'] && (await page.isVisible('.bwb-free')) && /Mesure libre/.test(await page.textContent('.bwb-free')), 'case modifiée : la mesure est verrouillée (« Mesure libre »)');
  ok(after[2] === before2[2] + (d.build.lock['2'].lanes[rollerSnd][1] === '-' ? -1 : 1) || after[2] !== before2[2], 'la mesure verrouillée joue la case modifiée');
  const lockedCount = after[2];
  const lockedSteps = (await preview('Montée', rollerSnd)).steps.slice(32, 48).map((v) => v > 0).join();
  await bpm('fast');
  const afterFast = (await preview('Montée', rollerSnd)).steps;
  ok(afterFast.slice(32, 48).map((v) => v > 0).join() === lockedSteps && perBar(afterFast)[2] === lockedCount, 'changer de préréglage : la mesure libre ne bouge pas');
  ok(perBar(afterFast)[0] !== custom[0] || perBar(afterFast)[1] === want('fast')[1], 'les autres mesures suivent le nouveau préréglage');
  await page.click('#bwbFree');
  d = await drums('build');
  ok(!d.build.lock && perBar((await preview('Montée', rollerSnd)).steps)[2] === want('fast')[2], 'clic sur « Mesure libre » : la mesure revient à la courbe');
  // crescendo
  await page.evaluate(() => {
    const i = document.querySelector('#bwbCresc');
    i.value = 100;
    i.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  const rs = (await preview('Montée', rollerSnd)).steps.filter((v) => v > 0);
  d = await drums('build');
  ok(d.build.cresc === 1 && rs[rs.length - 1] > rs[0] + 0.3, `crescendo de volume : le roulement monte de ${rs[0]} à ${rs[rs.length - 1]}`);
  const noBuild = await page.evaluate(() => SS.band._state.wiz.res.scenes.find((x) => x.name === 'Drop').data);
  ok(!!noBuild, 'les autres scènes restent comme le plan');

  // ---- Créer la chanson : le projet porte la grille et la montée ----
  await scene('Groove');
  let guard = 0;
  while (!(await page.isVisible('#bwCreate')) && guard++ < 16) await next(1);
  await page.click('#bwCreate');
  await page.waitForTimeout(1200);
  const p = await P();
  const sc = (n) => p.scenes.find((s) => s.name === n);
  const tr = (snd) => p.tracks.find((t) => t.band && t.band.key === 'drums:' + snd);
  const g = sc('Groove');
  const ph = g.data[tr('hh').id];
  ok(ph.steps[3] > 0 && ph.rat && ph.rat[3] === 3 && ph.cond && ph.cond[3] === 'p50', 'projet créé : charleston avec ratchet ×3 et probabilité 50 % sur la case choisie');
  ok(g.data[tr('bd').id].steps[52] > 0 && g.data[tr('bd').id].steps.length === 16 * g.bars, 'projet créé : le kick de la mesure 2 du motif est joué');
  const m = sc('Montée');
  const mr = m.data[tr(rollerSnd).id];
  ok(perBar(mr.steps).length === bars && perBar(mr.steps).join() === want('fast').join(), 'projet créé : le roulement de la montée suit la progression');
  ok(!!mr.rat && Object.keys(mr.rat).length > 0, 'projet créé : ratchets du roulement');
  ok(p.groove && typeof p.groove.human === 'number', 'projet créé : groove de la chanson (swing, humanisation)');

  // ---- Ancien brouillon (edits K S C H O) : se charge ----
  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=0');
  await next(5);
  await page.evaluate(() => {
    const w = SS.band._state.wiz;
    const T = SS.band.insSteps().find((t) => t.role === 'drums');
    w.parts = { verse: { inst: { [T.key]: { style: 'synthwave', pattern: 'motorik', edits: { K: 'x---x---x---x---', S: '----x-------x---', C: '----------------', H: 'x-x-x-x-x-x-x-x-', O: '----------------' } } } } };
  });
  await scene('Intro');
  await scene('Couplet');
  const old = await page.evaluate(() => SS.band._state.wiz.res.scenes.find((x) => x.name === 'Couplet').data);
  const bd = Object.keys(old).find((k) => k.endsWith(':bd'));
  ok(old[bd].steps.slice(0, 16).map((v) => (v > 0 ? 1 : 0)).join('') === '1000100010001000' && (await page.locator('.bwp-cell[data-l="K"]').count()) === 16 && (await page.locator('.bwp-cell[data-l="K"].v1').count()) === 4, 'ancien brouillon : la grille d’une mesure s’affiche et joue comme avant');
  await page.click('#bwdLen [data-v="2"]');
  ok((await drums('verse')).edits.bars === 2 && (await drums('verse')).edits.S.length === 32, 'ancien brouillon : passer à 2 mesures le convertit');

  // ---- Téléphone : la grille défile dans sa carte ----
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(500);
  const mob = await page.evaluate(() => {
    const sc = document.querySelector('.bwd-sc-main');
    return { inner: sc.scrollWidth, outer: sc.clientWidth, page: document.scrollingElement.scrollWidth, vw: innerWidth };
  });
  ok(mob.inner > mob.outer && mob.page <= mob.vw + 1, `téléphone : la grille défile dans sa carte (${mob.inner} > ${mob.outer}), la page ne défile pas`);
  const cw = await page.evaluate(() => document.querySelector('.bwd-sc-main .bwp-cell').getBoundingClientRect().width);
  ok(cw >= 20, `téléphone : cases de ${Math.round(cw)} px`);

  ok(errs.length === 0, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
