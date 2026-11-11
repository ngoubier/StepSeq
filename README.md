# StepSeq

Séquenceur pas-à-pas (step sequencer) dans le navigateur, pour faire de la musique avec des
boîtes à rythmes et des instruments, et enregistrer ses projets dans des fichiers.

## Lancer l'application

**En ligne : <https://ngoubier.github.io/StepSeq/>** (GitHub Pages)

Ou en local : aucune installation ni compilation : ouvrez `index.html` dans un navigateur récent
(Chrome, Edge, Firefox, Safari). Une connexion internet est nécessaire pour charger les sons.

Vous pouvez aussi la servir localement :

```bash
python3 -m http.server 8000
```

puis ouvrir <http://localhost:8000>.

## Interface

- **En-tête** : icône de l'application (menu **Chansons**, **Nouveau**, **Ouvrir**, **Enregistrer**), titre du projet, tempo (BPM), chiffrage de mesure (4/4 par défaut, x/4 ou x/8),
  nombre de mesures, le groove (swing, humanisation), **Lecture** et **Stop**, puis les fenêtres regroupées
  **Band**, **Key : tonalité** (fenêtre Key, propre à chaque scène : assistant
  émotion → grille d'accords → couches pour démarrer, puis onglets Ambiance (émotions rangées par mode), Accords, Grille (accords glissés sur une ligne de mesures → basse, accords et arpège générés), Couches
  et Vérifier ; palette d'accords dans le piano roll, essais A/B), **Song** (fenêtre Song : scènes et arrangement, avec une case pour garder le panneau
  d'arrangement affiché sous l'en-tête) et **Mix** (console de mixage, avec l'assistant **Auto Mix**).
  À droite : annuler / rétablir, l'indicateur d'enregistrement automatique et **Aide**.
  Le bouton **+ Ajouter une piste** se trouve sous les pistes.
- **Partie centrale** : les pistes, les unes sous les autres. Chaque piste a un en-tête
  (écoute, Mute, Solo, nom, volume, réglages, suppression) et sa grille de pas
  (une case = une double-croche).
- **Barre du bas** : mode d'édition **On/Off** (cliquer / glisser pour activer des pas) ou
  **Vélocité** (cliquer-glisser verticalement sur un pas pour régler sa force).

### Ajouter une piste

Le bouton **+** ouvre une fenêtre qui demande :

1. le type de piste : **Drum**, **Instrument** ou **Synthé** ;
2. un nom et une couleur ;
3. pour une piste **Drum** : le type de son (Kick, Snare, Clap, Hi-Hat, Toms, Crash, Ride…),
   la boîte à rythmes (TR-808, TR-909, LinnDrum, …) et la variation ;
4. pour une piste **Instrument** : la catégorie (**Mono**, **Arpège**, **Accord**), la famille
   (Bass, Synth Lead, Pads, Keys, Mallets, Strings, Brass & Winds, Guitar) puis l'instrument.

5. pour une piste **Synthé** : la catégorie, le synthé analogique (pour l'instant le **Roland Juno-106**)
   et son patch ; une fiche affiche la configuration du synthé.

Le bouton **Écouter** permet d'entendre le son avant de valider.

### Band : monter un groupe virtuel

Le bouton **Band** de l'en-tête ouvre une grande fenêtre (`js/band.js`, catalogue `js/band-presets.js`) :

1. le **style musical** : **Synthwave** ou **EDM mélodique** ;
2. le **type de chanson** : 10 inspirations par style (Smalltown Boy, Nightcall, Blinding Lights, Sweet Dreams…,
   Levels, Strobe, Opus, Faded…), avec un tempo suggéré ;
3. les **musiciens**, sur une scène. Un clic ouvre le panneau du musicien : son rôle, son instrument phare ★,
   5 instruments conseillés (▶ pour écouter) et l'accès à toute la bibliothèque via la fenêtre « Nouvelle piste ».
   Le **batteur** (et le percussionniste, optionnel) choisit un kit (★ + 5 conseillés) et coche ses éléments
   (kick, snare, hi-hats…) : une piste par élément, chaque élément pouvant venir d'une autre machine.

**Créer les pistes** crée les pistes, vierges de notes (et applique le tempo si la case est cochée) ;
**Créer toute la chanson** écrit en plus une chanson complète dans l'esprit de l'inspiration : scènes (intro,
couplet, refrain… ou break, montée et drop en EDM), parties de chaque musicien et arrangement, en mode Chanson.
Les plans des 20 chansons sont dans `js/band-songs.js` (tonalité, forme, grilles originales, ce que joue chaque
musicien par section) et les notes sont écrites par `js/bandsong.js` (déterministe). La croix de fermeture, **Annuler** et **Échap** ferment sans rien créer.

Règles d'écriture vérifiées par les tests (`tests/bandsong.test.js`) :

- **tonalité** : chiffres romains lus sur le majeur ou le mineur naturel de la tonique (« VI » en Do mineur ou
  dorien = La♭) ; chaque note est dans la tonalité ou dans l'accord du moment ; les notes de passage des mélodies
  suivent la « gamme du moment » (aucune note à un demi-ton d'une note de l'accord) ; notes d'approche de la basse
  diatoniques ;
- **nuances** : vélocité selon la section (intro et pont retenus, refrain et drop à pleine force), accents
  métriques, phrasé (notes aiguës plus fortes, fins de phrase adoucies), ghost notes de caisse claire, charleston
  accentué, roulements en crescendo ; caisse claire et clap légèrement en retard (réglage **Placement** de la
  console) et petite humanisation.

Les échantillons Dirt-Samples sont joués à leur hauteur réelle, mesurée par `tools/dirt-pitch.py`
(`js/dirt-tuning.js`).

**Mixage et mastering automatiques** (`js/bandmix.js`), appliqués aux pistes créées par Band :

- **niveaux calibrés** : le volume perçu (LUFS) de chaque instrument et de chaque élément de batterie proposés a été
  mesuré (`tools/measure-levels.js` → `js/band-levels.js`) ; chaque piste part du même niveau puis est placée selon
  son rôle (kick et basse devant, caisse claire et lead présents, nappes et arpège derrière, percussions en fond),
  avec une marge d'environ 18 LU avant le master ;
- **égalisation et dynamique** par rôle : passe-haut sur tout sauf kick et basse, creux du bas-médium des nappes et
  claviers, présence de la caisse claire et du lead ; compresseur sur kick, caisse claire, basse, piano et voix ;
  sidechain sur le kick (fort en EDM, léger sur les nappes en synthwave) ;
- **espace** : panoramique par rôle ; envois vers trois **bus d'effets partagés** (reverb plate pour la batterie,
  hall pour les instruments, écho ping-pong au tempo), chorus sur nappes, guitare et voix ; kick et basse secs ;
- **mastering** : EQ et compresseur « glue » léger sur le Master, puis module de mastering (`js/master-dsp.js`) :
  graves en mono, aigus élargis, écrêtage doux des pointes, limiteur à anticipation à −1 dBTP. Le gain d'entrée
  de chaque chanson (`js/band-drive.js`, calculé par `tools/band-drive.js` sur deux rendus complets) est réglé
  sur la partie la plus forte du morceau, comme en studio : refrains et drops vers −10 à −11,5 LUFS (court terme),
  environ −12 à −13 LUFS intégrés, la dynamique des breaks est gardée. Les attaques de la batterie passent par
  un limiteur-écrêteur léger pour que le mastering n'écrase pas tout le morceau à cause d'elles.

### Band → Mélodie : une mélodie sur une grille d'accords

L'onglet **Mélodie** de la fenêtre Band (`js/melodypanel.js`, moteur `js/melody.js`) propose une mélodie sur une
piste à partir d'une **grille d'accords** et d'une **structure**, avec la méthode du skill
`composer-melodies-accords-texte` (calculée dans le navigateur, sans réseau ni IA). La vue est simple :

1. **Grille** : `Am | F | C | G` (« | » sépare les mesures, `Am F` partage une mesure, « . » prolonge, « % » répète),
   ou **Reprendre les accords de la scène**. **La mélodie dure exactement la grille** : 4 accords → 4 mesures ;
2. **Structure** : notes par phrase, les phrases se partagent la grille (`8 8` = deux phrases de 8 notes sur
   2 mesures chacune ; `3+5 3+5` = notes par mesure). Vide : automatique (une phrase de 7 notes pour 2 mesures) ;
3. **Piste** : une piste Mono, ou une nouvelle piste « Mélodie » (instrument lead du groupe).

**Proposer** montre le nombre de notes, la tonalité déduite des accords et la grille de la mélodie : les accords en haut, colorés selon leur fonction (repos, préparation, tension, couleur du mode, emprunt — comme dans la fenêtre Key), et les notes en dessous, chacune avec son nom et une couleur selon son type (note de l'accord, couleur, passage / broderie, appoggiature, note de la gamme, tension) ; **Autre
proposition** en tire une autre ; **Écrire sur la piste** remplace ses notes dans la scène en cours (Ctrl+Z).
Repliés : **Options** (tonalité, tessiture, rythme, fin, et des **paroles** facultatives, découpées en syllabes
françaises, qui remplacent la structure) et **Détails** (hypothèses, contrôles, tableau des notes, export MIDI).
Mélodie : notes de l'accord sur les appuis, notes de passage entre elles, motif repris et varié, respirations en
fin de phrase. Le séquenceur avance par doubles-croches : pas de triolets.

### Auto Mix : l'assistant de mixage et de mastering

Dans la console **Mix** :

- **↺ Tout réinitialiser** remet tout le mix à zéro : faders par défaut, égaliseurs à plat, compresseurs et
  limiteurs coupés, panoramiques au centre, Master d'origine (glue et limiteur de sécurité), mastering coupé. Les
  effets de son des pistes (chorus, écho, reverb, sidechain) et les retours partagés sont conservés.

**Ctrl+Z** annule cette réinitialisation en une fois.

Le panneau **Auto Mix** s'ouvre automatiquement à droite des tranches avec la console **Mix**. Deux grands
boutons lancent les traitements : **Pilote Auto** démarre le cycle automatique et masque les conseils manuels ;
**Assistant** arrête le pilote, affiche les onglets **Mixage** et **Mastering** et lance la lecture pour analyser
le morceau. Les commandes **A/B**, **Réécouter** et **Tout accepter** restent disponibles dans ce mode.
L'objectif et les textes d'aide sont masqués dans le panneau ; l'objectif reste réglable dans les préférences.
Pendant la lecture, l'assistant
écoute le morceau (`js/automix-listen.js` : analyseurs FFT sur chaque piste, sur le Master avant mastering et sur
la sortie stéréo), note sept critères de 0 à 100 et propose des conseils chiffrés (`js/automix.js`, fonctions pures
testées) que l'on **accepte**, **ajuste** (25 à 150 %) ou **refuse** (`js/automixpanel.js`) :

| Critère | Mesure | Cible |
|---|---|---|
| Volume perçu | LUFS intégré, true peak (EBU R128) | Streaming −14, Synthwave −12, EDM mélodique −11, Club −8 LUFS ; ≤ −1 dBTP |
| Dynamique | PLR (crête − LUFS), réduction de gain des compresseurs | PLR 8–13 dB (synthwave) ; ≤ 6 dB par piste |
| Balance tonale | Énergie par bande d'octave comparée à la courbe du style | ±2,5 dB en moyenne par bande |
| Équilibre des pistes | Écart de niveau entre les pistes qui jouent ensemble, comparé aux écarts entre rôles | ±3,5 dB autour de la place du rôle |
| Graves | Recouvrement kick ↔ basse vers 63 Hz, grave inutile ailleurs, graves en mono | < 40 %, corrélation > 0,85 |
| Stéréo | Corrélation, équilibre G/D, largeur | corrélation > 0,2 |
| Marge avant mastering | Crêtes du Master avant le mastering | −6 à −1 dBFS |

- L'**objectif** est proposé d'après le style des pistes du Band et se change dans les préférences.
- Les conseils suivent l'ordre d'un ingénieur du son : mixage (niveaux, graves, égalisation, dynamique, stéréo,
  espace) puis mastering. Chaque conseil accepté passe par les réglages de la console (Ctrl+Z l'annule).
- **A/B** compare le mix d'origine et le mix actuel à volume égal ; **Réécouter** mesure l'effet des changements.
- **Chaînes de traitement** : une piste à plat reçoit une chaîne de départ (égaliseur, compresseur, limiteur) tirée
  des règles par rôle du Band, avec le seuil du compresseur calé sur la crête mesurée à l'entrée de la tranche ;
  un Master à plat reçoit une chaîne de mastering (égaliseur, glue 2:1, graves en mono, largeur, écrêtage doux,
  limiteur −1 dBTP, gain d'entrée réglé sur l'objectif). Modules à cocher un par un, **Essayer** sans enregistrer.
- Corrections des pistes traitées : compresseur trop appuyé ou inactif, attaque trop rapide, limiteur permanent.
- **Préférences** (roue dentée) : ce que l'assistant peut modifier (volumes, EQ, compresseurs, panoramique,
  sidechain, envois, EQ du Master, mastering), l'objectif par défaut, le niveau de détail, la durée d'écoute.
- Les courbes de référence et les niveaux par rôle sont relevés sur les 20 chansons du Band
  (`tools/automix-calibrate.js`).
- **Garde-fous** : l'équilibre des pistes se mesure entre pistes qui jouent ensemble (une intro à deux pistes ne
  fausse plus rien). La référence est la médiane des pistes comparées : une basse trop forte ne devient pas
  le modèle des autres. Le pilote baisse d'abord les pistes en excès et ne remonte pas les autres tant que cet
  excès demeure. Les corrections globales de niveau passent ensuite ; le fader du Master est retiré des mesures. Une piste rare (un clap toutes les 16 mesures) est jugée dès deux relevés. Les creux d'égaliseur posés
  par l'assistant s'arrêtent à −6 dB, les shelfs du Master à ±4 dB, le gain d'entrée du mastering avance de 5 dB au
  plus par conseil et plafonne à +15 dB.
- **✈ Pilote auto des faders** (`js/automix-pilot.js`) : l'assistant règle lui-même l'équilibre pendant la lecture,
  comme à l'oreille. Il choisit la piste la plus éloignée de sa place, fait glisser son fader d'un petit pas
  (2 dB au plus, 1,5 dB/s), puis la réécoute avant d'y retoucher ; après un aller-retour, ses pas s'affinent. Si le
  mix sature au Master, toutes les pistes descendent ensemble et le gain d'entrée du mastering compense. Un journal
  horodaté liste chaque geste, avec une fiche pour l'action en cours ; la tranche est sélectionnée et le fader
  ou le gain Master en mouvement est illuminé. Les conseils manuels de mixage et mastering sont masqués tant
  que le pilote est actif. Chaque geste est une étape Ctrl+Z ; un fader touché à la main n'est plus piloté. Pause
  automatique en solo et pendant l'écoute A.
- **Largeur d'Auto Mix** : glisser le bord gauche du panneau (ou utiliser les flèches une fois la poignée
  sélectionnée au clavier). La largeur est mémorisée ; sur petit écran, le panneau reste empilé sous la console.
