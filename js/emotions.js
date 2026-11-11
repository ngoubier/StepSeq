/*
 * Intentions émotionnelles : la matrice du skill « musicemotion » (.claude/skills/musicemotion),
 * avec pour chaque intention trois pistes contrastées (évidence, nuance, surprise).
 *
 * Ce sont des HYPOTHÈSES STYLISTIQUES à écouter et comparer, pas des recettes : aucune suite d'accords
 * n'encode une émotion universellement (voir references/sources.md du skill).
 *
 * dims : valence, activation, tension (0–100), repères subjectifs de conception.
 * seq  : [degré 0–6, type d'accord, altération de la fondamentale (−1 = ♭)] ; degrés comptés dans la gamme
 *        majeure ou mineure naturelle (tonalités) ou dans le mode lui-même (dorien, phrygien…).
 * why / caveat : textes ; les noms de notes y sont des repères remplacés d'après les accords transposés
 *        (SS.fillEmotionText) : {cI} nom de l'accord n° I de seq, {nI} ses notes, {cI.J} sa note n° J
 *        (0 fondamentale, 1 tierce…), {t} tonique ; préfixe F = nom français ({Fc1.1} → « Si »).
 * melody : couche « Mélodie » conseillée (js/harmony.js, GENERATORS) ; ab : essais A/B conseillés (TRANSFORMS).
 */
window.SS = window.SS || {};

