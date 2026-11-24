#!/usr/bin/env python3
"""
Instruments libres (CC0) hors VSCO : copie locale, comme tools/vsco-local.py.

Sources (toutes sous Creative Commons CC0 1.0, voir samples/libre/LICENSE.txt) :
 - célesta : « A Sampled Celesta » de Neil Bickford (echo~parallax), https://gitlab.com/echoparallax/a-sampled-celesta
   (soundfont « Celesta Tuned Denoised Mix », stéréo) ;
 - basse aux doigts, guitare jazz, chœur synthétique : FreePats (https://freepats.zenvoid.org), banques SFZ+FLAC ;
 - crash inversée : la crash 17" de Big Rusty Drums (Karoryfer Samples, https://github.com/sfzinstruments/karoryfer.big-rusty-drums),
   micro de proximité et overheads mélangés, puis jouée à l'envers ;
 - tuba : War Tuba (Karoryfer Samples, CC0), tenues, micro statique ;
 - saxophones alto, ténor et baryton : MTG Solo Saxophones (Music Technology Group, Universitat Pompeu Fabra, sur
   freesound.org ; programmé en SFZ par kinwie), licence Creative Commons Attribution 4.0 : à citer (LICENSE.txt) ;
 - (saxophones et trombones : notes de 2 à 4 s, partie tenue bouclée en fondu enchaîné jusqu'à 6 s)
 - trombone ténor et trombone basse : University of Iowa Electronic Music Studios, Musical Instrument Samples (« may be
   downloaded and used for any projects, without restrictions »), notes isolées fortissimo.

Pour chaque instrument, le script garde un échantillon par note de référence, le raccourcit à MAX_S secondes avec
un fondu, l'encode en MP3 dans samples/libre/<instrument>/ et écrit samples/libre/libre.json (format des banques de
strudel) et js/libre.js (SS.LIB.libre, octave et écart fin mesurés comme pour VSCO).

Usage : python3 tools/libre-local.py [dossier de téléchargement]
        ONLY=sax_alto,tuba python3 tools/libre-local.py   (seulement ces instruments ; les autres sont gardés tels quels)
Nécessite numpy, ffmpeg, git, git-lfs, curl et 7z (paquet p7zip-full).
"""
import glob, importlib.util, json, os, re, struct, subprocess, sys, tempfile, wave
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'samples', 'libre')
MAX_S = 8
FADE_S = 0.5
CELESTA = 'https://gitlab.com/echoparallax/a-sampled-celesta'
CELESTA_SF2 = 'Samples/Celesta Tuned Denoised Mix.sf2'
RUSTY = 'https://github.com/sfzinstruments/karoryfer.big-rusty-drums'
FP = 'https://github.com/freepats/{}/releases/download/{}'
WARTUBA = 'https://github.com/sfzinstruments/karoryfer.war-tuba'
MTG = 'https://github.com/sfzinstruments/MTG.SoloSax'
IOWA = 'https://theremin.music.uiowa.edu/sound%20files/MIS%20Pitches%20-%202014/Brass/{0}/{1}.ff.{2}.stereo.aif'

# clé, libellé, famille de js/sounds.js, relâchement (s), programme General MIDI le plus proche, source
INSTRUMENTS = [
    ('celesta', 'Célesta (echo~parallax)', 'mallets', 0.9, 8, ('sf2', 3)),
    ('bass_finger', 'Basse électrique aux doigts (FreePats)', 'bass', 0.3, 33,
     ('sfz', FP.format('electric-bass-YR', '2019-09-30/FingerBassYR-SFZ+FLAC-20190930.7z'))),
    ('guitar_jazz', 'Guitare électrique jazz (FreePats)', 'guitar', 0.6, 26,
     ('sfz', FP.format('electric-guitar-FSBS-jazz', '2026-08-07/EGuitarFSBS-jazz-bridge-small-SFZ+FLAC-20260807.7z'))),
    ('choir_pad', 'Chœur synthétique (FreePats)', 'voices', 1.2, 52,
     ('sfz', FP.format('synth-pad-choir', '2020-05-16/SynthPadChoir-SFZ+FLAC-20200516.7z'))),
    ('reverse_crash', 'Crash inversée (Big Rusty Drums)', 'fx', 0.2, 119, ('reverse', 'G4')),
    # section de cuivres (js/horns.js) : un échantillon toutes les tierces mineures (STEP), le tuba tous les tons
    ('tuba', 'Tuba (War Tuba, Karoryfer)', 'brass', 0.3, 58, ('wartuba', 2)),  # tous les tons : 9 notes seulement à la tierce
    ('sax_alto', 'Sax alto (MTG)', 'winds', 0.25, 65, ('mtg', 'alt')),
    ('sax_tenor', 'Sax ténor (MTG)', 'winds', 0.25, 66, ('mtg', 'ten')),
    ('sax_bari', 'Sax baryton (MTG)', 'winds', 0.25, 67, ('mtg', 'bar')),
    ('trombone', 'Trombone (Iowa)', 'brass', 0.3, 57, ('iowa', ('Tenor Trombone', 'TenorTrombone', 40, 72))),
    # trombone basse : l'Iowa s'arrête au Mi♭2 ; au-dessus, le trombone ténor (même salle, même nuance)
    ('bass_trombone', 'Trombone basse (Iowa)', 'brass', 0.3, 57, ('iowa', ('Bass Trombone', 'BassTrombone', 25, 51), ('Tenor Trombone', 'TenorTrombone', 52, 67))),
]
STEP = 3  # demi-tons entre deux échantillons gardés (cuivres)

NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def note_name(midi):
    return f'{NAMES[midi % 12]}{midi // 12 - 1}'


def file_name(note):
    return note.replace('#', 's') + '.mp3'


def load_pitch():
    spec = importlib.util.spec_from_file_location('sample_pitch', os.path.join(ROOT, 'tools', 'sample-pitch.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ---------- célesta : soundfont (smpl + shdr), paires gauche/droite ----------
def sf2_samples(path):
    b = open(path, 'rb').read()

    def chunks(off, end):
        while off < end:
            cid, sz = b[off:off + 4], struct.unpack('<I', b[off + 4:off + 8])[0]
            yield cid, off + 8, sz
            off += 8 + sz + (sz & 1)

    found = {}
    for cid, o, sz in chunks(12, len(b)):
        if cid == b'LIST':
            for c2, o2, s2 in chunks(o + 4, o + sz):
                found[c2] = (o2, s2)
    smpl, (ho, hs) = found[b'smpl'][0], found[b'shdr']
    heads = []
    for i in range(hs // 46 - 1):
        r = b[ho + i * 46:ho + i * 46 + 46]
        start, end, _, _, rate = struct.unpack('<5I', r[20:40])
        heads.append({'name': r[:20].split(b'\0')[0].decode('latin1'), 'start': start, 'end': end, 'rate': rate,
                      'pitch': r[40], 'type': struct.unpack('<H', r[44:46])[0], 'link': struct.unpack('<H', r[42:44])[0]})
    return b, smpl, heads


def celesta(dl, step):
    repo = os.path.join(dl, 'a-sampled-celesta')
    if not os.path.isdir(repo):
        subprocess.run(['git', 'clone', '-q', '--depth', '1', CELESTA, repo], check=True, env={**os.environ, 'GIT_LFS_SKIP_SMUDGE': '1'})
    subprocess.run(['git', '-C', repo, 'lfs', 'pull', '--include', CELESTA_SF2], check=True)
    b, smpl, heads = sf2_samples(os.path.join(repo, CELESTA_SF2))
    heads = [dict(h, i=i) for i, h in enumerate(heads)]
    notes = [h for h in heads if re.match(r'[A-G]#?\d ', h['name'])]  # sans les bruits (« creak », « keyRelease »)
    out, low = {}, min(h['pitch'] for h in notes)
    for h in notes:
        if h['type'] != 4 or (h['pitch'] - low) % step:  # 4 = gauche ; la droite est liée par `link`
            continue
        r = heads[h['link']]
        n = h['end'] - h['start']
        left = b[smpl + 2 * h['start']:smpl + 2 * h['end']]
        right = b[smpl + 2 * r['start']:smpl + 2 * r['start'] + 2 * n]
        dst = os.path.join(dl, 'celesta-wav', note_name(h['pitch']) + '.wav')
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with wave.open(dst, 'wb') as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(h['rate'])
            frames = bytearray(4 * n)
            frames[0::4], frames[1::4], frames[2::4], frames[3::4] = left[0::2], left[1::2], right[0::2], right[1::2]
            w.writeframes(bytes(frames))
        out[note_name(h['pitch'])] = dst
    return out


# ---------- FreePats : archive 7z, régions SFZ (une par note de référence) ----------
def freepats(dl, url):
    arc = os.path.join(dl, os.path.basename(url))
    if not os.path.exists(arc):
        subprocess.run(['curl', '-sfL', '--retry', '3', '-o', arc, url], check=True)
    d = arc[:-3]
    if not os.path.isdir(d):
        subprocess.run(['7z', 'x', '-y', '-bso0', f'-o{d}', arc], check=True)
    sfz = glob.glob(os.path.join(d, '**', '*.sfz'), recursive=True)[0]
    text = re.sub(r'//.*', '', open(sfz, errors='ignore').read())
    out = {}
    for reg in text.split('<region>')[1:]:
        kv = dict(re.findall(r'(\w+)=(\S+)', reg))
        key = int(kv.get('pitch_keycenter') or kv.get('key') or kv['lokey'])
        out.setdefault(note_name(key), os.path.join(os.path.dirname(sfz), kv['sample']))
    return out


# ---------- crash inversée : Big Rusty Drums, crash 17", coup fort ----------
def reverse_crash(dl, note):
    repo = os.path.join(dl, 'big-rusty-drums')
    if not os.path.isdir(repo):
        subprocess.run(['git', 'clone', '-q', '--depth', '1', '--filter=blob:none', '--no-checkout', RUSTY, repo], check=True)
    mics = ['Samples/crash_17/cr/cl/cr_vl5_rr1.flac', 'Samples/crash_17/cr/oh/cr_vl5_rr1.flac']
    subprocess.run(['git', '-C', repo, 'checkout', 'HEAD', '--', *mics], check=True)
    dst = os.path.join(dl, 'reverse_crash.wav')
    ins = sum((['-i', os.path.join(repo, m)] for m in mics), [])
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *ins, '-filter_complex',
                    '[0:a]aformat=channel_layouts=stereo[a];[1:a]aformat=channel_layouts=stereo[b];'
                    '[a][b]amix=inputs=2:weights=0.8 1:normalize=0,atrim=0:1.8,areverse,afade=t=in:d=0.6', dst], check=True)
    return {note: dst}


# ---------- War Tuba (Karoryfer) : tenues « sus », micro statique (cnd) ----------
def wartuba(dl, step):
    repo = os.path.join(dl, 'karoryfer.war-tuba')
    if not os.path.isdir(repo):
        subprocess.run(['git', 'clone', '-q', '--depth', '1', '--filter=blob:none', '--no-checkout', WARTUBA, repo], check=True)
    names = subprocess.run(['git', '-C', repo, 'ls-tree', '-r', '--name-only', 'HEAD', 'Samples'], capture_output=True, text=True, check=True).stdout.split()
    pc = {'c': 0, 'db': 1, 'd': 2, 'eb': 3, 'e': 4, 'f': 5, 'gb': 6, 'g': 7, 'ab': 8, 'a': 9, 'bb': 10, 'b': 11}
    found = {}
    for n in names:
        m = re.match(r'Samples/([a-g]b?)(\d)_sus_cnd\.wav$', n)
        if m:
            found[12 * (int(m.group(2)) + 2) + pc[m.group(1)]] = n  # nom Karoryfer une octave sous la hauteur réelle (« f0 » = Fa1, mesuré)
    low = min(found)
    keep = {k: v for k, v in found.items() if (k - low) % step == 0}
    subprocess.run(['git', '-C', repo, 'checkout', 'HEAD', '--', *keep.values()], check=True)
    return {note_name(k): os.path.join(repo, v) for k, v in keep.items()}


# ---------- MTG Solo Saxophones : régions SFZ (Data/<sax>_f_rr1.txt), nuance forte, première prise ----------
def mtg(dl, sax):
    repo = os.path.join(dl, 'MTG.SoloSax')
    if not os.path.isdir(repo):
        subprocess.run(['git', 'clone', '-q', '--depth', '1', '--filter=blob:none', '--no-checkout', MTG, repo], check=True)
    base = 'MTG Solo Saxophones'
    subprocess.run(['git', '-C', repo, 'checkout', 'HEAD', '--', f'{base}/Data'], check=True)
    regs = []
    for line in open(os.path.join(repo, base, 'Data', f'{sax}_f_rr1.txt')):
        kv = dict(re.findall(r'(\w+)=(\S+)', line))
        if 'key' in kv and 'sample' in kv:
            regs.append((int(kv['key']), kv['sample'].replace('$EXT', 'flac'), float(kv.get('volume', 0))))
    low = min(r[0] for r in regs)
    keep = [r for r in regs if (r[0] - low) % STEP == 0]
    subprocess.run(['git', '-C', repo, 'checkout', 'HEAD', '--', *[f'{base}/Samples/{r[1]}' for r in keep]], check=True)
    out = {}
    for key, smp, vol in keep:  # volume de la région SFZ : égalise les notes entre elles
        dst = os.path.join(dl, f'mtg-{sax}', note_name(key) + '.wav')
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', os.path.join(repo, base, 'Samples', smp), '-af', f'volume={vol}dB', dst], check=True)
        extend(dst)
        out[note_name(key)] = dst
    return out


# ---------- tenue prolongée : notes courtes (2 à 4 s) bouclées en fondu enchaîné ----------
HOLD_S = 6.0  # durée visée : une tenue de cuivres sur une mesure lente
XF_S = 0.12


def extend(path, sr=44100):
    """Prolonge la partie tenue d'une note (après l'attaque, avant l'extinction) jusqu'à HOLD_S secondes."""
    import numpy as np
    x = np.frombuffer(subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '2', '-ar', str(sr), '-f', 'f32le', '-'],
                                     capture_output=True, check=True).stdout, np.float32).reshape(-1, 2)
    if len(x) / sr >= HOLD_S:
        return
    # partie tenue : de la fin de l'attaque au début de l'extinction, là où le niveau reste à 2 dB de son niveau médian
    w = int(0.05 * sr)
    env = np.array([20 * np.log10(np.sqrt(np.mean(x[i:i + w] ** 2)) + 1e-9) for i in range(0, len(x) - w, w)])
    med = np.median(env[int(0.3 * sr) // w:])
    ok = np.nonzero(env >= med - 2)[0]
    ok = ok[ok * w >= int(0.3 * sr)]
    if not len(ok):
        return
    a, b, xf = ok[0] * w + int(0.1 * sr), ok[-1] * w, int(XF_S * sr)
    if b - a < 4 * xf:
        return
    t = np.linspace(0, np.pi / 2, xf)[:, None]
    fin, fout = np.sin(t), np.cos(t)
    out, seg = x[:b].copy(), x[a:b]
    while len(out) < (HOLD_S - 0.5) * sr:  # un tour de plus de la partie tenue, fondu à puissance constante
        out = np.concatenate([out[:-xf], out[-xf:] * fout + seg[:xf] * fin, seg[xf:]])
    rel = x[b - xf:]  # puis l'extinction naturelle
    out = np.concatenate([out[:-xf], out[-xf:] * fout + rel[:xf] * fin, rel[xf:]])
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(sr), '-ac', '2', '-i', '-', path],
                   input=out.astype(np.float32).tobytes(), check=True)


