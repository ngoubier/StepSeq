/*
 * Test de bout en bout du brouillon de l'assistant « Nouvelle chanson » (js/band.js, js/wizdraft.js, project.wizard) :
 *   node tests/e2e/wizard-draft.js [dossier-captures]
 * L'assistant s'enregistre tout seul dans le projet (sans créer de piste, sans toucher à Annuler) ; Fermer le garde ; après un
 * rechargement, « Reprendre l'assistant » (menu) rouvre à la même étape avec tous les réglages ; Créer la chanson le garde aussi ;
 * « Nouvelle chanson sur ce projet… » demande avant de le remplacer.
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
  const page = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  let answer = true;
  const dialogs = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    answer ? d.accept() : d.dismiss();
  });
  const URL = `http://localhost:${server.address().port}/index.html`;
  await page.goto(URL);
  await page.waitForTimeout(1000);
  const P = () => page.evaluate(() => JSON.parse(localStorage.getItem('stepseq.autosave')));
  const tab = async (kind) => {
    await page.click(`#bandWizSteps li[data-kind="${kind}"] button`);
    await page.waitForTimeout(300);
  };
  const next = async (n = 1) => {
    for (let i = 0; i < n; i++) await page.dispatchEvent('#bwNext', 'click');
    await page.waitForTimeout(250);
  };
  const cur = async () => (await page.locator('#bandWizSteps li.cur').textContent()).trim();
  const live = () =>
    page.evaluate(() => {
      const W = SS.band._state.wiz;
      return JSON.parse(JSON.stringify({ step: W.step, kinds: W.kinds, parts: W.parts, mix: W.mix, hscene: W.hscene, hsec: W.hsec, mixScope: W.mixScope, tempo: W.tempo, melPanel: W.melPanel, styleId: SS.band._state.styleId, presetId: SS.band._state.presetId }));
    });
  const menuResume = async () => {
    await page.click('#appMenuBtn');
    return page.isVisible('#resumeWizard');
  };

  // menu : sans brouillon, « Reprendre l'assistant » n'est pas là
  ok(!(await menuResume()), 'sans brouillon : pas de « Reprendre l’assistant » dans le menu');
  await page.keyboard.press('Escape');
  await page.click('#appMenuBtn'); // referme
  await page.click('#appMenuBtn');
  await page.click('#newProject');
  await page.waitForTimeout(600);
  const tracks0 = (await P()).tracks.length;
  await page.waitForTimeout(600);
  const undoDepth = () => page.evaluate(() => ({ u: !document.querySelector('#undoBtn').disabled, r: !document.querySelector('#redoBtn').disabled }));
  const undo0 = JSON.stringify(await undoDepth());
  ok(!(await page.isVisible('#bandDraft')), 'assistant ouvert, rien changé : pas d’indication « Brouillon enregistré »');
  await page.waitForTimeout(2200);
  ok(!('wizard' in (await P())), 'assistant ouvert sans rien toucher : aucun brouillon écrit');

  // style, inspiration, type d'un instrument
  await page.click('#bandStyles [data-v="synthwave"]');
  await page.click('#bandPresets .band-preset >> nth=0');
  await next(1);
  const mus = await page.$$eval('#bandStage .band-mus', (l) => l.length);
  let padIdx = -1;
  for (let i = 0; i < mus; i++) {
    await page.click(`#bandStage .band-mus >> nth=${i}`);
    await page.waitForTimeout(150);
    if ((await page.inputValue('#bandPanel .bpn-ksel').catch(() => '')) === 'chords') padIdx = i;
    if (padIdx === i) break;
  }
  ok(padIdx >= 0, 'un musicien de type Accords trouvé');
  await page.selectOption('#bandPanel .bpn-ksel', 'arp');
  await page.waitForTimeout(300);
  // un réglage de basse sur une scène
  await tab('bass');
  const modeBefore = await page.evaluate(() => Object.keys(SS.band._state.wiz.parts).length);
  const target = page.locator('#bwMotif .mot-card:not(.on):not(.mot-none)').first();
  const modeId = await target.getAttribute('data-id');
  await target.click();
  await page.waitForTimeout(300);
  ok(modeBefore === 0 && (await page.evaluate(() => Object.keys(SS.band._state.wiz.parts).length)) === 1, `réglage de basse (mode « ${modeId} ») écrit dans parts`);
  // une mélodie générée
  await tab('melody');
  await page.click('.bh-scene:has(.bh-sname b:text-is("Couplet"))');
  await page.waitForTimeout(250);
  await page.click('#bwMelGo');
  await page.waitForTimeout(600);
  ok(await page.evaluate(() => !!document.querySelector('#melOut .mel-roll')), 'mélodie générée dans le Couplet');
  // un réglage de mix
  await page.click('#bandWizSteps li[data-group="Finaliser"] + li + li button'); // Mix, qui suit Arrangement et Effets et transitions
  await page.waitForTimeout(400);
  const m0 = await page.evaluate(() => SS.band._state.wiz.mix.tracks.bass.vol);
  await page.locator('#bwMix [data-mx="vol"][data-id="bass"]').fill(String(Math.round((m0 + 3) * 10) / 10));
  await page.waitForTimeout(300);
  const A = await live();
  ok(A.mix.tracks.bass.vol !== m0 && A.step === 13 && Object.keys(A.kinds).length === 1, 'état avant fermeture : mix modifié, étape Mix, un type changé');

  // enregistrement automatique : indication, project.wizard, aucune piste
  await page.waitForTimeout(1200);
  ok((await page.textContent('#bandDraft')).trim() === 'Brouillon enregistré' && (await page.isVisible('#bandDraft')), 'indication « Brouillon enregistré » à côté de Fermer');
  let pr = await P();
  ok(pr.wizard && pr.wizard.v === 4 && typeof pr.wizard.savedAt === 'number' && !pr.wizard.createdAt, 'project.wizard écrit dans le stockage automatique pendant que l’assistant est ouvert');
  ok(pr.tracks.length === tracks0, 'aucune piste créée ni modifiée par l’enregistrement');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'draft-wizard.png') });

  // Fermer : le brouillon reste
  await page.click('#bandClose');
  await page.waitForTimeout(700);
  pr = await P();
  ok(!(await page.isVisible('#bandDialog')) && pr.tracks.length === tracks0 && !!pr.wizard, 'Fermer : aucune piste en plus, le brouillon reste dans le projet');
  ok(JSON.stringify(await undoDepth()) === undo0, 'Annuler / Rétablir : le brouillon n’ajoute aucune entrée');

  // rechargement : l'autosave rend le projet et son brouillon ; l'assistant ne s'ouvre pas tout seul
  await page.reload();
  await page.waitForTimeout(1200);
  ok(!(await page.isVisible('#bandDialog')), 'ouvrir un projet qui a un brouillon ne lance pas l’assistant');
  ok(await menuResume(), 'menu : « Reprendre l’assistant » visible');
  ok(/brouillon du/.test(await page.textContent('#resumeWizardInfo')), 'le menu dit « brouillon du … »');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'draft-menu.png') });
  await page.click('#resumeWizard');
  await page.waitForTimeout(900);
  const B = await live();
  ok(await page.isVisible('#bandDialog'), 'Reprendre : l’assistant s’ouvre');
  ok(B.step === A.step && (await cur()).includes('Mix'), `même étape (${B.step} : Mix)`);
  ok(B.styleId === A.styleId && B.presetId === A.presetId, 'même style et même inspiration');
  ok(JSON.stringify(B.kinds) === JSON.stringify(A.kinds), 'type de l’instrument changé : retrouvé');
  ok(JSON.stringify(B.parts) === JSON.stringify(A.parts), 'réglage de basse de la scène : retrouvé');
  ok(JSON.stringify(B.mix) === JSON.stringify(A.mix), 'réglage de mix : retrouvé');
  ok(JSON.stringify(B.melPanel) === JSON.stringify(A.melPanel) && JSON.stringify(B.hscene) === JSON.stringify(A.hscene), 'état du panneau Mélodie et scène courante : retrouvés');
  ok(await page.evaluate(() => { const W = SS.band._state.wiz; return Object.values(W.parts).some((p) => Object.values(p.inst || {}).some((i) => i.lead && i.lead.events.length)); }), 'la mélodie générée est dans les réglages de la scène');
  ok(await page.evaluate(() => SS.band.insSteps().some((t) => t.kind === 'arp') && !SS.band.insSteps().some((t) => t.kind === 'chords')), 'le groupe a toujours son arpège (type changé)');
  await page.waitForTimeout(2200);
  ok((await page.isVisible('#bandDraft')) && (await P()).wizard.savedAt === pr.wizard.savedAt, 'reprise sans rien changer : le brouillon n’est pas réécrit');
  await tab('melody');
  ok(await page.evaluate(() => !!document.querySelector('#melOut .mel-roll')), 'étape Mélodie : la proposition générée est affichée telle quelle');
  await page.click('#bandWizSteps li[data-group="Finaliser"] + li + li button'); // Mix, qui suit Arrangement et Effets et transitions
  await page.waitForTimeout(300);

  // Créer la chanson : pistes créées, brouillon gardé avec createdAt
  await page.click('#bandWizSteps li:last-child button');
  await page.waitForTimeout(300);
  await page.click('#bwCreate');
  if (await page.isVisible('#bcfSong')) await page.click('#bcfSong');
  await page.waitForTimeout(1500);
  pr = await P();
  ok(!(await page.isVisible('#bandDialog')) && pr.tracks.length > 2 && pr.tracks.every((t) => t.band), 'Créer la chanson : les pistes sont créées');
  ok(pr.wizard && typeof pr.wizard.createdAt === 'number' && pr.wizard.state.w.step >= 11, 'le brouillon est conservé, avec createdAt');
  ok(!(await page.evaluate(() => document.querySelector('#undoBtn').disabled)), 'la création des pistes reste annulable (Ctrl+Z)');
  await page.click('#undoBtn');
  await page.waitForTimeout(400);
  pr = await P();
  ok(pr.tracks.length === tracks0 && !!pr.wizard && !!pr.wizard.createdAt, 'Annuler retire les pistes mais ne touche pas au brouillon');
  await page.click('#redoBtn');
  await page.waitForTimeout(400);
  ok((await P()).tracks.length > 2 && !!(await P()).wizard, 'Rétablir : les pistes reviennent, le brouillon reste');
  ok(await menuResume(), 'menu : « Reprendre l’assistant » toujours là');
  ok(/chanson créée/.test(await page.textContent('#resumeWizardInfo')), 'le menu dit « chanson créée le … »');
  await page.keyboard.press('Escape');
  await page.click('#appMenuBtn');

  // brouillon de projet : toujours là dans Mes chansons / export (sérialisation du projet)
  ok(await page.evaluate(() => { const j = JSON.parse(SS.serialize(JSON.parse(localStorage.getItem('stepseq.autosave')) && SS.normalizeProject(JSON.parse(localStorage.getItem('stepseq.autosave'))))); return !!j.wizard && j.wizard.state.w.step >= 11; }), 'le brouillon traverse normalizeProject / serialize (export, import, Mes chansons)');

  // « Nouvelle chanson sur ce projet… » : confirmation avant de remplacer le brouillon
  answer = false;
  dialogs.length = 0;
  await page.click('#appMenuBtn');
  await page.click('#bandBtn');
  await page.waitForTimeout(500);
  ok(dialogs.length === 1 && /Remplacer le brouillon de l’assistant/.test(dialogs[0]), 'confirmation « Remplacer le brouillon de l’assistant ? »');
  ok(!(await page.isVisible('#bandDialog')) && !!(await P()).wizard, 'Annuler : l’assistant ne s’ouvre pas, le brouillon reste');
  answer = true;
  await page.click('#appMenuBtn');
  await page.click('#bandBtn');
  await page.waitForTimeout(700);
  ok((await page.isVisible('#bandDialog')) && !(await P()).wizard && (await live()).step === 1, 'OK : assistant neuf, ancien brouillon effacé');
  await page.click('#bandClose');
  await page.waitForTimeout(700);
  ok(!(await P()).wizard, 'rouvert puis refermé sans rien changer : pas de brouillon');

  // brouillon inutilisable : inspiration disparue, ou version inconnue
  await page.evaluate(() => { const p = SS.normalizeProject(JSON.parse(localStorage.getItem('stepseq.autosave'))); p.wizard = { v: 1, savedAt: Date.now(), state: { styleId: 'synthwave', presetId: 'preset-disparu', w: { step: 5 } } }; localStorage.setItem('stepseq.autosave', JSON.stringify(p)); });
  await page.reload();
  await page.waitForTimeout(1200);
  await page.click('#appMenuBtn');
  await page.click('#resumeWizard');
  await page.waitForTimeout(500);
  ok(!(await page.isVisible('#bandDialog')) && !errs.length, 'inspiration disparue : l’assistant ne s’ouvre pas, aucune erreur');
  ok(errs.length === 0, 'aucune erreur JavaScript : ' + errs.join(' | '));
  await b.close();
  server.close();
})();
