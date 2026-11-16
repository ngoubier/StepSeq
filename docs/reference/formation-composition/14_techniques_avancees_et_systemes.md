# 14 — Techniques avancées et systèmes de composition

**Niveau : avancé. Résultat : sélectionner et appliquer un système sans confondre complexité et qualité.**

## 1. Quand utiliser un système

Une technique avancée sert un problème précis : développer un matériau, organiser une tension, créer une texture ou explorer un langage. Elle ne constitue pas automatiquement une amélioration. Le futur agent doit pouvoir expliquer pourquoi il utilise une technique et quelles contraintes elle impose.

Le présent chapitre donne des procédures d’entrée. Une maîtrise professionnelle de la fugue, de l’écriture spectrale ou de l’orchestration étendue demande un travail spécialisé au-delà de ce corpus.

## 2. Économie motivique et variation développante

Choisir un petit noyau : par exemple intervalles +2, +3, −2 demi-tons, avec rythme croche–croche–noire–blanche. En dériver des phrases en conservant au moins un trait : rythme, contour ou intervalle caractéristique. Au cours d’une section, introduire une transformation qui devient à son tour le matériau de la suivante.

Tracer la filiation : M0 → M1 par augmentation ; M1 → M2 par fragmentation ; M2 → M3 par changement de basse. Ne pas générer des variantes indépendantes sans lien avec le parcours global.

## 3. Sérialisme de hauteurs

Une série dodécaphonique ordonne les douze classes de hauteur sans répétition à l’intérieur de cette présentation initiale. Cela ne signifie pas que toutes les musiques atonales utilisent une série ni que tous les sérialismes se limitent aux hauteurs.

Exemple original de série, C = 0 : `P = [0, 1, 4, 2, 7, 5, 8, 6, 11, 9, 3, 10]`. Les douze entiers 0 à 11 apparaissent une fois.

- Transposition Tn : ajouter n à chaque valeur, modulo 12.
- Inversion autour de 0 : remplacer x par −x modulo 12.
- Rétrograde : inverser l’ordre de la série.
- Rétrograde de l’inversion : combiner les deux opérations.

L’inversion de cette série est `[0,11,8,10,5,7,4,6,1,3,9,2]`. Ces classes ne fixent ni octaves ni rythme. Choisir ensuite registres, groupements et articulations. Pour une demande stricte, définir les possibilités de répétition locale, d’agrégation et de superposition ; les pratiques historiques diffèrent.

## 4. Collections symétriques et axes

La gamme par tons depuis C donne C–D–E–F♯–G♯–A♯, soit les classes `[0,2,4,6,8,10]`. Une collection octatonique alterne tons et demi-tons, par exemple `[0,1,3,4,6,7,9,10]`. Elles offrent des symétries particulières mais ne définissent pas à elles seules la forme d’un morceau.

Écrire un centre par pédale, registre ou répétition si l’on souhaite une orientation perceptible. Ne pas appliquer automatiquement des fonctions I–IV–V à une collection qui n’emploie pas cette syntaxe.

## 5. Microtonalité et accordage

En tempérament égal à N divisions, un pas vaut `1200/N` cents. Un intervalle de fréquences f2/f1 vaut `1200 × log2(f2/f1)` cents. Une octave vaut 1200 cents.

La représentation MIDI 1.0 en notes entières ne suffit pas pour toutes les hauteurs microtonales. Le pitch bend agit généralement au niveau du canal ; plusieurs notes ayant besoin de bends différents demandent des canaux distincts ou une autre architecture adaptée. Vérifier l’étendue de bend du récepteur et l’accordage réel. Ne pas annoncer une compatibilité MPE ou un tuning par note sans documentation du moteur.

## 6. Écriture spectrale : première approche

À partir d’une fondamentale f0, les partiels harmoniques idéaux sont n × f0. Pour f0 = 110 Hz, les premiers sont 110, 220, 330, 440, 550, 660 et 770 Hz. Le septième partiel ne correspond pas exactement à une note du tempérament égal usuel.

Une approche spectrale peut organiser les hauteurs, timbres ou transformations à partir de telles relations ou d’analyses de sons. Plaquer quelques harmoniques sur un accord ne suffit pas à caractériser toute la pratique spectrale. Pour une analyse réelle, conserver fenêtre, résolution et méthode ; ne pas inventer des partiels d’un fichier non analysé.

## 7. Hasard contrôlé et grammaires

Un hasard uniforme sur toutes les notes détruit souvent la cohérence voulue. Limiter les choix à un rôle : note de passage, variante rythmique, déplacement d’accent. Une graine reproductible aide à comparer et à déboguer.

Une grammaire peut définir : phrase = présentation + réponse ; présentation = motif + variante ; réponse = fragment + arrivée. Une chaîne de transitions peut proposer des suites d’états harmoniques, mais elle ne garantit ni forme convaincante ni mémoire thématique. Conserver des contraintes globales au-dessus des choix locaux.

Pour une optimisation, générer un petit nombre de candidats, éliminer ceux qui violent les contraintes, puis comparer plusieurs critères. Un score unique peut cacher un mauvais compromis. Préserver une marge d’exploration pour les idées moins prévisibles.

## 8. Formes longues, image et musique adaptative

Pour une forme longue, organiser plusieurs niveaux de mémoire : motif, thème, section, mouvement. Prévoir quand une idée revient, ce qui a changé et ce qui est différé. Une texture évolutive peut remplacer certains retours thématiques si l’intention l’exige.

Pour une musique adaptative, composer des états et des transitions : même tempo ou raccord de tempo prévu, points de sortie, notes tenues compatibles et queues d’effets gérées. Une boucle doit être contrôlée à sa frontière ; une transition n’est pas un simple crossfade arbitraire entre harmonies incompatibles.

Les systèmes rythmiques et modaux de traditions spécifiques exigent des sources et un profil propres. Ne pas réduire raga, maqâm ou pratiques de percussion à une gamme occidentale renommée. Le corpus se concentre sur l’écriture occidentale et électronique décrite dans l’introduction.

## 9. Exercice et contrôle

Créer une minute avec un seul motif transformé de trois façons. Variante avancée : imposer une collection symétrique et une modulation de densité, sans cadence fonctionnelle. Correction : contrainte identifiable, filiation documentée, durées exactes et évolution de forme. Le respect d’un système ne constitue pas une validation esthétique.

**Références :** [S01 et S17](21_sources_et_bibliographie.md) comme orientations de lecture ; algorithmes, exemples et contrats proposés ici sont originaux. **Confiance : élevée** sur les opérations mathématiques ; profondeur historique limitée à une introduction.
