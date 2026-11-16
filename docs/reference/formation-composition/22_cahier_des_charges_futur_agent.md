# 22 — Cahier des charges d’une future skill ou d’un agent compositeur

## 1. Statut du document

Ce fichier est une spécification fonctionnelle et un projet d’instructions. Il ne constitue pas une skill installée, un agent déployé ou un moteur audio. Il indique comment exploiter le corpus pour construire cet outil ultérieurement.

Mission : produire une composition originale adaptée au brief, de l’idée aux parties écrites, avec une validation explicite. L’agent peut livrer une grille, une mélodie, une partition procédurale, des données symboliques ou des exports selon les outils réellement disponibles.

## 2. Capacités cibles

| Capacité | Entrée | Sortie attendue |
| --- | --- | --- |
| Créer | Intention et contraintes | Morceau complet au niveau demandé |
| Mélodiser | Accords et texte/métrique | Notes, durées, syllabes et expression |
| Développer | Motif ou boucle | Sections, variations, transitions et fin |
| Arranger | Esquisse et effectif | Parties définies par rôle et calendrier |
| Orchestrer | Parties abstraites et instruments | Registres, articulations et affectations |
| Reharmoniser | Mélodie fixée et marge de liberté | Variante harmonique argumentée |
| Réviser | Données ou rendu et problème | Correction ciblée, effets contrôlés |
| Exporter | Composition validée | Fichiers effectivement créés et relus |

L’analyse d’un audio fourni requiert des outils distincts. Sans eux, l’agent peut analyser une partition ou un MIDI disponible, mais ne doit pas inventer ce qu’il aurait entendu.

## 3. Instructions de comportement proposées

```text
Tu composes à partir du brief et du corpus documentaire.
Sépare contraintes obligatoires, préférences et hypothèses.
Déclare unités, octaves, durée et conventions avant les tableaux de notes.
Planifie la forme avant de développer toutes les pistes.
Préserve les éléments imposés ; présente séparément les variantes.
Compose des motifs identifiables et organise leurs transformations.
Écris toutes les parties promises ou donne des règles déterministes suffisantes.
Vérifie le temps, les notes, la tessiture et les capacités instrumentales.
Applique les règles de style seulement dans le profil choisi.
Corrige d’abord les erreurs bloquantes puis les problèmes musicaux dominants.
Ne prétends jamais avoir rendu, écouté ou mesuré sans l’avoir fait.
Livre les fichiers existants et un rapport de contrôle proportionné.
```

Ces instructions sont une base de conception originale. Avant installation, les adapter au format de skill ou d’agent de la plateforme et aux outils autorisés.

## 4. Routage des connaissances

Ne pas charger tous les fichiers à chaque demande. Lire le guide et le brief, puis les chapitres pertinents :

- Débutant : 01–05, puis 20.
- Mélodie sur accords : 03–07 et 16–17.
- Paroles : 05–06 avec le texte réel et ses contraintes.
- Boucle vers morceau : 09–10, 12 et 15.
- Orchestration : 04, 08, 11–12 et profil des instruments.
- Cinématique : 09, 11, 13 et 19.
- Harmonie avancée : 04, 07–08 et 14.
- Export : 16–17 avec la documentation actuelle des outils.
- Révision : 17, 24 et 26.

Lire les sources externes lorsque le corpus ne suffit pas, qu’un détail instrumental est incertain ou qu’une API change. Conserver les références effectivement consultées dans le rapport de travail.

## 5. Mémoire et états internes

Maintenir : brief canonique, décisions validées, matériaux, cartes temporelles, pistes, profils instrumentaux, versions et rapport. Une correction de l’utilisateur devient une contrainte persistante pour le projet. Ne pas réintroduire une option explicitement rejetée sans nouvelle raison et sans la signaler.

Les objets nécessaires à la composition doivent être séparés des commentaires pédagogiques. Une longue explication ne doit pas rendre impossible l’accès aux notes exactes. Un ID permet de suivre un motif à travers les transpositions et les reprises.

## 6. Outils minimaux

Premier niveau : lecture/écriture de texte, calcul rationnel, validation JSON et gestion de fichiers. Deuxième : lecture/écriture MIDI et comparaison après réimport. Troisième : génération MusicXML, moteur sonore et accès aux banques. Quatrième : analyse audio et écoute effective pour réviser le rendu.

L’agent doit annoncer ses capacités présentes, pas toutes les capacités cibles. L’absence de moteur audio ne l’empêche pas de composer symboliquement ; elle limite sa validation sonore. Une banque inconnue doit déclencher un profil générique au lieu d’un mapping inventé.

## 7. Niveaux de livraison

**Esquisse** : forme et réduction musicale. **Composition symbolique complète** : événements de toutes les parties et instructions expressives. **Maquette audio** : rendu de cette composition avec sons identifiés. **Production finalisée** : mix, contrôles et formats convenus.

Ne pas appeler une esquisse « morceau finalisé ». À l’inverse, ne pas imposer du mastering à une demande de notes. Le niveau attendu doit être fixé dans le brief.

## 8. Critères de recette

L’agent passe les cas du [chapitre 26](26_cas_limites_et_recette_agent.md), développe au moins un projet complet et peut justifier ses révisions. Il préserve une mélodie imposée, gère correctement un 6/8, détecte une durée impossible, distingue note tenue et nouvelle syllabe, et ne fabrique pas de validation audio.

La qualité artistique se teste sur plusieurs projets et avec des retours d’écoute. Une démonstration réussie sur une boucle ne prouve pas une compétence générale. Prévoir un petit corpus d’évaluation varié et des versions de référence, sans transformer une préférence personnelle en loi musicale.

## 9. Versions futures

Priorité 1 : validateur et export symbolique fiables. Priorité 2 : styles et instruments vérifiés. Priorité 3 : rendu et boucle d’écoute/révision. Priorité 4 : styles historiques spécialisés, microtonalité et musique adaptative. Chaque extension doit conserver les conventions et passer les cas déjà couverts.

**Références :** [15](15_processus_composition_agent.md), [16](16_representation_symbolique_et_exports.md), [17](17_validation_et_revision.md) et [26](26_cas_limites_et_recette_agent.md). Spécification originale. **Confiance : élevée** pour l’architecture proposée ; performance d’un futur agent non évaluée avant implémentation.
