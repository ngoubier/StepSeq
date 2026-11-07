# StepSeq

Séquenceur pas-à-pas (step sequencer) dans le navigateur, pour faire de la musique avec des
boîtes à rythmes et des instruments, et enregistrer ses projets dans des fichiers.

## Lancer l'application

Aucune installation ni compilation : ouvrez `index.html` dans un navigateur récent
(Chrome, Edge, Firefox, Safari). Une connexion internet est nécessaire pour charger les sons.

Vous pouvez aussi la servir localement :

```bash
python3 -m http.server 8000
```

puis ouvrir <http://localhost:8000>.

## Interface

- **En-tête** : titre du projet, tempo (BPM), chiffrage de mesure (4/4 par défaut, x/4 ou x/8),
  nombre de mesures, le groove (swing, humanisation), puis les boutons **+** (ajouter une piste), **Lecture** et **Stop**.
  À droite : **Nouveau**, **Ouvrir** et **Enregistrer**.
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
- **Arpège** : comme Accord, mais les notes sont jouées en arpège (mode, vitesse, octaves réglables).

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
premier enregistrement ; les autres navigateurs téléchargent le fichier. Le travail en cours est
aussi sauvegardé automatiquement dans le navigateur.

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
| `js/fx.js`       | Fenêtre Effets par piste (chorus, delay, reverb) |
| `js/profiles.js`, `js/profiles-factory.js` | Profils de console (usine + personnels) |
| `js/mixer.js`    | Console de mixage : tranches, EQ, compresseur, limiteur, vumètres |
| `js/song.js`     | Mode chanson : scènes et arrangement |
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
