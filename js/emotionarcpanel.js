/*
 * « ✦ D'après une émotion » › Par scène : l'émotion évolue au fil des scènes (mélancolie au couplet, euphorie au refrain…).
 * Maquette validée : maquettes/maquette-emotions-par-scene.html (2026-11-24).
 *
 * Une émotion par moment de la chanson (Couplet, Montée, Refrain, Pont, Fin) ou une trajectoire toute faite ; le calcul
 * (SS.emotionSong.deduceArc, pur) donne à chaque scène sa tonalité, sa grille, son énergie, son ressenti et son accord
 * charnière. Cette vue dessine la trajectoire, fait écouter un aperçu (petit synthé à part, sans toucher au projet, comme
 * la fenêtre « Lire une partition ») ; « Créer cette chanson » passe par js/emotionsongpanel.js.
 */
window.SS = window.SS || {};

SS.emotionArcPanel = (() => {
  const E = () => SS.emotionSong;
  const H = () => SS.harmony;
  const emo = (id) => SS.findEmotion(id);
  const col = (id) => SS.emotionColor(id);
  const DARK = ['minor', 'dorian', 'phrygian', 'harmonic', 'locrian'];
  const FEEL = { plein: 'batterie pleine', demi: 'batterie en demi-temps', sans: 'sans batterie' };
  const REL = { relative: 'relative', parallel: 'homonyme' };
  /** Types de musicien montrés par scène (rôle de l'assistant le plus proche, pour la couleur et le nom). */
  const KIND_ROLE = { drums: 'drums', bass: 'bass', chords: 'pad', arp: 'arp', guitar: 'guitar', melody: 'lead', orch: 'orch', horns: 'horns', ambient: 'ambient' };
  const KIND_ORDER = ['drums', 'bass', 'chords', 'arp', 'guitar', 'melody', 'orch', 'horns', 'ambient'];

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
  const keyText = (k) => H().label(k);
  const shortKey = (k) =>
    keyText(k).replace(' mineur harmonique', 'm harm.').replace(' majeur', '').replace(' mineur', 'm').replace(' dorien', ' dor.').replace(' lydien', ' lyd.').replace(' mixolydien', ' mixo.').replace(' phrygien', ' phr.');
  /** Types de musicien de la déduction : ceux de l'inspiration (non facultatifs), plus ceux ajoutés par les émotions. */
  function kindsOf(d) {
    const kinds = new Set(d.roles.map((r) => SS.bandGroup && SS.bandGroup.typeOfRole ? SS.bandGroup.typeOfRole(r.role) : null).filter(Boolean));
    return KIND_ORDER.filter((k) => kinds.has(k));
  }
  /** Accords joués d'une scène : la grille répétée sur ses mesures, la dernière mesure remplacée par la charnière. */
  function barsOf(s) {
    const g = s.grids[s.pick];
    if (!g) return [];
    const chords = E().chordsIn(s.key, g.chords);
    const bars = [];
    for (let b = 0; b < s.bars; b++) bars.push(chords[b % chords.length]);
    if (s.pivot && bars.length) {
      const p = s.pivot;
      bars[bars.length - 1] = { rootPc: p.rootPc, type: p.type, name: p.name, grid: H().toGridChord(s.key, { rootPc: p.rootPc, type: p.type }), pivot: true };
    }
    return bars;
  }

  /* ---------- écoute : un aperçu de la trajectoire (2 mesures par passage) ---------- */
  let play = null;
  const hz = (m) => 440 * 2 ** ((m - 69) / 12);
  function stop() {
    if (!play) return;
    play.timers.forEach(clearTimeout);
    play.ctx.close();
    play = null;
    document.querySelectorAll('.ea-playing').forEach((x) => x.classList.remove('ea-playing'));
    const b = document.getElementById('eaPlay');
    if (b) b.textContent = '▶ Écouter la trajectoire';
  }
  function listen(d, blocks) {
    stop();
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const out = ctx.createDynamicsCompressor();
    const vol = ctx.createGain();
    vol.gain.value = 0.7;
    out.connect(vol).connect(ctx.destination);
    const tone = (t, m, dur, { type = 'sawtooth', v = 0.05, cut = 1800, a = 0.02, r = 0.25 } = {}) => {
      const o = ctx.createOscillator();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = hz(m);
      f.frequency.value = cut;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + a);
      g.gain.setValueAtTime(v, t + Math.max(a, dur - r));
      g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(f).connect(g).connect(out);
      o.start(t);
      o.stop(t + dur + 0.05);
    };
    const noise = (t, dur, v, hp) => {
      const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
      const x = b.getChannelData(0);
      for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * (1 - i / x.length) ** 3;
      const s = ctx.createBufferSource();
      const f = ctx.createBiquadFilter();
      const g = ctx.createGain();
      s.buffer = b;
      f.type = 'highpass';
      f.frequency.value = hp;
      g.gain.value = v;
      s.connect(f).connect(g).connect(out);
      s.start(t);
    };
    const kick = (t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(130, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.32);
    };
    const spb = 60 / d.tempo.bpm;
    const t0 = ctx.currentTime + 0.1;
    const sec = (sid) => d.sections.find((s) => s.sid === sid);
    const timers = [];
    blocks.forEach((b, j) => {
      const s = sec(b.sid);
      const t = t0 + j * 8 * spb;
      // 4 accords de la grille, 2 par mesure ; le dernier = la charnière si la scène en a une (et qu'on écoute la suite)
      const all = barsOf(s);
      const g = s.grids[s.pick] ? E().chordsIn(s.key, s.grids[s.pick].chords) : [];
      const chords = g.slice(0, 4);
      while (chords.length && chords.length < 4) chords.push(chords[chords.length % g.length]);
      if (s.pivot && blocks.length > 1 && j < blocks.length - 1) chords[3] = all[all.length - 1];
      const on = (k) => E().playsIn(s, k);
      const bright = 900 + 2600 * s.energy;
      chords.forEach((c, i) => {
        const tc = t + i * 2 * spb;
        const notes = SS.chordNotes(60 + (c.rootPc >= 6 ? c.rootPc - 12 : c.rootPc), c.type);
        notes.forEach((n) => tone(tc, n, 2 * spb, { v: 0.035, cut: bright, a: 0.08, r: 0.3 }));
        if (on('bass')) (s.energy > 0.7 ? [0, 0.5, 1, 1.5] : [0, 1]).forEach((x) => tone(tc + x * spb, 36 + c.rootPc, spb * (s.energy > 0.7 ? 0.45 : 0.9), { type: 'square', v: 0.07, cut: 600, a: 0.005, r: 0.08 }));
        if (on('arp')) for (let k = 0; k < 8; k++) tone(tc + k * spb * 0.25, notes[k % notes.length] + 12, spb * 0.22, { type: 'square', v: 0.02, cut: 3000, a: 0.003, r: 0.08 });
        if (on('drums') && s.feel !== 'sans')
          for (let beat = 0; beat < 2; beat++) {
            const tb = tc + beat * spb;
            const n = (i % 2) * 2 + beat; // temps dans la mesure
            if (s.feel === 'demi') {
              if (n === 0) kick(tb);
              if (n === 2) noise(tb, 0.18, 0.22, 1200);
            } else {
              if (n % 2 === 0 || s.energy > 0.8) kick(tb);
              if (n % 2 === 1) noise(tb, 0.16, 0.25, 1200);
            }
            const sub = s.energy > 0.7 ? 4 : 2;
            for (let k = 0; k < sub; k++) noise(tb + (k * spb) / sub, 0.04, 0.05, 7000);
          }
      });
      timers.push(
        setTimeout(() => {
          document.querySelectorAll('.ea-playing').forEach((x) => x.classList.remove('ea-playing'));
          document.querySelectorAll(`[data-b="${b.i}"], [data-sid="${b.sid}"]`).forEach((x) => x.classList.add('ea-playing'));
        }, (t - ctx.currentTime) * 1000)
      );
    });
    timers.push(setTimeout(stop, (blocks.length * 8 * spb + 0.6) * 1000));
    play = { ctx, timers };
    const btn = document.getElementById('eaPlay');
    if (btn && blocks.length > 1) btn.textContent = '■ Arrêter';
  }

  /* ---------- vue ---------- */
  /**
   * Colonnes de la vue « Par scène ».
   * @param {object} st état de la fenêtre : { style, arc: { e, preset, links, lift, picks, open } }
   * @param {object|null} d la déduction (deduceArc)
   * @param {Function} changed à appeler après un changement qui refait le calcul ; rerender : seulement redessiner
   */
  function columns(st, d, { changed, rerender, styleSelect }) {
    const a = st.arc;
    const present = new Set(d ? d.form.map((t) => E().momentOf(t).id) : []);
    const left = h(
      'div',
      { class: 'es-col es-in' },
      h('label', { class: 'es-lbl', for: 'esStyle' }, 'Style'),
      styleSelect(),
      h('div', { class: 'es-lbl' }, 'Trajectoires toutes faites'),
      h(
        'div',
        { class: 'ea-arcs' },
        ...E().ARCS.map((x) =>
          h(
            'button',
            { type: 'button', class: 'ea-arc' + (a.preset === x.id ? ' on' : ''), onclick: () => ((a.preset = x.id), (a.e = { ...x.e }), (a.links = {}), changed()) },
            h('span', { class: 'ea-strip' }, ...E().MOMENTS.map((m) => h('i', { style: `background:${col(x.e[m.id])}` }))),
            x.name
          )
        )
      ),
      h('div', { class: 'es-lbl' }, 'Émotion de chaque moment', SS.helpTip('Une émotion par moment de la chanson. Chaque scène en tire son mode, sa tonalité, sa grille, son énergie et les musiciens qui jouent. Le mélange de toute la chanson (le couplet et le refrain pèsent le plus) donne la forme, le tempo et le groupe. Estompé : ce moment n’est pas dans la forme choisie.', 'Émotion de chaque moment')),
      ...E().MOMENTS.map((m) =>
        h(
          'div',
          { class: 'ea-mrow' + (present.has(m.id) ? '' : ' ea-absent'), style: `--c:${col(a.e[m.id])}` },
          h('span', { class: 'es-dot' }),
          h('span', { class: 'ea-mn' }, m.name, h('small', {}, m.sub)),
          h('select', { 'aria-label': `Émotion : ${m.name}`, onchange: (ev) => ((a.e[m.id] = ev.target.value), (a.preset = null), changed()) }, ...SS.EMOTIONS.map((x) => h('option', { value: x.id, selected: x.id === a.e[m.id] }, x.label)))
        )
      )
    );
    if (!d) return [left, h('div', { class: 'es-col' }, h('p', { class: 'es-empty' }, 'Pas de chanson pour ce style.'))];

    const n = d.blocks.length;
    const sec = (sid) => d.sections.find((s) => s.sid === sid);
    const curve = h(
      'div',
      { class: 'ea-curve' },
      ...d.blocks.map((b) => {
        const s = sec(b.sid);
        return h(
          'button',
          { type: 'button', class: 'ea-cb', 'data-b': b.i, style: `width:${100 / n}%`, title: `${s.name} · ${emo(s.emotion).label} · ${keyText(s.key)}`, onclick: () => listen(d, [b]) },
          h('span', { class: 'ea-cbar', style: `height:${Math.round(14 + s.energy * 62)}px;background:${col(s.emotion)}` }),
          h('span', { class: 'ea-cn' }, s.lift ? s.name.replace(/^Dernier /, '').replace(/^./, (c) => c.toUpperCase()) : s.name),
          h('span', { class: 'ea-ck ' + (DARK.includes(s.key.mode) ? 'ea-dk' : 'ea-lt') }, shortKey(s.key) + (s.lift ? ' ↑' : ''))
        );
      })
    );
    const wrap = h('div', { class: 'ea-curvewrap' });
    // pointillé : la lumière (valence) de chaque passage
    const pts = d.blocks.map((b, i) => `${((i + 0.5) * 100) / n},${100 - emo(sec(b.sid).emotion).dims[0]}`).join(' ');
    wrap.innerHTML = `<svg class="ea-light" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(--c-amber)" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-dasharray="4 3"/></svg>`;
    wrap.append(curve);

    const kinds = kindsOf(d);
    const roleOf = (k) => SS.Band.ROLES[KIND_ROLE[k]];
    const cards = d.sections.map((s) => {
      const e = emo(s.emotion);
      const g = s.grids[s.pick];
      const isOpen = a.open === s.sid;
      const rel =
        s.rel === 'same' || s.lift
          ? null
          : h(
              'button',
              { type: 'button', class: 'ea-rel', title: 'Relative : mêmes notes, passage en douceur. Homonyme : même tonique, la lumière s’allume d’un coup.', onclick: () => ((a.links[s.moment] = s.rel === 'relative' ? 'parallel' : 'relative'), changed()) },
              `${REL[s.rel]} ⇄`
            );
      const blk = d.blocks.find((b) => b.sid === s.sid);
      return h(
        'div',
        { class: 'ea-card' + (isOpen ? ' open' : ''), 'data-sid': s.sid, style: `--c:${col(s.emotion)}` },
        h(
          'div',
          { class: 'ea-head' },
          h('span', { class: 'es-dot' }),
          h('b', {}, s.name),
          h('span', { class: 'ea-emo' }, e.label),
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'ea-pb', title: 'Écouter cette scène', 'aria-label': `Écouter ${s.name}`, onclick: () => listen(d, [blk]) }, '▶')
        ),
        h('span', { class: 'es-k' }, 'Tonalité'), h('span', { class: 'ea-v' }, keyText(s.key), rel),
        h('span', { class: 'es-k' }, 'Accords'),
        h(
          'button',
          { type: 'button', class: 'ea-v ea-chords selectable', title: 'Autres grilles possibles', onclick: () => ((a.open = isOpen ? null : s.sid), rerender()) },
          (g ? E().chordsIn(s.key, g.chords).map((c) => c.name).join('  ') : '—') + (s.pivot ? `  → ${s.pivot.name}` : ''),
          h('small', {}, g ? E().fromText(g, s.type) : '')
        ),
        h('span', { class: 'es-k' }, 'Énergie'), h('span', { class: 'ea-v' }, h('span', { class: 'es-en ea-en' }, h('i', { style: `width:${Math.round(s.energy * 100)}%` })), h('small', {}, FEEL[s.feel])),
        h('span', { class: 'es-k' }, 'Jouent'),
        h('span', { class: 'ea-v es-chips' }, ...kinds.map((k) => h('span', { class: 'es-chip' + (E().playsIn(s, k) ? '' : ' ea-off') }, h('i', { style: `background:${roleOf(k).color}` }), roleOf(k).short))),
        isOpen
          ? h(
              'div',
              { class: 'es-alts' },
              ...s.grids.slice(0, 6).map((x, j) =>
                h('button', { type: 'button', class: 'es-alt' + (j === s.pick ? ' on' : ''), onclick: () => ((a.picks[s.type] = j), changed(true)) }, h('b', {}, E().chordsIn(s.key, x.chords).map((c) => c.name).join(' ')), h('span', {}, E().fromText(x, s.type)))
              )
            )
          : null
      );
    });
    const pivots = d.sections.filter((s) => s.pivot);
    const right = h(
      'div',
      { class: 'es-col es-res' },
      h(
        'div',
        { class: 'es-grid ea-sum' },
        h('span', { class: 'es-k' }, 'Tempo'), h('div', { class: 'es-v' }, h('b', {}, `${d.tempo.bpm} BPM`), h('small', {}, 'le même partout, le ressenti change')), h('span'),
        h('span', { class: 'es-k' }, 'Départ'), h('div', { class: 'es-v' }, h('b', {}, keyText(d.home)), h('small', {}, `émotion du couplet : ${emo(d.moments.debut).label}`)), h('span'),
        h('span', { class: 'es-k' }, 'Modèle'), h('div', { class: 'es-v' }, h('b', {}, d.model ? `« ${d.model.song} »` : '—'), h('small', {}, `forme de ${d.orientation.ref}`)), h('span')
      ),
      h(
        'div',
        { class: 'es-lbl' },
        'La chanson, scène par scène',
        SS.helpTip('Hauteur : énergie. Couleur : émotion. Pointillé : lumière de l’émotion. Sous chaque passage, sa tonalité. Un clic sur un passage pour l’écouter (aperçu au synthé, deux mesures par passage).', 'La chanson, scène par scène'),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', id: 'eaPlay', class: 'btn', onclick: () => (play ? stop() : listen(d, d.blocks)) }, play ? '■ Arrêter' : '▶ Écouter la trajectoire')
      ),
      wrap,
      pivots.length
        ? h(
            'div',
            { class: 'ea-pivots' },
            h('span', { class: 'es-k' }, 'Charnières'),
            SS.helpTip('Quand la tonalité change, la dernière mesure de la scène d’avant joue la dominante (V7) de la tonalité qui arrive : le changement s’annonce au lieu de tomber d’un coup.', 'Charnières'),
            ...pivots.map((s) => h('span', {}, `${s.name} → ${keyText(s.pivot.to)} : `, h('b', {}, s.pivot.name)))
          )
        : null,
      d.canLift
        ? h(
            'label',
            { class: 'ea-lift' },
            h('input', { type: 'checkbox', checked: a.lift, onchange: (ev) => ((a.lift = ev.target.checked), changed()) }),
            'Dernier refrain un ton plus haut',
            SS.helpTip('Le dernier refrain monte d’un ton : l’euphorie, le triomphe ou la joie gagnent une marche. Proposé quand le refrain porte une émotion qui monte et revient au moins deux fois.', 'Dernier refrain')
          )
        : null,
      h('div', { class: 'ea-cards' }, ...cards)
    );
    return [left, right];
  }

  return { columns, listen, stop, barsOf, kindsOf };
})();
