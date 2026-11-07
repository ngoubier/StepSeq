"""
« Envol » : morceau original, techno mélodique / dream house des années 90, Sol mineur, 138 BPM.
Un riff de piano en rythme 3-3-2, des nappes, une basse roulante pompée par le kick (sidechain),
deux montées (roulement de caisse claire qui accélère, riser de bruit, coupure avant le drop)
et deux drops (crash + impact sub, supersaw qui double le piano).

Génère un projet StepSeq complet en mode chanson :
  Intro (8) · Groove (8) · Montée (8) · Drop (8 ×2) · Break (8) · Montée finale (8) · Drop final (8 ×2) · Outro (8)

Usage : python3 envol.compose.py [fichier de sortie] [--brut]   (--brut : sans mixage ni mastering ;
le sidechain de la basse sur le kick fait partie du son et reste actif dans les deux versions)
"""
import json
import os
import sys

BAR = 16

# Accords : (racine de la nappe, type, racine de la basse)
Gm = (55, 'min', 43)
Eb = (51, 'maj', 39)
Bb = (58, 'maj', 46)
F = (53, 'maj', 41)
Cm = (48, 'min', 36)
D = (50, 'maj', 38)
IV = {'min': [0, 3, 7], 'maj': [0, 4, 7], 'sus4': [0, 5, 7]}
PROG = [Gm, Eb, Bb, F]          # i – VI – III – VII, deux mesures chacun
PROG_TENSION = [Cm, Eb, F, D]   # montée finale : finit sur la dominante (Ré majeur) pour relancer Sol mineur

# ------------------------------------------------------------------ pistes (sons, effets)
TRACKS = [
    # id, nom, couleur, machine, son, variante, volume, effets
    ('kick', 'Kick 909', '#e3179c', 'RolandTR909', 'bd', 0, 0.85, None),
    ('clap', 'Clap 909', '#f08a00', 'RolandTR909', 'cp', 0, 0.5, {'room': 0.25, 'roomSize': 1.4, 'roomLp': 9000}),
    ('snare', 'Roulement', '#ff4d6d', 'RolandTR909', 'sd', 2, 0.5, {'room': 0.3, 'roomSize': 2.2, 'roomLp': 8000}),
    ('hat', 'Hi-Hat', '#f5c400', 'RolandTR909', 'hh', 0, 0.36, None),
    ('ohat', 'Open Hat', '#c9a227', 'RolandTR909', 'oh', 0, 0.36, None),
    ('ride', 'Ride', '#8fa3b8', 'RolandTR909', 'rd', 0, 0.26, None),
    ('crash', 'Crash', '#c0c0c0', 'RolandTR909', 'cr', 0, 0.42, {'room': 0.3, 'roomSize': 3, 'roomLp': 7000}),
]

