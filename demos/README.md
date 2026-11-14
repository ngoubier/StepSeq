# Démos

| Fichier | Description |
|---------|-------------|
| `train-de-nuit.stepseq.json` | « Train de nuit » : morceau original, synthpop / hi-NRG années 80, Fa mineur, 132 BPM, 12 pistes, mode chanson (Intro · Couplet · Refrain · Couplet · Refrain · Pont · Refrain ×2 · Outro, 60 mesures, 1:49). **Mixé et masterisé** : ouvre-le avec **Ouvrir**, puis ▶ ; les réglages sont visibles dans **Mix**. |
| `train-de-nuit.mp3` | Le morceau masterisé, joué par StepSeq (MP3 256 kbit/s). |
| `train-de-nuit-avant-mastering.mp3` | La même chanson avant mixage et mastering, pour comparer. |
| `train-de-nuit.compose.py` | Script qui génère le projet : notes, scènes, arrangement, mixage (`MIX`) et mastering (`MASTER`). `--brut` produit la version sans mixage. |
| `envol.stepseq.json` | « Envol » : morceau original, techno mélodique / dream house années 90, Sol mineur, 138 BPM, 15 pistes (TR-909, piano, supersaw, nappes, chœur, riser), mode chanson (Intro · Groove · Montée · Drop ×2 · Break · Montée finale · Drop final ×2 · Outro, 80 mesures, 2:19). Basse roulante **sidechainée sur le kick** (75 %). |
| `envol.mp3` | « Envol » joué par StepSeq (MP3 256 kbit/s). |
| `envol.compose.py` | Script qui génère « Envol » (notes, scènes, arrangement, mixage, mastering ; `--brut` sans mixage). |
| `reve-eveille.stepseq.json` | « Rêve éveillé » : morceau original, techno mélodique / dream trance, Mi mineur, 136 BPM, 14 pistes (kit TR-909, basse, nappe supersaw, piano, arpège, cordes, lead, montée de bruit), mode chanson (Intro · Montée · Thème ×2 · Break · Envol ×2 · Outro, 64 mesures, 1:53). Mixé et masterisé. |
| `reve-eveille.mp3` | Le morceau joué par StepSeq (capture de la sortie audio, MP3 256 kbit/s). |
| `reve-eveille.compose.py` | Script qui génère « Rêve éveillé » ; harmonie et voicings commentés. `--brut` : sans mixage. |

| `autoroute-de-minuit.stepseq.json` | « Autoroute de minuit » : morceau original, synthwave, Ré mineur, 104 BPM, 13 pistes dont **5 Juno-106** (basse, nappe, arpège, cuivres, lead) ; batterie Oberheim DMX et toms Simmons. Mode chanson (Intro · Couplet · Refrain · Couplet 2 · Refrain · Pont · Refrain ×2 · Outro, 72 mesures, 2:46). Mixé et masterisé. |
| `autoroute-de-minuit.mp3` | Le morceau rendu par StepSeq (rendu hors temps réel, MP3 256 kbit/s). |
| `autoroute-de-minuit.compose.py` | Script qui génère « Autoroute de minuit » : harmonie, patches et réglages Juno commentés. `--brut` : sans mixage. |

## « Horizon magnétique » — Melodic Techno / EDM

- Projet : [`horizon-magnetique.stepseq.json`](horizon-magnetique.stepseq.json), à charger avec **Ouvrir** dans StepSeq, puis **Lecture** en mode Chanson.
- Écoute : [`horizon-magnetique.mp3`](horizon-magnetique.mp3).
- Export MIDI : [`horizon-magnetique.mid`](horizon-magnetique.mid), 15 pistes et 2 846 notes ; les timbres, le mixage et les effets restent dans le projet StepSeq.
- Générateur : [`horizon-magnetique.compose.py`](horizon-magnetique.compose.py), utilisant les outils de notes, batterie et mixage d'Envol. Depuis la racine : `python3 demos/horizon-magnetique.compose.py`.
- **Inspiration** : la construction progressive et l'ampleur d'« Opus » d'Eric Prydz ; thème, harmonie et parties composés ici, sans reprise de sa mélodie.
- **Fa♯ mineur, 124 BPM, 4/4**, 96 mesures (3:06, hors queue de réverbération), 15 pistes, 11 scènes. Convention : Do4 = MIDI 60.
- **Harmonie** : F♯m – D – A – E (i – VI – III – VII), deux mesures par accord. Dernière montée : Bm – D – E – C♯ ; le Mi♯ de C♯ majeur prépare le retour à Fa♯ mineur.

