# StepSeq face à Cubase Pro 16 — point de comparaison

Référence : [`reference/cubase-16-description-fonctionnelle.md`](reference/cubase-16-description-fonctionnelle.md)
(description fonctionnelle de Cubase Pro 16, sorti le 4 novembre 2026, établie le 15 novembre 2026 d'après les
sources Steinberg). Ce document reprend ses 18 sections et indique, pour chacune, ce que StepSeq propose.

Le but n'est pas de faire de StepSeq un Cubase dans le navigateur : StepSeq reste un **séquenceur pas à pas** avec
une aide à la composition et au mixage. Cubase sert de **repère** pour situer chaque fonction, voir les manques qui
comptent pour nos usages (synthés, arpèges, synthwave, techno mélodique, cinématique) et choisir les prochaines
évolutions.

## Légende

| Repère | Sens |
|---|---|
| ✅ | Couvert : StepSeq a un équivalent direct |
| ➕ | StepSeq va plus loin que la description de Cubase |
| ◐ | Partiel : une partie de la fonction existe, ou sous une autre forme |
| ✗ | Absent, mais pertinent pour StepSeq |
| — | Hors périmètre : propre à un DAW audio, sans objet pour un séquenceur pas à pas |

## Vue d'ensemble

| § | Domaine Cubase | StepSeq | En bref |
|---|---|:---:|---|
| 1 | Organisation d'un projet | ◐ | Pistes Drum / Instrument / Synthé et scènes ; pas de pistes audio, de dossiers ni de groupes |
| 2 | Accords, gammes, accompagnements | ➕ | Fenêtre Key : grille par scène, rôles des accords, émotions, 39 grilles, génération des couches |
| 3 | Écriture et édition MIDI | ◐ | Ligne de pas, piano roll, transformations (inversion, rétrograde, mode, durées), pédale / modulation / pitch bend ; ni éditeur en liste ni Strum hors arpège |
| 4 | Quantification, groove, expression | ◐ | Grille à la double-croche, swing, humanisation, placement ; pas de triolets ni de groove extrait |
| 5 | Arpégiateurs et transformations MIDI | ➕ | Arp One (67 motifs, pas par pas, écho, ratchets, gestes), conditions de déclenchement |
| 6 | Instruments, sampling, rythmique | ◐ | Juno-106, synthés intégrés, échantillons, General MIDI ; pas de VST, d'échantillon importé ni de stacks |
| 7 | Enregistrement audio et MIDI | ✗ | Aucun enregistrement (ni audio, ni clavier MIDI) |
| 8 | Montage et correction audio | — | Pas de pistes audio |
| 9 | Séparation de stems | — | Sans objet |
| 10 | Arrangement et structure | ✅ | Scènes et arrangement (fenêtre Song) ; tempo et mesure uniques pour toute la chanson |
| 11 | Mixage | ➕ | Console Mix, bus partagés, sidechain, mastering, et l'assistant Auto Mix |
| 12 | Automation et modulation | ✅ | Lignes d'automation par scène, verrous de son par note, LFO 1 et 2 |
| 13 | Synthés et contrôleurs physiques | ✗ | Seulement par fichier MIDI exporté ; pas de Web MIDI |
| 14 | Orchestration, partition, image | ◐ | Instruments GM et cordes / cuivres échantillonnés, expression et articulations par note ; pas de techniques de jeu par note, de partition ni de vidéo |
| 15 | Voix synthétiques et paroles | ◐ | Les paroles guident la mélodie (syllabes) ; pas de synthèse vocale |
| 16 | Export et livraison | ✅ | Export MIDI complet ; export audio WAV (master et stems, 16 / 24 / 32 bits) avec bilan EBU R128 |
| 17 | Éditions | — | StepSeq : gratuit, dans le navigateur, sans installation |
| 18 | Fonctions clés pour nos usages | — | Voir « Priorités » plus bas |

## Détail par domaine

### 1. Organisation d'un projet — ◐

