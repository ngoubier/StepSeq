/*
 * « ✦ D'après une émotion » › style 🎬 Musique de film : une émotion par passage de l'image (« Par passage ») ou un mélange
 * pour toute la scène (« Toute la scène »). Maquette validée : maquettes/maquette-film-emotion.html (2026-11-24).
 *
 * Le calcul est dans js/filmemotion.js (pur) et le vrai moteur de la musique de film (js/film.js). Cette vue dessine la
 * scène (frise en secondes : énergie, tension, synchro forte), une carte par passage, fait écouter un aperçu (petit synthé
 * à part, sans toucher au projet) ; « Créer cette scène » ouvre l'assistant Musique de film sur « Ma scène », réglée
 * (repères, tonalité, thème, effectif de l'orchestre). js/emotionsongpanel.js l'appelle quand le style est « film ».
 */
window.SS = window.SS || {};

SS.filmEmotionPanel = (() => {
  const FE = () => SS.filmEmotion;
  const F = () => SS.film;
  const H = () => SS.harmony;
  const femo = (k) => SS.FILM_EMOTIONS.find((x) => x.k === k);
  const col = (k) => femo(k).color;
  const fmt = (t) => F().fmt(t);
  const DYN_TXT = { pp: 'pianissimo', p: 'piano', mf: 'mezzo-forte', f: 'forte', ff: 'fortissimo' };
  const ART = { trem: 'trémolo', pizz: 'pizzicato', glock: 'glockenspiel', marimba: 'marimba', bells: 'cloches' };

  function h(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => c != null && c !== false && e.append(c.nodeType ? c : document.createTextNode(String(c))));
    return e;
  }
  const copy = (x) => JSON.parse(JSON.stringify(x));
  const ensOf = (id) => (SS.orchestra && SS.orchestra.ENS[id]) || { id, label: id, parts: [] };
  const ensParts = (id) => ensOf(id).parts.map((p) => (SS.orchestra.PART[p] || { label: p }).label).join(', ');

  /** État de la vue (gardé dans l'état de la fenêtre : st.film). */
  function stateOf(st) {
    if (!st.film) {
      st.film = {
        story: FE().STORIES[0].id, passages: copy(FE().STORIES[0].p), tempo: null, ens: null,
        mix: [{ emo: 'tristesse', w: 60 }, { emo: 'espoir', w: 40 }], total: 50,
      };
    }
    return st.film;
  }
  /** La déduction de l'état : « Toute la scène » (mode mix) ou « Par passage » (mode arc). */
  function deduce(st) {
    const f = stateOf(st);
    const passages = st.mode === 'arc' ? f.passages : FE().fromMix(f.mix, f.total);
    const pre = FE().deduce({ passages, tempo: 'cale', ens: f.ens });
    if (!pre) return null;
    const tempo = f.tempo || pre.adviseTempo;
    return tempo === 'cale' ? pre : FE().deduce({ passages, tempo, ens: f.ens });
  }

  /* ---------- colonne gauche ---------- */
  function leftCol(st, d, { changed, styleSelect }) {
    const f = stateOf(st);
    const edited = () => ((f.story = null), changed());
    const head = [h('label', { class: 'es-lbl', for: 'esStyle' }, 'Style'), styleSelect()];
    if (st.mode !== 'arc') {
      const tot = f.mix.reduce((a, m) => a + m.w, 0) || 1;
      return h(
        'div',
        { class: 'es-col es-in' },
        ...head,
        h('div', { class: 'es-lbl' }, 'Émotions de la scène', SS.helpTip('Jusqu’à trois émotions et leur part. La scène est découpée en passages : le thème prend l’émotion principale, le sommet (avec la synchro forte) la plus énergique, la fin la plus calme.', 'Émotions de la scène')),
        ...f.mix.map((m, i) =>
          h(
            'div',
            { class: 'es-row', style: `--c:${col(m.emo)}` },
            h('span', { class: 'es-dot' }),
            h('select', { 'aria-label': `Émotion ${i + 1}`, onchange: (ev) => ((m.emo = ev.target.value), changed()) }, ...SS.FILM_EMOTIONS.map((x) => h('option', { value: x.k, selected: x.k === m.emo, disabled: x.k !== m.emo && f.mix.some((y) => y.emo === x.k) }, x.label))),
            h('input', { type: 'range', min: 5, max: 100, value: m.w, 'aria-label': `Part de ${femo(m.emo).label}`, oninput: (ev) => ((m.w = +ev.target.value), changed()) }),
            h('span', { class: 'es-pct' }, `${Math.round((100 * m.w) / tot)} %`),
            h('button', { type: 'button', class: 'es-x', title: 'Enlever cette émotion', 'aria-label': `Enlever ${femo(m.emo).label}`, disabled: f.mix.length < 2, onclick: () => (f.mix.splice(i, 1), changed()) }, '×')
          )
        ),
        h('button', {
          type: 'button', class: 'es-add', disabled: f.mix.length >= 3,
          onclick: () => (f.mix.push({ emo: SS.FILM_EMOTIONS.find((x) => !f.mix.some((y) => y.emo === x.k)).k, w: 30 }), changed()),
        }, '+ Ajouter une émotion'),
        h('div', { class: 'es-lbl' }, 'Durée de la scène'),
        h('label', { class: 'fe-dur' }, h('input', { type: 'number', id: 'feTotal', min: 10, max: 300, value: f.total, onchange: (ev) => ((f.total = Math.max(10, Math.min(300, +ev.target.value || 50))), changed()) }), ' secondes')
      );
    }
    let t = 0;
    const ps = f.passages;
    return h(
      'div',
      { class: 'es-col es-in' },
      ...head,
      h('div', { class: 'es-lbl' }, 'Histoires toutes faites'),
      h('div', { class: 'ea-arcs' }, ...FE().STORIES.map((s) =>
        h('button', { type: 'button', class: 'ea-arc' + (f.story === s.id ? ' on' : ''), 'data-story': s.id, onclick: () => Object.assign(f, { story: s.id, passages: copy(s.p), tempo: null, ens: null }) && changed() },
          h('span', { class: 'ea-strip' }, ...s.p.map((p) => h('i', { style: `background:${col(p.emo)};flex:${p.s}` }))), s.name))),
      h('div', { class: 'es-lbl' }, 'Passages', SS.helpTip('Un passage commence à un repère de l’image. ⚡ synchro forte : le tempo est calé pour qu’elle tombe sur un premier temps. 💬 dialogue : la musique s’efface sous les mots et le thème se tait.', 'Passages')),
      ...ps.map((p, i) => {
        const at = t;
        t += p.s;
        return h(
          'div',
          { class: 'fe-prow', style: `--c:${col(p.emo)}` },
          h('span', { class: 'es-dot', title: `Repère à ${fmt(at)}` }),
          h('input', { type: 'text', class: 'fe-name', value: p.name || '', placeholder: femo(p.emo).label, 'aria-label': `Nom du passage ${i + 1}`, onchange: (ev) => ((p.name = ev.target.value), edited()) }),
          h('select', { 'aria-label': `Émotion du passage ${i + 1}`, onchange: (ev) => ((p.emo = ev.target.value), delete p.ene, delete p.ten, edited()) }, ...SS.FILM_EMOTIONS.map((x) => h('option', { value: x.k, selected: x.k === p.emo }, x.label))),
          h('label', { class: 'fe-secs' }, h('input', { type: 'number', min: 2, max: 120, value: p.s, 'aria-label': `Durée du passage ${i + 1} en secondes`, onchange: (ev) => ((p.s = Math.max(2, Math.min(120, +ev.target.value || 8))), edited()) }), 's'),
          h('button', { type: 'button', class: 'fe-tg' + (p.sync ? ' on' : ''), 'aria-pressed': String(!!p.sync), disabled: i === 0 ? true : null, title: i === 0 ? 'Le premier passage ouvre la musique' : 'Synchro forte au début de ce passage', onclick: () => { ps.forEach((x) => x !== p && (x.sync = false)); p.sync = !p.sync; delete p.ene; edited(); } }, '⚡'),
          h('button', { type: 'button', class: 'fe-tg' + (p.dlg ? ' on' : ''), 'aria-pressed': String(!!p.dlg), title: 'Dialogue : on parle dans ce passage', onclick: () => ((p.dlg = !p.dlg), edited()) }, '💬'),
          h('button', { type: 'button', class: 'es-x', title: 'Retirer ce passage', disabled: ps.length <= 2 ? true : null, onclick: () => (ps.splice(i, 1), edited()) }, '×')
        );
      }),
      h('div', { class: 'fe-addrow' },
        h('button', { type: 'button', class: 'es-add', id: 'feAdd', disabled: ps.length >= FE().MAX_PASSAGES ? true : null, onclick: () => (ps.push({ emo: 'apaisement', s: 8 }), edited()) }, '+ Passage'),
        h('span', { class: 'fe-tot' }, `Durée ${fmt(d ? d.total : t)}`))
    );
  }

  /* ---------- frise : secondes, énergie, tension, synchro ---------- */
  function timeline(d, st) {
    const T = d.tm.seconds;
    const secs = d.tm.sections;
    const endOf = (i) => (i + 1 < secs.length ? secs[i + 1].cue.land : d.tm.start + T) - d.tm.start;
    const lane = h('div', { class: 'fe-lane' });
    secs.forEach((s, i) => {
      const a = s.cue.land - d.tm.start;
      const b = endOf(i);
      const dlg = d.spec.sections[s.id].film.dlg;
      lane.append(
        h('button', { type: 'button', class: 'fe-blk', 'data-i': i, style: `left:${(100 * a) / T}%;width:${(100 * (b - a)) / T}%;--c:${col(s.emo)}`, title: `${s.name} · ${femo(s.emo).label} · ${fmt(a)} → ${fmt(b)}`, onclick: () => listen(d, i, true) },
          h('span', { class: 'fe-bar' + (dlg ? ' fe-dlg' : ''), style: `height:${14 + s.ene * 13}%` }),
          h('span', { class: 'fe-bn' }, s.name),
          h('span', { class: 'fe-bm' }, `m.${s.startBar + 1}`))
      );
    });
    const pts = [];
    secs.forEach((s, i) => {
      const y = 100 - (s.ten * 16 + 6);
      pts.push(`${(100 * (s.cue.land - d.tm.start)) / T},${y}`, `${(100 * endOf(i)) / T},${y}`);
    });
    const tens = h('div', { class: 'fe-tens', 'aria-hidden': 'true' });
    tens.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${pts.join(' ')}" fill="none" stroke="var(--c-text)" stroke-width="1.4" vector-effect="non-scaling-stroke" stroke-dasharray="3 3" opacity=".75"/></svg>`;
    lane.append(tens);
    const sync = secs.find((s) => s.sync);
    if (sync) lane.append(h('span', { class: 'fe-sync', style: `left:${(100 * (sync.cue.land - d.tm.start)) / T}%` }, h('span', {}, `⚡ ${fmt(sync.cue.land)} · m.${sync.startBar + 1}`)));
    lane.append(h('span', { class: 'fe-head', id: 'feHead' }));
    const ruler = h('div', { class: 'fe-ruler' });
    const step = T > 90 ? 20 : T > 40 ? 10 : 5;
    for (let s = 0; s <= T; s += step) ruler.append(h('span', { style: `left:${(100 * s) / T}%` }, fmt(s)));
    return h('div', { class: 'fe-tl' }, lane, ruler);
  }

  /** Noms des accords d'un passage (comme la fiche de l'assistant film). */
  function chordNames(sec, key) {
    const k = sec.key ? (typeof sec.key === 'string' ? F().parseKey(sec.key) : sec.key) : F().parseKey(key);
    const out = [];
    sec.grid.forEach((c) => {
      const ch = H().makeChord(k, c.degree, c.type, c.acc || 0);
      const n = ch.name + (c.bass ? '/' + H().spell(k, (ch.rootPc + c.bass) % 12) : '');
      if (out[out.length - 1] !== n) out.push(n);
    });
    return out;
  }
  function card(d, s, i, st, changed) {
    const sp = d.spec.sections[s.id];
    const fm = sp.film;
    const next = d.tm.sections[i + 1];
    const end = next ? next.cue.land : d.tm.start + d.tm.seconds;
    const harm = F().HARM[fm.harm] || F().HARM.song;
    const treat = F().TREATMENTS[F().treatOf(d.film, s)];
    const arts = fm.art.map((a) => ART[a]).filter(Boolean);
    if (sp.motor) arts.unshift('ostinato 3+3+2');
    if (sp.stabs) arts.push('accents des cuivres');
    const perc = [];
    if (s.sync) perc.push('impact sur la synchro');
    if (next && next.sync) perc.push('roulement vers la synchro');
    if (s.ene >= 4 && !s.sync) perc.push('timbale sur les temps forts');
    if (!next && s.ene <= 2) perc.push('tam-tam pianissimo');
    const byPassage = st.mode === 'arc';
    const lv = (n, key, label) =>
      h('span', { class: 'fe-lv', role: 'group', 'aria-label': label }, ...[1, 2, 3, 4, 5].map((v) =>
        h('button', { type: 'button', class: v <= n ? 'on' : '', title: `${label} ${v}`, disabled: byPassage ? null : true, onclick: () => ((stateOf(st).passages[i][key] = v), (stateOf(st).story = null), changed()) })));
    const row = (k, ...v) => [h('span', { class: 'es-k' }, k), h('span', { class: 'ea-v' }, ...v)];
    return h(
      'div',
      { class: 'ea-card fe-card', 'data-i': i, style: `--c:${col(s.emo)}` },
      h('div', { class: 'ea-head' },
        h('span', { class: 'es-dot' }),
        h('b', {}, s.name),
        h('span', { class: 'ea-emo' }, femo(s.emo).label),
        s.sync ? h('span', { class: 'fe-tag' }, '⚡ synchro') : null,
        fm.dlg ? h('span', { class: 'fe-tag' }, '💬 dialogue') : null,
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'ea-pb', title: 'Écouter ce passage', 'aria-label': `Écouter ${s.name}`, onclick: () => listen(d, i, true) }, '▶')),
      ...row('Image', `${fmt(s.cue.land)} → ${fmt(end)}`, h('small', {}, `${s.bars} mes. · ${s.bpm} BPM`)),
      ...row('Harmonie', h('span', { class: 'selectable' }, chordNames(sp, d.film.key).join('  ')), h('small', { class: 'fe-why', title: harm.rule || '' }, `${harm.label} : ${harm.effect}`)),
      ...row('Thème', treat.label, h('small', { class: 'fe-why' }, treat.why)),
      ...row('Nuance', h('span', { class: 'fe-dyn' }, fm.dyn || '—'), h('small', {}, DYN_TXT[fm.dyn] || '')),
      ...row('Énergie', lv(s.ene, 'ene', 'Énergie')),
      ...row('Tension', lv(s.ten, 'ten', 'Tension')),
      ...row('Orchestre', h('span', { class: 'es-chips' }, ...(arts.length ? arts : ['tenues']).map((a) => h('span', { class: 'es-chip' }, a)), ...perc.map((a) => h('span', { class: 'es-chip es-added' }, a))))
    );
  }

  /** Les deux colonnes de la vue film (js/emotionsongpanel.js les place dans la fenêtre). */
  function columns(st, d, { changed, styleSelect }) {
    const left = leftCol(st, d, { changed, styleSelect });
    if (!d) return [left, h('div', { class: 'es-col' }, h('p', { class: 'es-empty' }, 'Choisis au moins une émotion.'))];
    const f = stateOf(st);
    const sync = d.tm.sections.find((s) => s.sync);
    const M = d.film.motif;
    const row = (k, v, help) => [h('span', { class: 'es-k' }, k), h('div', { class: 'es-v' }, v), help ? SS.helpTip(help, k) : h('span')];
    const seg = h('span', { class: 'fe-seg', role: 'radiogroup', 'aria-label': 'Tempo' },
      ...[['cale', 'Un tempo calé'], ['passage', 'Par passage']].map(([id, label]) =>
        h('button', { type: 'button', role: 'radio', 'aria-checked': String(d.tempoMode === id), class: d.tempoMode === id ? 'on' : '', 'data-tempo': id, onclick: () => ((f.tempo = id), changed()) }, label + (d.adviseTempo === id ? ' ✦' : ''))));
    const tempoTxt = d.tempoMode === 'passage' ? `${[...new Set(d.tm.sections.map((s) => s.bpm))].length > 1 ? d.tm.sections.map((s) => s.bpm).join(' → ') : d.tm.bpm} BPM` : `${d.tm.bpm} BPM`;
    const tempoSmall = d.tempoMode === 'passage' ? 'chaque passage à son tempo, changement net au repère' : sync ? `la synchro tombe sur la mesure ${sync.startBar + 1} (${fmt(sync.cue.land)})` : 'tempo moyen des émotions';
    const grid = h(
      'div',
      { class: 'es-grid' },
      ...row('Tempo', [h('b', {}, tempoTxt), seg, h('small', { class: 'fe-line' }, tempoSmall)], 'Un tempo calé : un seul tempo, choisi pour que la synchro forte tombe pile sur un premier temps. Par passage : chaque émotion à son tempo (60 pour la tristesse, 140 pour la peur), le changement est net au repère. ✦ : le conseil (par passage quand les tempos des émotions s’écartent beaucoup).'),
      ...row('Tonalité', [h('b', {}, H().label(d.key)), h('small', { class: 'fe-line' }, d.keyFrom === 'entree' ? `couleur de l’entrée : ${femo(d.passages[0].emo).label}` : 'le mélange de la scène et les musiques de film proches')], `Les musiques de film les plus proches du mélange de la scène : ${d.refs.map((r) => r.title).join(', ')}. On n’en garde que des données (tempo, mode, émotions), jamais la mélodie.`),
      ...row('Orchestre', [
        h('span', { class: 'es-chips' }, ...d.ensList.map((e) => h('button', { type: 'button', class: 'fe-ens' + (e.id === d.ens ? ' on' : ''), 'data-ens': e.id, 'aria-pressed': String(e.id === d.ens), title: ensParts(e.id), onclick: () => ((f.ens = e.id), changed()) }, ensOf(e.id).label))),
        h('small', { class: 'fe-line' }, ensParts(d.ens)),
      ], 'L’effectif vient des émotions, pondérées par la durée de leurs passages : Intime pour la tristesse et la nostalgie, Romantique pour l’espoir et l’émerveillement, Épique quand l’héroïsme ou la colère montent, Mystère pour le suspense.'),
      ...row('Thème', [h('b', {}, `Motif « ${femo(d.heart.emo).label} »`), h('button', { type: 'button', class: 'ea-pb', title: 'Écouter le motif', 'aria-label': 'Écouter le motif', onclick: () => listenMotif(d) }, '▶'),
        h('small', { class: 'fe-line' }, `${F().CONT[M.cont].label.toLowerCase()}, saut de ${F().INTV[M.intv].label.toLowerCase()}, rythme ${F().RHY[M.rhy].why.split(' :')[0]} · repris dans chaque passage`)],
      'Le motif vient du passage le plus important (la synchro forte, sinon le plus long). Chaque passage le reprend à sa façon (leitmotiv) : fragmenté dans le suspense, diminué dans la peur, en séquence dans l’espoir… Il se tait sous le dialogue.')
    );
    const right = h(
      'div',
      { class: 'es-col es-res fe-res' },
      grid,
      h('div', { class: 'es-lbl' }, 'La scène, passage par passage', SS.helpTip('Largeur = durée à l’image, hauteur = énergie, couleur = émotion, pointillé = tension, rayures = dialogue. Un clic sur un passage pour l’écouter.', 'La scène'), h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-small', id: 'fePlay', onclick: () => (play ? stop() : listen(d, 0, false)) }, '▶ Écouter la scène')),
      timeline(d, st),
      h('div', { class: 'ea-cards' }, ...d.tm.sections.map((s, i) => card(d, s, i, st, changed)))
    );
    return [left, right];
  }

  /* ---------- écoute : un aperçu (cordes, basse, thème, timbales), petit synthé à part ---------- */
  let play = null;
  const hz = (m) => 440 * 2 ** ((m - 69) / 12);
  function stop() {
    if (!play) return;
    play.timers.forEach(clearTimeout);
    cancelAnimationFrame(play.raf);
    play.ctx.close();
    play = null;
    document.querySelectorAll('.fe-playing').forEach((x) => x.classList.remove('fe-playing'));
    const b = document.getElementById('fePlay');
    if (b) b.textContent = '▶ Écouter la scène';
    const hd = document.getElementById('feHead');
    if (hd) hd.style.display = 'none';
  }
  function engine() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    const vol = ctx.createGain();
    vol.gain.value = 0.8;
    const conv = ctx.createConvolver();
    const len = Math.round(ctx.sampleRate * 2.4);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    conv.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    comp.connect(vol).connect(ctx.destination);
    conv.connect(wet).connect(comp);
    const bus = (g) => {
      const x = ctx.createGain();
      x.gain.value = g;
      x.connect(comp);
      x.connect(conv);
      return x;
    };
    const tone = (out, t, m, dur, { type = 'sawtooth', v = 0.05, cut = 1800, a = 0.02, r = 0.3, vib = false } = {}) => {
      const o = ctx.createOscillator();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = hz(m);
      if (vib) {
        const l = ctx.createOscillator();
        const lg = ctx.createGain();
        l.frequency.value = 5.2;
        lg.gain.value = hz(m) * 0.006;
        l.connect(lg).connect(o.frequency);
        l.start(t);
        l.stop(t + dur + r + 0.1);
      }
      f.type = 'lowpass';
      f.frequency.value = cut;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + a);
      g.gain.setValueAtTime(v, t + Math.max(a, dur));
      g.gain.linearRampToValueAtTime(0, t + dur + r);
      o.connect(f).connect(g).connect(out);
      o.start(t);
      o.stop(t + dur + r + 0.05);
    };
    const noise = (out, t, dur, { v = 0.1, f = 3000, type = 'highpass', a = 0.005 } = {}) => {
      const n = ctx.createBufferSource();
      const b = ctx.createBuffer(1, Math.round(ctx.sampleRate * (dur + 0.1)), ctx.sampleRate);
      const c = b.getChannelData(0);
      for (let i = 0; i < c.length; i++) c[i] = Math.random() * 2 - 1;
      n.buffer = b;
      const fl = ctx.createBiquadFilter();
      fl.type = type;
      fl.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v, t + a);
      g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
      n.connect(fl).connect(g).connect(out);
      n.start(t);
    };
    const timp = (out, t, v, m = 38) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(hz(m) * 1.5, t);
      o.frequency.exponentialRampToValueAtTime(hz(m), t + 0.08);
      g.gain.setValueAtTime(v * 0.6, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 1.3);
    };
    return { ctx, bus, tone, noise, timp };
  }
  function listenMotif(d) {
    stop();
    const E = engine();
    const out = E.bus(0.9);
    const t0 = E.ctx.currentTime + 0.1;
    const beat = 60 / d.tm.bpm;
    F().motifOf(d.film).forEach((n) => E.tone(out, t0 + n.t * beat, n.m, n.d * beat * 0.95, { type: 'triangle', v: 0.16, cut: 3000, a: 0.03, r: 0.4, vib: true }));
    play = { ctx: E.ctx, timers: [setTimeout(stop, 6000)], raf: 0 };
  }
  /** Joue la scène à partir du passage `from` (only : ce passage seulement). */
  function listen(d, from, only) {
    stop();
    const E = engine();
    const ctx = E.ctx;
    const strings = E.bus(0.5);
    const bass = E.bus(0.6);
    const lead = E.bus(0.75);
    const perc = E.bus(0.9);
    const key0 = F().parseKey(d.film.key);
    const secs = d.tm.sections;
    const last = only ? from : secs.length - 1;
    const marks = [];
    let t = ctx.currentTime + 0.15;
    const t0 = t;
    for (let i = from; i <= last; i++) {
      const s = secs[i];
      const sp = d.spec.sections[s.id];
      const step = 60 / (sp.tempo || d.tm.bpm) / 4;
      const k = sp.key ? (typeof sp.key === 'string' ? F().parseKey(sp.key) : sp.key) : key0;
      const ene = sp.film.ene;
      const vel = sp.orchVel || 0.6;
      const cut = 500 + ene * 450;
      const dur = s.bars * 16 * step;
      marks.push({ i, t, dur, a: s.cue.land - d.tm.start, b: (i + 1 < secs.length ? secs[i + 1].cue.land : d.tm.start + d.tm.seconds) - d.tm.start });
      sp.grid.forEach((c) => {
        const ch = H().makeChord(k, c.degree, c.type, c.acc || 0);
        const iv = (SS.CHORDS.find((x) => x.id === c.type) || SS.CHORDS[0]).iv;
        const root = 48 + ch.rootPc;
        const r0 = root < 50 ? root + 12 : root;
        const st0 = t + c.step * step;
        const gap = sp.gap && c.step + c.len >= s.bars * 16 ? 4 * step : 0;
        const td = Math.max(0.1, c.len * step - gap);
        iv.forEach((x) => E.tone(strings, st0, r0 + x, td, { v: 0.05 * vel, cut, a: ene <= 2 ? 0.5 : 0.15, r: 0.6 }));
        iv.slice(1, 3).forEach((x) => E.tone(strings, st0, r0 + x + 12, td, { v: 0.03 * vel, cut, a: 0.4, r: 0.6, type: 'triangle' }));
        const bm = 36 + ((ch.rootPc + (c.bass || 0)) % 12);
        if (sp.motor) {
          // ostinato 3+3+2 en croches
          for (let b = 0; b < c.len; b += 16) [0, 6, 12].forEach((o, j) => b + o < c.len && E.tone(bass, st0 + (b + o) * step, bm, (j === 2 ? 4 : 6) * step * 0.6, { v: 0.16, cut: 700, a: 0.01, r: 0.08 }));
        } else E.tone(bass, st0, bm, td, { v: 0.11 * vel + 0.04, cut: 500, a: 0.08, r: 0.4 });
      });
      (sp.theme || []).forEach((ev) => ev.notes.forEach((m) => E.tone(lead, t + ev.step * step, m, ev.len * step * 0.95, { type: 'triangle', v: 0.17 * (ev.vel || 0.7), cut: 2600 + ene * 300, a: 0.03, r: 0.35, vib: true })));
      const hs = sp.hits || {};
      (hs.lt || []).forEach(([p, v]) => E.timp(perc, t + p * step, v));
      (hs.bd || []).forEach(([p, v]) => E.timp(perc, t + p * step, v, 28));
      (hs.mt || []).forEach(([p, v]) => { for (let r = 0; r < 16; r++) E.timp(perc, t + (p + r) * step, v * (0.3 + (0.7 * r) / 16)); });
      (hs.cr || []).forEach(([p, v]) => E.noise(perc, t + p * step, 2.5, { v: 0.08 * v, f: 5000 }));
      (hs.oh || []).forEach(([p, v]) => E.noise(perc, t + p * step, Math.max(0.2, (s.bars * 16 - p) * step), { v: 0.06 * v, f: 6000, a: Math.max(0.1, (s.bars * 16 - p) * step * 0.95) }));
      (hs.misc || []).forEach(([p, v]) => E.noise(perc, t + p * step, 4, { v: 0.12 * v, f: 400, type: 'lowpass', a: 0.05 }));
      (hs.rd || []).forEach(([p, v]) => E.tone(perc, t + p * step, 100, 0.05, { type: 'sine', v: 0.05 * v, cut: 12000, a: 0.002, r: 1.2 }));
      t += dur;
    }
    const T = d.tm.seconds;
    const frame = () => {
      if (!play) return;
      const now = ctx.currentTime;
      const m = marks.find((x) => now >= x.t && now < x.t + x.dur) || null;
      document.querySelectorAll('.fe-blk, .fe-card').forEach((x) => x.classList.toggle('fe-playing', !!m && +x.dataset.i === m.i));
      const hd = document.getElementById('feHead');
      if (m && hd) {
        hd.style.display = 'block';
        hd.style.left = `${(100 * (m.a + ((now - m.t) / m.dur) * (m.b - m.a))) / T}%`;
      }
      play.raf = requestAnimationFrame(frame);
    };
    play = { ctx, timers: [], raf: 0 };
    play.raf = requestAnimationFrame(frame);
    play.timers.push(setTimeout(stop, (t - t0 + 2.5) * 1000));
    const b = document.getElementById('fePlay');
    if (b && !only) b.textContent = '■ Arrêter';
  }

  /* ---------- « Créer cette scène » : l'assistant Musique de film réglé par son pont ---------- */
  function apply(d) {
    const W = SS.band.claude;
    if (!d) throw new Error('Pas de scène : choisis au moins une émotion');
    W.porte('create');
    W.style('film', 'scene');
    W.filmScene(d.film);
    const orch = (W.etat().musiciens || []).find((m) => m.type === 'orch');
    if (orch) {
      try {
        W.musicien(orch.id, { son: d.ens });
      } catch (e) {
        /* effectif introuvable : l'orchestre garde celui de l'inspiration */
      }
    }
    try {
      W.etape('style');
    } catch (e) {
      /* l'étape s'ouvrira au prochain clic */
    }
    // la fiche de « Ma scène » (repères, tempo, thème…) est sous les départs : on la montre
    if (typeof requestAnimationFrame === 'function')
      requestAnimationFrame(() => {
        const t = document.querySelector('#bandDialog .bs-kind');
        if (t && t.scrollIntoView) t.scrollIntoView({ block: 'start' });
      });
    return d.film;
  }

  return { stateOf, deduce, columns, apply, stop, listen, chordNames };
})();
