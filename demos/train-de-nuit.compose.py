"""
« Train de nuit » : morceau original, synthpop / hi-NRG années 80, Fa mineur, 132 BPM.
Génère un projet StepSeq complet en mode chanson :
  Intro (4) · Couplet (8) · Refrain (8) · Couplet · Refrain · Pont (4) · Refrain ×2 · Outro (4)

Usage : python3 train-de-nuit.compose.py [fichier de sortie]
"""
import json
import os
import sys

BAR = 16

# Accords : (racine des nappes, type, racine de la basse)
Fm = (53, 'min', 29)
Db = (49, 'maj', 25)
Ab = (56, 'maj', 32)
Eb = (51, 'maj', 27)
IV = {'min': [0, 3, 7], 'maj': [0, 4, 7]}

# ------------------------------------------------------------------ pistes (sons, mixage, effets)
TRACKS = [
    # id, nom, couleur, machine, son, variante, volume, effets
    ('kick', 'Kick', '#e3179c', 'LinnDrum', 'bd', 0, 0.72, None),
    ('snare', 'Snare', '#ff4d6d', 'LinnDrum', 'sd', 1, 0.6, {'room': 0.3, 'roomSize': 0.9, 'roomLp': 9000}),
    ('clap', 'Clap', '#f08a00', 'LinnDrum', 'cp', 0, 0.44, {'room': 0.25, 'roomSize': 1.2}),
    ('hat', 'Hi-Hat', '#f5c400', 'LinnDrum', 'hh', 0, 0.4, None),
    ('ohat', 'Open Hat', '#c9a227', 'LinnDrum', 'oh', 0, 0.32, None),
    ('tomhi', 'Tom Simmons aigu', '#13c2a3', 'SimmonsSDS5', 'ht', 0, 0.48, {'room': 0.35, 'roomSize': 1.6}),
    ('tomlo', 'Tom Simmons grave', '#0f9e85', 'SimmonsSDS5', 'lt', 0, 0.52, {'room': 0.35, 'roomSize': 1.6}),
    ('crash', 'Crash', '#c0c0c0', 'LinnDrum', 'cr', 0, 0.36, None),
]
INSTR = {
    'bass': dict(name='Basse octaves', color='#3fcf3f', category='mono', family='bass', instrument='syn_sawbass', volume=0.6, octave=1,
                 sd={'cutoff': 650, 'q': 6, 'env': 2.4, 'decay': 0.12, 'sustain': 0.25, 'release': 0.05,
                     'fattack': 0.003, 'fdecay': 0.14, 'fsustain': 0.2, 'frelease': 0.05}),
    'pad': dict(name='Nappe cordes synth', color='#1ea7ff', category='chord', family='strings', instrument='gm_synth_strings_1', volume=0.34, octave=3,
                sd={'attack': 0.35, 'release': 1.0, 'cutoff': 5000, 'q': 0.5},
                fx={'chorus': 0.35, 'chorusRate': 0.6, 'chorusDepth': 0.4, 'room': 0.35, 'roomSize': 2.8, 'roomLp': 7000}),
    'arp': dict(name='Arpège', color='#9b5cff', category='arp', family='synth', instrument='syn_pluck', volume=0.26, octave=4,
                arp={'mode': 'updown', 'rate': 1, 'octaves': 2},
                fx={'delay': 0.28, 'delayTime': '3/16', 'delayFeedback': 0.35, 'room': 0.2, 'roomSize': 1.6}),
    'lead': dict(name='Lead', color='#ff4d6d', category='mono', family='synth', instrument='syn_square', volume=0.4, octave=4,
                 sd={'wave': 'square', 'voices': 2, 'detune': 8, 'cutoff': 2600, 'q': 3, 'env': 1.2,
                     'attack': 0.01, 'decay': 0.3, 'sustain': 0.7, 'release': 0.25},
                 fx={'chorus': 0.3, 'delay': 0.3, 'delayTime': '3/16', 'delayFeedback': 0.4,
                     'room': 0.3, 'roomSize': 2.4, 'roomLp': 8000}),
}
DRUM_IDS = [t[0] for t in TRACKS]
INST_IDS = list(INSTR)

# ------------------------------------------------------------------ briques musicales
F4, G4, Ab4, Bb4, C5, Db5, Eb5, F5, G5, Ab5 = 65, 67, 68, 70, 72, 73, 75, 77, 79, 80


