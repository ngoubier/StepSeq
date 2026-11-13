"""
« Autoroute de minuit » : morceau original, synthwave, Ré mineur, 104 BPM.
Toutes les parties mélodiques et harmoniques sont jouées par des Roland Juno-106 émulés (pistes « Synthé ») :
basse, nappe, arpège, cuivres et lead, chacun avec son patch d'usine et quelques réglages de façade.
Batterie : Oberheim DMX, toms Simmons SDS-5.

Forme (mode chanson, 72 mesures) :
  Intro (8) · Couplet (8) · Refrain (8) · Couplet 2 (8) · Refrain · Pont (8) · Refrain ×2 · Outro (8)

Harmonie (Ré mineur naturel : D E F G A B♭ C) :
  Couplet : Dm | B♭ | F | C                    i – VI – III – VII        (1 mesure par accord, ×2)
  Refrain : B♭ | C | F | Dm | B♭ | C | A7 | Dm   VI – VII – III – i – VI – VII – V7 – i
            A7 = A–C♯–E–G : le C♯ (sensible) vient du mineur harmonique.
  Pont    : Gm | B♭ | Gm | A                     iv – VI – iv – V          (2 mesures par accord)

Usage : python3 autoroute-de-minuit.compose.py [fichier de sortie] [--brut]   (--brut : sans mixage ni mastering)
"""
import json
import os
import sys

BAR = 16  # une case = une double-croche

# ------------------------------------------------------------------ notes (MIDI, Do4 = 60)
C2, D2, F2, G2, A2, Bb2 = 36, 38, 41, 43, 45, 46
G3, A3, Bb3 = 55, 57, 58
C4, Cs4, D4, E4, F4, G4, A4, Bb4 = 60, 61, 62, 64, 65, 67, 69, 70
C5, Cs5, D5, E5, F5, G5, A5 = 72, 73, 74, 76, 77, 79, 81

# Accords : nom, type, voicing (nappe), fondamentale de la basse.
# Voicings proches (voice leading) : Dm A3–D4–F4 → B♭ B♭3–D4–F4 → F A3–C4–F4 → C G3–C4–E4
DM = ('Dm', 'min', [A3, D4, F4], D2)
BB = ('B♭', 'maj', [Bb3, D4, F4], Bb2)
FM = ('F', 'maj', [A3, C4, F4], F2)
CM = ('C', 'maj', [G3, C4, E4], C2)
A7 = ('A7', '7', [A3, Cs4, E4, G4], A2)
GM = ('Gm', 'min', [Bb3, D4, G4], G2)
AM = ('A', 'maj', [A3, Cs4, E4], A2)

COUPLET = [DM, BB, FM, CM, DM, BB, FM, CM]
REFRAIN = [BB, CM, FM, DM, BB, CM, A7, DM]
PONT = [GM, GM, BB, BB, GM, GM, AM, AM]  # une entrée par mesure