SS.EMOTIONS = [
  {
    id: 'joie', label: 'Joie simple', dims: [85, 60, 20],
    harmony: 'Majeur, I–IV–V–I, add9', melody: 'Ascendante, répétitive', texture: 'Pulsation claire, timbres lumineux',
    risk: 'Majeur ne garantit pas la joie : le tempo, le rythme et la mélodie comptent autant.',
    melodyGen: 'mel-up', ab: ['mode', 'sus2'],
    proposals: [
      { kind: 'evidence', mode: 'major', tonic: 'C', tempo: 120, seq: [[0, 'maj'], [3, 'maj'], [4, 'maj'], [0, 'maj']], why: 'Cadence parfaite simple : départ, préparation, tension, retour au repos, très lisible.', caveat: 'Peut sonner enfantin ou scolaire sans groove ni timbre travaillé.' },
      { kind: 'nuance', mode: 'major', tonic: 'C', tempo: 116, seq: [[0, 'add9'], [5, 'min'], [3, 'add9'], [4, 'maj']], why: 'La neuvième ajoutée éclaircit les accords ; vi apporte un léger contraste avant le retour.', caveat: 'Trop d’add9 brouille la basse : garder les voicings aérés.' },
      { kind: 'surprise', mode: 'major', tonic: 'C', tempo: 120, seq: [[0, 'maj'], [3, 'maj'], [3, 'min'], [0, 'maj']], why: 'Le iv mineur emprunté (une seule note change) jette une ombre brève, et le retour au I paraît plus lumineux.', caveat: 'L’ombre peut l’emporter si la mélodie insiste dessus.' },
    ],
  },
  {
    id: 'euphorie', label: 'Euphorie', dims: [90, 90, 40],
    harmony: 'I–V–vi–IV, mixolydien selon le style', melody: 'Registre haut, séquences ascendantes', texture: 'Densité et accents croissants',
    risk: 'Trop d’intensité sans contraste fatigue : prévoir des respirations.',
    melodyGen: 'mel-up', ab: ['open', 'seventh'],
    proposals: [
      { kind: 'evidence', mode: 'major', tonic: 'C', tempo: 128, seq: [[0, 'maj'], [4, 'maj'], [5, 'min'], [3, 'maj']], why: 'La boucle pop par excellence : énergie continue, aucun accord ne retient longtemps.', caveat: 'Très entendue : la différence se fait sur le son, le groove et la mélodie.' },
      { kind: 'nuance', mode: 'mixolydian', tonic: 'G', tempo: 126, seq: [[0, 'maj'], [6, 'maj'], [3, 'maj'], [0, 'maj']], why: 'Mixolydien : le VII majeur (septième mineure) donne une couleur festive, moins « résolue » qu’une dominante.', caveat: 'Le mode ne s’entend que si la mélodie appuie la septième mineure.' },
      { kind: 'surprise', mode: 'major', tonic: 'C', tempo: 128, seq: [[0, 'maj'], [5, 'maj', -1], [6, 'maj', -1], [0, 'maj']], why: '♭VI – ♭VII – I (emprunts au mineur) : une montée « épique » qui arrive sur la tonique par un chemin inattendu.', caveat: 'Effet de cliché si répété à chaque phrase.' },
    ],
  },
  {
    id: 'tristesse', label: 'Tristesse', dims: [20, 25, 40],
    harmony: 'Mineur naturel, i–VI–III–VII', melody: 'Descente, silences, ambitus réduit', texture: 'Douce, tempo souvent lent',
    risk: 'Le mineur n’est pas toujours triste : un tempo vif le rend énergique.',
    melodyGen: 'mel-down', ab: ['mode', 'seventh'],
    proposals: [
      { kind: 'evidence', mode: 'minor', tonic: 'A', tempo: 72, seq: [[0, 'min'], [5, 'maj'], [2, 'maj'], [6, 'maj']], why: 'Boucle mineure naturelle, sans sensible : pas de résolution forte, un sentiment qui tourne en rond.', caveat: 'Avec batterie rapide, elle devient synthwave énergique plutôt que triste.' },
      { kind: 'nuance', mode: 'minor', tonic: 'A', tempo: 70, seq: [[0, 'm7'], [5, 'maj7'], [3, 'm7'], [0, 'm7']], why: 'Les septièmes adoucissent les contours ; iv m7 → i m7 garde une résignation calme.', caveat: 'Les septièmes peuvent tirer vers le jazz ou le lounge selon les timbres.' },
      { kind: 'surprise', mode: 'minor', tonic: 'A', tempo: 70, seq: [[0, 'min'], [3, 'min'], [4, '7'], [5, 'maj']], why: 'V7 annonce le retour sur i… et la cadence est évitée vers VI : l’attente reste ouverte.', caveat: 'Si la mélodie résout quand même sur la tonique, l’effet disparaît.' },
    ],
  },
  {
    id: 'nostalgie', label: 'Nostalgie', dims: [45, 45, 30],
    harmony: 'Maj7, m7, add9, emprunts modaux', melody: 'Phrases récurrentes légèrement variées', texture: 'Chorus, pad chaud, arpège discret',
    risk: 'Les extensions ne suffisent pas seules : la répétition variée du motif fait beaucoup.',
    melodyGen: 'mel-sketch', ab: ['seventh', 'pedal'],
    proposals: [
      { kind: 'evidence', mode: 'minor', tonic: 'A', tempo: 96, seq: [[0, 'min'], [5, 'maj7'], [2, 'maj'], [6, 'maj']], why: 'La grille synthwave de l’exemple du skill : {c1} garde {n0} de l’accord précédent, comme un souvenir qui persiste.', caveat: 'Nostalgie « années 80 » : un codage de genre, pas une émotion universelle.' },
      { kind: 'nuance', mode: 'major', tonic: 'C', tempo: 98, seq: [[0, 'maj7'], [5, 'm7'], [1, 'm7'], [3, 'maj7']], why: 'Tout en septièmes, en majeur : douceur un peu voilée, sans tension forte.', caveat: 'Peut paraître trop « confortable » : varier la mélodie.' },
      { kind: 'surprise', mode: 'major', tonic: 'C', tempo: 96, seq: [[0, 'maj'], [2, 'min'], [3, 'maj'], [3, 'min']], why: 'IV → iv : la tierce de l’accord de sous-dominante descend d’un demi-ton, comme un souvenir qui se voile.', caveat: 'L’emprunt doit rester bref pour garder la lumière du majeur.' },
    ],
  },
  {
    id: 'melancolie', label: 'Mélancolie lumineuse', dims: [45, 40, 30],
    harmony: 'Dorien, m7, IV majeur en mineur dorien', melody: 'Appuyer la note caractéristique du mode (sixte majeure)', texture: 'Groove souple',
    risk: 'Le dorien n’implique aucune émotion fixe : c’est une couleur à faire entendre.',
    melodyGen: 'mel-sketch', ab: ['seventh', 'open'],
    proposals: [
      { kind: 'evidence', mode: 'dorian', tonic: 'D', tempo: 90, seq: [[0, 'm7'], [3, 'maj'], [0, 'm7'], [3, 'maj']], why: '{c0} → {c1} : le {Fc1.1} de {c1} est la sixte majeure du dorien, la touche de lumière dans le mineur (exemple 3 du skill).', caveat: 'Deux accords seulement : la mélodie et le groove portent la variété.' },
      { kind: 'nuance', mode: 'dorian', tonic: 'D', tempo: 92, seq: [[0, 'm7'], [3, 'maj'], [6, 'maj'], [0, 'm7']], why: 'VII majeur ({c2}) avant le retour : mouvement plus large, la couleur modale reste présente par le IV.', caveat: 'Le VII peut faire entendre {Fc2.0} majeur si la basse insiste dessus.' },
      { kind: 'surprise', mode: 'dorian', tonic: 'D', tempo: 88, seq: [[0, 'm9'], [3, 'maj'], [6, 'maj'], [3, 'sus4']], why: 'i m9 ouvre le son ; le IV sus4 final retarde la tierce et laisse la phrase en suspens.', caveat: 'Le m9 est dense : l’aérer (voix du milieu plus haut).' },
    ],
  },
  {
    id: 'espoir', label: 'Espoir', dims: [65, 55, 35],
    harmony: 'Départ mineur → zone majeure, IV–V–vi', melody: 'Montée de registre, ouverture', texture: 'Crescendo, ajout de couches',
    risk: 'La seule montée ne suffit pas : préparer un point de départ plus sombre ou plus calme.',
    melodyGen: 'mel-up', ab: ['avoid', 'open'],
    proposals: [
      { kind: 'evidence', mode: 'major', tonic: 'C', tempo: 100, seq: [[5, 'min'], [3, 'maj'], [0, 'maj'], [4, 'maj']], why: 'vi – IV – I – V : la boucle part du relatif mineur et s’élève vers le majeur, centre volontairement ambigu.', caveat: 'Le centre perçu dépend de la mélodie : terminer les phrases sur {Ft} pour la lumière.' },
      { kind: 'nuance', mode: 'major', tonic: 'C', tempo: 104, seq: [[3, 'maj'], [4, 'maj'], [5, 'min'], [0, 'add9']], why: 'IV – V – vi : la cadence est d’abord évitée (vi), puis la tonique arrive, ouverte par la neuvième.', caveat: 'L’effet dépend du placement : la tonique doit tomber sur un temps fort de la phrase.' },
      { kind: 'surprise', mode: 'minor', tonic: 'A', tempo: 100, seq: [[0, 'min'], [5, 'maj'], [6, 'maj'], [0, 'maj']], why: 'Tierce picarde : la boucle mineure se termine sur un {Fc3.0} MAJEUR ({Fc3.1}), une éclaircie à la dernière mesure.', caveat: 'Le retour au mineur en début de boucle peut annuler l’effet : l’utiliser en fin de section.' },
    ],
  },
  {
    id: 'suspense', label: 'Suspense', dims: [40, 50, 85],
    harmony: 'Dominante prolongée, sus4, pédale', melody: 'Notes tenues instables, peu de résolution', texture: 'Ostinato, silences',
    risk: 'Épuiser la tension trop tôt : garder une réserve pour la montée.',
    melodyGen: 'mel-sketch', ab: ['pedal', 'avoid'],
    proposals: [
      { kind: 'evidence', mode: 'minor', tonic: 'A', tempo: 90, seq: [[0, 'min'], [0, 'min'], [4, 'sus4'], [4, '7']], why: 'Deux mesures de tonique, puis la dominante prolongée (sus4 puis {c3}) : l’attente de la résolution s’installe.', caveat: 'Si la boucle repart sur i, la tension se résout à chaque tour : prolonger {c3} dans la section suivante.' },
      { kind: 'nuance', mode: 'minor', tonic: 'A', tempo: 88, seq: [[0, 'sus2'], [5, 'maj'], [3, 'min'], [4, 'sus4']], why: 'La tierce absente du premier accord laisse la couleur indécise ; la fin sus4 ne résout pas.', caveat: 'Avec une basse en pédale (essai A/B), la tension monte encore.' },
      { kind: 'surprise', mode: 'minor', tonic: 'A', tempo: 92, seq: [[0, 'min'], [5, 'maj'], [4, 'sus4'], [5, 'maj']], why: 'La dominante sus4 ne mène pas à i mais revient à VI : l’attente est déplacée, pas satisfaite.', caveat: 'Ambigu sans indice rythmique de fin de phrase.' },
    ],
  },
  {
    id: 'angoisse', label: 'Angoisse', dims: [15, 70, 90],
    harmony: 'Chromatisme, ♭II, accords diminués, clusters mesurés', melody: 'Seconde mineure, fragments courts', texture: 'Pulsation irrégulière ou drone',
    risk: 'Une dissonance excessive et uniforme lasse : doser et faire respirer.',
    melodyGen: 'mel-down', ab: ['pedal', 'open'],
    proposals: [
      { kind: 'evidence', mode: 'phrygian', tonic: 'E', tempo: 110, seq: [[0, 'min'], [1, 'maj'], [0, 'min'], [1, 'maj']], why: 'Phrygien : {Fc0.0} → {Fc1.0}, un demi-ton au-dessus de la tonique, oppressant et obstiné.', caveat: 'Très typé (metal, thriller) : jouer sur le timbre pour éviter le cliché.' },
      { kind: 'nuance', mode: 'minor', tonic: 'A', tempo: 100, seq: [[0, 'min'], [6, 'dim', 1], [0, 'min'], [1, 'maj', -1]], why: '{c1} (sensible, mineur harmonique) et {c3} (♭II napolitain) encerclent {Ft} par demi-tons.', caveat: 'Deux chromatismes rapprochés : vérifier que la basse reste lisible.' },
      { kind: 'surprise', mode: 'minor', tonic: 'A', tempo: 104, seq: [[0, 'min'], [3, 'min'], [1, 'maj', -1], [4, '7']], why: 'iv → ♭II → V7 : une préparation qui se dérobe (♭II) avant une dominante tendue, sans retour à la tonique.', caveat: 'Placer la résolution (ou son absence) au début de la section suivante.' },
    ],
  },
  {
    id: 'mystere', label: 'Mystère', dims: [45, 30, 60],
    harmony: 'Sus2 / sus4, modalité, voicings ouverts', melody: 'Phrases incomplètes', texture: 'Réverbération, espace spectral',
    risk: 'Trop de réverbération brouille l’harmonie.',
    melodyGen: 'mel-sketch', ab: ['open', 'sus2'],
    proposals: [
      { kind: 'evidence', mode: 'minor', tonic: 'A', tempo: 80, seq: [[0, 'sus2'], [6, 'sus4'], [5, 'sus2'], [0, 'sus2']], why: 'Sans tierces, ni majeur ni mineur : la couleur reste indécise, la phrase ne se « ferme » pas.', caveat: 'Le centre tonal peut devenir flou : laisser la basse sur les fondamentales.' },
      { kind: 'nuance', mode: 'lydian', tonic: 'F', tempo: 84, seq: [[0, 'maj'], [1, 'maj'], [0, 'maj'], [1, 'maj']], why: 'Lydien : {c0} → {c1}, le {Fc1.1} (quarte augmentée) donne une lumière étrange, en apesanteur.', caveat: 'Effet « merveilleux » ou « irréel » selon le timbre.' },
      { kind: 'surprise', mode: 'phrygian', tonic: 'E', tempo: 76, seq: [[0, 'sus4'], [1, 'maj7'], [6, 'min'], [0, 'sus4']], why: '{c0} → {c1} : la seconde mineure du phrygien ({Fc0.0} → {Fc1.0}) et la septième majeure de {c1} dans le même mouvement, sombre et brillant à la fois.', caveat: 'Dense : voicings ouverts et attaques lentes.' },
    ],
  },
  {
    id: 'serenite', label: 'Sérénité', dims: [70, 15, 10],
    harmony: 'Harmonie stable, faible vitesse harmonique', melody: 'Mouvement conjoint, longues tenues', texture: 'Peu de couches, attaques douces',
    risk: 'Uniformité sans direction : prévoir une évolution lente (filtre, densité).',
    melodyGen: 'mel-down', ab: ['sus2', 'pedal'],
    proposals: [
      { kind: 'evidence', mode: 'major', tonic: 'C', tempo: 70, seq: [[0, 'add9'], [0, 'add9'], [3, 'maj7'], [3, 'maj7']], why: 'Deux accords, deux mesures chacun : le temps s’étire, rien ne presse.', caveat: 'Le rythme harmonique lent demande une mélodie ou une texture qui vit.' },
      { kind: 'nuance', mode: 'lydian', tonic: 'F', tempo: 72, seq: [[0, 'maj7'], [1, 'maj'], [0, 'maj7'], [1, 'maj']], why: 'Lydien flottant : aucun accord ne tire vers une résolution.', caveat: 'Peut sembler suspendu plutôt que serein.' },
      { kind: 'surprise', mode: 'major', tonic: 'C', tempo: 68, seq: [[0, 'maj7'], [2, 'm7'], [3, 'maj7'], [0, 'sus2']], why: 'iii m7 relie I et IV par des notes communes ; le sus2 final reste ouvert, comme un souffle.', caveat: 'Le sus2 final peut sonner inachevé : c’est voulu.' },
    ],
  },
  {
    id: 'tendresse', label: 'Tendresse', dims: [75, 25, 20],
    harmony: 'Maj7, add9, m9, conduite conjointe', melody: 'Petits intervalles, résolutions douces', texture: 'Dynamique subtile',
    risk: 'Une harmonie trop dense étouffe la douceur.',
    melodyGen: 'mel-sketch', ab: ['open', 'mode'],
    proposals: [
      { kind: 'evidence', mode: 'major', tonic: 'C', tempo: 76, seq: [[0, 'maj7'], [3, 'maj7'], [0, 'maj7'], [3, 'maj7']], why: 'I maj7 ↔ IV maj7 : deux couleurs douces qui partagent des notes, mouvements minimes.', caveat: 'Statique : la mélodie doit raconter.' },
      { kind: 'nuance', mode: 'major', tonic: 'C', tempo: 78, seq: [[0, 'add9'], [5, 'm7'], [1, 'm9'], [4, 'sus4']], why: 'La sus4 finale retarde la dominante : une hésitation tendre avant le retour.', caveat: 'm9 est dense : voicing ouvert conseillé.' },
      { kind: 'surprise', mode: 'major', tonic: 'C', tempo: 74, seq: [[0, 'maj7'], [3, 'maj7'], [3, 'min'], [0, 'add9']], why: 'IV → iv : une fragilité passagère avant un retour apaisé.', caveat: 'Trop marqué, l’emprunt devient mélancolique.' },
    ],
  },
  {
    id: 'triomphe', label: 'Triomphe', dims: [85, 85, 45],
    harmony: 'Retour affirmé à la tonique, contraste modal éventuel', melody: 'Ambitus large, sommet clair', texture: 'Batterie, basse ferme, couches',
    risk: 'Le volume seul ne fait pas le triomphe : préparer le sommet.',
    melodyGen: 'mel-up', ab: ['open', 'avoid'],
    proposals: [
      { kind: 'evidence', mode: 'major', tonic: 'C', tempo: 110, seq: [[0, 'maj'], [3, 'maj'], [4, 'maj'], [0, 'maj']], why: 'Cadence parfaite affirmée : I – IV – V – I, la tonique « arrive » sur la dernière mesure.', caveat: 'Préparer ce passage par une section plus calme ou plus tendue.' },
      { kind: 'nuance', mode: 'major', tonic: 'C', tempo: 108, seq: [[0, 'maj'], [5, 'maj', -1], [6, 'maj', -1], [0, 'maj']], why: '♭VI – ♭VII – I : cadence « épique » du cinéma et du rock, la tonique est atteinte par le haut.', caveat: 'Cliché si trop fréquent.' },
      { kind: 'surprise', mode: 'minor', tonic: 'A', tempo: 110, seq: [[0, 'min'], [5, 'maj'], [6, 'maj'], [0, 'maj']], why: 'La lutte en mineur se conclut en majeur (tierce picarde) : victoire après le combat.', caveat: 'Demande un contexte mineur établi avant.' },
    ],
  },
  {
    id: 'ambivalence', label: 'Ambivalence', dims: [50, 45, 55],
    harmony: 'Alternance majeur / mineur, accords communs', melody: 'Cible mélodique ambiguë', texture: 'Timbres contrastés',
    risk: 'Une explication émotionnelle trop catégorique.',
    melodyGen: 'mel-sketch', ab: ['mode', 'sus2'],
    proposals: [
      { kind: 'evidence', mode: 'major', tonic: 'C', tempo: 92, seq: [[0, 'maj'], [3, 'min'], [0, 'maj'], [3, 'min']], why: 'I ↔ iv : le majeur et l’ombre du mineur alternent, sans trancher.', caveat: 'Peut sembler indécis plutôt qu’ambivalent : soigner la mélodie.' },
      { kind: 'nuance', mode: 'minor', tonic: 'A', tempo: 94, seq: [[0, 'min'], [2, 'maj'], [3, 'maj'], [0, 'min']], why: 'IV majeur en mineur (couleur dorienne) : un éclat de lumière entouré de mineur.', caveat: 'Le {Fc2.1} du IV majeur contredit la gamme : l’assumer dans la mélodie.' },
      { kind: 'surprise', mode: 'major', tonic: 'C', tempo: 90, seq: [[0, 'maj'], [5, 'min'], [0, 'min'], [3, 'maj']], why: 'La tonique elle-même change de couleur (I → i) : le centre reste, l’humeur bascule.', caveat: 'Effet fort : à placer à un moment clé.' },
    ],
  },
];

