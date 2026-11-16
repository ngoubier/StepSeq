# 01 — Comprendre et représenter la musique

**Niveau : débutant. Prérequis : aucun. Résultat : décrire sans ambiguïté une idée de quatre mesures.**

## 1. Les dimensions d’un morceau

Une composition organise des événements dans le temps. La hauteur donne les notes ; le rythme distribue leurs attaques et durées ; l’harmonie décrit les relations verticales et leur succession ; le timbre distingue les sons ; la forme organise les sections. L’expression concerne notamment les accents, les articulations et les variations dynamiques. Ces dimensions interagissent : une note identique change de rôle avec la basse, le registre ou le moment où elle arrive.

Une mélodie est une ligne perceptible, pas nécessairement la piste la plus aiguë. Une basse peut porter le motif principal. Un accord est une sonorité que l’on peut reconnaître même si ses notes sont étalées dans un arpège. La texture est l’organisation des parties : une ligne seule, une mélodie accompagnée ou plusieurs lignes relativement indépendantes.

## 2. Convention de notes de tout le corpus

| Français | Do | Ré | Mi | Fa | Sol | La | Si |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Lettres | C | D | E | F | G | A | B |

Le corpus utilise **C4 = Do central = note MIDI 60**. Certains logiciels nomment cette même touche C3 ou C5. Le numéro MIDI tranche les désaccords d’affichage. C3 = 48, C5 = 72, A4 = 69. Le MIDI décrit une touche ou une hauteur cible ; le son réel dépend aussi de la transposition du patch et de son accordage.

Un dièse monte d’un demi-ton ; un bémol descend d’un demi-ton dans le système tempéré à douze divisions de l’octave employé ici. C♯ et D♭ correspondent alors à la même touche, mais leur nom exprime une fonction différente. L’accord D majeur s’écrit D–F♯–A, pas D–G♭–A.

L’octave double la fréquence. Avec A4 = 440 Hz et le tempérament égal : `fréquence(m) = 440 × 2^((m − 69)/12)`. Il s’agit d’un modèle d’accordage, pas d’une propriété universelle de toutes les musiques.

## 3. Intervalles

Un intervalle combine une distance diatonique, comptée avec les noms de notes, et une qualité. C–E est une tierce majeure ; C–E♭ une tierce mineure. C–F♯ et C–G♭ ont six demi-tons dans notre accordage, mais sont respectivement une quarte augmentée et une quinte diminuée.

| Intervalle simple | Demi-tons usuels |
| --- | ---: |
| Unisson juste | 0 |
| Seconde mineure / majeure | 1 / 2 |
| Tierce mineure / majeure | 3 / 4 |
| Quarte juste | 5 |
| Triton | 6 |
| Quinte juste | 7 |
| Sixte mineure / majeure | 8 / 9 |
| Septième mineure / majeure | 10 / 11 |
| Octave juste | 12 |

Un intervalle composé dépasse l’octave : une neuvième majeure correspond à une octave plus une seconde majeure. Ne pas confondre neuvième, seconde et disposition réelle de l’accord, même si elles peuvent partager une classe de hauteur.

## 4. Tonalité, gamme et centre

Une gamme est une collection ordonnée ; une tonalité est une organisation autour d’une tonique et de relations harmoniques. Utiliser uniquement les touches blanches ne suffit pas à établir C majeur : les mêmes touches peuvent soutenir A mineur ou D dorien selon les appuis et les retours.

Les degrés sont des positions relatives : en C majeur, 1 = C, 2 = D, 3 = E. Pour transposer un motif 1–3–2–5 vers D majeur, jouer D–F♯–E–A. Une transposition chromatique conserve exactement les intervalles ; une transposition diatonique suit la gamme et peut en changer la qualité.

## 5. Séparer écriture et production

La composition choisit les idées et leurs relations. L’arrangement les organise et les adapte. L’orchestration les distribue aux instruments et registres. Le mixage équilibre leurs réalisations sonores. Ces métiers se recouvrent, mais cette séparation aide au diagnostic : une réverbération ne rend pas mémorable un motif sans direction.

Pour un agent, conserver trois couches : une représentation abstraite en degrés, une réalisation en notes exactes, une réalisation sonore avec instruments. On peut alors transposer sans perdre le motif et changer un timbre sans réécrire toute la pièce.

## 6. Exercice et correction

Écrire les notes de D majeur, puis un motif de quatre noires utilisant les degrés 1–3–2–5. Réponse : gamme D–E–F♯–G–A–B–C♯ ; motif D4–F♯4–E4–A4, MIDI 62–66–64–69. Chaque note dure une noire ; le motif remplit une mesure de 4/4.

Critère : pouvoir nommer, jouer et transposer le motif. Erreur fréquente : monter toutes les notes blanches de deux touches en oubliant F♯ et C♯. Variante : garder les mêmes hauteurs et changer seulement le rythme ; observer que l’identité peut déjà changer fortement.

## 7. Règles pour le futur agent

- Déclarer convention d’octave, unité temporelle et accordage si pertinent.
- Distinguer faits, hypothèses de tonalité et intentions artistiques.
- Ne jamais présenter une suite de notes comme un audio déjà entendu.
- Conserver l’orthographe harmonique et le numéro MIDI simultanément.

**Références :** [S01 et S02](21_sources_et_bibliographie.md), sections fondamentaux et intervalles. Explications et exercices originaux. **Confiance : élevée** pour les conventions et calculs.
