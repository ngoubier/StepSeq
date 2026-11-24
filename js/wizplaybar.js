/*
 * Assistant « Nouvelle chanson » : frise de lecture sous la barre du haut.
 *
 * Une bande fine montre les scènes de la chanson dans l'ordre de l'arrangement (une case par bloc joué, largeur
 * proportionnelle à sa durée, couleur de la scène), la scène qu'on entend, remplie au fil de la lecture, et le curseur.
 * À gauche : « Scène : Refrain · 2/8 » (mesure en cours dans la scène) ; à droite : temps écoulé / durée de la chanson.
 * Un clic sur une case fait jouer la chanson à partir de ce bloc.
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
        blocks.push({ song: i, rep: r, sceneId: sc.id, sec: sc.sec || null, name: sc.name || sc.id, start: bars, bars: sc.bars, t0: secs, dur });
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

  /** « 1:05 » */
  const fmt = (s) => {
    const n = Math.max(0, Math.round(s));
    return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  };

  /* ---------------------------------------------------------------- dessin */
  const mk = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  /**
   * Dessine la frise. opts : { color(sec) → couleur CSS, word ('Scène' ou 'Passage'), onSeek(songIndex) }.
   * La frise garde son modèle (el._pb) pour update().
   */
  function render(el, m, opts = {}) {
    el._pb = { m, word: opts.word || 'Scène' };
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
      c.title = `${b.name} · ${b.bars} mes. · ${fmt(b.t0)} — clic : écouter la chanson à partir d'ici`;
      c.append(mk('i', 'wpb-fill'), mk('span', '', b.name));
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
    el.querySelector('.wpb-time').textContent = `${fmt(pos < 0 ? 0 : timeAt(m, pos))} / ${fmt(m.secs)}`;
  }

  return { model, at, blockAt, timeAt, fmt, render, update };
})();
