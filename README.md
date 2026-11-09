# StepSeq

Séquenceur pas-à-pas (step sequencer) dans le navigateur, pour faire de la musique avec des
boîtes à rythmes et des instruments, et enregistrer ses projets dans des fichiers.

## Lancer l'application

**En ligne : <https://ngoubier.github.io/StepSeq/>** (GitHub Pages)

Ou en local : aucune installation ni compilation : ouvrez `index.html` dans un navigateur récent
(Chrome, Edge, Firefox, Safari). Une connexion internet est nécessaire pour charger les sons.

Vous pouvez aussi la servir localement :

```bash
python3 -m http.server 8000
```

puis ouvrir <http://localhost:8000>.

## Interface

- **En-tête** : icône de l'application (menu **Chansons**, **Nouveau**, **Ouvrir**, **Enregistrer**), titre du projet, tempo (BPM), chiffrage de mesure (4/4 par défaut, x/4 ou x/8),
  nombre de mesures, le groove (swing, humanisation), **Lecture** et **Stop**, puis les fenêtres regroupées
  **Band**, **Key One : tonalité** (fenêtre Key One, propre à chaque scène : assistant
  émotion → grille d'accords → couches pour démarrer, puis onglets Ambiance (émotions rangées par mode), Accords, Grille (accords glissés sur une ligne de mesures → basse, accords et arpège générés), Couches
  et Vérifier ; palette d'accords dans le piano roll, essais A/B), **Song One** (fenêtre Song : scènes et arrangement, avec une case pour garder le panneau
  d'arrangement affiché sous l'en-tête) et **Mix** (console de mixage).
  À droite : annuler / rétablir, l'indicateur d'enregistrement automatique et **Aide**.
  Le bouton **+ Ajouter une piste** se trouve sous les pistes.
- **Partie centrale** : les pistes, les unes sous les autres. Chaque piste a un en-tête
  (écoute, Mute, Solo, nom, volume, réglages, suppression) et sa grille de pas
  (une case = une double-croche).
- **Barre du bas** : mode d'édition **On/Off** (cliquer / glisser pour activer des pas) ou
  **Vélocité** (cliquer-glisser verticalement sur un pas pour régler sa force).

### Ajouter une piste

Le bouton **+** ouvre une fenêtre qui demande :

1. le type de piste : **Drum**, **Instrument** ou **Synthé** ;
2. un nom et une couleur ;
3. pour une piste **Drum** : le type de son (Kick, Snare, Clap, Hi-Hat, Toms, Crash, Ride…),
   la boîte à rythmes (TR-808, TR-909, LinnDrum, …) et la variation ;
4. pour une piste **Instrument** : la catégorie (**Mono**, **Arpège**, **Accord**), la famille
   (Bass, Synth Lead, Pads, Keys, Mallets, Strings, Brass & Winds, Guitar) puis l'instrument.

