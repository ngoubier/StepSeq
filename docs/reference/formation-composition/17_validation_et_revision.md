# 17 — Validation, évaluation et révision

**Destination : futur agent. Résultat : distinguer un fichier valide, une écriture cohérente et un morceau convaincant.**

## 1. Trois niveaux d’évaluation

Une validation structurelle contrôle les données : dates, durées, plages numériques et contraintes. Une analyse musicale décrit notes, fonctions, motifs et profils stylistiques. Une évaluation artistique juge l’effet entendu dans un contexte. Aucun de ces niveaux ne remplace les deux autres.

Le rapport doit distinguer **calculé**, **inspecté dans les notes**, **écouté**, **supposé** et **non vérifié**. Une partition plausible n’est pas une performance vérifiée. Une bonne note algorithmique ne prouve pas la qualité d’une mélodie.

## 2. Contrôles bloquants

| Contrôle | Échec bloquant | Correction typique |
| --- | --- | --- |
| Dates | Début négatif non déclaré | Représenter l’anacrouse |
| Durées | Nulle ou négative | Corriger l’événement |
| Limites | Note au-delà de la fin sans intention | Corriger fin ou durée de pièce |
| MIDI | Hauteur hors 0–127, vélocité de note-on hors 1–127 | Corriger les données |
| Identité | ID répété ou référence absente | Restaurer les liens |
| Monophonie | Chevauchement interdit | Réviser gate ou événement |
| Harmonie | Trou dans une carte supposée continue | Déclarer zone sans accord ou compléter |
| Temps | Sections qui se recouvrent involontairement | Recalculer les frontières |
| Brief | Durée ou matériau imposé non respecté | Réviser ou signaler le conflit |
| Export | Note-on sans extinction ou fin tronquée | Corriger l’encodeur |

Une vélocité 0 peut servir de note-off dans MIDI 1.0 ; elle ne doit pas être confondue avec une attaque silencieuse dans le modèle de composition. Les contrôles doivent connaître la couche concernée.

## 3. Calcul exact du temps

Utiliser des nombres rationnels pour les positions et les durées, par exemple `Fraction` en Python. Ne pas arrondir les triolets à 0,333 avant d’avoir calculé les frontières. Pour une carte de tempo par paliers, découper chaque intervalle aux changements de tempo, puis sommer `durée_qn × 60 / bpm_qn`.

Pour une carte de mesure, vérifier que chaque changement tombe sur une frontière autorisée, sauf mesure partielle explicitement définie. L’addition des durées des notes d’une piste polyphonique n’est pas la durée de la pièce : des événements simultanés s’additionneraient à tort. Utiliser leurs intervalles et le maximum des fins.

## 4. Polyphonie

Créer une liste d’événements début/fin ; trier ; compter les notes actives. À temps identique, traiter les fins avant les débuts pour des intervalles semi-ouverts. Ajouter une estimation des releases séparément si le moteur sonore l’exige. Le sustain peut prolonger les notes après le note-off ; les événements de pédale doivent alors entrer dans le modèle de réalisation.

La polyphonie notée et les voix de synthèse consommées diffèrent si un patch utilise des empilements ou si le moteur gère ses ressources autrement. Ne pas déduire une limite matérielle d’un simple compte sans profil de l’instrument.

## 5. Analyse harmonique

Pour chaque note, examiner tous les accords qu’elle traverse. Attribuer une catégorie contextuelle : note d’accord, extension, passage, broderie, anticipation, retard ou tension non résolue voulue. La catégorie peut changer pendant une tenue.

Un test « note hors accord = erreur » est trop grossier. Un meilleur avertissement considère durée, accent, registre et résolution. Les notes longues exposées appellent une revue ; les passages brefs peuvent être normaux. Sans profil de style, les avertissements restent descriptifs.

## 6. Mesures descriptives de la mélodie

Calculs utiles : tessiture, distribution des intervalles, proportion de répétitions, sauts les plus grands, nombre d’attaques par mesure, longueur des silences, récurrence de cellules rythmiques. Ils décrivent la musique, sans seuil esthétique universel.

Un taux élevé de notes répétées peut être une faiblesse dans un thème lyrique et une force dans un refrain parlé-chanté. Une tessiture étroite peut être volontaire. Les seuils doivent être liés au brief et servir d’alertes interprétables.

## 7. Score artistique proposé

Employer des appréciations argumentées sur cinq axes : identité, trajectoire, lisibilité, adéquation au brief et expressivité. Pour chaque axe, écrire un constat précis et une révision possible. Si une note sur 5 est utilisée, la présenter comme une évaluation interne, pas une mesure objective de qualité.

Ne pas moyenner les erreurs bloquantes avec de bons scores artistiques. Un morceau agréable mais deux fois trop long échoue à une durée stricte. Un fichier valide mais sans fin intentionnelle peut demander une révision artistique.

## 8. Pseudocode de validation

```text
lire le brief et les unités
convertir toutes les fractions sans arrondi
vérifier identifiants, types, plages et durées
vérifier sections, mesures et cartes de tempo
pour chaque piste :
    contrôler les limites et la tessiture déclarée
    contrôler chevauchements selon son profil
    calculer polyphonie et respirations pertinentes
pour chaque note :
    couper analytiquement son intervalle aux frontières harmoniques
    enregistrer son rôle sur chaque segment
comparer durée et matériaux aux contraintes dures
si export présent : le relire et comparer ses événements
produire erreurs, avertissements et points non évalués
```

## 9. Stratégie de révision

Nommer au maximum trois problèmes prioritaires. Corriger d’abord les contraintes et la structure, puis les problèmes musicaux dominants. Garder une version avant/après. Comparer des passages de même durée et à niveau perçu voisin si l’audio est disponible.

Éviter la correction automatique destructrice : supprimer toutes les dissonances, quantifier tout, réduire tous les sauts ou uniformiser les durées peut effacer le caractère voulu. L’agent propose la plus petite révision qui traite le problème identifié.

## 10. Rapport minimal de livraison

```text
Contraintes : satisfaites / conflits explicités
Chronologie : calculée / non contrôlée
Hauteurs et tessiture : contrôlées / réserves
Style et forme : analyse écrite et limites
Export : relu / non fourni
Audio : rendu et écouté / non rendu / non écouté
Révisions effectuées : liste concrète
Confiance : élevée, moyenne, faible ou inconnue par conclusion
```

**Références :** [S15 et S20](21_sources_et_bibliographie.md) pour la couche MIDI. Architecture de contrôle originale ; les tests de référence figurent dans [26](26_cas_limites_et_recette_agent.md). **Confiance : élevée** sur les invariants ; appréciation esthétique contextuelle.