SS.EMOTION_KINDS = { evidence: 'Évidence', nuance: 'Nuance', surprise: 'Surprise' };
SS.findEmotion = (id) => SS.EMOTIONS.find((e) => e.id === id) || null;

/**
 * Les modes rangés du plus lumineux au plus sombre, avec les intentions qui leur correspondent le mieux
 * (fenêtre Key, onglet Ambiance et assistant). Chaque intention apparaît une fois, sous le mode le plus
 * fréquent de ses grilles (ses trois pistes et ses grilles de référence) ; les modes caractéristiques
 * (lydien, mixolydien, mineur harmonique, phrygien) gardent l'intention qu'ils colorent le mieux.
 * Réévalué avec la bibliothèque : la nostalgie s'entend surtout en majeur (6 grilles sur 10, avec les
 * septièmes et l'emprunt iv), l'espoir en dorien (Am–Em–D, Am–D), le triomphe dans le mineur « épique »
 * (i–VI–VII) et l'ambivalence en mineur naturel.
 */
SS.MODE_MOODS = [
  { mode: 'lydian', name: 'Lydien', mood: 'rêveur, en apesanteur', lum: '#f2d27a', emotions: ['serenite'] },
  { mode: 'major', name: 'Majeur (ionien)', mood: 'lumineux, tendre', lum: '#e9c46a', emotions: ['joie', 'tendresse', 'nostalgie'] },
  { mode: 'mixolydian', name: 'Mixolydien', mood: 'festif, décontracté', lum: '#d7a95a', emotions: ['euphorie'] },
  { mode: 'dorian', name: 'Dorien', mood: 'mélancolie avec une lueur', lum: '#8fa6c9', emotions: ['espoir', 'melancolie'] },
  { mode: 'minor', name: 'Mineur naturel (éolien)', mood: 'triste, doux-amer, épique', lum: '#7a86b8', emotions: ['triomphe', 'ambivalence', 'tristesse'] },
  { mode: 'harmonic', name: 'Mineur harmonique', mood: 'dramatique, tendu', lum: '#6b6aa6', emotions: ['suspense'] },
  { mode: 'phrygian', name: 'Phrygien', mood: 'sombre, oppressant', lum: '#5a4a8a', emotions: ['angoisse', 'mystere'] },
];
SS.emotionMode = (id) => SS.MODE_MOODS.find((m) => m.emotions.includes(id)) || null;

