# 25 — Glossaire opérationnel et erreurs fréquentes

## 1. Vocabulaire

| Terme | Définition utile pour le corpus |
| --- | --- |
| Accord | Sonorité harmonique définie par un ensemble de hauteurs et leur contexte |
| Altération | Modification notée d’une hauteur : dièse, bémol, bécarre, etc. |
| Anacrouse | Départ avant le premier appui principal, souvent dans une mesure initiale partielle |
| Arpège | Réalisation successive de notes d’un accord |
| Arrangement | Organisation et adaptation des parties, des sections et de leurs évolutions |
| Articulation | Manière d’attaquer, tenir et relier les événements |
| Basse | Partie ou hauteur la plus grave dans le contexte considéré |
| Cadence | Arrivée articulée d’une phrase, avec une fonction de fermeture ou d’attente |
| Classe de hauteur | Hauteur considérée indépendamment de l’octave, modulo 12 dans le système de référence |
| Contour | Profil de montée, descente et répétition d’une ligne |
| Contrechant | Ligne secondaire relativement autonome par rapport au thème |
| Contrepoint | Organisation des relations entre plusieurs lignes simultanées |
| Degré | Position relative dans une gamme ou une organisation tonale |
| Densité | Quantité et répartition des événements ou parties, à définir selon le contexte |
| Disposition / voicing | Répartition des notes d’un accord dans les registres et les voix |
| Doublure | Renforcement ou coloration d’une partie par une autre |
| Dynamique | Profil d’intensité, distinct d’un simple numéro de vélocité |
| Enharmonie | Noms différents pouvant correspondre à une même hauteur dans un accordage donné |
| Extension | Note ajoutée au-delà des éléments de base d’un accord, selon la syntaxe employée |
| Fondamentale | Note de référence qui nomme et structure l’accord |
| Forme | Organisation temporelle des parties et de leurs relations |
| Gate | Durée d’ouverture ou de maintien d’une note dans une réalisation, selon le moteur |
| Groove | Organisation sensible des appuis, placements et articulations entre parties |
| Harmonie | Relations entre sonorités et organisation de leurs successions |
| Hook | Élément particulièrement saillant ou mémorisable d’un morceau |
| Mélisme | Plusieurs notes sur une même syllabe |
| Mode | Organisation de hauteurs autour d’un centre et d’un ensemble de relations caractéristiques |
| Modulation | Établissement d’un nouveau centre tonal |
| Motif | Petite unité reconnaissable et transformable |
| Orchestration | Distribution des voix entre instruments, registres et gestes |
| Ostinato | Figure répétée servant de support ou de matériau principal |
| Pédale | Note maintenue ou répétée sous des changements de contexte |
| Phrase | Unité musicale dotée d’une direction et d’une articulation perceptible |
| Polyphonie | Plusieurs lignes ; en synthèse, le terme peut aussi désigner un nombre de voix disponibles |
| Prosodie | Relation entre langue, accents, syllabes et réalisation musicale |
| Pulsation | Battement de référence ressenti |
| Registre | Zone de hauteur utilisée ; ses propriétés dépendent de l’instrument |
| Renversement | Disposition déterminée par la note d’accord placée à la basse |
| Retard | Dans le cadre classique, note préparée et maintenue créant une dissonance puis résolue |
| Rythme harmonique | Vitesse et placement des changements d’accords |
| Séquence | Reprise d’un matériau à d’autres hauteurs selon une organisation donnée |
| Stems | Sous-mixes destinés à une livraison ou une recombinaison |
| Syncope | Mise en relief d’une position faible par rapport aux appuis métriques attendus |
| Tempo | Vitesse exprimée avec une unité de note ou de pulsation explicite |
| Tessiture | Zone de hauteur employée ou confortable selon le contexte ; à distinguer de la seule étendue extrême |
| Texture | Organisation des lignes, plans et couches simultanés |
| Tonicisation | Mise en relief locale d’un accord comme centre provisoire |
| Transposition | Déplacement des hauteurs selon une règle définie |
| Vélocité MIDI | Valeur associée à l’attaque ; son effet dépend du son et du récepteur |

## 2. Confusions à détecter immédiatement

**« Une gamme donne automatiquement la tonalité. »** Non : les mêmes notes peuvent soutenir plusieurs centres. Examiner basse, appuis et retours.

**« La fondamentale est toujours la note la plus grave. »** Non : un renversement place une autre note d’accord à la basse. Une basse extérieure peut aussi être explicitement indiquée.

**« E–G–E prouve C majeur. »** Non : C manque et plusieurs interprétations sont possibles. Le contexte peut suggérer un accord incomplet, mais il faut le dire.

**« Toute note étrangère à la triade est fausse. »** Non : elle peut être extension ou ornement. Sa durée et sa fonction doivent être examinées.

**« V–I est toujours une cadence parfaite. »** Non : la place dans la phrase, la basse et l’arrivée mélodique comptent pour cette qualification classique.

**« En 6/8, il y a six pulsations de noire. »** Non : la mesure contient six croches, souvent regroupées en deux pulsations de noire pointée, soit trois noires de durée totale.

**« Trois croches de triolet durent trois croches ordinaires. »** Non dans un triolet de croches usuel : elles occupent la durée de deux croches ordinaires, soit une noire.

**« Un octosyllabe impose huit notes distinctes. »** Non : huit syllabes peuvent répéter la même hauteur ; les mélismes et tenues changent aussi le rapport entre attaques et syllabes.

**« Plus de pistes donne plus d’ampleur. »** Pas systématiquement : les doublures et collisions peuvent réduire la lisibilité. Élargir le registre ou changer l’articulation peut être plus efficace.

**« Le hasard rend humain. »** Pas automatiquement : une intention de phrase et des variations coordonnées sont nécessaires. La dispersion uniforme peut détruire le groove.

**« CC1 est toujours la dynamique. »** Non : le mapping dépend de l’instrument. Lire sa documentation.

**« Un MIDI est un morceau audio. »** Non : il contient principalement des événements et indications. Le résultat sonore dépend du moteur et des sons.

**« Un validateur prouve que le morceau est bon. »** Non : il contrôle les propriétés qui lui ont été définies. L’effet artistique demande une évaluation adaptée.

**« −14 LUFS est la cible obligatoire de tout master. »** Non : destination, esthétique et spécifications doivent être distinguées.

## 3. Conventions à rappeler dans les livraisons

C4 = MIDI 60 ; temps interne en noires ; positions internes à partir de zéro ; durées rationnelles ; hauteur entendue de référence séparée de la hauteur écrite ; durée symbolique séparée de la durée sonore. Un autre choix est possible, mais il doit être déclaré et appliqué partout.

**Références :** [21](21_sources_et_bibliographie.md), entrées correspondant à chaque domaine. Définitions opérationnelles rédigées pour ce corpus. **Confiance : élevée** dans le cadre annoncé ; certains termes possèdent d’autres emplois selon les traditions.