| Scène | Mesures | Écriture et énergie |
|---|---:|---|
| Horizon | 16 | Nappe supersaw et halo aérien, sans batterie ; filtre qui s'ouvre, arpège à partir de la mesure 9. |
| Pulsation | 8 | Kick 909, charleston, basse à contretemps ; le thème reste réservé. |
| Gravitation | 8 | Clap, motif pluck entrevu dans la seconde moitié. |
| Ascension | 8 | Roulement accéléré, riser, filtre et volume en montée ; retrait du kick à mi-section, dernier temps sans nouvelle attaque. |
| DROP — Orbite | 8 | Kick plein, impact sub, crash, basse roulante, lead et pluck. |
| DROP — Réponse | 8 | Réponse du lead et arpège ajouté. |
| En apesanteur | 8 | Batterie et basse retirées ; nappes et thème plus retenu. |
| Dernière ascension | 8 | Nouvelle progression vers la dominante, crescendo puis coupure. |
| DROP FINAL — Magnétique | 8 | Retour du grave, thème varié, ride et halo aérien. |
| DROP FINAL — Pleine lumière | 8 | Arpège remonté à l'octave, crash de relance à mi-section. |
| Dissipation | 8 | Retrait de la batterie, fermeture du filtre, fondu et accord final de Fa♯ mineur. |

**Pistes préparées** : kick, clap, roulement de snare, hi-hat, open hat, ride, crash (TR-909), basse roulante, impact sub, nappe supersaw, motif pluck, lead supersaw, arpège pluck, halo aérien et riser de bruit blanc. Les instruments mélodiques sont des synthés intégrés ; aucun Juno ni soundfont nécessaire. Les échantillons de batterie nécessitent le réseau.

**Mixage** : EQ par rôle et compression hérités de l'outil Envol, basse sidechainée sur le kick à 75 %, nappe à 55 %, lead à 35 %. Graves centrés sous 110 Hz, largeur modérée, plafond du module de mastering à −1,2 dB. Le dernier temps des montées laisse les queues d'effets se dissiper : ce n'est pas une coupure numérique brutale.

**Contrôles du rendu MP3** (ffmpeg EBU R128) : −12,2 LUFS intégrés, −1,5 dBTP, LRA 16,2 LU. La grande plage reflète le contraste entre intro/break et drops. Signal PCM entièrement fini ; fin de réverbération vers −91 dBFS sur les deux dernières secondes du rendu. Ouverture, arrangement et enregistrement en bibliothèque validés dans un profil navigateur de test.

## Fiche de composition — « Autoroute de minuit »

- **Tonalité** : Ré mineur naturel (D E F G A B♭ C) ; **tempo** 104 BPM ; 4/4.
- **Couplet** : Dm | B♭ | F | C, degrés **i – VI – III – VII** (une mesure par accord).
  Dm = D–F–A, B♭ = B♭–D–F, F = F–A–C, C = C–E–G.
- **Refrain** : B♭ | C | F | Dm | B♭ | C | A7 | Dm, degrés **VI – VII – III – i – VI – VII – V7 – i**.
  A7 = A–C♯–E–G : le C♯ (sensible, mineur harmonique) se résout sur D ; le lead joue C♯5 → D5.