- **Pilote du Master** : le traitement global fait partie du cycle automatique complet. L'équilibre des pistes passe
  d'abord. Après 10 secondes d'écoute fraîche, le pilote agit sur un module à la fois : graves et aigus par pas
  de 0,5 dB (±4 dB maximum), compression légère à 1,5:1 quand le compresseur est coupé, puis adaptation du seuil
  selon la réduction mesurée. Le limiteur true peak du mastering actif garde un plafond d'au plus −1 dBTP et
  son gain avance par pas de 0,5 dB vers l'objectif ; si ce module est coupé, le limiteur de la tranche Master
  protège les crêtes à −1 dBFS. Le gain n'est pas augmenté lorsque les attaques sont déjà trop écrasées.
  Chaque geste est visible dans la console et annulable par Ctrl+Z. Retoucher un module le retire du pilotage
  pour la séance. Les autorisations des préférences et un budget de gestes par module limitent les corrections.
- **Traitements piste par piste** : le cycle complet est toujours actif, sans cases de sélection.
  Après l'équilibre des faders, le pilote examine les pistes entendues une à une : EQ selon leur rôle,
  compression calée sur la crête d'entrée mesurée, limiteur si les crêtes le nécessitent. Les tranches déjà
  traitées sont également vérifiées et corrigées d'après le diagnostic. Les modules inutiles restent coupés.
  Après chaque piste, dix secondes de nouvelles mesures du mix complet sont prises ; l'équilibre des faders
  est revérifié avant la suivante. Le Master global est ensuite traité. Une piste silencieuse reste en attente
  sans bloquer les autres. Le panneau indique la phase et le nombre de pistes vérifiées ; la tranche et son
  module en cours de réglage sont mis en évidence. Chaque geste s'annule avec Ctrl+Z et un module retouché
  à la main est laissé à l'utilisateur pour le reste de la séance.

