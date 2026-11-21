#!/usr/bin/env python3
"""
Batteries acoustiques AVL Drumkits (Glen MacArthur, licence CC BY-SA 4.0) : copie locale.

Trois kits enregistrés, distribués au format Hydrogen (.h2drumkit) sur SourceForge :
 - Black Pearl (Pearl, 4 fûts) : kit « pop » ;
 - Red Zeppelin (Ludwig, grosse caisse de 26") : kit « rock » ;
 - Blonde Bop (petit kit jazz Tama) : kit « ballade ».
Chaque élément y existe en 5 niveaux de frappe (du plus doux au plus fort) : le script les garde tous, retire le silence avant l'attaque, les raccourcit à
MAX_S secondes avec un fondu, les encode en MP3 dans samples/avl/<kit>/ et écrit samples/avl/avl.json au format des
banques de strudel : { "_base": "samples/avl/", "<kit>_<élément>": [niveau 1, …, niveau 5] }.
js/audio.js joue le niveau qui correspond à la vélocité du coup (SS.LAYERED_DRUM_LIBS).
Ces kits n'ont que deux toms : le tom aigu (ht) est le tom de 10"/12"/14" accordé 3 demi-tons plus haut.

Usage : python3 tools/avl-local.py [dossier de téléchargement]
Nécessite ffmpeg et curl.
"""
import json, os, subprocess, sys, tarfile, tempfile
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'samples', 'avl')
URL = 'https://sourceforge.net/projects/hydrogen/files/Sound%20Libraries/Main%20sound%20libraries/{}.h2drumkit/download'
MAX_S = 4.0
FADE_S = 0.6
LAYERS = 5

# clé, nom Hydrogen, élément StepSeq -> fichier (sans « -n.wav ») ; « fichier+3 » : accordé 3 demi-tons plus haut
KITS = [
    ('pop', 'AVLDrumkits-BlackPearl-2023', {
        'bd': '36-Pearl-22-Kick', 'sd': '38-Pearl-14-Snare', 'rim': '37-Pearl-14-SideStick', 'cp': '39-HandClap',
        'hh': '42-Sabian-13-HatClosed', 'oh': '46-Sabian-13-HatSemi', 'lt': '41-Pearl-16-FloorTom', 'mt': '45-Pearl-12-Tom',
        'ht': '45-Pearl-12-Tom+3', 'cr': '49-SabianAA-16-Crash', 'rd': '51-SabianAAX-20-Ride', 'cb': '56-Cowbell',
        'tb': '54-Tambourine', 'sh': '61-Maraca', 'perc': '53-SabianAAX-20-RideBell', 'misc': '55-Zildjian-10-Splash',
    }),
    ('rock', 'AVLDrumkits-RedZeppelin-2023', {
        'bd': '36-Ludwig-26-Kick', 'sd': '38-Ludwig-14-Snare', 'rim': '37-Ludwig-14-SideStick', 'cp': '39-HandClap',
        'hh': '42-Sabian-13-HatClosed', 'oh': '46-Sabian-13-HatSemi', 'lt': '41-Ludwig-16-FloorTom', 'mt': '45-Ludwig-14-Tom',
        'ht': '45-Ludwig-14-Tom+3', 'cr': '49-Zildjian-20-Crash', 'rd': '51-Zildjian-24-Ride', 'cb': '56-Cowbell',
        'tb': '54-Tambourine', 'sh': '61-Maraca', 'perc': '53-Zildjian-24-RideBell', 'misc': '55-Zildjian-10-Splash',
    }),
    ('ballade', 'AVLDrumkits-BlondeBop', {
        'bd': '36-TAMA-18-Kick', 'sd': '38-TAMA-13-Snare', 'rim': '37-TAMA-13-SideStick', 'cp': '39-HandClap',
        'hh': '42-Zildjian-13-HatClosed', 'oh': '46-Zildjian-13-HatSemi', 'lt': '41-TAMA-14-FloorTom', 'mt': '45-TAMA-10-Tom',
        'ht': '45-TAMA-10-Tom+3', 'cr': '49-Paiste2002-16-Crash', 'rd': '51-SabianAAX-20-RideTip', 'cb': '56-LP-1-Cowbell',
        'tb': '54-GP-10-Tambourine', 'sh': '61-GonBops-3-Shakers', 'perc': '53-SabianAAX-20-RideBell', 'misc': '55-Zildjian-10-Splash',
    }),
]


def fetch(name, dl):
    d = os.path.join(dl, name)
    if not os.path.isdir(d):
        arc = d + '.h2drumkit'
        if not os.path.exists(arc):
            subprocess.run(['curl', '-sL', '--retry', '3', '-o', arc, URL.format(name)], check=True)
        with tarfile.open(arc) as t:
            t.extractall(dl, filter='data')
    return d


def encode(src, dst, semis):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    # quelques prises (Blonde Bop surtout) commencent par 10 à 25 ms de silence : le coup tomberait en retard
    af = ['silenceremove=start_periods=1:start_threshold=0.004:start_silence=0.001']
    if semis:
        r = 2 ** (semis / 12)
        af.append(f'asetrate={round(44100 * r)},aresample=44100')
    af.append(f'atrim=0:{MAX_S},afade=t=out:st={MAX_S - FADE_S}:d={FADE_S}')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-af', ','.join(af), '-ac', '1', '-b:a', '128k', dst], check=True)


def main():
    dl = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp(prefix='avl-')
    bank, jobs = {'_base': 'samples/avl/'}, []
    for key, name, pieces in KITS:
        d = fetch(name, dl)
        for piece, f in pieces.items():
            f, _, semis = f.partition('+')
            files = []
            for n in range(1, LAYERS + 1):
                rel = f'{key}/{piece}-{n}.mp3'
                jobs.append((os.path.join(d, f'{f}-{n}.wav'), os.path.join(OUT, rel), int(semis or 0)))
                files.append(rel)
            bank[f'{key}_{piece}'] = files
    with ThreadPoolExecutor(8) as ex:
        list(ex.map(lambda j: encode(*j), jobs))
    with open(os.path.join(OUT, 'avl.json'), 'w') as fh:
        json.dump(bank, fh, separators=(',', ':'))
    print(len(jobs), 'fichiers dans', OUT)


if __name__ == '__main__':
    main()
