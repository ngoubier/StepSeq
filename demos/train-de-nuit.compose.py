"""Compose « Train de nuit » : morceau original, synthpop / hi-NRG années 80, Fa mineur, 132 BPM."""
import json, os, random

random.seed(84)
BAR = 16
BARS = 8
N = BAR * BARS

# Grille d'accords (2 mesures chacun) : Fm - Db - Ab - Eb  (i - VI - III - VII), enchaînement courant
CHORDS = [  # (racine MIDI pour les nappes, type, racine basse)
    (53, 'min', 29),  # F3 m   / basse F1
    (49, 'maj', 25),  # Db3    / Db1
    (56, 'maj', 32),  # Ab3    / Ab1
    (51, 'maj', 27),  # Eb3    / Eb1
]
IV = {'min': [0, 3, 7], 'maj': [0, 4, 7]}

uid = iter('t%02d' % i for i in range(1, 40))


def drum(name, color, machine, sound, hits, volume=0.8, variant=0, fx=None, length=None):
    steps = [0] * N
    for s, v in hits:
        steps[s] = round(v, 2)
    t = {'id': next(uid), 'type': 'drum', 'name': name, 'color': color, 'volume': volume, 'mute': False, 'solo': False,
         'source': 'tdm', 'machine': machine, 'sound': sound, 'variant': variant, 'steps': steps}
    if fx:
        t['fx'] = fx
    if length:
        t['length'] = length
    return t


def inst(name, color, category, family, instrument, events, volume=0.7, sd=None, fx=None, chord='min', arp=None, octave=3, sfv=0):
    t = {'id': next(uid), 'type': 'instrument', 'name': name, 'color': color, 'volume': volume, 'mute': False, 'solo': False,
         'category': category, 'family': family, 'instrument': instrument, 'sfv': sfv, 'chord': chord,
         'arp': arp or {'mode': 'up', 'rate': 1, 'octaves': 1}, 'octave': octave, 'events': events}
    if sd:
        t['sd'] = sd
    if fx:
        t['fx'] = fx
    return t


# ---------------- Batterie (LinnDrum + toms Simmons) ----------------
kick = [(s, 0.95 if s % 16 == 0 else 0.85) for s in range(0, N, 4)]
snare = [(b * BAR + o, 0.9) for b in range(BARS) for o in (4, 12)]
# roulement de caisse claire dans la dernière demi-mesure
snare = [x for x in snare if x[0] < 120] + [(s, 0.45 + 0.07 * (s - 120)) for s in range(120, 128)]
clap = [(b * BAR + o, 0.65) for b in range(BARS) for o in (4, 12)]
open_hat_steps = {b * BAR + o for b in range(BARS) for o in (2, 6, 10, 14)}
hats = []
for s in range(N):
    if s in open_hat_steps or s >= 120:
        continue
    v = 0.55 if s % 2 == 0 else 0.3
    if s % 4 == 0:
        v = 0.65
    hats.append((s, v))
open_hats = [(s, 0.45) for s in sorted(open_hat_steps) if s < 120]
toms_hi = [(112, 0.8), (114, 0.75), (116, 0.75)]
toms_lo = [(118, 0.8), (119, 0.7), (122, 0.85), (124, 0.9), (126, 0.95)]
crash = [(0, 0.75), (64, 0.6)]

tracks = [
    drum('Kick', '#e3179c', 'LinnDrum', 'bd', kick, 0.9),
    drum('Snare', '#ff4d6d', 'LinnDrum', 'sd', snare, 0.75, variant=1,
         fx={'room': 0.3, 'roomSize': 0.9, 'roomLp': 9000}),  # pièce courte, façon « gated » des années 80
    drum('Clap', '#f08a00', 'LinnDrum', 'cp', clap, 0.55, fx={'room': 0.25, 'roomSize': 1.2}),
    drum('Hi-Hat', '#f5c400', 'LinnDrum', 'hh', hats, 0.5),
    drum('Open Hat', '#c9a227', 'LinnDrum', 'oh', open_hats, 0.4),
    drum('Tom Simmons aigu', '#13c2a3', 'SimmonsSDS5', 'ht', toms_hi, 0.6, fx={'room': 0.35, 'roomSize': 1.6}),
    drum('Tom Simmons grave', '#0f9e85', 'SimmonsSDS5', 'lt', toms_lo, 0.65, fx={'room': 0.35, 'roomSize': 1.6}),
    drum('Crash', '#c0c0c0', 'LinnDrum', 'cr', crash, 0.45),
]