# Le sidechain de la basse (et des nappes) sur le kick : la « pompe » de la techno mélodique.
SC_KICK = 'td_kick'
INSTR = {
    'bass': dict(name='Basse roulante', color='#3fcf3f', category='mono', family='bass', instrument='syn_sawbass', volume=0.6, octave=2,
                 sd={'cutoff': 420, 'q': 5, 'env': 2.2, 'decay': 0.1, 'sustain': 0.3, 'release': 0.04,
                     'fattack': 0.003, 'fdecay': 0.09, 'fsustain': 0.15, 'frelease': 0.04},
                 fx={'scSource': SC_KICK, 'scDepth': 0.75, 'scRelease': 0.17}),
    'impact': dict(name='Impact sub', color='#2a8f2a', category='mono', family='bass', instrument='syn_sub', volume=0.7, octave=1,
                   sd={'attack': 0.003, 'decay': 1.1, 'sustain': 0, 'release': 0.6, 'drive': 0.35}),
    'pad': dict(name='Nappe supersaw', color='#1ea7ff', category='chord', family='pads', instrument='syn_superpad', volume=0.3, octave=3,
                fx={'chorus': 0.3, 'chorusRate': 0.5, 'chorusDepth': 0.4, 'room': 0.4, 'roomSize': 3.5, 'roomLp': 6500,
                    'scSource': SC_KICK, 'scDepth': 0.55, 'scRelease': 0.25}),
    'piano': dict(name='Piano', color='#f2f2f2', category='mono', family='keys', instrument='piano', volume=0.5, octave=4,
                  fx={'delay': 0.18, 'delayTime': '3/16', 'delayFeedback': 0.3, 'room': 0.3, 'roomSize': 2.6, 'roomLp': 8000}),
    'lead': dict(name='Lead supersaw', color='#ff4d6d', category='mono', family='synth', instrument='syn_supersaw', volume=0.3, octave=4,
                 sd={'cutoff': 3200, 'q': 1, 'env': 0.8, 'attack': 0.005, 'decay': 0.3, 'sustain': 0.6, 'release': 0.15},
                 fx={'chorus': 0.25, 'delay': 0.25, 'delayTime': '3/16', 'delayFeedback': 0.35, 'room': 0.3, 'roomSize': 2.4, 'roomLp': 8000,
                     'scSource': SC_KICK, 'scDepth': 0.35, 'scRelease': 0.15}),
    'arp': dict(name='Arpège pluck', color='#9b5cff', category='arp', family='synth', instrument='syn_pluck', volume=0.22, octave=5,
                arp={'mode': 'updown', 'rate': 1, 'octaves': 2},
                fx={'delay': 0.3, 'delayTime': '3/16', 'delayFeedback': 0.4, 'room': 0.2, 'roomSize': 1.6,
                    'scSource': SC_KICK, 'scDepth': 0.3, 'scRelease': 0.15}),
    'choir': dict(name='Chœur', color='#ffb3e6', category='chord', family='voices', instrument='gm_synth_choir', volume=0.3, octave=4,
                  sd={'attack': 0.5, 'release': 1.2},
                  fx={'room': 0.45, 'roomSize': 4, 'roomLp': 6000, 'scSource': SC_KICK, 'scDepth': 0.4, 'scRelease': 0.25}),
    # riser : bruit blanc dont le volume et le filtre s'ouvrent sur toute la montée (8 mesures ≈ 13,9 s à 138 BPM)
    'riser': dict(name='Riser', color='#7fd4ff', category='mono', family='fx', instrument='syn_noiseriser', volume=0.3, octave=4,
                  sd={'cutoff': 180, 'q': 5, 'env': 6.2, 'attack': 12, 'decay': 0.3, 'sustain': 1, 'release': 0.05,
                      'fattack': 13.5, 'fdecay': 0.3, 'fsustain': 1, 'frelease': 0.05},
                  fx={'room': 0.3, 'roomSize': 3, 'roomLp': 9000}),
}
DRUM_IDS = [t[0] for t in TRACKS]
INST_IDS = list(INSTR)

# ------------------------------------------------------------------ le riff de piano (le thème)
# Rythme 3-3-2 en doubles-croches, deux fois par mesure : positions 0, 3, 6, 8, 11, 14.
RHYTHM = [(0, 3), (3, 3), (6, 2), (8, 3), (11, 3), (14, 2)]
THEME = [
    [70, 74, 79, 77, 74, 70],   # Gm : Sib Ré Sol | Fa Ré Sib
    [69, 70, 74, 70, 69, 67],   # Gm : La Sib Ré | Sib La Sol
    [67, 70, 75, 74, 70, 67],   # Mib : Sol Sib Mib | Ré Sib Sol
    [70, 72, 75, 72, 70, 67],   # Mib : Sib Do Mib | Do Sib Sol
    [65, 70, 74, 77, 74, 70],   # Sib : Fa Sib Ré | Fa Ré Sib
    [74, 77, 82, 81, 77, 74],   # Sib : Ré Fa Sib | La Fa Ré  (sommet de la phrase)
    [72, 77, 81, 79, 77, 72],   # Fa : Do Fa La | Sol Fa Do
    [69, 72, 77, 74, 72, 69],   # Fa : La Do Fa | Ré Do La
]
# Variante de la montée finale (Do m – Mib – Fa – Ré) : le thème monte et finit sur Fa# (sensible)
THEME_TENSION = [
    [67, 72, 75, 74, 72, 67],
    [67, 72, 75, 79, 75, 72],
    [70, 75, 79, 77, 75, 70],
    [70, 75, 79, 82, 79, 75],
    [72, 77, 81, 79, 77, 72],
    [72, 77, 81, 84, 81, 77],
    [74, 78, 81, 78, 74, 78],
    [81, 78, 74, 78, 81, 86],
]


