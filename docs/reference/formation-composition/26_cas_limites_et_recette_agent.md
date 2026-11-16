# 26 — Cas limites et recette fonctionnelle du futur agent

## 1. Principe

Ces scénarios sont des tests de comportement et de calcul à implémenter, pas une batterie déjà exécutée contre un agent existant. Ils évitent qu’une réponse persuasive masque des erreurs de durée, de notes, de prosodie ou de capacités déclarées.

Une réussite doit produire une preuve adaptée : calcul exact, données inspectables, rapport d’export ou écoute effective. La simple phrase « j’ai vérifié » n’est pas une preuve.

## 2. Temps et métrique

| ID | Entrée | Résultat attendu |
| --- | --- | --- |
| R01 | 4/4, durées 2+1+1 | Mesure valide, 4 qn |
| R02 | 4/4, durées 2+1+2 | Dépassement détecté, 5 qn |
| R03 | Trois croches de triolet puis trois noires | 1+3 = 4 qn, valide |
| R04 | 6/8, noire pointée = 80 | 3 qn par mesure ; 1,5 s |
| R05 | 7/8, 2+2+3 croches | 7/2 qn ; regroupement explicite |
| R06 | 32 mesures 4/4, noire = 120, exigence 60 s | Conflit : durée réelle 64 s |
| R07 | 4 qn à 120 puis 4 qn à 60 | Durée totale 6 s |
| R08 | Anacrouse d’une croche | Représentation explicite, pas date négative cachée |
| R09 | Deux notes successives fin/début à 1 qn | Pas de chevauchement dans [début, fin) |
| R10 | Septolet divisant 4 qn, PPQ 960 | Division non entière ; résolution ou arrondi à traiter |

## 3. Harmonie et notes

| ID | Entrée | Résultat attendu |
| --- | --- | --- |
| H01 | E3–G3–C4 | C/E si le contexte confirme C ; premier renversement |
| H02 | G3–C4–E4 | C/G ; deuxième renversement |
| H03 | E3–G3–E4 isolé | Ne pas certifier C sans contexte |
| H04 | C7 | C–E–G–B♭, pas B naturel |
| H05 | Cdim7 | C–E♭–G♭–B𝄫 ; équivalence clavier B𝄫/A expliquée |
| H06 | E tenu sur C, Am puis F | Rôles successifs tierce, quinte, septième majeure |
| H07 | G naturel sur E7 en A mineur | Tension à analyser ; ne pas modifier silencieusement |
| H08 | Dm–G avec centre D imposé | Hypothèse dorienne soutenue notamment par B et les appuis |
| H09 | V–I sans fin de phrase ni basse connue | Ne pas qualifier automatiquement de cadence parfaite |
| H10 | C majeur vers E majeur | Relation de couleur possible ; modulation non certaine sans établissement |

## 4. Texte et voix

- **P01 :** huit syllabes en écriture syllabique → huit attaques vocales, sauf règle différente explicitée.
- **P02 :** une note liée à travers la barre → une seule attaque et une seule syllabe.
- **P03 :** un mélisme de trois notes → trois événements liés au même ID de syllabe.
- **P04 :** e caduc ambigu → prononciation déclarée, pas compte prétendument certain sans scansion.
- **P05 :** mélodie hors tessiture → conflit détecté et transposition ou adaptation proposée.
- **P06 :** texte imposé → aucune réécriture silencieuse pour faire entrer les syllabes.

## 5. Instruments et export

- **I01 :** clarinette en si♭, cible entendue C4 → note écrite D4 dans la conversion usuelle ; éviter la double transposition.
- **I02 :** trois notes tenues plus deux nouvelles sur patch limité à quatre voix → dépassement symbolique si les anciennes sont encore actives ; vérifier aussi releases et sustain.
- **I03 :** mapping de bibliothèque inconnu → aucune affectation CC présentée comme certaine.
- **I04 :** note-on sans note-off → erreur d’intégrité d’export.
- **I05 :** même nom d’octave différent entre logiciels → numéro MIDI utilisé comme référence.
- **I06 :** MIDI valide mais mauvais preset → distinguer données et réalisation, ne pas corriger arbitrairement les notes.
- **I07 :** note microtonale polyphonique avec pitch bends différents → vérifier architecture par canal ou par note, pas bend global supposé suffisant.

## 6. Transparence et qualité

- **Q01 :** aucun audio rendu → ne pas dire « j’ai écouté ».
- **Q02 :** aucun loudness mesuré → ne pas fournir une valeur comme résultat réel.
- **Q03 :** morceau demandé de 64 mesures → ne pas livrer seulement huit mesures répétables sans règle de développement complète.
- **Q04 :** notes hors accord → ne pas toutes les supprimer automatiquement.
- **Q05 :** règles classiques et profil techno → ne pas interdire toutes les quintes parallèles.
- **Q06 :** objectif émotionnel → proposer des leviers et une écoute, pas une garantie.
- **Q07 :** demande de fichier → fournir un fichier effectivement créé et accessible.
- **Q08 :** demande de notes seulement → ne pas annoncer une production finalisée.

## 7. Recette des deux projets guidés

**Projet synthwave :** 64 mesures ; 256 qn ; 153,6 secondes à noire = 100. Vérifier toutes les pistes par expansion, les silences de sections, la mesure 32 sans batterie, la coda et les transpositions du thème. Aucun export audio n’est implicite.

**Projet cinématique :** 48 mesures ; 192 qn ; 144 secondes à noire = 80. Vérifier le renversement Dm/A, les C♯ de A7, l’ostinato 17–40, la doublure d’harmonie 25–32 et la dernière tenue D4 de quatre qn.

## 8. Seuil de passage proposé

Toutes les contraintes dures et tous les invariants numériques doivent passer. Les réserves musicales sont documentées. Les cas expressifs ouverts sont examinés à l’écoute sur plusieurs projets. Un bon résultat sur un seul style ne suffit pas à valider l’ensemble du périmètre.

**Références :** chapitres [16](16_representation_symbolique_et_exports.md), [17](17_validation_et_revision.md), [18](18_projet_synthwave_complet.md) et [19](19_projet_cinematique_et_variantes.md). Cas de recette originaux. **Confiance : élevée** sur les résultats fermés ; appréciation artistique non automatisée ici.
