# 18 — Projet guidé : un morceau synthwave de 64 mesures

**Niveau : intermédiaire à avancé. Résultat : une recette symbolique déterministe, développable en événements pour toutes les parties.**

## 1. Brief et conventions

Instrumental original ; nostalgie en mouvement comme intention ; 4/4 ; noire = 100 ; 64 mesures ; centre A mineur ; cinq pistes : batterie, basse, pad, arpège, lead. Durée symbolique : `64 × 4 × 60/100 = 153,6 s`, hors effets. C4 = MIDI 60. Aucun appareil ni preset n’est requis.

Les règles ci-dessous constituent une partition procédurale originale. Elles permettent de produire toutes les notes ; elles ne sont pas un fichier MIDI déjà exporté. Les indices de mesures commencent à 1 ; les positions locales qn commencent à zéro.

## 2. Forme

| Mesures | Section | Pistes et transformations |
| --- | --- | --- |
| 1–8 | Intro | Pad seul 1–4 ; arpège ajouté 5–8 |
| 9–24 | A | Batterie, basse, pad, arpège ; lead sur 9–16 puis variante 17–24 |
| 25–32 | Transition | Lead absent ; basse en noires ; arpège ; pad ; batterie sauf dernière mesure |
| 33–48 | B | Lead une octave au-dessus, basse et batterie ; arpège seulement 41–48 |
| 49–56 | A′ | Retour du lead initial ; arpège absent ; pad réduit à deux notes supérieures |
| 57–64 | Coda | Batterie et arpège absents ; basse et pad ; lead seulement 61–64 |

Toutes les frontières sont inclusives dans ce tableau : la section suivante commence à la mesure suivante. La fin symbolique est au début théorique de la mesure 65.

## 3. Harmonie et voicings

Boucle de huit mesures utilisée sept fois pour les mesures 1–56 : Am | F | C | G | Am | Dm | E7 | Am. Un accord par mesure, quatre qn chacun.

| Accord | Basse | Pad, voix ordonnées | Pool d’arpège |
| --- | --- | --- | --- |
| Am | A2 | A3 C4 E4 | A3 C4 E4 A4 |
| F | F2 | A3 C4 F4 | A3 C4 F4 A4 |
| C | C3 | G3 C4 E4 | G3 C4 E4 G4 |
| G | G2 | G3 B3 D4 | G3 B3 D4 G4 |
| Dm | D3 | A3 D4 F4 | A3 D4 F4 A4 |
| E7 | E2 | G♯3 B3 D4 | G♯3 B3 D4 E4 |

Les mesures 57–64 utilisent : Am | F | Dm | E7 | Am | Dm | E7 | Am. En mesure 64, la résolution finale dure quatre qn ; la basse joue A2 tenu et le pad A3–C4–E4.

## 4. Réalisation des accompagnements

**Pad :** chaque note du voicing commence à 0 et dure 4 qn ; vélocité 58. Aux mesures 49–56, ne garder que les deux notes les plus hautes du tableau. Pas de chevauchement structurel entre mesures ; la release du son est un paramètre de réalisation.

**Basse normale :** huit croches par mesure sur la basse du tableau ; débuts 0, 1/2, 1, 3/2, 2, 5/2, 3, 7/2 ; gate 3/8 qn pour une fenêtre rythmique de 1/2 ; vélocités `[92,74,82,74,88,74,82,74]`. En transition 25–32 : quatre noires, gate 3/4, vélocités 86,76,82,76. En coda 57–63 : une ronde par mesure, vélocité 70. Mesure 64 : même durée, vélocité 64.

**Arpège :** huit croches ; pool local indexé 1–4 ; ordre `[1,2,3,4,3,2,3,2]` ; gate 3/8 ; vélocités `[72,60,66,76,64,60,68,60]`. Il joue uniquement dans les mesures où il est présent selon la forme. En transition 25–32, conserver le même débit : l’intensification vient de la basse et du filtre, pas d’un doublement caché des notes.

## 5. Batterie entièrement spécifiée

Convention de mapping de travail à vérifier au rendu : kick MIDI 36 ; snare 38 ; closed hat 42. Une piste de batterie peut utiliser plusieurs notes simultanées.

Mesure normale : kick aux qn 0,1,2,3, vélocité 100 ; snare à 1 et 3, vélocité 90 ; hat à 1/2,3/2,5/2,7/2, vélocités 60,68,60,72. Durée de chaque événement : 1/8 qn. Ces durées ne contrôlent pas toujours la fin des échantillons de batterie.

Mesures 16,24,40,48,56 : remplacer les hats par une série de huit croches, vélocités alternées 58/70 ; conserver kick et snare. Mesure 31 : même règle. Mesure 32 : batterie entièrement silencieuse pour préparer B. Aucune batterie en intro ni coda.

## 6. Thème exact

Utiliser le tableau de huit mesures du [chapitre 05](05_melodie_motifs_et_phrases.md), qui correspond à cette grille. Le jouer aux mesures 9–16, puis 17–24, 33–40, 41–48 et 49–56.

Variante 17–24 : même notes et durées sauf la cinquième mesure locale, où E5 final est remplacé par C5. Section B : transposer toutes les notes du thème de +12 demi-tons ; cette tessiture convient à un lead instrumental à vérifier, sans présumer une voix humaine. Aux mesures 49–56 : thème initial sans transposition.

Vélocités du lead : 84 par défaut ; première attaque de chaque mesure 88 ; notes de durée au moins 2 qn à 82 ; la première règle applicable à une note longue est la durée, puis l’accent initial n’est pas ajouté. Cette priorité évite des valeurs ambiguës.

Coda, mesures 61–64 :

| Mesure | Accord | Notes : durées qn |
| ---: | --- | --- |
| 61 | Am | E4:1, A4:1, C5:2 |
| 62 | Dm | D5:2, A4:2 |
| 63 | E7 | B4:1, A4:1, G♯4:2 |
| 64 | Am | A4:4 |

Le lead est silencieux ailleurs. Les silences doivent être représentés si l’export symbolique l’exige.

## 7. Timbres et expression

Basse : attaque courte, peu de release, centre stable. Pad : attaque douce, spectre modéré, largeur à contrôler. Arpège : articulation nette. Lead : attaque lisible, sustain assez long, delay facultatif.

Automations proposées, à adapter au moteur : ouverture de filtre du pad dans l’intro ; montée de brillance de l’arpège en transition ; réduction après mesure 48 ; fermeture dans la coda. Aucun numéro CC n’est imposé sans mapping. Ne pas confondre ces indications avec des automations déjà réalisées.

## 8. Vérification et révision

Vérifier 64 mesures, chaque occurrence du thème, absence de batterie en mesure 32, correspondance des G♯ avec E7 et fin de toutes les notes au plus tard à 256 qn. La polyphonie symbolique maximale dépend des superpositions de parties, pas d’un seul patch. Les cinq rôles peuvent demander des instances ou des canaux distincts.

Si le refrain est trop aigu, revenir à +0 et changer timbre ou accompagnement. Si le thème est masqué, enlever l’arpège avant d’augmenter le lead. Si le morceau paraît répétitif, modifier la deuxième moitié d’une occurrence en conservant son motif et refaire les contrôles.

**Sources de méthode :** [S05, S08, S09 et S17](21_sources_et_bibliographie.md). Composition et règles entièrement originales. **Confiance : élevée** sur le calendrier défini ; résultat sonore non évalué sans réalisation audio.
