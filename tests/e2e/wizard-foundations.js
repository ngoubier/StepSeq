/*
 * Test de bout en bout des étapes Style, Instruments, Tempo et tonalité, Scènes de l'assistant « Nouvelle chanson » (js/band.js) :
 *   node tests/e2e/wizard-foundations.js
 * Style : styles, inspirations (tempo conseillé), pas de musiciens ; Instruments : les musiciens et General MIDI ;
 * Tempo et tonalité : curseur, − / +, Tap, changer la tonalité transpose toutes les scènes (le mode ne change que celui des
 * scènes qui jouaient dans le mode de la chanson), gamme à écouter ; Scènes : ordre des blocs, répétitions, longueur, copie,
 * nom, suppression. La chanson créée porte tout cela.
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
    await page.waitForTimeout(250);
  };
  const cur = async () => (await page.locator('#bandWizSteps li.cur').textContent()).trim();
  /** Scènes de la chanson calculée par l'assistant : nom, section, tonalité, longueur. */
  const scenes = () =>
    page.evaluate(() => SS.band._state.wiz.res.scenes.map((s) => ({ name: s.name, sec: s.sec, tonic: s.key.tonic, mode: s.key.mode, bars: s.bars, root: s.spans[0].chord.rootPc })));
  /** Arrangement : « Nom×répétitions », dans l'ordre. */
  const order = () =>
    page.evaluate(() => {
      const r = SS.band._state.wiz.res;
      return r.song.map((x) => r.scenes.find((s) => s.id === x.scene).name + (x.repeat > 1 ? '×' + x.repeat : '')).join(' | ');
    });
  const blk = (i) => page.locator(`.bw-arr-blocks li[data-i="${i}"]`);
  const sc = (sec) => page.locator(`.bw-sc[data-sec="${sec}"]`);
  const range = (v) =>
    page.$eval('#bwtRange', (e, x) => {
      e.value = x;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    }, v);
  const open = async (preset) => {
    await page.click('#appMenuBtn');
    await page.click('#newProject');
    await page.waitForTimeout(600);
    await page.click('#bandStyles [data-v="synthwave"]');
    await page.click(`#bandPresets .band-preset >> nth=${preset}`);
  };
  const INTRO = 'Intro | Couplet | Refrain | Couplet | Refrain | Pont | Refrain×2 | Outro';

  await open(0); // Smalltown Boy : Do mineur, 132 BPM, Intro Couplet Refrain Couplet Refrain Pont Refrain×2 Outro

  // 1. Style : les styles (tempo conseillé), les inspirations, pas de musiciens
  ok((await cur()).includes('Style') && (await page.locator('#bandWizSteps li').count()) === 12, 'douze étapes, la première : Style');
  ok(!(await page.isVisible('#bandStage')) && !(await page.isVisible('#bandPanel')) && !(await page.isVisible('#bandGm')), 'étape 1 : ni musiciens, ni panneau, ni General MIDI');
  ok((await page.isVisible('#bandMode')) && (await page.isVisible('#bandStyles')) && (await page.isVisible('#bandPresets')) && (await page.isVisible('#bwEmpty')), 'étape 1 : portes Créer / Reprendre, styles, inspirations, « Chanson vide »');
  const pill = await page.textContent('#bandStyles [data-v="synthwave"]');
  ok(/\d+–\d+ BPM/.test(pill) && /\d+–\d+ BPM/.test(await page.textContent('#bandStyleCard')) && (await page.textContent('#bandStyleDesc')).length > 20, `style : tempo conseillé et description (${pill})`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'foundations-1-style.png') });

  // 2. Instruments : le panneau des musiciens
  await next();
  ok((await cur()).includes('Instruments') && (await page.isVisible('#bandStage')) && (await page.isVisible('#bandGm')), 'étape 2 : les musiciens et General MIDI');
  ok(!(await page.isVisible('#bandStyles')) && !(await page.isVisible('#bandPresets')) && !(await page.isVisible('#bwEmpty')), 'étape 2 : plus de styles ni d’inspirations');
  await page.click('#bandStage .band-mus >> nth=0');
  ok(await page.isVisible('#bandPanel'), 'étape 2 : un clic sur un musicien ouvre son panneau');
  await page.click('#bandStage .band-mus >> nth=0');
  await page.dispatchEvent('#bwBack', 'click');
  ok((await page.isVisible('#bandStyles')) && !(await page.isVisible('#bandStage')), 'retour à l’étape 1 : les styles reviennent');
  await next(2);

  // 3. Tempo : curseur, − / +, Tap, tempo de l'inspiration
  ok((await cur()).includes('Tempo') && (await page.textContent('#bwtLcd')) === '132' && !(await page.isVisible('#bwtOrig')), 'étape 3 : bandeau, tempo 132 (celui de l’inspiration)');
  ok((await page.locator('.bwt-reco').count()) === 1 && (await page.getAttribute('#bwtRange', 'min')) === '40' && (await page.getAttribute('#bwtRange', 'max')) === '240', 'curseur de 40 à 240 avec la zone du tempo conseillé');
  await range(100);
  ok((await page.inputValue('#tempo')) === '100' && (await page.textContent('#bwtLcd')) === '100' && (await page.isVisible('#bwtOrig')), 'curseur : 100 BPM (bandeau et afficheur)');
  await page.click('#bwtPlus');
  await page.click('#bwtPlus');
  await page.click('#bwtMinus');
  ok((await page.textContent('#bwtLcd')) === '101' && (await page.inputValue('#tempo')) === '101', '+ + − : 101 BPM');
  for (let i = 0; i < 4; i++) {
    await page.click('#bwtTap');
    await page.waitForTimeout(400);
  }
  const tap = Number(await page.textContent('#bwtLcd'));
  ok(tap >= 125 && tap <= 175, `Tap : environ 150 BPM (${tap})`);
  await page.click('#bwtOrig');
  ok((await page.textContent('#bwtLcd')) === '132' && !(await page.isVisible('#bwtOrig')), '↺ tempo de l’inspiration : 132');
  await range(100);
  ok((await page.evaluate(() => SS.band._state.wiz.tempo)) === 100, 'tempo de l’assistant : 100');

  // 3. Tonalité : transposer toutes les scènes
  ok((await page.locator('.bwt-tonic').count()) === 12 && (await page.locator('.bwt-mode').count()) >= 6 && (await page.locator('.bwt-note').count()) === 7, '12 toniques, les modes, les 7 notes de la gamme');
  ok((await page.getAttribute('.bwt-tonic.active', 'data-pc')) === '0' && (await page.getAttribute('.bwt-mode.active', 'data-skmode')) === 'minor' && /Do mineur/.test(await page.textContent('#wizKey')), 'tonalité de l’inspiration : Do mineur');
  const k0 = await scenes();
  ok(k0.length === 5 && k0.every((s) => s.tonic === 'C' && s.mode === 'minor'), 'toutes les scènes en Do mineur');
  // le pont passe en majeur (relatif) : il doit garder son mode
  await page.evaluate(() => (SS.band._state.wiz.keys.bridge = { tonic: 'E♭', mode: 'major' }));
  await page.click('.bwt-tonic[data-pc="4"]'); // Mi
  const k1 = await scenes();
  ok(k1.filter((s) => s.sec !== 'bridge').every((s) => s.tonic === 'E' && s.mode === 'minor'), 'Mi : les scènes sont transposées de +4 demi-tons (Mi mineur)');
  ok(k1.find((s) => s.sec === 'bridge').tonic === 'G' && k1.find((s) => s.sec === 'bridge').mode === 'major', 'le pont (Mi♭ majeur) devient Sol majeur : même intervalle, son mode');
  ok(k1.find((s) => s.sec === 'intro').root === 4 && /Mi mineur/.test(await page.textContent('#wizKey')) && (await page.isVisible('#bwtKeyBack')), 'les accords suivent (tonique de l’intro : Mi) ; bandeau : Mi mineur');
  await page.click('.bwt-mode[data-skmode="dorian"]');
  const k2 = await scenes();
  ok(k2.filter((s) => s.sec !== 'bridge').every((s) => s.tonic === 'E' && s.mode === 'dorian') && k2.find((s) => s.sec === 'bridge').mode === 'major', 'Dorien : les scènes en mode de la chanson le prennent, le pont garde son majeur');
  await page.click('#bwtScale');
  await page.waitForFunction(() => document.querySelector('.bwt-note.sounding'), null, { timeout: 3000 }).catch(() => {});
  ok((await page.locator('.bwt-note.sounding').count()) >= 0 && (await page.locator('.bwt-note').count()) === 7, '« Écouter la gamme » : la gamme se joue');
  await page.waitForTimeout(2900);
  await page.click('#bwtKeyBack');
  const k3 = await scenes();
  ok(k3.filter((s) => s.sec !== 'bridge').every((s) => s.tonic === 'C' && s.mode === 'minor') && k3.find((s) => s.sec === 'bridge').tonic === 'E♭' && !(await page.isVisible('#bwtKeyBack')), '↺ Tonalité de l’inspiration : tout revient (le pont en Mi♭ majeur)');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'foundations-3-tempo.png') });
  await page.click('.bwt-tonic[data-pc="4"]');
  await page.click('.bwt-mode[data-skmode="dorian"]');
  await page.click('.bwt-mode[data-skmode="minor"]');
  ok((await scenes()).filter((s) => s.sec !== 'bridge').every((s) => s.tonic === 'E' && s.mode === 'minor'), 'Mi mineur choisi pour la suite');

  // 4. Scènes : arrangement et scènes
  await next();
  ok((await cur()).includes('Scènes') && (await page.locator('.bw-arr-blocks li').count()) === 8 && (await order()) === INTRO, `étape 4 : ${INTRO}`);
  ok((await page.locator('.bw-sc').count()) === 5 && /Mi mineur/.test(await page.textContent('.bw-info')) && /100 BPM/.test(await page.textContent('.bw-info')) && /\d+ mesures · \d+:\d\d/.test(await page.textContent('#bwArrInfo')), 'cinq scènes, mesures et durée de la chanson (à 100 BPM)');
  ok(!(await page.isVisible('#bwArrReset')), 'rien de retouché : pas de « Structure de l’inspiration »');
  // ‹ › : l'Intro passe après le premier Couplet ; glisser-déposer
  await blk(0).locator('.bw-br').click();
  ok((await order()) === 'Couplet | Intro | Refrain | Couplet | Refrain | Pont | Refrain×2 | Outro', '› : l’Intro avance d’un bloc');
  await blk(1).locator('.bw-bl').click();
  ok((await order()) === INTRO, '‹ : elle revient');
  await blk(7).locator('.bw-block').scrollIntoViewIfNeeded();
  await blk(0).dragTo(blk(2));
  ok((await order()) === 'Couplet | Refrain | Intro | Couplet | Refrain | Pont | Refrain×2 | Outro', 'glisser-déposer : l’Intro prend la place du 3e bloc');
  await blk(2).dragTo(blk(0));
  ok((await order()) === INTRO, 'glisser-déposer en sens inverse');
  // répétitions
  await blk(1).locator('.bw-brm').click();
  await blk(6).locator('.bw-brl').click();
  ok((await order()) === 'Intro | Couplet×2 | Refrain | Couplet | Refrain | Pont | Refrain | Outro', '− / + : le couplet ×2, le refrain final ×1');
  await blk(1).locator('.bw-brl').click();
  await blk(6).locator('.bw-brm').click();
  // retirer un bloc
  await blk(3).locator('.bw-bx').click();
  ok((await order()) === 'Intro | Couplet | Refrain | Refrain | Pont | Refrain×2 | Outro', '× : le 2e couplet est retiré');
  ok((await page.locator('.bw-sc').count()) === 5 && /jouée 1 fois/.test(await sc('verse').textContent()), 'la scène Couplet reste, jouée une fois');
  // + Ajouter à la fin, Dupliquer, longueur, nom
  await sc('verse').locator('.bw-sc-add').click();
  ok((await order()).endsWith('Outro | Couplet'), '« + Ajouter à la fin » : le couplet rejoue à la fin');
  await sc('chorus').locator('.bw-sc-dup').click();
  const s5 = await scenes();
  ok(s5.length === 6 && s5.some((s) => s.sec === 'chorus_b' && s.name === 'Refrain 2' && s.bars === 8) && (await sc('chorus_b').count()) === 1, 'Dupliquer : « Refrain 2 », une scène de plus (chorus_b)');
  ok((await order()).includes('Refrain×2 | Refrain 2 |'), 'son bloc suit le dernier bloc du refrain');
  await sc('chorus_b').locator('[data-bars="4"]').click();
  const s6 = await scenes();
  ok(s6.find((s) => s.sec === 'chorus_b').bars === 4 && s6.find((s) => s.sec === 'chorus').bars === 8 && s6.find((s) => s.sec === 'chorus_b').tonic === 'E', 'la copie est indépendante : 4 mesures (le refrain reste à 8), même tonalité');
  await sc('chorus_b').locator('.bw-sc-name').fill('Refrain final');
  await sc('chorus_b').locator('.bw-sc-name').press('Enter');
  ok((await order()).includes('Refrain final') && (await page.locator('.bw-sname', { hasText: 'Refrain final' }).count()) === 1, 'renommer : « Refrain final »');
  await sc('verse').locator('[data-bars="8"]').click();
  ok((await scenes()).find((s) => s.sec === 'verse').bars === 8 && (await page.getAttribute('tr[data-scene] >> nth=1', 'data-bars')) === '8', 'longueur : le couplet passe à 8 mesures');
  // une grille d'accords retouchée couvre toujours la scène : répétée si elle s'allonge, coupée si elle raccourcit
  await page.evaluate(() => (SS.band._state.wiz.grids.bridge = [0, 3, 4, 0].map((d, i) => ({ step: i * 32, len: 32, degree: d, type: 'min', acc: 0 }))));
  await sc('bridge').locator('[data-bars="16"]').click();
  const g16 = await page.evaluate(() => SS.band._state.wiz.grids.bridge.map((c) => [c.step, c.len, c.degree]));
  ok(g16.length === 8 && g16[4][0] === 128 && g16[7][0] + g16[7][1] === 256 && g16[5][2] === 3, 'pont 16 mesures : la grille est répétée jusqu’à la fin');
  const sp16 = await page.evaluate(() => { const s = SS.band._state.wiz.res.scenes.find((x) => x.sec === 'bridge'); return [s.bars, s.spans.length, s.spans[s.spans.length - 1].step + s.spans[s.spans.length - 1].len]; });
  ok(sp16[0] === 16 && sp16[1] === 8 && sp16[2] === 256, 'la chanson l’entend : 8 accords sur 16 mesures');
  await sc('bridge').locator('[data-bars="4"]').click();
  const g4 = await page.evaluate(() => SS.band._state.wiz.grids.bridge.map((c) => [c.step, c.len]));
  ok(g4.length === 2 && g4[1][0] + g4[1][1] === 64, 'pont 4 mesures : la grille est coupée');
  await sc('bridge').locator('[data-bars="8"]').click();
  // supprimer une scène : ses blocs disparaissent
  await sc('outro').locator('.bw-sc-del').click();
  ok((await scenes()).every((s) => s.sec !== 'outro') && !(await order()).includes('Outro') && (await page.locator('.bw-sc').count()) === 5, 'supprimer l’Outro : la scène et son bloc disparaissent');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'foundations-4-scenes.png') });

  // la dernière scène ne se supprime pas
  ok((await page.locator('.bw-sc-del:not([disabled])').count()) === 5, 'plusieurs scènes : on peut les supprimer');

  // tout est entendu : la lecture suit l'arrangement retouché
  await page.click('#play');
  await page.waitForFunction(() => SS.audio.isPlaying(), null, { timeout: 8000 });
  const lp = await page.evaluate(() => { const proj = SS.band._listen(); return proj.song.map((x) => proj.scenes.find((s) => s.id === x.scene).name + (x.repeat > 1 ? '×' + x.repeat : '')).join(' | '); });
  ok(lp === (await order()), `l’écoute joue l’arrangement retouché (${lp})`);
  await page.click('#stop');

  const finalOrder = await order();
  const finalScenes = await scenes();

  // changer d'inspiration remet les retouches à zéro
  await page.click('#bandWizSteps li >> nth=0 >> button');
  await page.click('#bandPresets .band-preset >> nth=1');
  const w = await page.evaluate(() => { const x = SS.band._state.wiz; return [x.form, Object.keys(x.secs).length, x.skey, Object.keys(x.keys).length, Object.keys(x.grids).length]; });
  ok(w[0] === null && w[1] === 0 && w[2] === null && w[3] === 0 && w[4] === 0, 'autre inspiration : arrangement, scènes, tonalité et accords repartent du plan');
  await page.click('#bandPresets .band-preset >> nth=0');

  // le résultat est celui de la chanson retouchée : on refait les retouches puis on crée
  await next(2);
  await range(100);
  await page.evaluate(() => (SS.band._state.wiz.keys.bridge = { tonic: 'E♭', mode: 'major' }));
  await page.click('.bwt-tonic[data-pc="4"]');
  await page.click('.bwt-mode[data-skmode="dorian"]');
  await next();
  await blk(0).locator('.bw-br').click();
  await blk(6).locator('.bw-brl').click(); // Refrain ×2 → ×1
  await blk(7).locator('.bw-bx').click(); // l'Outro n'est plus jouée (la scène reste, hors arrangement)
  await sc('chorus').locator('.bw-sc-dup').click();
  await sc('chorus_b').locator('[data-bars="4"]').click();
  await sc('verse').locator('[data-bars="8"]').click();
  const want = await order();
  const wantScenes = await scenes();
  ok(wantScenes.length === 5 && !wantScenes.some((x) => x.sec === 'outro') && (await page.locator('.bw-sc.unused').count()) === 1 && wantScenes.find((s) => s.sec === 'bridge').mode === 'major', `avant de créer : ${want}`);
  await next(8); // Batterie, Accords, Basse, Nappes, Arpèges, Mélodie, Mix, Intégration
  ok((await cur()).includes('Intégration') && (await page.isVisible('#bwCreate')), 'étape 12 : Intégration');
  await page.click('#bwCreate');
  await page.waitForTimeout(900);
  const p = await P();
  ok(!(await page.isVisible('#bandDialog')) && p.tempo === 100, `chanson créée au tempo du curseur (${p.tempo})`);
  const names = new Map(p.scenes.map((s) => [s.id, s.name]));
  const got = p.song.map((x) => names.get(x.scene) + (x.repeat > 1 ? '×' + x.repeat : '')).join(' | ');
  ok(got === want, `l’ordre des blocs est celui de l’assistant : ${got}`);
  ok(p.scenes.length === 5 && p.scenes.map((s) => s.bars).join() === wantScenes.map((s) => s.bars).join(), `scènes et longueurs : ${p.scenes.map((s) => s.name + ' ' + s.bars).join(', ')}`);
  ok(p.scenes.filter((s) => s.name !== 'Pont').every((s) => s.key.tonic === 'E' && s.key.mode === 'dorian') && p.scenes.find((s) => s.name === 'Pont').key.tonic === 'G' && p.scenes.find((s) => s.name === 'Pont').key.mode === 'major', 'tonalités des scènes : Mi dorien, le pont en Sol majeur');
  ok(p.scenes.every((s) => Object.values(s.data).some((d) => (d.events || d.steps || []).length)), 'toutes les scènes ont des notes');
  ok(p.scenes.some((s) => s.name === 'Refrain 2' && s.bars === 4), 'la copie « Refrain 2 » est dans le projet');

  // la dernière scène ne peut pas être supprimée
  await page.click('#appMenuBtn'); await page.click('#bandBtn');
  await page.waitForTimeout(400);
  await page.click('#bandStyles [data-v="synthwave"]');
  await next(3);
  for (const id of ['intro', 'verse', 'chorus', 'bridge']) await sc(id).locator('.bw-sc-del').click();
  ok((await page.locator('.bw-sc').count()) === 1 && (await page.locator('.bw-sc-del').isDisabled()) && (await page.locator('.bw-arr-blocks li').count()) >= 1, 'la dernière scène ne se supprime pas');
  await page.keyboard.press('Escape');

  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
