# AGENTS.md : travailler sur StepSeq

Guide pour toute personne ou tout agent qui modifie le code. Le [README](README.md) décrit ce que fait
l'application ; ce fichier dit comment y travailler sans casser sa cohérence.

## Le projet

StepSeq veut être un centre créatif de production musicale dans le navigateur : trouver une idée, composer,
reprendre, orchestrer, arranger, mixer, masteriser. Le propriétaire, Nicolas, écrit en français : l'interface, les
commentaires du code, les messages de commit et les descriptions de PR sont en français.

## Façon de travailler

- **Maquette avant le code.** Pour toute nouvelle interface ou tout changement visible, montrer d'abord une maquette
  HTML (rangée dans le dossier de maquettes du projet) et attendre son accord. Pas de code d'interface sans maquette validée.
- **Une PR par sujet**, petite et relisible. On ne fusionne pas sans l'accord de Nicolas.
- **Tests au minimum utile.** Lancer les tests unitaires (`node --test`, une dizaine de secondes) avant chaque PR.
  Les tests e2e (`tests/e2e/*.js`, Playwright) et les rendus audio coûtent cher : ne lancer que ceux qui touchent au
  sujet, une fois.
- **L'assistant « Nouvelle chanson » est l'écran de référence pour créer.** Toute nouvelle fonction de composition va
  dans l'assistant (`js/band.js`), les opérations pures dans `js/harmony.js`, `js/melody.js` ou `js/bandsong.js`.
  Harmonie a été retirée (PR #111) : ne pas la recréer. Penser à la Grille : une fonction de l'assistant doit
  survivre au passage Assistant ↔ Grille (`js/gridsync.js`).
- **Pas de panneau Claude dans l'application.** Claude pilote StepSeq depuis Chrome par `window.StepSeq`.
- Téléphone : la page légère `telephone.html` (`js/phone.js`, `js/phonesong.js`) ne charge que les moteurs, pas l'interface
  de l'ordinateur. Le concept « Carnet » reste abandonné.

## Architecture

- Application statique : pas de compilation, pas de dépendances, pas de modules. Chaque `js/*.js` ajoute un objet à
  `window.SS` (`SS.band`, `SS.audio`, `SS.melody`…). `index.html` les charge dans l'ordre : un fichier qui utilise un
  autre au chargement doit venir après lui (`js/melody.js` avant `js/bandsong.js`).
- Un nouveau fichier doit être ajouté à `index.html`, à `render.html` s'il sert au moteur audio (export, figer, bilan),
  et à la liste `require` des tests qui en dépendent.
- Écrire la logique en **fonctions pures, sans DOM**, testables sous Node (`globalThis.window = globalThis` puis
  `require` des fichiers), et garder l'interface à part (ex. `js/wizmix.js` / étape Mix de `js/band.js`).
- `js/band.js` fait plus de 12 000 lignes : y ajouter le moins possible, préférer un nouveau fichier pour un nouveau sujet.
- Réutiliser ce qui existe avant d'écrire une nouvelle table ou fonction : noms de notes (table unique en tête de la
  partie « Notes » de `js/sounds.js` : `SS.NOTE_NAMES`, `SS.NOTE_NAMES_FR`, `SS.CHORD_ROOTS`, `SS.TONIC_NAMES`,
  `SS.LETTER_PC`…), émotions (`SS.EMOTIONS` avec leur couleur, `SS.emotionColor`, `SS.FILM_EMOTIONS`, dans
  `js/emotions.js`), grilles d'accords (`js/harmony.js`). Ne jamais recopier une de ces listes dans un autre fichier.
- Le moteur audio tourne sur un seul fil : un module éteint doit être débranché, pas seulement mis à zéro
  (voir `tests/e2e/node-leak.js` pour les fuites de nœuds).
- Les tables générées (`js/band-levels.js`, `js/band-drive.js`, `js/library.js`, `js/dirt.js`, `js/vsco.js`,
  `js/libre.js`, `js/sample-tuning.js`, `js/dirt-tuning.js`) sont écrites par les scripts de `tools/` : les régénérer,
  ne pas les éditer à la main. Nouveau modèle de chanson : `MISSING=1 node tools/measure-levels.js` puis
  `node tools/band-drive.js <id>`.

