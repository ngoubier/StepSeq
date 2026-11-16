# 11 — Orchestration acoustique et réalisation virtuelle

**Niveau : intermédiaire à avancé. Résultat : distribuer les parties selon registres, gestes et équilibres réels.**

## 1. Instrumenter et orchestrer

Choisir « cordes, bois, cuivres » ne suffit pas. Déterminer qui porte le thème, qui accompagne, dans quel registre, avec quelle articulation et avec quelle continuité. Une même note peut être légère, tendue ou très exposée selon l’instrument et sa position dans sa tessiture.

Les instruments ne possèdent pas un volume uniforme sur toute leur étendue. Le registre qui convient à une partie n’est pas nécessairement celui où elle est techniquement possible. Les effectifs et le lieu modifient aussi l’équilibre.

## 2. Familles et contraintes à examiner

| Famille | Ressources d’écriture | Contrôles nécessaires |
| --- | --- | --- |
| Cordes frottées | Tenues, attaques, trémolos, pizzicatos, divisi | Archet, cordes disponibles, positions, doubles cordes |
| Bois | Lignes expressives, couleurs de registre, articulations rapides | Respiration, doigtés, passages de registre, puissance locale |
| Cuivres | Soutien, éclat, thèmes, articulations franches | Endurance, respiration, aigu, nuances et effectif |
| Percussions | Attaques, pulsation, couleur, résonance | Instrument exact, jeu, changements, durée de résonance |
| Harpe et claviers | Résonance, arpèges, harmonie, articulation | Pédales ou sustain, étendue des mains, redistribution |

Ce tableau n’est pas un catalogue de tessitures. Pour une partition destinée à des musiciens, vérifier chaque étendue, transposition et technique dans une référence spécifique ou auprès de l’interprète. Les détails non vérifiés restent des hypothèses de travail.

## 3. Travailler d’abord en sons réels

Conserver une représentation en hauteurs entendues pour l’analyse. Générer ensuite les parties transposées. Par exemple, une clarinette en si♭ sonne un ton sous la note écrite : pour obtenir C4 entendu, écrire D4. Un cor en fa sonne une quinte juste sous l’écrit. La contrebasse sonne usuellement une octave sous l’écrit.

Ne pas transposer deux fois si la bibliothèque ou le logiciel effectue déjà cette opération. Séparer `concert_pitch` de `written_pitch` dans les données et conserver la règle de conversion utilisée.

## 4. Doublures et équilibre

Une doublure peut renforcer une ligne, modifier sa couleur ou changer son échelle. Elle doit être justifiée. Doubler systématiquement tous les instruments à l’unisson détruit souvent la différenciation des plans.

Distinguer doublure exacte, doublure à l’octave et harmonisation en tierces ou sixtes. Un divisi répartit les notes entre musiciens d’une section ; il ne rend pas chaque sous-groupe aussi puissant que la section complète. Dans un orchestre virtuel, empiler plusieurs patches de section peut produire un effectif implicite excessif.

## 5. Exemple original de réorchestration

Phrase de quatre mesures : thème E4–G4–A4–G4, une ronde par mesure ; accords C–Em–F–G. Version de départ : mélodie à un bois solo dans un registre à vérifier, cordes d’accompagnement en trois voix, basse C3–E3–F2–G2. Les notes du thème sont respectivement tierce, tierce, tierce et fondamentale des accords.

Version plus intense : thème à l’octave supérieure dans une partie adaptée, ajout d’une doublure ponctuelle, accompagnement plus articulé et élargissement du grave. Ne pas conserver automatiquement toutes les couches initiales. Programmer un retrait après le sommet pour rendre sa fonction perceptible.

Pour une livraison professionnelle, cette esquisse doit être complétée par notes exactes de toutes les voix, nuances, articulations, respirations, effectifs et vérification des parties séparées. Le tableau de timbres n’est pas une partition achevée.

## 6. Articulations et phrases

Une note détachée n’est pas seulement une note MIDI raccourcie. Un staccato échantillonné possède sa propre attaque et son propre corps. Une transition legato dépend du moteur de la bibliothèque, des intervalles et du chevauchement. Changer d’articulation peut modifier le délai d’attaque ; contrôler les raccords.

Dynamique et expression ne sont pas interchangeables. Une bibliothèque peut utiliser CC1 pour fondre entre couches dynamiques, CC11 pour l’expression, ou d’autres conventions. Lire son mapping avant de prescrire des courbes. La vélocité peut agir sur l’attaque, le choix d’échantillon ou le volume suivant le patch.

## 7. Crédibilité d’un orchestre virtuel

1. Choisir la bonne articulation pour chaque phrase.
2. Donner une direction aux tenues, pas seulement une valeur de vélocité initiale.
3. Respecter respirations, reprises et fins de notes.
4. Ajuster les attaques lentes sans détruire le rythme de référence.
5. Contrôler la réverbération déjà présente avant d’en ajouter.
6. Comparer une réduction simple et la version orchestrée.

La randomisation uniforme n’est pas une simulation de musiciens. Une section joue des attaques coordonnées ; sa variabilité interne n’équivaut pas à décaler arbitrairement chaque pupitre.

## 8. Révision d’une orchestration trop lourde

Identifier le thème puis supprimer temporairement toutes ses doublures. Réintroduire uniquement celles qui apportent un effet utile. Simplifier les parties médianes ; laisser les registres extrêmes apparaître à des moments choisis. Contrôler l’équilibre à une nuance plausible, pas seulement en réglant le fader de chaque piste au maximum.

Exercice : réaliser trois versions d’une même phrase — cordes seules, bois et cordes, synthé et cordes — sans changer mélodie ni accords. Correction : fonctions explicites, effectifs crédibles, articulation décrite et différences de couleur argumentées. L’écoute reste nécessaire pour conclure sur l’équilibre.

**Références :** [S07, S09, S14, S18 et S23](21_sources_et_bibliographie.md). Les exemples sont des esquisses originales, non des parties instrumentales certifiées. **Confiance : élevée** sur les principes ; **moyenne** sur une réalisation sans instrument ni bibliothèque spécifiés.