def empty(bars):
    n = bars * BAR
    d = {k: {'steps': [0] * n} for k in DRUM_IDS}
    d.update({k: {'events': []} for k in INST_IDS})
    return d


def hit(d, track, step, vel):
    d[track]['steps'][step] = round(min(1, vel), 2)


def note(d, track, step, length, notes, vel):
    d[track]['events'].append({'step': step, 'len': length, 'notes': notes, 'vel': round(min(1, vel), 2)})


def theme(d, track, theme_bars=THEME, bars=None, vel=0.7, octave_down=False, legato=False, start_bar=0, ramp=0.0):
    """Le riff (rythme 3-3-2). ramp : crescendo de vélocité sur toute la durée."""
    bars = bars or len(theme_bars)
    total = (bars - start_bar) * BAR
    for b in range(start_bar, bars):
        notes = theme_bars[b % len(theme_bars)]
        for (o, l), n in zip(RHYTHM, notes):
            s = b * BAR + o
            v = vel + ramp * (s - start_bar * BAR) / total + (0.08 if o in (0, 8) else 0)
            ns = [n, n - 12] if octave_down else [n]
            note(d, track, s, l + (2 if legato else 0), ns, v)


def chords(d, track, progression, bars_each=2, vel=0.55, up=0, kind=None):
    s = 0
    for root, ctype, _ in progression:
        ctype = kind or ctype
        d[track]['events'].append({'step': s, 'len': bars_each * BAR, 'notes': [root + up + i for i in IV[ctype]],
                                   'vel': vel, 'chord': ctype})
        s += bars_each * BAR


def rolling_bass(d, progression, bars_each=2, start_bar=0, end_bar=None, vel=0.85):
    """Basse roulante : trois doubles-croches par temps, le kick (et le sidechain) occupe la première."""
    s0 = 0
    end = (end_bar if end_bar is not None else len(progression) * bars_each) * BAR
    for _, _, root in progression:
        for s in range(s0, s0 + bars_each * BAR):
            if s < start_bar * BAR or s >= end or s % 4 == 0:
                continue
            up = s % 4 == 2
            note(d, 'bass', s, 1, [root + 12 if up and s % 8 == 6 else root], vel if up else vel - 0.12)
        s0 += bars_each * BAR


def four_floor(d, start_bar, end_bar, vel=0.95):
    for s in range(start_bar * BAR, end_bar * BAR, 4):
        hit(d, 'kick', s, vel if s % 16 == 0 else vel - 0.07)


def claps(d, start_bar, end_bar, vel=0.8):
    for b in range(start_bar, end_bar):
        for o in (4, 12):
            hit(d, 'clap', b * BAR + o, vel)


def hats(d, start_bar, end_bar, sixteenths=True, offbeat_open=True, vel=0.6):
    for s in range(start_bar * BAR, end_bar * BAR):
        if offbeat_open and s % 4 == 2:
            hit(d, 'ohat', s, vel * 0.8)
        elif sixteenths and s % 4 != 0:
            hit(d, 'hat', s, vel if s % 2 == 0 else vel * 0.55)
        elif not sixteenths and s % 4 == 2:
            hit(d, 'hat', s, vel)


def snare_build(d, bars, gap=4):
    """Roulement qui accélère : noires, croches, doubles-croches, avec un crescendo ; les `gap` derniers pas sont muets."""
    n = bars * BAR
    for s in range(n - gap):
        b = s // BAR
        frac = s / n
        if b < bars // 2:
            on = s % 4 == 0
        elif b < bars - 2:
            on = s % 2 == 0
        else:
            on = True
        if on:
            hit(d, 'snare', s, 0.3 + 0.65 * frac)


