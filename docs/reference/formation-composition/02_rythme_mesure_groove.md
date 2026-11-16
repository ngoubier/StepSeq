# 02 — Rythme, mesure, groove et précision temporelle

**Niveau : débutant à avancé. Résultat : construire une chronologie exacte, puis lui donner une intention rythmique.**

## 1. Pulsation, tempo et subdivision

La pulsation est le battement de référence ressenti. Le tempo en mesure la vitesse, à condition de préciser sa valeur : noire = 120 ou noire pointée = 80. La subdivision découpe une pulsation en deux, trois ou davantage d’unités. Le rythme décrit les événements qui occupent cette grille ; le mètre organise les appuis.

Dans les données du corpus, l’unité de calcul est toujours la noire, nommée `qn`. Elle reste fixe même quand la pulsation ressentie est une noire pointée. Un tempo interne `bpm_qn = 120` signifie 120 noires par minute, pas nécessairement 120 pulsations ressenties.

| Valeur | Durée en qn |
| --- | ---: |
| Ronde | 4 |
| Blanche | 2 |
| Noire | 1 |
| Croche | 1/2 |
| Double croche | 1/4 |
| Noire pointée | 3/2 |
| Croche de triolet de croches | 1/3 |
| Noire de triolet de noires | 2/3 |

Le point ajoute la moitié de la valeur initiale. Une liaison de prolongation additionne les durées de deux notes de même hauteur sans nouvelle attaque. Une liaison de phrasé décrit un geste et n’additionne pas automatiquement les événements MIDI.

## 2. Durée des mesures

Pour une signature n/d, la durée en noires est `n × 4/d`. En 4/4 : 4 qn ; en 3/4 : 3 ; en 6/8 : 3 ; en 7/8 : 7/2 ; en 12/8 : 6.

Le 6/8 et le 3/4 durent autant à noire constante mais leurs groupements usuels diffèrent : deux groupes de trois croches contre trois groupes de deux. Le 12/8 comporte généralement quatre pulsations de noire pointée. « Trois notes par temps » ne signifie donc pas automatiquement « mesure à trois temps ».

À tempo constant exprimé en noires, `secondes = qn × 60/bpm_qn`. Une mesure de 4/4 à noire = 120 dure deux secondes. Une mesure de 6/8 à noire pointée = 80 dure 1,5 seconde : le tempo interne équivalent est noire = 120.

## 3. Construire un rythme avant les hauteurs

Pour une mélodie de quatre mesures : définir les fins de phrase, ménager une respiration, créer un petit motif d’attaques, puis le répéter avec une transformation. Le silence fait partie de l’écriture. Un débit permanent de doubles croches n’est pas nécessairement plus énergique qu’un motif rare et accentué.

Exemple original en 4/4, positions comptées à partir de zéro dans les données :

| Début qn | Durée qn | Événement |
| ---: | ---: | --- |
| 0 | 1/2 | Note |
| 1/2 | 1/2 | Note |
| 1 | 1 | Note |
| 2 | 1/2 | Silence |
| 5/2 | 1/2 | Note |
| 3 | 1 | Note |

Somme : 4. Pour un tableau destiné à un musicien, on peut compter les positions à partir de 1, mais le choix doit être explicitement déclaré. Ne jamais mélanger les deux conventions dans un export.

## 4. Syncope, anticipation et déplacement

Une syncope met en relief une position faible et peut prolonger une note au-delà d’un appui attendu. Une anticipation harmonique fait entendre une note du prochain accord avant son arrivée ; elle n’est pas synonyme de syncope.

Déplacer un motif d’une croche modifie son rapport aux appuis. Garder le même contour et tester trois départs : premier temps, contretemps après le premier, dernière croche avant la mesure. Ce troisième cas produit une levée qu’il faut représenter explicitement.

## 5. Groove et humanisation

Le groove résulte du rapport entre les parties, les accents, les articulations et leurs placements. Une grille précise peut groover. Une dispersion aléatoire peut au contraire affaiblir les appuis.

Procédure : garder la grosse caisse stable ; décider du placement de caisse claire ; accentuer certains charlestons ; différencier notes courtes et longues ; comparer sans augmenter le volume. Le swing décale certaines subdivisions, mais tous les appareils ne définissent pas leur pourcentage de la même façon. Documenter les positions effectives plutôt qu’un pourcentage ambigu.

Sur une piste MIDI, la durée allouée au rythme et la durée sonnée peuvent différer. Une noire notée peut avoir un gate de 70 %. Ce gate ne crée pas automatiquement un nouveau silence structurel dans la phrase : il décrit son articulation.

## 6. Techniques avancées

- **3 contre 2** : sur une fenêtre de 2 qn, placer trois attaques à 0, 2/3 et 4/3, face à deux attaques à 0 et 1.
- **Groupement 3+3+2** : huit croches regroupées ainsi dans une mesure de 4/4 ; cela n’impose pas un changement de signature.
- **Polymétrie de boucles** : une boucle de cinq croches face à une de huit retrouve un alignement après 40 croches si elles commencent ensemble.
- **Mesure asymétrique** : écrire 7/8 en 2+2+3 et préserver ces appuis dans la basse ou la percussion.
- **Ratchet** : remplacer un événement par plusieurs attaques plus courtes dans sa fenêtre. Quatre attaques dans une croche font chacune 1/8 qn ; vérifier la capacité du son à articuler ce débit.

Ces outils doivent soutenir le geste musical. Ne pas les cumuler par défaut.

## 7. Exercice corrigé

Remplir une mesure de 4/4 avec trois croches de triolet, une noire pointée, une croche et une noire. Total : 1 + 3/2 + 1/2 + 1 = 4 qn. Départs : 0, 1/3, 2/3, 1, 5/2, 3. Vérifier qu’il y a six attaques.

Puis écrire une version binaire d’énergie voisine et comparer le caractère. Réussite : conservation exacte de la durée totale, différence rythmique perceptible, absence de microdécalage inventé dans la représentation de référence.

**Références :** [S01, S05, S13 et S15](21_sources_et_bibliographie.md). Les exemples et procédures sont originaux. **Confiance : élevée** pour l’arithmétique ; **moyenne** pour l’effet artistique d’un placement sans écoute.
