"""
« Rêve éveillé » : morceau original, techno mélodique / dream trance, Mi mineur, 136 BPM.
Ambiance inspirée de la dream trance du milieu des années 1990 (riff de piano répétitif, nappes larges,
kick 909, basse sur les contretemps). Mélodies, riff et progression sont originaux.

Forme (mode chanson, 72 mesures) :
  Intro (8) · Montée (8) · Thème (8 ×2) · Break (8) · Envol (8 ×2) · Outro (8)

Harmonie (Mi mineur naturel : E F♯ G A B C D) :
  Thème / Envol : Em | G | D | C          i – III – VII – VI   (2 mesures par accord)
  Break         : Em | C | Am | B7         i – VI – iv – V7     (le D♯ de B7 vient du mineur harmonique)

Usage : python3 reve-eveille.compose.py [fichier de sortie] [--brut]   (--brut : sans mixage ni mastering)
"""
import json
import os
import sys

BAR = 16  # une case = une double-croche ; 16 cases = une mesure de 4/4

# ------------------------------------------------------------------ notes (MIDI, Do4 = 60)
E1, G1, A1, B1, C2, D2 = 28, 31, 33, 35, 36, 38
C3, D3, Ds3, E3, Fs3, G3, A3, B3 = 48, 50, 51, 52, 54, 55, 57, 59
C4, Ds4, E4, Fs4, G4, A4, B4 = 60, 63, 64, 66, 67, 69, 71
C5, D5, Ds5, E5, Fs5, G5, A5, B5 = 72, 74, 75, 76, 78, 79, 81, 83

# Accords : nom, type (pour l'affichage), voicing de la nappe, fondamentale de la basse, main gauche du piano.
# Voicings choisis pour garder les notes communes et bouger par petits pas (voice leading) :
#   Em E3–G3–B3 → G D3–G3–B3 (2e renv.) → D D3–F♯3–A3 → C C3–E3–G3 → retour Em
EM = ('Em', 'min', [E3, G3, B3], E1, E3)
GM = ('G', 'maj', [D3, G3, B3], G1, G3 - 12)
DM = ('D', 'maj', [D3, Fs3, A3], D2, D3)
CM = ('C', 'maj', [C3, E3, G3], C2, C3)
# Break : Em E3–G3–B3 → C E3–G3–C4 (1er renv.) → Am E3–A3–C4 (2e renv.) → B7 D♯3–F♯3–A3–B3 (1er renv.)
CM_B = ('C', 'maj', [E3, G3, C4], C2, C3)
AM_B = ('Am', 'min', [E3, A3, C4], A1, A3 - 12)
B7_B = ('B7', '7', [Ds3, Fs3, A3, B3], B1, B3 - 12)

THEME = [EM, GM, DM, CM]
BREAK = [EM, CM_B, AM_B, B7_B]

