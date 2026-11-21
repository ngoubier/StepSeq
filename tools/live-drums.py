#!/usr/bin/env python3
"""
Batteries enregistrées (bibliothèque « live ») : copie locale de kits Hydrogen sous licence libre.

Kits (format Hydrogen .h2drumkit, téléchargés sur SourceForge, voir samples/live/LICENSE.txt) :
 - pop, rock, ballade : AVL Drumkits Black Pearl, Red Zeppelin, Blonde Bop (Glen MacArthur, CC BY-SA 4.0) ;
 - rods : Blonde Bop joué aux « hot rods » (fagots) (Glen MacArthur, CC BY-SA 4.0) ;
 - reggae : Blonde Bop accordé haut pour le reggae roots (Glen MacArthur, CC BY-SA 4.0) ;
 - cajon : Buskman's Holiday, cajón et percussions (Glen MacArthur, CC BY-SA 4.0) ;
 - tama : Forzee Stereo Drumkit (V. Sadovnikov, A. Belokurov, GPL 2), stéréo ;
 - pacific : Pacific de Bransin James Anderson (CC BY-SA 3.0 US), stéréo.
Chaque élément y existe en plusieurs niveaux de frappe : le script les garde tous (du plus doux au plus fort, d'après les
plages de vélocité de drumkit.xml), retire le silence avant l'attaque, les raccourcit à MAX_S secondes avec un fondu,
les encode en MP3 dans samples/live/<kit>/ et écrit samples/live/live.json au format des banques de strudel :
{ "_base": "samples/live/", "<kit>_<élément>": [niveau 1, …, niveau n] }.
js/audio.js joue le niveau qui correspond à la vélocité du coup (SS.LAYERED_DRUM_LIBS).
Instrument « Nom+3 » : accordé 3 demi-tons plus haut (tom aigu des kits à deux toms, kit reggae) ; « =banque » : banque d'un autre kit.

Usage : python3 tools/live-drums.py [dossier de téléchargement]
Nécessite ffmpeg et curl.
"""
import json, os, re, subprocess, sys, tarfile, tempfile, glob
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'samples', 'live')
URL = 'https://sourceforge.net/projects/hydrogen/files/Sound%20Libraries/Main%20sound%20libraries/{}.h2drumkit/download'
MAX_S = 4.0
FADE_S = 0.6

