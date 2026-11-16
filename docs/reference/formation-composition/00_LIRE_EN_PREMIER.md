# Composer des morceaux — Formation et base documentaire pour un futur agent

**Version 1.0 — 16 novembre 2026 — Français**

## Objectif

Fournir un parcours depuis les bases musicales jusqu’à des techniques avancées, ainsi qu’une base de connaissances et un cahier des charges pour créer ultérieurement une skill ou un agent compositeur. Le résultat visé n’est pas seulement une suite d’accords : c’est un morceau avec identité, forme, parties écrites et contrôles explicites.

Le dossier réunit théorie, méthodes d’écriture, exemples originaux, exercices corrigés, deux projets développables note par note, conventions de données et critères de validation. **Il ne contient pas une skill installée, un agent exécutable ou un moteur audio.** Les blocs JSON, YAML et pseudocode sont des contrats et exemples documentaires.

## Périmètre et profondeur

Le corpus vise une couverture étendue et opérationnelle de la composition occidentale tonale, modale et de plusieurs approches contemporaines, appliquée aussi aux synthétiseurs, à la synthwave, à la techno mélodique et à la musique cinématique.

Aucune documentation finie ne peut épuiser toutes les traditions et techniques. Les sujets très spécialisés — fugue stricte, orchestration professionnelle par instrument, microtonalité, écriture spectrale, traditions non occidentales et moteurs de musique adaptative — sont introduits avec leurs limites et les besoins de spécialisation. Une formation payante repérée n’est pas présentée comme intégralement suivie.

## Sommaire

| Niveau / usage | Fichier | Compétence ou résultat |
| --- | --- | --- |
| Bases | [01 — Fondamentaux](01_fondamentaux.md) | Notes, intervalles, tonalité et conventions |
| Bases à avancé | [02 — Rythme et groove](02_rythme_mesure_groove.md) | Durées exactes, mètres, triolets et placement |
| Bases à intermédiaire | [03 — Accords et harmonie tonale](03_accords_et_harmonie_tonale.md) | Construire, enchaîner et faire arriver les accords |
| Intermédiaire | [04 — Voicings et conduite des voix](04_voicings_et_conduite_des_voix.md) | Renversements, registres et continuité |
| Tous niveaux | [05 — Mélodie, motifs et phrases](05_melodie_motifs_et_phrases.md) | Créer, développer et réviser une ligne |
| Intermédiaire | [06 — Paroles et prosodie](06_paroles_prosodie_et_chant.md) | Syllabes, accents, respirations et chant |
| Avancé | [07 — Harmonie avancée et modes](07_harmonie_avancee_et_modes.md) | Chromatisme, enrichissements et modulations |
| Intermédiaire à avancé | [08 — Contrepoint et polyphonie](08_contrepoint_et_polyphonie.md) | Lignes indépendantes, imitation et réponses |
| Intermédiaire à avancé | [09 — Forme et développement](09_forme_et_developpement.md) | Organiser le temps long et les contrastes |
| Intermédiaire à avancé | [10 — Arrangement et rôles](10_arrangement_et_roles.md) | Distribuer les fonctions et gérer la densité |
| Intermédiaire à avancé | [11 — Orchestration acoustique](11_orchestration_acoustique.md) | Registres, gestes, doublures et instruments virtuels |
| Intermédiaire à avancé | [12 — Orchestration électronique](12_orchestration_electronique_et_arpeges.md) | Timbres, arpèges et automations |
| Tous niveaux | [13 — Émotions et styles](13_emotions_styles_et_intentions.md) | Traduire une intention sans recettes déterministes |
| Avancé | [14 — Techniques et systèmes](14_techniques_avancees_et_systemes.md) | Séries, symétries, microtonalité et génération contrôlée |
| Agent / méthode | [15 — Processus complet](15_processus_composition_agent.md) | Du brief à la livraison |
| Agent / technique | [16 — Représentation et exports](16_representation_symbolique_et_exports.md) | Temps rationnel, données et MIDI |
| Agent / contrôle | [17 — Validation et révision](17_validation_et_revision.md) | Invariants, avertissements et jugement musical |
| Projet guidé | [18 — Synthwave, 64 mesures](18_projet_synthwave_complet.md) | Composition procédurale complète à cinq rôles |
| Projet guidé | [19 — Cinématique, 48 mesures](19_projet_cinematique_et_variantes.md) | Thème, couches et réorchestration |
| Apprentissage | [20 — Exercices et parcours](20_exercices_et_parcours.md) | 18 exercices et cinq projets de synthèse |
| Références | [21 — Sources et bibliographie](21_sources_et_bibliographie.md) | Ressources vérifiées et limites de consultation |
| Futur outil | [22 — Cahier des charges de l’agent](22_cahier_des_charges_futur_agent.md) | Capacités, routage, états et critères de recette |
| Répertoire | [23 — Bibliothèque de procédés](23_bibliotheque_de_procedes.md) | Recettes paramétrables d’écriture |
| Réalisation | [24 — Production et livraison](24_production_mixage_et_livraison.md) | Mixage, exports et contrôles audio |
| Référence rapide | [25 — Glossaire et erreurs](25_glossaire_et_erreurs_frequentes.md) | Définitions et confusions à éviter |
| Futur outil | [26 — Cas limites et recette](26_cas_limites_et_recette_agent.md) | Scénarios de contrôle du comportement |
| Modèles | [27 — Briefs et sorties](27_modeles_de_briefs_et_sorties.md) | Demandes et livraisons structurées |
| Vérification | [28 — Contrôles du dossier](28_controles_du_dossier.md) | Résultats des contrôles effectués sur cette version |

