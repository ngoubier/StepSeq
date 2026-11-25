/*
 * Assistant « Nouvelle chanson » : frise de lecture sous la barre du haut.
 *
 * Une bande fine montre les scènes de la chanson dans l'ordre de l'arrangement (une case par bloc joué, largeur
 * proportionnelle à sa durée, couleur de la scène), la scène qu'on entend, remplie au fil de la lecture, et le curseur.
 * À gauche : « Scène : Refrain · 2/8 » (mesure en cours dans la scène) ; à droite : temps écoulé / durée de la chanson.
 * Un clic sur une case fait jouer la chanson à partir de ce bloc. Un bloc répété montre « ×2 » ; pendant la lecture,
 * l'accord en cours et le suivant s'affichent à gauche ; au survol, une bulle résume la scène (mesures, début, durée,
 * tonalité, émotion, grille d'accords, pistes qui jouent). Même frise dans l'Assistant et dans la Grille (js/song.js).
 *
 * model() et at() sont des fonctions pures (testées sous Node) ; render() et update() dessinent dans l'élément donné.
 */
window.SS = window.SS || {};

SS.wizPlayBar = (() => {
  /**
   * Blocs de la chanson : res = { scenes: [{ id, sec, name, bars, tempo? }], song: [{ scene, repeat }] }.
   * opts : { spb (pas de double croche par mesure), tempo (BPM de la chanson) }.
   * Renvoie { blocks: [{ song, rep, sceneId, sec, name, start, bars, t0, dur }], bars, secs } (start en mesures, t0/dur en s).
   */
  function model(res, { spb = 16, tempo = 120 } = {}) {
    const blocks = [];
    let bars = 0;
    let secs = 0;
    (res && res.song ? res.song : []).forEach((b, i) => {
      const sc = res.scenes.find((x) => x.id === b.scene);
      if (!sc || !sc.bars) return;
      const dur = (sc.bars * spb * 60) / (sc.tempo || tempo) / 4;
      for (let r = 0; r < (b.repeat || 1); r++) {
        blocks.push({ song: i, rep: r, reps: b.repeat || 1, sceneId: sc.id, sec: sc.sec || null, name: sc.name || sc.id, start: bars, bars: sc.bars, t0: secs, dur });
        bars += sc.bars;
        secs += dur;
      }
    });
    return { blocks, bars, secs };
  }

  /**
   * Position de lecture (en mesures depuis le début de la chanson), -1 à l'arrêt.
   * play : { mode: 'song' | 'scene' | null, block (index dans res.song), scene (id), step (pas depuis le début du bloc
   * en mode chanson, depuis le début de la boucle en mode scène), spb }.
   * En mode scène, la scène est montrée à son premier bloc dans l'arrangement.
   */
  function at(m, play) {
    if (!m || !play || !play.mode || !play.scene || !(play.step >= 0)) return -1;
    const spb = play.spb || 16;
    let first;
    if (play.mode === 'song') first = m.blocks.find((b) => b.song === play.block && b.sceneId === play.scene);
    else first = m.blocks.find((b) => b.sceneId === play.scene);
    if (!first) return -1;
    const inBlock = play.mode === 'song' ? play.step / spb : (play.step % (first.bars * spb)) / spb;
    return Math.min(m.bars, first.start + inBlock);
  }

  /** Le bloc joué à la position `pos` (mesures), ou null. */
  const blockAt = (m, pos) => (pos < 0 ? null : m.blocks.find((b) => pos >= b.start && pos < b.start + b.bars) || null);

  /** Secondes depuis le début de la chanson à la position `pos` (mesures). */
  function timeAt(m, pos) {
    const b = blockAt(m, pos);
    if (!b) return pos >= m.bars && m.bars ? m.secs : 0;
    return b.t0 + ((pos - b.start) / b.bars) * b.dur;
  }

  /** Accord en cours et suivant à `bar` mesures du début de la scène : chords = [{ bar, name }] triés. */
  function chordAt(chords, bar) {
    if (!chords || !chords.length) return null;
    let i = -1;
    for (let k = 0; k < chords.length; k++) if (chords[k].bar <= bar + 1e-6) i = k;
    if (i < 0) return null;
    // l'accord suivant qui change de nom (une grille qui boucle repart au premier)
    let n = (i + 1) % chords.length;
    for (let k = 0; k < chords.length && chords[n].name === chords[i].name; k++) n = (n + 1) % chords.length;
    return { now: chords[i].name, next: chords[n].name !== chords[i].name ? chords[n].name : null };
  }

  /** Grille d'accords compacte : une grille répétée (Am F Am F…) une seule fois, avec son nombre de tours. */
  function cycle(names) {
    const c = (names || []).filter((x, i, a) => i === 0 || x !== a[i - 1]);
    let per = c.length;
    for (let n = 1; n < c.length; n++) if (c.length % n === 0 && c.every((x, i) => x === c[i % n])) { per = n; break; }
    return { chords: c.slice(0, per), turns: per ? c.length / per : 0 };
  }

  /** « 1:05 » */
  const fmt = (s) => {
    const n = Math.max(0, Math.round(s));
    return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  };

  /**
   * Couleur d'une partie de la chanson (intro, couplet, refrain…), la même dans l'Assistant et dans la Grille.
   * kind : id de section de l'assistant (« chorus », « verse2 ») ou nom de scène (« Refrain », « Pont 2 »).
   */
  const SEC_COLORS = [
    [/^intro/, '#4aa3c9'], [/^(verse|groove|theme|couplet)/, '#4f6bff'], [/^(pre|pré|build|montée)/, '#f08a00'],
    [/^(chorus|drop|peak|post|refrain)/, '#e3179c'], [/^(bridge|break|pont)/, '#9b5cff'], [/^(solo|instr|riff)/, '#13c2a3'], [/^(outro|fin)/, '#7a8a99'],
  ];
  const colorOf = (kind) => {
    const k = String(kind || '').trim().toLowerCase();
    return (SEC_COLORS.find(([re]) => re.test(k)) || [0, '#8a8a96'])[1];
  };

  /* ---------------------------------------------------------------- dessin */
  const mk = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  /**
   * Dessine la frise. opts : { color(sec) → couleur CSS, word ('Scène' ou 'Passage'), onSeek(songIndex),
   * badge(block, i) → pastille de changement de tonalité (« ↗ ½ ton ») ou rien,
   * chords(sceneId) → [{ bar, name }] (accord en cours pendant la lecture),
   * info(block) → { key, emotion, tracks: [{ name, color, on }] } pour la bulle, hint (gestes, en bas de la bulle) }.
   * La frise garde son modèle (el._pb) pour update().
   */
  function render(el, m, opts = {}) {
    hideTip();
    el._pb = { m, word: opts.word || 'Scène', opts, chords: new Map() };
    const now = mk('div', 'wpb-now');
    const track = mk('div', 'wpb-track');
    track.setAttribute('role', 'group');
    track.setAttribute('aria-label', 'Scènes de la chanson');
    m.blocks.forEach((b, i) => {
      const c = mk('button', 'wpb-sc');
      c.type = 'button';
      c.dataset.i = i;
      c.style.flex = `${b.bars} 1 0`;
      c.style.setProperty('--c', opts.color ? opts.color(b.sec) : 'var(--c-faint)');
      c.setAttribute('aria-label', `${b.name} · ${b.bars} mes.${b.reps > 1 ? ` · passage ${b.rep + 1}/${b.reps}` : ''} · ${fmt(b.t0)}`);
      c.append(mk('i', 'wpb-fill'), mk('span', '', b.name));
      if (b.reps > 1) c.append(mk('small', 'wpb-rep', `×${b.reps}`));
      const badge = opts.badge && opts.badge(b, i);
      if (badge) c.append(mk('em', 'wpb-key', badge));
      c.addEventListener('pointerenter', (e) => e.pointerType !== 'touch' && showTip(el, c, b, badge));
      c.addEventListener('pointerleave', hideTip);
      c.addEventListener('pointerdown', hideTip);
      if (opts.onSeek) c.addEventListener('click', () => opts.onSeek(b.song));
      track.append(c);
    });
    const head = mk('i', 'wpb-head');
    head.hidden = true;
    track.append(head);
    const time = mk('div', 'wpb-time');
    el.replaceChildren(now, track, time);
    update(el, -1);
  }

  /** Met la frise à la position `pos` (mesures, -1 = arrêt). */
  function update(el, pos) {
    const st = el && el._pb;
    if (!st) return;
    const { m, word } = st;
    const cur = blockAt(m, pos);
    const track = el.querySelector('.wpb-track');
    track.querySelectorAll('.wpb-sc').forEach((c) => {
      const b = m.blocks[Number(c.dataset.i)];
      const on = b === cur;
      c.classList.toggle('on', on);
      c.classList.toggle('past', pos >= 0 && b.start + b.bars <= pos);
      c.firstChild.style.width = on ? `${((pos - b.start) / b.bars) * 100}%` : '';
    });
    const head = el.querySelector('.wpb-head');
    head.hidden = pos < 0 || !m.bars;
    if (!head.hidden) head.style.left = `${(Math.min(pos, m.bars) / m.bars) * 100}%`;
    const now = el.querySelector('.wpb-now');
    now.replaceChildren(`${word} : `, mk('b', '', cur ? cur.name : '—'), cur ? ` · ${Math.floor(pos - cur.start) + 1}/${cur.bars}` : '');
    const ch = cur && chordAt(chordsOf(st, cur.sceneId), pos - cur.start);
    if (ch) now.append(mk('span', 'wpb-chord', ch.now), ch.next ? mk('span', 'wpb-next', `→ ${ch.next}`) : '');
    el.querySelector('.wpb-time').textContent = `${fmt(pos < 0 ? 0 : timeAt(m, pos))} / ${fmt(m.secs)}`;
  }

  /** Accords d'une scène, demandés une fois par dessin de la frise. */
  function chordsOf(st, id) {
    if (!st.opts.chords) return null;
    if (!st.chords.has(id)) st.chords.set(id, (st.opts.chords(id) || []).slice().sort((a, b) => a.bar - b.bar));
    return st.chords.get(id);
  }

  /* ----- bulle au survol d'une case ----- */
  let tip = null;
  function hideTip() {
    if (tip) tip.remove();
    tip = null;
  }
  function showTip(el, c, b, badge) {
    hideTip();
    const st = el._pb;
    if (!st) return;
    const info = (st.opts.info && st.opts.info(b)) || {};
    const color = st.opts.color ? st.opts.color(b.sec) : 'var(--c-faint)';
    const row = (...kids) => {
      const r = mk('div', 'wpb-tip-row');
      kids.filter((k) => k != null && k !== '').forEach((k) => r.append(k));
      return r;
    };
    const strong = (t) => mk('b', '', t);
    tip = mk('div', 'wpb-tip');
    tip.setAttribute('role', 'tooltip');
    tip.style.setProperty('--c', color);
    const title = mk('div', 'wpb-tip-title');
    title.append(mk('i'), b.name, b.reps > 1 ? mk('small', '', ` · passage ${b.rep + 1}/${b.reps}`) : '');
    tip.append(title);
    const bars = mk('span');
    bars.append(strong(`${b.bars} mes.`), b.reps > 1 ? ` × ${b.reps}` : '');
    const t0 = mk('span');
    t0.append('début ', strong(fmt(b.t0)));
    const d = mk('span');
    d.append('durée ', strong(fmt(b.dur * b.reps)));
    tip.append(row(bars, t0, d));
    if (info.key || info.emotion) {
      const k = info.key ? mk('span', '', info.key) : null;
      if (k && badge) k.append(' ', mk('em', 'wpb-key', badge));
      tip.append(row(k, info.emotion ? mk('span', '', (info.key ? '· ' : '') + info.emotion) : null));
    }
    const cy = cycle((chordsOf(st, b.sceneId) || []).map((x) => x.name));
    if (cy.chords.length) {
      const box = mk('div', 'wpb-tip-chords');
      cy.chords.slice(0, 12).forEach((n) => box.append(mk('span', '', n)));
      if (cy.chords.length > 12) box.append(mk('small', '', '…'));
      if (cy.turns > 1) box.append(mk('small', '', `×${cy.turns}`));
      tip.append(box);
    }
    if (info.tracks && info.tracks.length) {
      const dots = mk('div', 'wpb-tip-dots');
      info.tracks.forEach((t) => {
        const i = mk('i', t.on ? 'on' : '');
        i.style.setProperty('--tc', t.color);
        i.title = t.name;
        dots.append(i);
      });
      const n = info.tracks.filter((t) => t.on).length;
      tip.append(row(mk('span', '', `${n}/${info.tracks.length} pistes`), dots));
    }
    if (st.opts.hint) tip.append(mk('div', 'wpb-tip-hint', st.opts.hint));
    // dans une fenêtre ouverte (couche supérieure), la bulle va dans la fenêtre pour rester visible
    (el.closest('dialog[open]') || document.body).append(tip);
    const r = c.getBoundingClientRect();
    const w = tip.offsetWidth;
    const hgt = tip.offsetHeight;
    tip.style.left = Math.max(6, Math.min(r.left, innerWidth - w - 6)) + 'px';
    tip.style.top = (r.bottom + 8 + hgt > innerHeight ? Math.max(6, r.top - hgt - 8) : r.bottom + 8) + 'px';
  }

  return { model, at, blockAt, timeAt, fmt, colorOf, chordAt, cycle, render, update, hideTip };
})();