# clé, nom Hydrogen, stéréo, élément StepSeq -> instrument de drumkit.xml
KITS = [
    ('pop', 'AVLDrumkits-BlackPearl-2023', False, {
        'bd': 'Pearl-22-Kick', 'sd': 'Pearl-14-Snare', 'rim': 'Pearl-14-SideStick', 'cp': 'HandClap',
        'hh': 'Sabian-13-HatClosed', 'oh': 'Sabian-13-HatSemi', 'lt': 'Pearl-16-FloorTom', 'mt': 'Pearl-12-Tom',
        'ht': 'Pearl-12-Tom+3', 'cr': 'Sabian-16-Crash', 'rd': 'Sabian-20-Ride', 'cb': 'Cowbell',
        'tb': 'Tambourine', 'sh': 'Maracas', 'perc': 'Sabian-20-RideBell', 'misc': 'Zildjian-10-Splash',
    }),
    ('rock', 'AVLDrumkits-RedZeppelin-2023', False, {
        'bd': 'Ludwig-26-Kick', 'sd': 'Ludwig-14-Snare', 'rim': 'Ludwig-14-SideStick', 'cp': 'HandClap',
        'hh': 'Sabian-13-HatClosed', 'oh': 'Sabian-13-HatSemi', 'lt': 'Ludwig-16-FloorTom', 'mt': 'Ludwig-14-Tom',
        'ht': 'Ludwig-14-Tom+3', 'cr': 'Zildjian-20-Crash', 'rd': 'Zildjian-24-Ride', 'cb': 'Cowbell',
        'tb': 'Tambourine', 'sh': 'Maracas', 'perc': 'Zildjian-24-RideBell', 'misc': 'Zildjian-10-Splash',
    }),
    ('ballade', 'AVLDrumkits-BlondeBop', False, {
        'bd': 'TAMA-18-Kick', 'sd': 'TAMA-13-SnareCenter', 'rim': 'TAMA-13-SideStick', 'cp': 'HandClap',
        'hh': 'Zildjian-13-HatClosed', 'oh': 'Zildjian-13-HatSemi', 'lt': 'TAMA-14-FlrTomCenter', 'mt': 'TAMA-10-TomCenter',
        'ht': 'TAMA-10-TomCenter+3', 'cr': 'Paiste-16-Crash', 'rd': 'Sabian-20-RideTip', 'cb': 'LP-Cowbell',
        'tb': 'GP-10-Tambourine', 'sh': 'GonBops-Shaker', 'perc': 'Sabian-20-RideBell', 'misc': '55-Zildjian-10-Splash-5',
    }),
    ('rods', 'AVLDrumkits-BlondeBop-HotRod', False, {
        'bd': 'TAMA-18-Kick', 'sd': 'TAMA-13-SnareCenter', 'rim': 'TAMA-13-SideStick', 'cp': 'HandClap',
        'hh': 'Zildjian-13-HatClosed', 'oh': 'Zildjian-13-HatSemi', 'lt': 'TAMA-14-FlrTomCenter', 'mt': 'TAMA-10-TomCenter',
        'ht': 'TAMA-10-TomCenter+3', 'cr': 'Paiste-16-Crash', 'rd': 'Sabian-20-RideTip', 'cb': 'LP-Cowbell',
        'tb': 'GP-10-Tambourine', 'sh': 'GonBops-Shaker', 'perc': 'Sabian-20-RideBell', 'misc': 'Zildjian-10-Splash',
    }),
    ('cajon', 'AVLDrumkits-BuskmansHoliday', False, {
        'bd': 'CajonThump', 'sd': 'CajonSlapRH', 'rim': 'StickClick', 'cp': 'HandClap', 'hh': 'Shaker', 'oh': 'BumpTambourine',
        'lt': 'LargeCongaRH', 'mt': 'SmallCongaLH', 'ht': 'SmallCongaRH', 'cr': 'Cymbal', 'rd': 'CymbalBell', 'cb': 'Cowbell',
        'tb': 'Tambourine', 'sh': 'Shaker', 'perc': 'Claves', 'misc': 'FootStomp',
    }),
    # reggae roots : le petit kit jazz Blonde Bop accordé haut (caisse claire sèche et aiguë, cross-stick, toms en timbales)
    ('reggae', 'AVLDrumkits-BlondeBop', False, {
        'bd': 'TAMA-18-Kick+1', 'sd': 'TAMA-13-SnareCenter+4', 'rim': 'TAMA-13-SideStick+3', 'cp': 'HandClap',
        'hh': 'Zildjian-13-HatClosed', 'oh': 'Zildjian-13-HatSemi', 'lt': 'TAMA-14-FlrTomCenter+5', 'mt': 'TAMA-10-TomCenter+3',
        'ht': 'TAMA-10-TomCenter+7', 'cr': 'Paiste-16-Crash', 'rd': 'Sabian-20-RideTip', 'cb': 'LP-Cowbell',
        'tb': 'GP-10-Tambourine', 'sh': 'GonBops-Shaker', 'perc': 'TAMA-13-SnareEdge+4', 'misc': '55-Zildjian-10-Splash-5',
    }),
    ('tama', 'ForzeeStereo', True, {
        'bd': 'Kick (Tama Superstar 22")', 'sd': 'Snare (Pearl Free Floating Maple 14x3.5)',
        'rim': 'Rim Click (Pearl Free Floating Maple 14x3.5)', 'cp': '=pop_cp',
        'hh': 'Hi-Hat Closed (Paiste Alpha Metal edge 14")', 'oh': 'Hi-Hat Semiopen (Paiste Alpha Metal edge 14")',
        'lt': 'Tom Low (Tama Superstar 16")', 'mt': 'Tom Mid (Tama Superstar 13")', 'ht': 'Tom High (Tama Superstar 12")',
        'cr': 'Crash (Paiste Rude Thin 18")', 'rd': 'Ride Bow (Custom, Zagrebin 22")', 'cb': 'Agogo High (Pearl ECB-23)',
        'tb': 'Tambourine (Pearl PTM-10GH)', 'sh': '=pop_sh', 'perc': 'Ride Bell (Custom, Zagrebin 22")',
        'misc': 'Splash (Paiste Rude 10")',
    }),
    ('pacific', 'BJA_Pacific', True, {
        'bd': 'BassDrum', 'sd': 'Snare', 'rim': '=pop_rim', 'cp': '=pop_cp', 'hh': 'Hi Hat Closed', 'oh': 'Hi Hat Opened',
        'lt': 'Floor Tom', 'mt': 'Tom', 'ht': 'Tom+3', 'cr': 'Crash Left', 'rd': 'Ride', 'cb': '=pop_cb', 'tb': '=pop_tb',
        'sh': '=pop_sh', 'perc': 'Ride Bell', 'misc': 'Crash Right',
    }),
]


