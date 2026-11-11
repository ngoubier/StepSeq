---
name: composer-melodies-accords-texte
description: Composer en français des mélodies cohérentes à partir d’une grille d’accords et de paroles ou d’une structure métrique de texte (octosyllabes, alexandrins, syllabes par mesure). Utiliser pour mettre un poème en musique, inventer une mélodie instrumentale fondée sur une prosodie implicite, varier une phrase ou fournir les notes détaillées et, sur demande, un fichier MIDI.
---

# Composer des mélodies à partir d’accords et de texte

## Principes

Faire servir la mélodie au texte réel ou à sa structure métrique. Combiner cohérence harmonique, prosodie, identité des motifs et trajectoire expressive. Ne pas confondre compatibilité des notes avec qualité musicale ; ne pas garantir une qualité esthétique sans écoute.

Conserver les contraintes explicites de l’utilisateur. Poser une question ciblée lorsqu’une ambiguïté empêche de respecter une contrainte ; sinon avancer avec des hypothèses annoncées. Ne pas imposer de style, d’émotion ou de dispositif matériel. Ne pas créer de paroles lorsque seule une métrique est demandée.

Lire [harmonie.md](references/harmonie.md) pour décomposer les accords, distinguer modes et qualités, ou traiter une couleur ambiguë. Lire [prosodie-rythme.md](references/prosodie-rythme.md) pour la scansion, les valeurs et les exemples. Lire [sortie-midi.md](references/sortie-midi.md) avant un export MIDI.

## 1. Établir le contrat musical

Recueillir dans les informations déjà disponibles :
- La grille, les symboles exacts, la position et la durée de chaque accord.
- Le texte et sa langue, ou la métrique attendue : syllabes par vers, groupes, répétitions, césures.
- Le nombre de mesures par vers et, si imposée, la répartition des syllabes par mesure.
- La signature rythmique, le tempo, la tonalité ou le mode s’ils sont connus.
- La tessiture, le style, le caractère, la complexité rythmique et la destination vocale ou instrumentale.
- La sortie : tableau de notes par défaut ; fichier MIDI sur demande.

Demander au minimum une grille et un texte ou une structure métrique si les deux ne sont pas fournis. Ne pas prétendre les avoir reçus. Si l’utilisateur autorise leur invention, les proposer explicitement.

Pour les autres paramètres absents, proposer comme hypothèses de départ : 4/4, noire = 90 BPM, phrase monodique, tessiture MIDI 60–72 (Do4–Do5 selon la convention Do central = MIDI 60), une mesure par accord sans durée indiquée, deux mesures par vers. Adapter la tessiture avant de générer si une voix réelle est précisée. Ne pas inférer une tonalité certaine du seul premier accord ; signaler les interprétations concurrentes utiles.

Distinguer les contraintes obligatoires des préférences. En cas d’impossibilité, expliquer le conflit et proposer la plus petite modification, sans changer silencieusement le texte, la grille ou les durées.

## 2. Construire le calendrier harmonique

Représenter chaque accord par un début et une fin exacts, sa fondamentale, sa qualité, ses extensions, sa basse et ses notes. Utiliser des fractions de noire comme unité interne, jamais des secondes pour le calcul rythmique principal. En n/d, compter n × 4/d noires par mesure ; distinguer cette unité de la pulsation ressentie, notamment en 6/8.

Analyser le contexte global : centre tonal, mode éventuel, fonctions lorsque pertinentes, emprunts ou dominantes secondaires. Ne pas plaquer l’analyse tonique–prédominante–dominante sur toutes les boucles modales.

Autoriser une phrase à traverser plusieurs accords. Pour une note tenue sur un changement, réévaluer son rôle sur chaque segment : note commune, extension, anticipation ou retard préparé et éventuellement résolu. Ne pas couper systématiquement les notes aux frontières harmoniques.

## 3. Établir la prosodie

Découper le texte en syllabes effectivement chantées. Afficher le découpage et le compte de chaque vers ; traiter explicitement les e caducs, élisions, diérèses et synérèses ambiguës. Ne pas confondre nombre de mots, de lettres et de syllabes. Distinguer métrique poétique et prononciation choisie pour le chant.

Identifier les groupes de sens, mots importants, accents naturels, césures et endroits où respirer. En français, favoriser les fins de groupes prosodiques sans accentuer mécaniquement chaque fin de mot. Ne pas séparer arbitrairement un mot par un silence ou une respiration.

Sans texte, créer des identifiants de syllabes abstraites (V1-S1, V1-S2…) et des groupes accentuels proposés. Ne pas prétendre connaître les accents linguistiques avant les paroles.

Adopter une note par syllabe par défaut ; permettre les répétitions de hauteur. Ne produire des mélismes que sur demande, avec une même syllabe rattachée à plusieurs notes. Traiter une note liée au-delà d’une barre comme une seule attaque et une seule syllabe. Ne pas confondre silence et syllabe.

Conserver les paroles originales comme référence. Proposer séparément une modification de mot, de scansion ou de vers si elle améliore le chant ; l’étiqueter et ne jamais la présenter comme le texte d’origine.

## 4. Générer le rythme avant de détailler les hauteurs

Placer les syllabes et les respirations dans les fenêtres prévues. Respecter les répartitions imposées, par exemple huit syllabes sur deux mesures, trois attaques puis cinq. Ne pas appliquer automatiquement 3+5 à tous les octosyllabes ni 6+6 à toutes les réalisations musicales d’un alexandrin.

