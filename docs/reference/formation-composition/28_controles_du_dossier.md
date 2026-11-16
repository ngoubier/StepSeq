# 28 — Contrôles effectués sur la version 1.0

**Date : 16 novembre 2026.** Ce rapport décrit des vérifications réellement exécutées sur les exemples et les fichiers de ce dossier. Il ne constitue pas une évaluation d’un agent installé ni une validation sonore des compositions.

## 1. Contrôles des exemples de notes

Les séquences note/durée ont été extraites des tableaux de huit mesures du chapitre 05, des huit mesures du thème cinématique du chapitre 19 et des quatre mesures de coda du chapitre 18. Les vingt mesures totalisent chacune exactement quatre noires avec un calcul rationnel.

Le bloc JSON du chapitre 16 a été analysé : syntaxe valide, IDs d’événements uniques, durées positives, dates dans les limites de la pièce, vélocités dans la plage choisie et cohérence entre notes écrites et numéros MIDI selon C4 = MIDI 60.

## 2. Développement des projets procéduraux

Les règles de référence des deux projets ont été développées temporairement en listes de notes pour vérifier leur caractère calculable. Cette expansion est un outil de contrôle ; les listes n’ont pas été livrées comme fichiers MIDI ou audio.

| Projet | Mesures | Durée qn | Durée à tempo constant | Événements de notes reconstruits | Plage MIDI |
| --- | ---: | ---: | ---: | ---: | --- |
| Synthwave | 64 | 256 | 153,6 s | 1 470 | 36–88, batterie incluse |
| Cinématique | 48 | 192 | 144 s | 471 | 34–86 |

Les notes de silence ne sont pas comptées parmi les événements de notes. Les note-off d’un éventuel export ne sont pas comptés séparément ici. Les durées ne comprennent pas les queues d’effets.

Pour la synthwave : vérification de la fin à 256 qn et de l’absence d’événements de batterie en mesure 32 ; contrôle des fenêtres de présence, de la transposition de la section B et de la coda selon les règles de référence.

Pour le cinématique : vérification de la fin à 192 qn, des registres de référence, de l’ostinato et du thème final D4 tenu quatre noires. La variante optionnelle d’ostinato à +12 n’entre pas dans cette version de référence.

## 3. Calculs particuliers

Contrôles exécutés :

- 30 mesures de 4/4 à noire = 120 donnent 60 secondes.
- 32 mesures de 4/4 à noire = 128 donnent 60 secondes.
- 6/8 contient 3 qn ; 7/8 contient 7/2 qn.
- Une croche de triolet vaut 320 ticks à PPQ = 960.
- Un septolet divisant 4 qn n’est pas représentable exactement avec PPQ = 960.
- La série du chapitre 14 contient douze classes distinctes ; son inversion modulo 12 correspond au tableau fourni.

## 4. Intégrité documentaire

Les liens locaux des fichiers séparés ont été contrôlés. Les blocs de code sont fermés. Le document regroupé conserve le contenu des chapitres et remplace les liens de fichiers par des liens d’ancrage. L’archive conserve les noms et l’arborescence du dossier.

Le registre des sources distingue consultation effective, inspection de programme et accès incomplet. Les liens externes ont été recherchés ou ouverts pendant la préparation ; leur disponibilité future n’est pas garantie par ce contrôle documentaire.

## 5. Ce qui n’a pas été vérifié

Aucun rendu audio des deux projets n’a été généré ou écouté. Aucun export MIDI ou MusicXML de morceau n’est fourni dans cette livraison documentaire. Aucun loudness, équilibre spectral, true peak ou résultat de mastering n’a été mesuré. Aucune partition n’a été jouée par un interprète ou validée instrument par instrument.

Les cas du chapitre 26 décrivent une recette future : leur présence ne signifie pas qu’un agent a déjà passé ces tests. La qualité artistique, l’effet émotionnel et la jouabilité d’une orchestration spécialisée restent à évaluer lors de la réalisation.

## 6. Conclusion de contrôle

La version documentaire est cohérente sur les conventions et exemples numériques testés. Elle fournit une base de travail pour implémenter puis évaluer un agent compositeur. **Confiance : élevée** sur les vérifications déclarées ; **inconnue** sur le résultat sonore et la performance d’un futur agent non implémenté.