**Panoramique automatique** : intégré aux traitements de chaque piste. Les positions suivantes sont des
valeurs de départ modérées, pas des normes universelles ; inverser les côtés reste un choix artistique.
Le pilote respecte l'autorisation Panoramique des préférences et laisse une commande retouchée à la main.

| Rôle | Position proposée |
|---|---|
| Kick, basse, caisse claire, clap, lead / voix principale | Centre |
| Charleston fermé / ouvert | Droite 20 % / gauche 20 % |
| Cymbales, toms, percussions | Alternance gauche / droite à 25–35 % |
| Arpèges | Alternance droite / gauche à 30 % |
| Claviers / guitares d'accompagnement | Alternance gauche / droite à 20 % |
| Nappes | Alternance gauche / droite à 15 % |

Ces proportions sont des choix conservateurs du projet.

**Effets du Master** : module séparé avec saturation douce, chorus stéréo lent et réverbération courte
(0,7 s, graves filtrés à 180 Hz). Chaque effet dispose de son activation et de son dosage ; le bypass général
conserve les réglages. Le module démarre en bypass et reste transparent dans les anciens projets.
Les effets précèdent l'EQ, la compression et les limiteurs ; l'autopilote ne change pas ces effets créatifs.

Outils de mesure (Playwright + Chromium, rendu hors temps réel de StepSeq) :

