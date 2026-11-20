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
 * ab : essais A/B conseillés (js/harmony.js, TRANSFORMS). La mélodie vient du moteur unique (js/melody.js) et du profil de l'émotion (js/melody-profiles.js).
 * appui  : « appui à essayer » du répertoire d'intentions du guide MusicEmotion (docs/reference/musicemotion-guide.md,
 *          chap. 8) ; les notes citées sont celles de l'exemple du guide.
 * Émerveillement et Beauté inquiétante viennent de ce même répertoire (15 intentions).
 */
window.SS = window.SS || {};

SS.EMOTIONS = [
  {
    id: 'joie', label: 'Joie simple', dims: [85, 60, 20],
    harmony: 'Majeur, I–IV–V–I, add9', melody: 'Ascendante, répétitive', texture: 'Pulsation claire, timbres lumineux',
    risk: 'Majeur ne garantit pas la joie : le tempo, le rythme et la mélodie comptent autant.',
    appui: 'Note finale sur la tonique et rebond rythmique.',
    ab: ['mode', 'sus2'],
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
    appui: 'Mélodie en séquence ascendante, batterie plus dense au dernier passage.',
    ab: ['open', 'seventh'],
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
    appui: 'Descente lente de la quinte vers la tonique (E5 → A4 en La), respirations entre les groupes.',
    ab: ['mode', 'seventh'],
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
    appui: 'Garder la tonique en haut ; dans une autre voix, faire alterner la tierce de IV puis sa version abaissée (A puis A♭ en Do).',
    ab: ['seventh', 'pedal'],
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
    appui: 'Mettre en évidence la sixte majeure sur le IV (B sur G en Ré dorien) et la tonique aux fins de phrase.',
    ab: ['seventh', 'open'],
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
    appui: 'Faire apparaître la sixte majeure (F♯ sur D en La) seulement au moment de la montée ; orienter la mélodie vers la tonique.',
    ab: ['avoid', 'open'],
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
    appui: 'Conserver le dernier accord jusqu’au début de la boucle suivante.',
    ab: ['pedal', 'avoid'],
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
    appui: 'Seconde mineure au-dessus de la tonique (B♭ sur A) dans le dessus, grave peu mobile.',
    ab: ['pedal', 'open'],
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
    appui: 'Répéter une même note dans l’aigu (A en La) et écouter son rôle changer d’un accord à l’autre.',
    ab: ['open', 'sus2'],
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
    appui: 'Basse stable sur la tonique, quelques notes seulement dans l’aigu.',
    ab: ['sus2', 'pedal'],
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
    appui: 'Longues tenues, attaque arrondie, une note commune tenue d’un accord à l’autre (E sur Dm9 en Do).',
    ab: ['open', 'mode'],
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
    appui: 'Préparer un sommet mélodique sur la tonique et élargir la disposition au retour.',
    ab: ['open', 'avoid'],
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
    appui: 'Même motif autour de la quinte, alternance tierce majeure / mineure à l’intérieur (E / E♭ en Do).',
    ab: ['mode', 'sus2'],
    proposals: [
      { kind: 'evidence', mode: 'major', tonic: 'C', tempo: 92, seq: [[0, 'maj'], [3, 'min'], [0, 'maj'], [3, 'min']], why: 'I ↔ iv : le majeur et l’ombre du mineur alternent, sans trancher.', caveat: 'Peut sembler indécis plutôt qu’ambivalent : soigner la mélodie.' },
      { kind: 'nuance', mode: 'minor', tonic: 'A', tempo: 94, seq: [[0, 'min'], [2, 'maj'], [3, 'maj'], [0, 'min']], why: 'IV majeur en mineur (couleur dorienne) : un éclat de lumière entouré de mineur.', caveat: 'Le {Fc2.1} du IV majeur contredit la gamme : l’assumer dans la mélodie.' },
      { kind: 'surprise', mode: 'major', tonic: 'C', tempo: 90, seq: [[0, 'maj'], [5, 'min'], [0, 'min'], [3, 'maj']], why: 'La tonique elle-même change de couleur (I → i) : le centre reste, l’humeur bascule.', caveat: 'Effet fort : à placer à un moment clé.' },
    ],
  },
  {
    id: 'emerveillement', label: 'Émerveillement', dims: [80, 30, 35],
    harmony: 'Lydien : maj7(♯11), II majeur sur basse de tonique, médiantes chromatiques', melody: 'Quarte augmentée isolée dans l’aigu, attaques espacées', texture: 'Basse stable, nappes claires, réverbération maîtrisée',
    risk: 'Le lydien bascule vers la dominante si la basse quitte la tonique : garder la pédale.',
    appui: 'Basse stable sur la tonique, quarte augmentée isolée dans l’aigu (F♯ en Do), attaques espacées.',
    ab: ['pedal', 'open'],
    proposals: [
      { kind: 'evidence', mode: 'lydian', tonic: 'C', tempo: 76, seq: [[0, 'maj7s11'], [1, 'maj'], [0, 'maj7s11'], [0, 'maj']], why: '{c1} au-dessus de la tonique : son {Fc1.1} est la quarte augmentée du lydien, une lumière en apesanteur (guide, chap. 8).', caveat: 'Jouer {c1} sur une basse {t} : sur sa propre fondamentale, il tire vers la dominante.' },
      { kind: 'nuance', mode: 'lydian', tonic: 'F', tempo: 80, seq: [[0, 'add9'], [1, 'add9'], [6, 'min'], [0, 'add9']], why: 'II add9 puis vii : la couleur lydienne passe par {Fc1.1} sans jamais créer de dominante.', caveat: 'Les add9 rapprochées brouillent le grave : aérer les voicings.' },
      { kind: 'surprise', mode: 'major', tonic: 'C', tempo: 78, seq: [[0, 'maj7'], [2, 'maj7', -1], [0, 'maj7'], [5, 'maj', -1]], why: 'Médiantes chromatiques : {c0} → {c1} garde {Fc0.2} commun et déplace le reste, comme un changement d’éclairage.', caveat: 'Répartir le contraste sur les voix intérieures, sinon le saut paraît brutal.' },
    ],
  },
  {
    id: 'beaute', label: 'Beauté inquiétante', dims: [50, 35, 60],
    harmony: 'Mineur harmonique : V majeur ↔ i, sixte ajoutée, emprunts chromatiques', melody: 'Sensible → tonique soignée, sixte majeure à la dernière arrivée', texture: 'Piano ou cordes, tempo modéré, rubato possible',
    risk: 'Trop de sensible rend la phrase scolaire : laisser une arrivée ouverte.',
    appui: 'Soigner la sensible → tonique (G♯ → A en La) et laisser apparaître la sixte majeure (F♯) à la dernière arrivée.',
    ab: ['seventh', 'pedal'],
    proposals: [
      { kind: 'evidence', mode: 'harmonic', tonic: 'A', tempo: 72, seq: [[4, 'maj'], [0, 'min'], [4, 'maj'], [0, 'm6']], why: '{c0} ↔ {c1} : {Fc0.1} monte sur {Fc1.0} ; la sixte majeure de {c3} ({Fc3.3}) éclaire la dernière arrivée (guide, chap. 8 ; Piano Diary, fiche 4).', caveat: 'Deux accords seulement : la mélodie doit varier d’un passage à l’autre.' },
      { kind: 'nuance', mode: 'harmonic', tonic: 'A', tempo: 70, seq: [[0, 'min'], [3, 'madd9'], [5, 'maj7'], [4, '7']], why: 'Les notes ajoutées adoucissent ; {c3} rappelle la sensible {Fc3.1} : la beauté garde son inquiétude.', caveat: 'Le maj7 sur le VI peut sonner trop confortable : le jouer bref.' },
      { kind: 'surprise', mode: 'harmonic', tonic: 'A', tempo: 68, seq: [[0, 'min'], [5, 'mmaj7'], [3, 'madd9'], [4, 'maj']], why: '{c1} : le {Fc1.1} assombrit la sixte d’un demi-ton avant que {c3} ne ramène la sensible (relevé Piano Diary, fiche 6).', caveat: 'Symbole relevé sans confirmation des notes jouées : comparer avec {Fc1.0} majeur à sa place.' },
    ],
  },
];

