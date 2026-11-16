# 27 — Modèles de briefs, de demandes et de livraisons

## 1. Brief canonique à remplir

```yaml
projet:
  titre: à définir
  destination: instrumental autonome
  niveau_livraison: composition symbolique complète
  style: à définir
  intention: à préciser avec plusieurs leviers
contraintes_dures:
  duree: à définir
  tolerance_duree: à définir
  mesure: à définir
  tempo_et_unite: à définir
  materiau_a_preserver: aucun par défaut
  tessiture: à définir selon instrument ou voix
  nombre_de_parties_max: à définir
preferences:
  centre_tonal: proposé si absent
  instruments: génériques si non précisés
  complexite: à définir
  forme: proposée si absente
sorties:
  description: oui
  notes_exactes: oui
  midi: seulement si outil disponible et demandé
  audio: seulement si moteur disponible et demandé
validation:
  temps: obligatoire
  contraintes: obligatoire
  harmonie_et_tessitures: obligatoire
  ecoute_audio: seulement si rendu disponible
```

Les valeurs « à définir » sont des champs de travail, pas des données valides d’un export. Avant génération des notes, remplacer les champs indispensables par des valeurs ou hypothèses explicites.

## 2. Demande de miniature débutante

> Compose une miniature originale de 16 mesures, en 4/4 à noire = 90, pour basse, accords et mélodie. Utilise une tessiture de mélodie C4–C5. Propose la tonalité. Donne la forme, tous les accords avec leurs durées, toutes les notes et les silences. Fais apparaître un motif puis une variation. Vérifie le temps et distingue ce qui reste à écouter.

Sortie attendue : brief complété, grille de 16 mesures, parties exactes, motif identifié, durée 42⅔ secondes hors queue sonore et rapport de contrôle. Si la notation décimale est utilisée, annoncer l’arrondi, environ 42,67 s.

## 3. Demande de mélodie sur paroles

> À partir de la grille et du texte fournis, conserve les accords et les mots. Déclare la prononciation, compte les syllabes chantées et place d’abord leur rythme. Compose ensuite les hauteurs dans la tessiture indiquée. Une syllabe par attaque par défaut. Si une contrainte ne peut pas être tenue, expose le conflit et propose la modification minimale séparément.

Sortie attendue : texte original, scansion, calendrier harmonique, tableau des syllabes/notes/durées et commentaires sur les appuis. Si une note traverse un accord, préciser ses fonctions successives. La prononciation humaine reste à vérifier en cas d’ambiguïté.

## 4. Demande de développement d’une boucle

> Développe cette boucle de huit mesures en un morceau de 64 mesures. Garde le motif reconnaissable, prévois au moins un contraste, un retour transformé et une fin. Limite-toi à six parties. Décris précisément les transitions et fournis soit toutes les notes, soit des règles déterministes qui les reconstruisent sans choix supplémentaire.

Sortie attendue : plan global, filiation des motifs, matrice d’arrangement, événements ou règles complètes, durée calculée et réserves. Une phrase « varier le refrain » n’est pas une instruction déterministe suffisante.

## 5. Demande d’orchestration

> Orchestre cette réduction pour l’effectif fourni en conservant mélodie et harmonie. Travaille d’abord en sons réels. Précise registres, articulations, doublures, respirations et effectifs. Vérifie les transpositions pour les parties écrites. Si un détail instrumental n’est pas documenté, identifie-le avant de prétendre fournir une partition prête aux musiciens.

Sortie attendue : réduction de référence, parties affectées, vérification de jouabilité et version écrite si un outil approprié existe. Une liste d’instruments sans notes ne satisfait pas une demande de partition complète.

## 6. Demande de version électronique

> Réalise la composition avec cinq rôles : rythmique, basse, harmonie, arpège et lead. Décris les propriétés sonores requises sans inventer de preset. Définis l’ordre de l’arpège, le gate, les accents et les automations par section. Vérifie la polyphonie et le chevauchement harmonique produit par les effets.

Sortie attendue : composition symbolique, profils de sons génériques, cartes d’automation et consignes de rendu. Les paramètres propres à un synthétiseur doivent être vérifiés séparément.

## 7. Demande de révision ciblée

> Analyse cette version au niveau réellement accessible : notes, MIDI ou audio. Choisis les trois problèmes prioritaires maximum. Propose une révision minimale de chacun, préserve les contraintes et compare avant/après. Sépare erreurs de données, problèmes d’écriture et préférences artistiques.

Sortie attendue : constats appuyés sur des éléments précis, changements exacts et rapport des contrôles refaits. Ne pas livrer une nouvelle composition en prétendant avoir simplement corrigé deux notes.

## 8. Gabarit de réponse courte

```text
Intention et hypothèses : ...
Contraintes retenues : ...
Durée et calendrier : ...
Matériau principal : ...
Structure : ...
Parties écrites ou règles de réalisation : ...
Contrôles réalisés : ...
Points à écouter ou à confirmer : ...
Fichiers réellement fournis : ...
Confiance par conclusion : ...
```

## 9. Gabarit de dossier complet

Une future livraison peut contenir `brief.md`, `structure.md`, `harmonie.md`, `parties.md`, `realisation.md` et `controle.md`, accompagnés des données symboliques et exports demandés. Ce sont des noms proposés, pas des fichiers déjà générés pour un morceau particulier dans ce corpus.

Pour un projet simple, fusionner ces rubriques. Pour une œuvre longue, répartir les parties par instrument et conserver un index. Toujours pouvoir relier une donnée de sortie au brief et à sa version.

**Références :** [15](15_processus_composition_agent.md), [16](16_representation_symbolique_et_exports.md), [17](17_validation_et_revision.md) et [22](22_cahier_des_charges_futur_agent.md). Modèles originaux. **Confiance : élevée** sur les contrats proposés ; qualité d’exécution à évaluer sur l’agent implémenté.