# ------------------------------------------------------------------ pistes
TRACKS = [
    # id, nom, couleur, machine, son, variante, volume, effets
    ('kick', 'Kick DMX', '#e3179c', 'OberheimDMX', 'bd', 0, 0.75, None),
    # caisse claire « années 80 » : grande réverbération sombre
    ('snare', 'Snare DMX', '#ff4d6d', 'OberheimDMX', 'sd', 1, 0.58, {'room': 0.45, 'roomSize': 2.2, 'roomLp': 7000}),
    ('clap', 'Clap DMX', '#f08a00', 'OberheimDMX', 'cp', 0, 0.38, {'room': 0.35, 'roomSize': 2}),
    ('hat', 'Hi-Hat DMX', '#f5c400', 'OberheimDMX', 'hh', 0, 0.36, None),
    ('ohat', 'Open Hat DMX', '#c9a227', 'OberheimDMX', 'oh', 0, 0.3, None),
    ('tomhi', 'Tom Simmons aigu', '#13c2a3', 'SimmonsSDS5', 'ht', 1, 0.46, {'room': 0.4, 'roomSize': 2}),
    ('tomlo', 'Tom Simmons grave', '#0f9e85', 'SimmonsSDS5', 'lt', 2, 0.5, {'room': 0.4, 'roomSize': 2}),
    ('crash', 'Crash DMX', '#c0c0c0', 'OberheimDMX', 'cr', 0, 0.34, None),
]
# Pistes Juno-106 : patch d'usine + réglages de façade modifiés (juno). range 8 = pied 8' (hauteur écrite).
JUNO = {
    'bass': dict(name='Basse Juno', color='#3fcf3f', category='mono', patch='A48', volume=0.6,
                 juno={'range': 8, 'sub': 0.85, 'vcfFreq': 0.3, 'vcfEnv': 0.45, 'decay': 0.3, 'chorus': 0}),
    'pad': dict(name='Nappe Juno', color='#1ea7ff', category='chord', patch='A15', volume=0.36,
                juno={'attack': 0.3, 'release': 0.45, 'vcaLevel': 0.45},
                fx={'room': 0.4, 'roomSize': 3, 'roomLp': 6500}),
    'arp': dict(name='Arpège Juno', color='#9b5cff', category='arp', patch='B24', volume=0.26,
                arp={'mode': 'up', 'rate': 1, 'octaves': 2}, juno={'chorus': 1, 'release': 0.2},
                fx={'delay': 0.3, 'delayTime': '3/16', 'delayFeedback': 0.35, 'room': 0.25, 'roomSize': 1.8}),
    'brass': dict(name='Cuivres Juno', color='#f08a00', category='chord', patch='A11', volume=0.3,
                  juno={'range': 8, 'chorus': 2}, fx={'room': 0.3, 'roomSize': 2.4}),
    'lead': dict(name='Lead Juno', color='#ff4d6d', category='mono', patch='A53', volume=0.42,
                 juno={'chorus': 1, 'lfoRate': 0.55, 'lfoDelay': 0.5, 'dcoLfo': 0.08, 'release': 0.3},
                 fx={'delay': 0.32, 'delayTime': '3/16', 'delayFeedback': 0.42, 'room': 0.35, 'roomSize': 2.6, 'roomLp': 8000}),
}
DRUM_IDS = [t[0] for t in TRACKS]
INST_IDS = list(JUNO)


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


# ------------------------------------------------------------------ batterie
def rock_beat(d, start_bar, end_bar):
    """Couplet : kick sur 1, 3 et le « et » de 3 ; caisse claire sur 2 et 4 ; charleston en croches."""
    for b in range(start_bar, end_bar):
        s = b * BAR
        for o, v in ((0, 0.95), (8, 0.85), (10, 0.7)):
            hit(d, 'kick', s + o, v)
        for o in (4, 12):
            hit(d, 'snare', s + o, 0.9)
        for o in range(0, 16, 2):
            hit(d, 'hat', s + o, 0.6 if o % 4 == 0 else 0.42)


def drive_beat(d, start_bar, end_bar):
    """Refrain : kick en noires, caisse claire + clap sur 2 et 4, charleston en croches, open hat sur le dernier contretemps."""
    for b in range(start_bar, end_bar):
        s = b * BAR
        for o in range(0, 16, 4):
            hit(d, 'kick', s + o, 0.95 if o == 0 else 0.86)
        for o in (4, 12):
            hit(d, 'snare', s + o, 0.95)
            hit(d, 'clap', s + o, 0.6)
        for o in range(0, 14, 2):
            hit(d, 'hat', s + o, 0.6 if o % 4 == 0 else 0.45)
        hit(d, 'ohat', s + 14, 0.5)


def tom_fill(d, bar):
    """Roulement de toms Simmons sur la seconde moitié de la mesure `bar`."""
    s = bar * BAR
    for o in range(8, 16):  # la batterie s'efface sous le roulement
        for tr in ('kick', 'snare', 'clap', 'hat', 'ohat'):
            d[tr]['steps'][s + o] = 0
    for o, v in ((8, 0.75), (9, 0.6), (10, 0.8)):
        hit(d, 'tomhi', s + o, v)
    for o, v in ((11, 0.6), (12, 0.85), (13, 0.7), (14, 0.9), (15, 0.95)):
        hit(d, 'tomlo', s + o, v)


def snare_build(d, bar):
    """Montée : caisse claire en doubles-croches, crescendo, sur une mesure."""
    s = bar * BAR
    for o in range(16):
        hit(d, 'snare', s + o, 0.35 + 0.04 * o)