/**
 * Remplit les repères d'un texte de proposition (voir l'en-tête) d'après les accords transposés
 * (format SS.harmony.makeChord : { name, notes }) et la tonique ; `fr` traduit un nom de note (C♯ → Do♯).
 */
SS.fillEmotionText = (text, chords, tonic, fr) =>
  text.replace(/\{(F?)(?:(t)|c(\d)(?:\.(\d))?|n(\d))\}/g, (all, f, t, ci, ni, nn) => {
    const tr = (x) => (f && fr ? fr(x) : x);
    if (t) return tr(tonic);
    if (nn != null) return chords[+nn] ? chords[+nn].notes.map(tr).join('–') : all;
    const c = chords[+ci];
    if (!c) return all;
    if (ni == null) return f ? tr(c.name) : c.name;
    return c.notes[+ni] != null ? tr(c.notes[+ni]) : all;
  });

/**
 * Bibliothèque de grilles de référence : les 39 progressions de la compilation « Émotions et schémas
 * harmoniques » (11 novembre 2026), avec leur source. Chaque grille garde ses accords d'origine (en Do ou
 * en La), la tonalité ou le mode dans lequel elle s'entend, et les intentions de SS.EMOTIONS qu'elle
 * illustre (une grille peut en servir plusieurs). Elle est transposée sur la tonique de la scène.
 *   chords : symboles séparés par des espaces (Am, Cmaj7, Gsus4, Am6, C/E…) ; bars : mesures par accord
 *   (par défaut 1 ; une grille de 3 accords fait une phrase de 4 mesures, le dernier tenu 2 mesures).
 * Confiance : élevée sur les accords, moyenne sur les émotions associées ; leur perception dépend aussi du
 * tempo, de la mélodie et de l'interprétation.
 */
