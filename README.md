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
  nombre de mesures, puis les boutons **+** (ajouter une piste), **Lecture** et **Stop**.
  À droite : **Nouveau**, **Ouvrir** et **Enregistrer**.
- **Partie centrale** : les pistes, les unes sous les autres. Chaque piste a un en-tête
  (écoute, Mute, Solo, nom, volume, réglages, suppression) et sa grille de pas
  (une case = une double-croche).
- **Barre du bas** : mode d'édition **On/Off** (cliquer / glisser pour activer des pas) ou
  **Vélocité** (cliquer-glisser verticalement sur un pas pour régler sa force).

### Ajouter une piste

Le bouton **+** ouvre une fenêtre qui demande :

1. le type de piste : **Drum** ou **Instrument** ;
2. un nom et une couleur ;
3. pour une piste **Drum** : le type de son (Kick, Snare, Clap, Hi-Hat, Toms, Crash, Ride…),
   la boîte à rythmes (TR-808, TR-909, LinnDrum, …) et la variation ;
4. pour une piste **Instrument** : la catégorie (**Mono**, **Arpège**, **Accord**), la famille
   (Bass, Synth Lead, Pads, Keys, Mallets, Strings, Brass & Winds, Guitar) puis l'instrument.

Le bouton **Écouter** permet d'entendre le son avant de valider.

### Pistes instrument

Le chevron **›** dans l'en-tête d'une piste instrument affiche son piano roll :

- **Mono** : une note par position ; cliquer pour poser, glisser vers la droite pour allonger.
- **Accord** : cliquer sur la fondamentale pose un accord du type choisi (Majeur, Mineur, 7, Maj7…).
- **Arpège** : comme Accord, mais les notes sont jouées en arpège (mode, vitesse, octaves réglables).

Cliquer sur une note / un accord existant le supprime. Sur la ligne compacte, un clic pose la
dernière note (ou le dernier accord) utilisée.

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
- les soundfonts General MIDI FluidR3 de [webaudiofontdata](https://github.com/felixroos/webaudiofontdata) ;
- plus quelques synthés Web Audio intégrés (saw, square, acid, supersaw, pads…).

## Structure du code

| Fichier          | Rôle |
|------------------|------|
| `index.html`     | Structure de la page et dialogue d'ajout de piste |
| `css/style.css`  | Thème et mise en page |
| `js/sounds.js`   | Catalogue des sons (batterie, familles d'instruments, accords) |
| `js/project.js`  | Modèle de projet, enregistrement / ouverture de fichiers |
| `js/audio.js`    | Moteur audio : chargement des échantillons, voix, séquenceur |
| `js/ui.js`       | Rendu des pistes, grille, piano roll, dialogue |
| `js/main.js`     | Démarrage, barre d'outils, raccourcis |
| `guide.html`     | Guide d'utilisation (bouton « Aide » de l'app) |
