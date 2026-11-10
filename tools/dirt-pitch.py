#!/usr/bin/env python3
"""
Mesure la hauteur réelle des échantillons mélodiques Dirt-Samples (js/dirt.js) et écrit js/dirt-tuning.js.

Usage : python3 tools/dirt-pitch.py [dossier de téléchargement]
Nécessite numpy, ffmpeg et node. Les fichiers sont téléchargés depuis le dépôt tidalcycles/Dirt-Samples.
Méthode : YIN sur la partie stable du son (après l'attaque) ; médiane des trames. Un fichier n'est gardé que si
la hauteur est stable (écart médian <= 0,3 demi-ton) et nette (clarté YIN >= 0,88).
"""
import json, os, subprocess, sys, urllib.parse, urllib.request
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/master/'
SR = 44100


def files():
    js = "globalThis.window=globalThis;require(%r);for(const d of SS.DIRT_INSTRUMENTS)if(!d.multi)for(const f of d.files)console.log(f)" % os.path.join(ROOT, 'js', 'dirt.js')
    return sorted(set(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout.split('\n')) - {''})


def load(path):
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def yin(frame, fmin=30, fmax=2000, th=0.12):
    W = len(frame) // 2
    tmin, tmax = int(SR / fmax), min(int(SR / fmin), W - 1)
    d = np.array([np.sum((frame[:W] - frame[t:t + W]) ** 2) for t in range(tmax + 1)])
    c = np.cumsum(d[1:])
    dn = np.ones_like(d)
    dn[1:] = d[1:] * np.arange(1, len(d)) / np.maximum(c, 1e-12)
    for t in range(tmin, tmax):
        if dn[t] < th and dn[t] <= dn[t + 1]:
            a, b, cc = dn[t - 1], dn[t], dn[t + 1]
            den = a - 2 * b + cc
            return SR / (t + (0.5 * (a - cc) / den if den else 0)), 1 - dn[t]
    return None, 0


def measure(x):
    if len(x) < 1024:
        return None
    pk = np.abs(x).max()
    short = len(x) < 0.4 * SR
    start = int(0.012 * SR) if short else int(0.06 * SR)
    n = 4096 if len(x) > start + 4096 else 2048  # 4096 échantillons : jusqu'à 30 Hz (Do0 et au-dessus)
    f0s, confs = [], []
    for s in range(start, min(len(x) - n, start + int(1.5 * SR)), n // 4):
        fr = x[s:s + n].astype(np.float64)
        if np.sqrt(np.mean(fr ** 2)) < pk * (0.01 if short else 0.03):
            break
        f0, cf = yin(fr)
        if f0:
            f0s.append(f0)
            confs.append(cf)
    if not f0s:
        return None
    m = 69 + 12 * np.log2(np.array(f0s) / 440)
    med = float(np.median(m))
    return med, float(np.median(np.abs(m - med))), float(np.median(confs))


def main():
    dl = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '.dirt-cache')
    ok = {}
    for f in files():
        path = os.path.join(dl, f)
        if not os.path.exists(path):
            os.makedirs(os.path.dirname(path), exist_ok=True)
            urllib.request.urlretrieve(BASE + urllib.parse.quote(f), path)
        r = measure(load(path))
        print(f, r and [round(v, 2) for v in r])
        if r and r[1] <= 0.3 and r[2] >= 0.88:
            ok[f] = round(r[0], 2)
    lines = ',\n'.join(f'  {json.dumps(k)}: {v}' for k, v in sorted(ok.items()))
    with open(os.path.join(ROOT, 'js', 'dirt-tuning.js'), 'w') as out:
        out.write(HEADER)
        out.write('SS.DIRT_TUNING = {\n' + lines + ',\n};\n')


HEADER = '''/*
 * Accordage des banques mélodiques Dirt-Samples (js/dirt.js) à un seul échantillon par note.
 * Hauteur réelle de chaque fichier (note MIDI, centièmes compris), mesurée par tools/dirt-pitch.py (algorithme YIN
 * sur la partie stable du son). Sans cette table, un échantillon était supposé sonner en Do2 (midi 36) :
 * « arpy » jouait deux octaves trop haut et « jvbass » un triton à côté.
 * Les fichiers absents (bruits, glissandos, sons sans hauteur stable) gardent l'hypothèse de strudel (midi 36).
 */
window.SS = window.SS || {};
'''

if __name__ == '__main__':
    main()
