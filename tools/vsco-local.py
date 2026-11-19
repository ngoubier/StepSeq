#!/usr/bin/env python3
"""
Orchestre VSCO 2 Community Edition (Versilian Studios, licence CC0) : copie locale et accordage.

Pour chaque instrument de INSTRUMENTS, le script télécharge les échantillons du dossier VSCO 2, garde un fichier par
note (une nuance moyenne-forte, première prise), le raccourcit à MAX_S secondes avec un fondu, l'encode en MP3 dans
samples/vsco/<instrument>/ et écrit :
 - samples/vsco/vsco.json : la carte note -> fichier, au format des banques de strudel (_base + { note: chemin }) ;
 - js/vsco.js : la liste des instruments (SS.LIB.vsco) et leur accordage mesuré (octave et écart fin, même méthode
   que tools/sample-pitch.py), ajouté à SS.MULTI_OCTAVE et SS.MULTI_TUNING.

Usage : python3 tools/vsco-local.py [dossier de téléchargement]
Nécessite numpy, ffmpeg et git (clone partiel de https://github.com/sgossner/VSCO-2-CE).
"""
import importlib.util, json, os, re, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TREE = 'https://github.com/sgossner/VSCO-2-CE'
OUT = os.path.join(ROOT, 'samples', 'vsco')
MAX_S = 8
FADE_S = 0.5

# clé, dossier VSCO 2, libellé (« Nom (détail, VSCO) »), famille de js/sounds.js, relâchement (s),
# programme General MIDI le plus proche (export MIDI et mode General MIDI)
INSTRUMENTS = [
    ('violins', 'Strings/Violin Section/susVib', 'Violons (section, VSCO)', 'strings', 0.5, 40),
    ('violins_pizz', 'Strings/Violin Section/Pizz', 'Violons (pizzicato, VSCO)', 'strings', 0.3, 45),
    ('violins_spic', 'Strings/Violin Section/Spic', 'Violons (spiccato, VSCO)', 'strings', 0.2, 40),
    ('violins_trem', 'Strings/Violin Section/Trem', 'Violons (trémolo, VSCO)', 'strings', 0.4, 44),
    ('violin_solo', 'Strings/Solo Violin/Arco Vib', 'Violon solo (VSCO)', 'strings', 0.4, 40),
    ('violas', 'Strings/Viola Section/susvib', 'Altos (section, VSCO)', 'strings', 0.5, 41),
    ('violas_pizz', 'Strings/Viola Section/pizz', 'Altos (pizzicato, VSCO)', 'strings', 0.3, 45),
    ('cellos', 'Strings/Cello Section/susvib', 'Violoncelles (section, VSCO)', 'strings', 0.5, 42),
    ('cellos_pizz', 'Strings/Cello Section/pizzT', 'Violoncelles (pizzicato, VSCO)', 'strings', 0.3, 45),
    ('cellos_spic', 'Strings/Cello Section/spic', 'Violoncelles (spiccato, VSCO)', 'strings', 0.2, 42),
    ('contrabass', 'Strings/Solo Contrabass/SusVib', 'Contrebasse (archet, VSCO)', 'strings', 0.5, 43),
    ('contrabass_pizz', 'Strings/Solo Contrabass/Pizz', 'Contrebasse (pizzicato, VSCO)', 'strings', 0.3, 45),
    ('harp', 'Strings/Harp', 'Harpe de concert (VSCO)', 'strings', 0.8, 46),
    ('horn', 'Brass/F Horn/sus', 'Cor (VSCO)', 'brass', 0.4, 60),
    ('horn_stac', 'Brass/F Horn/stac', 'Cor (staccato, VSCO)', 'brass', 0.2, 60),
    ('trumpet', 'Brass/Trumpet/sus', 'Trompette (VSCO)', 'brass', 0.3, 56),
    ('trumpet_stac', 'Brass/Trumpet/stac', 'Trompette (staccato, VSCO)', 'brass', 0.2, 56),
    ('trombone', 'Brass/Tenor Trombone/sus', 'Trombone (VSCO)', 'brass', 0.3, 57),
    ('tuba', 'Brass/Tuba/sus', 'Tuba (VSCO)', 'brass', 0.3, 58),
    ('flute', 'Woodwinds/Flute/susvib', 'Flûte (VSCO)', 'winds', 0.3, 73),
    ('flute_stac', 'Woodwinds/Flute/stac', 'Flûte (staccato, VSCO)', 'winds', 0.2, 73),
    ('piccolo', 'Woodwinds/Piccolo/Sus', 'Piccolo (VSCO)', 'winds', 0.3, 72),
    ('oboe', 'Woodwinds/Oboe/Vib', 'Hautbois (VSCO)', 'winds', 0.3, 68),
    ('clarinet', 'Woodwinds/Clarinet/susLong', 'Clarinette (VSCO)', 'winds', 0.3, 71),
    ('bassoon', 'Woodwinds/Bassoon/sus', 'Basson (VSCO)', 'winds', 0.3, 70),
    ('marimba', 'Percussion/Marimba', 'Marimba (VSCO)', 'mallets', 0.6, 12),
    ('xylophone', 'Percussion/Xylo', 'Xylophone (VSCO)', 'mallets', 0.5, 13),
    ('glockenspiel', 'Percussion/Glock', 'Glockenspiel (VSCO)', 'mallets', 0.8, 9),
]

NOTE_RE = re.compile(r'(?:^|_)([A-G]#?-?\d)(?=_|\.|$)')
DYN = {'pp': 1, 'p': 2, 'mp': 3, 'mf': 4, 'f': 5, 'ff': 6, 'loud': 5, 'soft': 2}