Explorer plusieurs rythmes à nombre d’attaques identique : noires, blanches, croches, doubles croches, valeurs pointées, triolets, silences et liaisons. Choisir une subdivision raisonnable ; ne pas énumérer toutes les combinaisons. Employer des fractions exactes (croche = 1/2 noire, double croche = 1/4, croche de triolet = 1/3).

Faire durer les notes expressives, alléger les syllabes de liaison et ménager des respirations adaptées au tempo. Éviter les longues suites de syllabes très brèves pour une voix sans justification. Utiliser les syncopes et anacrouses intentionnellement ; préciser leur placement et le décompte des mesures.

Vérifier que notes, prolongations et silences couvrent exactement chaque fenêtre. Scinder seulement la représentation d’une tenue aux barres pour le calcul, sans ajouter d’attaque. Faire apparaître aussi les silences initiaux et finaux.

## 5. Composer les hauteurs et les motifs

Définir un motif bref identifiable par son rythme et son contour ; le répéter et le varier de façon contrôlée. Construire des phrases avec départ, développement, sommet et arrivée ; éviter une promenade aléatoire dans une gamme.

Choisir les notes cibles aux endroits structurels : syllabes importantes, notes longues, changements d’accord et fins de groupes. Favoriser les notes d’accord pour les appuis sans imposer la fondamentale ni transformer toute mélodie en arpège.

Relier les cibles avec mouvements conjoints, répétitions, quelques sauts expressifs et notes de passage, broderies, anticipations ou retards selon le style. Distinguer notes d’accord, extensions de couleur et notes de tension. Ne pas exiger une résolution immédiate de chaque note extérieure à la triade : une neuvième peut rester une couleur voulue.

Évaluer chaque note par rapport à l’accord local ET à la phrase. Traiter les tensions exposées par durée, accent, registre et accompagnement ; expliquer les choix saillants plutôt que déclarer une note universellement interdite.

Privilégier la continuité entre accords : notes communes ou cibles proches, avec des exceptions expressives. Maintenir la tessiture et la chantabilité ; éviter les sauts difficiles répétés, l’accumulation d’extrêmes et les sommets sans intention. Ne pas imposer une cadence fermée si une fin ouverte est demandée.

Sur une structure répétée, préserver assez de motif pour être reconnaissable et varier assez pour suivre les mots et l’harmonie. Ne pas remplacer les accords sans demande ; présenter les substitutions éventuelles séparément et réévaluer alors la mélodie.

## 6. Donner de l’expression

Définir des accents, durées et intensités suivant les groupes de sens et la trajectoire de la phrase. Fournir une vélocité MIDI de 1 à 127 pour chaque note ; partir par exemple de 80 et varier intentionnellement. Ne pas assimiler vélocité, volume et accent vocal : leur relation dépend du timbre et de l’instrument.

Garder les positions quantifiées comme référence. N’ajouter microdécalages ou articulation détachée que si utiles ou demandés ; préserver les frontières, les syllabes et les respirations. Distinguer durée rythmique allouée et durée réellement sonnée si elles diffèrent.

## 7. Livrer une proposition exploitable

Présenter brièvement les hypothèses, la grille temporisée et le découpage métrique, puis un tableau complet :

| Mesure | Position dans la mesure | Accord(s) | Syllabe / silence | Note et numéro MIDI | Durée en noires | Valeur musicale | Vélocité | Rôle |
|---|---|---|---|---|---|---|---|---|

Compter les mesures à partir de 1 ; indiquer clairement la convention de position (position 1 = début de mesure, exprimée en noires). Utiliser des fractions pour les triolets. Noter les silences explicitement, sans hauteur ni vélocité. Pour une tenue traversant plusieurs accords, indiquer les accords concernés et le changement de rôle.

Décrire le motif, le point culminant et le type de fin en quelques phrases. Donner une proposition principale ; ajouter une seconde variante ciblée si demandée ou si une ambiguïté expressive la justifie. Ne pas produire plusieurs tableaux volumineux par défaut.

Pour un MIDI demandé, utiliser scripts/export_midi.py avec le schéma documenté dans references/sortie-midi.md. Exporter une piste de mélodie, les paroles si présentes, le tempo et la mesure ; n’ajouter une piste d’accompagnement que sur demande avec un outil adapté. Rappeler qu’un MIDI ne contient ni voix chantée ni rendu audio. Rendre le fichier effectivement accessible selon les règles de stockage de la session ; ne pas annoncer un fichier inexistant.

## 8. Contrôler avant livraison

Vérifier et corriger :
1. La composition exacte des accords et l’orthographe harmonique des notes.
2. La position de chaque événement et le total exact de chaque mesure et phrase.
3. Le nombre de syllabes et d’attaques, les répétitions et l’absence de mélisme non demandé.
4. L’alignement du texte, des respirations et des accents ; signaler les scansions incertaines.
5. La relation de chaque note exposée avec tous les accords qu’elle traverse.
6. La tessiture, les sauts, les motifs et la cohérence des fins de phrase.
7. La correspondance entre le tableau et les événements MIDI, sans chevauchement involontaire.

Employer le validateur de l’exporteur même sans export MIDI lorsqu’un environnement Python est disponible. Ne pas présenter sa réussite comme une validation esthétique ou une analyse automatique du français : il contrôle seulement la structure temporelle et les valeurs numériques. Indiquer un niveau de confiance et les limites réelles de vérification ; ne pas prétendre avoir écouté sans rendu audio effectivement écouté.