def drop_impact(d):
    hit(d, 'crash', 0, 0.95)
    note(d, 'impact', 0, 16, [31], 1.0)   # Sol grave : le « boum » du drop


def end_fill(d, bars):
    """Petit roulement sur le dernier temps de la scène."""
    n = bars * BAR
    for i, s in enumerate(range(n - 4, n)):
        hit(d, 'snare', s, 0.55 + 0.1 * i)


# ------------------------------------------------------------------ scènes
def intro():
    d = empty(8)
    chords(d, 'pad', PROG, vel=0.45)
    chords(d, 'choir', PROG, vel=0.35, up=12)
    four_floor(d, 4, 8, vel=0.85)
    hats(d, 4, 8, sixteenths=False, offbeat_open=False, vel=0.5)
    hit(d, 'crash', 4 * BAR, 0.6)
    end_fill(d, 8)
    return 'Intro', 8, d


def groove():
    d = empty(8)
    four_floor(d, 0, 8)
    claps(d, 4, 8, vel=0.75)
    hats(d, 0, 8, sixteenths=False, offbeat_open=True, vel=0.55)
    hats(d, 4, 8, sixteenths=True, offbeat_open=True, vel=0.55)
    hit(d, 'crash', 0, 0.7)
    rolling_bass(d, PROG)
    chords(d, 'pad', PROG, vel=0.5)
    # le piano se devine sur la seconde moitié : la première note de chaque mesure
    for b in range(4, 8):
        n = THEME[b][0]
        note(d, 'piano', b * BAR, 6, [n], 0.45)
    end_fill(d, 8)
    return 'Groove', 8, d


def montee():
    d = empty(8)
    four_floor(d, 0, 6)                      # le kick s'arrête deux mesures avant le drop : tension
    claps(d, 0, 4, vel=0.7)
    for s in range(0, 6 * BAR):              # hi-hats en doubles-croches qui montent
        if s % 4:
            hit(d, 'hat', s, 0.3 + 0.4 * s / (6 * BAR))
    rolling_bass(d, PROG, end_bar=6)
    for s in range(6 * BAR, 8 * BAR - 4):    # basse en doubles-croches sur Fa, crescendo
        note(d, 'bass', s, 1, [41], 0.5 + 0.45 * (s - 6 * BAR) / (2 * BAR))
    chords(d, 'pad', PROG, vel=0.5)
    theme(d, 'piano', vel=0.5, ramp=0.35)
    snare_build(d, 8)
    note(d, 'riser', 0, 8 * BAR - 4, [60], 1.0)
    # coupure : le dernier temps est vide (sauf la queue des effets), le drop n'en frappe que plus fort
    for t in ('pad', 'piano'):
        for ev in d[t]['events']:
            ev['len'] = min(ev['len'], 8 * BAR - 4 - ev['step'])
    return 'Montée', 8, d


def drop(final=False):
    d = empty(8)
    drop_impact(d)
    four_floor(d, 0, 8, vel=1.0)
    claps(d, 0, 8, vel=0.85)
    hats(d, 0, 8, sixteenths=True, offbeat_open=True, vel=0.62)
    rolling_bass(d, PROG, vel=0.9)
    chords(d, 'pad', PROG, vel=0.6)
    theme(d, 'piano', vel=0.75, octave_down=final)
    theme(d, 'lead', vel=0.72)
    hit(d, 'crash', 4 * BAR, 0.6)
    if final:
        for s in range(0, 8 * BAR, 4):
            hit(d, 'ride', s, 0.55 if s % 8 else 0.45)
        chords(d, 'arp', PROG, vel=0.5, up=12)
        chords(d, 'choir', PROG, vel=0.45, up=12)
    end_fill(d, 8)
    return ('Drop final' if final else 'Drop'), 8, d


def breakdown():
    d = empty(8)
    hit(d, 'crash', 0, 0.7)
    note(d, 'impact', 0, 16, [31], 0.7)
    chords(d, 'pad', PROG, vel=0.55)
    chords(d, 'choir', PROG, vel=0.4, up=12)
    theme(d, 'piano', vel=0.6, legato=True)
    # dernière mesure : clap en croches qui annonce la montée
    for s in range(7 * BAR, 8 * BAR, 2):
        hit(d, 'clap', s, 0.35 + 0.5 * (s - 7 * BAR) / BAR)
    return 'Break', 8, d


