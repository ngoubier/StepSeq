# 06 — Paroles, prosodie et écriture vocale

**Niveau : intermédiaire. Résultat : associer texte, rythme et hauteurs sans perdre le sens ni les respirations.**

## 1. Trois niveaux à séparer

Le texte écrit contient des mots et une métrique éventuelle. La réalisation chantée choisit une prononciation effective. La mélodie distribue les syllabes réellement chantées dans le temps. Un octosyllabe n’impose pas huit noires, ni quatre syllabes par mesure, ni une hauteur différente pour chaque syllabe.

Le français demande une attention particulière aux e caducs, aux élisions, aux liaisons et aux regroupements de sens. L’accent se porte souvent sur la fin d’un groupe prosodique ; accentuer chaque mot de la même manière peut rendre le chant artificiel. La métrique poétique et la diction choisie pour une chanson ne coïncident pas toujours.

## 2. Contrat de départ

Fixer texte exact, langue, prononciation, tessiture de la personne, durée disponible, grille d’accords et degré de liberté. Si l’utilisateur donne uniquement une métrique, employer des identifiants de syllabes abstraites plutôt qu’inventer des paroles non demandées.

Conserver le texte original séparément des adaptations proposées. Une modification utile de mot ou de scansion doit être visible ; ne pas la présenter silencieusement comme le texte fourni.

## 3. Scansion puis rythme

Procédure : lire à voix haute ; découper les syllabes chantées ; marquer les mots porteurs de sens ; choisir les respirations ; placer les durées et les silences ; ajouter les hauteurs seulement ensuite.

Une écriture syllabique associe une syllabe à une attaque. Une note répétée réarticule donc la syllabe suivante. Une tenue liée ne crée pas une nouvelle syllabe. Un mélisme répartit une syllabe sur plusieurs notes ; il doit être explicitement représenté.

## 4. Exemple original vérifiable

Texte : « Le vent du soir nous porte au loin ». Prononciation proposée : Le / vent / du / soir / nous / porte / au / loin ; huit syllabes, e final de « porte » non chanté comme syllabe autonome. Deux mesures de 4/4, noire = 84, accords Am puis F, C4 = MIDI 60.

| Mesure | Début qn dans la mesure | Syllabe | Note | Durée qn | Intention |
| ---: | ---: | --- | --- | ---: | --- |
| 1 | 0 | Le | E4 | 1/2 | Levée interne légère |
| 1 | 1/2 | vent | A4 | 1 | Premier appui |
| 1 | 3/2 | du | G4 | 1/2 | Liaison |
| 1 | 2 | soir | E4 | 2 | Durée expressive |
| 2 | 0 | nous | A4 | 1/2 | Relance |
| 2 | 1/2 | porte | C5 | 1 | Sommet proposé |
| 2 | 3/2 | au | A4 | 1/2 | Liaison |
| 2 | 2 | loin | F4 | 3/2 | Arrivée |
| 2 | 7/2 | Silence | — | 1/2 | Respiration |

La ligne comporte huit attaques vocales et un silence. Le G de la première mesure est une septième de couleur sur Am, brève ; les autres appuis appartiennent aux accords. Le mot « loin » est prolongé sur sa voyelle ; l’intelligibilité des consonnes doit être évaluée avec une voix réelle ou une synthèse vocale, pas déduite du MIDI.

## 5. Mélodie et texte se corrigent ensemble

Une syllabe importante peut être soutenue par une durée longue, un changement d’accord, un saut, une arrivée sur une note cible ou un changement de registre. Il n’est pas nécessaire d’utiliser tous ces moyens à la fois.

Pour une phrase plus longue, définir des groupes de sens. Une respiration au milieu d’un mot est généralement inadéquate ; une respiration entre article et nom peut également perturber la compréhension. Ne pas placer un silence par commodité de remplissage d’une mesure.

## 6. Chantabilité

La tessiture utile est plus informative que la seule note extrême. Une personne peut atteindre une hauteur une fois et ne pas pouvoir y chanter tout un refrain. Examiner le temps passé dans l’aigu, les sauts, le débit syllabique et les voyelles sur les notes difficiles.

Sans information sur l’interprète, produire une tessiture provisoire et déclarée, puis prévoir la transposition. Une ligne instrumentale très rapide n’est pas automatiquement une bonne ligne chantée. Une transposition de tonalité doit préserver la structure et peut nécessiter une révision des voicings.

## 7. Cas avancés

- **Anacrouse** : représenter une mesure initiale partielle ou un précompte, sans événements de début négatif cachés.
- **Mélisme** : lier plusieurs événements au même `syllable_id`, avec une seule entrée de texte.
- **Note traversant un accord** : recalculer sa fonction harmonique avant et après la frontière.
- **Paroles bilingues** : traiter la prosodie de chaque langue, sans transférer mécaniquement les accents français.
- **Alexandrin** : la césure poétique ne force pas une respiration ou une barre de mesure ; décider explicitement de son traitement musical.

## 8. Exercice et contrôle

Réutiliser le texte sur quatre mesures au lieu de deux. Garder huit syllabes, ajouter des durées longues et deux respirations qui respectent le sens. Une correction valide conserve le texte, annonce la scansion, totalise 16 qn et ne crée aucune attaque syllabique supplémentaire non expliquée.

Pour l’agent : valider séparément le compte de syllabes déclaré, le nombre d’attaques et le calendrier. Un validateur de données peut contrôler les deux derniers ; il ne prouve pas à lui seul la justesse linguistique du premier.

**Références :** [S03, S08 et S17](21_sources_et_bibliographie.md). Texte et mise en musique originaux. **Confiance : élevée** sur le décompte dans la prononciation annoncée ; adaptation à une voix réelle à écouter.