# ------------------------------------------------------------------ parties Juno
def pad(d, progression, vel=0.5, track='pad', up=0):
    for i, (_, ctype, voicing, _) in enumerate(progression):
        note(d, track, i * BAR, BAR, [n + up for n in voicing], vel, ctype)


def brass_stabs(d, progression, vel=0.6):
    """Cuivres une octave au-dessus de la nappe, syncopés : temps 1 (noire pointée) et « et » de 3."""
    for i, (_, ctype, voicing, _) in enumerate(progression):
        s = i * BAR
        notes = [n + 12 for n in voicing]
        note(d, 'brass', s, 5, notes, vel, ctype)
        note(d, 'brass', s + 10, 6, notes, vel - 0.08, ctype)


def arp(d, progression, vel=0.5):
    for i, (_, ctype, voicing, _) in enumerate(progression):
        note(d, 'arp', i * BAR, BAR, [n + 12 for n in voicing], vel, ctype)


def bass_eighths(d, progression):
    """Croches sur la fondamentale, accent sur les temps."""
    for i, (_, _, _, root) in enumerate(progression):
        for o in range(0, 16, 2):
            note(d, 'bass', i * BAR + o, 2, root, 0.9 if o % 4 == 0 else 0.72)


def bass_gallop(d, progression):
    """« Galop » : 1 – (rien) – et – a sur chaque temps, octave sur le dernier temps."""
    for i, (_, _, _, root) in enumerate(progression):
        for beat in range(4):
            s = i * BAR + beat * 4
            n = root + 12 if beat == 3 else root
            note(d, 'bass', s, 2, n, 0.92)
            note(d, 'bass', s + 2, 1, n, 0.7)
            note(d, 'bass', s + 3, 1, n, 0.78)


def bass_long(d, progression):
    for i, (_, _, _, root) in enumerate(progression):
        note(d, 'bass', i * BAR, BAR, root, 0.75)


def melody(d, notes, vel=0.8):
    for s, l, n in notes:
        note(d, 'lead', s, l, n, vel + (0.06 if s % 8 == 0 else 0))


# Lead du couplet, sur Dm | B♭ | F | C ×2 : registre moyen, chaque temps fort sur une note de l'accord.
COUPLET_LEAD = [
    (0, 4, A4), (4, 4, F4), (8, 6, D4), (14, 2, E4),       # Dm (E : passage)
    (16, 4, F4), (20, 4, D4), (24, 8, F4),                 # B♭
    (32, 4, A4), (36, 4, C5), (40, 6, A4), (46, 2, G4),    # F (G : passage)
    (48, 12, G4), (60, 4, E4),                             # C
    (64, 4, A4), (68, 4, F4), (72, 6, D5), (78, 2, C5),    # Dm (C : passage)
    (80, 4, Bb4), (84, 4, D5), (88, 8, F5),                # B♭ : la phrase monte
    (96, 4, F5), (100, 4, C5), (104, 8, A4),               # F
    (112, 8, G4), (120, 4, E4), (124, 4, G4),              # C
]
# Lead du refrain, sur B♭ | C | F | Dm | B♭ | C | A7 | Dm : plus aigu, notes plus longues.
REFRAIN_LEAD = [
    (0, 6, D5), (6, 2, C5), (8, 8, D5),                    # B♭ (C : passage)
    (16, 4, E5), (20, 4, G5), (24, 6, E5), (30, 2, D5),    # C (D : passage)
    (32, 8, C5), (40, 4, A4), (44, 4, C5),                 # F
    (48, 8, D5), (56, 4, F5), (60, 4, E5),                 # Dm (E : passage)
    (64, 6, F5), (70, 2, E5), (72, 8, D5),                 # B♭ (E : passage)
    (80, 4, G5), (84, 4, E5), (88, 8, G5),                 # C
    (96, 6, A5), (102, 2, G5), (104, 4, E5), (108, 4, Cs5),  # A7 : C♯ = sensible
    (112, 16, D5),                                          # Dm : résolution sur la tonique
]


# ------------------------------------------------------------------ scènes
def intro():
    d = empty(8)
    pad(d, COUPLET, vel=0.45)
    arp(d, COUPLET, vel=0.4)
    d['arp']['events'] = [e for e in d['arp']['events'] if e['step'] >= 4 * BAR]  # l'arpège entre à la mesure 5
    for b in range(4, 8):
        hit(d, 'kick', b * BAR, 0.85)
        hit(d, 'kick', b * BAR + 8, 0.75)
    snare_build(d, 7)
    return 'Intro', 8, d


