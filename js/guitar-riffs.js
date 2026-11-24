/*
 * Riffs du Guitariste (jeu « Riffs » de l'assistant « Nouvelle chanson ») : moteur pur, sans DOM ni Web Audio.
 *
 * Un riff est une mesure de 16 doubles-croches écrite en DEGRÉS de l'accord, pas en notes :
 *   R fondamentale, b3 / 3 tierce (3 = celle de l'accord : mineure sur un accord mineur), 4 quarte, 5 quinte,
 *   6 sixte, b7 septième mineure, 8 octave ; plusieurs degrés collés = joués ensemble (R5 = power chord, R6, R58) ;
 *   x = note morte (corde étouffée, sans hauteur) ; « _ » à la fin = palm mute (R5_) ; « . » = silence.
 * La fondamentale de l'accord est posée entre Mi 2 et Ré♯ 3 (cordes graves d'une guitare en accordage standard),
 * une octave plus haut avec oct = 12. Notes fixes (fixed) : le riff garde l'accord du début de la scène.
 * Une note sonne jusqu'à la suivante (au plus une noire) ; étouffée, une double-croche.
 *
 * Réglages (normalize) : mute, swing, energy, human (0..1), fixed (booléen), oct (0 | 12), pat (riff réécrit dans la
 * fenêtre Avancé : 16 jetons séparés par des espaces). Déterministe (tests/guitar-riffs.test.js).
 */