def fetch(name, dl):
    d = os.path.join(dl, name)
    if not glob.glob(os.path.join(d, '**', 'drumkit.xml'), recursive=True):
        arc = d + '.h2drumkit'
        if not os.path.exists(arc):
            subprocess.run(['curl', '-sL', '--retry', '3', '-o', arc, URL.format(name)], check=True)
        os.makedirs(d, exist_ok=True)
        with tarfile.open(arc) as t:
            t.extractall(d, filter='data')
    return glob.glob(os.path.join(d, '**', 'drumkit.xml'), recursive=True)[0]


def layers(xml):
    """Instrument -> fichiers de ses niveaux de frappe, du plus doux au plus fort."""
    s, d, out = open(xml, errors='ignore').read(), os.path.dirname(xml), {}
    for inst in re.findall(r'<instrument>(.*?)</instrument>', s, re.S):
        name = re.search(r'<name>(.*?)</name>', inst).group(1).replace('&quot;', '"')
        lay = re.findall(r'<filename>(.*?)</filename>\s*<min>(.*?)</min>\s*<max>(.*?)</max>', inst)
        if lay:
            out[name] = [os.path.join(d, f) for f, lo, _ in sorted(lay, key=lambda l: float(l[1]))]
    return out


def encode(src, dst, semis, stereo):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    # quelques prises commencent par 10 à 25 ms de silence : le coup tomberait en retard
    af = ['silenceremove=start_periods=1:start_threshold=0.004:start_silence=0.001']
    if semis:
        af.append(f'aresample=44100,asetrate={round(44100 * 2 ** (semis / 12))},aresample=44100')
    af.append(f'atrim=0:{MAX_S},afade=t=out:st={MAX_S - FADE_S}:d={FADE_S}')
    ac = ['-ac', '2', '-b:a', '160k'] if stereo else ['-ac', '1', '-b:a', '128k']
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-af', ','.join(af), '-ar', '44100', *ac, dst], check=True)


def main():
    dl = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp(prefix='live-drums-')
    bank, jobs = {'_base': 'samples/live/'}, []
    for key, name, stereo, pieces in KITS:
        lay = layers(fetch(name, dl))
        for piece, inst in pieces.items():
            if inst.startswith('='):
                bank[f'{key}_{piece}'] = bank[inst[1:]]
                continue
            inst, _, semis = inst.partition('+')
            files = []
            for n, src in enumerate(lay[inst], 1):
                rel = f'{key}/{piece}-{n}.mp3'
                jobs.append((src, os.path.join(OUT, rel), int(semis or 0), stereo))
                files.append(rel)
            bank[f'{key}_{piece}'] = files
    with ThreadPoolExecutor(8) as ex:
        list(ex.map(lambda j: encode(*j), jobs))
    with open(os.path.join(OUT, 'live.json'), 'w') as fh:
        json.dump(bank, fh, separators=(',', ':'))
    print(len(jobs), 'fichiers dans', OUT)


if __name__ == '__main__':
    main()