- **Pont** : Gm | B♭ | Gm | A (deux mesures chacun), **iv – VI – iv – V** : la tension finit sur A (C♯) avant le refrain.
- **Voicings de la nappe** : A3–D4–F4 → B♭3–D4–F4 → A3–C4–F4 → G3–C4–E4 (notes communes D/F, puis A, puis C).
- **Juno-106** (patch d'usine + réglages de façade) :

| Piste | Patch | Réglages modifiés | Rôle |
|-------|-------|-------------------|------|
| Basse Juno | A48 Synth Bass I | pied 8', SUB 0,85, chorus coupé | croches au couplet, « galop » (1 – et – a) au refrain |
| Nappe Juno | A15 Moving Strings | attaque et relâchement plus longs, chorus II | une triade par mesure |
| Arpège Juno | B24 Bright Pluck | chorus I, écho 3/16 | arpège montant en doubles-croches sur 2 octaves |
| Cuivres Juno | A11 Brass | pied 8', chorus II | coups syncopés au refrain, accords tenus au pont |
| Lead Juno | A53 Lead III | chorus I, vibrato retardé (LFO delay), écho 3/16 | mélodies du couplet et du refrain |

Le MP3 est produit par un rendu hors temps réel de StepSeq (les cinq Juno-106 émulés sont trop lourds pour une capture en temps réel dans un conteneur). Mesures (EBU R128, ffmpeg) : −10,9 LUFS intégrés, true peak −1,2 dBTP, LRA 6,9 LU.

## Fiche de composition — « Rêve éveillé »

Ambiance inspirée de la dream trance du milieu des années 1990 (riff de piano répétitif, nappes larges, kick
en noires, basse sur les contretemps) ; riff, mélodies et progression sont originaux.

- **Tonalité** : Mi mineur naturel (E F♯ G A B C D) ; **tempo** 136 BPM ; 4/4.
- **Thème / Envol** : Em | G | D | C, degrés **i – III – VII – VI**, deux mesures par accord.
  Em = E–G–B, G = G–B–D, D = D–F♯–A, C = C–E–G.
- **Break** : Em | C | Am | B7, degrés **i – VI – iv – V7**. B7 = B–D♯–F♯–A : le D♯ (sensible) vient du
  mineur harmonique et rend le retour sur Mi mineur plus attendu.
- **Voicings de la nappe** (voice leading, notes communes) : E3–G3–B3 → D3–G3–B3 → D3–F♯3–A3 → C3–E3–G3 ;
  au break, E3–G3–B3 → E3–G3–C4 → E3–A3–C4 → D♯3–F♯3–A3–B3.
- **Riff de piano** : 7 attaques par mesure (cases 0, 3, 6, 8, 10, 12, 14), notes de l'accord sur les temps forts,
  notes de passage en fin de deuxième mesure pour mener à l'accord suivant.
- **Basse** : contretemps de croche dans le Thème, basse « roulante » (3 doubles-croches après chaque kick) dans l'Envol.
- **Arrangement en couches** : une couche ajoutée à la fois (piano + nappe → kick → basse et open hat → clap →
  charleston → arpège, ride et lead à l'Envol).

Mesures de la capture (EBU R128, ffmpeg) : −11,1 LUFS intégrés, true peak −1,7 dBTP, LRA 7,3 LU.

## Fiche de mastering — « Train de nuit »

Mesures faites sur une capture PCM directe de la sortie de StepSeq (EBU R128 avec ffmpeg, spectre par FFT).

| Mesure | Avant | Master (WAV) | MP3 livré | Cible |
|--------|-------|--------------|-----------|-------|
| Loudness intégrée | −17,5 LUFS | −10,7 LUFS | −11,2 LUFS | −10 à −11 LUFS (synthpop / dance) |
| True peak | −2,2 dBTP | −1,2 dBTP | −1,3 dBTP | ≤ −1,0 dBTP |
| Plage de loudness (LRA) | 4,1 LU | 4,6 LU | 4,6 LU | dynamique conservée |
| Facteur de crête | 17,4 dB | 12,3 dB | — | 10 à 13 dB |
| Corrélation G/D | 0,91 | 0,88 | — | compatible mono |

Équilibre spectral (énergie relative par bande, dB) :

| Bande | Avant | Master |
|-------|-------|--------|
| Sub 20–60 Hz | −8,9 | −8,8 |
| Grave 60–120 Hz | **−4,4** (trop présent) | −5,9 |
| Bas 120–250 Hz | −7,8 | −8,2 |
| Bas-médium 250–500 Hz | −8,8 | −8,7 |
| Médium 500 Hz–1 kHz | −10,1 | −8,7 |
| Médium-haut 1–2 kHz | −14,3 | −12,6 |
| Présence 2–4 kHz | **−14,8** (terne) | −11,0 |
| Brillance 4–8 kHz | −16,1 | −14,6 |
| Air 8–16 kHz | −19,0 | −17,0 |

### Mixage (console, par piste)

- **Kick** : passe-haut 30 Hz, +1 dB à 60 Hz, −3,5 dB à 350 Hz (carton), +2,5 dB à 3,5 kHz (attaque) ; compression 3:1.
- **Snare / clap** : passe-haut 120 / 220 Hz, présence +3 dB à 5 kHz, air ; compression 3:1 sur la caisse claire.
- **Hi-hats, crash, toms** : passe-haut 350–400 Hz (90 / 60 Hz pour les toms), air ; panoramiques (hi-hat 30 % à droite, open hat 30 % à gauche, toms −35 / +30 %).
- **Basse** : passe-haut 32 Hz, −3 dB à 250 Hz (boue), +2 dB à 1,2 kHz (définition), compression 4:1, **sidechain** sur le kick (45 %).
- **Nappe** : passe-haut 190 Hz, −2,5 dB à 700 Hz, air ; sidechain 55 % (la « pompe »).
- **Arpège** : passe-haut 260 Hz, creusé à 800 Hz et 3,2 kHz, à 38 % à droite ; sidechain 30 %.
- **Lead** : passe-haut 160 Hz, −2 dB à 800 Hz, +1,5 dB à 3 kHz, compression 2,5:1.

### Master

1. **EQ** : passe-haut 25 Hz, −2,5 dB à 70 Hz (shelf), −1,5 dB à 700 Hz, +1 dB à 1,8 kHz, +2,5 dB à 11 kHz (air).
2. **Compresseur « glue »** : seuil −16 dB, 2:1, attaque 30 ms (transitoires préservés), relâchement 200 ms, +2 dB de compensation — environ 3 dB de réduction en moyenne.
3. **Limiteur** : plafond −2 dB, relâchement 60 ms, suivi de l'écrêteur doux suréchantillonné de StepSeq — environ 3 dB de réduction en moyenne.
4. **Version MP3** : −0,5 dB avant encodage, pour que l'encodage ne fasse pas remonter les crêtes au-dessus de −1 dBTP.

## « Envol » — montées et drops

- **Le thème** : un riff de piano en rythme 3-3-2 (doubles-croches), sur Sol m – Mib – Sib – Fa (i – VI – III – VII), doublé par un lead supersaw dans les drops.
- **Sidechain** : la basse roulante (trois doubles-croches par temps) est pompée par le kick à 75 % (relâchement 170 ms) ; la nappe (55 %), le chœur (40 %), le lead (35 %) et l'arpège (30 %) aussi. La piste Kick pilote le sidechain même en sourdine (Mute).
- **Montées** (8 mesures) : roulement de caisse claire qui accélère (noires → croches → doubles-croches) avec crescendo, hi-hats qui montent, basse réduite à une impulsion par demi-mesure, riser de bruit blanc dont le filtre s'ouvre sur 13,5 s, kick coupé à mi-montée, basse en doubles-croches, puis **un temps de silence** juste avant le drop.
- **Montée finale** : passe par Do m – Mib – Fa – **Ré** (la dominante), avec le thème qui grimpe vers Fa#, pour retomber sur Sol mineur.
- **Avant le premier drop**, la basse ne joue que les contretemps ; la basse roulante est réservée aux drops.
- **Drops** : crash + impact sub saturé (Sol grave) sur le premier temps, kick 909 plein, clap, hi-hats en doubles-croches et open hat à contretemps ; le drop final ajoute la ride, l'arpège pluck, le chœur et le piano doublé à l'octave.
