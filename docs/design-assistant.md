# Design de l'assistant « Nouvelle chanson »

Consigne de design de l'assistant (`js/band.js`, `#bandDlg`). Référence visuelle : la maquette approuvée
(`docs/maquette-assistant.html`). Le but : que le vrai assistant ait la même clarté que la maquette,
sans perdre aucune fonction.

> Les maquettes HTML citées ici (`docs/maquette-*.html`) ont été retirées du dépôt le 2026-11-20 : elles restent
> dans l'historique git (`git show 92c4d0c:docs/maquette-assistant.html`) et dans les fichiers du projet
> (`maquettes/anciennes-docs/`).

## Constat (novembre 2026)

Le vrai assistant marche, mais il est plus lourd à l'œil que la maquette :

1. **Fenêtre posée sur l'application.** L'application reste visible autour. La barre des 12 étapes est horizontale, serrée,
   sans résumé, et l'espace utile est réduit.
2. **Cadres dans des cadres.** Il y a une fenêtre, puis un panneau, puis une carte, puis des cases, chacune avec sa bordure.
3. **Contrôles de générations différentes.** Les hauteurs de boutons, les rayons, les segments et les puces
   ne s'accordent pas : le segment bleu plein voisine avec des puces arrondies et des boutons gris.
4. **Pas de tête d'étape.** Rien ne dit en grand où l'on est ni à quoi sert l'étape (la maquette affiche « 05 Batterie » et une phrase).
5. **Étape Style pauvre.** Elle montre une liste de pastilles et une longue colonne d'inspirations, sans image par style.
   La maquette a de grandes cartes illustrées. C'est l'élément que l'utilisateur préfère.
6. **Étape Scènes chargée.** Chaque bloc de l'arrangement affiche en permanence 6 petits boutons.

## Principes

- **Un seul niveau de carte.** Une zone = une carte (`.bw-card` : fond panel, 1 px de bordure, rayon 10). Ce qui est
  dans une carte n'a pas de bordure à soi, sauf les objets cliquables (puces, cases, cartes de motif).
- **La mise en page sépare**, pas les traits : `gap` de 12 à 16 px entre cartes, 8 px dans une carte.
- **On sait toujours où on est** : un stepper vertical avec un résumé par étape, et une tête d'étape.
- **Les choix se voient par la couleur du rôle** : un élément choisi a un fond teinté (`color-mix` 22 %) et une bordure
  de la couleur du rôle (batterie rose, basse verte, nappe bleue, arpège turquoise, mélodie violette,
  accords or). Pas d'aplat bleu vif.

## Jetons (scopés sur `#bandDlg`)

```css
#bandDlg {
  --bw-bg: #121215; --bw-panel: #1b1b20; --bw-panel2: #232329; --bw-raise: #2c2c34;
  --bw-line: #36363f; --bw-line2: #4a4a55;
  --bw-text: #ececf1; --bw-muted: #9c9ca8; --bw-dim: #6a6a76;
  --bw-accent: #3b8eea;                         /* sélection neutre (étape en cours, bouton principal) */
  --bw-r-ctl: 6px; --bw-r-card: 10px;           /* deux rayons seulement */
  --bw-h: 30px; --bw-h-sm: 26px;                /* hauteur des contrôles */
}
```