def couplet(with_arp=False):
    d = empty(8)
    hit(d, 'crash', 0, 0.75)
    rock_beat(d, 0, 8)
    tom_fill(d, 7)
    bass_eighths(d, COUPLET)
    pad(d, COUPLET, vel=0.42)
    melody(d, COUPLET_LEAD, vel=0.72)
    if with_arp:
        arp(d, COUPLET, vel=0.38)
    return ('Couplet 2' if with_arp else 'Couplet'), 8, d


def refrain():
    d = empty(8)
    hit(d, 'crash', 0, 0.85)
    hit(d, 'crash', 64, 0.65)
    drive_beat(d, 0, 8)
    tom_fill(d, 7)
    bass_gallop(d, REFRAIN)
    pad(d, REFRAIN, vel=0.5)
    brass_stabs(d, REFRAIN, vel=0.6)
    arp(d, REFRAIN, vel=0.42)
    melody(d, REFRAIN_LEAD, vel=0.8)
    return 'Refrain', 8, d


def pont():
    """Pont : la batterie se retire, les cuivres tiennent, la tension monte jusqu'à l'accord de A (V)."""
    d = empty(8)
    hit(d, 'crash', 0, 0.6)
    for b in range(0, 6):
        hit(d, 'kick', b * BAR, 0.85)
        hit(d, 'snare', b * BAR + 12, 0.7)
    for b in range(6, 8):
        for o in range(0, 16, 4):
            hit(d, 'kick', b * BAR + o, 0.88)
    snare_build(d, 7)
    bass_long(d, PONT)
    pad(d, PONT, vel=0.55)
    arp(d, PONT, vel=0.45)
    # cuivres tenus, deux mesures par accord, crescendo
    for i in range(0, 8, 2):
        _, ctype, voicing, _ = PONT[i]
        note(d, 'brass', i * BAR, 2 * BAR, [n + 12 for n in voicing], 0.45 + 0.05 * i, ctype)
    # lead en notes longues : D (Gm) – F (B♭) – G (Gm) – E puis C♯ (A) → la sensible C♯ appelle D au retour du refrain
    melody(d, [(0, 32, D5), (32, 32, F5), (64, 32, G5), (96, 16, E5), (112, 16, Cs5)], vel=0.7)
    return 'Pont', 8, d


def outro():
    d = empty(8)
    hit(d, 'crash', 0, 0.75)
    rock_beat(d, 0, 4)
    bass_eighths(d, COUPLET[:4])
    pad(d, COUPLET[:4], vel=0.45)
    arp(d, COUPLET[:4], vel=0.4)
    melody(d, COUPLET_LEAD[:13], vel=0.65)
    # fin : Ré mineur tenu (nappe, cuivres, basse), dernier coup de crash
    hit(d, 'crash', 64, 0.6)
    hit(d, 'kick', 64, 0.85)
    note(d, 'pad', 64, 64, DM[2], 0.5, 'min')
    note(d, 'brass', 64, 32, [n + 12 for n in DM[2]], 0.45, 'min')
    note(d, 'bass', 64, 32, D2, 0.75)
    note(d, 'lead', 64, 48, D5, 0.65)
    return 'Outro', 8, d


