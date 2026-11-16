# 04 — Renversements, voicings et conduite des voix

**Niveau : intermédiaire. Résultat : faire évoluer les accords comme des lignes et clarifier le registre grave.**

## 1. Trois notions différentes

La fondamentale nomme l’accord. La basse est sa note réellement la plus grave. Le renversement dépend du rapport entre basse et fondamentale. La disposition, ou voicing, décrit l’ensemble des notes, leur ordre, leurs octaves et leurs doublures.

Pour C majeur : C3–E3–G3 est à l’état fondamental ; E3–G3–C4 est au premier renversement, noté C/E ; G3–C4–E4 est au deuxième, noté C/G. C3–G3–E4 reste à l’état fondamental malgré sa disposition plus ouverte. E3–G3–E4 n’inclut pas C : il peut suggérer C sans fondamentale dans un contexte, mais ne suffit pas à l’identifier avec certitude.

La basse d’un slash chord n’appartient pas toujours à la triade : C/D n’est pas un renversement de C. Il décrit une triade de C sur une basse D et demande une interprétation contextuelle.

## 2. Penser horizontalement

Au lieu de déplacer chaque accord comme un bloc, suivre les voix séparément. Repérer les notes communes ; faire avancer certaines voix d’un ton ou d’un demi-ton ; réserver les grands sauts aux gestes voulus. Une note tenue peut stabiliser un passage pendant que la basse change.

Exemple original, accompagnement à trois voix, une mesure par accord :

| Accord | Voix basse de l’accompagnement | Voix médiane | Voix haute |
| --- | --- | --- | --- |
| Am | A3 | C4 | E4 |
| F | A3 | C4 | F4 |
| C | G3 | C4 | E4 |
| G | G3 | B3 | D4 |

La basse instrumentale indépendante peut jouer A2–F2–C3–G2. L’accord total F est alors à l’état fondamental, même si l’accompagnement seul commence par A3. Il faut analyser l’ensemble réellement sonore.

## 3. Espacement et lisibilité

Des notes très rapprochées dans le grave peuvent produire une masse confuse, particulièrement avec des timbres riches, de longues releases ou de la saturation. Tester un grave réduit à fondamentale et quinte, puis placer tierces et extensions plus haut. Il n’existe pas de frontière universelle en hertz à appliquer sans entendre les sons.

Le registre influence autant la fonction que le timbre. Un pad couvrant cinq octaves peut empiéter sur basse et mélodie. Réduire sa largeur peut résoudre le problème sans égalisation. Éviter de doubler systématiquement toutes les notes à l’octave : les doublures consomment de la place et de la polyphonie.

## 4. Mouvement des voix

- Mouvement contraire : une ligne monte tandis que l’autre descend.
- Mouvement oblique : une ligne reste pendant que l’autre bouge.
- Mouvement similaire : les deux avancent dans le même sens.
- Mouvement parallèle : même sens et même intervalle successif.

Dans certains exercices de contrepoint classique, les quintes et octaves parallèles sont évitées pour préserver l’indépendance. En synthwave, rock, musique orchestrale ou planing, des doublures parallèles peuvent être le résultat recherché. Le futur agent doit appliquer un profil stylistique, pas une interdiction générale.

## 5. Voicings enrichis

Pour une sonorité de septième avec basse séparée, travailler d’abord tierce et septième : elles définissent fortement la qualité et les résolutions. Ajouter ensuite une couleur, puis éventuellement une quinte. Un voicing sans fondamentale ne doit pas faire disparaître la lisibilité de toute la progression.

Exemple ii–V–I en C, basse D2–G2–C3 :

- Dm9 : F3–A3–C4–E4 au-dessus de D2.
- G13 : F3–A3–B3–E4 au-dessus de G2, quinte omise.
- Cmaj9 : E3–G3–B3–D4 au-dessus de C3.

F3 descend vers E3 à la résolution finale ; E4 devient D4. Aucune disposition n’est obligatoire. Écouter particulièrement B3–C3 selon registre et timbre, et déplacer une voix si nécessaire.

Un drop 2 part d’un accord fermé ordonné par hauteur et descend d’une octave la deuxième note depuis le haut. Pour C4–E4–G4–B4 : G3–C4–E4–B4. Cette opération décrit une disposition, pas un nouvel accord.

## 6. Choix algorithmique pour un agent

Générer plusieurs dispositions compatibles avec la tessiture, puis comparer : déplacement total des voix, sauts individuels, croisement, espacement du grave, note mélodique supérieure et doublures. Une fonction de coût peut guider le choix, mais minimiser chaque mouvement peut produire une musique immobile. Prévoir des exceptions pour sommet, changement de section ou changement de caractère.

Conserver l’identité des voix. Trier à nouveau les notes de chaque accord ne suffit pas à déterminer quelle ligne est devenue quelle autre. Une recherche par affectation entre voix est préférable lorsque l’effectif reste constant ; autoriser entrées et sorties explicites quand il change.

## 7. Exercice corrigé

Depuis C4–E4–G4, rejoindre F majeur avec peu de mouvement : C4–F4–A4 garde C, monte E vers F et G vers A. Pour réduire davantage un saut ailleurs, on peut changer le nombre ou le registre des voix ; le critère est musical autant que numérique.

Faire deux versions de quatre mesures : blocs à la fondamentale, puis lignes conduites. Comparer à niveau semblable et sans réverbération longue. Réussite : décrire le trajet de chaque voix, pas seulement nommer les accords.

**Références :** [S01, S07 et S09](21_sources_et_bibliographie.md). Exemples et stratégie de coût originaux. **Confiance : élevée** sur les notes ; choix de disposition à écouter.
