#!/usr/bin/env node
/*
 * Génère js/horns-motifs.js (SS.HORN_MOTIFS) à partir du fichier de Nicolas « 50 motifs pour sections de cuivres et
 * saxophones » (docs/reference/cuivres-50-motifs.md) : pour chaque motif, sa formation, son titre, son conseil, son tempo,
 * ses mesures, ses accords et la partie de chaque instrument ([position en temps, MIDI, durée en temps, vélocité, articulation]).
 *   node tools/horns-motifs.js
 * Ne pas éditer js/horns-motifs.js à la main : corriger le fichier .md ou ce script, puis régénérer.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'docs/reference/cuivres-50-motifs.md');
const OUT = path.join(ROOT, 'js/horns-motifs.js');

const FORM = { 'Big band': 'bigband', 'Soul': 'soul', 'Funk': 'funk', 'Disco-funk': 'disco', 'Salsa': 'salsa', 'Ska': 'ska', 'Rock': 'rock', 'Cinématique': 'film', 'La Nouvelle-Orléans': 'nola', 'Brass band': 'brit' };
const PC = { Do: 0, Ré: 2, Mi: 4, Fa: 5, Sol: 7, La: 9, Si: 11 };
/** Accord en notation française (Sib6, Lam7, Dom, Ré7, Mib) : [classe de la fondamentale, gamme, symbole]. */
function chord(sym) {
  const m = /^(Do|Ré|Mi|Fa|Sol|La|Si)([b♭#♯]?)(.*)$/.exec(sym.trim());
  if (!m) throw new Error('accord inconnu : ' + sym);
  const pc = (PC[m[1]] + (/[b♭]/.test(m[2]) ? -1 : /[#♯]/.test(m[2]) ? 1 : 0) + 12) % 12;
  const q = m[3];
  const sc = /^m7/.test(q) ? 'dor' : /^m/.test(q) ? 'aeo' : /^(7|9)/.test(q) ? 'mix' : 'ion';
  return [pc, sc, sym.trim()];
}
const FRAC = { '¼': 0.25, '½': 0.5, '¾': 0.75 };
const dur = (s) => {
  const m = /^(\d*)([¼½¾]?)$/.exec(s.trim());
  if (!m) throw new Error('durée inconnue : ' + s);
  return (m[1] ? +m[1] : 0) + (m[2] ? FRAC[m[2]] : 0);
};
const SUB = { '': 0, e: 0.25, '&': 0.5, a: 0.75 };
const pos = (s) => {
  const m = /^(\d)\.(\d)(e|&|a)?$/.exec(s.trim().replace(/`/g, ''));
  if (!m) throw new Error('attaque inconnue : ' + s);
  return (m[1] - 1) * 4 + (m[2] - 1) + SUB[m[3] || ''];
};

const lines = fs.readFileSync(SRC, 'utf8').split('\n');
const out = [];
let form = null;
let cur = null;
for (const l of lines) {
  let m;
  if ((m = /^## (.+)$/.exec(l))) {
    const k = Object.keys(FORM).find((x) => m[1].startsWith(x));
    form = k ? FORM[k] : null;
    continue;
  }
  if ((m = /^### (\d+)\. (.+)$/.exec(l)) && form) {
    cur = { n: +m[1], form, title: m[2].trim(), text: '', tempo: 0, bars: 1, chords: [], parts: {} };
    out.push(cur);
    continue;
  }
  if (!cur) continue;
  if ((m = /^\*\*(\d+) BPM · (.+) · (\d) mesures?\*\*$/.exec(l))) {
    cur.tempo = +m[1];
    cur.bars = +m[3];
    const cs = m[2].split('→').map(chord);
    // deux accords sur une mesure : le second au temps 3 ; sur deux mesures : un par mesure
    cur.chords = cs.map((c, i) => [i * ((cur.bars * 4) / cs.length), ...c]);
    continue;
  }
  if (!cur.text && l.trim() && !l.startsWith('|') && !l.startsWith('**') && !l.startsWith('#')) {
    cur.text = l.trim().replace(/\.$/, '');
    continue;
  }
  if (l.startsWith('| ') && !/^\| Instrument/.test(l)) {
    const c = l.split('|').slice(1, -1).map((x) => x.trim());
    const at = c[1].split(',').map(pos);
    const notes = [...c[2].matchAll(/\((\d+)\)/g)].map((x) => +x[1]);
    const ds = c[3].split(',').map(dur);
    const vs = c[4].split(',').map((x) => +x.trim());
    const ar = c[5].split(',').map((x) => x.trim());
    if (![notes, ds, vs, ar].every((a) => a.length === at.length)) throw new Error(`motif ${cur.n} ${c[0]} : colonnes de longueurs différentes`);
    cur.parts[c[0]] = at.map((o, i) => [o, notes[i], ds[i], vs[i], ar[i]]);
  }
}
if (out.length !== 50) throw new Error(`${out.length} motifs lus au lieu de 50`);
out.forEach((x) => {
  if (!x.tempo || !x.chords.length || !Object.keys(x.parts).length || !x.text) throw new Error('motif incomplet : ' + x.n);
});

const body = out.map((x) => '  ' + JSON.stringify(x)).join(',\n');
fs.writeFileSync(
  OUT,
  `/*
 * Les 50 motifs du fichier « 50 motifs pour sections de cuivres et saxophones » (docs/reference/cuivres-50-motifs.md),
 * cinq par formation de js/horns.js. FICHIER GÉNÉRÉ par tools/horns-motifs.js : ne pas l'éditer à la main.
 *   { n, form, title, text, tempo, bars, chords: [[temps, fondamentale, gamme, symbole]],
 *     parts: { instrument: [[position en temps, MIDI, durée en temps, vélocité, articulation D | A | M | T]] } }
 */
window.SS = window.SS || {};
SS.HORN_MOTIFS = [
${body},
];
`
);
console.log(`${out.length} motifs → ${path.relative(ROOT, OUT)}`);
