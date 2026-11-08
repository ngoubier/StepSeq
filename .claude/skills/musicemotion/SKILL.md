---
name: musicemotion
description: "Composer des morceaux, mélodies, progressions d'accords et arrangements en partant d'une émotion ou d'une trajectoire émotionnelle. Utiliser pour l'harmonie expressive, la synthwave, la musique cinématique, la pop, l'ambient ou la techno mélodique, avec des propositions jouables, analysées et exportables en MIDI si un outil de génération est disponible."
---

# MusicEmotion — Composition guidée par les émotions

## Mission

Transformer une **intention émotionnelle** en une composition musicale concrète : tonalité/mode, accords chiffrés, voicings, basse, mélodie, rythme, arrangement, timbres et structure. Privilégier les propositions **jouables et vérifiables**, et expliquer comment chaque décision sert l'intention émotionnelle.

**Principe fondamental :** aucune suite d'accords n'encode universellement une émotion. Ne jamais promettre qu'un accord « provoque » nécessairement une émotion ; présenter des hypothèses stylistiques à écouter et à comparer. L'harmonie doit être évaluée avec la mélodie, le tempo, la dynamique, le timbre, les attentes, le contexte culturel et les références de l'auditeur.

## Quand utiliser cette skill

- L'utilisateur souhaite composer à partir d'une émotion : nostalgie, tristesse, espoir, angoisse, sérénité, euphorie, mystère, etc.
- Il demande des progressions d'accords, une mélodie, une ligne de basse, un arpège ou un arrangement expressif.
- Il veut faire évoluer un morceau d'une émotion à une autre.
- Il veut comparer plusieurs harmonisations d'une mélodie ou analyser l'effet émotionnel d'un morceau.
- Il veut adapter une proposition à un style ou à un instrument (synthétiseur, groovebox, DAW, piano, etc.).

## Procédure obligatoire

### 1. Identifier l'intention

Si disponibles, relever :
- **Émotion principale** et nuances : p. ex. « nostalgie douce, non tragique ».
- **Trajectoire** : p. ex. « solitude → nostalgie → espoir → libération ».
- **Valence** (négative ↔ positive), **activation** (calme ↔ intense), **tension** (stable ↔ instable) sur 0–100, comme repères subjectifs.
- Style, références artistiques, instrumentation, tempo, longueur et niveau technique.

S'il manque des détails, **avancer avec des hypothèses explicites** plutôt que multiplier les questions. Ne poser une question que si l'ambiguïté empêche réellement de produire un résultat utile.

### 2. Proposer trois pistes contrastées

Fournir idéalement :
1. **Évidence stylistique** : harmonie simple, émotion immédiatement lisible.
2. **Nuance** : extensions, renversements ou emprunts modaux.
3. **Surprise** : cadence évitée, pédale, chromatismes ou modulation.

Pour chacune : tonicité/centre, mode, grille de 4–8 mesures, degrés romains, tempo suggéré, raisonnement émotionnel et principale réserve.

### 3. Développer une piste en musique jouable

Inclure les éléments suivants selon la demande :
- **Accords par mesure** : symboles corrects, degrés dans la tonalité, notes réelles de chaque accord.
- **Voicings** : notes par octave ou plages de registre ; gérer les mouvements de voix.
- **Basse** : fondamentales et notes de passage, rythme précis.
- **Mélodie** : notes nommées avec octaves (notation scientifique : C4 = do central), durées, mesure et placement ; motif de 2 mesures puis variations.
- **Rythme** : BPM, signature rythmique, groove/swing, silence.
- **Arrangement** : batterie, basse, pads, arpège, lead, effets, montée/descente de densité.
- **Structure** : intro, couplet, refrain, pont, outro ; points culminants et résolutions.

Ne pas confondre une note d'accord, une tension disponible et une note étrangère. Expliquer les dissonances délibérées et leurs résolutions.

### 4. Vérification musicale

- Contrôler les notes de tous les accords et leur cohérence enharmonique avec la tonalité.
- Vérifier degrés, emprunts modaux et dominantes secondaires.
- Contrôler que les durées des notes couvrent exactement les mesures (ou indiquer les silences).
- Vérifier tessiture et polyphonie selon les contraintes fournies.
- Vérifier que la mélodie exploite tensions/résolutions au bon moment.
- Distinguer constats d'analyse, choix créatifs, et hypothèses émotionnelles.
- Si un MIDI/audio est demandé, ne prétendre à aucun export ou écoute sans avoir généré/contrôlé le fichier concerné.

### 5. Faire tester et itérer

Proposer une **comparaison A/B** en faisant varier un seul paramètre à la fois :
- mode majeur vs mineur ;
- tierce vs neuvième ;
- résolution attendue vs cadence évitée ;
- mélodie montante vs descendante ;
- pad doux vs lead brillant ;
- basse en fondamentales vs pédale ;
- densité et groove constants vs crescendo.

Demander ensuite quelle version communique le mieux l'émotion. La perception de l'auditeur prime sur les étiquettes théoriques.

## Repères harmoniques expressifs

Lire `references/emotion-matrix.md` pour les associations circonstanciées entre émotions, harmonies, lignes mélodiques et arrangement.

Lire `references/harmony-toolkit.md` pour les accords, extensions, emprunts, cadences, voice leading, modes, voicings et techniques de tension/résolution.

Lire `references/composition-workflows.md` pour les méthodes « émotion → morceau », « mélodie → réharmonisation », « narration cinématique » et « variation A/B ».

Lire `references/examples.md` pour des propositions complètes en notation textuelle, avec notes et durées.

Lire `references/sources.md` pour les ressources pédagogiques et scientifiques et les limites de leur interprétation.

## Format de réponse privilégié

```markdown
### Intention
Émotion et trajectoire ; style ; contraintes ; degré de certitude.

### Palette sonore
Tempo, signature, centre tonal, mode, choix de timbres et dynamique.

### Progression
| Mesure | Accord | Degré | Notes | Fonction / intention |

### Mélodie et basse
Notes + octaves + durées, motif et variations, placement sur les accords.

### Arrangement
Pistes, rôle, registre, rythme, effets, transitions.

### Alternatives et essai A/B
Deux modifications isolées et leur effet émotionnel plausible.

### Contrôles
Notes/durées/degrés validés ; limites ; niveau de confiance.
```

## Adaptation aux outils électroniques

Lorsque l'utilisateur compose sur synthétiseur ou groovebox :
- préciser nombre de pistes, rôles (drums, bass, pad, arp, lead), patterns et longueurs ;
- présenter une grille pas-à-pas si c'est utile : `1 e & a 2 e & a 3 e & a 4 e & a` ;
- proposer des réglages **génériques** de filtre, enveloppe ADSR, chorus, delay, reverb, sans inventer de noms de menus ou de presets ;
- ne fournir des manipulations matérielles précises que si elles sont confirmées par une documentation fiable ;
- préférer une version immédiatement reproductible, suivie d'une version enrichie.

## Calibration de confiance

- **Élevé** : identification des notes d'accords, intervalles, degrés et calculs rythmiques vérifiés.
- **Moyen** : un effet émotionnel plausible dans un genre et un contexte culturel donnés.
- **Faible / inconnu** : émotion exacte produite chez un auditeur particulier sans test d'écoute.

Ne jamais réduire des personnes, des cultures ou des émotions à une correspondance musicale déterministe.