- **Espacements** : 4, 8, 12, 16, 24 px uniquement.
- **Typographie** (police de l'app) :
  - titre d'étape : 22 px, 700, avec le numéro « 05 » en gris 600 ;
  - titre de carte : 13 px, 600, gris ;
  - étiquettes : 11 px, majuscules, interlettrage 0,08 em, gris foncé ;
  - texte : 14 px ;
  - chiffres en `tabular-nums`.
- **Contrôles** :
  - bouton, segment et select font `--bw-h` de haut, puces et petits boutons `--bw-h-sm` ;
  - un **segment** est un conteneur `panel2`, et l'option choisie est en relief (`raise` + liseré `line2`), pas en aplat bleu ;
  - le bouton principal (Suivant, Créer) reste en accent plein.

## Cadre

1. **Plein écran.** L'assistant occupe toute la fenêtre du navigateur : pas de marge, pas de coins, l'application n'est plus
   visible derrière. Il est en grille, de haut en bas :
   - **en-tête** (hauteur fixe) : titre « Nouvelle chanson », un encadré tempo / tonalité / position (tempo et tonalité
     dans la police de l'app, pas en LCD rouge ; seule la position garde la police Segment14, en bleu comme la barre de
     l'application), transport (lecture, stop), fermer ;
   - **corps** : stepper à gauche (232 px), contenu à droite, qui défile seul ;
   - **pied** : « ← <étape précédente> » et « <étape suivante> → » (avec le nom des étapes), « Créer la chanson » à la fin.
2. **Stepper vertical** à la place de la barre horizontale. Les étapes sont groupées : « Fondations » (1 à 5 : Style, Instruments, Tempo et tonalité, Scènes, Accords),
   « Instruments, scène par scène » (une étape par instrument du groupe, nombre variable, pastille de la couleur de son type),
   « Finaliser » (Effets et transitions, Mix, Intégration). Les numéros suivent ; en code, `ST.chords`, `ST.fx`, `ST.mix` et `ST.pick` sont calculés et une
   étape instrument s'adresse par `{ inst: id }` (`stepRef`, `stepNum`).
   - Chaque étape a sa pastille numérotée, son nom et un résumé d'une ligne (par exemple « Synthwave », « 132 BPM · Do mineur »,
     « 5 scènes · 88 mesures », le motif de la scène…).
   - L'étape en cours est en relief. Une étape visitée a une coche de la couleur de son rôle.
   - Sous 900 px, le stepper devient une bande horizontale qui défile, sans les résumés.
3. **Tête d'étape** en haut du contenu : « 05 Batterie » puis une phrase (78 caractères au plus) qui dit à quoi sert l'étape.
4. Le **bandeau de lecture** actuel (`#bwTransport`) passe dans l'en-tête. Il n'est plus répété dans le contenu.

## Étapes

- **1 Style**
  - En haut, à droite, le segment Créer / Reprendre.
  - Puis **quatre grandes cartes de style** (grille `auto-fit, minmax(230px, 1fr)`). Chaque carte a :
    - une **image dessinée en canvas** de 110 px de haut, propre à chaque style :
      - Synthwave : soleil couchant rayé et grille en perspective, violet et rose ;
      - EDM : barres d'égaliseur, bleu cyan ;
      - Ambient : ondes superposées, vert d'eau ;
      - Techno : cercles concentriques et stroboscope, gris acier et rouge.
    - le nom (19 px), la phrase du style, puis une petite liste : tempo, tonalités, structure type, batterie.
  - La carte choisie a une bordure accent.
  - Dessous, les **inspirations** en grille de cartes compactes (2 ou 3 colonnes) : titre, artiste · année,
    tempo · musiciens. Le détail de l'inspiration choisie est à droite, ou sous la grille en étroit.
- **2 Instruments** : la scène des musiciens (tuiles rondes placées par rôle), dans une seule carte, sans double bordure ; le groupe est
  **éditable** (voir « Le groupe éditable » plus bas).
- **3 Tempo et tonalité** :
  - le tempo s'affiche en grand chiffres (police de l'app, pas de LCD rouge) ;
  - les toniques sont un clavier de 12 touches, les touches noires plus sombres ;
  - les modes sont un segment, les notes de la gamme des pastilles (la tonique bordée de vert).
- **4 Scènes** :
  - Les blocs de l'arrangement sont plus grands et sans commandes visibles au repos : nom et nombre de mesures.
    ‹ › − + × apparaissent au survol et au focus (`:hover`, `:focus-within`), et toujours sur écran tactile
    (`@media (hover: none)`).
  - Les lignes de scène sont plus simples : un liseré de couleur du type, le nom éditable, le segment 4 / 8 / 16 / 32 et
    des boutons icônes (+, dupliquer, ×).
