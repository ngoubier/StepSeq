"""
« Marée lente » : morceau original, ambient planant (drones, nappes, piano électrique lointain), Ré majeur, 60 BPM.
Pas de batterie : le temps est donné par la respiration des nappes (attaques et relâchements de plusieurs secondes),
une pédale de Ré qui ne s'arrête jamais et une reverb « Cosmos » longue avec shimmer.

Forme (mode chanson, 72 mesures, 4 s par mesure → 4:48 + queue de reverb) :
  Aube (8) · Nappes (16) · Courant (16) · Suspension (8) · Retour (16) · Dissolution (8)

Harmonie (Ré majeur, couleur lydienne au milieu) — une harmonie par 4 mesures, sur une pédale de Ré (drone D2–A2) :
  Nappes / Courant / Retour : Dmaj9 | Bm11 | Gmaj9 | Asus4(9)     I – vi – IV – V(sus)
  Suspension               : Em9 | Gmaj7(♯11)                   ii – IV(♯11) : le Do♯ sur Sol = couleur lydienne
  La dominante reste suspendue (Asus4, sans Do♯ à la basse) : rien ne « tire », tout flotte.

Voicings des nappes (sans fondamentale, la basse et le drone la donnent ; notes communes La et Fa♯/Mi) :
  Dmaj9  F♯3–A3–C♯4–E4 → Bm11 F♯3–A3–D4–E4 → Gmaj9 F♯3–A3–B3–D4 → Asus E3–A3–B3–D4 → retour Dmaj9

Usage : python3 maree-lente.compose.py [fichier de sortie] [--brut]   (--brut : sans mixage ni mastering)
"""
import json
import os
import random
import sys

BAR = 16  # une case = une double-croche ; 16 cases = une mesure de 4/4 (4 s à 60 BPM)

# ------------------------------------------------------------------ notes (MIDI, Do4 = 60)
G1, A1, B1 = 31, 33, 35
D2, E2, G2, A2, B2 = 38, 40, 43, 45, 47
E3, Fs3, G3, A3, B3 = 52, 54, 55, 57, 59
Cs4, D4, E4, Fs4, A4, B4 = 61, 62, 64, 66, 69, 71
Cs5, D5, E5, Fs5, A5, B5 = 73, 74, 76, 78, 81, 83

# Accords : nom, type (affichage), voicing des nappes, basse (sub), notes « scintillantes » possibles (octave 6)
DMAJ9 = ('Dmaj9', 'maj7', [Fs3, A3, Cs4, E4], D2, [Fs5, A5, Cs5 + 12, E5 + 12, D5 + 12])
BM11 = ('Bm11', 'min7', [Fs3, A3, D4, E4], B1, [Fs5, A5, B5, D5 + 12, E5 + 12])
GMAJ9 = ('Gmaj9', 'maj7', [Fs3, A3, B3, D4], G1, [Fs5, A5, B5, D5 + 12])
ASUS = ('Asus4', 'sus4', [E3, A3, B3, D4], A1, [E5, A5, B5, D5 + 12])
EM9 = ('Em9', 'min7', [G3, B3, D4, Fs4], E2, [Fs5, B5, D5 + 12, E5 + 12])
GLYD = ('Gmaj7♯11', 'maj7', [Fs3, B3, Cs4, D4], G1, [Fs5, B5, Cs5 + 12, D5 + 12])

CYCLE = [DMAJ9, BM11, GMAJ9, ASUS]  # 4 × 4 mesures
SUSP = [EM9, GLYD]                  # 2 × 4 mesures

