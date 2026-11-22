/*
 * Test de bout en bout de la boîte à outils pour Claude (window.StepSeq, js/claude-tools.js) :
 *   node tests/e2e/claude-tools.js [dossier-captures]
 * Les outils lisent la chanson, écrivent (piste, notes, batterie, accords, tonalité, scènes), chaque écriture est une étape
 * Ctrl+Z, StepSeq.groupe en fait une seule, et une erreur revient en clair sans rien casser.
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
  const page = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(`http://localhost:${server.address().port}/index.html`);
  await page.waitForTimeout(1000);
  const ev = (fn, arg) => page.evaluate(fn, arg);

  // lire
  const aide = await ev(() => StepSeq.aide());
  ok(typeof aide === 'string' && aide.includes('ecrireNotes') && aide.includes('1 pas = une double-croche'), 'aide() : le mode d’emploi');
  ok(await ev(() => document.getElementById('aiHint').textContent.includes('StepSeq.aide()')), 'la page dit à Claude où trouver l’aide');
  const st = await ev(() => StepSeq.etat());
  ok(st.ok && st.tempo === 112 && st.pistes.length === 5 && st.scenes.length === 1, `etat() : démo lue (${st.tempo} BPM, ${st.pistes.length} pistes)`);
  ok(await ev(() => StepSeq.outils.length > 20 && StepSeq.outils.every((o) => o.nom && o.description && o.params)), 'StepSeq.outils : liste réutilisable par le futur panneau');

  // tempo + Ctrl+Z
  await ev(() => StepSeq.tempo({ bpm: 98 }));
  ok((await ev(() => StepSeq.etat().tempo)) === 98, 'tempo({ bpm: 98 })');
  ok(await ev(() => !document.getElementById('claudeBadge').hidden), 'badge « Claude » affiché après une action');
  await ev(() => StepSeq.annuler());
  ok((await ev(() => StepSeq.etat().tempo)) === 112, 'annuler() : retour à 112 BPM');

  // accords, piste, notes
  const acc = await ev(() => StepSeq.ecrireAccords({ accords: ['Am', 'F', 'C G', 'E7'] }));
  ok(acc.ok && /La mineur/.test(acc.message) && acc.attention, `scène d'une mesure : les accords en trop sont signalés (${acc.attention})`);
  await ev(() => StepSeq.mesures({ nombre: 4 }));
  const acc2 = await ev(() => StepSeq.ecrireAccords({ accords: ['Am', 'F', 'C G', 'E7'] }));
  ok(acc2.ok && !acc2.attention && /Am – F – C – G – E7/.test(acc2.message), `ecrireAccords sur 4 mesures : ${acc2.message || acc2.erreur}`);
  const bass = await ev(() => StepSeq.ajouterPiste({ role: 'basse', son: 'moog', nom: 'Basse Claude' }));
  ok(bass.ok && bass.id, `ajouterPiste : ${bass.message || bass.erreur}`);
  const notes = await ev((id) => StepSeq.ecrireNotes({ piste: id, notes: [{ pas: 0, note: 'A1', dur: 3, vel: 0.9 }, { pas: 4, note: 'La2', vel: 0.3 }, { pas: 8, note: ['C3', 'E3'], dur: 2 }] }), bass.id);
  ok(notes.ok, `ecrireNotes : ${notes.message || notes.erreur}`);
  const pt = await ev((id) => StepSeq.piste({ piste: id }), bass.id);
  ok(pt.notes.length === 3 && pt.notes[0].note === 'A1' && pt.notes[1].note === 'A2' && pt.notes[1].vel === 0.3 && pt.notes[2].note.length === 2, 'piste() relit les notes (A1, ghost A2, accord)');

  // tonalité : notes transposées, accords qui suivent
  const ton = await ev(() => StepSeq.tonalite({ tonique: 'Si', mode: 'mineur' }));
  ok(ton.ok && ton.transposition === 2 && ton.accords[0] === 'Bm', `tonalite Si mineur : +${ton.transposition}, ${ton.accords && ton.accords.join(' ')}`);
  ok((await ev((id) => StepSeq.piste({ piste: id }).notes[0].note, bass.id)) === 'B1', 'la basse est transposée (A1 → B1)');

  // batterie
  const drum = await ev(() => StepSeq.ecrireBatterie({ piste: 'Kick', motif: 'X...x...X..ox...' }));
  ok(drum.ok, `ecrireBatterie : ${drum.message || drum.erreur}`);
  ok((await ev(() => StepSeq.piste({ piste: 'Kick' }).motif.slice(0, 16))) === 'X...x...X..ox...', 'motif relu à l’identique (accent, coup, ghost)');

  // scènes et structure
  const sc = await ev(() => StepSeq.ajouterScene({ nom: 'Refrain', copier: 'Couplet' }));
  ok(sc.ok && (await ev(() => StepSeq.etat().sceneEnCours)) === 'Refrain', 'ajouterScene : copie du Couplet, affichée');
  const so = await ev(() => StepSeq.structure({ blocs: [{ scene: 'Couplet', fois: 2 }, 'Refrain'] }));
  ok(so.ok && so.message === 'Structure : Couplet ×2 → Refrain', so.message || so.erreur);

  // groupe : une seule étape
  const before = await ev(() => StepSeq.etat());
  await ev(() => StepSeq.groupe('batterie plus légère', () => { StepSeq.mix({ piste: 'Kick', volume: 0.5 }); StepSeq.tempo({ bpm: 90 }); }));
  await ev(() => StepSeq.annuler());
  const after = await ev(() => StepSeq.etat());
  ok(after.tempo === before.tempo && after.pistes[0].volume === before.pistes[0].volume, 'groupe : un seul Ctrl+Z annule les deux changements');

  // effets et automation
  const fx = await ev((id) => StepSeq.effets({ piste: id, delay: 0.4, delayTemps: '3/16', envoiHall: 0.3, sidechainSource: 'Kick' }), bass.id);
  ok(fx.ok && fx.effets.delay === 0.4 && fx.effets.delayTime === '3/16' && fx.effets.scSource === 'Kick 1', `effets : ${fx.message || fx.erreur}`);
  const fxBad = await ev((id) => StepSeq.effets({ piste: id, reverb: 3 }), bass.id);
  ok(!fxBad.ok && /reverb : entre 0 et 1/.test(fxBad.erreur), `effet hors bornes refusé : ${fxBad.erreur}`);
  const aus = await ev((id) => StepSeq.automations({ piste: id }), bass.id);
  ok(aus.ok && aus.parametres.some((x) => x.parametre === 'filter' && x.formes.length), 'automations : paramètres et formes de la piste');
  const au = await ev((id) => StepSeq.automation({ piste: id, parametre: 'filter', forme: 'lp-open' }), bass.id);
  ok(au.ok && (await ev((id) => StepSeq.piste({ piste: id }).automation.filter.length >= 2, bass.id)), `automation forme : ${au.message || au.erreur}`);
  const au2 = await ev(() => StepSeq.automation({ piste: 'Pad 2', parametre: 'volume', points: [{ pas: 0, valeur: 0 }, { pas: 15, valeur: 1 }] }));
  ok(au2.ok, `automation points : ${au2.message || au2.erreur}`);
  await ev(() => StepSeq.annuler());
  ok(await ev(() => !StepSeq.piste({ piste: 'Pad 2' }).automation), 'annuler retire l’automation');

  // console, retours, Master, automation par temps sur la chanson
  const cs = await ev((id) => StepSeq.console({ piste: id, pan: -0.3, eq: { graves: { gain: 3 } }, compresseur: { seuil: -20, ratio: 4 } }), bass.id);
  ok(cs.ok && cs.console.eq.actif && cs.console.eq.graves.gain === 3 && cs.console.compresseur.actif && cs.console.pan === -0.3, `console : ${cs.message || cs.erreur}`);
  const rt = await ev(() => StepSeq.retours({ echo: { temps: '1/8', repetitions: 0.5 }, cosmos: { shimmer: 0.4 } }));
  ok(rt.ok && rt.retours.echo.temps === '1/8' && rt.retours.cosmos.shimmer === 0.4, `retours : ${rt.message || rt.erreur}`);
  const ms = await ev(() => StepSeq.master({ mastering: { plafond: -1 }, effets: { saturation: 0.3 } }));
  ok(ms.ok && ms.master.mastering.actif && ms.master.effets.actif && ms.master.effets.saturation.quantite === 0.3, `master : ${ms.message || ms.erreur}`);
  const ac = await ev((id) => StepSeq.automationChanson({ piste: id, parametre: 'cutoff', forme: 'montee', de: -2, a: 1 }), bass.id);
  const acs = await ev((id) => StepSeq.automationsChanson({ piste: id }), bass.id);
  const cut = acs.passages.map((x) => x.courbes.cut);
  ok(ac.ok && acs.passages.length === 3 && cut[0][0] === -2 && Object.values(cut[2]).pop() === 1, `automationChanson montée sur ${acs.passages.length} passages : ${ac.message || ac.erreur}`);
  const acBad = await ev(() => StepSeq.automationChanson({ piste: 'Kick', parametre: 'cutoff', valeur: 1 }));
  ok(!acBad.ok && /vélocité/.test(acBad.erreur), `batterie : vélocité seulement (${acBad.erreur})`);
  await ev(() => StepSeq.annuler());
  ok(await ev((id) => !StepSeq.automationsChanson({ piste: id }).passages.length, bass.id), 'annuler retire la courbe par temps');

  // erreurs lisibles
  const e1 = await ev(() => StepSeq.ecrireNotes({ piste: 'Guitare fantôme', notes: [] }));
  ok(!e1.ok && /piste inconnue/.test(e1.erreur), `erreur en clair : ${e1.erreur}`);
  const e2 = await ev(() => StepSeq.ecrireAccords({ accords: ['Hm7'] }));
  ok(!e2.ok && e2.erreur, `accord illisible : ${e2.erreur}`);


  // assistant « Nouvelle chanson »
  const ouv = await ev(() => StepSeq.assistantOuvrir());
  ok(ouv.ok && ouv.attente && (await ev(() => SS.band.active())), `assistantOuvrir : ${ouv.message || ouv.erreur} (grille à relire : ${!!ouv.attente})`);
  await page.click('#brgSkip'); // l'utilisateur choisit : ouvrir sans reprendre les instruments de la grille
  const sty = await ev(() => StepSeq.assistantStyle({ style: 'synthwave', inspiration: 'nightcall' }));
  ok(sty.ok && /Nightcall/.test(sty.message), `assistantStyle : ${sty.message || sty.erreur}`);
  const ae = await ev(() => StepSeq.assistantTempo({ bpm: 96 }));
  const ton2 = await ev(() => StepSeq.assistantTonalite({ tonique: 'Ré', mode: 'mineur' }));
  ok(ae.ok && ton2.ok && (await ev(() => StepSeq.assistantEtat().tempo)) === 96, `assistantTempo + Tonalite : ${ton2.message || ton2.erreur}`);
  const sax = await ev(() => StepSeq.assistantMusicien({ ajouter: 'melodie', son: 'sax', nom: 'Saxo' }));
  ok(sax.ok && sax.musicien.nom === 'Saxo' && /sax/i.test(sax.musicien.son), `assistantMusicien ajouter : ${sax.message || sax.erreur}`);
  const scs = await ev(() => StepSeq.assistantEtat().scenes);
  const ch = scs.find((x) => /chorus|refrain/i.test(x.id + x.nom)) || scs[0];
  const sc8 = await ev((id) => StepSeq.assistantScene({ scene: id, mesures: 8 }), ch.id);
  const acc3 = await ev((id) => StepSeq.assistantAccords({ scene: id, accords: ['Am', 'F', 'C', 'G'] }), ch.id);
  ok(sc8.ok && acc3.ok && /Am – F – C – G – Am – F – C – G/.test(acc3.message), `assistantScene + Accords : ${acc3.message || acc3.erreur}`);
  const fx0 = await ev(() => StepSeq.assistantEffets());
  ok(fx0.ok && fx0.transitions.length > 0 && Array.isArray(fx0.mouvements), `assistantEffets : ${fx0.transitions.length} transitions (${fx0.erreur || fx0.transitions.map((t) => t.recette).join(', ')})`);
  const tr = await ev(() => StepSeq.assistantTransition({ transition: 1, recette: 'Coupure sèche' }));
  const tr2 = await ev(() => StepSeq.assistantTransition({ transition: 1, effets: { silence: { temps: 2 }, impact: false } }));
  ok(tr.ok && tr.recette === 'Coupure sèche' && tr2.ok && tr2.effets.silence.temps === 2 && !tr2.effets.impact, `assistantTransition : ${tr2.message || tr2.erreur}`);
  const es = await ev((id) => StepSeq.assistantEffetsScene({ scene: id, ajouter: 'effets', role: 'ambiance', couleur: 'claire', niveau: 0.8 }), ch.id);
  ok(es.ok && es.musicienEffets && es.musicienEffets.role === 'ambiance' && es.musicienEffets.couleur === 'claire', `assistantEffetsScene : ${es.message || es.erreur}`);
  const so2 = await ev((id) => StepSeq.assistantStructure({ blocs: [{ scene: id, fois: 2 }] }), ch.id);
  ok(so2.ok && /×2/.test(so2.message), `assistantStructure : ${so2.message || so2.erreur}`);
  const stp = await ev(() => StepSeq.assistantEtape({ etape: 'accords' }));
  ok(stp.ok && (await ev(() => StepSeq.assistantEtat().etape)) === 'chords', `assistantEtape : ${stp.message || stp.erreur}`);
  const blocked = await ev(() => StepSeq.tempo({ bpm: 120 }));
  ok(!blocked.ok && /assistantFermer/.test(blocked.erreur), 'outils de la grille refusés pendant l’assistant');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'claude-assistant.png') });
  const cr = await ev(() => StepSeq.assistantCreer());
  ok(cr.ok && cr.attente && (await ev(() => !document.getElementById('bandConfirm').hidden)), `assistantCreer : grille non vide, confirmation affichée`);
  await page.click('#bcfSong');
  await page.waitForTimeout(800);
  const fin = await ev(() => StepSeq.etat());
  ok(!(await ev(() => SS.band.active())) && fin.tempo === 96 && fin.pistes.some((t) => t.nom === 'Saxo' || /Saxo/.test(t.nom)), `chanson créée : ${fin.tempo} BPM, ${fin.pistes.length} pistes`);

  // import MIDI : la chanson exportée en MIDI, réimportée par Claude (aperçu, puis nouvelle chanson)
  const b64 = await ev(() => btoa(String.fromCharCode(...SS.midi.exportProject(SS.claudeTools._project(), { range: 'song', loops: 1, audibleOnly: true, swing: false, expression: true }).bytes)));
  const ap = await ev((x) => StepSeq.importerMidi({ base64: x, nom: 'essai_claude.mid', apercu: true, batterie: 'LinnDrum' }), b64);
  ok(ap.ok && ap.bilan.pistes.length > 3 && ap.bilan.tempo === 96, `importerMidi aperçu : ${ap.message || ap.erreur}`);
  const im = await ev((x) => StepSeq.importerMidi({ base64: x, nom: 'essai_claude.mid', decoupage: 'compact' }), b64);
  const st2 = await ev(() => StepSeq.etat());
  ok(im.ok && st2.titre === 'essai claude' && st2.pistes.length === im.bilan.pistes.length, `importerMidi : ${im.message || im.erreur}`);
  const bad = await ev(() => StepSeq.importerMidi({ base64: btoa('pas un midi') }));
  ok(!bad.ok && /import impossible/.test(bad.erreur), `fichier invalide refusé : ${bad.erreur}`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'claude-boite-a-outils.png') });
  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