- **Un onglet par instrument** (maquette : `docs/maquette-instruments.html`) : tête « 07 Synth Bass » avec, à côté de la phrase, le type en
  lecture seule (petite étiquette colorée « Arpèges », `#bwKindTag`, couleur du type). Le type ne se choisit pas ici : plus de cartes. Sous la
  tête, la barre de piste, la colonne des scènes et l'éditeur du type. Les réglages sont ceux de l'instrument et de la scène (`parts[section].inst[id]`).
  **Le type se choisit à l'étape 2 (Instruments)**, dans le panneau de droite du musicien sélectionné : juste sous le titre, une liste
  « Type » (`<select>` : Drums, Basse, Accords, Arpèges, Mélodie) dans une ligne au liseré de la couleur du type. Un kit de batterie ne peut être
  que Drums : liste désactivée, avec « Un kit de batterie ne joue que des motifs de batterie. ». Un musicien à plusieurs instruments a une liste
  par instrument. Changer la valeur met à jour le stepper (pastille, résumé) ; il n'y a plus de liste d'étiquettes sous la scène. Il n'y a pas de
  bouton « + Ajouter un instrument » : l'assistant n'a pas de mécanisme d'ajout d'un musicien.
- **Accords et onglets d'instrument** : la barre de piste reste, en haut du contenu, sous la tête d'étape ; elle n'a que « On entend » (une pastille par instrument, Muet) et « Seule » (solo) : il n'y a plus de menu « Piste » (le son et le kit se choisissent à l'étape Instruments, avec leurs éléments). Les cartes internes (bibliothèque de motifs,
  modes, aperçu des notes) perdent leur bordure quand elles sont déjà dans une carte.

## Ce qui ne change pas

Les identifiants et crochets de test (`#bwNext`, `#bwBack`, `#bwCreate`, `#bandStyles [data-v]`, `#bandPresets .band-preset`,
`.bh-scene`, `#bwTransport`…), le comportement, les données. Seule la présentation change.

## Mise à jour (novembre 2026) : dans la fenêtre principale

L'assistant n'est plus une fenêtre plein écran (`<dialog>`) mais une zone de la fenêtre principale (`#bandDialog`, `body.wizard-mode`) :
elle remplace les pistes, sous la barre du haut qui reste visible. Plus d'en-tête propre : Lecture / Stop, tempo, position et tonalité sont
ceux de la barre du haut. Pied : un seul bouton **Fermer** (et « Chanson vide » à l'étape 1) ; on change d'étape par le stepper.
« Créer la chanson » est dans l'étape Intégration, General MIDI dans l'étape 2.

## Brouillon (novembre 2026)

Le travail de l'assistant est enregistré **dans le projet** (`project.wizard = { v, savedAt, createdAt?, state }`, `js/wizdraft.js` pour la
mise en forme JSON, `wizSnapshot` / `wizRestore` dans `js/band.js`), tout seul, débouncé, dès que l'état diffère de celui de l'ouverture.
Rien n'est créé : ni piste, ni entrée Annuler / Rétablir (l'historique ignore `wizard`).