# ------------------------------------------------------------------ pistes (sons, effets)
INSTR = {
    'drone': dict(name='Drone de Ré', color='#3b5bdb', category='mono', family='pads', instrument='syn_drone', volume=0.42, octave=2,
                  sd={'cutoff': 380, 'q': 4, 'attack': 7, 'release': 9},
                  fx={'chorus': 0.3, 'chorusRate': 0.15, 'chorusDepth': 0.6, 'sendSpace': 0.35}),
    'breath': dict(name='Nappe qui respire', color='#1ea7ff', category='chord', family='pads', instrument='syn_breathpad', volume=0.4, octave=3,
                   sd={'attack': 3.5, 'release': 6, 'cutoff': 900},
                   fx={'chorus': 0.45, 'chorusRate': 0.25, 'chorusDepth': 0.6, 'sendSpace': 0.45}),
    'glass': dict(name='Nappe de verre', color='#99e9f2', category='chord', family='pads', instrument='syn_glasspad', volume=0.2, octave=4,
                  sd={'attack': 2.5, 'release': 5},
                  fx={'chorus': 0.5, 'chorusRate': 0.3, 'chorusDepth': 0.7, 'sendSpace': 0.55}),
    'sub': dict(name='Sub lointain', color='#2b8a3e', category='mono', family='bass', instrument='syn_sub', volume=0.34, octave=1,
                sd={'attack': 2.5, 'decay': 1, 'sustain': 0.9, 'release': 4}),
    'rhodes': dict(name='Piano électrique', color='#ffd8a8', category='mono', family='keys', instrument='gm_epiano1', volume=0.42, octave=4,
                   fx={'delay': 0.32, 'delayTime': '3/8', 'delayFeedback': 0.45, 'sendSpace': 0.5, 'sendHall': 0.2}),
    'celesta': dict(name='Poussière d\'étoiles', color='#e599f7', category='mono', family='mallets', instrument='gm_celesta', volume=0.24, octave=6,
                    fx={'delay': 0.38, 'delayTime': '3/16', 'delayFeedback': 0.5, 'sendSpace': 0.75}),
    'choir': dict(name='Chœur lointain', color='#f3f0ff', category='chord', family='pads', instrument='gm_pad_choir', volume=0.26, octave=4,
                  fx={'sendSpace': 0.6, 'sendHall': 0.2}),
    'wind': dict(name='Vent', color='#868e96', category='mono', family='fx', instrument='syn_wind', volume=0.16, octave=4,
                 sd={'attack': 5, 'release': 6, 'cutoff': 600},
                 fx={'sendSpace': 0.4}),
}
IDS = list(INSTR)

# « Cosmos » : reverb longue (16 s), modulée, avec un peu de shimmer (octave réinjectée)
RETURNS = {'space': {'decay': 16, 'size': 0.92, 'predelay': 0.06, 'damp': 6000, 'mod': 0.45, 'shimmer': 0.35, 'freeze': False,
                     'hp': 160, 'lp': 9000, 'level': 0.8},
           'echo': {'time': '3/8', 'feedback': 0.4, 'hp': 300, 'lp': 3500, 'level': 1, 'wow': 0.3, 'drive': 0.1}}


def empty():
    return {k: {'events': []} for k in IDS}


def note(d, track, step, length, notes, vel, chord=None):
    ev = {'step': step, 'len': length, 'notes': notes if isinstance(notes, list) else [notes], 'vel': round(vel, 2)}
    if chord:
        ev['chord'] = chord
    d[track]['events'].append(ev)


def auto(d, track, lane, points):
    """Courbe d'automation : points (pas, valeur) ; l'automation de la scène s'étend sur toute la scène."""
    d[track].setdefault('auto', {})[lane] = {str(s): round(v, 3) for s, v in points}


# ------------------------------------------------------------------ briques
def drone(d, bars, vel=0.7, notes=(D2, A2)):
    """Pédale de Ré (fondamentale + quinte), tenue toute la scène ; la dérive du filtre la fait vivre."""
    note(d, 'drone', 0, bars * BAR, list(notes), vel)


def pads(d, track, progression, vel, bars_each=4, octave_up=0, start_bar=0):
    for i, (_, ctype, voicing, _, _) in enumerate(progression):
        if i * bars_each < start_bar:
            continue
        note(d, track, i * bars_each * BAR, bars_each * BAR, [n + octave_up for n in voicing], vel, ctype)


