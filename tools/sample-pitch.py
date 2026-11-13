#!/usr/bin/env python3
"""
Mesure la hauteur réelle des échantillons des instruments mélodiques et écrit js/sample-tuning.js.

Couvre :
 - les soundfonts General MIDI (webaudiofont, js/library.js) : chaque zone est comparée à la hauteur que lui prête
   le fichier (originalPitch, coarseTune, fineTune) ;
 - les banques multi-échantillonnées (piano de strudel, VCSL, Dirt-Samples « multi ») : chaque fichier est comparé
   à la note de son nom.
Les banques Dirt-Samples à un seul échantillon ont leur propre outil (tools/dirt-pitch.py).

Pour les soundfonts, seul l'écart fin est corrigé (ramené à moins d'une demi-octave). Les banques multi reçoivent en
plus un décalage d'octave par instrument (SS.MULTI_OCTAVE) : la plupart des fichiers VCSL suivent la convention
Do3 = midi 60 et sonnaient une octave plus haut que la note jouée.
Une mesure n'est retenue que si la hauteur est stable (écart médian <= 0,2 demi-ton) et nette (clarté YIN >= 0,85).

Usage : python3 tools/sample-pitch.py [dossier de téléchargement]
Nécessite numpy, ffmpeg et node.
"""
import base64, json, os, re, subprocess, sys, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 44100
SF_BASE = 'https://raw.githubusercontent.com/felixroos/webaudiofontdata/master/sound/'
MULTI_SOURCES = {
    'piano': 'https://raw.githubusercontent.com/felixroos/dough-samples/main/piano.json',
    'vcsl': 'https://raw.githubusercontent.com/felixroos/dough-samples/main/vcsl.json',
    'dirt': 'https://raw.githubusercontent.com/tidalcycles/dirt-samples/main/strudel.json',
}
# Instruments dont la mesure d'octave est ambiguë (sons riches en harmoniques, trop peu d'échantillons nets) : même
# convention de nommage que l'instrument indiqué, enregistré dans les mêmes conditions.
OCTAVE_LIKE = {
    'vcsl:pipeorgan_loud': 'vcsl:pipeorgan_quiet',
    'vcsl:pipeorgan_loud_pedal': 'vcsl:pipeorgan_quiet_pedal',
    'vcsl:vibraphone_bowed': 'vcsl:vibraphone',
    'vcsl:balafon_hard': 'vcsl:balafon',
}
MAX_CENTS = 150  # au-delà, une correction n'est appliquée que si toute la banque la confirme


# ---------------- Mesure (YIN) ----------------

