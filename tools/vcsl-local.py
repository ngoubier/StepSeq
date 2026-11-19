#!/usr/bin/env python3
"""
Copie locale des échantillons VCSL que Chrome refuse de charger depuis GitHub.

raw.githubusercontent.com envoie le chemin du fichier dans l'en-tête Content-Disposition, sans guillemets.
Quand un dossier contient une virgule (« Grand Piano, Steinway B », « Kalimba, Kenya »…), Chrome lit deux
en-têtes et bloque la réponse (net::ERR_RESPONSE_HEADERS_MULTIPLE_CONTENT_DISPOSITION). Ce script télécharge ces
fichiers (pour les instruments et percussions de js/library.js), les raccourcit à MAX_S secondes avec un fondu et les
encode en MP3 dans samples/vcsl/. js/audio.js (SS.vcslLocal) va les chercher là.

VCSL est sous licence CC0 (domaine public) : la redistribution est libre.

Usage : python3 tools/vcsl-local.py [dossier de téléchargement]
Nécessite ffmpeg.
"""
import json, os, re, subprocess, sys, tempfile, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = 'https://raw.githubusercontent.com/felixroos/dough-samples/main/vcsl.json'
OUT = os.path.join(ROOT, 'samples', 'vcsl')
MAX_S = 10  # au-delà, la note est tenue très longtemps : on coupe avec un fondu
FADE_S = 0.5


def local_name(path):
    """Même règle que SS.vcslLocal (js/sounds.js) : chemin décodé, caractères spéciaux remplacés par « _ »."""
    p = urllib.parse.unquote(path)
    p = re.sub(r'[^A-Za-z0-9._/-]+', '_', p)
    return re.sub(r'\.wav$', '.mp3', p, flags=re.I)


def wanted_keys():
    lib = open(os.path.join(ROOT, 'js', 'library.js'), encoding='utf-8').read()
    data = json.loads(lib[lib.index('SS.LIB = ') + 9:].rstrip().rstrip(';'))
    return {v['key'] for v in data['vcsl']} | set(data['vcslPerc'])


def main():
    dl = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp(prefix='vcsl-')
    os.makedirs(dl, exist_ok=True)
    j = json.load(urllib.request.urlopen(SRC))
    base = j['_base']
    files = set()
    for k in wanted_keys():
        v = j.get(k)
        if v is None:
            continue
        for p in (v.values() if isinstance(v, dict) else v):
            p = p if isinstance(p, str) else p[0]
            if ',' in p or '%2C' in p:
                files.add(p)

    def one(p):
        out = os.path.join(OUT, local_name(p))
        if os.path.exists(out):
            return
        raw = os.path.join(dl, re.sub(r'[^A-Za-z0-9._-]+', '_', p))
        if not os.path.exists(raw):
            urllib.request.urlretrieve(base + p, raw)
        dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', raw],
                                   capture_output=True, text=True, check=True).stdout)
        af = []
        if dur > MAX_S:
            af = ['-af', f'afade=t=out:st={MAX_S - FADE_S}:d={FADE_S}', '-t', str(MAX_S)]
        os.makedirs(os.path.dirname(out), exist_ok=True)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', raw, *af, '-ar', '44100',
                        '-c:a', 'libmp3lame', '-b:a', '128k', out], check=True)

    with ThreadPoolExecutor(8) as ex:
        list(ex.map(one, sorted(files)))
    print(f'{len(files)} fichiers dans {os.path.relpath(OUT, ROOT)}')


if __name__ == '__main__':
    main()