def sub(d, progression, vel=0.6, bars_each=4):
    for i, (_, _, _, root, _) in enumerate(progression):
        note(d, 'sub', i * bars_each * BAR, bars_each * BAR - 2, root, vel)


def sparkles(d, progression, seed, density=0.5, vel=0.4, bars_each=4):
    """Notes de célesta clairsemées, au hasard (graine fixe) parmi les notes aiguës de l'accord, en dehors des temps."""
    rnd = random.Random(seed)
    for i, (_, _, _, _, high) in enumerate(progression):
        for b in range(bars_each):
            if rnd.random() > density:
                continue
            s = (i * bars_each + b) * BAR + rnd.choice([2, 5, 6, 9, 10, 13])
            note(d, 'celesta', s, 6, rnd.choice(high), vel * rnd.uniform(0.7, 1.0))
            if rnd.random() < 0.3:  # parfois une deuxième note, une tierce ou une quarte plus bas
                note(d, 'celesta', s + 3, 6, rnd.choice(high), vel * 0.7)


def melody(d, track, phrase, vel=0.6):
    """phrase : (mesure, case dans la mesure, durée en cases, note)."""
    for bar, off, length, n in phrase:
        note(d, track, bar * BAR + off, length, n, vel + (0.06 if off == 0 else 0))


# Phrase du piano électrique sur Dmaj9 | Bm11 | Gmaj9 | Asus (16 mesures) : notes longues, beaucoup d'air,
# chaque entrée d'accord sur une de ses notes ; le Do♯5 sur Sol (mesure 11) ouvre la couleur lydienne.
PHRASE_A = [
    (0, 0, 8, A4), (0, 8, 8, Cs5), (1, 0, 24, E5), (2, 8, 8, D5), (3, 0, 16, Cs5),     # Dmaj9
    (4, 0, 12, D5), (4, 12, 4, B4), (5, 0, 24, A4), (6, 8, 8, Fs4), (7, 0, 16, E4),    # Bm11
    (8, 0, 8, Fs4), (8, 8, 8, A4), (9, 0, 24, B4), (10, 8, 8, D5), (11, 0, 16, Cs5),   # Gmaj9 (♯11)
    (12, 0, 16, B4), (13, 0, 16, A4), (14, 0, 28, E4),                                  # Asus : on reste en l'air
]
# Variation du Retour : même contour, une tierce plus haut, et la fin qui se pose sur Ré.
PHRASE_B = [
    (0, 0, 16, Fs5), (1, 0, 8, E5), (1, 8, 8, Cs5), (2, 0, 28, A4),                    # Dmaj9
    (4, 0, 8, B4), (4, 8, 8, D5), (5, 0, 24, Fs5), (6, 8, 8, E5), (7, 0, 16, D5),      # Bm11
    (8, 0, 8, D5), (8, 8, 8, E5), (9, 0, 16, Fs5), (10, 0, 16, A5), (11, 0, 16, E5),   # Gmaj9
    (12, 0, 16, D5), (13, 0, 8, B4), (13, 8, 8, A4), (14, 0, 28, D5),                   # Asus → Ré (suspendu)
]
# Suspension : le chœur et quelques notes du piano électrique, très espacées.
PHRASE_S = [(0, 4, 20, B4), (2, 0, 24, Fs4), (4, 4, 20, Cs5), (6, 0, 28, B4)]


# ------------------------------------------------------------------ scènes
def aube():
    d = empty()
    drone(d, 8, 0.65)
    note(d, 'wind', 0, 8 * BAR, D4, 0.6)
    pads(d, 'breath', [DMAJ9, DMAJ9], 0.42, start_bar=4)   # la nappe entre à mi-scène
    auto(d, 'drone', 'filter', [(0, -0.75), (8 * BAR - 1, -0.1)])  # le drone sort de la brume
    auto(d, 'breath', 'filter', [(4 * BAR, -0.6), (8 * BAR - 1, -0.05)])
    return 'Aube', 8, d