SS.EMOTION_SOURCES = {
  pianodiary: { name: 'PianoDiary', note: 'relevé personnel, non vérifié dans la vidéo' },
  'mk-emo': { name: 'Motifkit — émotionnel', url: 'https://motifkit.com/emotional-piano-chord-progressions/' },
  'mk-dorian': { name: 'Motifkit — dorien', url: 'https://motifkit.com/dorian-mode-chord-progressions/' },
  'mk-romantic': { name: 'Motifkit — romantique', url: 'https://motifkit.com/romantic-chord-progressions/' },
  'mk-cinema': { name: 'Motifkit — cinéma', url: 'https://motifkit.com/cinematic-film-chord-progressions/' },
  'mk-epic': { name: 'Motifkit — épique', url: 'https://motifkit.com/epic-chord-progressions/' },
  'gw-beauty': { name: 'Goldwire — beauté', url: 'https://goldwireaudio.com/beautiful-chord-progressions' },
  'gw-sad': { name: 'Goldwire — tristesse', url: 'https://goldwireaudio.com/sad-chord-progressions' },
  'gw-dark': { name: 'Goldwire — sombre', url: 'https://goldwireaudio.com/dark-chord-progressions' },
  ni: { name: 'Native Instruments', url: 'https://www.native-instruments.com/blogs/blog/emotional-chord-progressions' },
};