SS.EMOTION_KINDS = { evidence: 'Évidence', nuance: 'Nuance', surprise: 'Surprise' };
SS.findEmotion = (id) => SS.EMOTIONS.find((e) => e.id === id) || null;

/**
 * Les modes rangés du plus lumineux au plus sombre, avec les intentions qui leur correspondent le mieux
 * (assistant Nouvelle chanson). Chaque intention apparaît une fois, sous le mode le plus
 * fréquent de ses grilles (ses trois pistes et ses grilles de référence) ; les modes caractéristiques
 * (lydien, mixolydien, mineur harmonique, phrygien) gardent l'intention qu'ils colorent le mieux.
 * Réévalué avec la bibliothèque complète (guide MusicEmotion et 42 fiches Piano Diary) : la nostalgie, la tendresse,
 * la sérénité et l'ambivalence s'entendent surtout en majeur (septièmes, emprunt iv, I → i), l'espoir en dorien
 * (Am–Em–D) à égalité avec le majeur, le triomphe dans le mineur « épique » (i–VI–VII) ; l'émerveillement est
 * la couleur lydienne du guide, la beauté inquiétante celle du mineur harmonique (V ↔ i).
 */
SS.MODE_MOODS = [
  { mode: 'lydian', name: 'Lydien', mood: 'rêveur, en apesanteur', lum: '#f2d27a', emotions: ['emerveillement'] },
  { mode: 'major', name: 'Majeur (ionien)', mood: 'lumineux, tendre', lum: '#e9c46a', emotions: ['joie', 'tendresse', 'serenite', 'nostalgie', 'ambivalence'] },
  { mode: 'mixolydian', name: 'Mixolydien', mood: 'festif, décontracté', lum: '#d7a95a', emotions: ['euphorie'] },
  { mode: 'dorian', name: 'Dorien', mood: 'mélancolie avec une lueur', lum: '#8fa6c9', emotions: ['espoir', 'melancolie'] },
  { mode: 'minor', name: 'Mineur naturel (éolien)', mood: 'triste, doux-amer, épique', lum: '#7a86b8', emotions: ['triomphe', 'tristesse'] },
  { mode: 'harmonic', name: 'Mineur harmonique', mood: 'dramatique, tendu', lum: '#6b6aa6', emotions: ['beaute', 'suspense'] },
  { mode: 'phrygian', name: 'Phrygien', mood: 'sombre, oppressant', lum: '#5a4a8a', emotions: ['angoisse', 'mystere'] },
];
SS.emotionMode = (id) => SS.MODE_MOODS.find((m) => m.emotions.includes(id)) || null;