def nappes():
    d = empty()
    drone(d, 16, 0.6)
    pads(d, 'breath', CYCLE, 0.5)
    sparkles(d, CYCLE, seed=3, density=0.45, vel=0.35)
    note(d, 'wind', 0, 8 * BAR, D4, 0.45)
    auto(d, 'celesta', 'space', [(0, 0.2), (16 * BAR - 1, 0.6)])
    return 'Nappes', 16, d


def courant():
    d = empty()
    drone(d, 16, 0.55)
    pads(d, 'breath', CYCLE, 0.5)
    pads(d, 'glass', CYCLE, 0.42, octave_up=12)
    sub(d, CYCLE, 0.55)
    melody(d, 'rhodes', PHRASE_A, 0.55)
    sparkles(d, CYCLE, seed=11, density=0.45, vel=0.38)
    return 'Courant', 16, d


def suspension():
    d = empty()
    drone(d, 8, 0.5, notes=(D2, A2))       # la pédale de Ré tient sous Em9 et Gmaj7♯11 : tout devient lydien
    pads(d, 'breath', SUSP, 0.45)
    pads(d, 'choir', SUSP, 0.5, octave_up=12)
    melody(d, 'rhodes', PHRASE_S, 0.45)
    note(d, 'wind', 0, 8 * BAR, D4, 0.5)
    auto(d, 'rhodes', 'space', [(0, 0.2), (8 * BAR - 1, 0.9)])  # le piano se dissout dans le Cosmos
    return 'Suspension', 8, d


def retour():
    d = empty()
    drone(d, 16, 0.6)
    pads(d, 'breath', CYCLE, 0.52)
    pads(d, 'glass', CYCLE, 0.45, octave_up=12)
    pads(d, 'choir', CYCLE[2:], 0.4, octave_up=12, start_bar=0)  # le chœur revient sur Gmaj9 et Asus
    d['choir']['events'] = [dict(e, step=e['step'] + 8 * BAR) for e in d['choir']['events']]
    sub(d, CYCLE, 0.6)
    melody(d, 'rhodes', PHRASE_B, 0.58)
    sparkles(d, CYCLE, seed=29, density=0.55, vel=0.4)
    return 'Retour', 16, d


def dissolution():
    d = empty()
    drone(d, 8, 0.55)
    note(d, 'breath', 0, 8 * BAR, DMAJ9[2], 0.45, 'maj7')
    note(d, 'glass', 0, 6 * BAR, [n + 12 for n in DMAJ9[2]], 0.35, 'maj7')
    note(d, 'sub', 0, 6 * BAR, D2, 0.45)
    note(d, 'rhodes', 0, 12, [D4, A4], 0.45)
    note(d, 'rhodes', 16, 32, [Fs4, Cs5, E5], 0.4)   # dernier accord, Dmaj9 qui s'éteint dans l'écho
    note(d, 'celesta', 2 * BAR + 6, 8, A5, 0.3)
    note(d, 'celesta', 4 * BAR + 10, 8, Fs5, 0.25)
    note(d, 'wind', 0, 8 * BAR, D4, 0.5)
    end = 8 * BAR - 1
    for k in IDS:  # fondu général : le Cosmos garde la queue
        auto(d, k, 'volume', [(0, 1), (2 * BAR, 1), (end, 0.0)])
    auto(d, 'breath', 'filter', [(0, 0), (end, -0.7)])
    return 'Dissolution', 8, d


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