# ---------- Iowa MIS : une note par fichier AIFF, silence du début retiré ----------
IOWA_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']


def iowa(dl, *specs):
    out = {}
    for folder, prefix, lo, hi in specs:
        out.update(iowa_range(dl, folder, prefix, lo, hi))
    return out


def iowa_range(dl, folder, prefix, lo, hi):
    out = {}
    for k in range(lo, hi + 1, STEP):
        name = f'{IOWA_NAMES[k % 12]}{k // 12 - 1}'
        raw = os.path.join(dl, 'iowa', f'{prefix}.{name}.aif')
        os.makedirs(os.path.dirname(raw), exist_ok=True)
        if not os.path.exists(raw):
            subprocess.run(['curl', '-sfL', '--retry', '3', '-o', raw, IOWA.format(folder.replace(' ', '%20'), prefix, name)], check=True)
        dst = raw[:-4] + '.wav'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB', dst], check=True)
        extend(dst)
        out[note_name(k)] = dst
    return out


def convert(raw, out):
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', raw],
                               capture_output=True, text=True, check=True).stdout)
    af = ['-af', f'afade=t=out:st={MAX_S - FADE_S}:d={FADE_S}', '-t', str(MAX_S)] if dur > MAX_S else []
    os.makedirs(os.path.dirname(out), exist_ok=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', raw, *af, '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '112k', out], check=True)