/**
 * Faire entendre un mode (guide MusicEmotion, chap. 4 ; formation, chap. 07) : la couleur à faire entendre, une
 * boucle d'essai écrite sur Do (transposée par SS.libraryGrid sur la tonique de la scène) et un conseil d'appui.
 */
SS.MODE_GUIDE = {
  major: { hear: 'la tierce majeure et la sensible (Mi et Si en Do)', loop: 'C F G C', tip: 'Placer les fins de phrase sur I, la sensible juste avant.' },
  dorian: { hear: 'la tierce mineure et la sixte majeure (Mi♭ et La en Do)', loop: 'Cm7 F Cm7 F', tip: 'Le IV majeur porte la sixte majeure : la faire entendre dans la mélodie, revenir sur la tonique en fin de phrase.' },
  phrygian: { hear: 'la seconde mineure contre la tonique (Ré♭ contre Do)', loop: 'Cm D♭ Cm D♭/C', tip: 'Garder la tonique à la basse sous le ♭II : la seconde mineure frotte et le centre reste clair.' },
  lydian: { hear: 'la quarte augmentée au-dessus de la tonique (Fa♯ en Do)', loop: 'Cmaj7(♯11) D/C Cmaj7(♯11) C', tip: 'Une basse de tonique sous le II majeur réduit l’attraction vers la dominante.' },
  mixolydian: { hear: 'la septième mineure avec la tierce majeure (Si♭ avec Mi en Do)', loop: 'C B♭ F C', tip: 'Le ♭VII majeur remplace la dominante : retour sur I sans sensible.' },
  minor: { hear: 'la sixte et la septième mineures (La♭ et Si♭ en Do)', loop: 'Cm A♭ E♭ B♭', tip: 'Sans sensible, la boucle tourne sans se résoudre ; les fins de phrase sur la tonique fixent le centre.' },
  harmonic: { hear: 'la sensible et la sixte mineure (Si et La♭ en Do)', loop: 'Cm Fm G7 Cm', tip: 'Le V7 tire vers i ; traiter le V comme une dominante. Si la phrase se pose sur le V, essayer le phrygien dominant.' },
  phrygdom: { hear: 'la seconde mineure et la tierce majeure (Ré♭ et Mi en Do)', loop: 'C D♭ B♭m C', tip: 'Mêmes notes que le mineur harmonique de la quarte (Fa) : tenir la tonique et s’y reposer longuement.' },
  locrian: { hear: 'la seconde mineure et la quinte diminuée (Ré♭ et Sol♭ en Do)', loop: 'Cm7♭5 D♭/C Cm7♭5 D♭/C', tip: 'Tenir Do à la basse et le viser en fin de phrase : c’est ce qui stabilise un centre à quinte diminuée.' },
};
/** Boucle d'essai d'un mode, transposée sur `tonic` : { key, grid, chords } (voir SS.libraryGrid). */
SS.modeLoop = (mode, tonic) => {
  const g = SS.MODE_GUIDE[mode];
  return g ? SS.libraryGrid({ chords: g.loop, tonic: 'C', mode }, tonic || 'C') : null;
};

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
  pianodiary: { name: 'Piano Diary', url: 'https://www.youtube.com/@pianodiaryofficial/shorts', note: 'symboles relevés dans les Shorts ; durées et tempos de travail estimés (docs/reference/piano-diary-accords-emotions.md)' },
  guide: { name: 'Guide MusicEmotion, chap. 8', note: 'répertoire d’intentions : grilles de départ à comparer à l’écoute (docs/reference/musicemotion-guide.md)' },
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

  // Guide MusicEmotion, chap. 8 : une grille par intention (« Centre et grille »)
  { id: 'g-joie', label: 'Joie, clarté', chords: 'C F G C', tonic: 'C', mode: 'major', emos: ['joie'], src: 'guide' },
  { id: 'g-euphorie', label: 'Euphorie', chords: 'C G Am F', tonic: 'C', mode: 'major', emos: ['euphorie'], src: 'guide' },
  { id: 'g-tristesse', label: 'Tristesse', chords: 'Am F C G', tonic: 'A', mode: 'minor', emos: ['tristesse'], src: 'guide' },
  { id: 'g-nostalgie', label: 'Nostalgie (iv mineur)', chords: 'C Am7 Fmaj7 Fm', tonic: 'C', mode: 'major', emos: ['nostalgie'], src: 'guide' },
  { id: 'g-tendresse', label: 'Tendresse', chords: 'Cmaj7 Am7 Dm9 G7sus4', tonic: 'C', mode: 'major', emos: ['tendresse'], src: 'guide' },
  { id: 'g-serenite', label: 'Sérénité sur pédale', chords: 'Cadd9 F/C Cadd9 F/C', tonic: 'C', mode: 'major', emos: ['serenite'], src: 'guide' },
  { id: 'g-melancolie', label: 'Mélancolie lumineuse', chords: 'Dm7 G Dm7 G', tonic: 'D', mode: 'dorian', emos: ['melancolie'], src: 'guide' },
  { id: 'g-espoir', label: 'Espoir fragile', chords: 'Am Em D Am', tonic: 'A', mode: 'dorian', emos: ['espoir'], src: 'guide' },
  { id: 'g-merveille', label: 'Émerveillement', chords: 'Cmaj7(♯11) D/C Cmaj7(♯11) C', tonic: 'C', mode: 'lydian', emos: ['emerveillement'], src: 'guide' },
  { id: 'g-mystere', label: 'Mystère, note commune', chords: 'Am(add9) Fmaj7 Dm9 Esus4', tonic: 'A', mode: 'minor', emos: ['mystere'], src: 'guide' },
  { id: 'g-suspense', label: 'Suspense, dominante prolongée', chords: 'Am Dm/A E7sus4 E7', tonic: 'A', mode: 'minor', emos: ['suspense'], src: 'guide' },
  { id: 'g-angoisse', label: 'Angoisse, ♭II sur pédale', chords: 'Am B♭/A Am E7♭9', tonic: 'A', mode: 'minor', emos: ['angoisse'], src: 'guide' },
  { id: 'g-ambivalence', label: 'Ambivalence, I → i', chords: 'C Cm A♭ G7', tonic: 'C', mode: 'major', emos: ['ambivalence'], src: 'guide' },
  { id: 'g-beaute', label: 'Beauté inquiétante', chords: 'E Am E Am6', tonic: 'A', mode: 'harmonic', emos: ['beaute'], src: 'guide' },
  { id: 'g-triomphe', label: 'Triomphe progressif', chords: 'Am F G7 C', tonic: 'C', mode: 'major', emos: ['triomphe'], src: 'guide' },

  // Piano Diary : 42 fiches (docs/reference/piano-diary-accords-emotions.md). `n` : numéro de fiche ; `url` : la vidéo ;
  // `tempo` : tempo de travail proposé (pas le tempo original) ; `stated` : émotion annoncée par la vidéo (sinon
  // interprétation du relevé) ; `mood` : la colonne « Émotion / couleur » ; `note` : réserve du relevé.
  // Symboles au format de l'application : Fm(maj7) pour « FmM7 », Dm(add9) pour « Dmadd9 », A+ pour « Aaug ».
  { id: 'pd01', n: 1, label: 'Assombrissement (These chords)', chords: 'Dadd9 F♯m7 Bm G D/F♯ Ddim/F Gm6', tonic: 'D', mode: 'major', emos: ['nostalgie', 'ambivalence'], src: 'pianodiary', url: 'https://www.youtube.com/shorts/TLQeHUtby3s', mood: 'Mélancolie, assombrissement', note: 'durées non relevées' },
  { id: 'pd02', n: 2, label: 'Refrain, élan (Try these chords for a chorus)', chords: 'D Bm E9 A', tonic: 'D', mode: 'major', emos: ['euphorie', 'espoir'], src: 'pianodiary', url: 'https://www.youtube.com/shorts/S_V_b-uhr_U', mood: 'Élan, ouverture', note: 'durées non relevées' },
  { id: 'hopeful', n: 3, label: 'Espoir (Hopeful chords)', chords: 'Am Em D', bars: [1, 1, 2], tonic: 'A', mode: 'dorian', tempo: 132, stated: true, emos: ['espoir'], src: 'pianodiary', url: 'https://www.youtube.com/shorts/0Hrk29eS7Eg', mood: 'Espoir', note: '4/4 à 132 BPM : découpage validé comme proposition de travail' },
  { id: 'beautiful', n: 4, label: 'Beauté (2 chords for instant beauty)', chords: 'E Am E Am E Am E Am6', tonic: 'A', mode: 'harmonic', stated: true, emos: ['beaute', 'tendresse', 'nostalgie'], src: 'pianodiary', url: 'https://www.youtube.com/shorts/MCywhcXO5eM', mood: 'Beauté ; nostalgie (interprétation)', note: 'répétitions et durées non relevées ; l’auteur lit E comme I et Am comme iv' },
  { id: 'pd05', n: 5, label: 'Perte, deuil (Forelorn loss)', chords: 'Am Em/G Bm/F♯ C Am Em/G D', tonic: 'A', mode: 'dorian', stated: true, emos: ['tristesse'], src: 'pianodiary', url: 'https://www.youtube.com/shorts/uqtRJDCov9I', mood: 'Perte, deuil', note: 'durées non relevées' },
  { id: 'pd06', n: 6, label: 'Chagrin (Sorrowful chords)', chords: 'Am Fm(maj7) Dm(add9) E Am', tonic: 'A', mode: 'harmonic', stated: true, emos: ['tristesse', 'beaute'], src: 'pianodiary', url: 'https://www.youtube.com/shorts/TDh_Fdzv6Cg', mood: 'Chagrin', note: 'symbole « FmM7 » affiché, notes jouées non confirmées ; durées non relevées' },
  { id: 'pd07', n: 7, label: 'Tristesse, i – iv (2 easy chords)', chords: 'Fm B♭m', tonic: 'F', mode: 'minor', stated: true, emos: ['tristesse'], src: 'pianodiary', url: 'https://www.youtube.com/shorts/r_5tq5gxsi8', mood: 'Tristesse', note: 'durées non relevées' },
  { id: 'pd08', n: 8, label: 'Mystère chromatique (Mysterious chords)', chords: 'Gm G♭maj7 F D7/F♯', tonic: 'G', mode: 'minor', stated: true, emos: ['mystere'], src: 'pianodiary', url: 'https://www.youtube.com/shorts/ctIxgh8sB5U', mood: 'Mystère', note: 'durées non relevées' },
  { id: 'pd09', n: 9, label: 'Nostalgie douce-amère (Bittersweet Nostalgia)', chords: 'F♯m E/G♯ A G♯m/B Aadd9 F♯m C♯m/E Bsus4 A Esus4 A', tonic: 'A', mode: 'major', stated: true, emos: ['nostalgie', 'ambivalence'], src: 'pianodiary', url: 'https://www.youtube.com/shorts/vhb2h4iyVhY', mood: 'Nostalgie douce-amère', note: 'durées non relevées' },
  { id: 'pd10', n: 10, label: 'Cinéma sombre (Dark Cinematic Chords)', chords: 'Dm D♭ Fm G7', tonic: 'D', mode: 'minor', stated: true, emos: ['mystere', 'suspense'], src: 'pianodiary', url: 'https://www.youtube.com/shorts/kC0MHXD-Ido', mood: 'Couleur cinématique sombre', note: 'durées non relevées ; G7 laisse une attente vers Do' },
  { id: 'pd11', n: 11, label: 'Guérison (Healing Chords)', chords: 'E G♯m C♯m G♯m Amaj7', tonic: 'E', mode: 'major', stated: true, emos: ['espoir', 'tendresse'], src: 'pianodiary', url: 'https://www.youtube.com/shorts/dKLo0hM7a7k', mood: 'Reconstruction après une épreuve', note: 'durées non relevées' },
  { id: 'pd12', n: 12, label: 'Rêverie non diatonique (More non diatonic chords)', chords: 'F♯m7 G6sus2 F♯m7 Fmaj7', tonic: 'D', mode: 'major', tempo: 92, emos: ['emerveillement', 'ambivalence'], src: 'pianodiary', url: 'https://youtube.com/shorts/cOde8-W2fTA', mood: 'Rêverie, surprise, mélancolie', note: 'reprise non relevée' },
  { id: 'pd13', n: 13, label: 'Basculement vers Si♭ mineur (G major to B♭ minor)', chords: 'G E♭maj7 Fsus4 F7', tonic: 'G', mode: 'major', emos: ['ambivalence', 'suspense'], src: 'pianodiary', url: 'https://youtube.com/shorts/c4Jeq83Q4iY', mood: 'Basculement dramatique, assombrissement', note: 'F7 prépare Si♭ mineur ; la suite n’est pas relevée' },
  { id: 'pd14', n: 14, label: 'Sombre, manque, magie (Dark Mysterious Chords)', chords: 'Cm Em Cm Em Cm A♭m G', bars: [1, 1, 1, 1, 0.5, 1, 1], tonic: 'C', mode: 'minor', tempo: 98, stated: true, emos: ['mystere'], src: 'pianodiary', url: 'https://youtube.com/shorts/qNBN4lwtdIc', mood: 'Sombre, mystère, désir, magie' },
  { id: 'pd15', n: 15, label: 'Cinématique sur pédale de Do (Super Easy Cinematic)', chords: 'Cm7 Fm/C Cm G7/C Cm Gsus4/C', tonic: 'C', mode: 'minor', tempo: 69, stated: true, emos: ['suspense'], src: 'pianodiary', url: 'https://youtube.com/shorts/SVQHfpgVB7Y', mood: 'Cinématique ; gravité, tension suspendue' },
  { id: 'pd16', n: 16, label: 'Émotion, mélancolie douce (Easy Emotional Chords)', chords: 'C♯m B Amaj7 C♯m G♯m7 A', bars: [1, 1, 2, 1, 1, 2], tonic: 'C♯', mode: 'minor', tempo: 155, emos: ['nostalgie', 'tendresse'], src: 'pianodiary', url: 'https://youtube.com/shorts/h0kx2vz3fzA', mood: 'Mélancolie, douceur, ouverture', note: 'dernier A ≈ 1,8 mesure, fin écourtée possible' },
  { id: 'pd17', n: 17, label: 'Intériorité (Emotional Chords in B♭ minor)', chords: 'B♭m Fm A♭ E♭m G♭', bars: [1, 1, 1, 0.5, 0.5], tonic: 'B♭', mode: 'minor', tempo: 71, emos: ['tristesse'], src: 'pianodiary', url: 'https://youtube.com/shorts/5FcMoNBhQPk', mood: 'Intériorité, tristesse douce', note: 'E♭m ≈ 1,6 temps, arrondi à 2' },
  { id: 'pd18', n: 18, label: 'Douceur étrange (4 Chords For An Instant Mood)', chords: 'D B♭ Am7 Gmaj7', tonic: 'D', mode: 'major', tempo: 130, emos: ['nostalgie', 'mystere'], src: 'pianodiary', url: 'https://youtube.com/shorts/FI0ZK1iVWcU', mood: 'Douceur étrange, nostalgie', note: 'reprise avec variations non relevée' },
  { id: 'pd19', n: 19, label: 'Pop lumineuse (Beautiful Pop Chords)', chords: 'C G D Em', tonic: 'G', mode: 'major', tempo: 142, stated: true, emos: ['joie', 'nostalgie'], src: 'pianodiary', url: 'https://youtube.com/shorts/nHulfsWHeM4', mood: 'Beauté ; légèreté mélancolique', note: 'centre Sol majeur ou Mi mineur selon la mélodie' },
  { id: 'pd20', n: 20, label: 'Élégance (Classy Chords in D)', chords: 'Dadd9 F♯m Em(add11) F♯7 Bm Bm/A E7 G Gm6 D', bars: [1, 1, 1, 1, 1, 0.5, 1, 0.5, 0.75, 1], tonic: 'D', mode: 'major', tempo: 82, emos: ['tendresse', 'nostalgie'], src: 'pianodiary', url: 'https://youtube.com/shorts/ZV8FdMm58Lw', mood: 'Élégance ; tendresse, douce-amère', note: 'Gm6 ≈ 2,7 temps, arrondi à 3' },
  { id: 'pd21', n: 21, label: 'Tristesse sans dominante (Easy Sad Chords in D minor)', chords: 'Dm F C Gm', tonic: 'D', mode: 'minor', tempo: 90, stated: true, emos: ['tristesse'], src: 'pianodiary', url: 'https://youtube.com/shorts/jbFT1hz97k8', mood: 'Tristesse' },
  { id: 'pd22', n: 22, label: 'Tendresse ouverte (Steal these chords)', chords: 'D F♯m G D Em Bm Gmaj7 Asus4', bars: [1, 1, 1, 1, 1, 1, 2, 1], tonic: 'D', mode: 'major', tempo: 150, emos: ['tendresse'], src: 'pianodiary', url: 'https://youtube.com/shorts/RyTY_WJYK5A', mood: 'Tendresse, ouverture, mélancolie légère', note: 'reprise non relevée' },
  { id: 'pd23', n: 23, label: 'Du mineur au majeur (without moving hand)', chords: 'Dm G B♭ Cadd9 Dadd9', bars: [0.5, 0.5, 0.25, 0.75, 2], tonic: 'D', mode: 'dorian', tempo: 90, emos: ['espoir'], src: 'pianodiary', url: 'https://youtube.com/shorts/wM5H369b9wo', mood: 'Ouverture progressive du mineur vers le majeur', note: 'Dadd9 ≈ 1½–2 mesures' },
  { id: 'pd24', n: 24, label: 'Richesse chromatique (These Chords Tho)', chords: 'Amaj9 C♯maj9 F♯m9 G♯7♭9', tonic: 'A', mode: 'major', tempo: 60, emos: ['tendresse', 'ambivalence'], src: 'pianodiary', url: 'https://youtube.com/shorts/hmcQt6wd-nw', mood: 'Richesse, douceur, tension chromatique' },
  { id: 'pd25', n: 25, label: 'Montée puis inflexion (Walk-up in G)', chords: 'G Am G/B Cm6 G Am G/B Cm Cm(maj7)', bars: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], tonic: 'G', mode: 'major', tempo: 84, emos: ['nostalgie', 'espoir'], src: 'pianodiary', url: 'https://youtube.com/shorts/9f5CkBGn-x8', mood: 'Élan, puis inflexion nostalgique' },
  { id: 'pd26', n: 26, label: 'IV – iv – I (Simple G to D modulation)', chords: 'G Gm D', tonic: 'D', mode: 'major', emos: ['ambivalence'], src: 'pianodiary', url: 'https://youtube.com/shorts/AetHVcStKkc', mood: 'Assombrissement, puis résolution majeure', note: 'durées non relevées' },
  { id: 'pd27', n: 27, label: 'Ampleur et attente (Progression in A minor)', chords: 'Am Em F Dm Am Gsus4 G♯dim7', bars: [1, 1, 2, 1, 1, 1, 1], tonic: 'A', mode: 'minor', tempo: 170, emos: ['tristesse', 'suspense'], src: 'pianodiary', url: 'https://youtube.com/shorts/4GhrgwqZOU4', mood: 'Mélancolie, ampleur, attente', note: 'Gsus4 et G♯dim7 de durée incertaine' },
  { id: 'pd28', n: 28, label: 'Lumineux / sombre (non diatonic for a change)', chords: 'A Fadd9 Csus4 C E7 Am Fm(add9) C E', bars: [1, 1, 0.5, 0.5, 1, 1, 1, 1, 1], tonic: 'A', mode: 'minor', tempo: 70, emos: ['ambivalence'], src: 'pianodiary', url: 'https://youtube.com/shorts/KHUJ137Dcs8', mood: 'Contraste lumineux / sombre, douceur amère', note: 'E final de durée libre' },
  { id: 'pd29', n: 29, label: 'Ampleur (3 chords for an instant mood)', chords: 'B♭maj9 Am(add11) Gadd9', tonic: 'A', mode: 'minor', emos: ['nostalgie', 'mystere'], src: 'pianodiary', url: 'https://youtube.com/shorts/ZWjZP3PrJeY', mood: 'Ampleur, nostalgie possible', note: 'grille affichée ; jeu et durées non relevés ; basse Si♭ – La – Sol' },
  { id: 'pd30', n: 30, label: 'Nostalgie, basse qui monte (Nostalgic chords)', chords: 'Bm A/C♯ D G Bm A/C♯ D Gadd9', bars: [0.5, 0.25, 0.25, 1, 0.5, 0.25, 0.25, 1], tonic: 'B', mode: 'minor', tempo: 90, stated: true, emos: ['nostalgie'], src: 'pianodiary', url: 'https://youtube.com/shorts/Def3ZvL8las', mood: 'Nostalgie' },
  { id: 'pd31', n: 31, label: 'Drame mineur (A different minor progression)', chords: 'Dm E7 Gm A+ A Dm Gm Dm A7 Dm', bars: [1, 1, 1, 0.5, 0.5, 0.5, 0.5, 0.5, 2, 1], tonic: 'D', mode: 'harmonic', tempo: 100, emos: ['suspense', 'tristesse'], src: 'pianodiary', url: 'https://youtube.com/shorts/M1imDk-Xf3o', mood: 'Tension, dramatisme, résolution mineure' },
  { id: 'pd32', n: 32, label: 'Basse chromatique, iv mineur (Emotional in D major)', chords: 'D A A♯dim Bm Gadd9 D A A♯dim Bm Gm D', bars: [1, 0.5, 0.5, 1, 1, 1, 0.5, 0.5, 1, 2, 1], tonic: 'D', mode: 'major', tempo: 132, emos: ['tendresse', 'nostalgie'], src: 'pianodiary', url: 'https://youtube.com/shorts/UOiOLfUg4ks', mood: 'Tendresse, nostalgie' },
  { id: 'pd33', n: 33, label: 'Détente (Laid Back Chords in C Major)', chords: 'C Am Fmaj7 Em G6', tonic: 'C', mode: 'major', tempo: 132, stated: true, emos: ['serenite', 'tendresse'], src: 'pianodiary', url: 'https://youtube.com/shorts/Equrb1MFBlg', mood: 'Détente ; douceur, fluidité', note: 'reprise non relevée' },
  { id: 'pd34', n: 34, label: 'Basse chromatique, iv m6 (Emotional in F Major)', chords: 'F C C♯dim Dm B♭add9 F C C♯dim Dm B♭m6 F', bars: [1, 0.5, 0.5, 1, 1, 1, 0.5, 0.5, 1, 2, 1], tonic: 'F', mode: 'major', tempo: 160, emos: ['tendresse', 'nostalgie'], src: 'pianodiary', url: 'https://youtube.com/shorts/aplv8o7FMb4', mood: 'Douceur, nostalgie, tension de résolution' },
  { id: 'pd35', n: 35, label: 'Ballade (Easy Ballad Chords for Piano)', chords: 'G D/F♯ Em Cadd9', bars: [2, 1, 2, 2], tonic: 'G', mode: 'major', tempo: 132, stated: true, emos: ['tendresse', 'nostalgie'], src: 'pianodiary', url: 'https://youtube.com/shorts/oqlxVHkeaH8', mood: 'Ballade ; tendresse, récit intime', note: 'reprise non relevée' },
  { id: 'pd36', n: 36, label: 'Éclaircie puis attente (Emotional in E minor)', chords: 'Em Bm C G A B', bars: [1, 1, 1, 1, 2, 2], tonic: 'E', mode: 'minor', tempo: 112, emos: ['espoir', 'melancolie'], src: 'pianodiary', url: 'https://youtube.com/shorts/jVzMrNQCf5o', mood: 'Mélancolie, éclaircie, attente', note: 'retour sur Em non montré' },
  { id: 'pd37', n: 37, label: 'Fluidité, iv emprunté (Smooth in D)', chords: 'Gmaj9 Gm(add9)/B♭ D', bars: [1, 1, 2], tonic: 'D', mode: 'major', tempo: 120, stated: true, emos: ['nostalgie', 'tendresse'], src: 'pianodiary', url: 'https://youtube.com/shorts/rToG4SzPDq4', mood: 'Fluidité ; douceur, nostalgie', note: 'reprise non relevée' },
  { id: 'pd38', n: 38, label: 'Plainte (Sad Chord Progression in A minor)', chords: 'Am F Dm E', tonic: 'A', mode: 'minor', tempo: 120, stated: true, emos: ['tristesse'], src: 'pianodiary', url: 'https://youtube.com/shorts/h040COxZxHE', mood: 'Tristesse ; plainte' },
  { id: 'pd39', n: 39, label: 'Délicatesse, basse chromatique (Delicate in D)', chords: 'D F♯m/C♯ F♯dim/C B7 G E/G♯ A7', bars: [1, 1, 1, 1, 1, 1, 2], tonic: 'D', mode: 'major', tempo: 116, stated: true, emos: ['tendresse', 'nostalgie'], src: 'pianodiary', url: 'https://youtube.com/shorts/ZZayAXwPvyo', mood: 'Délicatesse ; intimité, tension légère' },
  { id: 'pd40', n: 40, label: 'Apaisement (Soothing in E)', chords: 'E G♯m7 A E G♯m7 Aadd9', tonic: 'E', mode: 'major', tempo: 100, stated: true, emos: ['serenite', 'tendresse'], src: 'pianodiary', url: 'https://youtube.com/shorts/JAYFd8AuCko', mood: 'Apaisement ; chaleur, ouverture' },
  { id: 'pd41', n: 41, label: 'Ballade en Sol mineur (Beautiful ballad in G minor)', chords: 'Gm Dm/F E♭ B♭/D Gm/B♭ F/A D', bars: [1, 1, 1, 1, 1, 1, 2], tonic: 'G', mode: 'minor', tempo: 124, stated: true, emos: ['tendresse', 'tristesse'], src: 'pianodiary', url: 'https://youtube.com/shorts/1xnzJgQEw_0', mood: 'Beauté, ballade ; mélancolie, attente', note: 'durée du D final et retour sur Gm non relevés' },
  { id: 'pd42', n: 42, label: 'Nostalgie instantanée (4 Chords For Instant Nostalgia)', chords: 'Am G C F', bars: [0.5, 0.25, 0.25, 1], tonic: 'A', mode: 'minor', tempo: 100, stated: true, emos: ['nostalgie'], src: 'pianodiary', url: 'https://youtube.com/shorts/KelxDbTf-cw', mood: 'Nostalgie ; douceur amère', note: 'reprise non relevée' },
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
  ['m(maj7)', 'mineur avec septième majeure', 'Fm(maj7) = Fa–La♭–Do–Mi'],
  ['m(add9)', 'mineur avec neuvième ajoutée', 'Dm(add9) = Ré–Fa–La–Mi'],
  ['m(add11)', 'mineur avec onzième ajoutée (sans septième)', 'Am(add11) = La–Do–Mi–Ré'],
  ['maj9 / m9 / 9', 'septième de la famille + neuvième', 'Amaj9 = La–Do♯–Mi–Sol♯–Si'],
  ['7♭9', 'septième de dominante + neuvième mineure', 'E7♭9 = Mi–Sol♯–Si–Ré–Fa'],
  ['maj7(♯11)', 'septième majeure + quarte augmentée (lydien)', 'Cmaj7(♯11) = Do–Mi–Sol–Si–Fa♯'],
  ['6 / 6sus2', 'sixte ajoutée ; sans tierce, avec seconde', 'G6sus2 = Sol–La–Ré–Mi'],
  ['dim7', 'septième diminuée', 'G♯dim7 = Sol♯–Si–Ré–Fa'],
  ['+', 'augmenté', 'A+ = La–Do♯–Mi♯'],
  ['/', 'note imposée à la basse', 'C/E = Do majeur sur basse Mi'],
];