def montee_finale():
    d = empty(8)
    four_floor(d, 0, 4)
    for s in range(0, 8 * BAR - 4):
        if s % 2 == 0 and s % 4:
            hit(d, 'ohat', s, 0.25 + 0.45 * s / (8 * BAR))
        elif s % 4 and s >= 2 * BAR:
            hit(d, 'hat', s, 0.25 + 0.4 * s / (8 * BAR))
    rolling_bass(d, PROG_TENSION, end_bar=6)
    for s in range(6 * BAR, 8 * BAR - 4):    # basse en doubles-croches sur Ré, la dominante
        note(d, 'bass', s, 1, [38 if s % 2 == 0 else 50], 0.5 + 0.45 * (s - 6 * BAR) / (2 * BAR))
    chords(d, 'pad', PROG_TENSION, vel=0.55)
    chords(d, 'choir', PROG_TENSION, vel=0.4, up=12)
    theme(d, 'piano', THEME_TENSION, vel=0.55, ramp=0.4)
    theme(d, 'lead', THEME_TENSION, vel=0.35, ramp=0.5, start_bar=4)
    snare_build(d, 8)
    claps(d, 6, 8, vel=0.6)
    for s in range(7 * BAR, 8 * BAR - 4):    # le clap rejoint le roulement en doubles-croches
        hit(d, 'clap', s, 0.4 + 0.5 * (s - 7 * BAR) / BAR)
    note(d, 'riser', 0, 8 * BAR - 4, [60], 1.0)
    for t in ('pad', 'piano', 'choir', 'lead'):
        for ev in d[t]['events']:
            ev['len'] = min(ev['len'], 8 * BAR - 4 - ev['step'])
    return 'Montée finale', 8, d


def outro():
    d = empty(8)
    hit(d, 'crash', 0, 0.8)
    four_floor(d, 0, 6)
    claps(d, 0, 4, vel=0.7)
    hats(d, 0, 6, sixteenths=False, offbeat_open=True, vel=0.5)
    rolling_bass(d, PROG, end_bar=4)
    chords(d, 'pad', PROG, vel=0.5)
    theme(d, 'piano', vel=0.55, bars=6)
    note(d, 'piano', 6 * BAR, 2 * BAR, [67, 70, 74], 0.5)   # accord final : Sol mineur
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
    # kick 909 : sub propre, carton retiré, claquement mis en avant ; c'est lui qui pilote le sidechain
    'kick': dict(eq=eq(hp=28, low=(55, 1.5), lm=(320, -4, 1.2), hm=(3000, 2, 1)), comp=comp(-12, 3, 0.015, 0.08, 3, 1.5), volume=0.85),
    'clap': dict(eq=eq(hp=200, lm=(600, -1.5, 1), high=(9000, 2)), comp=comp(-16, 3, 0.004, 0.1, 4, 1), pan=0.05, volume=0.48),
    'snare': dict(eq=eq(hp=150, hm=(4500, 2, 0.8)), pan=0, volume=0.46),
    'hat': dict(eq=eq(hp=450, high=(10000, 2)), pan=0.28, volume=0.34),
    'ohat': dict(eq=eq(hp=400, high=(11000, 1.5)), pan=-0.22, volume=0.33),
    'ride': dict(eq=eq(hp=500, high=(12000, 1)), pan=0.35, volume=0.24),
    'crash': dict(eq=eq(hp=350, high=(12000, 1)), pan=-0.1, volume=0.4),
    # basse : sous le kick grâce au sidechain (75 %) ; boue retirée, définition à 1 kHz, compression serrée
    'bass': dict(eq=eq(hp=35, low=(70, 1), lm=(240, -3, 1), hm=(1000, 1.5, 1)), comp=comp(-20, 4, 0.004, 0.1, 6, 2), volume=0.58),
    'impact': dict(eq=eq(hp=25, lm=(300, -4, 1)), comp=comp(-10, 4, 0.002, 0.2, 6, 0), volume=0.62),
    'pad': dict(eq=eq(hp=200, lm=(650, -2.5, 0.8), high=(9000, 1.5)), volume=0.3),
    'piano': dict(eq=eq(hp=140, lm=(350, -2.5, 1), hm=(2800, 2, 0.9), high=(10000, 1.5)), comp=comp(-20, 3, 0.006, 0.12, 6, 2), pan=-0.08, volume=0.5),
    'lead': dict(eq=eq(hp=180, lm=(700, -2, 1), hm=(3500, 1, 1), high=(10000, 1)), comp=comp(-18, 2.5, 0.01, 0.15, 6, 1), pan=0.08, volume=0.3),
    'arp': dict(eq=eq(hp=300, lm=(900, -2, 1), high=(9000, 1.5)), pan=0.4, volume=0.2),
    'choir': dict(eq=eq(hp=250, lm=(800, -2, 1), high=(8000, 1)), pan=-0.3, volume=0.28),
    'riser': dict(eq=eq(hp=300, high=(10000, 1)), pan=0, volume=0.28),
}