# Pas de batterie : l'EQ sert surtout à empiler les couches sans boue (bas-médium creusé) ni dureté (2–4 kHz).
MIX = {
    'drone': dict(eq=eq(hp=32, lm=(300, -4, 0.8), high=(6000, -3)), pan=0, volume=0.3),
    'breath': dict(eq=eq(hp=160, lm=(380, -4, 0.8), hm=(3000, -1, 0.8), high=(9000, 1.5)), pan=-0.1, volume=0.3),
    'glass': dict(eq=eq(hp=300, lm=(800, -2, 1), high=(10000, 2.5)), pan=0.25, volume=0.18),
    'sub': dict(eq=eq(hp=28, lm=(200, -4, 1)), comp=comp(-22, 2, 0.05, 0.4, 6, 1), volume=0.3),
    'rhodes': dict(eq=eq(hp=110, lm=(350, -2, 1), hm=(2500, -1, 0.8), high=(9000, 1)), comp=comp(-20, 2, 0.02, 0.25, 6, 1),
                   pan=-0.15, volume=0.36),
    'celesta': dict(eq=eq(hp=600, hm=(3500, -2, 1), high=(12000, 1)), pan=0.35, volume=0.24),
    'choir': dict(eq=eq(hp=220, lm=(500, -2.5, 1), hm=(3000, -1, 1)), pan=0.08, volume=0.22),
    'wind': dict(eq=eq(hp=250, high=(9000, -2)), pan=-0.3, volume=0.16),
}

# Master doux : on garde la dynamique (ambient : environ −16 LUFS), compression lente et limiteur de sécurité.
MASTER = {
    'volume': 0.65,
    'mix': {
        'pan': 0,
        'eq': eq(hp=25, low=(80, -1), lm=(350, -2, 0.7), hm=(3000, 1, 0.7), high=(11000, 2.5)),
        'comp': comp(-22, 1.6, 0.08, 0.6, 8, 2),
        'lim': {'on': True, 'ceil': -1.5, 'rel': 0.2},
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
    for key, o in INSTR.items():
        tid[key] = 'ti_' + key
        t = {'id': tid[key], 'type': 'instrument', 'name': o['name'], 'color': o['color'], 'volume': o['volume'],
             'mute': False, 'solo': False, 'category': o['category'], 'family': o['family'], 'instrument': o['instrument'],
             'sfv': 0, 'chord': 'maj', 'arp': {'mode': 'up', 'rate': 1, 'octaves': 1},
             'octave': o['octave'], 'events': []}
        for k in ('sd', 'fx'):
            if k in o:
                t[k] = o[k]
        tracks.append(t)

    if MIXED:
        apply_mix(tracks, tid)

    scenes = []
    for fn in (aube, nappes, courant, suspension, retour, dissolution):
        name, bars, d = fn()
        for k, v in d.items():
            if 'auto' in v:
                v['autoLen'] = bars * BAR
        sid = 'sc_' + name.lower().replace('é', 'e')
        scenes.append({'id': sid, 'name': name, 'bars': bars, 'key': {'tonic': 'D', 'mode': 'major'},
                       'data': {tid[k]: v for k, v in d.items()}})
    by = {sc['name']: sc for sc in scenes}

    current = by['Courant']
    for t in tracks:
        t.update(current['data'][t['id']])

    song = [('Aube', 1), ('Nappes', 1), ('Courant', 1), ('Suspension', 1), ('Retour', 1), ('Dissolution', 1)]
    return {
        'format': 'stepseq', 'version': 3,
        'title': 'Marée lente',
        'tempo': 60, 'timeSig': [4, 4], 'bars': current['bars'],
        'groove': {'res': 16, 'swing': 0.5, 'human': 0.06},
        'tracks': tracks,
        'scenes': scenes,
        'current': current['id'],
        'song': [{'scene': by[n]['id'], 'repeat': r} for n, r in song],
        'playMode': 'song',
        'songLoop': False,
        'returns': RETURNS,
        **({'master': MASTER} if MIXED else {}),
    }


MIXED = True

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if '--brut' in sys.argv:
        MIXED = False
    out = args[0] if args else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'maree-lente.stepseq.json')
    project = build()
    with open(out, 'w') as f:
        json.dump(project, f, ensure_ascii=False, indent=1)
    bars = sum(next(sc['bars'] for sc in project['scenes'] if sc['id'] == b['scene']) * b['repeat'] for b in project['song'])
    print(out, len(project['tracks']), 'pistes,', len(project['scenes']), 'scènes,', bars, 'mesures,',
          '%.0f s' % (bars * 4 * 60 / project['tempo']))