def main():
    dl = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp(prefix='libre-')
    os.makedirs(dl, exist_ok=True)
    sp = load_pitch()
    only = [k for k in os.environ.get('ONLY', '').split(',') if k]
    bank, lib, octs, tuning = {'_base': 'samples/libre/'}, [], {}, {}
    old = previous() if only else None
    for key, label, family, release, prog, (kind, *args) in INSTRUMENTS:
        if only and key not in only:  # instrument gardé tel quel (ONLY=…)
            bank[key] = old['bank'][key]
            lib.append(old['lib'][key])
            octs.update({k: v for k, v in old['octs'].items() if k == 'libre:' + key})
            tuning.update({k: v for k, v in old['tuning'].items() if k.startswith(f'libre:{key}/')})
            continue
        chosen = {'sf2': celesta, 'sfz': freepats, 'reverse': reverse_crash, 'wartuba': wartuba, 'mtg': mtg, 'iowa': iowa}[kind](dl, *args)
        notes = sorted(chosen, key=sp.parse_note)
        m = {n: f'{key}/{file_name(n)}' for n in notes}

        def job(n):
            out = os.path.join(OUT, m[n])
            convert(chosen[n], out)
            with open(out, 'rb') as f:
                v = sp.measure(sp.pcm(f.read()))
            return None if v is None else (v - sp.parse_note(n)) * 100

        with ThreadPoolExecutor(8) as ex:
            raws = list(ex.map(job, notes))
        if kind != 'reverse':  # un bruit de cymbale n'a pas de hauteur
            octs['libre:' + key] = sp.octave(raws)
            cents = [round(c) for c in sp.settle([None if r is None else sp.fine(r) for r in raws])]
            for n, c in zip(notes, cents):
                if abs(c) >= 3:
                    tuning['libre:' + m[n]] = c
        bank[key] = m
        lib.append({'id': 'libre_' + key, 'key': key, 'label': label, 'family': family, 'release': release, 'gm': prog})
        print(key, len(notes), 'notes, octave', octs.get('libre:' + key), flush=True)

    with open(os.path.join(OUT, 'libre.json'), 'w') as f:
        json.dump(bank, f, separators=(',', ':'))
    octs = {k: v for k, v in octs.items() if v}
    with open(os.path.join(ROOT, 'js', 'libre.js'), 'w') as out:
        out.write(HEADER)
        out.write('SS.LIB.libre = [\n' + ''.join(f'  {json.dumps(v, ensure_ascii=False)},\n' for v in lib) + '];\n')
        out.write('Object.assign(SS.MULTI_OCTAVE, {\n' + ''.join(f'  {json.dumps(k)}: {v},\n' for k, v in sorted(octs.items())) + '});\n')
        out.write('Object.assign(SS.MULTI_TUNING, {\n' + ''.join(f'  {json.dumps(k)}: {v},\n' for k, v in sorted(tuning.items())) + '});\n')