// prettier-ignore
SS.EMOTION_LIBRARY = [
  { id: 'hopeful', label: 'Espoir (Hopeful)', chords: 'Am Em D', tonic: 'A', mode: 'dorian', emos: ['espoir'], src: 'pianodiary' },
  { id: 'beautiful', label: 'Beauté (Beautiful)', chords: 'E Am E Am E Am E Am6', tonic: 'A', mode: 'harmonic', emos: ['tendresse', 'melancolie'], src: 'pianodiary' },
  { id: 'hope-sad', label: 'Espoir mêlé de tristesse', chords: 'Am F C G', tonic: 'A', mode: 'minor', emos: ['espoir', 'ambivalence'], src: 'mk-emo' },
  { id: 'hope-grow', label: 'Espoir qui grandit', chords: 'Cmaj7 Dm7 Em7 Fmaj7', tonic: 'C', mode: 'major', emos: ['espoir'], src: 'gw-beauty' },
  { id: 'hope-melan', label: 'Espoir mélancolique', chords: 'Am D', tonic: 'A', mode: 'dorian', emos: ['espoir', 'melancolie'], src: 'mk-dorian' },
  { id: 'joy-drive', label: 'Joie, élan', chords: 'C G Am F', tonic: 'C', mode: 'major', emos: ['joie', 'euphorie'], src: 'ni' },
  { id: 'nost-tender', label: 'Nostalgie tendre', chords: 'C C/B Am Am/G F', bars: [0.5, 0.5, 0.5, 0.5, 2], tonic: 'C', mode: 'major', emos: ['nostalgie', 'tendresse'], src: 'mk-emo' },
  { id: 'nost-sent', label: 'Nostalgie sentimentale', chords: 'C F Dm G', tonic: 'C', mode: 'major', emos: ['nostalgie'], src: 'ni' },
  { id: 'nost-soft', label: 'Nostalgie douce', chords: 'Cmaj7 Em7 Am7 Fmaj7', tonic: 'C', mode: 'major', emos: ['nostalgie'], src: 'gw-beauty' },
  { id: 'nost-cine', label: 'Nostalgie cinématique', chords: 'F G Em Am', tonic: 'A', mode: 'minor', emos: ['nostalgie'], src: 'mk-romantic' },
  { id: 'memory', label: 'Souvenir chaleureux', chords: 'Am Em F C', tonic: 'A', mode: 'minor', emos: ['nostalgie', 'tendresse'], src: 'mk-emo' },
  { id: 'tender-bitter', label: 'Tendresse douce-amère', chords: 'C F Fm', tonic: 'C', mode: 'major', emos: ['tendresse', 'ambivalence'], src: 'mk-romantic' },
  { id: 'bittersweet', label: 'Doux-amer, lumineux', chords: 'Fmaj7 G7 Em7 Am7', tonic: 'A', mode: 'minor', emos: ['ambivalence', 'melancolie'], src: 'gw-beauty' },
  { id: 'retro', label: 'Romantisme rétro', chords: 'Cmaj7 A7 Dm7 G7', tonic: 'C', mode: 'major', emos: ['tendresse', 'nostalgie'], src: 'mk-romantic' },
  { id: 'jazzy', label: 'Intimité, fraîcheur jazzy', chords: 'Am7 Am6', tonic: 'A', mode: 'dorian', emos: ['melancolie', 'serenite'], src: 'mk-dorian' },
  { id: 'reverie', label: 'Rêverie, flottement', chords: 'Cmaj7 Fmaj7', tonic: 'C', mode: 'major', emos: ['serenite'], src: 'mk-romantic' },
  { id: 'light-susp', label: 'Lumière suspendue', chords: 'Am D/A Am', tonic: 'A', mode: 'dorian', emos: ['melancolie', 'espoir'], src: 'mk-dorian' },
  { id: 'wonder', label: 'Émerveillement, espace', chords: 'Cadd9 Fadd9 Gadd9', tonic: 'C', mode: 'major', emos: ['serenite', 'joie'], src: 'mk-cinema' },
  { id: 'calm-desc', label: 'Apaisement, descente douce', chords: 'Fmaj7 Em7 Dm7 Cmaj7', tonic: 'C', mode: 'major', emos: ['serenite'], src: 'gw-beauty' },
  { id: 'relax', label: 'Détente, douceur', chords: 'Am G Em F', tonic: 'A', mode: 'minor', emos: ['serenite', 'tendresse'], src: 'ni' },
  { id: 'longing', label: 'Désir, attente sans résolution', chords: 'F G Am', tonic: 'A', mode: 'minor', emos: ['ambivalence'], src: 'mk-emo' },
  { id: 'missing', label: 'Manque, désir de retrouvailles', chords: 'Am C G Dm', tonic: 'A', mode: 'minor', emos: ['nostalgie', 'tristesse'], src: 'ni' },
  { id: 'farewell', label: 'Adieu doux-amer', chords: 'C/E F Gsus4 Am', tonic: 'A', mode: 'minor', emos: ['ambivalence', 'tristesse'], src: 'mk-emo' },
  { id: 'heartbreak', label: 'Chagrin, cœur brisé', chords: 'F Fm C', tonic: 'C', mode: 'major', emos: ['tristesse'], src: 'gw-sad' },
  { id: 'numb', label: 'Tristesse suspendue, engourdissement', chords: 'Am F Dm Em', tonic: 'A', mode: 'minor', emos: ['tristesse'], src: 'gw-sad' },
  { id: 'lament', label: 'Lamentation, tension dramatique', chords: 'Am G F E', tonic: 'A', mode: 'minor', emos: ['tristesse', 'suspense'], src: 'gw-sad' },
  { id: 'introspect', label: 'Sombre, introspectif', chords: 'Am F', tonic: 'A', mode: 'minor', emos: ['tristesse', 'mystere'], src: 'ni' },
  { id: 'worry', label: 'Inquiétude croissante', chords: 'Am Em F E', tonic: 'A', mode: 'minor', emos: ['suspense', 'angoisse'], src: 'mk-cinema' },
  { id: 'still', label: 'Suspense immobile', chords: 'Am F/A G/A', tonic: 'A', mode: 'minor', emos: ['suspense', 'mystere'], src: 'mk-cinema' },
  { id: 'unstable', label: 'Suspense, instabilité', chords: 'Am Bdim E Am', tonic: 'A', mode: 'minor', emos: ['suspense'], src: 'gw-dark' },
  { id: 'threat', label: 'Menace, étrangeté', chords: 'Am B♭', tonic: 'A', mode: 'phrygian', emos: ['angoisse', 'mystere'], src: 'gw-dark' },
  { id: 'dread', label: 'Angoisse, tension sombre', chords: 'Am B♭ F E', tonic: 'A', mode: 'phrygian', emos: ['angoisse'], src: 'gw-dark' },
  { id: 'drama', label: 'Drame, attente de résolution', chords: 'Am F Dm E', tonic: 'A', mode: 'minor', emos: ['suspense', 'tristesse'], src: 'gw-dark' },
  { id: 'hero', label: 'Héroïsme, envolée', chords: 'Am F G', tonic: 'A', mode: 'minor', emos: ['triomphe'], src: 'mk-epic' },
  { id: 'fight', label: 'Détermination, combat', chords: 'Am G F G', tonic: 'A', mode: 'minor', emos: ['triomphe'], src: 'mk-epic' },
  { id: 'grand', label: 'Grandeur dramatique', chords: 'Am C G F', tonic: 'A', mode: 'minor', emos: ['triomphe'], src: 'mk-epic' },
  { id: 'open', label: 'Grandeur, paysage ouvert', chords: 'B♭ F C', tonic: 'C', mode: 'mixolydian', emos: ['triomphe', 'euphorie'], src: 'mk-cinema' },
  { id: 'modal-drive', label: 'Élan ample, couleur modale', chords: 'Am D C G', tonic: 'A', mode: 'dorian', emos: ['euphorie', 'espoir'], src: 'mk-dorian' },
  { id: 'victory', label: 'Victoire, arrivée lumineuse', chords: 'F G A', tonic: 'A', mode: 'minor', emos: ['triomphe'], src: 'mk-epic' },
];