- **Indication** : à gauche de « Chanson vide » / « Fermer », `#bandDraft`, « Brouillon enregistré » : texte discret de 12 px, `--bw-dim`, sans
  bordure ni pastille (ce n'est pas un bouton) ; caché tant que rien n'est écrit ; l'heure d'enregistrement est dans l'infobulle.
- **Fermer / Échap** gardent le brouillon. **Créer la chanson** le garde aussi, avec `createdAt` (le menu dit alors « chanson créée le… »).
- **Reprendre** : « Reprendre l'assistant » dans le menu de l'application (visible seulement si le projet a un brouillon ; sous le libellé, la
  date en `--muted`) rouvre à l'étape et à la scène où l'on était. « Nouvelle chanson sur ce projet… » demande « Remplacer le brouillon de
  l'assistant ? » ; « Nouvelle chanson… » part d'un projet neuf (l'ancien, brouillon compris, reste dans Mes chansons).

## Le groupe éditable (novembre 2026)

Maquette approuvée : `docs/maquette-musiciens.html` ; code : `js/bandgroup.js` (modèle, sans navigateur, `tests/bandgroup.test.js`) et
l'étape 2 de `js/band.js`. Écart voulu avec la maquette : la disposition en scène (tuiles rondes placées par rôle : fond, milieu, devant)
est gardée, avec la tuile « + Ajouter un musicien » dans une dernière rangée ; les sons proposés sont les vrais conseillés de l'appli.

- **Modèle** : `S.group = { style, nextId, list }`, une liste de 2 à 10 musiciens `{ id, base, name, custom?, type?, ms? }`. Le groupe par défaut est
  celui de l'inspiration : ses musiciens non facultatifs, dans son ordre (sans retouche la chanson est strictement identique ; les anciens
  musiciens facultatifs, dont le percussionniste, ne sont plus « dans le groupe » : on ajoute un musicien du type voulu). Un musicien ajouté
  ou dupliqué a un id stable `x1`, `x2`… (jamais réutilisé), un nom (premier numéro libre : « Bassiste 2 »), un type et son choix de son. L'ordre
  de la liste est celui des onglets. `musicians()` rend chaque membre sous la forme d'un musicien d'inspiration, pour que `musState`,
  `plannedTracks`, `wizCols` (ids `musicien:clé[#n]`), `insSteps`, la barre de piste, le mix et l'écoute n'aient rien à changer.
- **Moteur** : un musicien ajouté prend le rôle de son type (`ROLE_OF_TYPE` : drums → `perc`, bass, chords → `pad`, arp, melody → `lead`) ;
  `SS.bandSong.build` le reconnaît à son id (`isExtra`) : il joue dans toutes les scènes avec le générateur de son type (comme un type
  changé : réglages de l'instrument seulement, mode du plan pour ce type sinon mode par défaut) et sa graine contient son id (deuxième mélodie
  différente, deuxième kit au motif propre). Mix (`js/wizmix.js`) : ses tranches sont les siennes, suffixées par son id (`arp@x1`, `kick@x2`).
  Changer le type d'un musicien (liste « Type ») remplace son son par le phare du nouveau type ; ses conseillés sont ceux de ce type
  (`SS.bandGroup.recommended` : le musicien de ce type dans l'inspiration, même facultatif, sinon dans le style, sinon dans le catalogue).
- **Interface** : compteur « N musiciens · 2 à 10 » près du titre (alerte à 10). Tuile « + Ajouter un musicien » (désactivée à 10 avec la
  mention). Ajout en deux temps dans le panneau de droite : 1/2 cinq cartes de type (avec « n dans le groupe »), 2/2 le son (Conseillés réels,
  « Tous les instruments… » ; pour Drums, les kits et « Tous les kits… ») avec le nom éditable ; tuile fantôme pendant l'ajout ; Annuler.
  Panneau d'un musicien : nom éditable au titre (l'onglet est renommé ; un onglet non renommé garde le nom du son), Type (un kit : Drums
  seulement), son, ‹ › pour l'ordre (ou glisser une tuile sur une autre), Dupliquer, « Retirer du groupe » avec confirmation en ligne
  (désactivé à 2 : « 2 musiciens au minimum »). Retirer efface ses réglages par scène, son type, son muet / solo / volume et sa tranche de mix
  (`SS.bandGroup.purge`, puis `mixSync`).
- **Changer d'inspiration** : même style, le groupe repart de celui de la nouvelle inspiration en gardant les musiciens ajoutés (à la fin) ;
  autre style, le groupe du nouveau style, sans rien garder. « Nouvelle chanson » repart toujours du groupe de l'inspiration.
- **Brouillon** : `project.wizard.v` passe à 2 et porte `state.group`. Un brouillon v1 (sans groupe) est migré : les musiciens qui étaient
  « dans le groupe » (`cache[preset][id].on`) forment la liste, ou le groupe par défaut s'il en reste moins de deux.
- CSS : `#bandDialog .bg-*`, jetons `--bw-*` ; à 390 px le panneau reste une feuille du bas, sans défilement horizontal.

## Accents de la basse (novembre 2026)

Maquette : `docs/maquette-accents.html`. Onglet d'un instrument de type Basse, pour la scène choisie.

- **Données** : `parts[section].inst[id].accents = { steps, repeat, force, filter, bright }` (valeurs par défaut : `[]`, 1, 75, false, 60 ; réglage absent quand tout est par défaut). `steps` : pas en doubles-croches dans la période ; `repeat` : 1 (16 pas, chaque mesure), 2 (32 pas) ou `'scene'` (toute la scène). Passe dans le brouillon (`parts` est copié tel quel) et dans « Copier vers les scènes du même type ».
- **Moteur** (`js/bandsong.js`) : une note de basse qui commence sur un pas accentué (modulo la période) reçoit `vel + (27/127) × force / 100` (vélocité 100 → 127 pour force 100). Avec `filter`, elle porte aussi `acc: true` et `accAmt: bright / 100` : le synthé applique alors l'accent du séquenceur (`SS.accentParams` : filtre ouvert, résonance, gain) avec cette brillance à la place du réglage « accent » du son. Sans `accents`, sortie identique. `accentPreset(id, notesSteps, period, seed)` : sept motifs (Aucun, Temps forts, Chaque temps, Contretemps, Galop, Synco 3-3-2, Aléatoire léger), seulement sur des pas où une note commence.
- **Accès (panneau masqué par défaut)** : ni la ligne ni la carte « Accents » ne sont affichées à l'ouverture. Dans le menu du bouton « Automation » (instrument de type Basse seulement), une section « Accents », séparée des paramètres d'automation, propose l'entrée « Accents » (« Accents · 4 » s'il y a des accents sur des notes, coche et « ouvert » quand le panneau est affiché). Elle ouvre/ferme le panneau, rangé sous le piano-roll après les courbes d'automation, avec la même tête qu'elles : chevron (replier sur sa tête) et × (fermer : masque seulement, les accents sont gardés ; « Effacer » reste dans la carte). Les notes accentuées restent vives avec leur chevron « > » et se cliquent même panneau fermé. Le compteur « Automation · N » ne compte que les courbes (les accents ont leur propre compte dans le menu, la pastille de scène et le résumé du stepper). État d'affichage : par instrument et par scène, en mémoire dans l'assistant (`S.wiz.accView`), jamais enregistré avec la chanson ni dans le brouillon ; les courbes d'automation, elles, gardent leur état replié dans leurs réglages (`hidden`).
- **Interface** : notes du rouleau cliquables (note vive + chevron), ligne « Accents » du panneau, alignée (un point par note, hachuré pour les mesures qui reprennent le motif), segment de répétition (le motif est recopié ou tronqué pour garder le même rendu), carte des motifs dans le panneau (motifs avec dessin, potentiomètre Force « +x dB / vélocité y », interrupteur « Ouvre le filtre » + potentiomètre Brillance, Effacer). Résumé du stepper « Basse · Croches · 2 accents », pastille « n accents » dans la colonne des scènes (n : accents du motif qui tombent sur une note). Changer le mode, la pédale ou le registre garde les accents qui tombent encore sur une note. Le rouleau défile en interne (9 px par pas minimum) : la page ne défile pas à 390 px.
- **Limites** : le Juno-106 (synthé analogique) n'a pas d'ouverture de filtre par note, seule la vélocité s'entend ; l'export MIDI d'une note à filtre ajoute le surcroît de vélocité de l'accent du séquenceur. Les potentiomètres reprennent le rendu d'Arp One (`dialKnob`).