def pcm(data, fmt=None, rate=None):
    args = ['ffmpeg', '-v', 'quiet']
    if fmt:
        args += ['-f', fmt, '-ar', str(rate), '-ac', '1']
    args += ['-i', 'pipe:0', '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(args, input=data, capture_output=True).stdout, dtype=np.float32)


def yin(x, fmin=25, fmax=4200, th=0.15):
    x = x.astype(np.float64)
    W = len(x) // 2
    tmax, tmin = min(int(SR / fmin), W - 1), max(2, int(SR / fmax))
    N = 1 << (2 * len(x) - 1).bit_length()
    ac = np.fft.irfft(np.fft.rfft(x, N) * np.conj(np.fft.rfft(x[:W], N)), N)[: tmax + 2]
    cs = np.concatenate([[0], np.cumsum(x ** 2)])
    lags = np.arange(tmax + 2)
    d = cs[W] + cs[lags + W] - cs[lags] - 2 * ac
    d[0] = 0
    dn = np.ones_like(d)
    dn[1:] = d[1:] * np.arange(1, len(d)) / np.maximum(np.cumsum(d[1:]), 1e-12)
    for t in range(tmin, tmax):
        if dn[t] < th and dn[t] <= dn[t + 1]:
            a, b, c = dn[t - 1], dn[t], dn[t + 1]
            den = a - 2 * b + c
            return SR / (t + (0.5 * (a - c) / den if den else 0)), 1 - dn[t]
    return None, 0


def measure(x):
    """Hauteur médiane (midi, fractionnaire) de la partie stable du son, ou None."""
    if len(x) < 2048 or not np.abs(x).max():
        return None
    pk = np.abs(x).max()
    short = len(x) < 0.4 * SR
    start = int(0.012 * SR) if short else int(0.08 * SR)
    n = 4096 if len(x) > start + 4096 else 2048
    f0s, conf = [], []
    for s in range(start, min(len(x) - n, start + int(1.2 * SR)), n // 4):
        fr = x[s:s + n]
        if np.sqrt(np.mean(fr.astype(np.float64) ** 2)) < pk * 0.02:
            break
        f0, c = yin(fr)
        if f0:
            f0s.append(f0)
            conf.append(c)
    if not f0s:
        return None
    m = 69 + 12 * np.log2(np.array(f0s) / 440)
    med = float(np.median(m))
    if float(np.median(np.abs(m - med))) > 0.2 or float(np.median(conf)) < 0.85:
        return None
    return med


def fine(cents):
    """Écart ramené à moins d'une demi-octave (l'octave des fichiers est conservée)."""
    return cents - 1200 * round(cents / 1200)


def octave(raws):
    """Décalage d'octave (en demi-tons, positif = sonne trop haut) d'une banque à partir des écarts bruts mesurés
    (en centièmes), ou None si les mesures ne s'accordent pas : au moins 3 mesures, dont 60 % dans la même octave."""
    octs = [round(r / 1200) for r in raws if r is not None]
    if len(octs) < 3:
        return None
    best = max(set(octs), key=octs.count)
    return 12 * best if octs.count(best) >= 0.6 * len(octs) else None


def get(url, cache):
    path = os.path.join(cache, urllib.parse.unquote(url.split('/', 3)[3]))
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        urllib.request.urlretrieve(url, path)
    with open(path, 'rb') as f:
        return f.read()


def settle(devs):
    """Corrections (centièmes) d'une banque à partir des écarts mesurés (None = pas de mesure fiable).

    Avec au moins 3 mesures, la médiane de la banque sert de référence : un échantillon trop éloigné de la médiane
    (son inharmonique, mesure douteuse) ou non mesuré reçoit la médiane. Avec moins de 3 mesures, seuls les petits
    écarts sont corrigés."""
    ok = [d for d in devs if d is not None]
    if not ok:
        return [0] * len(devs)
    if len(ok) >= 3:
        med = float(np.median(ok))
        if abs(med) > 600 - 50:  # à mi-chemin entre deux octaves : ambigu
            return [0] * len(devs)
        return [d if d is not None and abs(d - med) <= 35 else med for d in devs]
    return [d if d is not None and abs(d) <= 50 else 0 for d in devs]


# ---------------- Soundfonts ----------------

def num(v):
    """Valeur numérique d'un champ webaudiofont, éventuellement écrite comme une somme (« 4200-140 »)."""
    return sum(float(t) for t in re.findall(r'[-+]?\s*[\d.]+', v.replace(' ', '')))


def zones(text):
    body = text[text.find('zones'):] if 'zones' in text else text
    out = []
    for m in re.finditer(r'\{([^{}]*)\}', body):
        z = {}
        for kv in re.finditer(r"(\w+)\s*:\s*(?:'([^']*)'|\"([^\"]*)\"|(-?[\d.]+(?:\s*[-+]\s*[\d.]+)*)|(true|false))", m[1]):
            k = kv[1]
            z[k] = kv[2] if kv[2] is not None else kv[3] if kv[3] is not None else num(kv[4]) if kv[4] is not None else kv[5] == 'true'
        if 'file' in z or 'sample' in z:
            out.append(z)
    return out


def sf_file(name, cache):
    text = get(SF_BASE + name + '.js', cache).decode('utf-8', 'replace')
    devs = []
    for z in zones(text):
        base = z.get('originalPitch', 6000) - 100 * (z.get('coarseTune') or 0) - (z.get('fineTune') or 0)
        if 'file' in z:
            x = pcm(base64.b64decode(z['file']))
        else:
            x = pcm(base64.b64decode(z['sample']), 's16le', int(z.get('sampleRate') or 44100))
        m = measure(x)
        devs.append(None if m is None else fine(m * 100 - base))
    return name, devs


# ---------------- Banques multi-échantillonnées ----------------

def parse_note(s):
    m = re.match(r'^([A-Ga-g])(#|s|b)?(-?\d+)$', s.strip())
    if not m:
        return None
    acc = 1 if m[2] in ('#', 's') else -1 if m[2] == 'b' else 0
    return {'c': 0, 'd': 2, 'e': 4, 'f': 5, 'g': 7, 'a': 9, 'b': 11}[m[1].lower()] + acc + (int(m[3]) + 1) * 12


def multi_entries(json_map):
    """Comme multiMap() de js/audio.js : [(note midi, chemin)]."""
    if isinstance(json_map, list):
        named = {}
        for f in json_map:
            nm = re.sub(r'\.[a-z0-9]+$', '', re.sub(r'^.*/', '', f), flags=re.I)
            m = re.search(r'(?:^|[^A-Za-z])([A-G][#sb]?-?\d)(?=[^0-9]|$)', nm)
            if m and m[1] not in named:
                named[m[1]] = f
        json_map = named
    out = []
    for note, path in json_map.items():
        path = path[0] if isinstance(path, list) else path
        n = parse_note(note)
        if n is not None:
            out.append((n, path))
    return out


def multi_sample(job, cache):
    bank, base, n, path = job
    url = base + (path if '%' in path else urllib.parse.quote(path))
    m = measure(pcm(get(url, cache)))
    return None if m is None else (m - n) * 100  # écart brut, octave comprise


def node(expr):
    js = "globalThis.window=globalThis;['library','dirt'].forEach(f=>require(%r+f+'.js'));" % (os.path.join(ROOT, 'js') + '/') + expr
    return json.loads(subprocess.run(['node', '-e', js], capture_output=True, text=True, check=True).stdout)


def main():
    cache = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '.sample-cache')
    sf_names = sorted(set(node('console.log(JSON.stringify(SS.LIB.gm.flatMap(g=>g.files)))')))
    banks = {
        'piano': ['piano'],
        'vcsl': node('console.log(JSON.stringify(SS.LIB.vcsl.map(v=>v.key)))'),
        'dirt': node('console.log(JSON.stringify(SS.DIRT_INSTRUMENTS.filter(d=>d.multi).map(d=>d.bank)))'),
    }
    sf, multi, octs = {}, {}, {}
    with ThreadPoolExecutor(10) as ex:
        for name, devs in ex.map(lambda f: sf_file(f, cache), sf_names):
            cents = [round(c) for c in settle(devs)]
            print(name, cents, flush=True)
            if any(abs(c) >= 3 for c in cents):
                sf[name] = [c if abs(c) >= 3 else 0 for c in cents]
        for bank, keys in banks.items():
            j = json.loads(get(MULTI_SOURCES[bank], cache))
            for key in keys:
                entries = multi_entries(j.get(key, {}))
                raws = list(ex.map(lambda e: multi_sample((bank, j['_base'], e[0], e[1]), cache), entries))
                octs[bank + ':' + key] = octave(raws)
                cents = [round(c) for c in settle([None if r is None else fine(r) for r in raws])]
                print(bank, key, octs[bank + ':' + key], cents, flush=True)
                for (n, path), c in zip(entries, cents):
                    if abs(c) >= 3:
                        multi[bank + ':' + path] = c
    for k, like in OCTAVE_LIKE.items():
        if k in octs:
            octs[k] = octs.get(like)
    octs = {k: v for k, v in octs.items() if v}
    with open(os.path.join(ROOT, 'js', 'sample-tuning.js'), 'w') as out:
        out.write(HEADER)
        out.write('SS.SF_TUNING = {\n' + ''.join(f'  {json.dumps(k)}: {json.dumps(v)},\n' for k, v in sorted(sf.items())) + '};\n')
        out.write('SS.MULTI_OCTAVE = {\n' + ''.join(f'  {json.dumps(k)}: {v},\n' for k, v in sorted(octs.items())) + '};\n')
        out.write('SS.MULTI_TUNING = {\n' + ''.join(f'  {json.dumps(k)}: {v},\n' for k, v in sorted(multi.items())) + '};\n')


HEADER = '''/*
 * Accordage des instruments échantillonnés, mesuré par tools/sample-pitch.py (algorithme YIN).
 * Certains échantillons ne sonnent pas exactement à la hauteur annoncée (jusqu'à 1,4 demi-ton pour une guitare
 * acoustique, 10 à 25 centièmes pour de nombreux pianos, xylophones ou basses) : deux instruments jouant la même
 * note sonnaient faux ensemble. Valeurs en centièmes de demi-ton (positif = l'échantillon sonne trop haut).
 *  - SS.SF_TUNING : soundfont -> correction de chaque zone, dans l'ordre du fichier ;
 *  - SS.MULTI_OCTAVE : « banque:instrument » multi -> décalage d'octave, en demi-tons (positif = sonne trop haut).
 *    La plupart des instruments VCSL (piano1, orgues, sax, flûtes à bec, harmonicas, xylophones…) suivent la
 *    convention Do3 = midi 60 et sonnaient une octave plus haut que la note jouée ; les projets enregistrés avant
 *    la correction (version 1) sont transposés à l'ouverture pour sonner comme avant (SS.migrateOctaves) ;
 *  - SS.MULTI_TUNING : « banque:chemin » d'un échantillon multi (piano, VCSL, Dirt-Samples) -> écart fin.
 */
window.SS = window.SS || {};
'''

if __name__ == '__main__':
    main()