// suffixes reconnus : ceux de l'application (js/harmony.js) et les écritures courantes des sources (FmM7, Dmadd9, Aaug…)
const EMO_SUFFIX = {
  '': 'maj', m: 'min', maj7: 'maj7', M7: 'maj7', 7: '7', m7: 'm7', m6: 'm6', 6: '6', add9: 'add9', sus2: 'sus2', sus4: 'sus4', '7sus4': '7sus4',
  dim: 'dim', '°': 'dim', dim7: 'dim7', '°7': 'dim7', aug: 'aug', '+': 'aug', 'm7♭5': 'm7b5', m7b5: 'm7b5', ø7: 'm7b5', ø: 'm7b5',
  9: '9', maj9: 'maj9', m9: 'm9', '7♭9': '7b9', '7b9': '7b9', '7(♭9)': '7b9',
  'm(add9)': 'madd9', madd9: 'madd9', 'm(add11)': 'madd11', madd11: 'madd11', 'm(maj7)': 'mmaj7', mM7: 'mmaj7', mmaj7: 'mmaj7',
  'maj7(♯11)': 'maj7s11', 'maj7♯11': 'maj7s11', 'maj7#11': 'maj7s11', '6sus2': '6sus2', add4: 'add4', 'm(add4)': 'madd4',
};
const EMO_LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const emoPc = (s) => (EMO_LETTER[s[0]] + (s[1] === '♯' || s[1] === '#' ? 1 : s[1] === '♭' || s[1] === 'b' ? -1 : 0) + 12) % 12;

