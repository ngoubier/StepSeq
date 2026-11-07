# Démos

| Fichier | Description |
|---------|-------------|
| `train-de-nuit.stepseq.json` | « Train de nuit » : morceau original, synthpop / hi-NRG années 80, Fa mineur, 132 BPM, 12 pistes, mode chanson (Intro · Couplet · Refrain · Couplet · Refrain · Pont · Refrain ×2 · Outro, 60 mesures, 1:49). **Mixé et masterisé** : ouvre-le avec **Ouvrir**, puis ▶ ; les réglages sont visibles dans la **Console**. |
| `train-de-nuit.mp3` | Le morceau masterisé, joué par StepSeq (MP3 256 kbit/s). |
| `train-de-nuit-avant-mastering.mp3` | La même chanson avant mixage et mastering, pour comparer. |
| `train-de-nuit.compose.py` | Script qui génère le projet : notes, scènes, arrangement, mixage (`MIX`) et mastering (`MASTER`). `--brut` produit la version sans mixage. |
| `envol.stepseq.json` | « Envol » : morceau original, techno mélodique / dream house années 90, Sol mineur, 138 BPM, 15 pistes (TR-909, piano, supersaw, nappes, chœur, riser), mode chanson (Intro · Groove · Montée · Drop ×2 · Break · Montée finale · Drop final ×2 · Outro, 80 mesures, 2:19). Basse roulante **sidechainée sur le kick** (75 %). |
| `envol.mp3` | « Envol » joué par StepSeq (MP3 256 kbit/s). |
| `envol.compose.py` | Script qui génère « Envol » (notes, scènes, arrangement, mixage, mastering ; `--brut` sans mixage). |

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