## Parcours recommandés

**Apprendre depuis le début :** 01 → 02 → 03 → 04 → 05, avec les exercices 20 ; puis 06 si le chant est concerné ; poursuivre 09–12 avant les approfondissements 07–08 et 14.

**Composer aux synthétiseurs :** 02–05, 09–10, 12–13, puis réaliser le projet 18. Ajouter les procédures 15 et 17 pour réviser systématiquement.

**Composer cinématique :** 03–05, 08–11, 13, puis projet 19. Ne pas passer directement au choix des bibliothèques en sautant forme, voix et registres.

**Construire une skill ou un agent :** lire d’abord 15–17 et 22, adopter les conventions, puis organiser une consultation ciblée des chapitres. Utiliser 26 pour la recette et 27 pour les contrats d’entrée/sortie. Consulter 21 lorsque le sujet exige une source externe plus précise.

## Conventions communes

- C4 = Do central = MIDI 60.
- Temps interne en noires `qn`, fractions exactes et positions absolues à partir de zéro.
- Les tableaux de projets numérotent les mesures à partir de 1.
- `bpm_qn` désigne des noires par minute ; la pulsation ressentie est déclarée séparément si nécessaire.
- Les hauteurs de référence sont entendues ; transpositions de parties et de patches sont séparées.
- Une durée symbolique n’inclut pas automatiquement la queue d’effets.
- Une proposition écrite n’est pas présentée comme un rendu audio déjà écouté.

## Exploitation documentaire

Les liens internes sont relatifs : conserver tous les fichiers dans le même dossier. Une archive ZIP accompagne les fichiers pour préserver cette organisation. Un fichier regroupant tout le corpus est également fourni pour l’import dans un outil acceptant un seul document ; ses liens de chapitre sont convertis en liens internes vers les sections correspondantes.

Pour un agent, ne pas charger aveuglément toute la documentation. Extraire d’abord le brief, sélectionner les chapitres utiles et garder un modèle symbolique canonique. Les exemples doivent être adaptés aux contraintes réelles, pas recopiés comme solution universelle.

## Niveau de confiance

**Élevé** pour les calculs et conventions vérifiés ; **moyen** pour une réalisation expressive non écoutée ; **inconnu** pour la performance d’un futur agent avant implémentation et évaluation. Les contrôles précis de cette version sont dans le fichier 28.