def empty(bars):
    n = bars * BAR
    d = {k: {'steps': [0] * n} for k in DRUM_IDS}
    d.update({k: {'events': []} for k in INST_IDS})
    return d


def hit(d, track, step, vel):
    d[track]['steps'][step] = round(vel, 2)


def four_floor(d, bars, start_bar=0):
    for s in range(start_bar * BAR, bars * BAR, 4):
        hit(d, 'kick', s, 0.95 if s % 16 == 0 else 0.85)


def backbeat(d, bars, start_bar=0, roll_last=False):
    for b in range(start_bar, bars):
        for o in (4, 12):
            hit(d, 'snare', b * BAR + o, 0.9)
            hit(d, 'clap', b * BAR + o, 0.65)
    if roll_last:  # roulement de caisse claire sur la dernière demi-mesure
        n = bars * BAR
        for s in range(n - 8, n):
            hit(d, 'snare', s, 0.45 + 0.07 * (s - (n - 8)))


def hats(d, bars, busy=True, start_bar=0, last_half_free=False):
    n = bars * BAR
    for s in range(start_bar * BAR, n):
        if last_half_free and s >= n - 8:
            continue
        if busy and s % 4 == 2:
            hit(d, 'ohat', s, 0.45)
            continue
        if not busy and s % 2:
            continue
        hit(d, 'hat', s, 0.65 if s % 4 == 0 else 0.55 if s % 2 == 0 else 0.3)


def tom_fill(d, bars):
    n = bars * BAR
    for o, v in ((-16, 0.8), (-14, 0.75), (-12, 0.75)):
        hit(d, 'tomhi', n + o, v)
    for o, v in ((-10, 0.8), (-9, 0.7), (-6, 0.85), (-4, 0.9), (-2, 0.95)):
        hit(d, 'tomlo', n + o, v)


def chords(d, track, progression, bars_each=2, vel=0.55, up=0):
    s = 0
    for root, ctype, _ in progression:
        d[track]['events'].append({'step': s, 'len': bars_each * BAR, 'notes': [root + up + i for i in IV[ctype]], 'vel': vel, 'chord': ctype})
        s += bars_each * BAR