## Règles d'interface

- **Pas de texte explicatif à l'écran.** Une explication va dans un petit « ? » qui ouvre une bulle d'aide :
  `SS.helpTip(texte, libellé)` en JavaScript, ou un élément marqué `data-helpify` (déplacé automatiquement dans un
  « ? »), ou `SS.setHelp(el, texte)` pour un « ? » existant. Les messages d'état (compteurs, « Aucune chanson ») restent visibles.
- **Couleurs et tailles par variables.** Couleurs : palette `--c-*` de `css/palette.css` (52 couleurs nommées, partagée avec la page téléphone).
  Tailles de texte : `--fs-xs`, `--fs-sm`, `--fs-md`, `--fs-lg`, `--fs-xl` (11 à 18 px) ; seuls les titres de 20 px
  et plus restent en px. Jamais de couleur ni de taille en dur dans un nouveau CSS ; en JavaScript, passer par
  `var(--c-…)`.
- **Texte non sélectionnable** (`body { user-select: none }`). Les champs de saisie, `.sd-code` et la classe
  `.selectable` restent sélectionnables : ajouter `.selectable` à tout texte que l'on doit pouvoir copier.
- **Lexique de l'interface** (validé le 2026-11-23) :
  - **Assistant** ou **Nouvelle chanson** : l'assistant de création, et lui seul (« Band » est son nom dans le code,
    jamais à l'écran). Les modes d'Auto Mix sont **Pilote auto** et **Conseils** ; le parcours film est **Musique de film**.
  - **Arrangement** : la fenêtre des scènes et de l'arrangement (bouton de la barre du haut). **Chanson** : la
    chanson elle-même (Nouvelle chanson, Mes chansons, lecture **Chanson | Scène**). Jamais « Song ».
  - **Grille** : les pistes du projet. **Scène** : une partie de la chanson ; **passage** seulement dans Musique de
    film (le morceau d'image entre deux repères).
  - **Ambient** : seulement le style de l'assistant. Les pistes à modules (Jardin, Paysage, Fresque) sont des
    **pistes génératives** (famille « Génératif »).
  - **Notes** en français avec ♯ et ♭ (`SS.noteNameFr`, `SS.NOTE_NAMES_FR`) : Do♯4, Mi♭. **Accords** en symboles
    internationaux, comme on les tape (Am, F, C/E). `SS.noteName` (C#4) reste pour les fichiers, les tests et Claude.
- Les réglages d'application vont dans la fenêtre **Options** (onglets), pas dans un nouveau menu.
- Les modèles « dans l'esprit de » ont des titres et des mélodies originaux (droits d'auteur). Pour les styles
  acoustiques, proposer d'abord les sons VCSL, VSCO ou le synthé intégré, pas General MIDI.

## Boîte à outils Claude (`js/claude-tools.js`)

`window.StepSeq` expose des outils en français (`aide`, `etat`, `ajouterPiste`, `assistantStyle`, `bilan`…) que
Claude appelle depuis l'extension Claude in Chrome. Quand une fonction visible change ou arrive, mettre à jour l'outil
qui la pilote (ou en ajouter un) dans la même PR, avec sa description dans `OUTILS`. Chaque écriture doit rester une
étape Ctrl+Z. Ne pas casser les noms d'outils existants. Test : `node tests/e2e/claude-tools.js`.

## Tests

| Commande | Quand |
|----------|-------|
| `node --test` | Avant chaque PR (tous doivent passer) |
| `node tests/e2e/<sujet>.js` | Seulement les fenêtres touchées (Playwright, Chromium préinstallé) |
| `node tests/e2e/perf-profile.js`, `node tests/e2e/node-leak.js` | Après un changement du moteur audio |

Une empreinte (`SIG` dans `tests/melody-section.test.js`) fige les mélodies des 40 inspirations d'origine : si une
évolution les change exprès, mettre l'empreinte à jour et le dire dans la PR.

## Commits et PR

- Branche par sujet, messages en français : un titre court, puis ce qui change et pourquoi.
- La description de PR dit ce que l'utilisateur verra, ce qui a été testé et comment (commandes), avec une capture
  pour un changement visible.
- Mettre le README à jour dans la même PR quand une fonction visible change.