# ------------------------------------------------------------------ pistes (sons, effets)
TRACKS = [
    # id, nom, couleur, machine, son, variante, volume, effets
    ('kick', 'Kick 909', '#e3179c', 'RolandTR909', 'bd', 0, 0.78, None),
    ('clap', 'Clap 909', '#f08a00', 'RolandTR909', 'cp', 0, 0.42, {'room': 0.3, 'roomSize': 1.6}),
    ('snare', 'Roulement', '#ff4d6d', 'RolandTR909', 'sd', 2, 0.5, {'room': 0.3, 'roomSize': 2.2}),
    ('hat', 'Hi-Hat 909', '#f5c400', 'RolandTR909', 'hh', 0, 0.32, None),
    ('ohat', 'Open Hat 909', '#c9a227', 'RolandTR909', 'oh', 0, 0.34, None),
    ('ride', 'Ride 909', '#a0a0a0', 'RolandTR909', 'rd', 0, 0.22, None),
    ('crash', 'Crash 909', '#d0d0d0', 'RolandTR909', 'cr', 0, 0.34, {'room': 0.25, 'roomSize': 2.5}),
]
INSTR = {
    'bass': dict(name='Basse contretemps', color='#3fcf3f', category='mono', family='bass', instrument='syn_sawbass', volume=0.55, octave=1,
                 sd={'cutoff': 420, 'q': 5, 'env': 2.2, 'decay': 0.1, 'sustain': 0.3, 'release': 0.04,
                     'fattack': 0.002, 'fdecay': 0.1, 'fsustain': 0.15, 'frelease': 0.04}),
    'pad': dict(name='Nappe supersaw', color='#1ea7ff', category='chord', family='pads', instrument='syn_superpad', volume=0.3, octave=3,
                fx={'chorus': 0.4, 'chorusRate': 0.4, 'chorusDepth': 0.5, 'room': 0.45, 'roomSize': 3.5, 'roomLp': 6500}),
    'piano': dict(name='Piano rêveur', color='#ffffff', category='mono', family='keys', instrument='piano', volume=0.5, octave=4,
                  fx={'delay': 0.3, 'delayTime': '3/16', 'delayFeedback': 0.38, 'room': 0.5, 'roomSize': 3.2, 'roomLp': 7500}),
    'arp': dict(name='Arpège cristal', color='#9b5cff', category='arp', family='synth', instrument='syn_pluck', volume=0.18, octave=5,
                arp={'mode': 'up', 'rate': 1, 'octaves': 2},
                fx={'delay': 0.25, 'delayTime': '1/8', 'delayFeedback': 0.3, 'room': 0.3, 'roomSize': 2}),
    'strings': dict(name='Cordes du break', color='#13c2a3', category='mono', family='strings', instrument='gm_string_ensemble_1', volume=0.42, octave=4,
                    sd={'attack': 0.4, 'release': 1.2},
                    fx={'room': 0.5, 'roomSize': 3.5, 'roomLp': 7000}),
    'lead': dict(name='Lead supersaw', color='#ff4d6d', category='mono', family='synth', instrument='syn_supersaw', volume=0.3, octave=5,
                 sd={'attack': 0.02, 'decay': 0.4, 'sustain': 0.75, 'release': 0.35, 'cutoff': 3200},
                 fx={'chorus': 0.3, 'delay': 0.3, 'delayTime': '3/16', 'delayFeedback': 0.4, 'room': 0.4, 'roomSize': 3, 'roomLp': 8000}),
    'riser': dict(name='Montée (bruit)', color='#7f8c8d', category='mono', family='fx', instrument='syn_noiseriser', volume=0.22, octave=4,
                  fx={'room': 0.4, 'roomSize': 3}),
}
DRUM_IDS = [t[0] for t in TRACKS]
INST_IDS = list(INSTR)

# ------------------------------------------------------------------ riff de piano
# Rythme d'une mesure en 3+3+2 / 2+2+2+2 : cases 0, 3, 6, 8, 10, 12, 14.
# Les notes des temps forts (cases 0, 8, 12) sont des notes de l'accord ; les autres peuvent être de passage.
RIFF_STEPS = [0, 3, 6, 8, 10, 12, 14]
RIFF = {
    #         mesure 1 de l'accord                      mesure 2 (variation qui mène à l'accord suivant)
    'Em': ([B4, E5, G5, E5, B5, G5, E5], [B4, E5, G5, E5, Fs5, G5, A5]),  # F♯5, A5 : passage vers B5 / G
    'G':  ([B4, D5, G5, D5, B5, G5, D5], [B4, D5, G5, D5, A5, G5, Fs5]),  # A5 : passage ; F♯5 → D
    'D':  ([A4, D5, Fs5, D5, A5, Fs5, D5], [A4, D5, Fs5, D5, G5, Fs5, E5]),  # G5, E5 : passages vers C
    'C':  ([G4, C5, E5, C5, G5, E5, C5], [G4, C5, E5, G5, E5, D5, B4]),  # D5, B4 (couleur maj7) → retour Em
}


def empty(bars):
    n = bars * BAR
    d = {k: {'steps': [0] * n} for k in DRUM_IDS}
    d.update({k: {'events': []} for k in INST_IDS})
    return d


def hit(d, track, step, vel):
    d[track]['steps'][step] = round(vel, 2)


def note(d, track, step, length, notes, vel, chord=None):
    ev = {'step': step, 'len': length, 'notes': notes if isinstance(notes, list) else [notes], 'vel': round(vel, 2)}
    if chord:
        ev['chord'] = chord
    d[track]['events'].append(ev)


