"""Horizon magnétique — composition originale, melodic techno / EDM, F# mineur, 124 BPM.
Inspiration de production : progression d'énergie d'Opus (Eric Prydz), sans reprise du thème.
Réutilise les outils de notes, batterie et mixage de la démo Envol. Do4 = MIDI 60.
Usage : python3 demos/horizon-magnetique.compose.py [sortie.stepseq.json]
"""
import copy
import importlib.util
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('envol', ROOT / 'envol.compose.py')
E = importlib.util.module_from_spec(spec)
spec.loader.exec_module(E)
# Une entrée par mesure : i – VI – III – VII, puis iv – VI – VII – V.
PROG = [(54, 'min', 42), (54, 'min', 42), (50, 'maj', 38), (50, 'maj', 38),
        (57, 'maj', 45), (57, 'maj', 45), (52, 'maj', 40), (52, 'maj', 40)]
TENSION = [(47, 'min', 35)] * 2 + [(50, 'maj', 38)] * 2 + [(52, 'maj', 40)] * 2 + [(49, 'maj', 37)] * 2
# Voicings proches, sans empilement dans le sous-grave.
VOICINGS = {'min54': [57, 61, 66], 'maj50': [57, 62, 66], 'maj57': [57, 61, 64],
            'maj52': [56, 59, 64], 'min47': [54, 59, 62], 'maj49': [56, 61, 65]}
# Motif original de cinq attaques, une réponse descendante toutes les deux mesures.
MELODY = [[73, 76, 78, 73, 69], [73, 71, 69, 68, 66],
          [74, 78, 81, 78, 76], [78, 76, 74, 73, 69],
          [76, 73, 76, 81, 80], [76, 73, 71, 69, 68],
          [71, 76, 80, 78, 76], [80, 78, 76, 68, 73]]
RHYTHM = [(0, 2), (3, 2), (6, 3), (10, 3), (14, 2)]


def pad(d, prog, velocity=.48, airy=False):
    for b, (root, typ, _) in enumerate(prog):
        notes = VOICINGS[typ + str(root)]
        E.note(d, 'pad', b * 16, 16, notes, velocity)
        if airy:
            E.note(d, 'choir', b * 16, 16, [notes[-1]+12, notes[0]+12], velocity*.55)


def motif(d, track, velocity=.7, response=False, sparse=False):
    for b, phrase in enumerate(MELODY):
        for i, ((o, length), pitch) in enumerate(zip(RHYTHM, phrase)):
            if sparse and (b < 4 or i > 1):
                continue
            if response and b % 2 and i in (1, 3):
                pitch += 12
            E.note(d, track, b*16+o, length, [pitch], velocity*(1 if i in (0, 2) else .85))


def scene(name, kind, final=False):
    bars = 16 if kind == 'intro' else 8
    d = E.empty(bars)
    prog = PROG * 2 if bars == 16 else TENSION if kind == 'build2' else PROG
    pad(d, prog, .42 if kind in ('intro','break') else .52, airy=kind in ('intro','break','final'))
    n = bars*16
    if kind == 'intro':
        # Huit mesures sans batterie, puis arpège fragile : la nappe est seule au début.
        for b in range(8,16):
            root, typ, _ = prog[b]
            E.note(d,'arp',b*16,16,VOICINGS[typ+str(root)],.32)
        d['pad']['auto'] = {'filter': {0:-.8, 127:-.55, 255:-.2}, 'volume':{0:.5,31:.8,255:1}}
    if kind in ('pulse','groove','drop','response','final','outro'):
        E.four_floor(d,0,6 if kind=='outro' else 8, .85 if kind in ('pulse','outro') else 1)
        E.hats(d,0,6 if kind=='outro' else 8, sixteenths=kind in ('drop','response','final'), vel=.65)
        if kind != 'pulse': E.claps(d,0,6 if kind=='outro' else 8,.78)
        E.rolling_bass(d,prog,bars_each=1,end_bar=6 if kind=='outro' else 8,
                       offbeat_only=kind in ('pulse','groove','outro'),vel=.9)
        if kind != 'pulse': motif(d,'piano',.56,sparse=kind=='groove')
    if kind in ('drop','response','final'):
        E.hit(d,'crash',0,.95)
        E.note(d,'impact',0,8,[30],.85)
        motif(d,'lead',.82,response=kind in ('response','final'))
        d['lead']['auto']={'filter':{0:-.35,15:0,127:.08}}
        if kind in ('response','final'):
            for b,(root,typ,_) in enumerate(prog): E.note(d,'arp',b*16,16,VOICINGS[typ+str(root)],.48)
        if final:
            for s in range(0,n,4): E.hit(d,'ride',s,.48 if s%8 else .58)
            for b in (3,7):
                for o in (13,14,15): E.hit(d,'snare',b*16+o,.4+(o-13)*.15)
        d['bass']['auto']={'filter':{0:-.2,31:0,127:.1}}
        E.end_fill(d,8)
    if kind in ('build','build2'):
        E.four_floor(d,0,4,.78)
        E.bass_pulses(d,prog,bars_each=1,end_bar=6)
        E.snare_build(d,8)
        for b in range(8):
            v = VOICINGS[prog[b][1]+str(prog[b][0])]
            for o in (0,6,12): E.note(d,'piano',b*16+o,2,[v[-1]+12],.35+b*.045)
        E.note(d,'riser',0,124,[60],.8)
        for tr in ('pad','piano','bass','riser'):
            d[tr]['auto']={'filter':{0:-.65,96:.15,123:.6},'volume':{0:.55,112:1,123:1,124:0,127:0}}
            d[tr]['events']=[{**e,'len':min(e['len'],124-e['step'])} for e in d[tr]['events'] if e['step']<124]
    if kind=='break':
        motif(d,'piano',.48)
        d['pad']['auto']={'filter':{0:-.4,63:-.65,127:-.15}}
    if kind=='outro':
        # Deux dernières mesures sur la tonique ; la chanson se ferme réellement en F# mineur.
        for tr in ('pad','piano','bass'):
            d[tr]['events']=[e for e in d[tr]['events'] if e['step']<96]
            d[tr]['auto']={'filter':{0:0,127:-.7},'volume':{0:1,95:.7,127:0}}
        E.note(d,'pad',96,32,[57,61,66],.4)
    return name,bars,d