(function (root) {
  const SS = (root.SS = root.SS || {});
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  /** Degrés de l'éditeur, du plus aigu au plus grave (lignes de la fenêtre Avancé), avec leur nom. */
  const DEGREES = [['8', 'octave'], ['b7', 'septième'], ['6', 'sixte'], ['5', 'quinte'], ['4', 'quarte'], ['3', 'tierce'], ['b3', 'tierce mineure'], ['R', 'fondamentale']];
  const SEMI = { R: 0, b3: 3, 4: 5, 5: 7, 6: 9, b7: 10, 8: 12 };
  const isMinor = (type) => /^m(?!aj)|^dim/.test(String(type || ''));
  /** Degrés d'un jeton (« R5_ » → ['R', '5']) ; x → ['x'] ; « . » → []. */
  function parts(tok) {
    const t = String(tok || '').replace(/_$/, '');
    if (!t || t === '.') return [];
    if (t === 'x') return ['x'];
    return t.match(/b3|b7|R|[3-8]/g) || [];
  }
  const validTok = (t) => t === '.' || t === 'x' || (/^(b3|b7|R|[3-8])+_?$/.test(t) && parts(t).join('') === t.replace(/_$/, ''));
  const R = (id, fam, name, pat, desc) => ({ id, fam, name, pat, steps: pat.split(' '), desc });
  /** Riffs : famille quintes (quintes et octaves) ou lignes (une corde à la fois). */
  const RIFFS = [
    R('power', 'quintes', 'Croches en quintes', 'R5 . R5_ . R5_ . R5_ . R5 . R5_ . R5_ . R5_ .', 'Power chords en croches, étouffés entre les temps : le rock qui pousse.'),
    R('octaves', 'quintes', 'Octaves disco', 'R . 8 . R . 8 . R . 8 . R . 8 .', 'Fondamentale et octave en croches : disco, funk, synthwave.'),
    R('tremolo', 'quintes', 'Trémolo', 'R R R R R R R R R R R R 5 5 5 5', 'Doubles-croches sur la fondamentale, la quinte à la fin : tension avant le refrain.'),
    R('boogie', 'lignes', 'Boogie', 'R5 . . R5 R6 . . R6 R5 . . R5 R6 . . R6', 'Quinte et sixte qui alternent : le boogie du rock’n’roll et du blues.'),
    R('marche', 'lignes', 'Marche blues', 'R . 3 . 5 . 6 . b7 . 6 . 5 . 3 .', 'La ligne qui monte et redescend sur l’accord : blues, rock 50s.'),
    R('penta', 'lignes', 'Penta mineure', 'R . . b3 . R . 4 . . 5 . b7 . 5 .', 'Une phrase sur la gamme pentatonique mineure : rock, blues.'),
    R('funk1', 'lignes', 'Une corde funk', 'R . x R . . b7 . 8 . x . 5 . b7 R', 'Notes courtes et notes mortes sur une corde : la guitare funk.'),
    R('dub', 'lignes', 'Doublure de basse', 'R_ . . . . . R_ . 5_ . . . 3_ . R_ .', 'La guitare double la basse, étouffée : reggae, dub.'),
    // riffs par style (nov. 2026, PR 3 du Guitariste)
    R('funkoct', 'quintes', 'Octaves funk', 'R . x 8 . x R . x 8 x . R 8 x .', 'Fondamentale et octave hachées de notes mortes : funk.'),
    R('tenues', 'quintes', 'Notes tenues', 'R . . . 5 . . . 8 . . . 5 . . .', 'Une note par temps qui sonne : ballade, synthwave, intro.'),
    R('poprock', 'quintes', 'Pop-rock syncopé', 'R5 . . R5 . . R5 . R5 . . R5 . . R6 .', 'Power chords en 3-3-2 : le riff de couplet pop-rock.'),
    R('folkline', 'lignes', 'Basse folk', 'R . 5 . 8 . 5 . 3 . 5 . 8 . 5 .', 'Une ligne qui monte et redescend dans l’accord : folk, ballade.'),
    R('bossaline', 'lignes', 'Ligne bossa', 'R . . 5 . . R . . 5 . 8 . 5 . .', 'Fondamentale et quinte en rythme de bossa : bossa nova, samba.'),
    R('ska', 'lignes', 'Marche ska', 'R_ . 3_ . 5_ . 3_ . R_ . 3_ . 5_ . 6_ .', 'Croches étouffées qui marchent dans l’accord : ska, reggae.'),
  ];
  const FAMILIES = [['quintes', 'Quintes et octaves'], ['lignes', 'Lignes']];
  const STYLES = { power: ['rock', 'pop', 'synth'], octaves: ['funk', 'pop', 'synth'], tremolo: ['synth', 'rock'], boogie: ['blues', 'rock'], marche: ['blues', 'rock'], penta: ['rock', 'blues'], funk1: ['funk'], dub: ['reggae'], funkoct: ['funk'], tenues: ['ballade', 'synth', 'folk', 'bossa'], poprock: ['pop', 'rock'], folkline: ['folk', 'ballade'], bossaline: ['bossa'], ska: ['reggae'] };
  const DEFAULTS = { mute: 0, swing: 0, energy: 0.55, human: 0.4, fixed: false, oct: 0 };
  const byId = (id) => RIFFS.find((r) => r.id === id) || null;

  /** Réglages d'un riff, bornés ; pat gardé s'il a 16 jetons valides. */
  function normalize(r) {
    r = r && typeof r === 'object' ? r : {};
    const o = { ...DEFAULTS };
    for (const k of ['mute', 'swing', 'energy', 'human']) o[k] = clamp(num(+r[k], DEFAULTS[k]), 0, 1);
    o.fixed = !!r.fixed;
    o.oct = r.oct === 12 ? 12 : 0;
    if (typeof r.pat === 'string') {
      const t = r.pat.trim().split(/\s+/);
      if (t.length === 16 && t.every(validTok)) o.pat = t.join(' ');
    }
    return o;
  }
  /** Les 16 jetons joués : le riff réécrit, sinon celui du catalogue. */
  const stepsOf = (id, r) => (r && r.pat ? r.pat.split(' ') : (byId(id) || RIFFS[0]).steps);

  // hachage entier → [0, 1) : main humaine reproductible
  function rnd(...xs) {
    let h = 0x9e3779b9;
    for (const v of xs) {
      h = Math.imul(h ^ (v | 0), 0x85ebca6b);
      h ^= h >>> 13;
      h = Math.imul(h, 0xc2b2ae35);
      h ^= h >>> 16;
    }
    return (h >>> 0) / 4294967296;
  }
  /** Fondamentale MIDI d'un accord : entre Mi 2 (40) et Ré♯ 3, + oct. */
  const rootMidi = (pc, oct) => 40 + ((((pc - 4) % 12) + 12) % 12) + oct;
  /** Notes d'un jeton sur un accord { rootPc, type } : [midi…] (note morte : la quinte, jouée très courte). */
  function notesOf(tok, chord, oct = 0) {
    const p = parts(tok);
    const r0 = rootMidi(chord.rootPc, oct);
    if (p[0] === 'x') return [r0 + 7];
    return p.map((d) => r0 + (d === '3' ? (isMinor(chord.type) ? 3 : 4) : SEMI[d]));
  }

  /**
   * Notes d'une scène : spans = [{ step, len, chord: { rootPc, type } }] en doubles-croches (16 par mesure) ;
   * renvoie [{ step, len, notes, vel, shift? }] (shift : décalage fin en pas, swing et main humaine).
   */
  function events(spans, id, r0, total, seed = 0) {
    const r = normalize(r0);
    const st = stepsOf(id, r);
    const first = spans[0] && spans[0].chord;
    const out = [];
    const chordAt = (s) => (spans.find((x) => s >= x.step && s < x.step + x.len) || spans[spans.length - 1] || {}).chord;
    const force = 0.7 + r.energy * 0.5;
    for (let s = 0; s < total; s++) {
      const tok = st[s % 16];
      if (!tok || tok === '.') continue;
      const chord = r.fixed && first ? first : chordAt(s);
      if (!chord) continue;
      const dead = parts(tok)[0] === 'x';
      const pm = dead || tok.endsWith('_') || r.mute >= 0.7;
      // durée : jusqu'à la note suivante (au plus une noire) ; étouffé : une double-croche
      let next = 1;
      while (next < 4 && s + next < total && (!st[(s + next) % 16] || st[(s + next) % 16] === '.')) next++;
      const open = Math.max(1, Math.round(next * (1 - r.mute * 0.6)));
      const len = Math.min(total - s, pm ? 1 : open);
      const beat = s % 4 === 0 ? 1.1 : s % 2 === 0 ? 1 : 0.9;
      let vel = (dead ? 0.35 : pm ? 0.7 : 0.8) * force * beat;
      let shift = s % 4 === 2 ? r.swing * 0.66 : 0; // swing : la croche du contretemps retarde
      if (r.human > 0) {
        vel *= 1 + (rnd(seed, s, 1) * 2 - 1) * 0.12 * r.human;
        if (s % 4 !== 0) shift += (rnd(seed, s, 2) * 2 - 1) * 0.12 * r.human;
      }
      const e = { step: s, len, notes: notesOf(tok, chord, r.oct), vel: Math.round(clamp(vel, 0.05, 1) * 1000) / 1000 };
      if (Math.abs(shift) > 0.01) e.shift = Math.round(shift * 100) / 100;
      out.push(e);
    }
    return out;
  }

  SS.GuitarRiffs = { RIFFS, FAMILIES, STYLES, DEGREES, DEFAULTS, normalize, stepsOf, parts, validTok, notesOf, events, byId, isMinor };
})(typeof window !== 'undefined' ? window : globalThis);
