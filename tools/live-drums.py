#!/usr/bin/env python3
"""
Batteries enregistrées (bibliothèque « live ») : copie locale de kits Hydrogen sous licence libre.

Kits (format Hydrogen .h2drumkit, téléchargés sur SourceForge, voir samples/live/LICENSE.txt) :
 - pop, rock, ballade : AVL Drumkits Black Pearl, Red Zeppelin, Blonde Bop (Glen MacArthur, CC BY-SA 4.0) ;
 - rods : Blonde Bop joué aux « hot rods » (fagots) (Glen MacArthur, CC BY-SA 4.0) ;
 - reggae : Blonde Bop accordé haut pour le reggae roots (Glen MacArthur, CC BY-SA 4.0) ;
 - cajon : Buskman's Holiday, cajón et percussions (Glen MacArthur, CC BY-SA 4.0) ;
 - tama : Forzee Stereo Drumkit (V. Sadovnikov, A. Belokurov, GPL 2), stéréo ;
 - pacific : Pacific de Bransin James Anderson (CC BY-SA 3.0 US), stéréo ;
 - christmas : Big Rusty Drums (Karoryfer Samples, CC0, micros de proximité et overheads mélangés, crash inversée),
   claps de FreePats World and Rare Percussion (CC0), grelots, tambourins et timbales d'orchestre de la Versilian
   Community Sample Library (VCSL, Versilian Studios, CC0) ;
 - salsa : congas, tumba, quinto, bongos, cloches, claves, güiro et maracas de la VCSL (CC0), timbales de la banque
   General MIDI FluidR3 (Frank Wen, MIT ; via webaudiofontdata) ; cáscara (coque des timbales) au woodblock VCSL. Un seul élément y change de frappe avec la vélocité :
   congas (talon et pointe, slap, ouverte), bongos (martillo étouffé, ouvert, grave), campana (col, bouche), güiro
   (coup court, long grattage).
Chaque élément y existe en plusieurs niveaux de frappe : le script les garde tous (du plus doux au plus fort, d'après les
plages de vélocité de drumkit.xml), retire le silence avant l'attaque, les raccourcit à MAX_S secondes avec un fondu,
les encode en MP3 dans samples/live/<kit>/ et écrit samples/live/live.json au format des banques de strudel :
{ "_base": "samples/live/", "<kit>_<élément>": [niveau 1, …, niveau n] }.
js/audio.js joue le niveau qui correspond à la vélocité du coup (SS.LAYERED_DRUM_LIBS).
Instrument « Nom+3 » : accordé 3 demi-tons plus haut (tom aigu des kits à deux toms, kit reggae) ; « Nom~0.3 » : son
étouffé (raccourci à 0,3 s avec un long fondu, caisse claire sèche du reggae) ; « =banque » : banque d'un autre kit ;
« vcsl:fichier|fichier… » : échantillons VCSL (chemins sous VCSL_URL), rangés ensuite du plus doux au plus fort ;
« vcsl-ordre:fichier|… » : idem, gardés dans l'ordre donné (une manière de jouer par niveau de vélocité) ;
« gm:note|note… » : sons de la batterie General MIDI FluidR3 (numéro de note), dans l'ordre donné ;
« freepats:Dossier » : prises de FreePats World and Rare Percussion ; « rusty:dossier:micros » : Big Rusty Drums
(« rusty-reverse: » joue la crash à l'envers).

Usage : python3 tools/live-drums.py [dossier de téléchargement] [--only kit,kit…]
(--only refait seulement ces kits et garde les autres banques de live.json)
Nécessite ffmpeg, curl et git (christmas : aussi 7z, paquet p7zip-full).
"""
import json, os, re, subprocess, sys, tarfile, tempfile, glob
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'samples', 'live')
URL = 'https://sourceforge.net/projects/hydrogen/files/Sound%20Libraries/Main%20sound%20libraries/{}.h2drumkit/download'
VCSL_URL = 'https://raw.githubusercontent.com/sgossner/VCSL/master/'
RUSTY = 'https://github.com/sfzinstruments/karoryfer.big-rusty-drums'
CONGA = 'Membranophones/Struck Membranophones/Conga/'  # dossiers VCSL du kit salsa
BONGO = 'Membranophones/Struck Membranophones/Bongos/'
IDIO = 'Idiophones/Struck Idiophones/'
GM_URL = 'https://raw.githubusercontent.com/felixroos/webaudiofontdata/master/sound/128{}_0_FluidR3_GM_sf2_file.js'
FREEPATS_PERC = 'https://github.com/freepats/world-percussion/releases/download/2020-09-05/WorldPercussion-SFZ+FLAC-20200905.7z'
RUSTY_LAYERS = 5  # niveaux de frappe gardés, répartis du plus doux au plus fort
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
        'bd': 'TAMA-18-Kick+1', 'sd': 'TAMA-13-SnareCenter+4~0.28', 'rim': 'TAMA-13-SideStick+3~0.22', 'cp': 'HandClap',
        'hh': 'Zildjian-13-HatClosed', 'oh': 'Zildjian-13-HatSemi', 'lt': 'TAMA-14-FlrTomCenter+5', 'mt': 'TAMA-10-TomCenter+3',
        'ht': 'TAMA-10-TomCenter+7', 'cr': 'Paiste-16-Crash', 'rd': 'Sabian-20-RideTip', 'cb': 'LP-Cowbell',
        'tb': 'GP-10-Tambourine', 'sh': 'GonBops-Shaker', 'perc': 'TAMA-13-SnareEdge+4~0.28', 'misc': '55-Zildjian-10-Splash-5',
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
    # Noël : batterie Big Rusty Drums (Karoryfer, CC0 ; micro de proximité + overheads), claps FreePats (CC0),
    # grelots, tambourin et timbales VCSL (CC0) ; cloche de ride sur cb, crash inversée sur misc
    ('christmas', None, True, {
        'bd': 'rusty:kick_24/kick:kick,oh', 'sd': 'rusty:snare_14/center:top,oh', 'rim': 'rusty:snare_14/sidestick:top,oh',
        'hh': 'rusty:hihat_14/cl:cl,oh', 'oh': 'rusty:hihat_14/open:cl,oh', 'lt': 'rusty:tom_18/center:cl,oh',
        'mt': 'rusty:tom_15/center:cl,oh', 'ht': 'rusty:tom_14/center:cl,oh', 'cr': 'rusty:crash_17/cr:cl,oh',
        'rd': 'rusty:ride_22/rd:cl,oh', 'cb': 'rusty:ride_22/bl:cl,oh', 'misc': 'rusty-reverse:crash_17/cr:cl,oh',
        'cp': 'freepats:HandClap',
        'sh': 'vcsl:' + '|'.join(f'Idiophones/Struck Idiophones/Sleigh Bells/{f}.wav' for f in (
            'Sleighbells_Hit_rr1_Mid', 'Sleighbells_Hit_rr2_Mid', 'sleighbell2_hit_2', 'sleighbell2_hit_loud')),
        'tb': 'vcsl:' + '|'.join(f'Idiophones/Struck Idiophones/Tambourine {f}_Mid.wav' for f in (
            '1/Tamb1_Hit_v1_rr1', '1/Tamb1_Hit_v2_rr1', '2/Tamb2_Hit_v1_rr1', '2/Tamb2_Hit_v2_rr2')),
        'perc': 'vcsl:' + '|'.join(f'Membranophones/Struck Membranophones/Timpani 1/Hit/Timpani1_Hit_{v}_Sum.wav' for v in (
            'v2_rr1', 'v3_rr3', 'v4_rr1')),
    }),
    # salsa : percussions latines enregistrées (VCSL) et timbales General MIDI ; les congas, bongos, la campana et le
    # güiro changent de manière de jouer avec la vélocité (motifs « Salsa 2-3 » de js/drum-patterns.js, Percussionniste
    # « Salsa » de js/bandsong.js) ; cymbales empruntées au kit pop
    ('salsa', None, False, {
        'bd': 'vcsl:' + '|'.join(f'{CONGA}Tumba_HitN_{v}_rr1_Sum.wav' for v in ('v1', 'v2', 'v3', 'v4')),
        'sd': 'gm:66|66|65',
        'rim': 'vcsl:' + '|'.join(f'{IDIO}Woodblock/wood_click_{v}.wav' for v in ('pp_rr1', 'mp', 'f_rr1')),
        'cp': 'vcsl:' + '|'.join(f'{IDIO}Claves/Claves1_Hit_{v}_rr1_Mid.wav' for v in ('v1', 'v2', 'v3')),
        'hh': 'vcsl-ordre:' + '|'.join(f'{IDIO}Guiro/Guiro_Hit_{r}_Mid.wav' for r in ('rr1', 'rr2', 'rr1')),
        'oh': 'vcsl-ordre:' + '|'.join(f'{IDIO}Cowbells/Cowbell1_{f}_Mid.wav' for f in (
            'Muted_v2_rr1', 'Muted_v2_rr1', 'Muted_v3_rr1', 'Muted_v3_rr1', 'Hit_v4_rr1')),
        'cb': 'vcsl-ordre:' + '|'.join(f'{IDIO}Cowbells/Cowbell2_Normal_{v}_rr1_Mid.wav' for v in ('v2', 'v2', 'v3')),
        'perc': 'vcsl-ordre:' + '|'.join(f'{CONGA}{f}_Sum.wav' for f in (
            'Conga_HitFM_v1_rr1', 'Conga_HitFM_v1_rr2', 'Conga_HitFM_v2_rr1', 'Quinto_HitFM1_v2_rr1', 'Conga_HitN_v3_rr1')),
        'misc': 'vcsl-ordre:' + '|'.join(f'{BONGO}{f}_Mid.wav' for f in (
            'BongoH_HitMuted1_v1_rr1', 'BongoH_HitMuted1_v2_rr1', 'BongoH_HitMuted1_v3_rr1', 'BongoH_Hit1_v2_rr1', 'BongoL_Hit1_v3_rr1')),
        'lt': 'vcsl:' + '|'.join(f'{CONGA}Tumba_HitN_{v}_rr2_Sum.wav' for v in ('v2', 'v3', 'v4')),
        'mt': 'vcsl:' + '|'.join(f'{CONGA}Conga_HitN_{v}_rr2_Sum.wav' for v in ('v1', 'v2', 'v3')),
        'ht': 'vcsl:' + '|'.join(f'{CONGA}Quinto_HitN_{v}_rr2_Sum.wav' for v in ('v1', 'v2', 'v3')),
        'sh': 'vcsl-ordre:' + '|'.join(f'{IDIO}Guiro/Guiro_{f}_Mid.wav' for f in ('Hit_rr1', 'Hit_rr2', 'Hit_rr1', 'Hit_rr2', 'Med_rr1')),
        'tb': 'vcsl-ordre:' + '|'.join(f'{IDIO}Shaker, Small/Mid_Shaker_Slap_{r}.wav' for r in ('rr1', 'rr2', 'rr1')),
        'cr': '=pop_cr', 'rd': '=pop_rd',
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


def fetch_vcsl(paths, dl, ordered=False):
    """Échantillons VCSL téléchargés, du plus doux au plus fort (crête mesurée par ffmpeg), et le gain (dB) qui amène
    le plus fort à −1 dBFS : les niveaux de frappe gardent leurs écarts, l'élément sonne aussi fort qu'une batterie."""
    out = []
    for rel in paths:
        dst = os.path.join(dl, 'vcsl', rel)
        if not os.path.exists(dst):
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            subprocess.run(['curl', '-sfL', '--retry', '3', '-o', dst, VCSL_URL + rel.replace(' ', '%20').replace('#', '%23')], check=True)
        out.append(dst)
    return peak_sorted(out, ordered)


def fetch_gm(notes, dl):
    """Sons de la batterie General MIDI FluidR3 (webaudiofontdata : MP3 en base64 dans un fichier JS), dans l'ordre donné."""
    import base64
    out = []
    for n in notes:
        dst = os.path.join(dl, 'gm', f'{n}.mp3')
        if not os.path.exists(dst):
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            js = subprocess.run(['curl', '-sfL', '--retry', '3', GM_URL.format(n)], capture_output=True, text=True, check=True).stdout
            open(dst, 'wb').write(base64.b64decode(re.search(r"file:'([^']+)'", js).group(1)))
        out.append(dst)
    return peak_sorted(out, True)


def fetch_rusty(spec, dl, reverse=False):
    """Big Rusty Drums : « dossier:micro,micro » -> un fichier stéréo par niveau gardé (première prise), les micros
    mélangés (proximité au centre + overheads) ; reverse : joué à l'envers (crash inversée, 3 s)."""
    folder, mics = spec.split(':')
    mics = mics.split(',')
    repo = os.path.join(dl, 'big-rusty-drums')
    if not os.path.isdir(repo):
        subprocess.run(['git', 'clone', '-q', '--depth', '1', '--filter=blob:none', '--no-checkout', RUSTY, repo], check=True)
    names = subprocess.run(['git', '-C', repo, 'ls-tree', '--name-only', 'HEAD', f'Samples/{folder}/{mics[0]}/'],
                           capture_output=True, text=True, check=True).stdout.split()
    vls = sorted({int(m[1]) for n in names for m in [re.search(r'_vl(\d+)_rr1\.flac$', n)] if m})
    keep = sorted({vls[round(i * (len(vls) - 1) / (RUSTY_LAYERS - 1))] for i in range(RUSTY_LAYERS)})
    if reverse:
        keep = keep[-3:]
    base = re.sub(r'_vl\d+_rr1\.flac$', '', os.path.basename(next(n for n in names if '_rr1.flac' in n)))
    rel = [f'Samples/{folder}/{mic}/{base}_vl{v}_rr1.flac' for v in keep for mic in mics]
    subprocess.run(['git', '-C', repo, 'checkout', 'HEAD', '--', *rel], check=True)
    out = []
    for v in keep:
        dst = os.path.join(dl, 'rusty-mix', folder.replace('/', '_') + ('_rev' if reverse else '') + f'_vl{v}.wav')
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        ins = sum((['-i', os.path.join(repo, f'Samples/{folder}/{mic}/{base}_vl{v}_rr1.flac')] for mic in mics), [])
        mix = ''.join(f'[{i}:a]aformat=channel_layouts=stereo[m{i}];' for i in range(len(mics)))
        mix += ''.join(f'[m{i}]' for i in range(len(mics))) + f'amix=inputs={len(mics)}:normalize=0'
        if reverse:
            mix += ',atrim=0:3,areverse,afade=t=in:d=0.4'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', *ins, '-filter_complex', mix, dst], check=True)
        out.append(dst)
    return out


def fetch_freepats(folder, dl):
    """FreePats World and Rare Percussion : les prises d'un instrument, rangées comme fetch_vcsl."""
    arc = os.path.join(dl, os.path.basename(FREEPATS_PERC))
    if not os.path.exists(arc):
        subprocess.run(['curl', '-sfL', '--retry', '3', '-o', arc, FREEPATS_PERC], check=True)
    d = arc[:-3]
    if not os.path.isdir(d):
        subprocess.run(['7z', 'x', '-y', '-bso0', f'-o{d}', arc], check=True)
    files = sorted(glob.glob(os.path.join(d, '**', 'samples', folder, '*.flac'), recursive=True))
    return peak_sorted(files)


def peak_sorted(files, ordered=False):
    """(fichiers du plus doux au plus fort, ou dans l'ordre donné si ordered ; gain qui amène le plus fort à −1 dBFS)."""
    out = []
    for f in files:
        r = subprocess.run(['ffmpeg', '-i', f, '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True)
        out.append((float(re.search(r'max_volume: (-?[\d.]+)', r.stderr).group(1)), f))
    top = max(p for p, _ in out)
    if not ordered:
        out.sort()
    return [f for _, f in out], -1 - top


def layers(xml):
    """Instrument -> fichiers de ses niveaux de frappe, du plus doux au plus fort."""
    s, d, out = open(xml, errors='ignore').read(), os.path.dirname(xml), {}
    for inst in re.findall(r'<instrument>(.*?)</instrument>', s, re.S):
        name = re.search(r'<name>(.*?)</name>', inst).group(1).replace('&quot;', '"')
        lay = re.findall(r'<filename>(.*?)</filename>\s*<min>(.*?)</min>\s*<max>(.*?)</max>', inst)
        if lay:
            out[name] = [os.path.join(d, f) for f, lo, _ in sorted(lay, key=lambda l: float(l[1]))]
    return out


def encode(src, dst, semis, stereo, cut=0, gain=0):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    # gain d'abord (prises très douces, comme le güiro de la VCSL : sinon tout passerait pour du silence) ; quelques prises
    # commencent par 10 à 25 ms de silence : le coup tomberait en retard
    af = [f'volume={gain:.1f}dB'] if gain else []
    af.append('silenceremove=start_periods=1:start_threshold=0.004:start_silence=0.001')
    if semis:
        af.append(f'aresample=44100,asetrate={round(44100 * 2 ** (semis / 12))},aresample=44100')
    if cut:  # étouffé : la queue du son s'éteint vite
        af.append(f'atrim=0:{cut},afade=t=out:st={cut * 0.25:.3f}:d={cut * 0.75:.3f}:curve=exp')
    else:
        af.append(f'atrim=0:{MAX_S},afade=t=out:st={MAX_S - FADE_S}:d={FADE_S}')
    ac = ['-ac', '2', '-b:a', '160k'] if stereo else ['-ac', '1', '-b:a', '128k']
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-af', ','.join(af), '-ar', '44100', *ac, dst], check=True)


def main():
    args = sys.argv[1:]
    only = None
    if '--only' in args:
        i = args.index('--only')
        only = set(args[i + 1].split(','))
        del args[i:i + 2]
    dl = args[0] if args else tempfile.mkdtemp(prefix='live-drums-')
    bank, jobs = {'_base': 'samples/live/'}, []
    if only:
        bank = json.load(open(os.path.join(OUT, 'live.json')))
    for key, name, stereo, pieces in KITS:
        if only and key not in only:
            continue
        lay = layers(fetch(name, dl)) if name else {}
        for piece, inst in pieces.items():
            if inst.startswith('='):
                bank[f'{key}_{piece}'] = bank[inst[1:]]
                continue
            gain = 0
            if inst.startswith('vcsl-ordre:'):
                lay[inst], gain = fetch_vcsl(inst[11:].split('|'), dl, ordered=True)
                inst += '+0'
            elif inst.startswith('gm:'):
                lay[inst], gain = fetch_gm(inst[3:].split('|'), dl)
                inst += '+0'
            elif inst.startswith('vcsl:'):
                lay[inst], gain = fetch_vcsl(inst[5:].split('|'), dl)
                inst += '+0'
            elif inst.startswith('freepats:'):
                lay[inst], gain = fetch_freepats(inst[9:], dl)
                inst += '+0'
            elif inst.startswith('rusty'):
                lay[inst] = fetch_rusty(inst.split(':', 1)[1], dl, reverse=inst.startswith('rusty-reverse'))
                inst += '+0'
            inst, _, cut = inst.partition('~')
            inst, _, semis = inst.partition('+')
            files = []
            for n, src in enumerate(lay[inst], 1):
                rel = f'{key}/{piece}-{n}.mp3'
                jobs.append((src, os.path.join(OUT, rel), int(semis or 0), stereo, float(cut or 0), gain))
                files.append(rel)
            bank[f'{key}_{piece}'] = files
    with ThreadPoolExecutor(8) as ex:
        list(ex.map(lambda j: encode(*j), jobs))
    with open(os.path.join(OUT, 'live.json'), 'w') as fh:
        json.dump(bank, fh, separators=(',', ':'))
    print(len(jobs), 'fichiers dans', OUT)


if __name__ == '__main__':
    main()