```bash
node tools/render-band-song.js levels auto levels.wav
```

```bash
node tools/measure-levels.js
```

```bash
node tools/band-drive.js
```

```bash
node tools/automix-calibrate.js all > automix-mesures.json
```

Les pistes créées par Band sont marquées dans le projet. Si le projet en contient déjà, une confirmation propose
de **remplacer** ces pistes Band par le nouveau groupe (en signalant celles qui contiennent des notes ; Ctrl+Z pour
revenir en arrière) ou de **garder et ajouter**. Les pistes créées sans Band ne sont jamais supprimées.

### Pistes instrument

Le bouton à curseurs de l'en-tête ouvre la fenêtre de **sound design** (oscillateur, filtre cutoff / résonance / enveloppe, ADSR, glide, niveau, panoramique, saturation), inspirée des paramètres de strudel.cc :

- filtre passe-bas, passe-haut, passe-bande ou coupe-bande, avec 4 modèles (comme `ftype()` de strudel) :
  **12 dB**, **24 dB**, **Ladder** (4 pôles façon Moog, avec drive) et **SEM** (variable d'état façon Oberheim) ;
- **glide** : *Portamento* (chaque note glisse depuis la précédente) ou *Glide legato* (façon Moog : seulement
  entre notes liées, sans redéclencher les enveloppes).

Sur une piste **Synthé**, ce bouton ouvre la façade du synthé : pour le Juno-106, les sections LFO, DCO
(16'/8'/4', impulsion + PWM, dent de scie, sous-oscillateur, bruit), HPF, VCF 24 dB/oct, VCA, ENV, chorus I / II,
et la sélection des 128 patches d'usine (groupe, banque, numéro) avec l'afficheur à LED, sur une copie de la
façade d'origine. Un clavier de 2 octaves sous la façade se joue à la souris ou au clavier de l'ordinateur (lettre affichée sur
chaque touche, 6 voix). Le son est un portage du moteur de l'[Ultramaster KR-106](https://github.com/kayrockscreenprinting/ultramaster_kr106).

Le chevron **›** dans l'en-tête d'une piste instrument affiche son piano roll :

- **Mono** : une note par position ; cliquer pour poser, glisser vers la droite pour allonger.
- **Accord** : cliquer sur la fondamentale pose un accord du type choisi (Majeur, Mineur, 7, Maj7…).
- **Arpège** : comme Accord, mais les notes sont jouées par l'**arpégiateur** (voir ci-dessous).

### Arp One, l'arpégiateur

Le bouton **Arp One** du piano roll d'une piste Arpège ouvre l'arpégiateur, titré avec le nom de la piste et la partie en cours (« Arp One · Juno-106 — Couplet ») (`js/arp.js` pour
le moteur, `js/arppanel.js` pour la fenêtre, `js/motifs.js` pour le catalogue de motifs).

**En-tête, toujours visible**

- **Lecture en boucle** de l'arpège sur l'accord de la piste ou un accord d'essai (choisi en deux menus) ;
  chaque réglage s'entend tout de suite. Sur une piste vide, **Poser sur la piste** place l'accord sur la boucle.
  La boucle dure le plus petit nombre de mesures entières qui contient au moins 16 pas et un cycle complet du
  motif ; la grille montre toute la boucle (repères de temps et de mesures) : les colonnes s'affinent quand la
  boucle s'allonge, sans descendre sous 18 px — au-delà, la grille défile pour suivre le curseur.
- **Réglage pas à pas** : cliquer un pas de la grille règle sa **vélocité**, sa **longueur** (¼ temps à
  4 temps), le nombre de **notes à la fois** (1 à 3 : la note + les notes de l'accord juste au-dessus) ou en fait
  un **silence** ; la rangée de vélocités se règle aussi en glissant.

**Onglet Arpège** — une ligne par réglage :

- **Motif** : la tuile du motif en cours ouvre la fenêtre de choix : 51 motifs classés en 8 catégories
  (Montées et descentes, Groupes qui grimpent — dont la **Double montée** A C E A′ · C E A′ C′ —, Sauts et
  intervalles, Basse et pédale, Octaves et répétitions, Synthwave et années 80, Accords et rythmes, Hasard),
  avec recherche et **Récents** ; chaque motif s'essaie en un clic et suit l'accord joué.
- **Vitesse** (1/4 à 1/32, normale / triolet / pointée), **octaves** (1 à 4), **pas** (4, 8 ou 16 : la
  longueur de la grille réglable pas à pas), **geste** (6 gestes tout prêts + **Ajuster ›**) et **durée des
  notes** (selon le geste, ou fixe : ¼ temps … 4 temps).

**Onglet Geste** — rendre un arpège moins mécanique, groupe de notes par groupe de notes :

- 6 **gestes tout prêts** : Mécanique, Balayage, Roulé, Boiteux, Détendu, Harpe ;
- un **pavé** : horizontal = **étalement** (resserrer le groupe, puis respirer avant le suivant), vertical =
  **alternance** (avancer ou retarder les notes paires du groupe) ;
- un **zoom sur un groupe** en millisecondes (grille en pointillés, respiration) et la taille des groupes
  (d'après le motif, ou 2, 3, 4, 6, 8) ;
- 5 curseurs dans l'ordre d'application : étalement, alternance, **microvariation** (± 0 à 20 ms, la note 1
  reste sur la pulsation, **Nouvelle prise** pour d'autres décalages), **accent** de la première note,
  **articulation** (durée dans l'espace avant l'attaque suivante) ;
- **Écouter : Régulier / Geste** pour comparer.

Le début de chaque groupe ne bouge jamais et chaque attaque est calculée depuis sa position prévue : aucune
dérive. Le moteur est déterministe : même accord, mêmes réglages, même prise et même position → mêmes notes.
Les anciens projets se rechargent à l'identique ; l'ancien « jeu humain » est converti en geste.

### Tests

```bash
node --test
```

(Node 18 ou plus récent ; les tests du moteur d'arpège n'ont besoin ni de navigateur ni de carte son.)

Tests de bout en bout des fenêtres de l'arpégiateur et Key dans Chromium (nécessite le paquet `playwright`) :

```bash
node tests/e2e/arp-ui.js
node tests/e2e/arp-cursor.js
node tests/e2e/harmony-ui.js
node tests/e2e/grid-ui.js
node tests/e2e/playhead-ui.js
node tests/e2e/song-ui.js
node tests/e2e/melody-ui.js
node tests/e2e/band-song-ui.js
node tests/e2e/mix-master-ui.js
node tests/e2e/automix-ui.js
node tests/e2e/automix-modes.js
node tests/e2e/automix-chains.js
node tests/e2e/automix-pilot.js
node tests/e2e/automix-loud-bass.js
node tests/e2e/band-close.js
node tests/e2e/automix-track-pilot.js
node tests/e2e/automix-master-pilot.js
node tests/e2e/master-effects.js
node tests/e2e/mobile-ui.js
```

Cliquer sur une note / un accord existant le supprime. Sur la ligne compacte, un clic pose la
dernière note (ou le dernier accord) utilisée.

### Sélection, copier, couper, coller

- **Maj+glisser** sur la ligne d'une piste ou dans le piano roll : sélection rectangle (Ctrl+glisser : ajouter).
- **Maj+clic** / **Ctrl+clic** sur une note : l'ajouter ou la retirer de la sélection.
- **Icône de la piste** (ou `Ctrl+A`) : sélectionner toute la piste.
- Piano roll, bande **Mesures** : clic = une mesure, glisser = plusieurs, Maj+clic = jusqu'à.
- Outil **Sélection** (barre du bas) : glisser sélectionne sans Maj (utile au tactile).
- `Ctrl+C` / `Ctrl+X` / `Ctrl+V` / `Ctrl+D` (dupliquer), `Suppr`, `Échap`. Le collage se fait à la case
  survolée par la souris, sinon au début d'une zone vide sélectionnée, sinon juste après la sélection.
  Glisser la vélocité ou la longueur d'une note sélectionnée modifie toutes les notes sélectionnées.
- **Glisser une note sélectionnée** déplace la sélection (en hauteur aussi dans le piano roll) ;
  **Alt+glisser** en déplace une copie. Flèches `←` `→` : un pas (Maj : une mesure),
  `↑` `↓` : un demi-ton (Maj : une octave).

### Zoom horizontal

En bas à droite : **−** / **+**, le curseur, ou `Ctrl`+molette (pincement sur un pavé tactile), de 10 % à 200 %,
pour voir plus de mesures à la fois. **Tout voir** (touche `0`) fait tenir toutes les mesures à l'écran ;
un clic sur le pourcentage revient à 100 %. Touches `−` et `+` (ou `=`).

### Raccourcis

- `Espace` : lecture / stop
- `Ctrl+S` (`Cmd+S`) : enregistrer — `Ctrl+Maj+S` : enregistrer sous
- `Ctrl+O` : ouvrir
- Double-clic sur le nom d'une piste : renommer

## Fichiers de projet

Les projets sont enregistrés au format JSON (extension `.stepseq.json`) : tempo, mesure, pistes,
sons choisis, pas et notes. Sous Chrome / Edge, **Enregistrer** réécrit le même fichier après le
premier enregistrement ; les autres navigateurs téléchargent le fichier.

### Enregistrement automatique, sans message (`js/store.js`, `js/mysongs.js`)

- **Mes chansons** (**Chansons**, dans le menu de l'icône de l'application) : chaque chanson est enregistrée automatiquement dans le navigateur
  (IndexedDB), environ une seconde après chaque modification, sous son identifiant. **Nouveau** et **Ouvrir**
  n'écrasent plus rien, et il n'y a plus d'avertissement en quittant la page. La fenêtre liste les chansons
  (ouvrir, dupliquer, supprimer) et leurs **versions** : un instantané au plus toutes les 10 minutes de travail,
  40 par chanson ; **Restaurer** garde l'état actuel dans les versions.
- **Fichier lié** (Chrome / Edge) : après un premier **Enregistrer** (ou un **Ouvrir**), chaque modification
  réécrit ce fichier. Le lien est gardé d'une session à l'autre ; après un redémarrage du navigateur,
  l'indicateur affiche « Reprendre *fichier* » : un clic redonne l'autorisation d'écrire. Placé dans un dossier
  Dropbox / OneDrive / Google Drive, le fichier est aussi sauvegardé sur le web.
- L'indicateur d'enregistrement (barre du haut) montre l'état (« Enregistré · chanson.stepseq.json ») ; un clic ouvre
  « Mes chansons ». Les données restent dans ce navigateur : pour changer d'appareil, passe par le fichier.

## Sons

Les sons proviennent des bibliothèques utilisées par [strudel.cc](https://strudel.cc) :

- [tidal-drum-machines](https://github.com/ritchse/tidal-drum-machines) (boîtes à rythmes),
  via [dough-samples](https://github.com/felixroos/dough-samples) ;
- [VCSL](https://github.com/sgossner/VCSL) (Versilian Community Sample Library) ;
- le piano de dough-samples ;
- [Dirt-Samples](https://github.com/tidalcycles/Dirt-Samples) : banques de batterie, et banques mélodiques jouées
  comme instruments (Mighty Moog, Pluck Bass, JV Bass, Jungle Bass, Juno, SID, Hoover, pads…) ;
- les soundfonts General MIDI FluidR3 de [webaudiofontdata](https://github.com/felixroos/webaudiofontdata) ;
- plus quelques synthés Web Audio intégrés (saw, square, acid, supersaw, pads…).

## Skills de composition (Claude Code)

Le dossier `.claude/skills/` contient les skills qui guident la composition, et dont les règles sont reprises
par la fenêtre **Key** :

| Skill | Contenu | Dans StepSeq |
|-------|---------|--------------|
| `composition-harmonie-synthetiseur` | Gammes, accords, degrés, progressions, voicings, basse / arpège / mélodie, parcours en 8 modules | Tonalité, palette d'accords, progressions, génération de couches, vérificateur |
| `arranger-orchestrer-finaliser` | Arrangement, orchestration, mixage, mastering | Méthode « une couche à la fois », démos mixées et masterisées |
| `musicemotion` | Composer à partir d'une émotion : matrice émotion → procédés, trois pistes contrastées, essais A/B | Section Émotion : 13 intentions, propositions, essais A/B, modes |
| `composer-melodies-accords-texte` | Mélodie sur une grille d'accords et des paroles ou une métrique : prosodie, rythme, notes cibles, contrôles, export MIDI | Band → Mélodie : scansion, proposition, tableau des notes, contrôles, écriture sur une piste |

## Structure du code

| Fichier          | Rôle |
|------------------|------|
| `index.html`     | Structure de la page et dialogue d'ajout de piste |
| `css/style.css`  | Thème et mise en page |
| `icons/`        | Icône du projet : `stepseq.svg` (grille de pas + note, aussi logo de la barre du haut), `note-16.svg` (note seule pour le 16 px), PNG favicon 16 / 32 et icône d'écran d'accueil 180 |
| `js/library.js`  | Catalogue généré depuis strudel.cc (125 soundfonts gm_*, VCSL) |
| `js/dirt.js`     | Catalogue généré des banques mélodiques de Dirt-Samples |
| `js/sounds.js`   | Catalogue des sons (batterie, familles d'instruments, accords) |
| `js/filters.js`  | Filtres Ladder et SEM (AudioWorklet) du sound design |
| `js/project.js`  | Modèle de projet, enregistrement / ouverture de fichiers |
| `js/audio.js`    | Moteur audio : chargement des échantillons, voix, séquenceur |
| `js/sounddesign.js` | Fenêtre de sound design (VCO, filtre, ADSR, glide, sortie) |
| `js/juno.js`     | Synthés analogiques : catalogue, 128 patches d'usine du Juno-106, un AudioWorklet par piste |
| `js/juno-dsp.js` | Moteur du Juno-106 (AudioWorklet), porté de l'Ultramaster KR-106 — GPL v3 |
| `js/junopanel.js` | Façade du Juno-106 (sound design des pistes Synthé) |
| `js/groove.js`   | Fenêtre Groove (swing, humanisation) |
| `js/harmony.js`  | Aide à la composition : gammes, accords diatoniques, identification des accords, estimation de la tonalité, vérificateur d'harmonie |
| `js/emotions.js` | Intentions émotionnelles (skill MusicEmotion) : matrice et trois propositions par intention |
| `js/harmonypanel.js` | Fenêtre Key de la scène en cours : assistant en 3 étapes, onglets Ambiance, Accords, Grille, Couches, Vérifier |
| `js/fx.js`       | Fenêtre Effets par piste (chorus, delay, reverb, sidechain, envois vers les bus partagés) |
| `js/master-dsp.js` | Mastering du Master (AudioWorklet) : graves en mono, largeur, écrêtage doux, limiteur à anticipation, mesure LUFS / true peak |
| `js/mixer.js`    | Console de mixage : tranches, EQ, compresseur, limiteur, vumètres |
| `js/automix.js`  | Auto Mix : mesures (bandes d'octave, LUFS, LRA, corrélation), critères, cibles et conseils (fonctions pures) |
| `js/automix-listen.js` | Auto Mix : écoute pendant la lecture (analyseurs sur les pistes et le Master) |
| `js/automix-pilot.js` | Auto Mix : pilote auto des faders (mesure entre pistes, petits gestes, gain staging) |
| `js/automixpanel.js` | Auto Mix : panneau de la console, A/B, préférences, pilote auto |
| `js/band-songs.js` | Band : plans des 20 chansons complètes (tonalité, sections, grilles, parties) |
| `js/bandsong.js` | Band : écrit les scènes, les notes de chaque musicien et l'arrangement d'après un plan |
| `js/melody.js` | Band → Mélodie : grille d'accords, syllabes du français, rythme, hauteurs, contrôles, export MIDI (fonctions pures) |
| `js/melodypanel.js` | Band → Mélodie : formulaire, proposition (scansion, tableau, contrôles), écriture sur la piste |
| `js/bandmix.js`, `js/band-levels.js`, `js/band-drive.js` | Band : règles de mixage et de mastering, niveaux mesurés, gain de mastering par chanson |
| `js/dirt-tuning.js` | Hauteur mesurée des échantillons Dirt-Samples |
| `tools/`         | Outils de mesure : hauteur des échantillons, niveaux des instruments, rendu et mastering des chansons Band, calibrage de l'Auto Mix |
| `js/song.js`     | Mode chanson : scènes et arrangement, fenêtre Song |
| `js/ui.js`       | Rendu des pistes, grille, piano roll, dialogue |
| `js/main.js`     | Démarrage, barre d'outils, raccourcis |
| `guide.html`     | Guide d'utilisation (bouton « Aide » de l'app) |

## Licences

- `js/juno-dsp.js` et la table des patches d'usine de `js/juno.js` sont dérivés de
  l'[Ultramaster KR-106](https://github.com/kayrockscreenprinting/ultramaster_kr106)
  (Karl LaRocca, David Mansfield et contributeurs), sous licence **GNU GPL v3**
  (texte : [`licenses/GPL-3.0.txt`](licenses/GPL-3.0.txt)). Distribuer StepSeq avec ces fichiers
  implique de le distribuer sous GPL v3.
- La police de l'afficheur à LED, `fonts/Segment14.otf` (Paul Flo Williams), est sous licence SIL OFL 1.1
  ([`licenses/OFL-Segment14.txt`](licenses/OFL-Segment14.txt)).