/**
 * « Am/G » → { rootPc: 9, letter: 'A', type: 'min', bass: 10 } (bass : demi-tons au-dessus de la fondamentale, 0 sinon ;
 * letter : lettre écrite de la fondamentale, pour garder A♯dim et ne pas en faire B♭dim).
 */
SS.parseLibraryChord = (sym) => {
  const m = /^([A-G][♯#♭b]?)(.*?)(?:\/([A-G][♯#♭b]?))?$/.exec(sym.trim());
  if (!m || !(m[2] in EMO_SUFFIX)) return null;
  const rootPc = emoPc(m[1]);
  return { rootPc, letter: m[1][0], type: EMO_SUFFIX[m[2]], bass: m[3] ? (emoPc(m[3]) - rootPc + 12) % 12 : 0 };
};

/** Mesures de chaque accord d'une grille de la bibliothèque (3 accords → 1, 1, 2 : une phrase de 4 mesures). */
SS.libraryBars = (entry) => {
  const n = entry.chords.trim().split(/\s+/).length;
  return entry.bars || (n === 3 ? [1, 1, 2] : new Array(n).fill(1));
};
SS.libraryFor = (emoId) => SS.EMOTION_LIBRARY.filter((x) => x.emos.includes(emoId));

/**
 * Une grille de la bibliothèque, transposée sur `tonic` (par défaut la sienne) dans son mode :
 * { key, grid: [{ degree, type, acc, bass?, bars }], chords (format SS.harmony.gridChord), skipped }.
 * Les accords sont rangés par degré dans la tonalité d'origine (A♯dim en Ré = La haussé), puis rejoués au même degré
 * dans la tonalité cible : la transposition garde l'orthographe des degrés.
 */
SS.libraryGrid = (entry, tonic) => {
  const H = SS.harmony;
  const from = { tonic: entry.tonic, mode: entry.mode };
  const key = { tonic: tonic || entry.tonic, mode: entry.mode };
  const bars = SS.libraryBars(entry);
  const grid = [];
  let skipped = 0;
  entry.chords
    .trim()
    .split(/\s+/)
    .forEach((sym, i) => {
      const c = SS.parseLibraryChord(sym);
      const g = c && H.toGridChord(from, c);
      if (!g) return void skipped++;
      grid.push({ ...g, ...(c.bass ? { bass: c.bass } : {}), bars: bars[i] });
    });
  const chords = grid.map((g) => H.gridChord(key, g.degree, g.type, g.acc, g.bass || 0));
  return { key, grid, chords, skipped };
};