def strength(name):
    m = re.search(r'_v(\d)', name)
    if m:
        return int(m[1])
    for tok in re.split(r'[_.]', name.lower()):
        if tok in DYN:
            return DYN[tok]
    return 0


def take(name):
    """Première prise (rr1, _1…) d'abord."""
    m = re.search(r'(?:rr|_)(\d+)(?:_[A-Za-z]+)?\.wav$', name, re.I)
    return int(m[1]) if m else 1


def pick(files):
    """{ note: fichier } : une nuance moyenne-forte (milieu des nuances, arrondi vers le fort), première prise."""
    by = {}
    for f in files:
        m = NOTE_RE.search(os.path.basename(f))
        if m:
            by.setdefault(m[1], []).append(f)
    out = {}
    for note, fs in by.items():
        levels = sorted({strength(os.path.basename(f)) for f in fs})
        lv = levels[len(levels) // 2]
        cands = sorted((f for f in fs if strength(os.path.basename(f)) == lv), key=lambda f: (take(os.path.basename(f)), f))
        out[note] = cands[0]
    return out


def tree(dl):
    repo = os.path.join(dl, 'VSCO-2-CE')
    if not os.path.isdir(repo):
        subprocess.run(['git', 'clone', '-q', '--filter=blob:none', '--no-checkout', TREE, repo], check=True)
    return subprocess.run(['git', '-C', repo, 'ls-tree', '-r', '--name-only', 'HEAD'], capture_output=True, text=True, check=True).stdout.split('\n')


def load_pitch():
    spec = importlib.util.spec_from_file_location('sample_pitch', os.path.join(ROOT, 'tools', 'sample-pitch.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def file_name(note):
    return note.replace('#', 's') + '.mp3'


def convert(raw, out):
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', raw],
                               capture_output=True, text=True, check=True).stdout)
    af = ['-af', f'afade=t=out:st={MAX_S - FADE_S}:d={FADE_S}', '-t', str(MAX_S)] if dur > MAX_S else []
    os.makedirs(os.path.dirname(out), exist_ok=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', raw, *af, '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '112k', out], check=True)


def main():
    dl = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp(prefix='vsco-')
    os.makedirs(dl, exist_ok=True)
    files = [f for f in tree(dl) if f.lower().endswith('.wav')]
    sp = load_pitch()
    bank = {'_base': 'samples/vsco/'}
    lib, octs, tuning = [], {}, {}

    def job(args):
        key, src = args
        out = os.path.join(OUT, key, os.path.basename(src[1]))
        if not os.path.exists(out):
            convert(os.path.join(dl, 'VSCO-2-CE', src[0]), out)
        with open(out, 'rb') as f:
            m = sp.measure(sp.pcm(f.read()))
        return None if m is None else (m - sp.parse_note(src[2])) * 100

    chosen_by = {key: pick([f for f in files if os.path.dirname(f) == folder]) for key, folder, *_ in INSTRUMENTS}
    # une seule extraction git pour tous les fichiers retenus (raw.githubusercontent.com limite le nombre de requêtes)
    paths = [f for c in chosen_by.values() for f in c.values()]
    subprocess.run(['git', '-C', os.path.join(dl, 'VSCO-2-CE'), 'checkout', 'HEAD', '--', *paths], check=True)
    with ThreadPoolExecutor(8) as ex:
        for key, folder, label, family, release, prog in INSTRUMENTS:
            chosen = chosen_by[key]
            notes = sorted(chosen, key=sp.parse_note)
            if not notes:
                raise SystemExit('aucun échantillon : ' + folder)
            m = {n: f'{key}/{file_name(n)}' for n in notes}
            raws = list(ex.map(job, [(key, (chosen[n], m[n], n)) for n in notes]))
            octs['vsco:' + key] = sp.octave(raws)
            cents = [round(c) for c in sp.settle([None if r is None else sp.fine(r) for r in raws])]
            for n, c in zip(notes, cents):
                if abs(c) >= 3:
                    tuning['vsco:' + m[n]] = c
            bank[key] = m
            lib.append({'id': 'vsco_' + key, 'key': key, 'label': label, 'family': family, 'release': release, 'gm': prog})
            print(key, len(notes), 'notes, octave', octs['vsco:' + key], flush=True)

    with open(os.path.join(OUT, 'vsco.json'), 'w') as f:
        json.dump(bank, f, separators=(',', ':'))
    octs = {k: v for k, v in octs.items() if v}
    with open(os.path.join(ROOT, 'js', 'vsco.js'), 'w') as out:
        out.write(HEADER)
        out.write('SS.LIB.vsco = [\n' + ''.join(f'  {json.dumps(v, ensure_ascii=False)},\n' for v in lib) + '];\n')
        out.write('Object.assign(SS.MULTI_OCTAVE, {\n' + ''.join(f'  {json.dumps(k)}: {v},\n' for k, v in sorted(octs.items())) + '});\n')
        out.write('Object.assign(SS.MULTI_TUNING, {\n' + ''.join(f'  {json.dumps(k)}: {v},\n' for k, v in sorted(tuning.items())) + '});\n')


HEADER = '''/*
 * Orchestre VSCO 2 Community Edition (Versilian Studios, CC0) : instruments et accordage mesuré.
 * Généré par tools/vsco-local.py ; les échantillons sont dans samples/vsco/ (carte note -> fichier : vsco.json).
 * À charger après js/library.js et js/sample-tuning.js.
 */
window.SS = window.SS || {};
SS.LIB = SS.LIB || {};
SS.MULTI_OCTAVE = SS.MULTI_OCTAVE || {};
SS.MULTI_TUNING = SS.MULTI_TUNING || {};
'''

if __name__ == '__main__':
    main()
