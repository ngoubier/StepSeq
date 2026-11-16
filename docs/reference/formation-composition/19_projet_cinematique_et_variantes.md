# 19 — Projet guidé : thème cinématique, orchestration et variations

**Niveau : avancé. Résultat : développer un thème par registres, densité et transformation, avec une version symbolique complète et simple.**

## 1. Brief

Instrumental original ; 4/4 ; noire = 80 ; 48 mesures ; centre D mineur ; durée symbolique 144 secondes. Intention : retenue, élargissement, sommet, retour apaisé. C4 = MIDI 60. Quatre rôles : basse, harmonie, thème et ostinato. Les indications orchestrales restent une affectation provisoire tant que les instruments et bibliothèques ne sont pas vérifiés.

## 2. Harmonie de huit mesures

Répéter six fois la grille Dm | B♭ | F | C | Gm | Dm/A | A7 | Dm. Chaque accord dure une mesure.

| Accord | Basse entendue | Trois voix d’harmonie |
| --- | --- | --- |
| Dm | D2 | A3 D4 F4 |
| B♭ | B♭1 | B♭3 D4 F4 |
| F | F2 | A3 C4 F4 |
| C | C2 | G3 C4 E4 |
| Gm | G2 | B♭3 D4 G4 |
| Dm/A | A2 | A3 D4 F4 |
| A7 | A2 | G3 C♯4 E4 |
| Dm | D2 | A3 D4 F4 |

Dm/A est un renversement dont la basse est A. Il ne devient pas automatiquement une dominante : les notes et la fonction contextuelle doivent être distinguées. A7 apporte la sensible C♯ de D mineur.

## 3. Thème original de huit mesures

Toutes les durées sont en qn. Les hauteurs sont entendues.

| Mesure locale | Accord | Thème |
| ---: | --- | --- |
| 1 | Dm | D4:1, F4:1, A4:2 |
| 2 | B♭ | F4:2, D4:1, silence:1 |
| 3 | F | C4:1, F4:1, A4:2 |
| 4 | C | G4:3, silence:1 |
| 5 | Gm | D4:1, G4:1, B♭4:2 |
| 6 | Dm/A | A4:2, F4:1, E4:1 |
| 7 | A7 | E4:1, G4:1, C♯5:2 |
| 8 | Dm | D5:3, silence:1 |

La mesure 6 expose E comme neuvième de couleur sur Dm. Le dernier D5 fait une arrivée plus haute que le départ : il peut être un sommet local, sans être nécessairement le sommet de tout le morceau.

## 4. Plan déterministe de toutes les parties

**Basse** : une ronde de la note du tableau à chaque mesure, vélocité 64, sauf mesures 41–48 à 56. Présente dans toutes les mesures. Une réalisation acoustique pourra répartir ou octavier ce rôle après contrôle.

**Harmonie** : trois rondes simultanées du voicing local, vélocité 52, présentes dans toutes les mesures. Aux mesures 1–8 et 41–48, n’utiliser que les deux voix les plus hautes. Aux mesures 25–32, ajouter une doublure de la voix la plus haute à l’octave supérieure, vélocité 60. Cette doublure s’arrête à la frontière suivante.

**Thème** :

- Mesures 1–8 : silencieux.
- Mesures 9–16 : thème du tableau, vélocité 76.
- Mesures 17–24 : même thème, sauf les notes longues de durée 2 ou 3 qn allongées en articulation jusqu’à leur fin notée, sans modifier le calendrier ; vélocité 80. Les autres durées restent identiques. L’effet sonore devra venir d’une articulation différente, pas d’un faux changement rythmique.
- Mesures 25–32 : thème transposé de +12, vélocité 86 ; affectation instrumentale à vérifier.
- Mesures 33–40 : thème au registre initial, vélocité 74.
- Mesures 41–48 : thème au registre initial, vélocité 62 ; remplacer le D5 de la dernière mesure locale par D4 et le silence final par sa prolongation, soit D4:4.

**Ostinato** : aux mesures 17–40 uniquement, huit croches par mesure. Utiliser les trois notes de l’harmonie dans l’ordre `[1,2,3,2,1,2,3,2]` ; gate 3/8 qn ; vélocités `[62,48,54,48,58,48,54,48]`. Aux mesures 25–32, monter les notes de l’ostinato de +12 si le registre masque moins le thème ; cette variante est **optionnelle** et doit être choisie avant export. La version de référence garde +0.

Ces règles spécifient les 48 mesures sans laisser une section sous la seule étiquette « développer ».

## 5. Orchestration acoustique proposée

Version intime : thème à un bois solo, harmonie aux cordes en tenue, basse à un pupitre grave approprié, ostinato au piano. Version élargie : thème confié à une combinaison adaptée, renforcement ponctuel de l’harmonie et articulation plus marquée de l’ostinato.

Avant de produire une partition, choisir instruments exacts, effectifs, tessitures utiles et respirations. Le thème aigu de 25–32 atteint D6 ; ce choix instrumental ne doit pas être attribué arbitrairement à n’importe quel bois. Une version pour violon, flûte ou synthétiseur demandera ses propres vérifications.

## 6. Développement réellement avancé

Après réalisation de la version de référence, remplacer les mesures 17–24 par un développement à partir du rythme D–F–A. Options : fragmentation en cellules de deux notes, passage à une autre basse, imitation retardée ou augmentation du motif. Conserver la grille ou annoncer une reharmonisation distincte.

Cette étape est un exercice ouvert : elle n’est pas déjà spécifiée note par note. Le futur agent doit la composer puis soumettre sa nouvelle version aux mêmes contrôles, sans prétendre qu’une consigne générale constitue une partie écrite.

## 7. Contrastes d’orchestration

Comparer trois rendus : harmonie en accords plaqués ; harmonie en voix tenues avec expression ; harmonie divisée entre familles. Garder les mêmes notes pour isoler l’effet d’orchestration. Comparer ensuite une version où les notes changent : il s’agit alors d’un travail supplémentaire d’arrangement.

Pour le retour 41–48, le retrait de l’ostinato crée déjà un contraste. Ne pas compenser automatiquement par une nouvelle texture. L’espace laissé peut être l’événement expressif recherché.

## 8. Contrôles

48 mesures × 4 qn = 192 qn ; 192 × 60/80 = 144 secondes. Vérifier le C♯ sur A7, l’orthographe de B♭, la basse A de Dm/A et la résolution finale D. Le silence final modifié en tenue ne crée pas une cinquième noire. L’allongement acoustique dû à la release doit être traité à part.

**Sources de méthode :** [S04, S07, S09 et S14](21_sources_et_bibliographie.md). Composition originale. **Confiance : élevée** sur les spécifications ; jouabilité d’une affectation réelle et résultat sonore à vérifier.
