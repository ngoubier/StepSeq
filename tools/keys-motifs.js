#!/usr/bin/env node
/*
 * Génère js/keys-motifs.js (SS.KEYS_MOTIFS) à partir du fichier de Nicolas « Piano et claviers d'accompagnement par
 * style — 150 motifs » (docs/reference/clavier-150-motifs.md) : pour chaque motif, son numéro, son style (la famille du
 * fichier), son titre, son son, son émotion, son conseil de jeu, son tempo, sa mesure, ses accords et ses parties
 * (MG, MD, Pad, Pluck…) en notes : [pas (double-croche, décimal pour les triolets et le swing), MIDI, durée en pas, vélocité].
 *   node tools/keys-motifs.js
 * Ne pas éditer js/keys-motifs.js à la main : corriger le fichier .md ou ce script, puis régénérer.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'docs/reference/clavier-150-motifs.md');
const OUT = path.join(ROOT, 'js/keys-motifs.js');

const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** Accord en symbole international (Am7, Bbmaj7, Gsus4/G, D/F#, A7(b9,b13)) : [fondamentale, gamme, symbole, basse]. */
function chord(sym) {
  const s = sym.trim();
  const m = /^([A-G])([b#]?)([^/]*)(?:\/([A-G])([b#]?))?$/.exec(s);
  if (!m) throw new Error('accord inconnu : ' + sym);
  const pc = (l, a) => (LETTER[l] + (a === 'b' ? -1 : a === '#' ? 1 : 0) + 12) % 12;
  const q = m[3];
  const sc = /^m(?!aj)/.test(q) ? (/^m(7|9|11)/.test(q) ? 'dor' : 'aeo') : /^(dim|ø)/.test(q) ? 'loc' : /^(7|9|11|13)/.test(q) ? 'mix' : 'ion';
  const root = pc(m[1], m[2]);
  return [root, sc, s, m[4] ? pc(m[4], m[5]) : root];
}
/** Mesure du fichier → pas par temps, temps par mesure (le 2/4 se range en 4/4 : deux mesures de 2/4 = une de 4/4). */
const METER = { '4/4': [4, 4], '2/4': [4, 2], '3/4': [4, 3], '6/8': [6, 2], '12/8': [6, 4] };
const num = (s) => Number(String(s).replace(',', '.'));

/** Attaque « 2& » → pas depuis le début de la mesure. */
function stepOf(tok, meter, feel) {
  const m = /^(\d+)(e|&|a|t|u)?$/.exec(tok);
  if (!m) throw new Error('attaque inconnue : ' + tok);
  const [bs] = METER[meter];
  const sub = m[2] || '';
  const frac = { '': 0, e: 0.25, '&': feel === 'swing' ? 2 / 3 : 0.5, a: 0.75, t: 1 / 3, u: 2 / 3 }[sub];
  return (+m[1] - 1 + frac) * bs;
}
/** Notes d'un groupe : « Do2 (36) + Sol2 (43) » → [36, 43]. */
const notesOf = (s) => [...s.matchAll(/\((\d+)\)/g)].map((x) => +x[1]);
/** Groupes d'une cellule : « **A** Do2 (36)<br>**B** … » → { A: [36], B: […] }. */
function groupsOf(cell) {
  const g = {};
  for (const part of cell.split('<br>')) {
    const m = /\*\*([A-Z])\*\*\s*(.+)$/.exec(part.trim());
    if (m) g[m[1]] = notesOf(m[2]);
  }
  return g;
}
/** Attaques d'une cellule : « `1 A/0,48/65` · … » → [[pas, groupe, durée en pas, vélocité]]. */
function attacksOf(cell, meter, feel) {
  const [bs] = METER[meter];
  return [...cell.matchAll(/`([^`]+)`/g)].map((x) => {
    const m = /^(\S+) ([A-Z])\/([\d,]+)\/(\d+)$/.exec(x[1].trim());
    if (!m) throw new Error('attaque illisible : ' + x[1]);
    return [stepOf(m[1], meter, feel), m[2], num(m[3]) * bs, +m[4]];
  });
}
/** Accords répartis sur les mesures : un par mesure, deux sur une mesure (le second à la moitié), trois sur deux (1, 2, 2 au milieu). */
function chordsAt(list, bars, spbar) {
  const cs = list.map(chord);
  let at;
  if (cs.length === bars) at = cs.map((_, i) => i * spbar);
  else if (cs.length === 1) at = [0];
  else if (cs.length === 2 && bars === 1) at = [0, spbar / 2];
  else if (cs.length === 3 && bars === 2) at = [0, spbar, spbar * 1.5];
  else at = cs.map((_, i) => Math.round((i * bars * spbar) / cs.length));
  return cs.map((c, i) => [at[i], ...c]);
}

const lines = fs.readFileSync(SRC, 'utf8').split('\n');
const cells = (l) => l.split('|').slice(1, -1).map((x) => x.trim());
const out = [];
let section = null; // famille du fichier (titre « ## »)
let study = null; // étude (motifs 51 à 150) : { work, style, meter, feel, tempo, son, chords }
let cur = null;
let groups = {}; // motifs 1 à 50 : groupes de chaque partie
const head = (meterTxt) => {
  const m = /^(\d+\/\d+)(?: (swing|triolet))?$/.exec(meterTxt.trim());
  if (!m || !METER[m[1]]) throw new Error('mesure inconnue : ' + meterTxt);
  return [m[1], m[2] || ''];
};
for (const l of lines) {
  let m;
  if ((m = /^## (.+)$/.exec(l))) {
    section = m[1].trim();
    cur = null;
    continue;
  }
  // motifs 1 à 50
  if ((m = /^### (\d+)\. (.+)$/.exec(l))) {
    cur = { n: +m[1], section, title: m[2].trim(), parts: {} };
    groups = {};
    out.push(cur);
    continue;
  }
  if ((m = /^#### (.+)$/.exec(l)) && !/^\d/.test(m[1])) {
    study = { work: m[1].trim() };
    cur = null;
    continue;
  }
  if (study && (m = /^\*\*([^*]+?) · (\d+\/\d+(?: swing| triolet)?) · (\d+) BPM · ([^*]+)\*\*\s*$/.exec(l))) {
    const [meter, feel] = head(m[2]);
    Object.assign(study, { style: m[1].trim(), meter, feel, tempo: +m[3], son: m[4].trim() });
    continue;
  }
  if (study && (m = /^\*\*Harmonie des exercices\*\* — (.+)$/.exec(l))) {
    study.chordList = [...m[1].matchAll(/mesure \d \*\*([^*]+)\*\*/g)].map((x) => x[1]);
    continue;
  }
  if ((m = /^##### (\d+)\. (.+)$/.exec(l))) {
    if (!study || !study.meter || !study.chordList) throw new Error('étude incomplète avant le motif ' + m[1]);
    cur = { n: +m[1], section, work: study.work, style: study.style, title: m[2].trim(), son: study.son, tempo: study.tempo, meter: study.meter, feel: study.feel, chordList: study.chordList, bars: study.chordList.length, parts: {} };
    out.push(cur);
    continue;
  }
  if (!cur) continue;
  if ((m = /^\*\*(\d+) BPM · (\d+\/\d+(?: swing| triolet)?) · (\d+) mesures? · (.+)\*\*\s*$/.exec(l))) {
    const [meter, feel] = head(m[2]);
    Object.assign(cur, { tempo: +m[1], meter, feel, bars: +m[3], chordList: m[4].split(' – ') });
    continue;
  }
  if ((m = /^\*\*Son\*\* — (.+?)\.?\s*$/.exec(l))) cur.son = m[1].trim();
  else if ((m = /^\*\*Émotion visée\*\* — (.+?)\.?\s*$/.exec(l))) cur.emo = m[1].trim();
  else if ((m = /^\*\*Jeu\*\* — (.+?)\s*$/.exec(l))) cur.text = m[1].trim();
  else if (l.startsWith('| ') && !/^\| (Partie|Mesure) \|/.test(l) && !/^\|---/.test(l)) {
    const c = cells(l);
    if (c.length === 4 && !/^\d+$/.test(c[0])) groups[c[0]] = groupsOf(c[3]); // motifs 1 à 50 : groupes d'une partie
    else if (c.length === 3 && /^\d+$/.test(c[0])) addAttacks(cur, +c[0], c[1], groups[c[1]], c[2]);
    else if (c.length === 6 && /^\d+$/.test(c[0])) addAttacks(cur, +c[0], c[1], groupsOf(c[4]), c[5]); // études : groupes par ligne
  }
}
function addAttacks(mo, bar, part, g, cell) {
  if (!g) throw new Error(`motif ${mo.n} : groupes de « ${part} » introuvables`);
  const [bs, beats] = METER[mo.meter];
  const off = (bar - 1) * bs * beats;
  const list = (mo.parts[part] = mo.parts[part] || []);
  for (const [st, grp, len, vel] of attacksOf(cell, mo.meter, mo.feel)) {
    if (!g[grp]) throw new Error(`motif ${mo.n} : groupe ${grp} inconnu (${part}, mesure ${bar})`);
    for (const n of g[grp]) list.push([+(off + st).toFixed(3), n, +len.toFixed(3), vel]);
  }
}

// mise en forme : mesure du moteur (le 2/4 devient du 4/4), pas par mesure, accords
const res = out.map((mo) => {
  const [bs, beats] = METER[mo.meter];
  let spbar = bs * beats;
  let bars = mo.bars;
  let meter = mo.meter;
  const chords = chordsAt(mo.chordList, mo.bars, spbar);
  if (meter === '2/4') {
    meter = '4/4';
    bars = Math.ceil((bars * spbar) / 16);
    spbar = 16;
  }
  for (const p of Object.values(mo.parts)) p.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return { n: mo.n, section: mo.section, style: mo.style || null, work: mo.work || null, title: mo.title, son: mo.son, emo: mo.emo, text: mo.text, tempo: mo.tempo, sig: mo.meter, meter, feel: mo.feel, bars, spb: spbar, chords, parts: mo.parts };
});
if (res.length !== 150) throw new Error(`${res.length} motifs lus au lieu de 150`);
res.forEach((x, i) => {
  if (x.n !== i + 1) throw new Error('numérotation : ' + x.n);
  if (!x.tempo || !x.chords.length || !Object.keys(x.parts).length || !x.text || !x.emo || !x.son) throw new Error('motif incomplet : ' + x.n);
});

const body = res.map((x) => '  ' + JSON.stringify(x)).join(',\n');
fs.writeFileSync(
  OUT,
  `/*
 * Les 150 motifs du fichier « Piano et claviers d'accompagnement par style — 150 motifs »
 * (docs/reference/clavier-150-motifs.md), joués par le musicien Clavier (js/keyboardist.js, modes « kf:NN »).
 * FICHIER GÉNÉRÉ par tools/keys-motifs.js : ne pas l'éditer à la main.
 *   { n, section, style, work, title, son, emo, text, tempo, sig (mesure du fichier), meter (du moteur : 2/4 → 4/4), feel, bars, spb,
 *     chords: [[pas, fondamentale, gamme, symbole, basse]],
 *     parts: { MG | MD | Pad | Pluck… : [[pas (décimal : triolets, swing), MIDI, durée en pas, vélocité]] } }
 */
window.SS = window.SS || {};
SS.KEYS_MOTIFS = [
${body},
];
`
);
console.log(`${res.length} motifs → ${path.relative(ROOT, OUT)}`);