# ------------------------------------------------------------------ briques rythmiques
def kick(d, start_bar, end_bar):
    for s in range(start_bar * BAR, end_bar * BAR, 4):
        hit(d, 'kick', s, 0.95 if s % 16 == 0 else 0.88)


def clap(d, start_bar, end_bar):
    for b in range(start_bar, end_bar):
        for o in (4, 12):
            hit(d, 'clap', b * BAR + o, 0.75)


def offbeat_ohat(d, start_bar, end_bar):
    for b in range(start_bar, end_bar):
        for o in (2, 6, 10, 14):
            hit(d, 'ohat', b * BAR + o, 0.6)


def hats16(d, start_bar, end_bar):
    """Charleston fermée en doubles-croches, accents sur les croches, sauf sous l'open hat."""
    for s in range(start_bar * BAR, end_bar * BAR):
        if s % 4 == 2:
            continue
        hit(d, 'hat', s, 0.6 if s % 4 == 0 else 0.35)


def ride(d, start_bar, end_bar):
    for s in range(start_bar * BAR, end_bar * BAR, 4):
        hit(d, 'ride', s, 0.5)


def snare_roll(d, start_bar, bars=2):
    """Roulement qui accélère : noires → croches → doubles-croches, crescendo."""
    s0, n = start_bar * BAR, bars * BAR
    steps = [s for s in range(s0, s0 + n // 2, 4)] + [s for s in range(s0 + n // 2, s0 + 3 * n // 4, 2)] + list(range(s0 + 3 * n // 4, s0 + n))
    for i, s in enumerate(steps):
        hit(d, 'snare', s, 0.3 + 0.65 * i / (len(steps) - 1))


def riser(d, start_bar, bars, vel=0.7):
    note(d, 'riser', start_bar * BAR, bars * BAR, E5, vel)


# ------------------------------------------------------------------ briques harmoniques
def pad(d, progression, vel=0.5, bars_each=2):
    for i, (_, ctype, voicing, _, _) in enumerate(progression):
        note(d, 'pad', i * bars_each * BAR, bars_each * BAR, voicing, vel, ctype)


def bass_offbeat(d, progression, start_bar=0, bars_each=2):
    """Basse sur les contretemps de croche (cases 2, 6, 10, 14) : laisse la place au kick."""
    for i, (_, _, _, root, _) in enumerate(progression):
        for b in range(bars_each):
            bar = i * bars_each + b
            if bar < start_bar:
                continue
            for o in (2, 6, 10, 14):
                note(d, 'bass', bar * BAR + o, 2, root, 0.9)


def bass_rolling(d, progression, bars_each=2):
    """Basse « roulante » : 3 doubles-croches après chaque kick (cases 1, 2, 3 de chaque temps), octave sur la 2e."""
    for i, (_, _, _, root, _) in enumerate(progression):
        for b in range(bars_each):
            for beat in range(4):
                s = (i * bars_each + b) * BAR + beat * 4
                note(d, 'bass', s + 1, 1, root, 0.7)
                note(d, 'bass', s + 2, 1, root + 12, 0.9)
                note(d, 'bass', s + 3, 1, root, 0.7)


def piano_riff(d, progression, vel=0.7, left_hand=True, bars_each=2):
    for i, (name, _, _, _, lh) in enumerate(progression):
        for b in range(bars_each):
            s0 = (i * bars_each + b) * BAR
            for step, n in zip(RIFF_STEPS, RIFF[name][b % 2]):
                note(d, 'piano', s0 + step, 2, n, vel + (0.08 if step in (0, 8) else 0))
            if left_hand:
                note(d, 'piano', s0, BAR, lh, vel * 0.7)


def piano_break(d):
    """Break : accords tenus (mêmes voicings que la nappe, une octave plus haut), une blanche par accord."""
    for i, (_, ctype, voicing, _, _) in enumerate(BREAK):
        for half in range(4):
            note(d, 'piano', i * 2 * BAR + half * 8, 8, [n + 12 for n in voicing], 0.55 if half % 2 == 0 else 0.45)


def arp(d, progression, vel=0.5, bars_each=2):
    for i, (_, ctype, voicing, _, _) in enumerate(progression):
        note(d, 'arp', i * bars_each * BAR, bars_each * BAR, [n + 24 for n in voicing], vel, ctype)


def melody(d, track, notes, vel=0.8):
    for s, l, n in notes:
        note(d, track, s, l, n, vel + (0.05 if s % 8 == 0 else 0))


# Cordes du break, sur Em | C | Am | B7 : notes longues, chaque début d'accord sur une note de l'accord.
# La fin D♯5 → F♯5 (tierce et quinte de B7) crée l'attente de Mi mineur au retour du thème.
BREAK_STRINGS = [
    (0, 24, B4), (24, 8, D5),                 # Em : B (quinte), D (passage)
    (32, 24, E5), (56, 8, D5),                # C : E (tierce), D (passage)
    (64, 16, C5), (80, 8, B4), (88, 8, A4),   # Am : C (tierce), B (passage), A (fondamentale)
    (96, 16, B4), (112, 8, Ds5), (120, 8, Fs5),  # B7 : B, D♯ (sensible de Mi), F♯
]

# Lead de l'« Envol », sur Em | G | D | C (8 mesures).
LEAD = [
    (0, 6, G5), (6, 2, Fs5), (8, 8, E5), (16, 8, B4), (24, 4, E5), (28, 4, Fs5),   # Em
    (32, 12, G5), (44, 4, A5), (48, 12, B5), (60, 4, A5),                          # G (A : passage)
    (64, 12, Fs5), (76, 4, E5), (80, 8, D5), (88, 8, Fs5),                         # D (E : passage)
    (96, 16, E5), (112, 8, G5), (120, 4, E5), (124, 4, Fs5),                       # C → F♯ relance vers G5
]


# ------------------------------------------------------------------ scènes
def intro():
    d = empty(8)
    pad(d, THEME, vel=0.4)
    piano_riff(d, THEME, vel=0.55, left_hand=False)
    riser(d, 6, 2, vel=0.5)
    return 'Intro', 8, d


def montee():
    d = empty(8)
    hit(d, 'crash', 0, 0.6)
    kick(d, 0, 8)
    offbeat_ohat(d, 4, 8)
    clap(d, 4, 7)
    pad(d, THEME, vel=0.45)
    piano_riff(d, THEME, vel=0.62)
    bass_offbeat(d, THEME, start_bar=4)
    snare_roll(d, 7, 1)
    return 'Montée', 8, d


def theme():
    d = empty(8)
    hit(d, 'crash', 0, 0.8)
    kick(d, 0, 8)
    clap(d, 0, 8)
    offbeat_ohat(d, 0, 8)
    hats16(d, 0, 8)
    pad(d, THEME, vel=0.5)
    piano_riff(d, THEME, vel=0.7)
    bass_offbeat(d, THEME)
    return 'Thème', 8, d


def break_():
    d = empty(8)
    hit(d, 'crash', 0, 0.7)
    pad(d, BREAK, vel=0.55)
    piano_break(d)
    melody(d, 'strings', BREAK_STRINGS, vel=0.7)
    # le kick revient en noires sur les 2 dernières mesures, sous le roulement
    kick(d, 6, 8)
    snare_roll(d, 6, 2)
    riser(d, 4, 4, vel=0.8)
    return 'Break', 8, d


def envol():
    d = empty(8)
    hit(d, 'crash', 0, 0.85)
    kick(d, 0, 8)
    clap(d, 0, 8)
    offbeat_ohat(d, 0, 8)
    hats16(d, 0, 8)
    ride(d, 0, 8)
    pad(d, THEME, vel=0.55)
    piano_riff(d, THEME, vel=0.72)
    arp(d, THEME, vel=0.45)
    bass_rolling(d, THEME)
    melody(d, 'lead', LEAD)
    return 'Envol', 8, d


def outro():
    d = empty(8)
    hit(d, 'crash', 0, 0.7)
    kick(d, 0, 4)
    offbeat_ohat(d, 0, 4)
    bass_offbeat(d, THEME[:2])
    pad(d, THEME, vel=0.45)
    piano_riff(d, THEME[:2], vel=0.6)
    # fin : le riff s'arrête, le piano tient Mi mineur (E–G–B) et la nappe se résout sur Em
    d['pad']['events'][-2:] = []
    note(d, 'pad', 64, 64, EM[2], 0.45, 'min')
    note(d, 'piano', 64, 64, [E4, G4, B4, E5], 0.6)
    note(d, 'piano', 64, 64, E3, 0.45)
    return 'Outro', 8, d


# ------------------------------------------------------------------ mixage (console)
def eq(hp=None, low=None, lm=None, hm=None, high=None):
    """EQ : hp = fréquence du passe-haut ; low/high = (f, gain) ; lm/hm = (f, gain, Q)."""
    e = {'on': True, 'hp': {'on': hp is not None, 'f': hp or 40},
         'low': {'f': 100, 'g': 0}, 'lm': {'f': 400, 'g': 0, 'q': 1}, 'hm': {'f': 2500, 'g': 0, 'q': 1}, 'high': {'f': 8000, 'g': 0}}
    if low: e['low'] = {'f': low[0], 'g': low[1]}
    if lm: e['lm'] = {'f': lm[0], 'g': lm[1], 'q': lm[2]}
    if hm: e['hm'] = {'f': hm[0], 'g': hm[1], 'q': hm[2]}
    if high: e['high'] = {'f': high[0], 'g': high[1]}
    return e


def comp(th, ratio, att, rel, knee=6, makeup=0):
    return {'on': True, 'th': th, 'ratio': ratio, 'att': att, 'rel': rel, 'knee': knee, 'makeup': makeup}


OFF_COMP = {'on': False, 'th': -18, 'ratio': 3, 'att': 0.01, 'rel': 0.15, 'knee': 6, 'makeup': 0}
OFF_LIM = {'on': False, 'ceil': -1, 'rel': 0.1}

MIX = {
    'kick': dict(eq=eq(hp=28, low=(55, 1.5), lm=(300, -3.5, 1.2), hm=(4000, 2, 1)), comp=comp(-14, 3, 0.012, 0.08, 3, 1.5), volume=0.8),
    'clap': dict(eq=eq(hp=200, hm=(2500, 1.5, 1), high=(9000, 2)), pan=0.05, volume=0.4),
    'snare': dict(eq=eq(hp=150, hm=(5000, 2, 0.8)), volume=0.48),
    'hat': dict(eq=eq(hp=450, high=(11000, 2)), pan=0.28, volume=0.3),
    'ohat': dict(eq=eq(hp=400, high=(10000, 1.5)), pan=-0.22, volume=0.32),
    'ride': dict(eq=eq(hp=500, high=(12000, 1)), pan=0.4, volume=0.2),
    'crash': dict(eq=eq(hp=350, high=(12000, 1)), pan=-0.15, volume=0.32),
    'bass': dict(eq=eq(hp=30, lm=(250, -3, 1), hm=(1000, 1.5, 1)), comp=comp(-20, 4, 0.004, 0.08, 6, 2), volume=0.55,
                 sc=dict(depth=0.5, release=0.12)),
    # nappe et piano : grave retiré (place à la basse et au kick), pompe sidechain sur la nappe
    'pad': dict(eq=eq(hp=200, lm=(600, -2.5, 0.8), high=(9000, 2)), volume=0.3, sc=dict(depth=0.6, release=0.24)),
    'piano': dict(eq=eq(hp=120, lm=(350, -2, 1), hm=(2800, 1.5, 0.9), high=(10000, 1.5)), comp=comp(-18, 2.5, 0.008, 0.12, 6, 1.5),
                  pan=-0.08, volume=0.5, sc=dict(depth=0.2, release=0.15)),
    'arp': dict(eq=eq(hp=400, lm=(900, -2, 1), high=(10000, 2)), pan=0.4, volume=0.18, sc=dict(depth=0.35, release=0.14)),
    'strings': dict(eq=eq(hp=180, lm=(500, -1.5, 1), high=(9000, 1.5)), pan=0.1, volume=0.42),
    'lead': dict(eq=eq(hp=180, lm=(700, -2, 1), hm=(3000, 1.5, 0.9), high=(10000, 1)), comp=comp(-18, 2.5, 0.01, 0.15, 6, 1.5),
                 pan=0.05, volume=0.3, sc=dict(depth=0.25, release=0.15)),
    'riser': dict(eq=eq(hp=300), volume=0.22),
}

MASTER = {
    'volume': 1.0,
    'mix': {
        'pan': 0,
        'eq': eq(hp=25, low=(70, -2), lm=(600, -1.5, 0.7), hm=(2000, 1, 0.7), high=(11000, 2)),
        'comp': comp(-16, 2, 0.03, 0.2, 6, 2),
        'lim': {'on': True, 'ceil': -2.0, 'rel': 0.06},
    },
}


def apply_mix(tracks, tid):
    for key, m in MIX.items():
        t = next(x for x in tracks if x['id'] == tid[key])
        t['volume'] = m['volume']
        t['mix'] = {'pan': m.get('pan', 0), 'eq': m['eq'], 'comp': m.get('comp', OFF_COMP), 'lim': m.get('lim', OFF_LIM)}
        if 'sc' in m:
            fx = dict(t.get('fx') or {})
            fx.update({'scSource': tid['kick'], 'scDepth': m['sc']['depth'], 'scRelease': m['sc']['release']})
            t['fx'] = fx


# ------------------------------------------------------------------ projet
def build():
    tid = {}
    tracks = []
    for key, name, color, machine, sound, variant, volume, fx in TRACKS:
        tid[key] = 'td_' + key
        t = {'id': tid[key], 'type': 'drum', 'name': name, 'color': color, 'volume': volume, 'mute': False, 'solo': False,
             'source': 'tdm', 'machine': machine, 'sound': sound, 'variant': variant, 'steps': []}
        if fx:
            t['fx'] = fx
        tracks.append(t)
    for key, o in INSTR.items():
        tid[key] = 'ti_' + key
        t = {'id': tid[key], 'type': 'instrument', 'name': o['name'], 'color': o['color'], 'volume': o['volume'],
             'mute': False, 'solo': False, 'category': o['category'], 'family': o['family'], 'instrument': o['instrument'],
             'sfv': 0, 'chord': 'min', 'arp': o.get('arp', {'mode': 'up', 'rate': 1, 'octaves': 1}),
             'octave': o['octave'], 'events': []}
        for k in ('sd', 'fx'):
            if k in o:
                t[k] = o[k]
        tracks.append(t)

    if MIXED:
        apply_mix(tracks, tid)

    scenes = []
    for fn in (intro, montee, theme, break_, envol, outro):
        name, bars, d = fn()
        sid = 'sc_' + name.lower().replace('é', 'e').replace('è', 'e')
        scenes.append({'id': sid, 'name': name, 'bars': bars, 'data': {tid[k]: v for k, v in d.items()}})
    by = {sc['name']: sc for sc in scenes}

    # scène ouverte à l'ouverture du fichier : l'Envol (son contenu est aussi dans les pistes)
    current = by['Envol']
    for t in tracks:
        t.update(current['data'][t['id']])

    song = [('Intro', 1), ('Montée', 1), ('Thème', 2), ('Break', 1), ('Envol', 2), ('Outro', 1)]
    return {
        'format': 'stepseq', 'version': 2,
        'title': 'Rêve éveillé',
        'key': {'tonic': 'E', 'mode': 'minor'},  # tonalité (fenêtre Harmonie)
        'tempo': 136, 'timeSig': [4, 4], 'bars': current['bars'],
        'groove': {'res': 16, 'swing': 0.5, 'human': 0.04},
        'tracks': tracks,
        'scenes': scenes,
        'current': current['id'],
        'song': [{'scene': by[n]['id'], 'repeat': r} for n, r in song],
        'playMode': 'song',
        'songLoop': False,
        **({'master': MASTER} if MIXED else {}),
    }


MIXED = True  # False : version brute, sans mixage ni mastering (option --brut)

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if '--brut' in sys.argv:
        MIXED = False
    out = args[0] if args else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'reve-eveille.stepseq.json')
    project = build()
    with open(out, 'w') as f:
        json.dump(project, f, ensure_ascii=False, indent=1)
    bars = sum(next(sc['bars'] for sc in project['scenes'] if sc['id'] == b['scene']) * b['repeat'] for b in project['song'])
    print(out, len(project['tracks']), 'pistes,', len(project['scenes']), 'scènes,', bars, 'mesures,',
          '%.0f s' % (bars * 4 * 60 / project['tempo']))