def octave_bass(d, progression, bars_each=2):
    s0 = 0
    for _, _, root in progression:
        for s in range(s0, s0 + bars_each * BAR, 2):
            low = (s // 2) % 2 == 0
            d['bass']['events'].append({'step': s, 'len': 1, 'notes': [root if low else root + 12], 'vel': 0.9 if low else 0.7})
        s0 += bars_each * BAR


def long_bass(d, progression, bars_each=2):
    s = 0
    for _, _, root in progression:
        d['bass']['events'].append({'step': s, 'len': bars_each * BAR, 'notes': [root + 12], 'vel': 0.7})
        s += bars_each * BAR


def melody(d, notes):
    for s, l, n in notes:
        d['lead']['events'].append({'step': s, 'len': l, 'notes': [n], 'vel': 0.8 if s % 16 in (0, 8) else 0.72})


REFRAIN_MELODY = [
    (8, 2, C5), (10, 2, Eb5), (12, 4, F5),
    (16, 2, Eb5), (18, 2, C5), (20, 4, Ab4), (26, 2, G4), (28, 4, Ab4),
    (40, 2, Db5), (42, 2, C5), (44, 4, Ab4),
    (48, 6, Bb4), (56, 2, Ab4), (58, 6, F4),
    (72, 2, C5), (74, 2, Eb5), (76, 4, Ab5),
    (80, 2, G5), (82, 2, Eb5), (84, 4, C5), (90, 2, Eb5), (92, 4, F5),
    (104, 2, Bb4), (106, 2, Eb5), (108, 4, G5),
    (112, 4, F5), (116, 4, Eb5), (120, 8, C5),
]
# pont : mélodie lente en notes longues, qui monte pour relancer le refrain
BRIDGE_MELODY = [(0, 12, Ab4), (12, 4, Bb4), (16, 16, C5), (32, 12, Bb4), (44, 4, Eb5), (48, 8, G5), (56, 8, Ab5)]


# ------------------------------------------------------------------ scènes
def intro():
    d = empty(4)
    chords(d, 'pad', [Fm, Db], vel=0.5)
    chords(d, 'arp', [Fm, Db], vel=0.45, up=12)
    four_floor(d, 4, start_bar=2)
    hats(d, 4, busy=False, start_bar=2, last_half_free=True)
    backbeat(d, 4, start_bar=3, roll_last=True)
    return 'Intro', 4, d


def couplet():
    d = empty(8)
    four_floor(d, 8)
    backbeat(d, 8)
    hats(d, 8, busy=False)
    hit(d, 'crash', 0, 0.7)
    octave_bass(d, [Fm, Db, Ab, Eb])
    chords(d, 'pad', [Fm, Db, Ab, Eb], vel=0.4)
    chords(d, 'arp', [Fm, Db, Ab, Eb], vel=0.5, up=12)
    tom_fill(d, 8)
    return 'Couplet', 8, d


def refrain():
    d = empty(8)
    four_floor(d, 8)
    backbeat(d, 8, roll_last=True)
    hats(d, 8, busy=True, last_half_free=True)
    hit(d, 'crash', 0, 0.75)
    hit(d, 'crash', 64, 0.6)
    tom_fill(d, 8)
    octave_bass(d, [Fm, Db, Ab, Eb])
    chords(d, 'pad', [Fm, Db, Ab, Eb], vel=0.55)
    chords(d, 'arp', [Fm, Db, Ab, Eb], vel=0.5, up=12)
    melody(d, REFRAIN_MELODY)
    # le roulement de caisse claire remplace les toms sur la toute fin
    for s in range(120, 128):
        d['tomlo']['steps'][s] = 0
    return 'Refrain', 8, d


def pont():
    d = empty(4)
    chords(d, 'pad', [Db, Eb], vel=0.6)
    long_bass(d, [Db, Eb])
    melody(d, BRIDGE_MELODY)
    # montée : caisse claire en doubles-croches sur la dernière mesure + toms
    for s in range(48, 64):
        hit(d, 'snare', s, 0.3 + 0.04 * (s - 48))
    for s, v in ((56, 0.7), (58, 0.8), (60, 0.85), (62, 0.95)):
        hit(d, 'tomlo', s, v)
    return 'Pont', 4, d


def outro():
    d = empty(4)
    four_floor(d, 2)
    hats(d, 2, busy=False)
    hit(d, 'crash', 0, 0.7)
    hit(d, 'crash', 32, 0.55)
    chords(d, 'pad', [Fm], bars_each=4, vel=0.55)
    chords(d, 'arp', [Fm], bars_each=2, vel=0.4, up=12)
    d['bass']['events'].append({'step': 0, 'len': 32, 'notes': [41], 'vel': 0.7})
    melody(d, [(8, 2, C5), (10, 2, Eb5), (12, 20, F5)])
    return 'Outro', 4, d


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

    scenes = []
    for fn in (intro, couplet, refrain, pont, outro):
        name, bars, d = fn()
        scenes.append({'id': 'sc_' + name.lower(), 'name': name, 'bars': bars, 'data': {tid[k]: v for k, v in d.items()}})
    by = {sc['name']: sc for sc in scenes}

    # la scène ouverte à l'ouverture du fichier : le refrain (son contenu est aussi dans les pistes)
    current = by['Refrain']
    for t in tracks:
        cont = current['data'][t['id']]
        t.update(cont)

    song = [('Intro', 1), ('Couplet', 1), ('Refrain', 1), ('Couplet', 1), ('Refrain', 1), ('Pont', 1), ('Refrain', 2), ('Outro', 1)]
    return {
        'format': 'stepseq', 'version': 1,
        'title': 'Train de nuit',
        'tempo': 132, 'timeSig': [4, 4], 'bars': current['bars'],
        'groove': {'res': 16, 'swing': 0.52, 'human': 0.08},
        'tracks': tracks,
        'scenes': scenes,
        'current': current['id'],
        'song': [{'scene': by[n]['id'], 'repeat': r} for n, r in song],
        'playMode': 'song',
        'songLoop': False,
    }


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'train-de-nuit.stepseq.json')
    project = build()
    with open(out, 'w') as f:
        json.dump(project, f, ensure_ascii=False, indent=1)
    bars = sum(next(sc['bars'] for sc in project['scenes'] if sc['id'] == b['scene']) * b['repeat'] for b in project['song'])
    print(out, len(project['tracks']), 'pistes,', len(project['scenes']), 'scènes,', bars, 'mesures,',
          '%.0f s' % (bars * 4 * 60 / project['tempo']))