/** Lexique des symboles d'accords de la bibliothèque (texte de l'onglet Ambiance). */
SS.CHORD_LEXICON = [
  ['m', 'mineur', 'Am = La–Do–Mi'],
  ['maj7', 'majeur avec septième majeure', 'Cmaj7 = Do–Mi–Sol–Si'],
  ['7', 'septième de dominante', 'G7 = Sol–Si–Ré–Fa'],
  ['m7', 'mineur avec septième mineure', 'Am7 = La–Do–Mi–Sol'],
  ['m6', 'mineur avec sixte majeure', 'Am6 = La–Do–Mi–Fa♯'],
  ['add9', 'neuvième ajoutée', 'Cadd9 = Do–Mi–Sol–Ré'],
  ['sus4', 'quarte à la place de la tierce', 'Gsus4 = Sol–Do–Ré'],
  ['dim', 'diminué', 'Bdim = Si–Ré–Fa'],
  ['/', 'note imposée à la basse', 'C/E = Do majeur sur basse Mi'],
];

const EMO_SUFFIX = { '': 'maj', m: 'min', maj7: 'maj7', 7: '7', m7: 'm7', m6: 'm6', add9: 'add9', sus4: 'sus4', dim: 'dim' };
const EMO_LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const emoPc = (s) => (EMO_LETTER[s[0]] + (s[1] === '♯' || s[1] === '#' ? 1 : s[1] === '♭' || s[1] === 'b' ? -1 : 0) + 12) % 12;

/** « Am/G » → { rootPc: 9, type: 'min', bass: 10 } (bass : demi-tons au-dessus de la fondamentale, 0 sinon). */
SS.parseLibraryChord = (sym) => {
  const m = /^([A-G][♯#♭b]?)([^/]*)(?:\/([A-G][♯#♭b]?))?$/.exec(sym.trim());
  if (!m || !(m[2] in EMO_SUFFIX)) return null;
  const rootPc = emoPc(m[1]);
  return { rootPc, type: EMO_SUFFIX[m[2]], bass: m[3] ? (emoPc(m[3]) - rootPc + 12) % 12 : 0 };
};

/** Mesures de chaque accord d'une grille de la bibliothèque (3 accords → 1, 1, 2 : une phrase de 4 mesures). */
SS.libraryBars = (entry) => {
  const n = entry.chords.trim().split(/\s+/).length;
  return entry.bars || (n === 3 ? [1, 1, 2] : new Array(n).fill(1));
};
SS.libraryFor = (emoId) => SS.EMOTION_LIBRARY.filter((x) => x.emos.includes(emoId));