def previous():
    """Ce que le dernier passage a écrit (samples/libre/libre.json et js/libre.js), pour ONLY=…."""
    bank = json.load(open(os.path.join(OUT, 'libre.json')))
    text = open(os.path.join(ROOT, 'js', 'libre.js')).read()
    lib = {e['key']: e for e in map(json.loads, re.findall(r'^  (\{.*\}),$', text, re.M))}
    blocks = re.findall(r'Object\.assign\(SS\.(MULTI_OCTAVE|MULTI_TUNING), \{\n(.*?)\}\);', text, re.S)
    vals = {n: {k: int(v) for k, v in re.findall(r'^  ("[^"]+"): (-?\d+),$', b, re.M)} for n, b in blocks}
    unq = lambda d: {json.loads(k): v for k, v in d.items()}
    return {'bank': bank, 'lib': lib, 'octs': unq(vals.get('MULTI_OCTAVE', {})), 'tuning': unq(vals.get('MULTI_TUNING', {}))}


HEADER = '''/*
 * Instruments libres hors VSCO : célesta, basse, guitare jazz, chœur synthétique, crash inversée, tuba, saxophones
 * alto, ténor et baryton, trombones ténor et basse.
 * Généré par tools/libre-local.py ; les échantillons sont dans samples/libre/ (carte note -> fichier : libre.json,
 * sources et licences : samples/libre/LICENSE.txt). À charger après js/library.js et js/sample-tuning.js.
 */
window.SS = window.SS || {};
SS.LIB = SS.LIB || {};
SS.MULTI_OCTAVE = SS.MULTI_OCTAVE || {};
SS.MULTI_TUNING = SS.MULTI_TUNING || {};
'''

if __name__ == '__main__':
    main()
