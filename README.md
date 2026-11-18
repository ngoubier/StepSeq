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

- **En-tête** : icône de l'application (menu **Chansons**, **Nouvelle chanson…** (assistant sur une chanson vide), **Nouvelle chanson sur ce projet…** (le même assistant, sur le projet en cours), **Ouvrir**, **Enregistrer**, **Importer MIDI**, **Exporter MIDI**, **Exporter l'audio**), titre du projet, tempo (BPM), un bouton ∿ à icône seule dont la bulle (au survol, au clic ou au clavier)
  regroupe le chiffrage de mesure (4/4 par défaut, x/4 ou x/8), le nombre de mesures et le groove (swing, humanisation), **Lecture** et **Stop**, puis les fenêtres regroupées
  **Tonalité** (la tonalité de la scène en sous-titre ; un clic ouvre un petit menu tonique / mode, proposé d'après les notes ;
  la composition à partir d'une émotion, les grilles de référence, les essais A/B et la vérification sont dans l'assistant « Nouvelle chanson »), **Song** (fenêtre Song : scènes et arrangement, avec une case pour garder le panneau
  d'arrangement affiché sous l'en-tête) et **Mix** (console de mixage, avec l'assistant **Auto Mix**).
  **Mode assistant** : quand l'assistant « Nouvelle chanson » est ouvert (`body.wizard-mode`), il prend la place de la zone des pistes, sous cette
  barre qui reste visible ; la barre du bas, Tonalité, Song et Mix s'effacent et la **tonalité** de la chanson en création (« Do mineur », avec son armure)
  prend leur place. **Lecture / Stop**, **tempo** et **position** de la barre pilotent alors l'écoute de l'assistant (scène choisie en boucle ou chanson) ;
  à la fermeture, la barre redevient celle du projet.
  À droite : annuler / rétablir, l'indicateur d'enregistrement automatique et **Aide**.
  Le bouton **+ Ajouter une piste** se trouve sous les pistes.
- **Partie centrale** : les pistes, les unes sous les autres. Chaque piste a un en-tête
  (écoute, Mute, Solo, nom, volume, réglages, suppression) et sa grille de pas
  (une case = une double-croche).
- **Barre du bas** : mode d'édition **On/Off** (cliquer / glisser pour activer des pas) ou
  **Vélocité** (cliquer-glisser verticalement sur un pas pour régler sa force).

En mode **Mono**, le piano roll permet de superposer plusieurs notes de hauteurs différentes au même instant.
Chaque note garde sa propre durée et sa vélocité ; cliquer à nouveau sur une note la supprime seule.

### Ajouter une piste

Le bouton **+** ouvre une fenêtre de taille fixe (900 × 600 au plus) : le type et la source à gauche, les sons au
centre, les variantes à droite, les réglages de la piste en bas. Elle demande :

1. le type de piste : **Drum**, **Instrument** ou **Synthé** ;
2. un nom et une couleur ;
3. pour une piste **Drum** : le type de son (Kick, Snare, Clap, Hi-Hat, Toms, Crash, Ride…),
   la boîte à rythmes (TR-808, TR-909, LinnDrum, …) et la variation ;
4. pour une piste **Instrument** : la famille (Bass, Synth Lead, Pads, Keys, Mallets, Strings, Brass & Winds,
   Guitar) puis l'instrument ;
5. pour une piste **Synthé** : le synthé analogique (pour l'instant le **Roland Juno-106**) et son patch ; une fiche
   affiche la configuration du synthé ;
6. pour une piste Instrument ou Synthé, la ligne **Jeu** : deux cases facultatives, **Arpégiateur** et **Jouer la
   piste Accords**, qui allument les interrupteurs **ARP** et **ACCORDS** de la piste (voir plus bas). Il n'y a plus de
   catégorie Mono / Arpège / Accord : toutes les pistes instrument se jouent pareil et se changent à tout moment.

Le bouton **Écouter** permet d'entendre le son avant de valider.

### Band : monter un groupe virtuel

Le menu de l'icône de l'application (**Nouvelle chanson sur ce projet…**, l'ancien bouton Band) ouvre l'assistant de création de chanson (`js/band.js`, catalogue `js/band-presets.js`,
voir « Nouvelle chanson » plus bas), sur le projet en cours. Ses deux premières étapes, **Style** puis **Instruments**, montent le groupe :

1. le **style musical** : **Synthwave**, **EDM mélodique** ou **Techno mélodique** ;
2. le **type de chanson** : 10 inspirations par style (Smalltown Boy, Nightcall, Blinding Lights, Sweet Dreams…,
   Levels, Strobe, Opus, Faded…, Powers of Ten, Eternity, Return to Oz, Sky and Sand, Your Mind, Rej…), avec un
   tempo suggéré ;
3. les **musiciens**, sur une scène. Un clic ouvre le panneau du musicien : son rôle, son instrument phare ★,
   5 instruments conseillés (▶ pour écouter) et l'accès à toute la bibliothèque via la fenêtre « Nouvelle piste ».
   Le **batteur** (et le percussionniste, optionnel) choisit un kit (★ + 5 conseillés) et coche ses éléments
   (kick, snare, hi-hats…) : une piste par élément, chaque élément pouvant venir d'une autre machine.

**Créer la chanson** (dernière étape de l'assistant) écrit une chanson complète dans l'esprit de l'inspiration : scènes (intro,
couplet, refrain… ou break, montée et drop en EDM), parties de chaque musicien et arrangement, en mode Chanson.
Les plans des 30 chansons sont dans `js/band-songs.js` (tonalité, forme, grilles originales, ce que joue chaque
musicien par section) et les notes sont écrites par `js/bandsong.js` (déterministe). Le bouton **Fermer** et **Échap** quittent l'assistant sans rien créer ;
si le projet a déjà des pistes, une confirmation précède le remplacement (Ctrl+Z revient en arrière).

**Techno mélodique** (10 inspirations : Stephan Bodzin, Anyma & Chris Avantgarde, ARTBAT, Monolink, Kölsch,
Boris Brejcha, Paul & Fritz Kalkbrenner, Adam Beyer & Bart Skils, Âme, Kiasmos) : les chansons se servent de tous
les outils du séquenceur, comme un producteur dans son DAW (`spec.tech` dans `js/band-songs.js`) :

- **intro planante** de 16 mesures sans batterie : nappe ouverte (fondamentale grave + accord + octave), arpège en
  croches pointées, mélodie lente ; **automation** du passe-bas qui s'ouvre sur toute l'intro, reverb qui se
  retire, écho sur l'arpège et le lead ; nappe d'ambiance du musicien **Effets** ;
- **montées** de 8 à 16 mesures : passe-haut automatisé sur la 2e moitié (basse comprise), résonance de l'arpège,
  reverb lâchée sur la dernière mesure, **montée de bruit blanc** (filtre et volume automatisés), roulement de
  caisse claire en **ratchets** (2 puis 3 coups par pas), un temps de silence avant le drop ;
- **drops puissants** : impact (bruit qui s'éteint sur 2 mesures) et cymbale sur le premier temps, kick 909 plein,
  basse « et-a » (deux doubles-croches après chaque kick) fortement **sidechainée**, nappe en accords piqués, lead
  et arpège dont le filtre s'ouvre sur la première mesure ; trilles de charleston (ratchets) en fin de phrase ;
- **conditions de déclenchement** : charleston fantôme à 50 %, percussions, rimshots, open hat et ride à 75 % ou
  « 1:2 » — la batterie change un peu à chaque passage ;
- **transitions réglables** : l'étape **Effets et transitions** de l'assistant montre et retouche ces montées, coupures,
  impacts (et ajoute une cymbale inversée, une descente, des percussions d'ambiance) jonction par jonction ;
- **dynamique du drop** (EDM et techno, dès que le plan a un drop ; `dynKind` / `dynAuto` dans `js/bandsong.js`) : un
  producteur retient le groove pour que le drop frappe. Le **groove** garde son kick à 85 % (75 % en techno : il reste le moteur du morceau), sa basse
  à 60 % avec un passe-bas qui s'ouvre au drop, les nappes, claviers, arpège et lead plus bas et plus sombres,
  un charleston plus doux et presque plus de charleston ouvert ; le **drop** ouvre tout à pleine force (mesuré : +2,4 LU sur le groove en EDM,
  +1,4 LU en techno, où le kick presque constant domine le volume perçu). La **montée** avance en volume : nappes, arpège et mélodie de 35 % à 100 %, kick qui revient
  de 42 % à 100 % avant de se retirer, roulement de caisse claire de 60 % à 100 %, montée de bruit jusqu'à 80 % (le
  passe-haut techno continue d'affiner les graves) : +4 dB de la première à la dernière mesure. Le **dernier drop**
  est le sommet (les drops précédents gardent les nappes et l'arpège à 90 %), l'**intro DJ** ne dépasse pas le groove,
  l'**outro** garde le kick (75 %) et baisse le reste (basse à 45 %, mélodies à 50 % puis fondu) : au moins 2 LU
  sous le drop. Ce sont des courbes d'automation de scène (volume, filtre) : celles de l'utilisateur (menu
  d'automation, progression de montée de l'assistant) les remplacent ;
- **outro** qui se referme (passe-bas) avec un fondu ; mixage propre au style (grande reverb sombre, écho en croche
  pointée, image stéréo plus large).

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
(`js/dirt-tuning.js`). Les soundfonts et les instruments multi-échantillonnés (piano, VCSL) le sont aussi, mesurés
par `tools/sample-pitch.py` (`js/sample-tuning.js`) : écart fin de chaque échantillon et octave de chaque instrument
(la plupart des fichiers VCSL suivent la convention Do3 = midi 60 et sonnaient une octave trop haut). Les projets
enregistrés avant cette correction sont transposés à l'ouverture pour sonner comme avant.

**Mixage et mastering automatiques** (`js/bandmix.js`), appliqués aux pistes créées par Band :

- **niveaux calibrés** : le volume perçu (LUFS) de chaque instrument et de chaque élément de batterie proposés a été
  mesuré (`tools/measure-levels.js` → `js/band-levels.js`) ; chaque piste part du même niveau puis est placée selon
  son rôle (kick et basse devant, caisse claire et lead présents, nappes et arpège derrière, percussions en fond),
  avec une marge d'environ 18 LU avant le master ;
- **égalisation et dynamique** par rôle : passe-haut sur tout sauf kick et basse, creux marqué du bas-médium (≈330–400 Hz) des nappes, claviers, arpège
  et lead, « air » (étagère haute ≈11 kHz) sur nappes, lead, arpège, charleston et cymbales, présence de la caisse claire et du lead ; compresseur sur kick, caisse claire, basse, piano et voix ;
  sidechain sur le kick (fort en EDM et en techno mélodique, léger sur les nappes en synthwave) ;
- **espace** : panoramique par rôle ; envois vers trois **bus d'effets partagés** (reverb plate pour la batterie,
  hall pour les instruments, écho ping-pong au tempo), chorus sur nappes, guitare et voix ; kick et basse secs.
  En **EDM et techno** le drop est large : chorus plus marqué sur la nappe, l'arpège, le lead et les claviers,
  charleston, cymbales et arpège plus écartés, largeur du mastering 1,35 au-dessus de 120 Hz ;
  mesuré : côté / milieu au-dessus de 200 Hz des drops de −8,5 / −12,8 dB à −4 / −5,5 dB, sub toujours mono
  (côté / milieu sous 120 Hz sous −39 dB dans les drops) ;
- **mastering** : EQ et compresseur « glue » léger sur le Master, puis module de mastering (`js/master-dsp.js`) :
  graves en mono, aigus élargis, écrêtage doux des pointes, limiteur à anticipation à −1 dBTP. Le gain d'entrée
  de chaque chanson (`js/band-drive.js`, calculé par `tools/band-drive.js` sur deux rendus complets) est réglé
  sur la partie la plus forte du morceau, comme en studio : refrains et drops vers −10 à −11,5 LUFS (court terme),
  environ −12 à −13 LUFS intégrés, la dynamique des breaks est gardée. Les attaques de la batterie passent par
  un limiteur-écrêteur léger pour que le mastering n'écrase pas tout le morceau à cause d'elles.

### Nouvelle chanson : l'assistant

**Nouvelle chanson…** (menu de l'icône de l'application) part d'une chanson vide et ouvre un assistant en douze
étapes (une par instrument du groupe : le nombre varie), dans la fenêtre principale (`js/band.js`, mode `body.wizard-mode`) : plus de fenêtre plein écran, l'assistant occupe la zone
des pistes, entre la barre du haut et le bas de l'écran. À gauche, le **stepper** (les étapes, un résumé chacune ; Finaliser : Effets et transitions, Mix, Intégration) : un clic va à l'étape
(seul le calcul de la chanson verrouille les étapes : inspiration ou reprise sans plan, aucun musicien) ; <kbd>Alt</kbd>+<kbd>→</kbd> / <kbd>←</kbd>
passent à l'étape suivante / précédente. Au bas, un seul bouton **Fermer** (comme <kbd>Échap</kbd> : rien n'est créé). L'écoute se commande dans la
barre du haut (`js/main.js` route Lecture, Stop et le champ tempo vers `SS.band` tant que l'assistant est ouvert) :
lecture / pause / reprise (`SS.audio.pause` / `resume`), stop, position, **tempo** réglable (40–240 BPM, appliqué à
l'écoute en cours et à la chanson créée) et **tonalité** (armure, accord de tonique) ; tempo et tonalité suivent dès le choix du style, de l'inspiration ou de la reprise (étape 1), sans attendre l'étape 3. Aux étapes Batterie, Accords, Basse, Nappes, Arpèges et
Mélodie, les **scènes** sont en colonne à gauche, sous la tête d'étape (nom, mesures, accords, et le choix de l'étape : motif, émotion, mode,
caractère…), et **▶ joue la scène choisie en boucle** (pas toute la chanson ; choisir une autre scène pendant l'écoute la fait jouer) :

1. **Style** : les deux portes **Créer** / **Reprendre**, le style musical (avec son **tempo conseillé**, de la plus
   lente à la plus rapide de ses inspirations, et sa description ; la fiche du style montre la zone sur l'échelle des
   tempos) et l'inspiration (ou la reprise tapée) ; **Chanson vide** ferme l'assistant (comme Fermer). En haut à droite de la tête d'étape,
   le gros bouton vert **▶ Générer et écouter** (« puis affine étape par étape ») joue toute la chanson aperçue : tous les
   instruments, toutes les scènes, comme l'écoute de l'étape Scènes et commandée par la barre du haut (Lecture, Stop, tempo). Sans
   inspiration choisie, il prend la première du style choisi (ou du premier style) ; pendant l'écoute il devient
   **■ Lecture · scène Intro** (re-clic : arrêt) ;
2. **Instruments** : les musiciens du groupe (la scène, le panneau du musicien : instrument phare, conseillés, toute la
   bibliothèque ; kit et éléments du batteur) et l'interrupteur **General MIDI** (en haut du contenu de l'étape, à côté de la tête) ;
3. **Tempo et tonalité** : le **tempo** (grand afficheur, − / +, curseur de 40 à 240 BPM avec la zone dorée du tempo
   conseillé, **Tap**, **↺ tempo de l'inspiration**) et la **tonalité de la chanson** (12 toniques, les modes de
   `SS.harmony.MODES`, **▶ Écouter la gamme** au piano, notes de la gamme avec leur degré). Changer la tonalité
   **transpose toutes les scènes** (`S.wiz.keys`, de l'intervalle entre l'ancienne et la nouvelle tonique) ; si le mode
   change, les scènes qui jouaient dans le mode de la chanson prennent le nouveau, les autres (un pont en majeur dans une
   chanson mineure) gardent le leur. Les grilles d'accords sont des degrés dans la tonalité : elles suivent toutes seules.
   **↺ Tonalité de l'inspiration** remet tout ;
4. **Scènes** : la chanson en vue « session », comme dans Ableton Live : **une ligne par scène** (nom, mesures,
   nombre de passages dans l'arrangement, accords) et **une colonne par piste**, regroupées par musicien ; chaque
   case dessine ce que joue la piste (coups de batterie ou notes), une case en pointillés est un silence. Au-dessus,
   l'**arrangement** : une bande de blocs (largeur = mesures × répétitions, couleur = type de scène) qu'on réordonne par
   **glisser-déposer** ou avec ‹ ›, dont on règle les répétitions (− / +, « ×2 ») et qu'on retire avec ×, avec le total
   des mesures et la durée au tempo choisi. Une ligne par scène : **nom** (modifiable), **longueur** 4 / 8 / 16 / 32
   mesures (la grille d'accords retouchée est répétée ou coupée pour couvrir la scène), **+ Ajouter à la fin**,
   **Dupliquer** (une section de plus, indépendante, par exemple `chorus_b` « Refrain 2 », avec les mêmes accords et
   réglages au départ) et suppression (sauf la dernière scène ; ses blocs disparaissent). **↺ Structure de
   l'inspiration** rend l'ordre, les longueurs et les scènes du plan. Ces retouches sont gardées dans `S.wiz`
   (`skey`, `form`, `secs`) ; `specEff()` en fait le plan joué (copie du plan avec la tonalité, l'arrangement, les
   longueurs, les noms et les copies), utilisé par l'écoute et par « Créer la chanson » (l'écoute joue l'arrangement
   retouché) ; changer de style ou d'inspiration les remet à zéro (les réglages par scène des étapes Batterie à
   Arpèges restent pour les sections que la nouvelle inspiration a aussi : couplet, refrain… ; les motifs de batterie
   seulement dans le même style ; la mélodie générée est oubliée, elle suivait les autres accords). On écoute la chanson (ou à partir d'un bloc) et
   chaque scène en boucle, sur un projet temporaire (même mixage que la chanson créée) ;
5. **Batterie** : pour la scène choisie, une **bibliothèque de 20 motifs** du style (`SS.DRUM_PATTERNS`, carte avec nom,
   énergie ●●○ et aperçu des cinq pistes ; filtre Tous / Calme / Moyen / Intense ; **Suggéré** pour la nuance de la
   scène : intro, outro, break calmes, montée et pont moyens, refrain, drop et sommet intenses). **Motif de l'inspiration**
   est choisi par défaut : tant qu'on ne touche à rien, c'est le groove du plan. Dessous, la **grille** : **une ligne par
   élément coché du kit** (grosse caisse, caisse claire, clap, charleston fermé et ouvert, rimshot, crash, ride, percussions, toms… ce que
   le batteur a coché à l'étape Instruments ; décocher un élément retire sa ligne), couleur de rôle, en **1, 2 ou 4 mesures**
   (16, 32 ou 64 pas, temps groupés par quatre et mesures séparées ; passer à un motif plus long répète le motif, plus court le coupe).
   Une ligne montre ce qui joue (le motif choisi, sinon le jeu du plan pour les pièces que le motif ne pilote pas : rimshot, percussions, toms) ;
   le premier geste écrit toutes les lignes dans `edits`. **Un clic** fait tourner fort, moyen, léger, éteint ; **clic droit**, **appui long**
   (tactile) ou la touche Menu contextuel / <kbd>Maj</kbd>+<kbd>F10</kbd> ouvre la fenêtre d'options de la case : **Vélocité**
   (Fort / Moyen / Léger), **Répétitions** ×1 à ×4 (ratchet, `rat`), **Probabilité** 100 / 75 / 50 / 25 % ou 1:2, 2:2 (conditions de
   déclenchement, `cond` : `p75`, `p50`, `p25`, `1:2`, `2:2`), **Effacer la case** (<kbd>Échap</kbd> ferme). Une case montre sa vélocité par la
   hauteur de remplissage, ×2 / ×3 et la probabilité en petites marques. Les flèches déplacent le focus entre cases, <kbd>Entrée</kbd> /
   <kbd>Espace</kbd> font tourner la case. Sur téléphone la grille défile en largeur dans sa carte. **Swing** (des doubles-croches, 0 à
   100 % de 50 à 75 %) et **Humanisation** sont des réglages **de toute la chanson** (`project.groove`, `S.wiz.groove` ; le moteur n'a pas de swing par
   scène, la mention « pour toute la chanson » est sur les curseurs) : ils s'entendent tout de suite et la chanson créée les garde
   (humanisation 15 % et pas de swing tant qu'on n'y touche pas). Puis **Revenir au motif**, les mesures de la scène (fills en rose), le
   **fill** (jamais, fin de scène, toutes les 4 ou 8 mesures), son type et le **crash** ; **Assortir toutes les scènes** pose un motif suggéré par scène ;
   **Copier vers les scènes du même type** copie aussi la grille et la progression de montée. L'aperçu, l'écoute en boucle et « Créer la chanson » jouent exactement la grille (vélocité fort / moyen / léger, ratchets, conditions).
   **Scène de montée** (`drums: 'build'`) : au-dessus de la grille, la carte **Progression de la montée**. Le roulement est joué par la caisse claire
   (le clap si le kit n'en a pas) et se règle **mesure par mesure** : **Noires** (4 coups par mesure), **Croches** (8), **Doubles croches** (16),
   **Triples** (24 : une croche sur deux pas rejouée en ratchet ×3). Préréglages **Linéaire** (montée régulière : 1/4 de la scène par
   densité), **Rapide** (le roulement arrive tôt, le sommet est atteint à mi-scène puis tenu), **Tardive** (noires jusqu'aux deux dernières mesures,
   doubles puis triples) et **Perso** : un clic sur une colonne rend la mesure plus dense d'un cran (<kbd>Maj</kbd> + clic, clic droit ou flèche bas : moins dense ; passe en Perso).
   Le curseur **Crescendo de volume** règle la rampe de vélocité du roulement sur toute la scène (0 : plat, 100 % : de très doux à fort). Le numéro d'une colonne choisit la
   mesure dont la grille de 16 pas (caisse claire, clap, charleston, crash) s'affiche dessous, « générée depuis la courbe » : modifier une case la
   **verrouille** (pastille **🔒 Mesure libre**, un clic la rend à la courbe) et un changement de courbe ou de préréglage ne la touche plus. Sans réglage,
   la montée est celle du plan (le roulement d'origine de `drumSpice`) ; dès qu'une progression est posée, elle le remplace. Les réglages
   sont `parts[section].drums = { edits, build }` (voir plus bas) ; tests : `node tests/e2e/wizard-drums.js`, `node --test tests/drumgrid.test.js` ;
6. **Accords** : la **grille** de la scène choisie (`{ step, len, degree, type, acc }`, degrés dans
   la tonalité de la scène) : **tonalité** de la scène (tonique et mode ; la grille garde ses degrés), **Aimanter** (à la
   mesure, à la demi-mesure, au temps), **Effacer**, **↺ Inspiration** (accords et tonalité d'origine). Un clic sur un
   accord l'écoute et ouvre sa barre : **durée** 1, 2, 3, 4 temps ou 2 mesures (plus courte, l'accord suivant commence
   plus tôt ; plus longue, elle prend sur les suivants), Enlever ; on le déplace en le glissant, on tire son bord
   droit, <kbd>Suppr</kbd> l'enlève. La grille couvre toute la scène (un trou est tenu par l'accord d'avant). Dessous,
   la palette **Simple / Avancé** (7, 9, sus…) de `SS.harmony.gridPalette` : clic pour écouter, glisser pour poser.
   **✦ Trouver l'inspiration** ouvre une fenêtre : **mode** (du lydien au phrygien, `SS.MODE_MOODS`), **émotion**, puis
   les **propositions** (trois pistes et grilles de référence, transposées sur la tonique de la scène) ; un clic sur
   une proposition la fait jouer dans la scène, en boucle, avec le groupe (lecture, stop, tempo et tempo conseillé
   dans la fenêtre) ; **Choisir** la pose dans la grille (tonalité et émotion comprises, tempo conseillé si coché),
   **Annuler** (de cette fenêtre d'inspiration) ou <kbd>Échap</kbd> laisse la scène intacte. Repris de l'ancienne fenêtre Harmonie (l'assistant
   devient l'écran de référence) : la ligne du **guide du mode** (note caractéristique, ce qu'il faut faire entendre, **boucle
   d'essai** à poser), le menu **Grilles de la tonalité** (catalogue `SS.harmony.progressions`), les **essais A/B**
   (`SS.harmony.transformGrid` : septièmes prises dans la gamme, sus2, tonique majeur / mineur, cadence évitée, pédale de
   tonique ; **A · avant** / **B · essai** à l'écoute en boucle, **Garder A** ou **Garder B**), les **pédales** (bouton
   **Pédale** d'un accord, puis note et durée ; `S.wiz.peds`, même format que `scene.grid.pedals` : la note tenue passe à
   la basse des accords qu'elle couvre) et **Vérifier la scène** (`SS.harmony.gridChecks` et `SS.melody.checkMelody` sur
   la mélodie de chaque instrument mélodique). Le tout passe à `SS.bandSong.build` par l'option `harmony` (`keys`, `chords`,
   `emotions`, `pedals` par section) ; chaque scène créée reçoit sa **grille** (`scene.grid`, avec ses pédales) et son
   émotion : la piste Accords du projet montre les accords de l'assistant. Les opérations de grille (`gridFill`, `gridPut`,
   `gridSetLen`) sont communes à la piste Accords, à l'assistant et à `js/bandsong.js` (`js/harmony.js`) ;
   tests : `node --test tests/chordgrid.test.js` ;
7. **Basse**, 8. **Nappes**, 9. **Arpèges** : même disposition (scènes à gauche, lecture de la scène en boucle, chaque
   choix s'entend aussitôt). Basse : 13 **modes de jeu** (tenue, blanches, noires, croches, galop, contretemps, octaves,
   roulement, syncopée, marche, drone, croches piquées, après le kick) en cartes avec leur rythme dessiné, **pédale**
   (aucune, tonique, dominante), **registre** (grave, médium), note d'approche. Nappes : 9 modes (tenue, montée douce,
   planante, croches, blocs, stabs, house, hachée, pincée) et **voicing** serré / ouvert ; seule la nappe se règle
   (cordes et clavier gardent le plan). Arpèges : le **mode Intuitif d'Arp One** (voir plus bas), par scène : nom et catégorie du motif,
   ‹ › et sélecteur de motifs rangés par catégorie (`SS.MOTIFS`), **🎲 Surprends-moi**, quatre boutons Densité / Ampleur /
   Mouvement / Écho (`SS.Arp.macroPatch` / `macroValue`) et **Vitesse** (1/8, 1/16, 1/16 triolet, 1/32) ; l'arpège peut être
   **allumé** dans une scène où l'inspiration n'en avait pas. Tant qu'on n'a rien touché, c'est l'arpège de l'inspiration
   qui joue (aucun réglage écrit) ; le premier réglage part du motif d'Arp One le plus proche de son mode (montée → Montant,
   cloches → Pédale aiguë…). Les notes sont écrites telles quelles sur la piste d'arpège (les réglages Arp One ne sont pas
   recopiés sur la piste créée). Le mode de l'inspiration est repéré et choisi tant qu'on n'a rien réglé ; **Joue dans
   cette scène** coupe ou rend le musicien (`off`) ; **Copier vers les scènes du même type** (couplet et couplet 2…) ;
   Arpèges : aussi **vers toutes les scènes** ; **↺ Inspiration** défait les réglages de la scène. Un groupe sans le
   musicien garde l'étape, avec un message à la place des réglages. Les choix vont dans `S.wiz.parts`, passé à
   `SS.bandSong.build` (aperçu, écoute et « Créer la chanson ») ; test : `node tests/e2e/wizard-parts.js` ; les étapes 1 à 4 : `node tests/e2e/wizard-foundations.js` ;
10. **Mélodie** : pour la scène choisie, le **panneau Mélodie** (`js/melodypanel.js`, monté avec
   `sharedGrid` : la grille est celle de la scène, il n'y a ni champ Grille, ni Tonalité, ni Piste, ni lecture propre : la
   lecture du bandeau joue la scène en boucle). **Intention** : l'émotion de la scène (étape Accords) donne le profil
   mélodique (contour, note visée, fin, reprise du motif ; trois curseurs et **Réglages fins**), **Motif de départ** et
   **Note pivot**, puis **Structure** (notes par phrase), **Complexité mélodique** et **Options** (tessiture, rythme, fin,
   paroles). **Générer une mélodie** (puis **🎲 Une autre**) et **Variante B** (même graine, un seul levier du profil changé)
   écrivent la proposition dans `S.wiz.parts[section].lead` : elle remplace tout de suite la mélodie de la scène dans
   l'aperçu, et la boucle de la scène la joue. Au-dessus du panneau, la **grille de la scène** en lecture seule : la piste
   d'accords comme la piste Accords (degré, nom, rôle : `SS.harmony.role`) et la ligne de la mélodie qui joue ; dessous, la
   proposition (piano roll, légende, contrôle du profil, repères). Tant qu'on n'a rien généré, c'est la **mélodie de
   l'inspiration** qui joue (même dans une scène où elle ne chante pas, Générer la fait chanter) ; **↺ Inspiration** la
   rend. Chaque scène garde son propre état du panneau (réglages, graine, variante, proposition), rendu au retour ; la
   colonne des scènes affiche le nom du profil, ou « inspiration ». Changer les accords d'une scène efface sa
   proposition. L'**accompagnement** est sous le panneau, replié sur une ligne, déplié avec le
   **volume** (−30 à +6 dB, `gains` d'`addBandSong`) par instrument et le menu **Pistes** (Muet et Solo : barre de piste) ; test :
   `node tests/e2e/wizard-melody.js` ;
11. **Effets et transitions** (groupe « Finaliser », entre la dernière étape d'instrument et Mix ; `ST.fx`, adresse `'fx'` :
   `stepRef` / `stepNum`, et `ST.mix` / `ST.pick` prennent un numéro de plus ; un brouillon enregistré avant l'étape, version < 3, est
   renuméroté à sa réouverture). En haut, la **frise** des scènes dans l'ordre de l'arrangement (blocs de la couleur du type de
   scène, défilement horizontal sur téléphone) et, entre deux blocs, une **pastille ronde** : le nombre d'effets actifs à cette
   jonction ; un clic la choisit (par défaut, la jonction avant le premier drop, sinon la première). La carte **Transition avant
   « Drop »** montre un **aperçu** de −8 à +1 mesures autour de la jonction, puis une ligne par effet (interrupteur et réglages) :
   **Montée de bruit** (4 / 8 / 16 mesures, plafonnées à la longueur de la scène d'avant ; filtre : passe-bas qui s'ouvre, passe-haut
   qui s'ouvre ou sans filtre), **Filtre passe-haut global** (toutes les pistes mélodiques et la basse, sur la 2e moitié de la scène
   d'avant ; curseur de la fréquence finale, 200 à 4 000 Hz : c'est l'automation de filtre des montées, dont l'ouverture suit
   le réglage), **Cymbale inversée** (1 temps, 1 mesure, 2 mesures avant la jonction), **Coupure avant** (aucune, 1 temps, 2 temps,
   1 mesure de silence : le `gap` du plan, généralisé ; procédé T06), **Impact au début** (impact grave + crash, crash seul ou impact
   grave ; niveau) et **Descente** (2 ou 4 mesures après l'impact), puis les **Procédés d'écriture** T01–T05 de la formation (retrait,
   fragmentation, pédale, élargissement, suspension : voir « Documents de référence »), qui réécrivent les parties elles-mêmes. **Copier vers les autres drops** recopie les réglages vers toutes les jonctions qui
   entrent dans une scène de type drop. **▶ Écouter la transition** boucle les 4 dernières mesures de la scène d'avant puis les 4
   premières de la suivante (le réglage change : l'écoute reprend ; quitter l'étape l'arrête). **↺ Comme le plan** efface les
   retouches de la jonction. Sans retouche, la chanson est **exactement** celle du plan : l'étape montre ce que le plan fait déjà
   (montée de 8 mesures, coupure d'un temps, passe-haut, impact sur les montées et drops techno) et ne l'écrit pas. Les retouches sont dans `S.wiz.fx`
   (`junctions['avant>après']` par sections, partielles ; `perc`), enregistrées dans le brouillon et passées à l'option `fx` de
   `SS.bandSong.build` (aperçu, écoute, « Créer la chanson ») ; défauts : `SS.bandSong.junctionDefaults`. Limites : les réglages sont
   gardés par couple de sections (deux blocs « Montée → Drop » partagent les leurs ; une scène qui sort vers deux scènes différentes
   prend les réglages de la première jonction retouchée) ; la **cymbale inversée** n'est pas un échantillon lu à l'envers (le moteur n'en
   sait pas) mais une courte **montée de bruit à enveloppe montante** sur la piste Effets, qui finit sur le premier temps. La carte
   **Percussions** est une matrice **scènes × boucles** (Shaker 16es, Conga / tumbao, Tom roulant grave) sur les pistes du Percussionniste
   (pièces `sh`, `perc`, `misc` de son kit) : une case allumée joue la boucle du **style** (Techno, Latin, Minimal ; **▶ Écouter** joue la
   première scène qui en a), éteinte elle coupe la boucle ; sans réglage, la case montre ce que le plan joue déjà. Une pièce absente du kit
   est grisée, avec « + ajouter la pièce ». **Sans musicien Effets** (ou sans Percussionniste), un message et un bouton **+ Ajouter** à la
   place des réglages (l'Effets et le Percussionniste sont des musiciens facultatifs de chaque inspiration : `optional` dans
   `js/band-presets.js`, jamais dans le groupe par défaut) ; le passe-haut et la coupure restent. Sans retouche de percussions les pistes jouent le plan. Test : `node tests/e2e/wizard-fx.js` ;
12. **Intégration** : cases à cocher par musicien (batterie, basse, nappes, arpèges, lead…) et par élément de batterie ;
   **Créer la chanson** (bouton dans l'étape, en haut à droite, avec le compte des pistes) écrit les pistes cochées, les scènes et l'arrangement (tempo de la barre du haut, mixage
   automatique de Band). Ce qui est créé est exactement l'aperçu ; Ctrl+Z revient à la chanson vide.

**Étapes instrument** : le **titre** (tête d'étape et stepper) est le nom du musicien (Batterie, Basse, Arpège, Nappe, Lead… ou le nom
donné à l'étape 2) ; le **son** (« Moog Bass (synthé, ladder + glide) ») est la ligne secondaire : sous le titre dans la tête, et en
début de résumé dans le stepper (sans sa parenthèse). La pastille du type de la tête dit « Nappe » (et non « Accords », qui est l'étape 5) ; les
couleurs de rôle sont inchangées.

**Étapes Mix et Intégration** : à 1500 px de large, tout est visible sans défiler (bandes de mixeur et colonnes de piste qui se resserrent) ; plus
étroit, la console du Mix et la grille de l'Intégration défilent en largeur, avec une barre de défilement bien visible et une ombre au bord
qui cache la suite.

**Barre de piste** (étapes 5 à 10, au-dessus du contenu) : **Piste** liste les instruments que l'étape 2 propose au musicien
de l'étape (Batterie : menu du **kit** et cases des éléments ; Accords : « Accords de la scène » ; Nappes : la nappe, sinon
cordes ou clavier ; Mélodie : voix ou lead), le choix en cours marqué « (étape 2) » tant qu'il est celui de l'étape 2.
C'est le même état que l'étape 2 (`S.cache`) : changer ici change là-bas, l'aperçu sonne avec et la chanson créée l'utilise.
**On entend** : une pastille par musicien, colorée comme son rôle (`ROLES`) ; clic = **Muet** (en solo, elle ajoute ou
retire le musicien du solo), **Seule** met le musicien de l'étape en **Solo** (re-clic : plus de solo). Ce sont
`S.wiz.mute` / `S.wiz.solo`, lus par `silenced()` et par l'écoute : la boucle se tait vraiment, et le réglage vaut pour
toutes les étapes. Les lignes d'accompagnement de l'étape Mélodie ne gardent que le volume. Aux étapes **Basse**,
**Nappes** et **Arpèges**, un **aperçu en rouleau** montre les notes de la scène telles que la chanson les joue, sous la
bande des accords (couleur = fonction) et les barres de mesure, avec une tête de lecture qui suit la boucle ; la note
d'approche de la basse est plus claire. Test : `node tests/e2e/wizard-trackbar.js`.

Le menu de l'icône (**Nouvelle chanson sur ce projet…**) ouvre le même assistant sur le projet en cours (l'ancien écran « Créer les pistes / Créer toute la
chanson » n'existe plus). La mélodie par défaut de Band (celle de l'inspiration, tant qu'on n'a rien généré à l'étape
Mélodie) est écrite par `SS.bandSong.build` (`melody` : caractère, réglages fins, `plans` et `seeds` par section) selon des règles de
composition : notes de l'accord sur les temps forts, surtout des mouvements conjoints et retour par degré après un
saut, motif repris d'une phrase à l'autre, appel en suspens et réponse posée, respiration entre les phrases, un seul
sommet par scène.

**Réglages par scène (`parts`).** `SS.bandSong.build(spec, id, tracks, { parts })` accepte, pour chaque section,
`{ drums, bass, pad, arp, lead, off }` (réglés dans les étapes Batterie, Basse, Nappes, Arpèges et Mélodie de l'assistant). Sans `parts`, la chanson
est exactement celle du plan. **Batterie** : `{ style, pattern, edits, fill: off|end|4|8, fillType: roll|toms|clap4|kick|cut|open,
crash, build }` ; `pattern` est un identifiant de `js/drum-patterns.js` (kick, caisse claire, clap, charleston fermé et ouvert sur
une mesure de 16 pas : `x` fort, `o` moyen, `.` léger, `-` silence), `edits` remplace ses pistes. `edits` (ancien format) : `{ K, S, C, H, O }`
de 16 caractères ; depuis la grille de l'assistant : `{ bars: 1|2|4, K, S, C, H, O, rd, rim, cr, ht, mt, lt, perc… (une piste de 16 × bars
caractères par pièce du kit ; K S C H O pour bd sd cp hh oh, l'identifiant du son pour les autres), rat: { piste: { pas: 2..4 } }, cond: { piste:
{ pas: 'p75' | 'p50' | 'p25' | '1:2' | '2:2'… } } }` : une pièce qui a sa piste est jouée telle quelle (motif répété sur la scène, fill et crash compris), les anciens
brouillons restent lus comme avant. `build` (scènes de montée) : `{ preset: 'lin'|'fast'|'late'|'custom', levels: [1..4 par mesure] (custom), cresc: 0..1, lock:
{ [mesure]: { lanes: { sd, cp, hh, cr : 16 caractères }, rat, cond } } }` ; niveaux 1 à 4 = noires, croches, doubles-croches, triples (24 coups : une croche sur
deux pas en ratchet ×3). **Basse** : `{ mode (dont
half et quarter), pedal: none|tonic|fifth, approach, register: low|mid }`. **Nappe** : `{ mode, voicing: close|open }`. **Arpège** : `{ mode }` (8 modes simples du moteur) ou `{ one }`, des réglages
d'Arp One (`js/arp.js`) : les accords de la scène passent dans `SS.Arp.renderStep` (voicing médium, tempo nominal 120 BPM, boucle 0 :
déterministe) et les notes sont posées sur la grille de pas ; `one` l'emporte sur `mode`.
`off` : rôles muets dans la scène (`['arp', 'lead']`). **Mélodie** : `lead: { events: [{ step, len,
notes: [midi], vel }] }` (étape Mélodie : proposition du panneau Mélodie) remplace la mélodie du moteur sur la première
piste chantante présente (lead, puis vox, puis sax) ; `[]` = silence. Un `mode` allume le musicien dans une scène
où le plan ne le faisait pas jouer.

### Reprendre : une reprise tapée au clavier

L'étape **Style** de l'assistant a deux portes : **Créer** (une chanson dans l'esprit d'une inspiration, comme
ci-dessus) et **Reprendre**, pour faire vite une reprise (`js/band.js`, `coverModel`). On y tape :

- le **titre**, le **tempo** (ou **Tap** : quatre tapes en rythme) et la **tonalité** (**Auto** : déduite du premier
  accord, Am → La mineur, F → Fa majeur ; ou choisie) ;
- une ligne par **partie** : son nom et ses accords, avec la syntaxe de l'atelier Mélodie (`Am | F | C | G`, « | »
  sépare les mesures, `Am F` partage une mesure, « . » prolonge, « % » répète la mesure ; `C/E`, `D/F#`, `Bb`,
  `Fmaj7`, `Do`, `Ré`… acceptés). Sous chaque ligne : les accords lus, avec leur degré et leur rôle, ou l'erreur ;
- l'**ordre des parties** (`Intro Couplet Refrain Couplet Refrain ×2 Outro`, vide : chaque partie une fois).

L'inspiration choisie à gauche devient « le groupe joue à la façon de… » : chaque partie reprend le jeu de la section
de l'inspiration qui lui correspond d'après son nom (couplet → couplet, refrain → refrain ou drop, pont → pont ou
break, intro, outro, solo, pré-refrain ou montée), avec ses musiciens, sur les accords tapés. La basse suit la
basse imposée des accords (`D/F#` : Fa♯). Les étapes suivantes (Chanson, Batterie, Accords, Basse, Nappes, Arpèges, Mélodie, Effets et transitions, Mix, Intégration) sont les
mêmes que pour Créer ; **Créer la chanson** donne au projet le titre et le tempo de la reprise.
Test : `node tests/e2e/cover-wizard.js`.

### Atelier Mélodie : une mélodie sur une grille d'accords

L'atelier **Mélodie** (`js/melodypanel.js`, moteur `js/melody.js`), monté dans l'étape Mélodie de l'assistant Nouvelle chanson, propose une mélodie sur une
piste à partir d'une **grille d'accords** et d'une **structure**, avec la méthode du skill
`composer-melodies-accords-texte` (calculée dans le navigateur, sans réseau ni IA). La vue est simple :

1. **Grille** : `Am | F | C | G` (« | » sépare les mesures, `Am F` partage une mesure, « . » prolonge, « % » répète),
   ou **Reprendre les accords de la scène**. **La mélodie dure exactement la grille** : 4 accords → 4 mesures ;
2. **Structure** : notes par phrase, les phrases se partagent la grille (`8 8` = deux phrases de 8 notes sur
   2 mesures chacune ; `3+5 3+5` = notes par mesure). Vide : automatique (une phrase de 7 notes pour 2 mesures) ;
3. **Piste** : une piste Mono, ou une nouvelle piste « Mélodie » (instrument lead du groupe).

**Générer une mélodie** montre le nombre de notes, la tonalité déduite des accords et la grille de la mélodie : les accords en haut, colorés selon leur fonction (repos, préparation, tension, couleur du mode, emprunt), et les notes en dessous, chacune avec son nom et une couleur selon son type (note de l'accord, couleur, passage / broderie, appoggiature, note de la gamme, tension) ; un nouveau clic en tire une autre ; **Écrire sur la piste** remplace ses notes dans la scène en cours (Ctrl+Z).
Repliés : **Options** (tonalité, tessiture, rythme, fin, et des **paroles** facultatives, découpées en syllabes
françaises, qui remplacent la structure) et **Détails** (hypothèses, contrôles, tableau des notes, export MIDI).
Mélodie : notes de l'accord sur les appuis, notes de passage entre elles, motif repris et varié, respirations en
fin de phrase. Le séquenceur avance par doubles-croches : pas de triolets.

**Intention : le profil mélodique de l'émotion** (`js/melody-profiles.js`). En haut de l'atelier, l'émotion de la
scène (onglet Ambiance), une autre émotion ou « Sans profil ». Chacune des 15 émotions a un profil, tiré de
l'« appui à essayer » du guide MusicEmotion et de la méthode mélodique de la formation (`docs/reference/`) :

- six **axes** (calme/agité, sombre/lumineux, intime/ample visibles ; stable/incertain, retenu/exubérant,
  régulier/flottant dans **Réglages fins**) qui donnent les notes par mesure, l'ambitus, le registre, le goût pour
  les sauts et le rythme ;
- le **contour** de la phrase (arche, montée, descente, plateau, vagues), la **note visée** sur les appuis
  (fondamentale, tierce, quinte, couleur du mode — la sixte majeure pour l'espoir —, note pivot), la **fin**
  (fermée, ouverte, suspendue), les **ornements** permis (passage, broderie, retard, appoggiature, anticipation ;
  seulement sans paroles), la **reprise du motif** (répétition variée, séquence, registre, renversement,
  augmentation, diminution, fragmentation, décalage) ;
- le **motif de départ** (Auto, Arche 1–3–5–3, Appel et retenue, Note répétée, Note commune) et la **note pivot**
  (une note commune à plusieurs accords de la grille, qui change de rôle de l'un à l'autre).

Le résultat montre ce que le profil demandait et ce que fait la mélodie (note visée entendue, sommet de la phrase,
fin), puis six repères descriptifs (tessiture, mouvement conjoint, notes répétées, attaques par mesure,
respirations, cellule rythmique reprise). **Variante B** recompose avec la même graine en changeant un seul levier
(contour, fin, note visée ou reprise), pour comparer à l'écoute. L'onglet Ambiance montre la **mélodie conseillée**
de chaque émotion ; dans Band, l'émotion de chaque scène (étape Accords) guide aussi la mélodie (contour, note
visée sur les temps forts, registre, fin) ; à l'étape Mélodie de l'assistant, c'est ce même panneau qui compose la
mélodie de chaque scène.

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

Le bouton à curseurs de l'en-tête ouvre la fenêtre de **sound design** (oscillateur, filtre cutoff / résonance / enveloppe, ADSR, glide, niveau, panoramique, saturation), inspirée des paramètres de strudel.cc. Elle est organisée en onglets verticaux (VCO, Filtre, Enveloppes, LFOs avec sous-onglets LFO 1 | LFO 2, Glide, Sortie), avec un résumé des réglages sous chaque onglet ; taille fixe, dernier onglet retenu :

- filtre passe-bas, passe-haut, passe-bande ou coupe-bande, avec 4 modèles (comme `ftype()` de strudel) :
  **12 dB**, **24 dB**, **Ladder** (4 pôles façon Moog, avec drive) et **SEM** (variable d'état façon Oberheim) ;
- **glide** : *Portamento* (chaque note glisse depuis la précédente) ou *Glide legato* (façon Moog : seulement
  entre notes liées, sans redéclencher les enveloppes) ;
- onde **Pulse** avec sa **largeur d'impulsion** (5 à 95 %) : deux dents de scie décalées, donc sans repliement ;
  la largeur suit la hauteur pendant un glide ;
- **LFO 1 et LFO 2** (`js/modulation.js`) : destination (**Hauteur**, **PWM**, **Cutoff**, **Volume**, **Pan**),
  forme (sinus, triangle, rampes, carré, S&H, aléatoire lissé), vitesse **calée sur le tempo** (de 1/16 à
  64 mesures, triolets et pointées compris) ou libre en Hz (0,01 à 20 Hz), phase **Libre** (commune à toutes les
  notes, alignée sur la lecture : un LFO de 4 mesures repart avec la boucle) ou **Retrig** (repart à chaque note),
  quantité (négative = forme inversée) et fondu d'entrée. Les LFO s'appliquent aussi aux instruments échantillonnés
  (sauf PWM) ;
- enveloppes longues pour les nappes et drones : attaque et decay jusqu'à 10 s, release jusqu'à 20 s ;
- **sous-oscillateur** : un carré une ou deux octaves sous la note (niveau et octave), qui suit le glide ;
- **bruit** (bloc Bruit de l'onglet VCO) : générateur de bruit blanc, rose ou brun mélangé à l'oscillateur, comme le mixeur d'un Minimoog ou d'un Juno ; « Niveau de l'oscillateur » à 0 pour n'entendre que le bruit (presets Noise Riser, Wind, Rumble). Les anciennes chansons avec une onde de bruit sont converties à l'ouverture (version 3 du format) ;
- **force de l'accent** (section Sortie) : effet des notes accentuées.

### Accent des notes

Une note **accentuée** (`ev.acc`, liseré doré en haut de la note) est plus forte, son filtre s'ouvre davantage et
sa résonance claque, puis le filtre retombe : c'est le son « acid ». Comme sur les boîtes à basse des années 80,
l'effet **s'accumule** sur des accents rapprochés (une mémoire qui se vide en ~0,35 s) : le filtre monte d'accent
en accent. Pour accentuer : le bouton **Accent** de la fenêtre d'une note (clic droit), ou la touche **A** sur une
sélection (toutes accentuées, sinon l'accent est retiré). Les arpèges accentuent toutes les notes de l'accord ; le
Juno-106 reçoit l'accent par la vélocité ; l'export MIDI donne aux notes accentuées une vélocité plus forte.
Presets : **Acid Sub** et **Techno Sub Bass** (Bass).

### Jeu : expression et articulations (`js/expression.js`)

Pour les cordes, les cuivres, les bois, les voix, le piano et la guitare, l'onglet **Jeu** du Sound design fait
jouer la piste comme un musicien (réglage rangé dans `track.sd`, comme le reste du son : Annuler, versions et fichier le gardent ;
**Réinitialiser** ne le touche pas) :

- **Expression** (`sd.expr` : `light`, `natural`, `expressive` ; absente : chaque note telle qu'elle est écrite). Les
  notes de la scène sont groupées en **phrases** (séparées par une croche de silence, 4 mesures au plus). La phrase
  monte vers sa note la plus haute puis retombe (arc), les notes d'une blanche ou plus **enflent puis se posent**
  (soufflet), la dernière note s'éteint ; en Expressive, les rondes des cordes et des cuivres font un **« fp »**
  (attaque, recul, crescendo). Les vents et les voix **respirent** (80 ms) au bout d'une ligne de 4 mesures sans
  silence. Un **filtre suit la nuance** : le piano est plus sombre, le forte s'ouvre jusqu'au réglage du son (comme
  les couches de nuance d'une banque orchestrale). Une note n'est jamais plus forte que sa vélocité.
- **Phrasé automatique** (coupé par `sd.phrase = 0`) : notes qui se touchent → legato, notes répétées → détaché,
  doubles-croches isolées → staccato.
- **Articulation d'une note** (`ev.art`, menu de la note, rangée **Jeu** ; signe sur la note) : `leg` legato ⌒ (la
  note chevauche la suivante de 50 ms et s'éteint vite, la suivante attaque en douceur), `stac` staccato • (45 % de
  la durée), `det` détaché ‐ (82 %), `ten` tenuto — (toute la durée, sans retombée), `swell` soufflet ◇, `mute`
  étouffé × (palm mute : 35 % de la durée, plus doux, sourd). Elle l'emporte sur le phrasé automatique et marche sur
  tout instrument, même sans expression.
- **Piano et claviers** (famille Keys : pianos, pianos électriques, clavecin, clavinet ; pas l'orgue) : le son ne fait
  que s'éteindre, donc pas de forme dans la note. La nuance passe par la **force de frappe** (arc de phrase sur la
  vélocité, le timbre la suit) ; dans un accord, la **note du haut** est jouée plus fort (+10 %) que les autres
  (−8 %), qui partent 3 à 12 ms après elle (**doigts** pas tout à fait ensemble, écarts reproductibles) ; la dernière
  note de la phrase arrive 15 ms plus tard (**rubato**). **Pédale automatique** (`sd.pedal = 0` la coupe ; sans
  effet si la piste a sa propre courbe de pédale) : chaque note tient jusqu'à la note suivante, au plus une mesure,
  et la pédale se relève sur son attaque ; pas sur un staccato, un détaché ou un étouffé. Pas de legato automatique
  (un piano réattaque toujours).
- **Guitares** : les accords de 3 notes ou plus sont **grattés** (strum) : vers le bas (de la corde grave à l'aiguë,
  18 à 36 ms) sur le temps et sa première moitié, vers le haut sur la seconde moitié (plus court, 15 % plus doux, sans
  la corde grave si l'accord a 4 notes ou plus). **Accents du rythme** d'après la mesure du projet : premier temps,
  temps (−7 %), contretemps (−15 %), doubles (−22 %), à l'échelle de l'expression. L'étouffé n'est pas gratté.
- **Par défaut** : expression Naturelle pour les nouvelles pistes de cordes, cuivres, bois, voix, piano et guitare
  (`SS.newTrack`, donc aussi les chansons de l'assistant) ; changer d'instrument garde le jeu. Les cordes et cuivres
  de synthé peuvent l'avoir (non posée d'office) ; les pistes Synthé (Juno-106), les arpèges, l'orgue et les cordes
  pincées n'en ont pas.

Le plan de chaque note est calculé une fois par scène (`SS.expression.plan`, fonction pure mise en mémoire tant que
les notes ne changent pas) et appliqué par `js/audio.js` : gain qui suit la forme de la note après le VCA, filtre
qui suit la nuance, durée, attaque et relâchement, force et décalage de chaque note d'un accord, pédale. Il s'entend à la lecture, dans la boucle du Sound design et à
l'export audio. **Export MIDI** (case « Appliquer le jeu des pistes », cochée par défaut) : le même plan, écrit en
données MIDI — nuances dans la vélocité (frappe, mélodie au-dessus de l'accord), nuance dans les notes en **CC 11**
(un point par demi-pas ; pas sur une scène qui a sa propre courbe de volume, déjà en CC 11), articulations dans les
durées, strum et doigts décalés dans les départs, rubato, pédale automatique du piano en **CC 64** (enfoncée juste
après l'attaque, relevée juste avant la note suivante ; les notes restent écrites). Le timbre qui suit la nuance reste
dans StepSeq. Pas encore : les techniques de jeu (pizzicato, trémolo) dans une même piste, le vibrato retardé. Tests : `node --test tests/expression.test.js`,
`node --test tests/midi-expression.test.js`, `node tests/e2e/expression.js`.

### Effets d'espace : Cosmos et écho à bande

La fenêtre **FX** d'une piste a une taille fixe et des **onglets verticaux** (une rangée de pastilles sur
téléphone), avec l'état de chaque section (off, actif, nombre d'envois, « gelé ») ; elle se rouvre sur le dernier
onglet utilisé (flèches et Début / Fin pour passer d'un onglet à l'autre) :

- **Cette piste** : Chorus, Delay, Reverb, Sidechain et **Envois** vers les bus partagés du morceau (plate, hall,
  écho, Cosmos) ;
- **Bus du morceau**, réglages communs à toutes les pistes :
  - **Plate et hall** : durées, pré-délai du hall ;
  - **Écho · délai à bande** : temps calé sur le tempo, répétitions jusqu'à 100 % (la saturation de la bande dans
    la boucle les garde sous contrôle), couleur (filtre dans la boucle), **saturation**, **wow / flutter** (vitesse
    de la bande qui fluctue : les répétitions ondulent légèrement).
  - **Cosmos · reverb longue** (`js/space-dsp.js`) : reverb algorithmique (8 lignes à retard bouclées, modulées)
    pour l'ambient et la dub techno. Durée de la queue jusqu'à 60 s, taille, pré-délai, amortissement des aigus,
    modulation, **Shimmer** (la queue est réinjectée une octave plus haut et s'élève) et **Freeze** (la queue tient
    indéfiniment ; les nouvelles notes n'y entrent plus). Préréglages Salle, Cathédrale, Infini, Shimmer.
- Préréglages d'envois **Ambient** et **Dub techno** ; l'envoi vers le Cosmos s'automatise aussi par pas.

Presets qui s'en servent : **PWM Bass**, **Evolving Bass**, **Wobble Bass**, **PWM Reese** (Bass), **PWM Strings**,
**Breathing Pad** et **Drone** (Pads).

Sur une piste **Synthé**, ce bouton ouvre la façade du synthé : pour le Juno-106, les sections LFO, DCO
(16'/8'/4', impulsion + PWM, dent de scie, sous-oscillateur, bruit), HPF, VCF 24 dB/oct, VCA, ENV, chorus I / II,
et la sélection des 128 patches d'usine (groupe, banque, numéro) avec l'afficheur à LED, sur une copie de la
façade d'origine. Un clavier de 2 octaves sous la façade se joue à la souris ou au clavier de l'ordinateur (lettre affichée sur
chaque touche, 6 voix). Le son est un portage du moteur de l'[Ultramaster KR-106](https://github.com/kayrockscreenprinting/ultramaster_kr106).

Le chevron **›** dans l'en-tête d'une piste instrument affiche son piano roll : cliquer pour poser une note, glisser
vers la droite pour l'allonger. Plusieurs notes au même pas font un accord ; cliquer sur l'une d'elles n'enlève
qu'elle. Quand la scène a une tonalité, la palette d'accords pose un accord entier au dernier endroit cliqué.

### Piste Accords et interrupteurs ARP / ACCORDS

**Piste Accords de la scène** (`js/chords.js`, ligne dorée collée sous la règle) : chaque scène a sa propre suite
d'accords, rangée par degré dans la tonalité de la scène (elle suit la tonalité si on la change). C'est la même grille
que dans l'étape Accords de l'assistant.

- Un **clic dans une case vide** pose l'accord de tonique sur 1 mesure (ou jusqu'à l'accord suivant), calé sur le
  temps. Si la scène n'a pas encore de tonalité, elle est demandée d'abord (proposée d'après les notes de la scène).
- Un **clic sur un accord** ouvre son panneau : les accords de la tonalité colorés par fonction (repos, préparation,
  tension), le type (7, maj7, sus4…), la **durée** (1 temps, 2 temps, 1, 2, 4 ou 8 mesures,
  « Jusqu'à la fin »), Écouter, Dupliquer, Supprimer.
- **Glisser** un accord le déplace (Alt : le duplique) ; glisser son **bord droit** change sa durée, au temps près.
  La durée va de 1 temps à la fin de la scène. Un accord posé, déplacé ou allongé remplace ce qu'il recouvre.
- **+ ACCORD** ajoute un accord après le dernier ; **TONALITÉ ›** ouvre le menu de la tonalité de la scène.

**Interrupteurs d'une piste instrument** (sous son nom ; pas sur les pistes Drum ; dans le menu ⋯ en mode compact) :

| ARP | ACCORDS | La piste joue… |
| --- | --- | --- |
| éteint | éteint | ses notes (piste normale : basse, lead, mélodie) |
| éteint | allumé | les accords de la scène, **tenus** sur toute leur durée (nappes, cordes, orgue) |
| allumé | éteint | l'**arpège** des notes tenues ensemble dans son piano roll |
| allumé | allumé | l'**arpège des accords** de la scène : changer un accord change l'arpège, sans rien réécrire |

Quand une piste joue les accords, sa ligne montre les accords en pointillés et ne s'édite pas ; un clic propose
**Convertir en notes** (la piste reprend en notes ce qu'elle joue dans la scène et ne suit plus les accords).
Un **clic droit sur ACCORDS** ouvre ses réglages : **Jeu** (Tenu, ou **Sur mes pas** : les notes de la piste donnent le
rythme, l'accord du moment donne les hauteurs), **Notes** (Accord, Fondamentale seule, Sans fondamentale,
Basse + accord), **Hauteur** (C1 à C5), **Voicing** (Serré, Ouvert, Drop 2), enchaînement au plus proche (le
renversement qui bouge le moins) et notes communes liées (pas rejouées d'un accord au suivant).
Une scène sans accords laisse se taire les pistes qui les suivent. La lecture et l'export MIDI passent par
`SS.playEvents` : une piste qui suit les accords est exportée note par note.

Anciens projets : une piste **Arpège** garde ses notes et allume ARP ; une piste **Accord** devient une piste normale
(ses accords restent des notes empilées).

### Arp One, l'arpégiateur

Le bouton **Arp One** du piano roll d'une piste dont ARP est allumé ouvre l'arpégiateur, titré avec le nom de la piste et la partie en cours (« Arp One · Juno-106 — Couplet ») (`js/arp.js` pour
le moteur, `js/arppanel.js` pour la fenêtre, `js/motifs.js` pour le catalogue de motifs).

**En-tête, toujours visible**

- **Lecture en boucle** de l'arpège sur l'accord de la piste ou un accord d'essai (choisi en deux menus) ; le module
  Accord choisit la **source** : **Piste Accords** (les accords de la scène, même effet que le bouton ACCORDS),
  **Notes de la piste** ou **Essai** ;
  chaque réglage s'entend tout de suite. Sur une piste vide, **Poser sur la piste** place l'accord sur la boucle.
  La boucle dure le plus petit nombre de mesures entières qui contient au moins 16 pas et un cycle complet du
  motif ; la grille montre toute la boucle (repères de temps et de mesures) : les colonnes s'affinent quand la
  boucle s'allonge, sans descendre sous 18 px — au-delà, la grille défile pour suivre le curseur.
- **Réglage pas à pas** : cliquer un pas de la grille règle sa **vélocité**, sa **longueur** (¼ temps à
  4 temps), le nombre de **notes à la fois** (1 à 3 : la note + les notes de l'accord juste au-dessus), le
  **degré** (−2 à +2 : la note décalée d'une ou deux notes de l'accord), la **vitesse du pas** (×1 à ×4 : rafale
  des notes suivantes de l'arpège dans le pas), le **ratchet** (1 à 4 répétitions) ou en fait un **silence** ; la rangée de vélocités se règle aussi en glissant.

**Organisation** — en haut, la grille et une **ligne de pas** dessinée en glissant (Essentiel : vélocité ;
Avancé : vélocité, rythme, degré, vitesse ×, ratchet, longueur, notes, octave, probabilité, chacune avec sa
longueur et son sens de lecture). En bas, des **modules** avec voyant et résumé (Motif, Rythme, Accord, Pas à pas,
Geste, Écho, Ratchet roulé, Évolution) : clic sur le voyant = éteindre / rallumer tel qu'il était, clic sur le nom
= ses réglages. **Intuitif / Essentiel / Avancé** choisit le niveau de détail (retenu dans le navigateur) ; la
croix × ferme en gardant les réglages, Annuler revient aux réglages d'ouverture.

**Mode Intuitif** — le motif (‹ ›), Surprends-moi et 4 boutons rotatifs : **Densité** (silences → tous les pas →
rafales et ratchets), **Ampleur** (1 octave serré → 4 octaves ouvert), **Mouvement** (figé → variations et timbre
qui ondule), **Écho** (aucun → 4 échos qui montent dans l'accord). Chaque bouton remplace les réglages fins qu'il
pilote (`SS.Arp.macroPatch` / `macroValue`).

**Module Accord** — accord joué (de la piste ou d'essai, « Poser l'accord sur la piste »), **Hauteur** (telle
quelle, ou l'octave où commence l'accord : C2 à C5), octaves, renversement, voicing. Un nouvel arpège joue en
1/8 sur 8 pas.

**Réglages** — dans le module Motif, **‹ ›** passe au motif précédent / suivant, et **Surprends-moi** tire un
nouvel arpège au hasard en gardant ce qui est verrouillé (le motif, le rythme, l'accord, les effets) ; chaque
tirage est une prise, ‹ › revient aux précédentes jusqu'à l'arpège de départ.

- **Motif** : la tuile du motif en cours ouvre la fenêtre de choix : 67 motifs classés en 10 catégories
  (Montées et descentes, Groupes qui grimpent — dont la **Double montée** A C E A′ · C E A′ C′ —, Sauts et
  intervalles, Basse et pédale — dont **Basse + mélodie** —, Octaves et répétitions, Synthwave et années 80,
  Accords et rythmes, **Rythmes du monde** — tresillo, clave son et rumba, bossa nova, cinquillo, cloche
  africaine 12/8, accents 3 contre 4 et 5 contre 4 —, **Formes génératives** — Cascade, Vague qui monte,
  Balancier qui s'élargit, Fibonacci, Série infinie de Nørgård —, Hasard),
  avec recherche et **Récents** ; chaque motif s'essaie en un clic et suit l'accord joué.
- **Vitesse** (1/4 à 1/32, normale / triolet / pointée), **octaves** (1 à 4), **pas** (4, 8 ou 16 : la
  longueur de la grille réglable pas à pas), **geste** (6 gestes tout prêts + **Ajuster ›**) et **durée des
  notes** (selon le geste, ou fixe : ¼ temps … 4 temps).
- **Renversement** : tel quel, état fondamental (C), 1er (C/E), 2e (C/G), 3e renversement, **Tourne** (change à
  chaque boucle) ou **Proche** (chaque accord prend le renversement qui bouge le moins depuis le précédent :
  C → F/C → G/B). **Voicing** : serré, ouvert (Do Sol Mi′), drop 2, drop 3, basse grave.
- **Lecture des pas** : avant, arrière, ping-pong ou hasard (graine) pour toutes les lignes pas à pas.
- **Écho** : 1 à 4 répétitions de chaque note, écart de ½ à 4 pas, atténuation, transposées ou non (+1 / −1
  degré de l'accord, ± octave, + quinte : spirales). **Ratchet roulé** : les répétitions d'un ratchet montent,
  descendent ou font l'aller-retour dans l'accord.

**Geste** (module Geste, « Ajuster › ») — rendre un arpège moins mécanique, groupe de notes par groupe de notes :

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

Tests de bout en bout des fenêtres (arpégiateur, assistant…) dans Chromium (nécessite le paquet `playwright`) :

```bash
node tests/e2e/arp-ui.js
node tests/e2e/chord-lane.js
node tests/e2e/lfo.js
node tests/e2e/voice-auto.js
node tests/e2e/space.js
node tests/e2e/accent.js
node tests/e2e/arp-cursor.js
node tests/e2e/playhead-ui.js
node tests/e2e/song-ui.js
node tests/e2e/melody-ui.js
node tests/e2e/new-song-wizard.js
node tests/e2e/wizard-melody.js     # étape Mélodie de l'assistant : panneau Mélodie, parts[section].lead
node tests/e2e/cover-wizard.js        # porte « Reprendre » : reprise tapée (parties, accords, ordre)
node tests/e2e/band-song-ui.js
node tests/e2e/mix-master-ui.js
node tests/e2e/automix-ui.js
node tests/e2e/automix-modes.js
node tests/e2e/automix-chains.js
node tests/e2e/audio-light.js
node tests/e2e/debug-origin.js       # journal : origine des projets (démo, nouvelle chanson, écoute de l'assistant)
node tests/e2e/juno-eco.js           # mode éco des synthés Juno (mode allégé, mode Diagnostic, Rétablir)
node tests/e2e/audio-diag.js         # mode Diagnostic : reverb raccourcie puis coupée en cas de décrochage, journal de débogage
node tests/e2e/audio-perf.js
node tests/e2e/audio-export.js       # Exporter l'audio : master .wav, master + stems .zip, arrêt, bilan
node tests/e2e/expression.js         # Jeu : expression (rendu), onglet Jeu du Sound design, articulations des notes
node tests/e2e/automix-pilot.js
node tests/e2e/automix-loud-bass.js
node tests/e2e/band-close.js
node tests/e2e/automix-track-pilot.js
node tests/e2e/automix-master-pilot.js
node tests/e2e/master-effects.js
node tests/e2e/mobile-ui.js
node tests/e2e/gm-mode-ui.js         # mode General MIDI (fenêtre de piste et Band)
node tests/e2e/midi-ui.js            # import / export MIDI (fichier de test fabriqué, ou : node tests/e2e/midi-ui.js morceau.mid)
node tests/e2e/trigcond.js           # conditions de déclenchement (menus, repères, notes jouées passage par passage)
node tests/e2e/automation.js         # automation (ligne sous la piste, dessin, formes, son qui suit la courbe)
node tests/e2e/compact-menu.js       # hauteur « Compact » : menu ⋯ des commandes de la piste
node tests/e2e/line-select.js        # ligne et piano roll : clic = sélection (pas d'effacement), glisser = déplacer
node tests/e2e/transform-sustain.js  # menu Transformer (inversion, durées, mode, rétrograde) et pédale de sustain
```

Sur la ligne compacte comme dans le piano roll, un clic sur une note existante la sélectionne (poignées de longueur
et de vélocité) au lieu de l'effacer, glisser la déplace (en temps, et en hauteur dans le piano roll ;
`grabSelected` dans `js/ui.js`) et Suppr l'efface. Sur la ligne compacte, un clic sur une case vide pose la dernière
note (ou le dernier accord) utilisée.

### Automation : faire évoluer le son au fil de la scène

Inspirée des courbes d'automation d'Ableton Live / Bitwig et des réglages par pas des machines Elektron. Le bouton
**∿** de l'en-tête d'une piste ouvre sa ligne d'automation, sous la piste et alignée sur ses pas
(`buildAutoLane` dans `js/ui.js`, modèle `SS.AUTO_PARAMS` / `SS.autoValue` dans `js/project.js`) :

| Réglage | Effet (sur la tranche de la piste, quel que soit l'instrument) | Export MIDI |
|---|---|---|
| Filtre | filtre DJ : −1 passe-bas fermé … 0 ouvert … +1 passe-haut fermé | CC 74 |
| Résonance | Q du filtre (0,7 à 11,7) | CC 71 |
| Volume | multiplie le volume de la piste | CC 11 |
| Reverb | envoi supplémentaire vers la reverb « hall » partagée | CC 91 |
| Écho | envoi supplémentaire vers l'écho partagé | — |
| Cosmos | envoi supplémentaire vers la reverb longue « Cosmos » | — |

Les pistes instrument (synthés intégrés et instruments échantillonnés, pas le Juno-106) ont en plus un groupe
**Son, à chaque note** : ces réglages agissent sur le son lui-même et sont lus **au début de chaque note**, à la
valeur de la courbe sur son pas (comme les verrous de paramètres des Elektron ; `SS.voiceLocks`,
`SS.applyVoiceLocks`) :

| Réglage | Effet sur la note | Export MIDI |
|---|---|---|
| Cutoff du son | cutoff du VCF : −4 … +4 octaves autour du réglage du sound design | — |
| Largeur (PWM) | largeur d'impulsion de l'onde Pulse (synthés seulement) | — |
| Decay du filtre | decay de l'enveloppe du filtre : ÷4 … ×4 | — |
| Quantité des LFO | multiplie la quantité des LFO 1 et 2 : ×0 … ×2 | — |

**Longueur** de l'automation (menu « Longueur » de la ligne) : par défaut, les courbes bouclent avec la piste ;
`track.autoLen` (en pas, propre à chaque scène comme les courbes, `SS.autoLen`) les fait boucler sur leur propre
durée — 1 ou 2 temps, 1, 2, 4… mesures, jusqu'à la scène entière — indépendamment des notes. La lecture
(`scheduleAuto`, verrous du son) et l'export MIDI lisent la courbe à `pas % longueur`.

Formes toutes prêtes : ouvrir / refermer le son, accents sur chaque temps, balayage de la largeur, notes de plus
en plus longues ou courtes, faire entrer / calmer les LFO.

- **Points sur les pas** (`track.auto = { filter: { pas: valeur } }`), propres à chaque **scène** (rangés avec les
  notes). Entre deux points : une droite ; avant le premier et après le dernier : la valeur du point. Une scène sans
  courbe remet le réglage au neutre.
- **Dessin** à la souris (les pas sautés par un geste rapide sont remplis en ligne droite), clic droit ou Alt pour
  effacer, **Effacer** pour toute la courbe, **Forme…** pour une courbe toute prête (`SS.AUTO_SHAPES` : ouvrir le
  passe-bas, monter le passe-haut avant le drop, fondu, pompe à chaque temps, lâcher de reverb / d'écho…).
- **Moteur** (`scheduleAuto` dans `js/audio.js`) : les nœuds (passe-bas, passe-haut, gain, deux envois) ne sont
  créés que pour une piste qui a une courbe, entre le Mute et le sidechain. À chaque pas, la valeur est posée au
  début du pas puis suit une rampe jusqu'à celle du pas suivant (exponentielle pour les fréquences), sur la grille
  sans swing. Elle évolue donc pendant une note tenue. À l'arrêt, tout revient au neutre.
- Export MIDI : une valeur par pas quand elle change, pistes instrument seulement (le canal 10 est partagé par toute
  la batterie).

**Contrôleurs MIDI** (pistes instrument et synthé, Juno-106 compris ; troisième groupe du menu de la ligne) :

| Réglage | Dans StepSeq | Export MIDI |
|---|---|---|
| Pédale de sustain | deux valeurs (enfoncée / relâchée), sans rampe ; une note relâchée pédale enfoncée tient jusqu'au pas où la pédale se relève (`SS.pedalLen`), au-delà de la fin de la boucle s'il le faut | CC 64 (127 / 0) ; les notes gardent leur durée écrite |
| Modulation (synthé externe) | rien (pour la molette d'un synthé matériel) | CC 1 |
| Pitch bend (synthé externe) | rien | pitch bend 14 bits, ±2 demi-tons (`SS.BEND_RANGE`) |

Formes de la pédale : relevée à chaque mesure ou demi-mesure (relevée sur le pas du changement d'accord, enfoncée
au pas suivant), enfoncée tout du long. Une courbe avant son premier point prend la valeur du dernier point de la
boucle (`SS.autoValue(…, hold)`). Les courbes MIDI seules ne créent pas de nœuds audio sur la tranche.
- Sur téléphone, le bouton ∿ est masqué ; les courbes posées restent jouées.

### Conditions de déclenchement

Inspirées des « trig conditions » des machines Elektron (et de la probabilité des notes d'Ableton Live) : une note
(menu du clic droit, ligne **Condition**) ou un pas de batterie (clic droit sur un pas allumé) ne joue que si sa
condition est remplie à ce passage de la boucle (`SS.TRIG_CONDS`, `SS.trigOk` dans `js/project.js`) :

| Condition | Joue… |
|---|---|
| 75 %, 50 %, 25 %, 10 % | avec cette probabilité, tirée à chaque passage |
| 1:2, 2:2, 1:4, 2:4, 3:4, 4:4, 1:8, 8:8 | au passage A de chaque groupe de B (1:4 = premier sur quatre) |
| 1er / Pas 1er | seulement au premier passage / à tous sauf le premier |

- **Passage** : un tour de la boucle de la piste depuis Lecture ; en mode Chanson, depuis le début du bloc
  (répétitions du bloc comprises). Une piste plus courte que la scène compte ses propres tours.
- **Tirage reproductible** : la probabilité dépend de la piste, du pas, du bloc et du passage (hachage FNV-1a) :
  deux lectures donnent les mêmes coups, et l'export MIDI (`js/midi.js`) écrit exactement ce qu'on entend.
- Une condition porte sur toute la note (ou tout l'accord d'une piste Arpège). Elle s'applique aussi au
  déclenchement du sidechain. Gardée dans les scènes, la recopie de mesures, le copier / coller et le
  déplacement ; un pas rallumé repart sans condition.
- Repères : étiquette courte en haut à droite d'un pas de batterie (« 50% », « 1:4 », « ≠1 »), coin blanc sur une
  note ; le détail est dans l'infobulle.

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
- **Transformer…** (menu de la barre du bas, pistes instrument et synthé ; `js/transform.js`, fonctions pures
  testées) :
  - **Inverser** : miroir des hauteurs autour de la première note, dans la gamme de la scène si elle a une
    tonalité (Do Ré Mi Fa → Do Si La Sol en Do majeur), sinon en demi-tons ;
  - **Rétrograde** : la phrase à l'envers, durées gardées (un micro-décalage s'inverse aussi) ;
  - **Durées ×2 / ×½** : positions et durées depuis le début de la sélection ; les notes qui sortent de la boucle,
    ou qui tombent sur la même note au même pas, sont retirées (le message les compte) ;
  - **Autre mode** (scène avec une tonalité) : même tonique, chaque note garde son degré (Do majeur → Do mineur :
    Mi → Mi♭, La → La♭, Si → Si♭) ; une note hors de la gamme garde son écart.
  - Accords et arpèges : l'inversion déplace l'accord entier dans la gamme (sa fondamentale suit le miroir), le
    type d'accord suit s'il est reconnu. Les notes recouvertes sont remplacées, comme au collage ; Ctrl+Z annule.

### Zoom horizontal

En bas à droite : **−** / **+**, le curseur, ou `Ctrl`+molette (pincement sur un pavé tactile), de 10 % à 200 %,
pour voir plus de mesures à la fois. **Tout voir** (touche `0`) fait tenir toutes les mesures à l'écran ;
un clic sur le pourcentage revient à 100 %. Touches `−` et `+` (ou `=`).

### Raccourcis

- `Espace` : lecture / stop
- `Ctrl+S` (`Cmd+S`) : enregistrer — `Ctrl+Maj+S` : enregistrer sous
- `Ctrl+O` : ouvrir
- `A` : accent sur les notes sélectionnées (ou retiré si elles l'ont toutes)
- Double-clic sur le nom d'une piste : renommer

## Fichiers de projet

Les projets sont enregistrés au format JSON (extension `.stepseq.json`) : tempo, mesure, pistes,
sons choisis, pas et notes. Sous Chrome / Edge, **Enregistrer** réécrit le même fichier après le
premier enregistrement ; les autres navigateurs téléchargent le fichier.

### Enregistrement automatique, sans message (`js/store.js`, `js/mysongs.js`)

- **Mes chansons** (**Chansons**, dans le menu de l'icône de l'application) : chaque chanson est enregistrée automatiquement dans le navigateur
  (IndexedDB), environ une seconde après chaque modification, sous son identifiant. **Nouvelle chanson** et **Ouvrir**
  n'écrasent plus rien, et il n'y a plus d'avertissement en quittant la page. La fenêtre liste les chansons
  (ouvrir, dupliquer, supprimer) et leurs **versions** : un instantané au plus toutes les 10 minutes de travail,
  40 par chanson ; **Restaurer** garde l'état actuel dans les versions.
- **Fichier lié** (Chrome / Edge) : après un premier **Enregistrer** (ou un **Ouvrir**), chaque modification
  réécrit ce fichier. Le lien est gardé d'une session à l'autre ; après un redémarrage du navigateur,
  l'indicateur affiche « Reprendre *fichier* » : un clic redonne l'autorisation d'écrire. Placé dans un dossier
  Dropbox / OneDrive / Google Drive, le fichier est aussi sauvegardé sur le web.
- L'indicateur d'enregistrement (barre du haut) montre l'état (« Enregistré · chanson.stepseq.json ») ; un clic ouvre
  « Mes chansons ». Les données restent dans ce navigateur : pour changer d'appareil, passe par le fichier.

### Import / export MIDI (`js/midi-file.js`, `js/midi.js`, `js/midipanel.js`)

**Importer MIDI…** et **Exporter MIDI…** sont dans le menu de l'icône de l'application.

**Import** (nouveau projet) :

- notes placées sur la double-croche, avec leur **décalage d'attaque gardé** en micro-décalage (`ev.shift`, ± ½ pas :
  le jeu humain et les triolets restent à leur place), vélocité, durée (pédale de sustain appliquée) ;
- **expression (CC 11)** : devient une courbe de **Volume** dans chaque scène (seulement les points utiles, la courbe
  est linéaire entre deux points). Sur une piste qui a cette courbe, le jeu automatique (onglet Jeu) ne gonfle plus les
  notes (sauf un soufflet posé à la main) : il garde l'articulation, le phrasé et la force de frappe, et le **timbre suit
  la courbe** (plus sombre quand elle est basse, il s'ouvre quand elle monte, pendant la note aussi) ; à l'export, la
  courbe repart en CC 11 ;
- une piste par
  instrument (piste MIDI × canal), avec le soundfont `gm_*` du programme GM, le nom de piste, le volume (CC 7)
  et le panoramique (CC 10) de départ ;
- batterie (canal 10), au choix : **General MIDI** (par défaut) — une piste Drum par note GM (35–81), jouée par
  la bibliothèque `gm` avec son son d'origine ; ou une **boîte à rythmes** — une piste par élément (table GM →
  kick, caisse claire, charleston, toms…, repli sur la LinnDrum ou la TR-808 pour un son absent), jusqu'à
  4 percussions latines séparées, les autres regroupées. Les notes hors norme GM vont toujours sur une boîte à rythmes ;
- programmes 2 à 4 (Bright, Electric Grand, Honky-tonk) : variante correspondante de `gm_piano` ;
- tempo le plus long du fichier, mesure de départ, tonalité estimée (`SS.harmony.detect`), mesures vides du début
  supprimées ;
- **analyse de la structure** (`SS.midi.analyze`) : phrases de 4 mesures, sections là où l'orchestration change
  (ou aux marqueurs du fichier), boucles de 1, 2 ou 4 phrases qui se répètent (ressemblance piste par piste,
  tolérance d'un pas pour le jeu humain), réutilisation des boucles déjà vues, noms estimés (Intro, Couplet,
  Refrain, Pont…). Trois réglages : Fidèle (0,95), Équilibré (0,85), Compact (0,7). Le bilan donne la part des
  notes rejouées à leur place ;
- perdu : résolution plus fine que la double-croche, changements de tempo / mesure en cours de morceau, pitch
  bend, autres contrôleurs, changements de programme en cours de morceau, SysEx. Tout est listé dans la fenêtre.

**Mode General MIDI** (`project.gm`) : réglage du projet partagé par la fenêtre « Nouvelle piste » (bouton
« Tous / General MIDI » en haut) et Band (bouton « General MIDI »), activé par l'import MIDI. La fenêtre de piste
range alors les 128 programmes dans les 16 familles de la norme (`SS.GM_PROGRAMS`, `SS.GM_GROUPS`,
`SS.gmInstrumentFor`), ne propose que la batterie General MIDI et désactive le type Synthé. Band remplace chaque
choix par son équivalent GM (`SS.midi.gmEquivalent` ; les sons `gm_*` conseillés passent en premier) et joue la
batterie avec le kit `gm` (`SS.Band.KITS.gm`). Liste des pistes : badge « GM n » (bleu : programme, rose : note de
batterie) sur chaque piste General MIDI ; en mode GM, badge orange « ≈ GM n » sur les autres, qui convertit la piste
au clic (`gmBadge`, `convertToGm` dans `js/ui.js`).

**Propriété `midi`** : les instruments `gm_*` du catalogue ont `midi` = leur programme GM (0–127), les types de
drums (`SS.DRUM_TYPES`) et les sons de `SS.GM_DRUMS` ont `midi` = leur note GM. Les autres sons n'en ont pas.
`SS.trackMidi(piste)` donne `{ program }` ou `{ note }` pour une piste General MIDI, sinon `null`.

**Export** (fichier type 1, 480 PPQ) : chanson (arrangement déplié, marqueurs de scènes, armure par scène) ou
scène en cours répétée ; une piste MIDI par piste, batterie sur le canal 10 ; arpèges rendus note par note
(ARP ONE est déterministe), swing et placement des pistes en option, pistes muettes exclues en option ; volume
(CC 7) et panoramique (CC 10) ; jeu des pistes en option (nuances, CC 11, articulations, strum, pédale en CC 64 :
voir « Jeu »). Sons non GM → programme GM le plus proche (synthés intégrés, VCSL, Juno-106 selon
le nom du patch) ; batteries Dirt-Samples / VCSL → note GM devinée d'après le nom de la banque. Les instruments
`gm_*` (programme de la variante jouée) et la batterie General MIDI (note de la banque) sont exportés exactement. Non exporté :
sound design, effets, mixage, mastering, humanisation.

### Exporter l'audio : master et stems en WAV (`js/render.js`, `js/audioexport.js`, `render.html`)

**Exporter l'audio…** (menu de l'icône de l'application) calcule la chanson en fichier WAV, **hors temps réel** :
exactement ce qu'on entend avec Lecture (sons, mixage, effets, Master et mastering), mais plus vite que le temps réel
et sans décrochage possible, puis le télécharge. Tout se fait dans le navigateur, rien n'est envoyé.

- **Contenu** : la chanson (arrangement) ou la scène en cours, répétée 1 à 64 fois.
- **Fichiers** : le **master** (la chanson mixée et masterisée) et, au choix, des **stems** : un fichier **par
  musicien** (pistes Band d'un même musicien ensemble : toute la batterie, le percussionniste à part ; les autres
  pistes, une par fichier) ou **par piste**. Seules les pistes qu'on entend (Muet / Solo) donnent un stem. Chaque stem
  garde sa part de reverb et d'écho (envois vers les bus partagés) et le pompage du sidechain, mais pas le traitement
  du Master : posés ensemble dans un logiciel de musique, ils redonnent le mix avant mastering (écart mesuré : −62 dB
  sur la démo). Plusieurs fichiers : une archive `.zip` (`Titre - master.wav`, `Titre - stems/01 Batterie.wav`…).
- **Format** : WAV PCM **24 bits** (par défaut) ou **16 bits** (CD), avec dither triangulaire (TPDF), ou **32 bits
  flottant** (rien n'est écrêté) ; **44,1 kHz** ou **48 kHz** (vidéo).
- **Bornes** : le pré-roll du moteur est retiré (le fichier commence sur la première note, en gardant les notes jouées
  en avance et l'humanisation), la fin est coupée quand la queue de reverb passe sous −80 dBFS (8 s rendues après
  la dernière mesure ; si elle sonne encore, fondu d'une demi-seconde). Master et stems ont le même départ et la même
  longueur ; le master est recalé sur les stems (intercorrélation : le limiteur à anticipation du mastering le
  retarde de 4 à 5 ms).
- **Bilan du master** (EBU R128 / BS.1770-4, mesuré sur le fichier) : volume intégré et court terme maximal (LUFS),
  ce qu'en feront les plateformes (−14 LUFS), crête vraie (sur-échantillonnage ×4, alerte au-dessus de −1 dBTP),
  dynamique (PLR), écart de volume (LRA) et corrélation stéréo (compatibilité mono) ; crête de chaque stem (alerte à
  0 dBFS hors 32 bits flottant).
- **Arrêter** (ou <kbd>Échap</kbd>) interrompt le rendu. Durée : environ la moitié de la durée de la chanson par rendu
  sur un ordinateur récent, et un rendu par stem en plus du master.

Fonctionnement : chaque rendu se fait dans un cadre invisible qui charge `render.html` (le moteur audio seul : ni
interface, ni « Mes chansons », ni enregistrement automatique ; le stockage du navigateur y est en lecture seule).
`js/render-boot.js` y remplace le contexte audio par un `OfflineAudioContext` et retient la minuterie du séquenceur ;
`js/render-host.js` charge tous les sons de toutes les scènes, lance la lecture en mode chanson comme le bouton
Lecture et appelle le séquenceur toutes les 50 ms de son rendu. Pour qu'un stem tombe exactement sur le master, les
tirages aléatoires (humanisation, bruit, réponses de reverb) suivent une suite fixe, et les autres pistes jouent à
volume nul plutôt qu'en muet (mêmes notes programmées dans le même ordre, sidechain du kick compris). Tests :
`node --test tests/render.test.js`, `node tests/e2e/audio-export.js`.

## Sons

Les sons proviennent des bibliothèques utilisées par [strudel.cc](https://strudel.cc) :

- [tidal-drum-machines](https://github.com/ritchse/tidal-drum-machines) (boîtes à rythmes),
  via [dough-samples](https://github.com/felixroos/dough-samples) ;
- [VCSL](https://github.com/sgossner/VCSL) (Versilian Community Sample Library) ;
- le piano de dough-samples ;
- [Dirt-Samples](https://github.com/tidalcycles/Dirt-Samples) : banques de batterie, et banques mélodiques jouées
  comme instruments (Mighty Moog, Pluck Bass, JV Bass, Jungle Bass, Juno, SID, Hoover, pads…) ;
- les soundfonts General MIDI de [webaudiofontdata](https://github.com/felixroos/webaudiofontdata) : les 125
  instruments `gm_*` de strudel, et les 47 sons de la batterie GM (notes 35 à 81, fichiers `128<note>_<kit>_…`,
  kits FluidR3, JCLive, Chaos, SBLive) pour la bibliothèque de batterie **General MIDI** ;
- plus quelques synthés Web Audio intégrés (saw, square, acid, supersaw, pads…).

## Skills de composition (Claude Code)

Le dossier `.claude/skills/` contient les skills qui guident la composition, et dont les règles sont reprises
par l'assistant **Nouvelle chanson** et la piste Accords :

| Skill | Contenu | Dans StepSeq |
|-------|---------|--------------|
| `composition-harmonie-synthetiseur` | Gammes, accords, degrés, progressions, voicings, basse / arpège / mélodie, parcours en 8 modules | Tonalité, palette d'accords, progressions, génération de couches, vérificateur |
| `arranger-orchestrer-finaliser` | Arrangement, orchestration, mixage, mastering | Méthode « une couche à la fois », démos mixées et masterisées |
| `musicemotion` | Composer à partir d'une émotion : matrice émotion → procédés, trois pistes contrastées, essais A/B | Section Émotion : 15 intentions, propositions, essais A/B, modes |
| `composer-melodies-accords-texte` | Mélodie sur une grille d'accords et des paroles ou une métrique : prosodie, rythme, notes cibles, contrôles, export MIDI | Étape Mélodie de l'assistant : scansion, proposition, tableau des notes, contrôles, écriture sur une piste |

## Mode Diagnostic : décrochages audio (`js/audiowatch.js`, fenêtre Système)

Quand le moteur audio décroche (processeur saturé, notes en retard à répétition), le mode Diagnostic, actif par
défaut, n'éteint pas tout d'un coup : il allège **l'élément le plus lourd encore actif, une marche à la fois**, et le
signale (notification avec « Rétablir », incident dans la fenêtre Système) :

- synthés Juno (les plus lourds, surtout sur téléphone) : **mode éco** — voix sans suréchantillonnage et 4 voix
  au plus par synthé, environ deux fois moins de calcul ; même niveau, aigus à peine plus doux (1 à 2 dB) ;
- reverb d'une piste : raccourcie de moitié (jusqu'à 0,8 s), puis **coupée** si les décrochages continuent ;
- Reverb Cosmos partagée : shimmer coupé, puis bus coupé ; Hall / Plate : raccourcies (jusqu'à 1 s), puis coupées ;
- delay, chorus, écho partagé : coupés.

Un élément coupé est réellement débranché (plus aucun calcul). Après chaque marche, la surveillance attend 4 s
(calcul de la nouvelle réverbération), puis vérifie pendant 4 s de plus si la surcharge a cessé : l'étape est
notée « efficace » ou « insuffisante ». Après 8 marches, ou s'il ne reste rien d'ajustable (filtres lourds), le
mode allégé complet prend le relais (il met aussi les Juno en mode éco). 8 s après, s'il n'a pas fait cesser les
décrochages : avec des Juno encore actifs, incident « Synthés Juno trop lourds » (couper une piste Synthé) ; sans
eux, les effets sont rétablis et l'incident « Coupures venant de l'appareil » oriente vers le système (Bluetooth,
économie d'énergie). Les à-coups de la première 1,5 s de lecture (démarrage de la sortie sur Android) ne
déclenchent aucun allègement. La surveillance suit la chanson qui joue réellement, y compris l'écoute de
l'assistant « Nouvelle chanson ». Les réglages de la chanson ne sont jamais modifiés : les
allègements tiennent jusqu'à « Rétablir » ou au rechargement de la page (`SS.audio.setRelief` / `clearRelief`).

**Journal de débogage** : fenêtre Système › Mode Diagnostic › « Copier le journal de débogage » (ou « Enregistrer
(.txt) »). Le texte, entre `### STEPSEQ-DEBUG v1 ###` et `### FIN STEPSEQ-DEBUG ###`, contient le navigateur, la
latence, les mesures disponibles, chaque piste avec ses effets, les retours et le Master, le poids estimé, les
allègements et leur bilan, les incidents, puis un journal horodaté (`LECTURE`, `MESURE` toutes les 2 s, `INCIDENT`,
`ACTION`, `ATTENTE`, `BILAN`, `ALLÉGÉ`, `RÉPARE`, `PROJET`, `ASSIST`).

**Origine des projets** : chaque chanson est décrite par titre, identifiant, tempo, pistes (dont Juno et batterie),
scènes, blocs, mode de lecture, brouillon d'assistant éventuel (création ou reprise, style, inspiration, étape,
dates) et **origine** : démarrage (sauvegarde locale ou démo), nouvelle chanson vide, fichier ouvert, import MIDI,
Mes chansons (ouverte ou version restaurée), Annuler / Rétablir, « Créer la chanson » de l'assistant (style,
inspiration, graine de mélodie), ou **écoute de l'assistant** (projet temporaire : scène en boucle, chanson à partir
d'un bloc ou jonction, étape, chanson de l'éditeur). Une ligne `PROJET` est écrite à chaque changement, et une ligne
`PROJET joué` dès qu'une autre chanson se met à jouer ; la section « Origine des projets » décrit la chanson jouée et
celle de l'éditeur quand elles diffèrent (`SS.audioWatch.setOrigin`, `projectSummary`). Le coller dans une conversation avec Claude permet de retrouver
l'élément et le code en cause.

## Aides de l'interface

Règle commune à toute l'application (`js/help.js`) : pas de ligne de texte d'aide sous un réglage, mais un
petit **« ? »** à droite du libellé de la ligne. Au survol (ou au clavier), l'aide s'affiche en info-bulle ;
au toucher, un appui l'ouvre. Une aide longue (plus de 160 caractères) montre son début en info-bulle et
s'ouvre en entier dans une fenêtre avec une croix quand on clique sur le « ? ». Échap ferme l'info-bulle
sans fermer la fenêtre en dessous.

- En JavaScript : `SS.helpTip(texte, libellé)` crée le « ? ».
- Texte d'aide écrit dans la page (`.fx-help`, `.mod-help` ou attribut `data-helpify`) : il est déplacé
  automatiquement dans un « ? » à droite du titre ou du libellé qui le précède (`data-help-for="id"` pour en
  viser un autre), y compris dans l'interface créée plus tard.
- Les messages d'état (« Aucune chanson », compteurs, diagnostics) restent visibles : ce ne sont pas des aides.

## Point de comparaison : Cubase Pro 16

[`docs/comparaison-cubase.md`](docs/comparaison-cubase.md) situe StepSeq par rapport à un DAW complet, d'après la
[description fonctionnelle de Cubase Pro 16](docs/reference/cubase-16-description-fonctionnelle.md) : pour chacun
des 18 domaines (harmonie, édition MIDI, arpèges, mixage, automation, export…), ce que StepSeq couvre, ce qui manque
et les évolutions prioritaires qui en découlent (export audio, Web MIDI vers un synthé matériel, Strum…).

## Documents de référence : composition, émotions

Les accords par mode et par émotion (`js/emotions.js`) s'appuient sur trois documents de `docs/reference/` :

- [`musicemotion-guide.md`](docs/reference/musicemotion-guide.md) : manuel MusicEmotion (composition, harmonie et
  émotions). Le répertoire d'intentions (chap. 8) donne les 15 émotions, leur grille et leur « appui à essayer » ; le
  chapitre 4 donne, pour chaque mode, la couleur à faire entendre et une boucle d'essai.
- [`piano-diary-accords-emotions.md`](docs/reference/piano-diary-accords-emotions.md) : relevé de 42 Shorts Piano
  Diary (accords, durées en mesures, tempo de travail, émotion annoncée ou interprétée, réserves), repris tel quel
  dans la bibliothèque de grilles.
- [`formation-composition/`](docs/reference/formation-composition/00_LIRE_EN_PREMIER.md) : formation à la composition
  en 29 chapitres (mélodie, motifs, modes, émotions, bibliothèque de procédés, validation). Les progressions H03 et
  H05–H08 du chapitre 23 sont proposées dans la grille ; la méthode mélodique (chap. 05) servira au compositeur de
  mélodie. Les autres procédés du chapitre 23 :
  - **accompagnements A01–A04** : dans la couche Accords de la grille, accords espacés en rondes (A01), pulsation en
    noires à gate court (A02, l'ancien « Stabs sur les temps ») et harmonie résonante, une attaque par changement qui
    résonne un temps sur l'accord suivant (A04) ; l'arpège huit pas A03 (pool de quatre notes redéfini à chaque accord,
    ordre 1–2–3–4–3–2–3–2) est un motif d'Arp One (`SS.Arp.PRESETS`, exemple du module Motif) que la couche Arpège
    peut poser sur sa piste ;
  - **transitions T01–T06**, dans l'étape « Effets et transitions » de l'assistant, groupe **Procédés d'écriture** de
    chaque jonction (éteints par défaut : la chanson reste celle du plan) : retrait de la batterie sur 1 ou 2 mesures, le
    charleston fermé garde le compte (T01) ; fragmentation de la mélodie des 2 dernières mesures, 1 mesure du motif puis
    ½ mesure deux fois (T02) ; pédale de dominante ou de tonique à la basse sur 2 ou 4 mesures (T03) ; élargissement des
    accords et arpèges à l'octave, en haut puis en bas, sans dépasser Sol6 ni descendre sous Mi2 (T04) ; suspension :
    la tierce du premier accord de la scène suivante retardée par la quarte pendant 1 ou 2 temps (T05) ; la **Coupure
    avant** est le silence T06 (1 temps, 2 temps ou 1 mesure ; reverb et écho continuent de sonner).

## Structure du code

| Fichier          | Rôle |
|------------------|------|
| `index.html`     | Structure de la page et dialogue d'ajout de piste |
| `css/style.css`  | Thème et mise en page |
| `icons/`        | Icône du projet : `stepseq.svg` (grille de pas + note, aussi logo de la barre du haut), `note-16.svg` (note seule pour le 16 px), PNG favicon 16 / 32 et icône d'écran d'accueil 180 |
| `js/help.js`     | Aides de l'interface : « ? » à droite d'un libellé, info-bulle au survol, fenêtre pour une aide longue |
| `js/library.js`  | Catalogue généré depuis strudel.cc (125 soundfonts gm_*, VCSL) |
| `js/dirt.js`     | Catalogue généré des banques mélodiques de Dirt-Samples |
| `js/sounds.js`   | Catalogue des sons (batterie, familles d'instruments, accords) |
| `js/space-dsp.js` | Reverb longue « Cosmos » (AudioWorklet) : réseau de 8 lignes à retard, Freeze, Shimmer |
| `js/filters.js`  | Filtres Ladder et SEM (AudioWorklet) du sound design |
| `js/project.js`  | Modèle de projet, enregistrement / ouverture de fichiers |
| `js/audio.js`    | Moteur audio : chargement des échantillons, voix, séquenceur |
| `js/modulation.js` | LFO du synthé intégré (formes, vitesses calées sur le tempo, phase, courbes) et réglages PWM |
| `js/sounddesign.js` | Fenêtre de sound design (VCO, filtre, ADSR, glide, sortie) |
| `js/juno.js`     | Synthés analogiques : catalogue, 128 patches d'usine du Juno-106, un AudioWorklet par piste |
| `js/juno-dsp.js` | Moteur du Juno-106 (AudioWorklet), porté de l'Ultramaster KR-106 — GPL v3 |
| `js/junopanel.js` | Façade du Juno-106 (sound design des pistes Synthé) |
| `js/groove.js`   | Fenêtre Groove (swing, humanisation) |
| `js/harmony.js`  | Aide à la composition : gammes, accords diatoniques, identification des accords, estimation de la tonalité, vérificateur d'harmonie |
| `js/emotions.js` | Intentions émotionnelles (skill MusicEmotion) : matrice et trois propositions par intention, modes de l'onglet Ambiance et guide des modes (couleur, boucle d'essai), bibliothèque de 94 grilles de référence (accords, durées, mode, émotions, source, tempo de travail, émotion annoncée ou interprétée) |
| `js/fx.js`       | Fenêtre Effets par piste (chorus, delay, reverb, sidechain, envois vers les bus partagés) |
| `js/master-dsp.js` | Mastering du Master (AudioWorklet) : graves en mono, largeur, écrêtage doux, limiteur à anticipation, mesure LUFS / true peak |
| `js/mixer.js`    | Console de mixage : tranches, EQ, compresseur, limiteur, vumètres |
| `js/automix.js`  | Auto Mix : mesures (bandes d'octave, LUFS, LRA, corrélation), critères, cibles et conseils (fonctions pures) |
| `js/automix-listen.js` | Auto Mix : écoute pendant la lecture (analyseurs sur les pistes et le Master) |
| `js/automix-pilot.js` | Auto Mix : pilote auto des faders (mesure entre pistes, petits gestes, gain staging) |
| `js/automixpanel.js` | Auto Mix : panneau de la console, A/B, préférences, pilote auto |
| `js/band-songs.js` | Band : plans des 20 chansons complètes (tonalité, sections, grilles, parties) |
| `js/drum-patterns.js` | Bibliothèque de motifs de batterie (20 par style : synthwave, edm, ambient, techno), fills et fréquences de fill ; `SS.drumPattern` |
| `js/bandsong.js` | Band : écrit les scènes, les notes de chaque musicien et l'arrangement d'après un plan |
| `js/melody-profiles.js` | Profils mélodiques des 15 émotions : six axes d'intention, contour, note visée, fin, ornements, reprise du motif, motif de départ ; `SS.resolveMelodyProfile`, variante B |
| `js/melody.js` | Mélodie : grille d'accords, syllabes du français, rythme, hauteurs (pilotées par le profil de l'émotion : contour, note visée, ornements, reprise), notes pivots, mesures descriptives, contrôles, export MIDI ; vérification d'une mélodie écrite (`checkMelody`) — fonctions pures |
| `js/melodypanel.js` | Panneau Mélodie, affiché dans l'étape Mélodie de l'assistant Band (options d'hôte : `sceneKey`, `sceneEmotion`, `hideTrack`, `noListen`, `onResult`, `getState` / `setState`) : formulaire, proposition (grille, écoute avec la nappe, contrôles), écriture sur la piste |
| `js/bandmix.js`, `js/band-levels.js`, `js/band-drive.js` | Band : règles de mixage et de mastering, niveaux mesurés, gain de mastering par chanson |
| `js/dirt-tuning.js` | Hauteur mesurée des échantillons Dirt-Samples |
| `tools/`         | Outils de mesure : hauteur des échantillons, niveaux des instruments, rendu et mastering des chansons Band, calibrage de l'Auto Mix |
| `js/song.js`     | Mode chanson : scènes et arrangement, fenêtre Song |
| `js/midi-file.js` | Lecture / écriture de fichiers MIDI standard (type 0 et 1), sans dépendance |
| `js/midi.js`     | Import MIDI (placement sur la grille et micro-décalages, CC 11 en courbe de volume, pistes, analyse de la structure en scènes) et export MIDI (arrangement, arpèges rendus, correspondances General MIDI) |
| `js/midipanel.js` | Fenêtres Importer MIDI / Exporter MIDI (options, bilan, téléchargement) |
| `js/render.js`, `js/audioexport.js` | Exporter l'audio : rendu hors temps réel (master, stems), mesures EBU R128, WAV 16 / 24 / 32 bits, archive ZIP ; fenêtre (options, progression, bilan) |
| `js/expression.js` | Jeu des cordes, cuivres, bois, voix, piano et guitare : phrases, arc, soufflet, frappe, accords (mélodie, doigts, strum), pédale automatique, phrasé automatique, articulations des notes — fonctions pures |
| `render.html`, `js/render-boot.js`, `js/render-host.js` | Page de rendu chargée dans un cadre invisible : moteur audio seul sur un `OfflineAudioContext` |
| `js/transform.js` | Transformations d'une sélection de notes : inversion, rétrograde, durées ×2 / ×½, autre mode |
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
