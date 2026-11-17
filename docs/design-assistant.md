# Design de l'assistant « Nouvelle chanson »

Consigne de design de l'assistant (`js/band.js`, `#bandDlg`). Référence visuelle : la maquette approuvée
(`docs/maquette-assistant.html`). Le but : que le vrai assistant ait la même clarté que la maquette,
sans perdre aucune fonction.

## Constat (novembre 2026)

Le vrai assistant marche, mais il est plus lourd à l'œil que la maquette :

1. **Fenêtre posée sur l'application.** L'application reste visible autour. La barre des 11 étapes est horizontale, serrée,
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
2. **Stepper vertical** à la place de la barre horizontale. Les étapes sont groupées : « Fondations » (1 à 4),
   « Pistes, scène par scène » (5 à 10), « Créer » (11).
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
- **2 Instruments** : la scène des musiciens telle quelle, mais dans une seule carte, sans double bordure.
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
- **5 à 10** : la barre de piste reste, en haut du contenu, sous la tête d'étape. Les cartes internes (bibliothèque de motifs,
  modes, aperçu des notes) perdent leur bordure quand elles sont déjà dans une carte.

## Ce qui ne change pas

Les identifiants et crochets de test (`#bwNext`, `#bwBack`, `#bwCreate`, `#bandStyles [data-v]`, `#bandPresets .band-preset`,
`.bh-scene`, `#bwTransport`…), le comportement, les données. Seule la présentation change.

## Mise à jour (novembre 2026) : dans la fenêtre principale

L'assistant n'est plus une fenêtre plein écran (`<dialog>`) mais une zone de la fenêtre principale (`#bandDialog`, `body.wizard-mode`) :
elle remplace les pistes, sous la barre du haut qui reste visible. Plus d'en-tête propre : Lecture / Stop, tempo, position et tonalité sont
ceux de la barre du haut. Pied : un seul bouton **Fermer** (et « Chanson vide » à l'étape 1) ; on change d'étape par le stepper.
« Créer la chanson » et General MIDI sont dans le contenu des étapes 11 et 2.