MASTER = {
    'volume': 1.0,
    'mix': {
        'pan': 0,
        'eq': eq(hp=25, low=(60, -1), lm=(500, -1.5, 0.7), hm=(2500, 1, 0.7), high=(11000, 2)),
        'comp': comp(-15, 2, 0.03, 0.2, 6, 2),
        'lim': {'on': True, 'ceil': -2.0, 'rel': 0.06},
    },
}


def apply_mix(tracks, tid):
    for key, m in MIX.items():
        t = next(x for x in tracks if x['id'] == tid[key])
        t['volume'] = m['volume']
        t['mix'] = {'pan': m.get('pan', 0), 'eq': m['eq'], 'comp': m.get('comp', OFF_COMP), 'lim': m.get('lim', OFF_LIM)}


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
                t[k] = dict(o[k])
        tracks.append(t)
    assert tid['kick'] == SC_KICK

    if MIXED:
        apply_mix(tracks, tid)

    scenes = []
    for fn in (intro, groove, montee, drop, breakdown, montee_finale, lambda: drop(final=True), outro):
        name, bars, d = fn()
        sid = 'sc_' + name.lower().replace(' ', '_').replace('é', 'e')
        scenes.append({'id': sid, 'name': name, 'bars': bars, 'data': {tid[k]: v for k, v in d.items()}})
    by = {sc['name']: sc for sc in scenes}

    # la scène ouverte à l'ouverture du fichier : le drop
    current = by['Drop']
    for t in tracks:
        t.update(current['data'][t['id']])

    song = [('Intro', 1), ('Groove', 1), ('Montée', 1), ('Drop', 2), ('Break', 1),
            ('Montée finale', 1), ('Drop final', 2), ('Outro', 1)]
    return {
        'format': 'stepseq', 'version': 1,
        'title': 'Envol',
        'tempo': 138, 'timeSig': [4, 4], 'bars': current['bars'],
        'groove': {'res': 16, 'swing': 0.5, 'human': 0.05},
        'tracks': tracks,
        'scenes': scenes,
        'current': current['id'],
        'song': [{'scene': by[n]['id'], 'repeat': r} for n, r in song],
        'playMode': 'song',
        'songLoop': False,
        **({'master': MASTER} if MIXED else {}),
    }


MIXED = True  # False : la version brute, sans mixage ni mastering (option --brut)

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if '--brut' in sys.argv:
        MIXED = False
    out = args[0] if args else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'envol.stepseq.json')
    project = build()
    with open(out, 'w') as f:
        json.dump(project, f, ensure_ascii=False, indent=1)
    bars = sum(next(sc['bars'] for sc in project['scenes'] if sc['id'] == b['scene']) * b['repeat'] for b in project['song'])
    print(out, len(project['tracks']), 'pistes,', len(project['scenes']), 'scènes,', bars, 'mesures,',
          '%.0f s' % (bars * 4 * 60 / project['tempo']))