## Automation par scène

Maquette : `docs/maquette-automation.html`. Données : `parts[section].inst[id].auto = { [réglage]: { shape, a, b, period?, points?, from?, hidden? } }` (réglages : filter, res, vel, volume, reverb, echo, space, vcf, fdecay, lfoamt ; a, b et points sont normalisés 0..1 sur l'étendue du réglage, pas en doubles croches depuis le début de la scène). Moteur : `SS.bandSong` (`autoCurve`, `autoPoints`, `autoLane`, `normalizeAuto`, voir l'en-tête de la section « automation par scène » de js/bandsong.js) ; chaque courbe devient `track.auto[réglage]` de la scène pour toutes les pistes de l'instrument (un kit : toutes ses pièces) et remplace, pour ce réglage et cette scène, la courbe du plan ; wizmix.js passe ensuite (volume mis à l'échelle, envois additionnés, filtre remplacé s'il est allumé). `vel` n'est pas une courbe de piste : il multiplie la vélocité des notes (100 = inchangé), avant les accents de la basse.

Interface (tous les types d'instrument) : rien n'est affiché par défaut. Le bouton « Automation · n ▾ » de la tête de scène ouvre un menu de 10 réglages (réglages du son grisés « synthés seulement » selon `SS.autoParamsFor`, « ajouté » sur les présents, Tout masquer / Tout afficher ; flèches, Échap et clic extérieur ferment). Chaque courbe a un panneau (`.bwau-*`, jetons `--bw-auto`, `--bw-grid`) sous le piano-roll (sous la tête sans piano-roll, sous la grille pour la mélodie) : formes prêtes, deux réglages, retouche au dessin (glisser, double-clic, clic droit ou Alt+clic ; au clavier flèches et Suppr) qui donne la forme « Dessinée » et « ↺ Revenir à la forme ». Un panneau replié devient une ligne fine avec mini-courbe et joue quand même (`hidden` ne change pas la chanson). Pastille « auto » dans la colonne des scènes, « · auto » dans le résumé du stepper. Les courbes suivent « Copier vers les scènes du même type » et le brouillon ; l'écoute de la scène les entend. Écart avec la maquette : sur l'onglet Mélodie, les courbes ne sont pas alignées sur les mesures de la grille (colonne d'en-tête), et les valeurs neutres des formes plates sont celles du réglage (volume 100 %, vélocité 100).

## Popover des effets de l'étape Mix (novembre 2026)

Le bouton « FX » d'une tranche ouvre `#mxFx` en **panneau flottant** (`position: fixed`, `js/band.js` : `mixFxPlace`, `mixFxToggle`, `mixFxClose`), ancré à la tranche cliquée : à droite s'il y a la place dans la zone visible de la console, sinon à gauche ; haut aligné sur celui de la tranche, borné à la fenêtre (le contenu défile dans le panneau), largeur 560 px au plus. Une pointe (`.mx-fxarr`) vise le bouton FX ; la tranche ouverte a un liseré de sa couleur (`.sel`). Le bouton FX et le fader restent visibles, la console ne bouge pas. Même contenu qu'avant : liste des 8 effets à gauche, réglages à droite, onglet courant gardé (`mixTab`).
- **Suivi** : la position est recalculée au défilement (console ou page, écouteur `scroll` en capture) et au redimensionnement. Si la tranche sort de la vue (console défilée jusqu'à la cacher, page défilée), le popover se **ferme** plutôt que de rester en l'air détaché de sa tranche.
- **Fermeture** : Fermer, Échap (focus rendu au bouton FX ; l'assistant reste ouvert), clic hors console et hors popover, recliquer FX de la même tranche. FX d'une autre tranche déplace le popover. Les curseurs écrivent en direct sans redessiner ; les réaffichages (onglet, case, bouton) gardent le focus et le défilement interne.
- **Téléphone (≤ 760 px)** : feuille du bas pleine largeur (66 vh au plus), effets en onglets horizontaux défilants, pas de position calculée ni de pointe.
- **Accessibilité** : `role="dialog"`, `aria-labelledby="mxFxTitle"`, `aria-expanded` sur le bouton FX, focus envoyé dans le popover à l'ouverture.
- Test : `tests/e2e/wizard-mix.js` (position collée à la tranche ±24 px, dans la fenêtre, Échap, clic dehors, autre tranche, feuille à 390 px).

## Étape Effets et transitions (maquette : `docs/maquette-production.html`, écran B)

- **Place** : première étape du groupe « Finaliser » (après la dernière étape d'instrument, avant Mix) ; `ST.fx`, adresse `'fx'`. Pastille grise du rôle Effets (`#7a8a99`), puce « Effets » à côté de la phrase de la tête. Un brouillon de version < 3 (avant l'étape) est renuméroté à sa réouverture ; `project.wizard.v` passe à 3 et porte `state.w.fx`.
- **Frise** : une carte, les scènes dans l'ordre de l'arrangement (couleur du type de scène, largeur selon les mesures, 88 px au moins : la frise défile à l'horizontale sur téléphone), et entre deux blocs une pastille ronde de 26 px (nombre d'effets actifs, « + » quand il n'y en a pas, bleue quand elle est choisie). La jonction choisie par défaut est celle d'avant le premier drop.
- **Carte « Transition avant « X »** : aperçu de −8 à +1 mesures (une ligne par effet, estompée quand l'effet est coupé), puis une ligne par effet (interrupteur de 36 × 20 px, titre et phrase, réglages à droite ; sous 720 px les réglages passent sous le titre). Une seule carte par colonne, pas de cadre dans le cadre ; la carte **Percussions** est une matrice de cases orange (`#f08a00`) scènes × boucles.
- **Sans le musicien** : un cadre en tirets avec une phrase et un bouton « + Ajouter … » (même mécanisme que « + Ajouter un musicien » : il ajoute l'Effets ou le Percussionniste, facultatifs dans chaque inspiration, au groupe) ; il remplace les réglages qui en dépendent.
- **Moteur** : `S.wiz.fx` → option `fx` de `SS.bandSong.build` (voir `junctionDefaults` dans `js/bandsong.js`). Sans retouche, la chanson est celle du plan ; l'étape montre ce que le plan fait déjà.

## Assistants de composition, d'orchestration et d'arrangement (novembre 2026)

Maquette : `docs/maquette-assistant-integre.html`. Les trois aides vivent dans l'assistant Nouvelle chanson (pas de fenêtre à part) et
suivent la même boucle : ce que la scène contient, ce qu'on y entend, trois propositions expliquées (« pourquoi ça marche »), essai A/B
en boucle, « Garder » (rien n'est écrit avant). Ordre de livraison : 1 Harmoniser la mélodie (fait), 2 étape Arrangement (énergie,
variations de scène), 3 onglet Mélodie : développer le motif et section qui contraste, 4–5 Orchestration (musicien Orchestre, étape
Orchestration, doublures, articulations), puis l'ouverture d'une chanson existante dans l'assistant.

### Étape Accords : sous-onglets et « Harmoniser la mélodie »

- **Sous-onglets** (`.bwc-tabs`, `S.wiz.ctab`, non enregistré) : **Grille** (l'éditeur d'avant : en-tête, guide du mode, essais A/B,
  grille, palette), **Harmoniser la mélodie** (`#bwHarm`), **Vérifier** (`#bwChecks`, toujours ouvert dans son onglet).
- **Moteur** (`SS.harmony.harmonize(key, notes, total, { slot, current, loop })`, `noteRoles`, js/harmony.js, `tests/harmonize.test.js`) :
  la mélodie est découpée en tranches d'un accord (`slot` : 16 = une mesure, 8, 32). Candidats : triades majeures et mineures de la
  gamme, plus les emprunts (en mineur : V majeur du mineur harmonique, IV majeur du dorien ; en majeur : iv mineur, ♭VII, ♭VI). Chaque
  accord est noté sur la tranche : une note appuyée (blanche ou plus, ou noire sur le premier temps) dans l'accord compte pour, un
  demi-ton contre une note de l'accord compte contre (sauf neuvième, et septième majeure d'un accord majeur). Trois intentions
  (simple, tension, couleur) choisissent leur chemin par Viterbi avec leurs préférences d'enchaînement (quinte descendante, basse qui
  descend d'un degré, cadence V → I, emprunts), et s'écartent des propositions déjà faites. Une scène de 8 mesures ou plus est
  harmonisée comme une **boucle de 4 mesures** (chaque tranche notée sur toutes ses répétitions), ou en grille libre (« Toute la scène »).
  Chaque proposition a un titre selon ce qu'elle fait (« Sombre, descendante », « Lumineuse (dorien) »…), au plus trois phrases
  d'explication, des jauges Tension et Couleur.
- **Interface** : la mélodie de la scène (un instrument de type Mélodie qui joue ; choix s'il y en a plusieurs) dans un rouleau, chaque
  note colorée selon son rôle sur la grille regardée (accord, passage, tension, frottement) ; « Accords actuels » ou une proposition.
  Trois cartes : accords d'un cycle (les nouveaux bordés de blanc, « × n » pour les tours de boucle), explications, « ▶ Essai A/B ».
- **Essai A/B** : le même que celui de la Grille (`S.wiz.ab`, avec `lead` et `label`). Pendant l'essai, la mélodie est **figée** telle
  qu'elle jouait (`partsEff` dans `wizSong`), sinon le moteur la récrirait sur les nouveaux accords ; les pédales de la scène ne sont
  pas jouées sous la version B. **Garder B** écrit la grille de la scène et fait de cette mélodie la mélodie imposée de la scène
  (`parts[section].inst[id].lead`, comme « Générer une mélodie ») ; **Garder A** ne touche à rien.

### Étape Arrangement (12 avec un musicien par étape, ouvre « Finaliser »)

Moteur pur dans `js/arrange.js` (`SS.arrange`, tests `tests/arrange.test.js`) :
l'énergie de chaque scène se mesure (instruments actifs, densité de notes par mesure,
vélocité) et se ramène entre 0,15 et 1 sur la chanson. L'utilisateur choisit une courbe
voulue (« Montée vers le final », « Deux vagues », « Sommet au milieu ») ; l'écran trace
la courbe voulue et l'énergie mesurée passage par passage (une scène répétée = plusieurs passages).

- **Grille musiciens × scènes** : qui joue où, avec le nombre de notes ou de coups.
- **Points à travailler** : scène plus calme ou plus chargée que la courbe, sommet mal placé,
  deux scènes voisines de même énergie, scène qui revient à l'identique alors que la courbe change.
- **Variations en un clic** : pour une scène à densifier ou alléger, l'assistant propose
  « Sans l'arpège », « Basse en blanches », « Avec la batterie », « Nappe en croches »…
  Essai A/B en boucle (`S.wiz.arrAb`, appliqué par `partsEff` sans toucher à l'état),
  « Garder B » écrit le réglage dans `S.wiz.parts` (annulable comme toute retouche de scène).
- Brouillon v4 : la courbe choisie (`arr`) est rangée ; les brouillons v2/v3 décalent
  leurs numéros d'étape à partir de l'Arrangement.

### Étape Mélodie : « Développer le motif » et « Section qui contraste »

L'étape d'un instrument Mélodie a trois sous-onglets (`S.wiz.mtab`) : **Mélodie** (le panneau d'avant),
**Développer le motif**, **Section qui contraste**. Moteur pur dans `js/develop.js` (`SS.develop`, tests
`tests/develop.test.js`).

- **Développer le motif** : on choisit deux mesures de la mélodie de la scène (le motif) et une forme de phrase
  (A A’ B A, A B A C, question / réponse). Quatre suites : séquence (un degré plus bas), réponse (même rythme, fin sur
  la tonique), variation rythmique (syncope sur les temps 2 et 4), augmentation (durées doublées). La phrase de
  8 mesures est répétée sur toute la scène ; les notes longues sur un temps vont sur la note de l'accord la plus
  proche, le motif reste tel quel ; la dernière note conclut sur la tonique (la dominante pour une question).
- **Section qui contraste** : la mélodie d'une autre scène écrite à partir du même motif, dans sa tonalité et sur ses
  accords : plus haut et plus long, renversé, ou plus serré.
- Essai A/B (`S.wiz.devAb`, appliqué par `partsEff`) : B chante même dans une scène où la mélodie est muette ;
  « Garder B » écrit `parts[sec].inst[T].lead = { events, how }`, et `how` s'affiche dans la colonne des scènes.

### Musicien « Orchestre » et étape Orchestration

Nouveau type de musicien `orch` (js/bandgroup.js) : on l'ajoute à l'étape Instruments en choisissant un **effectif**
(`ms.ens`) parmi ceux de `js/orchestra.js` : Cordes ; Cordes, cor et flûte ; Cordes et bois ; Synthé et cordes. Comme
un kit de batterie, c'est un seul instrument de l'assistant (une étape, clé = id du musicien) et **une piste par pupitre**
(`band.key = orch:vl1`…, son General MIDI du pupitre).

`SS.bandSong.build` écrit l'orchestre après les autres instruments de la scène (`SS.orchestra.orchestrate`) :
- basse de l'accord au pupitre le plus grave, harmonie une note par pupitre (voix qui bougent le moins possible, sans
  croiser ni passer au-dessus de la mélodie ; le cor prend tierce ou septième), premiers violons à la mélodie en
  densité pleine, contrechant d'un bois dans les silences de la mélodie, nappe pour les cordes synthé ;
- densité par scène : `light` (cordes seules), `mid`, `full`, automatique d'après l'énergie du plan ; réglages de la
  scène `parts[sec].inst[musicien].orch = { level, off: [pupitres coupés] }` ;
- le rapport (rôles, registres, pourquoi, points à voir) reste sur la scène de l'aperçu (`sc.orch`, non énumérable :
  il n'entre pas dans le projet).

L'étape Orchestration montre la densité et les pupitres de la scène, la carte des registres (tessiture, zone
confortable, notes jouées), « Qui joue quoi » avec le pourquoi, et « À voir » (croisements, mélodie couverte,
tessitures). Doublures, trois couleurs en A/B et articulations : lot suivant.