5. pour une piste **Synthé** : la catégorie, le synthé analogique (pour l'instant le **Roland Juno-106**)
   et son patch ; une fiche affiche la configuration du synthé.

Le bouton **Écouter** permet d'entendre le son avant de valider.

### Band : monter un groupe virtuel

Le bouton **Band** de l'en-tête ouvre une grande fenêtre (`js/band.js`, catalogue `js/band-presets.js`) :

1. le **style musical** : **Synthwave** ou **EDM mélodique** ;
2. le **type de chanson** : 10 inspirations par style (Smalltown Boy, Nightcall, Blinding Lights, Sweet Dreams…,
   Levels, Strobe, Opus, Faded…), avec un tempo suggéré ;
3. les **musiciens**, sur une scène. Un clic ouvre le panneau du musicien : son rôle, son instrument phare ★,
   5 instruments conseillés (▶ pour écouter) et l'accès à toute la bibliothèque via la fenêtre « Nouvelle piste ».
   Le **batteur** (et le percussionniste, optionnel) choisit un kit (★ + 5 conseillés) et coche ses éléments
   (kick, snare, hi-hats…) : une piste par élément, chaque élément pouvant venir d'une autre machine.

**Fermer et créer les pistes** crée les pistes, vierges de notes (et applique le tempo si la case est cochée) ;
**Annuler** / Échap ferme sans rien créer.

Les pistes créées par Band sont marquées dans le projet. Si le projet en contient déjà, une confirmation propose
de **remplacer** ces pistes Band par le nouveau groupe (en signalant celles qui contiennent des notes ; Ctrl+Z pour
revenir en arrière) ou de **garder et ajouter**. Les pistes créées sans Band ne sont jamais supprimées.

### Pistes instrument

Le bouton à curseurs de l'en-tête ouvre la fenêtre de **sound design** (oscillateur, filtre cutoff / résonance / enveloppe, ADSR, glide, niveau, panoramique, saturation), inspirée des paramètres de strudel.cc :

- filtre passe-bas, passe-haut, passe-bande ou coupe-bande, avec 4 modèles (comme `ftype()` de strudel) :
  **12 dB**, **24 dB**, **Ladder** (4 pôles façon Moog, avec drive) et **SEM** (variable d'état façon Oberheim) ;
- **glide** : *Portamento* (chaque note glisse depuis la précédente) ou *Glide legato* (façon Moog : seulement
  entre notes liées, sans redéclencher les enveloppes).

Sur une piste **Synthé**, ce bouton ouvre la façade du synthé : pour le Juno-106, les sections LFO, DCO
(16'/8'/4', impulsion + PWM, dent de scie, sous-oscillateur, bruit), HPF, VCF 24 dB/oct, VCA, ENV, chorus I / II,
et la sélection des 128 patches d'usine (groupe, banque, numéro) avec l'afficheur à LED, sur une copie de la
façade d'origine. Un clavier de 2 octaves sous la façade se joue à la souris ou au clavier de l'ordinateur (lettre affichée sur
chaque touche, 6 voix). Le son est un portage du moteur de l'[Ultramaster KR-106](https://github.com/kayrockscreenprinting/ultramaster_kr106).

Le chevron **›** dans l'en-tête d'une piste instrument affiche son piano roll :

- **Mono** : une note par position ; cliquer pour poser, glisser vers la droite pour allonger.
- **Accord** : cliquer sur la fondamentale pose un accord du type choisi (Majeur, Mineur, 7, Maj7…).
- **Arpège** : comme Accord, mais les notes sont jouées par l'**arpégiateur** (voir ci-dessous).

### Arp One, l'arpégiateur

Le bouton **Arp One** du piano roll d'une piste Arpège ouvre l'arpégiateur, titré avec le nom de la piste et la partie en cours (« Arp One · Juno-106 — Couplet ») (`js/arp.js` pour
le moteur, `js/arppanel.js` pour la fenêtre, `js/motifs.js` pour le catalogue de motifs).

**En-tête, toujours visible**

- **Lecture en boucle** de l'arpège sur l'accord de la piste ou un accord d'essai (choisi en deux menus) ;
  chaque réglage s'entend tout de suite. Sur une piste vide, **Poser sur la piste** place l'accord sur la boucle.
  La boucle dure le plus petit nombre de mesures entières qui contient au moins 16 pas et un cycle complet du
  motif ; la grille montre toute la boucle (repères de temps et de mesures) : les colonnes s'affinent quand la
  boucle s'allonge, sans descendre sous 18 px — au-delà, la grille défile pour suivre le curseur.
- **Réglage pas à pas** : cliquer un pas de la grille règle sa **vélocité**, sa **longueur** (¼ temps à
  4 temps), le nombre de **notes à la fois** (1 à 3 : la note + les notes de l'accord juste au-dessus) ou en fait
  un **silence** ; la rangée de vélocités se règle aussi en glissant.

**Onglet Arpège** — une ligne par réglage :

- **Motif** : la tuile du motif en cours ouvre la fenêtre de choix : 51 motifs classés en 8 catégories
  (Montées et descentes, Groupes qui grimpent — dont la **Double montée** A C E A′ · C E A′ C′ —, Sauts et
  intervalles, Basse et pédale, Octaves et répétitions, Synthwave et années 80, Accords et rythmes, Hasard),
  avec recherche et **Récents** ; chaque motif s'essaie en un clic et suit l'accord joué.
- **Vitesse** (1/4 à 1/32, normale / triolet / pointée), **octaves** (1 à 4), **pas** (4, 8 ou 16 : la
  longueur de la grille réglable pas à pas), **geste** (6 gestes tout prêts + **Ajuster ›**) et **durée des
  notes** (selon le geste, ou fixe : ¼ temps … 4 temps).

**Onglet Geste** — rendre un arpège moins mécanique, groupe de notes par groupe de notes :

- 6 **gestes tout prêts** : Mécanique, Balayage, Roulé, Boiteux, Détendu, Harpe ;
- un **pavé** : horizontal = **étalement** (resserrer le groupe, puis respirer avant le suivant), vertical =
  **alternance** (avancer ou retarder les notes paires du groupe) ;
- un **zoom sur un groupe** en millisecondes (grille en pointillés, respiration) et la taille des groupes
  (d'après le motif, ou 2, 3, 4, 6, 8) ;
- 5 curseurs dans l'ordre d'application : étalement, alternance, **microvariation** (± 0 à 20 ms, la note 1
  reste sur la pulsation, **Nouvelle prise** pour d'autres décalages), **accent** de la première note,
  **articulation** (durée dans l'espace avant l'attaque suivante) ;
- **Écouter : Régulier / Geste** pour comparer.

Le début de chaque groupe ne bouge jamais et chaque attaque est calculée depuis sa position prévue : aucune
dérive. Le moteur est déterministe : même accord, mêmes réglages, même prise et même position → mêmes notes.
Les anciens projets se rechargent à l'identique ; l'ancien « jeu humain » est converti en geste.

### Tests

```bash
node --test
```

(Node 18 ou plus récent ; les tests du moteur d'arpège n'ont besoin ni de navigateur ni de carte son.)

Tests de bout en bout des fenêtres de l'arpégiateur et Key One dans Chromium (nécessite le paquet `playwright`) :

```bash
node tests/e2e/arp-ui.js
node tests/e2e/arp-cursor.js
node tests/e2e/harmony-ui.js
node tests/e2e/grid-ui.js
```

Cliquer sur une note / un accord existant le supprime. Sur la ligne compacte, un clic pose la
dernière note (ou le dernier accord) utilisée.

### Sélection, copier, couper, coller

- **Maj+glisser** sur la ligne d'une piste ou dans le piano roll : sélection rectangle (Ctrl+glisser : ajouter).
- **Maj+clic** / **Ctrl+clic** sur une note : l'ajouter ou la retirer de la sélection.
- **Icône de la piste** (ou `Ctrl+A`) : sélectionner toute la piste.
- Piano roll, bande **Mesures** : clic = une mesure, glisser = plusieurs, Maj+clic = jusqu'à.
- Outil **Sélection** (barre du bas) : glisser sélectionne sans Maj (utile au tactile).
- `Ctrl+C` / `Ctrl+X` / `Ctrl+V` / `Ctrl+D` (dupliquer), `Suppr`, `Échap`. Le collage se fait à la case
  survolée par la souris, sinon au début d'une zone vide sélectionnée, sinon juste après la sélection.
  Glisser la vélocité ou la longueur d'une note sélectionnée modifie toutes les notes sélectionnées.
- **Glisser une note sélectionnée** déplace la sélection (en hauteur aussi dans le piano roll) ;
  **Alt+glisser** en déplace une copie. Flèches `←` `→` : un pas (Maj : une mesure),
  `↑` `↓` : un demi-ton (Maj : une octave).

### Raccourcis

- `Espace` : lecture / stop
- `Ctrl+S` (`Cmd+S`) : enregistrer — `Ctrl+Maj+S` : enregistrer sous
- `Ctrl+O` : ouvrir
- Double-clic sur le nom d'une piste : renommer

## Fichiers de projet

Les projets sont enregistrés au format JSON (extension `.stepseq.json`) : tempo, mesure, pistes,
sons choisis, pas et notes. Sous Chrome / Edge, **Enregistrer** réécrit le même fichier après le
premier enregistrement ; les autres navigateurs téléchargent le fichier.

### Enregistrement automatique, sans message (`js/store.js`, `js/mysongs.js`)

- **Mes chansons** (**Chansons**, dans le menu de l'icône de l'application) : chaque chanson est enregistrée automatiquement dans le navigateur
  (IndexedDB), environ une seconde après chaque modification, sous son identifiant. **Nouveau** et **Ouvrir**
  n'écrasent plus rien, et il n'y a plus d'avertissement en quittant la page. La fenêtre liste les chansons
  (ouvrir, dupliquer, supprimer) et leurs **versions** : un instantané au plus toutes les 10 minutes de travail,
  40 par chanson ; **Restaurer** garde l'état actuel dans les versions.
- **Fichier lié** (Chrome / Edge) : après un premier **Enregistrer** (ou un **Ouvrir**), chaque modification
  réécrit ce fichier. Le lien est gardé d'une session à l'autre ; après un redémarrage du navigateur,
  l'indicateur affiche « Reprendre *fichier* » : un clic redonne l'autorisation d'écrire. Placé dans un dossier
  Dropbox / OneDrive / Google Drive, le fichier est aussi sauvegardé sur le web.
- L'indicateur d'enregistrement (barre du haut) montre l'état (« Enregistré · chanson.stepseq.json ») ; un clic ouvre
  « Mes chansons ». Les données restent dans ce navigateur : pour changer d'appareil, passe par le fichier.

## Sons

Les sons proviennent des bibliothèques utilisées par [strudel.cc](https://strudel.cc) :

- [tidal-drum-machines](https://github.com/ritchse/tidal-drum-machines) (boîtes à rythmes),
  via [dough-samples](https://github.com/felixroos/dough-samples) ;
- [VCSL](https://github.com/sgossner/VCSL) (Versilian Community Sample Library) ;
- le piano de dough-samples ;
- [Dirt-Samples](https://github.com/tidalcycles/Dirt-Samples) : banques de batterie, et banques mélodiques jouées
  comme instruments (Mighty Moog, Pluck Bass, JV Bass, Jungle Bass, Juno, SID, Hoover, pads…) ;
- les soundfonts General MIDI FluidR3 de [webaudiofontdata](https://github.com/felixroos/webaudiofontdata) ;
- plus quelques synthés Web Audio intégrés (saw, square, acid, supersaw, pads…).

## Skills de composition (Claude Code)

Le dossier `.claude/skills/` contient les skills qui guident la composition, et dont les règles sont reprises
par la fenêtre **Key One** :

| Skill | Contenu | Dans StepSeq |
|-------|---------|--------------|
| `composition-harmonie-synthetiseur` | Gammes, accords, degrés, progressions, voicings, basse / arpège / mélodie, parcours en 8 modules | Tonalité, palette d'accords, progressions, génération de couches, vérificateur |
| `arranger-orchestrer-finaliser` | Arrangement, orchestration, mixage, mastering | Méthode « une couche à la fois », démos mixées et masterisées |
| `musicemotion` | Composer à partir d'une émotion : matrice émotion → procédés, trois pistes contrastées, essais A/B | Section Émotion : 13 intentions, propositions, essais A/B, modes |

## Structure du code

| Fichier          | Rôle |
|------------------|------|
| `index.html`     | Structure de la page et dialogue d'ajout de piste |
| `css/style.css`  | Thème et mise en page |
| `js/library.js`  | Catalogue généré depuis strudel.cc (125 soundfonts gm_*, VCSL) |
| `js/dirt.js`     | Catalogue généré des banques mélodiques de Dirt-Samples |
| `js/sounds.js`   | Catalogue des sons (batterie, familles d'instruments, accords) |
| `js/filters.js`  | Filtres Ladder et SEM (AudioWorklet) du sound design |
| `js/project.js`  | Modèle de projet, enregistrement / ouverture de fichiers |
| `js/audio.js`    | Moteur audio : chargement des échantillons, voix, séquenceur |
| `js/sounddesign.js` | Fenêtre de sound design (VCO, filtre, ADSR, glide, sortie) |
| `js/juno.js`     | Synthés analogiques : catalogue, 128 patches d'usine du Juno-106, un AudioWorklet par piste |
| `js/juno-dsp.js` | Moteur du Juno-106 (AudioWorklet), porté de l'Ultramaster KR-106 — GPL v3 |
| `js/junopanel.js` | Façade du Juno-106 (sound design des pistes Synthé) |
| `js/groove.js`   | Fenêtre Groove (swing, humanisation) |
| `js/harmony.js`  | Aide à la composition : gammes, accords diatoniques, identification des accords, estimation de la tonalité, vérificateur d'harmonie |
| `js/emotions.js` | Intentions émotionnelles (skill MusicEmotion) : matrice et trois propositions par intention |
| `js/harmonypanel.js` | Fenêtre Key One de la scène en cours : assistant en 3 étapes, onglets Ambiance, Accords, Grille, Couches, Vérifier |
| `js/fx.js`       | Fenêtre Effets par piste (chorus, delay, reverb) |
| `js/profiles.js`, `js/profiles-factory.js` | Profils de console (usine + personnels) |
| `js/mixer.js`    | Console de mixage : tranches, EQ, compresseur, limiteur, vumètres |
| `js/song.js`     | Mode chanson : scènes et arrangement, fenêtre Song One |
| `js/ui.js`       | Rendu des pistes, grille, piano roll, dialogue |
| `js/main.js`     | Démarrage, barre d'outils, raccourcis |
| `guide.html`     | Guide d'utilisation (bouton « Aide » de l'app) |

## Licences

- `js/juno-dsp.js` et la table des patches d'usine de `js/juno.js` sont dérivés de
  l'[Ultramaster KR-106](https://github.com/kayrockscreenprinting/ultramaster_kr106)
  (Karl LaRocca, David Mansfield et contributeurs), sous licence **GNU GPL v3**
  (texte : [`licenses/GPL-3.0.txt`](licenses/GPL-3.0.txt)). Distribuer StepSeq avec ces fichiers
  implique de le distribuer sous GPL v3.
- La police de l'afficheur à LED, `fonts/Segment14.otf` (Paul Flo Williams), est sous licence SIL OFL 1.1
  ([`licenses/OFL-Segment14.txt`](licenses/OFL-Segment14.txt)).