| Cubase | StepSeq |
|---|---|
| Chronologie linéaire, une ligne par piste | Pistes les unes sous les autres, chacune avec sa grille de pas ; la chanson est découpée en **scènes** |
| Piste audio | — (pas d'audio enregistré) |
| Piste MIDI / instrument | Piste **Instrument** (Mono, Accord, Arpège) et piste **Synthé** (Juno-106) |
| Piste de batterie | Piste **Drum** : une piste par élément (kick, caisse claire…), chacun pouvant venir d'une autre machine |
| Piste sampler | ✗ — pas d'échantillon personnel joué comme instrument |
| Groupe | ✗ — pas de bus de groupe (sous-mixage) |
| Piste d'effets | ✅ Bus partagés : plate, hall, écho à bande, Cosmos |
| Pistes de contrôle (accords, tempo, marqueurs, arrangement) | Accords : fenêtre Key ; arrangement : fenêtre Song ; marqueurs : noms des scènes ; tempo : unique |
| Dossiers, couleurs, visibilité | Nom et couleur par piste, hauteur Compact ; pas de dossiers |
| Pool | — (sons chargés depuis les bibliothèques en ligne) |

### 2. Composition harmonique — ➕

| Cubase | StepSeq |
|---|---|
| Piste d'accords, pistes qui suivent l'harmonie | **Key → Chanson** : grille commune de la scène ; l'onglet Grille « pose les accords, tout le reste suit » |
| Chord Pads | ◐ Palette d'accords dans le piano roll, essais A/B ; pas de pads jouables au clavier MIDI |
| Assistant d'accords | ✅ Assistant **émotion → grille**, 13 intentions, 39 grilles de référence sourcées, trois propositions contrastées |
| Éditeur d'accords | ✅ Types d'accords (Majeur, Mineur, 7, Maj7…), renversements et voicings dans Arp One |
| Scale Assistant | ✅ Onglet **Vérifier** : notes colorées selon leur fonction (accord, passage, tension, emprunt) |
| « Une grille ne fait pas un arrangement » | StepSeq va plus loin : **génération des couches** (basse, nappe, arpège, mélodie) et chansons complètes avec **Band** |
| Transformation du jeu MIDI en direct selon les accords | ✗ — pas d'entrée MIDI |

### 3. Écriture et édition MIDI — ◐

| Cubase | StepSeq |
|---|---|
| Key Editor (piano roll) | ✅ Piano roll : poser, allonger, déplacer, vélocité, accent ; sélection rectangle, copier / coller, Alt+glisser |
| Saisie souris / pas à pas | ✅ Souris et tactile ; ✗ pas de saisie pas à pas depuis un clavier MIDI |
| Transposer, copier, transformer | ✅ Flèches ↑ ↓ (demi-ton, octave), Ctrl+D ; menu **Transformer…** : inversion dans la gamme, rétrograde, autre mode, durées ×2 / ×½ |
| Contrôleurs (sustain, modulation, pitch bend…) | ✅ Lignes d'automation exportées en CC 74, 71, 11, 91, et contrôleurs MIDI : **pédale de sustain** (entendue dans StepSeq, CC 64), **modulation** (CC 1) et **pitch bend** (±2 demi-tons) pour un synthé externe. La pédale d'un fichier importé est convertie en durées de notes ; le sustain d'enveloppe (ADSR) est dans le sound design et sur le Juno-106 |
| Éditeur de batterie | ✅ Pistes Drum nommées par élément |
| Éditeur en liste | ✗ |
| **Strum** (Cubase 16) | ✅ Gestes d'Arp One (Balayage, Roulé, Harpe) pour les pistes Arpège ; strum automatique des guitares (bas sur les temps, haut sur les contretemps) dans l'onglet Jeu, pistes Accord comprises |
| **Stretch Selection** (Cubase 16) | ◐ Durées ×2 / ×½ de la sélection (pas d'étirement libre ni d'accélération interne) |
| Noms de contrôleurs par synthé | — |

### 4. Quantification, groove et expression — ◐

| Cubase | StepSeq |
|---|---|
| Quantification stricte | Toujours : la grille est à la double-croche (l'import MIDI quantifie aussi) |
| Quantification progressive, retour au non-quantifié | ◐ Micro-décalage par note (± ½ pas) et réglage **Placement** de la console |
| Grilles en triolets | ✗ — pas de triolets dans la grille (Arp One a des vitesses en triolets) |
| Groove extrait d'une boucle | ✗ — swing (1/16 ou 1/8, 50 à 75 %) et humanisation globale seulement |
| Expression : placement + vélocité + durée + articulation | ✅ Vélocité, longueur, accent, conditions ; Band écrit nuances, ghost notes et phrasé |

### 5. Arpégiateurs et transformations MIDI — ➕

| Cubase | StepSeq |
|---|---|
| Arpache 5 / SX | ➕ **Arp One** : 67 motifs en 10 catégories, réglages pas à pas (vélocité, longueur, degré, vitesse, ratchet), sens de lecture, renversements, voicings, gestes |
| Chorder | ✅ Pistes **Accord** |
| Auto LFO | ✅ **LFO 1 et 2** (hauteur, PWM, cutoff, volume, pan), calés sur le tempo |
| MIDI Echo | ✅ **Écho** d'Arp One, transposable (spirales) ; ratchet roulé |
| Step Designer | ✅ La grille de pas elle-même |
| MIDI Modifiers (dont aléatoire) | ➕ **Conditions de déclenchement** façon Elektron (probabilités, 1:4, 1er…), reproductibles et exportées |
| Éditeur logique | ✗ |

### 6. Instruments, sampling et programmation rythmique — ◐

| Cubase | StepSeq |
|---|---|
| Instruments VST fournis | Synthés Web Audio (sound design complet : 4 filtres, glide, PWM, sous-oscillateur, bruit, LFO), **Juno-106** (128 patches), VCSL, Dirt-Samples, 125 instruments General MIDI |
| Instruments tiers (VST) | — (navigateur) |
| Batteries | ✅ 5 bibliothèques (TR-808, TR-909, LinnDrum, DMX, General MIDI…) |
| Échantillon → instrument jouable | ✗ — pas d'import d'échantillon personnel |
| Séquenceur de patterns | ✅ C'est le cœur de StepSeq |
| **Instrument Stacks** (Cubase 16) | ✗ — superposition possible seulement avec plusieurs pistes qui jouent les mêmes notes |

### 7. Enregistrement — ✗

Aucun enregistrement : ni audio, ni MIDI (pas de Web MIDI), ni capture rétrospective. Le clavier de la façade du
Juno-106 se joue à la souris ou au clavier de l'ordinateur, mais n'écrit rien sur la piste. Comping, punch in/out,
pré-roll : sans objet tant qu'il n'y a pas d'enregistrement.

### 8 et 9. Montage audio et séparation de stems — —

Sans objet : StepSeq ne manipule pas d'audio enregistré. VariAudio, AudioWarp, Audio Alignment et séparation de
stems relèvent d'un DAW audio.

### 10. Arrangement et structure — ✅

| Cubase | StepSeq |
|---|---|
| Marqueurs | Scènes nommées (Intro, Couplet…) ; marqueurs écrits à l'export MIDI |
| Piste Arrangeur | ✅ Fenêtre **Song** : frise de blocs, répétitions, glisser-déposer, point de départ, mode Boucle / Chanson |
| TrackVersions | ◐ Scènes dupliquées (+ Copie) ; versions de la chanson dans « Mes chansons » |
| Tempo et signature variables | ✗ — un tempo et une mesure pour toute la chanson (seul le nombre de mesures change par scène) |
| Transposition globale | ◐ Transposition de la sélection ; les grilles de Key se transposent sur la tonique de la scène |
| Essayer plusieurs structures | ✅ Assistant Nouvelle chanson : vue « session » scènes × pistes avant création |

### 11. Mixage — ➕

| Cubase | StepSeq |
|---|---|
| MixConsole : gain, volume, pan, EQ, inserts | ✅ Console **Mix** : faders, EQ 5 bandes, compresseur, limiteur, panoramique |
| Départs d'effets | ✅ Envois vers les bus partagés |
| Groupes, routage | ✗ — pas de bus de groupe ni de routage libre |
| Sidechain | ✅ Sidechain sur le kick (déclenché par les notes, conditions comprises) |
| Dynamique, saturation, reverb, delay, modulation | ✅ Chorus, delay, reverb, écho à bande saturé, Cosmos (shimmer, freeze), saturation |
| Analyse | ➕ **Auto Mix** : écoute FFT, sept critères notés (LUFS, PLR, balance tonale, graves, stéréo…), conseils acceptés / ajustés, A/B à volume égal, pilote automatique |
| Control Room | — |

### 12. Automation et modulation — ✅

| Cubase | StepSeq |
|---|---|
| Automation de paramètres | ✅ Ligne **∿** par piste : filtre DJ, résonance, volume, envois reverb / écho / Cosmos ; dessin, formes toutes prêtes, longueur propre |
| Automation de plugin | ◐ Groupe « Son, à chaque note » (cutoff, PWM, decay du filtre, quantité des LFO), lu au début de chaque note |
| Modulateurs | ◐ LFO du sound design et formes « pompe » ; pas de modulateur sur les effets ou la console |
| Distinction automation / contrôleurs MIDI | ✅ Respectée : l'export MIDI ne garde que les courbes qui ont un CC |

### 13. Synthés et contrôleurs physiques — ✗

Pour piloter un **Fantom-06** ou un **Take-5**, StepSeq passe aujourd'hui par un fichier : **Exporter MIDI** (arpèges
rendus note par note, conditions appliquées, CC 7 / 10 / 74 / 71 / 11 / 91), puis lecture par un DAW ou le
séquenceur du synthé. Il manque :

- la **sortie Web MIDI** (jouer une piste sur un synthé matériel, en direct) ;
- l'**entrée Web MIDI** (jouer et enregistrer depuis un clavier, MIDI Remote) ;
- le retour audio, hors de portée d'un séquenceur dans le navigateur.

### 14. Orchestration, partition, image — ◐

Instruments General MIDI, cordes, cuivres et bois VCSL. **Jeu** (onglet du Sound design) : expression automatique
(arc de phrase, soufflet, « fp », timbre qui suit la nuance, respiration), phrasé automatique et articulations par
note (legato, staccato, détaché, tenuto, soufflet) — l'équivalent des Expression Maps, sans changement de technique
(pizzicato, trémolo) dans une même piste pour l'instant. Pas d'éditeur de
partition (le skill `midi-to-score` peut afficher la partition d'un fichier MIDI exporté), pas de vidéo.

### 15. Voix et paroles — ◐

Dans **Key → Mélodie**, des paroles facultatives sont découpées en syllabes françaises et donnent la structure de
la mélodie (une note par syllabe). Pas de synthèse vocale, et les paroles ne sont pas gardées sur les notes.

### 16. Export et livraison — ✅

| Cubase | StepSeq |
|---|---|
| Export audio (format, résolution, fréquence) | ✅ **Exporter l'audio…** : rendu hors temps réel, WAV 16 / 24 bits (dither TPDF) ou 32 bits flottant, 44,1 ou 48 kHz ; pas de MP3 ni de FLAC |
| Export de stems (par piste) | ✅ Par musicien ou par piste, avec leurs envois d'effets, sans le traitement du Master, alignés sur le master (archive .zip) |
| Export MIDI | ✅ Type 1, 480 PPQ, arrangement déplié, marqueurs, armures, arpèges rendus, correspondances GM |
| Traitements de sortie, presets de mastering | ✅ Module de mastering (graves en mono, largeur, écrêtage doux, limiteur −1 dBTP) et objectifs LUFS par style |

## Ce que StepSeq fait et que la description de Cubase ne mentionne pas

- **Band** : un groupe virtuel par style (synthwave, EDM mélodique, techno mélodique) qui écrit une chanson
  complète — scènes, parties, arrangement, mixage et mastering calibrés.
- **Composition guidée par l'émotion** et grilles de référence commentées.
- **Mélodie générée** sur une grille et une structure (ou des paroles), avec contrôles musicaux expliqués.
- **Auto Mix** : un assistant de mixage et de mastering qui mesure, explique et propose.
- **Conditions de déclenchement** reproductibles (la batterie varie à chaque passage, l'export reste fidèle).
- Rien à installer, enregistrement automatique avec versions, utilisable sur téléphone.

## Priorités tirées de la comparaison

Classées par intérêt pour nos usages (synthés, arpèges, composition) et par effort, compte tenu du code existant :

1. ✅ **Export audio dans l'application** (fait) : menu **Exporter l'audio…** — master et stems en WAV, rendus hors
   temps réel, avec le bilan EBU R128 du master.
2. **Sortie Web MIDI** vers un synthé matériel (Fantom-06, Take-5), piste par piste, avec canal MIDI : l'export
   MIDI sait déjà convertir notes, arpèges et automation.
3. ✅ **Strum sur les pistes Accord** (fait pour les guitares) : onglet Jeu du Sound design, bas / haut selon le temps.
4. **Entrée Web MIDI** : jouer depuis un clavier, puis enregistrement quantifié à la double-croche.
5. **Tempo et mesure par scène** (pont plus lent, mesure en 3/4).
6. **Triolets** dans la grille, et **groove** tiré d'une boucle.
7. **Bus de groupe** dans la console (batterie, nappes).

## Autres pistes intéressantes

Au-delà de la comparaison directe, classées par rapport entre effort et intérêt :

1. ✅ **Transformations mélodiques** (fait) : menu Transformer… — inversion dans la gamme, rétrograde, autre mode,
   durées ×2 / ×½.
2. **Variations de scène en un clic** : alléger, densifier, fill de fin de phrase, préparation de la scène suivante
   (filtre, bruit blanc, roulement) ; Band sait déjà les écrire, il s'agit d'en faire un outil sur tout morceau.
3. ✅ **Pédale de sustain, modulation et pitch bend** (fait) : contrôleurs MIDI des lignes d'automation, exportés
   (CC 64, CC 1, pitch bend) ; la pédale s'entend aussi dans StepSeq.
4. **Accords jouables au clavier de l'ordinateur** (façon Chord Pads) avec la grille de la scène, et écriture sur la
   piste de ce qui est joué au clavier de la façade du Juno, quantifié à la double-croche.
5. **Morceau de référence dans Auto Mix** : charger un MP3 et comparer balance tonale et volume perçu.

Plus ciblées :

- **Cinématique** : ✅ expression et articulations par note (onglet Jeu) ; reste l'export MIDI en CC 11 et les
  ralentis par scène.
- **Techno mélodique** : générateur de rythmes euclidiens, LFO sur les envois et les effets.
- **Couches** : une piste qui joue deux sons (unisson, octave) sans dupliquer les notes, équivalent léger des
  Instrument Stacks.
- **Passage vers Cubase** : export groupé MIDI + pistes WAV + tempo + marqueurs de scènes.
- **Partition** d'une piste ou d'une scène (le skill `midi-to-score` le fait déjà depuis un fichier MIDI).
