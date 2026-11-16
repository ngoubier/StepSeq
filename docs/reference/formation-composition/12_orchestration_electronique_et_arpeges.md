# 12 — Orchestration électronique, synthèse et arpèges expressifs

**Niveau : intermédiaire à avancé. Résultat : choisir les timbres selon leur fonction et composer leurs évolutions.**

## 1. Le son fait partie de l’écriture

Sur un synthétiseur, enveloppe, filtre, modulation et effets influencent la perception des notes. Un motif rapide peut être net avec une attaque courte et devenir une nappe avec une attaque lente. La même suite MIDI peut donc remplir des fonctions très différentes.

Conserver deux descriptions : le rôle musical et les propriétés sonores requises. « Basse monophonique, attaque courte, grave stable, peu de release » est plus portable qu’un nom de preset supposé disponible. Ajouter l’appareil et le patch exacts seulement après vérification.

## 2. Choisir les timbres par dimensions

| Dimension | Questions de décision |
| --- | --- |
| Attaque | Doit-elle marquer l’appui ou laisser passer une autre partie ? |
| Sustain / release | Les notes doivent-elles se séparer ou se fondre ? |
| Spectre | Quelle place prend le son dans grave, médium et aigu ? |
| Stabilité | Hauteur et timbre doivent-ils rester fixes ou fluctuer ? |
| Largeur | Le son est-il central, diffus ou mobile ? |
| Densité | Une note possède-t-elle déjà beaucoup d’harmoniques et de modulation ? |
| Contrôle | Quels paramètres suivent la phrase ou la forme ? |

Une onde en dents de scie filtrée peut convenir à un pad, une basse ou un lead selon ses enveloppes et son registre. Ne pas associer automatiquement une forme d’onde à une seule fonction.

## 3. Architecture synthétique de départ

Construire un morceau avec une basse centrale, des accords de registre médian, un motif identifiable, une rythmique et une texture facultative. Limiter les couches au début. Tester les timbres en contexte, pas uniquement en solo.

La basse peut être monophonique avec legato ; le lead peut demander du portamento ; le pad demande de la polyphonie. Prévoir la somme des notes tenues et des releases. Quatre voix d’accord avec plusieurs queues superposées peuvent dépasser une polyphonie limitée, même si chaque nouvel accord n’a que quatre notes.

## 4. Construire un arpège

Un arpège réalise dans le temps des notes d’accord, éventuellement étendues sur plusieurs octaves. Définir pool de notes, ordre, subdivision, longueur de cycle, gate, accents et comportement au changement d’accord.

Exemple original sur Am, quatre notes A3–C4–E4–A4, huit croches par mesure : indices 1–2–3–4–3–2–3–2. Durée de chaque pas : 1/2 qn ; durée de cycle : 4 qn. Sur F, on peut garder A3–C4 communs et adapter E4 en F4, puis l’octave de référence selon la conduite choisie.

L’arpégiateur d’un appareil peut trier les notes différemment ou gérer autrement les notes maintenues. Pour une composition déterministe, stocker les événements réalisés, pas seulement la consigne « arp up ».

## 5. Cinq gestes d’expression

- **Étalement** : décaler légèrement les attaques d’un accord ou d’un groupe, dans un ordre décidé. L’étalement change le geste, pas nécessairement le rythme structurel.
- **Alternance** : faire varier des positions ciblées, par exemple les pas 2 et 4, en accent, durée ou hauteur autorisée.
- **Microvariation** : appliquer de petites différences reproductibles, avec une graine si un hasard est utilisé.
- **Accents** : choisir une hiérarchie qui rend le cycle et la phrase lisibles.
- **Articulation** : varier gate, chevauchement ou legato selon la fonction.

Ne pas appliquer ces cinq gestes à intensité maximale. Sur un arpège techno précis, une petite variation d’accent suffit souvent. Sur un accord de piano simulé, un léger étalement peut être pertinent ; il ne remplace pas le phrasé.

## 6. Automations musicales

Dessiner les évolutions par phrase et section : ouverture progressive de filtre, réduction de release avant le retour rythmique, montée de modulation au sommet. Associer chaque courbe à une fonction et à une fenêtre temporelle.

Un filtre plus ouvert peut modifier à la fois timbre et niveau. Comparer à niveau perçu voisin pour savoir ce qui apporte réellement l’intensité. Une résonance forte peut déséquilibrer certaines notes ; contrôler les passages concernés.

Un LFO synchronisé crée une régularité ; un LFO libre crée une évolution différente à chaque phase de départ. Si la reproductibilité importe, définir phase, vitesse et réinitialisation. Les paramètres exacts dépendent du moteur sonore.

## 7. Effets et orchestration

Un delay produit des événements supplémentaires. Calculer ses rencontres avec les nouvelles harmonies. À noire = 120, une croche dure 250 ms et une croche pointée 375 ms ; ces durées changent avec le tempo. Une répétition peut prolonger une note étrangère sur l’accord suivant.

La réverbération remplit les silences et peut gommer l’articulation. Conserver une version sèche de contrôle. Le sidechain peut libérer une attaque de kick ou créer un mouvement stylistique ; son dosage dépend des enveloppes et du tempo. Il ne corrige pas à lui seul un arrangement saturé.

## 8. Exercice et contrôle

Créer huit mesures avec un seul synthétiseur polyphonique et trois rôles enregistrés séparément. Garder la même grille ; distinguer basse, pad et arpège par registre, enveloppe et rythme. Correction : les rôles restent identifiables même sans effets ; les automations soutiennent une évolution précise ; aucun nom de menu ou de preset n’est inventé.

**Références :** [S05, S13 et S17](21_sources_et_bibliographie.md), complétées par des méthodes originales d’écriture électronique. **Confiance : élevée** sur les calculs et rôles ; réglages sonores à adapter au synthétiseur.