def build():
    p = E.build()
    p.update(id='horizonmagnetique01',title='Horizon magnétique',tempo=124)
    settings = {
      'piano': dict(name='Éclats — motif pluck',family='synth',instrument='syn_pluck',volume=.32,
                    sd={'cutoff':2400,'attack':.004,'decay':.24,'sustain':.15,'release':.18}),
      'choir': dict(name='Halo aérien',family='pads',instrument='syn_glasspad',volume=.17,
                    sd={'cutoff':1800,'attack':1.6,'release':2.4}),
      'pad': dict(name='Horizon — nappe planante',volume=.27,
                  sd={'cutoff':2800,'attack':1.5,'decay':1,'sustain':.8,'release':1.6}),
      'riser': dict(sd={'cutoff':350,'q':1.5,'attack':.2,'decay':.2,'sustain':1,'release':.05}),
    }
    for t in p['tracks']:
        t.update(copy.deepcopy(settings.get(t['id'][3:],{})))
    structure=[('01 · Horizon','intro'),('02 · Pulsation','pulse'),('03 · Gravitation','groove'),
      ('04 · Ascension','build'),('05 · DROP — Orbite','drop'),('06 · DROP — Réponse','response'),
      ('07 · En apesanteur','break'),('08 · Dernière ascension','build2'),
      ('09 · DROP FINAL — Magnétique','final'),('10 · DROP FINAL — Pleine lumière','final'),('11 · Dissipation','outro')]
    scenes=[]
    for i,(name,kind) in enumerate(structure):
        name,bars,d=scene(name,kind,final=kind=='final')
        if i==9:
            # Dernier sommet : contrechant plus haut et crash de relance au milieu.
            for e in d['arp']['events']: e['notes']=[v+12 for v in e['notes']]
            E.hit(d,'crash',64,.7)
        scenes.append(dict(id=f'hm_{i:02}',name=name,bars=bars,
          key={'tonic':'F♯','mode':'minor'},grid={'initialized':True,'snap':'bar','auto':False,'chords':[{'step':b*32,'len':32,'degree':degree,'type':'min' if degree in (0,3) else 'maj','acc':0} for b,degree in enumerate(([0,5,2,6]*2) if kind=='intro' else [3,5,6,4] if kind=='build2' else [0,5,2,0] if kind=='outro' else [0,5,2,6])]},data={f'td_{k}' if k in E.DRUM_IDS else f'ti_{k}':v for k,v in d.items()}))
    p.update(scenes=scenes,current=scenes[0]['id'],bars=16,song=[{'scene':s['id'],'repeat':1} for s in scenes])
    for t in p['tracks']: t.update(copy.deepcopy(scenes[0]['data'][t['id']]))
    p['master']['mastering']={'on':True,'drive':1,'ceiling':-1.2,'width':1.12,'mono':110,'release':.15,'clip':.12}
    return p

if __name__=='__main__':
    p=build()
    out=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT/'horizon-magnetique.stepseq.json'
    out.write_text(json.dumps(p,ensure_ascii=False,indent=1)+'\n')
    print(f'{out}: {len(p["tracks"])} pistes, {len(p["scenes"])} scènes, 96 mesures, 3 min 06 s')