# ------------------------------------------------------------------ mixage (console)
def eq(hp=None, low=None, lm=None, hm=None, high=None):
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
    'kick': dict(eq=eq(hp=30, low=(60, 1), lm=(350, -3, 1.2), hm=(3500, 2, 1)), comp=comp(-14, 3, 0.012, 0.08, 3, 1.5), volume=0.78),
    'snare': dict(eq=eq(hp=120, lm=(450, -2, 1), hm=(5000, 2.5, 0.8), high=(10000, 1.5)), comp=comp(-16, 3, 0.005, 0.12, 4, 1.5), volume=0.56),
    'clap': dict(eq=eq(hp=220, high=(9000, 2)), pan=0.06, volume=0.36),
    'hat': dict(eq=eq(hp=400, high=(10000, 2)), pan=0.3, volume=0.34),
    'ohat': dict(eq=eq(hp=350, high=(11000, 1.5)), pan=-0.3, volume=0.28),
    'tomhi': dict(eq=eq(hp=90, lm=(500, -2, 1)), pan=-0.35, volume=0.46),
    'tomlo': dict(eq=eq(hp=60, lm=(400, -2, 1)), pan=0.3, volume=0.5),
    'crash': dict(eq=eq(hp=350, high=(12000, 1)), pan=-0.12, volume=0.32),
    'bass': dict(eq=eq(hp=30, lm=(250, -3, 1), hm=(1100, 2, 1)), comp=comp(-20, 4, 0.004, 0.1, 6, 2), volume=0.58,
                 sc=dict(depth=0.35, release=0.12)),
    'pad': dict(eq=eq(hp=180, lm=(650, -2.5, 0.8), high=(9000, 2)), volume=0.36, sc=dict(depth=0.4, release=0.22)),
    'arp': dict(eq=eq(hp=280, lm=(800, -2, 1), high=(9000, 1.5)), pan=0.38, volume=0.26, sc=dict(depth=0.25, release=0.15)),
    'brass': dict(eq=eq(hp=220, lm=(600, -2, 1), hm=(2500, 1, 1)), pan=-0.25, volume=0.3),
    'lead': dict(eq=eq(hp=160, lm=(800, -2, 1), hm=(3000, 1.5, 0.9), high=(10000, 1)), comp=comp(-18, 2.5, 0.01, 0.15, 6, 1.5),
                 pan=0.04, volume=0.42),
}

MASTER = {
    'volume': 1.0,
    'mix': {
        'pan': 0,
        'eq': eq(hp=25, low=(70, -2), lm=(700, -1.5, 0.7), hm=(1800, 1, 0.7), high=(11000, 2.5)),
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
    for key, o in JUNO.items():
        tid[key] = 'ti_' + key
        t = {'id': tid[key], 'type': 'instrument', 'name': o['name'], 'color': o['color'], 'volume': o['volume'],
             'mute': False, 'solo': False, 'category': o['category'], 'family': 'analog', 'instrument': 'juno106',
             'junoPatch': o['patch'], 'juno': o['juno'],
             'sfv': 0, 'chord': 'min', 'arp': o.get('arp', {'mode': 'up', 'rate': 1, 'octaves': 1}),
             'octave': 3, 'events': []}
        if 'fx' in o:
            t['fx'] = o['fx']
        tracks.append(t)

    if MIXED:
        apply_mix(tracks, tid)

    scenes = []
    for fn in (intro, couplet, lambda: couplet(True), refrain, pont, outro):
        name, bars, d = fn()
        sid = 'sc_' + name.lower().replace(' ', '')
        scenes.append({'id': sid, 'name': name, 'bars': bars, 'data': {tid[k]: v for k, v in d.items()}})
    by = {sc['name']: sc for sc in scenes}

    current = by['Refrain']
    for t in tracks:
        t.update(current['data'][t['id']])

    song = [('Intro', 1), ('Couplet', 1), ('Refrain', 1), ('Couplet 2', 1), ('Refrain', 1), ('Pont', 1), ('Refrain', 2), ('Outro', 1)]
    return {
        'format': 'stepseq', 'version': 2,
        'title': 'Autoroute de minuit',
        'key': {'tonic': 'D', 'mode': 'minor'},  # tonalité (fenêtre Harmonie)
        'tempo': 104, 'timeSig': [4, 4], 'bars': current['bars'],
        'groove': {'res': 16, 'swing': 0.5, 'human': 0.06},
        'tracks': tracks,
        'scenes': scenes,
        'current': current['id'],
        'song': [{'scene': by[n]['id'], 'repeat': r} for n, r in song],
        'playMode': 'song',
        'songLoop': False,
        **({'master': MASTER} if MIXED else {}),
    }


MIXED = True

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if '--brut' in sys.argv:
        MIXED = False
    out = args[0] if args else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'autoroute-de-minuit.stepseq.json')
    project = build()
    with open(out, 'w') as f:
        json.dump(project, f, ensure_ascii=False, indent=1)
    bars = sum(next(sc['bars'] for sc in project['scenes'] if sc['id'] == b['scene']) * b['repeat'] for b in project['song'])
    print(out, len(project['tracks']), 'pistes,', len(project['scenes']), 'scènes,', bars, 'mesures,',
          '%.0f s' % (bars * 4 * 60 / project['tempo']))