# ---------------- Basse : croches en octaves (signature hi-NRG) ----------------
bass = []
for ci, (_, _, broot) in enumerate(CHORDS):
    for s in range(ci * 32, ci * 32 + 32, 2):
        low = (s // 2) % 2 == 0
        bass.append({'step': s, 'len': 1, 'notes': [broot if low else broot + 12], 'vel': 0.9 if low else 0.7})
tracks.append(inst('Basse octaves', '#3fcf3f', 'mono', 'bass', 'syn_sawbass', bass, 0.75, octave=1,
                   sd={'cutoff': 650, 'q': 6, 'env': 2.4, 'decay': 0.12, 'sustain': 0.25, 'release': 0.05,
                       'fattack': 0.003, 'fdecay': 0.14, 'fsustain': 0.2, 'frelease': 0.05}))

# ---------------- Nappes : accords tenus sur 2 mesures ----------------
pad = []
for ci, (root, ctype, _) in enumerate(CHORDS):
    pad.append({'step': ci * 32, 'len': 32, 'notes': [root + i for i in IV[ctype]], 'vel': 0.55, 'chord': ctype})
tracks.append(inst('Nappe cordes synth', '#1ea7ff', 'chord', 'strings', 'gm_synth_strings_1', pad, 0.42, octave=3,
                   sd={'attack': 0.35, 'release': 1.0, 'cutoff': 5000, 'q': 0.5},
                   fx={'chorus': 0.35, 'chorusRate': 0.6, 'chorusDepth': 0.4, 'room': 0.35, 'roomSize': 2.8, 'roomLp': 7000}))

# ---------------- Arpège : doubles-croches qui montent sur 2 octaves ----------------
arp = []
for ci, (root, ctype, _) in enumerate(CHORDS):
    arp.append({'step': ci * 32, 'len': 32, 'notes': [root + 12 + i for i in IV[ctype]], 'vel': 0.5, 'chord': ctype})
tracks.append(inst('Arpège', '#9b5cff', 'arp', 'synth', 'syn_pluck', arp, 0.33, octave=4,
                   arp={'mode': 'updown', 'rate': 1, 'octaves': 2},
                   fx={'delay': 0.28, 'delayTime': '3/16', 'delayFeedback': 0.35, 'room': 0.2, 'roomSize': 1.6}))

# ---------------- Lead : mélodie originale en Fa mineur ----------------
F4, G4, Ab4, Bb4, C5, Db5, Eb5, F5, G5, Ab5 = 65, 67, 68, 70, 72, 73, 75, 77, 79, 80
melody = [
    # mesure 1 (Fm) : question
    (8, 2, C5), (10, 2, Eb5), (12, 4, F5),
    # mesure 2 (Fm) : réponse descendante
    (16, 2, Eb5), (18, 2, C5), (20, 4, Ab4), (26, 2, G4), (28, 4, Ab4),
    # mesure 3 (Db)
    (40, 2, Db5), (42, 2, C5), (44, 4, Ab4),
    # mesure 4 (Db)
    (48, 6, Bb4), (56, 2, Ab4), (58, 6, F4),
    # mesure 5 (Ab) : la phrase remonte
    (72, 2, C5), (74, 2, Eb5), (76, 4, Ab5),
    # mesure 6 (Ab)
    (80, 2, G5), (82, 2, Eb5), (84, 4, C5), (90, 2, Eb5), (92, 4, F5),
    # mesure 7 (Eb)
    (104, 2, Bb4), (106, 2, Eb5), (108, 4, G5),
    # mesure 8 (Eb) : retombée sur la tonique, qui relance la boucle
    (112, 4, F5), (116, 4, Eb5), (120, 8, C5),
]
lead = [{'step': s, 'len': l, 'notes': [n], 'vel': 0.8 if s % 16 in (0, 8) else 0.72} for s, l, n in melody]
tracks.append(inst('Lead', '#ff4d6d', 'mono', 'synth', 'syn_square', lead, 0.5, octave=4,
                   sd={'wave': 'square', 'voices': 2, 'detune': 8, 'cutoff': 2600, 'q': 3, 'env': 1.2,
                       'attack': 0.01, 'decay': 0.3, 'sustain': 0.7, 'release': 0.25},
                   fx={'chorus': 0.3, 'delay': 0.3, 'delayTime': '3/16', 'delayFeedback': 0.4,
                       'room': 0.3, 'roomSize': 2.4, 'roomLp': 8000}))

for t in tracks:  # marge de mixage : évite l'écrêtage en sortie
    t['volume'] = round(t['volume'] * 0.8, 3)

project = {
    'format': 'stepseq', 'version': 1,
    'title': 'Train de nuit',
    'tempo': 132, 'timeSig': [4, 4], 'bars': BARS,
    'groove': {'res': 16, 'swing': 0.52, 'human': 0.08},
    'tracks': tracks,
}
out = '/home/user/StepSeq/demos/train-de-nuit.stepseq.json'
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, 'w') as f:
    json.dump(project, f, ensure_ascii=False, indent=1)
print(out, len(tracks), 'pistes')
