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

  // erreurs lisibles
  const e1 = await ev(() => StepSeq.ecrireNotes({ piste: 'Guitare fantôme', notes: [] }));
  ok(!e1.ok && /piste inconnue/.test(e1.erreur), `erreur en clair : ${e1.erreur}`);
  const e2 = await ev(() => StepSeq.ecrireAccords({ accords: ['Hm7'] }));
  ok(!e2.ok && e2.erreur, `accord illisible : ${e2.erreur}`);

  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'claude-boite-a-outils.png') });
  ok(!errs.length, 'aucune erreur JavaScript' + (errs.length ? ' : ' + errs.join(' | ') : ''));
  await b.close();
  server.close();
})();
