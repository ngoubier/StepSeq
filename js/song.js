/*
 * Chanson : scènes (Intro, Couplet, Refrain…) et arrangement.
 * Sous la barre du haut, la frise de la chanson (#gridPlayBar, même dessin que celle de l'Assistant, js/wizplaybar.js) :
 * une case par bloc joué ; clic = éditer la scène et partir d'ici, double-clic = sa fiche, clic droit = menu.
 * La fenêtre Arrangement (bouton de la barre du haut) sert à tout le reste.
 * Une scène = le contenu de toutes les pistes (pas / notes) + son nombre de mesures.
 * L'arrangement enchaîne des blocs « scène × répétitions ».
 */
window.SS = window.SS || {};

SS.song = (() => {
  const $ = (s) => document.querySelector(s);
  let app;
  let playing = -1; // bloc en cours de lecture
  let playingRep = 0;

  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    children.flat().forEach((c) => c != null && el.append(c));
    return el;
  };

  const p = () => app.project();
  const sceneOf = (id) => p().scenes.find((sc) => sc.id === id);
  const barsOf = (sc) => (sc.id === p().current ? p().bars : sc.bars);
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

  function render() {
    if (!app || !app.project()) return;
    const pr = p();
    // mode
    $('#songMode').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.mode === pr.playMode));
    document.body.classList.toggle('song-mode', pr.playMode === 'song');

    renderBar();
    renderWindow();
    if (SS.sceneSheet) SS.sceneSheet.refresh();
  }

  function changedSong() {
    app.changed();
    render();
  }

  function setRepeat(i, n) {
    p().song[i].repeat = Math.max(1, Math.min(64, n));
    changedSong();
  }
  function moveBlock(i, d) {
    const s = p().song;
    const j = i + d;
    if (j < 0 || j >= s.length) return;
    [s[i], s[j]] = [s[j], s[i]];
    if (app.state.songStart === i) app.state.songStart = j;
    changedSong();
  }
  function removeBlock(i) {
    p().song.splice(i, 1);
    app.state.songStart = Math.min(app.state.songStart, p().song.length - 1);
    changedSong();
  }

  function remove(sc) {
    if (!confirm(`Supprimer la scène « ${sc.name} » et ses notes ? Elle sera aussi retirée de la chanson.`)) return;
    const wasCurrent = sc.id === p().current;
    SS.deleteScene(p(), sc.id);
    app.state.songStart = Math.min(app.state.songStart, p().song.length - 1);
    if (wasCurrent) app.afterSceneChange();
    changedSong();
  }

  function rename(sc, box) {
    const input = h('input', { type: 'text', value: sc.name, class: 'scene-rename', maxlength: 40 });
    box.replaceWith(input);
    input.focus();
    input.select();
    const done = (ok) => {
      if (ok && input.value.trim()) {
        sc.name = input.value.trim();
        app.changed();
      }
      render();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') done(true);
      if (e.key === 'Escape') {
        e.preventDefault(); // n'abandonne que le renommage, sans fermer la fenêtre Arrangement
        done(false);
      }
    });
    input.addEventListener('blur', () => done(true), { once: true });
  }

  /** Appelé pendant la lecture de la chanson (i = -1 à l'arrêt). */
  function setPlaying(i, rep = 0) {
    playing = i;
    playingRep = rep;
    lastStep = i < 0 ? -1 : 0; // nouveau bloc (ou arrêt) : le curseur part de son début
    if (!app || !app.project()) return;
    render();
    const block = i >= 0 && p().song[i];
    const sc = block && sceneOf(block.scene);
    $('#lcdTitle').textContent = sc ? `${sc.name} ${rep + 1}/${block.repeat}` : '';
    if (i >= 0) {
      const blk = winOpen() && $('#sgBlocks').children[i];
      if (blk) blk.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  /* ---------- Fenêtre Arrangement ---------- */
  /*
   * À gauche, les scènes en colonne (toutes visibles) : clic = éditer, ▶ = l'écouter en boucle, ⋯ = renommer, dupliquer,
   * fiche, supprimer ; glisser une ligne pour ranger, ou sur la chanson pour l'y ajouter.
   * À droite, la chanson : un bloc par élément de l'arrangement, large comme sa durée (la chanson tient dans la largeur) ;
   * glisser = déplacer (Alt : copier), tirer le bord droit = répétitions. Dessous, une ligne par piste : qui joue où
   * (clic = couper / remettre la piste dans cette scène, même réglage que la fiche Scène). Automation par temps repliée.
   */
  const BAR_CHOICES = [1, 2, 4, 8, 16, 32, 64];
  const LAB = 96; // largeur des noms de lignes à gauche de la chanson
  const AUTO_KEY = 'stepseq.songAuto';
  const winOpen = () => $('#songDialog').open;
  const letterOf = (sc) => String.fromCharCode(65 + (p().scenes.indexOf(sc) % 26));
  const colorOfScene = (sc) => SS.wizPlayBar.colorOf(String(sc.sec || sc.name || '').replace(/\s*\d+$/, ''));
  const density = (sc, t) => (SS.sceneSheet && SS.sceneSheet.perBar ? SS.sceneSheet.perBar(p(), sc, t) : { bars: [], total: 0 });
  /** Une piste dans une scène : 'on' (elle joue), 'mute' (coupée dans cette scène), 'empty' (pas de notes). */
  function trackState(sc, t) {
    const d = density(sc, t);
    if (!d.total && !d.follows) return { st: 'empty', d };
    return { st: SS.sceneMuted(p(), t, sc) ? 'mute' : 'on', d };
  }

  function sceneRow(sc) {
    const pr = p();
    const cur = sc.id === pr.current;
    const looping = SS.audio.isPlaying() && pr.playMode === 'loop' && cur;
    const row = h(
      'div',
      {
        class: 'sg-srow' + (cur ? ' active' : ''),
        role: 'listitem',
        'data-id': sc.id,
        tabindex: '0',
        'aria-current': cur ? 'true' : null,
        style: `--c:${colorOfScene(sc)}`,
        title: `${sc.name} — clic : éditer · glisser : ranger, ou déposer dans la chanson · double-clic sur le nom : renommer`,
        onkeydown: (e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            app.switchScene(sc.id);
          } else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            e.preventDefault();
            const i = pr.scenes.indexOf(sc);
            moveScene(i, i + (e.key === 'ArrowUp' ? -1 : 1));
          }
        },
      },
      h('b', { class: 'sg-letter' }, letterOf(sc)),
      h('span', { class: 'sg-name' }, sc.name),
      h('span', { class: 'sg-dots', 'aria-hidden': 'true' }, pr.tracks.map((t) => h('i', { class: trackState(sc, t).st === 'on' ? 'on' : '', style: `--tc:${t.color}` }))),
      h(
        'select',
        { class: 'sg-bars', 'aria-label': `Longueur de « ${sc.name} »`, title: 'Longueur de la scène (mesures)', onchange: (e) => setSceneBars(sc, +e.target.value) },
        BAR_CHOICES.concat(BAR_CHOICES.includes(barsOf(sc)) ? [] : [barsOf(sc)]).sort((a, b) => a - b).map((n) => h('option', { value: n, selected: n === barsOf(sc) }, String(n)))
      ),
      h('button', { type: 'button', class: 'sg-ico sg-loop' + (looping ? ' on' : ''), title: looping ? 'Arrêter' : `Écouter « ${sc.name} » en boucle`, 'aria-label': looping ? 'Arrêter' : 'Écouter en boucle', onclick: () => playScene(sc) }, looping ? '■' : '▶'),
      h('button', { type: 'button', class: 'sg-ico sg-more', title: 'Plus…', 'aria-label': `Plus pour « ${sc.name} »`, 'aria-haspopup': 'menu', onclick: (e) => sceneMenu(sc, e.currentTarget) }, '⋯')
    );
    row.addEventListener('pointerdown', (e) => startDrag(e, { kind: 'scene', id: sc.id, el: row }));
    return row;
  }

  function sceneMenu(sc, btn) {
    const r = btn.getBoundingClientRect();
    popMenu(`${sc.name} · ${barsOf(sc)} mes.`, [
      { label: 'Renommer', fn: () => rename(sc, document.querySelector(`#sgSceneList [data-id="${sc.id}"] .sg-name`)) },
      { label: 'Dupliquer', fn: () => duplicate(sc) },
      { label: 'Fiche de la scène…', fn: () => SS.sceneSheet && SS.sceneSheet.open(sc.id) },
      { label: 'Ajouter à la fin de la chanson', fn: () => insertBlock(sc.id, p().song.length) },
      null,
      p().scenes.length > 1 ? { label: 'Supprimer la scène', fn: () => remove(sc), cls: 'pbm-del' } : null,
    ], r.left, r.bottom + 4);
  }

  /** ▶ d'une scène : l'écouter en boucle (lecture Scène) ; un second clic arrête. */
  function playScene(sc) {
    const pr = p();
    const same = SS.audio.isPlaying() && pr.playMode === 'loop' && pr.current === sc.id;
    if (SS.audio.isPlaying() || SS.audio.isPaused()) app.stop();
    if (same) return render();
    if (pr.playMode !== 'loop') {
      pr.playMode = 'loop';
      app.changed();
    }
    if (sc.id !== pr.current) app.switchScene(sc.id);
    app.play();
    render();
  }

  function blockTile(b, i, start, px) {
    const pr = p();
    const sc = sceneOf(b.scene);
    if (!sc) return null;
    const bars = barsOf(sc);
    const rep = i === playing ? `${playingRep + 1}/${b.repeat}` : `× ${b.repeat}`;
    const el = h(
      'div',
      {
        class: 'sg-block' + (i === app.state.songStart ? ' start' : '') + (i === playing ? ' playing' : '') + (sc.id === pr.current ? ' editing' : ''),
        role: 'listitem',
        tabindex: '0',
        'data-i': i,
        style: `left:${start * px}px;width:${bars * b.repeat * px}px;--c:${colorOfScene(sc)};--rw:${bars * px}px`,
        title: `${sc.name} : ${bars} mesure(s) × ${b.repeat} — clic : éditer et partir d'ici · glisser : déplacer (Alt : copier) · bord droit : répétitions · double-clic : fiche · clic droit : plus`,
        oncontextmenu: (e) => {
          e.preventDefault();
          openMenu({ song: i, sceneId: sc.id }, e.clientX || el.getBoundingClientRect().left, (e.clientY || el.getBoundingClientRect().bottom) + 4);
        },
        onkeydown: (e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') (e.preventDefault(), clickOn({ kind: 'block', i }));
          else if (e.key === '+' || e.key === '=') setRepeat(i, b.repeat + 1);
          else if (e.key === '-') setRepeat(i, b.repeat - 1);
          else if ((e.key === 'Delete' || e.key === 'Backspace') && pr.song.length > 1) (e.preventDefault(), removeBlock(i));
          else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) (e.preventDefault(), moveBlock(i, e.key === 'ArrowLeft' ? -1 : 1));
        },
      },
      b.repeat > 1 ? h('i', { class: 'sg-reps', 'aria-hidden': 'true' }) : null,
      h('span', { class: 'sb-name' }, h('b', {}, letterOf(sc)), ' ', sc.name),
      h('small', { class: 'sg-block-bars' }, `${bars} mes.`, b.repeat > 1 || i === playing ? ` ${rep}` : ''),
      h('span', { class: 'sg-grow', title: 'Tirer : plus ou moins de répétitions', 'aria-hidden': 'true' })
    );
    el.addEventListener('pointerdown', (e) => (e.target.closest('.sg-grow') ? startGrow(e, i, el, bars * px) : startDrag(e, { kind: 'block', i, el })));
    return el;
  }

  /** Une ligne par piste : qui joue dans chaque bloc (petites barres = notes par mesure). */
  function trackLanes(starts, px) {
    const pr = p();
    return pr.tracks.map((t) => {
      const cells = pr.song.map((b, i) => {
        const sc = sceneOf(b.scene);
        if (!sc) return null;
        const { st, d } = trackState(sc, t);
        const bars = barsOf(sc);
        const max = Math.max(1, ...d.bars);
        const ticks = st === 'on' ? Array.from({ length: bars * b.repeat }, (_, k) => {
          const v = d.follows && !d.total ? max : d.bars[k % bars] || 0;
          return h('i', { style: `height:${v ? 25 + Math.round((v / max) * 65) : 0}%` });
        }) : [];
        const word = st === 'on' ? 'joue (clic : la couper dans cette scène)' : st === 'mute' ? 'coupée dans cette scène (clic : la remettre)' : 'pas de notes';
        return h(
          'button',
          {
            type: 'button',
            class: 'sg-cell ' + st,
            style: `left:${starts[i] * px}px;width:${bars * b.repeat * px}px`,
            title: `${t.name} · ${sc.name} : ${word}`,
            'aria-label': `${t.name}, ${sc.name} : ${word}`,
            disabled: st === 'empty',
            onclick: () => setSceneMute(sc, t, st === 'on'),
          },
          ticks
        );
      });
      return h('div', { class: 'sg-lane', style: `--tc:${t.color}` }, h('span', { class: 'sg-lane-name', title: t.name }, h('i'), t.name), cells);
    });
  }

  function setSceneMute(sc, t, on) {
    sc.mute = sc.mute || {};
    if (on) sc.mute[t.id] = true;
    else delete sc.mute[t.id];
    if (!Object.keys(sc.mute).length) delete sc.mute;
    if (SS.audio && SS.audio.applyMutes) SS.audio.applyMutes(p());
    if (SS.sceneSheet && SS.sceneSheet.paintMutes) SS.sceneSheet.paintMutes();
    changedSong();
  }

  /* Chanson : chaque bloc est large comme sa durée, la chanson tient dans la largeur de la fenêtre. */
  let px = 20;
  function blockStarts() {
    const out = [];
    let at = 0;
    p().song.forEach((b) => {
      const sc = sceneOf(b.scene);
      out.push(at);
      at += sc ? barsOf(sc) * b.repeat : 0;
    });
    return { starts: out, total: at };
  }
  function renderWindow() {
    if (!winOpen() || drag) return;
    const pr = p();
    $('#sgSceneList').replaceChildren(...pr.scenes.map(sceneRow));
    const tl = $('#sgTimeline');
    const { starts, total } = blockStarts();
    px = Math.max(1, (tl.clientWidth - LAB - 4) / Math.max(1, total));
    tl.style.setProperty('--lab', LAB + 'px');
    // règle : mesures en haut, minutes en dessous
    const every = [1, 2, 4, 8, 16, 32].find((n) => n * px >= 34) || 64;
    const marks = [];
    for (let m = 0; m < total; m += every) marks.push(h('span', { style: `left:${m * px}px` }, String(m + 1)));
    const len = SS.songLength(pr);
    const secPerBar = total ? len.seconds / total : 0;
    for (let s = 30; secPerBar && s < len.seconds; s += 30) marks.push(h('span', { class: 'sg-min', style: `left:${(s / secPerBar) * px}px` }, fmtTime(s)));
    $('#sgRuler').replaceChildren(...marks);
    $('#sgBlocks').replaceChildren(...pr.song.map((b, i) => blockTile(b, i, starts[i], px)).filter(Boolean), h('i', { class: 'sg-drop-line', hidden: true }));
    $('#sgLanes').replaceChildren(...trackLanes(starts, px));
    if ($('#sgAutoBox').open && SS.beatAutoUI) SS.beatAutoUI.songView($('#sgAuto'), $('#sgAutoTools'), px, app);
    $('#sgTotal').textContent = `${len.bars} mes. · ${fmtTime(len.seconds)}`;
    $('#sgLoop').checked = !!pr.songLoop;
    $('#sgMode').querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.mode === pr.playMode));
    const on = SS.audio.isPlaying();
    $('#sgPlay').classList.toggle('on', on);
    $('#sgPlay').querySelector('.sg-play-ic').textContent = on ? '■' : '▶';
    $('#sgPlay').querySelector('.sg-play-txt').textContent = on ? 'Arrêter' : 'Écouter';
    setStep(lastStep);
  }

  /** Tête de lecture de la fenêtre : même position que la frise du haut. */
  function setStep(step) {
    lastStep = step;
    updateBar();
    const head = $('#sgHead');
    if (!head || !winOpen()) return;
    const bar = $('#gridPlayBar');
    const pos = bar && bar._pb ? barPos(bar._pb.m) : -1;
    head.hidden = pos < 0;
    if (pos >= 0) head.style.left = LAB + pos * px + 'px';
  }

  /* ----- actions ----- */
  function moveScene(from, to) {
    const sc = p().scenes;
    if (to < 0 || to >= sc.length || from === to) return;
    const [x] = sc.splice(from, 1);
    sc.splice(to, 0, x);
    changedSong();
    requestAnimationFrame(() => {
      const el = document.querySelector(`#sgSceneList [data-id="${x.id}"]`);
      el && el.focus();
    });
  }
  function insertBlock(sceneId, at, repeat = 1) {
    const s = p().song;
    at = Math.max(0, Math.min(s.length, at));
    s.splice(at, 0, { scene: sceneId, repeat });
    if (at <= app.state.songStart && s.length > 1) app.state.songStart++;
    changedSong();
  }
  function moveBlockTo(from, to) {
    const s = p().song;
    if (to > from) to--; // l'indice d'insertion compte encore le bloc déplacé
    if (from === to) return render();
    const [x] = s.splice(from, 1);
    s.splice(to, 0, x);
    const st = app.state.songStart;
    if (st === from) app.state.songStart = to;
    else if (from < st && to >= st) app.state.songStart--;
    else if (from > st && to <= st) app.state.songStart++;
    changedSong();
  }
  function duplicate(sc) {
    if (sc.id !== p().current) app.switchScene(sc.id);
    const id = SS.addScene(p(), { copy: true }); // juste après l'original
    const copy = sceneOf(id);
    const used = new Set(p().scenes.map((x) => x.name));
    let name = sc.name + ' (copie)';
    for (let n = 2; used.has(name); n++) name = `${sc.name} (copie ${n})`;
    copy.name = name;
    app.switchScene(id);
    app.changed();
  }
  function newEmptyScene() {
    const id = SS.addScene(p(), { copy: false });
    app.switchScene(id);
    app.changed();
  }
  function setSceneBars(sc, n) {
    if (sc.id !== p().current) app.switchScene(sc.id);
    app.setBars(n);
    render();
  }

  /* ----- tirer le bord droit d'un bloc : ses répétitions ----- */
  function startGrow(e, i, el, unit) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const r0 = p().song[i].repeat;
    let n = r0;
    drag = { grow: true };
    document.body.classList.add('sg-grow-on');
    try {
      el.setPointerCapture(e.pointerId);
    } catch (err) {
      /* ignore */
    }
    const move = (ev) => {
      n = Math.max(1, Math.min(64, Math.round(r0 + (ev.clientX - x0) / unit)));
      el.style.width = n * unit + 'px';
      el.querySelector('.sg-block-bars').textContent = `${Math.round(unit / px)} mes. × ${n}`;
    };
    const end = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
      document.body.classList.remove('sg-grow-on');
      drag = null;
      justDragged = true;
      setTimeout(() => (justDragged = false), 0);
      if (n !== r0) setRepeat(i, n);
      else renderWindow();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  /* ----- glisser-déposer (pointeur : souris, stylet et doigt) ----- */
  let drag = null;
  let justDragged = false;
  function startDrag(e, src) {
    if (e.button !== 0 || e.target.closest('button, select, input')) return;
    const x0 = e.clientX, y0 = e.clientY;
    const d = { src, x0, y0, started: false, ghost: null, target: null, pid: e.pointerId };
    const move = (ev) => {
      if (!d.started) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        d.started = true;
        drag = d;
        const r = src.el.getBoundingClientRect();
        d.dx = x0 - r.left;
        d.dy = y0 - r.top;
        d.ghost = src.el.cloneNode(true);
        d.ghost.classList.add('sg-ghost');
        d.ghost.style.width = r.width + 'px';
        d.ghost.style.height = r.height + 'px';
        $('#songDialog').append(d.ghost); // dans la fenêtre (couche supérieure), au-dessus de tout
        src.el.classList.add('sg-dragging');
        document.body.classList.add('sg-drag-on');
      }
      ev.preventDefault();
      d.ghost.style.left = ev.clientX - d.dx + 'px';
      d.ghost.style.top = ev.clientY - d.dy + 'px';
      d.copy = ev.altKey;
      showTarget(d, (d.target = findTarget(d, ev.clientX, ev.clientY)));
    };
    const end = (ev) => {
      src.el.removeEventListener('pointermove', move);
      src.el.removeEventListener('pointerup', end);
      src.el.removeEventListener('pointercancel', end);
      if (!d.started) {
        if (ev.type === 'pointerup') (isDouble(src, ev) || clickOn(src));
        return;
      }
      drag = null;
      justDragged = true;
      setTimeout(() => (justDragged = false), 0);
      d.ghost.remove();
      document.body.classList.remove('sg-drag-on');
      showTarget(d, null);
      const t = ev.type === 'pointerup' ? d.target : null;
      if (!t) return renderWindow();
      if (src.kind === 'scene' && t.zone === 'scenes') {
        const from = p().scenes.findIndex((x) => x.id === src.id);
        moveScene(from, t.index > from ? t.index - 1 : t.index);
      } else if (src.kind === 'scene' && t.zone === 'arr') insertBlock(src.id, t.index);
      else if (src.kind === 'block' && t.zone === 'arr') {
        if (ev.altKey) insertBlock(p().song[src.i].scene, t.index, p().song[src.i].repeat); // Alt : copier le bloc
        else moveBlockTo(src.i, t.index);
      } else renderWindow();
    };
    try {
      src.el.setPointerCapture(e.pointerId);
    } catch (err) {
      /* ignore */
    }
    src.el.addEventListener('pointermove', move);
    src.el.addEventListener('pointerup', end);
    src.el.addEventListener('pointercancel', end);
  }
  /*
   * Double-clic fait à la main : le premier clic redessine la fenêtre (la ligne ou le bloc est remplacé), le navigateur
   * n'enverrait donc pas de dblclick. Sur le nom d'une scène : renommer ; ailleurs : fiche Scène.
   */
  let lastClick = null;
  function isDouble(src, ev) {
    const key = src.kind + ':' + (src.kind === 'scene' ? src.id : src.i);
    const dbl = lastClick && lastClick.key === key && ev.timeStamp - lastClick.t < 450;
    lastClick = dbl ? null : { key, t: ev.timeStamp };
    if (!dbl) return false;
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    if (src.kind === 'scene' && under && under.closest('.sg-name')) {
      const el = document.querySelector(`#sgSceneList [data-id="${src.id}"] .sg-name`);
      const sc = sceneOf(src.id);
      if (el && sc) rename(sc, el);
    } else {
      const b = src.kind === 'block' ? p().song[src.i] : null;
      if (SS.sceneSheet) SS.sceneSheet.open(b ? b.scene : src.id);
    }
    return true;
  }
  function clickOn(src) {
    if (src.kind === 'scene') app.switchScene(src.id);
    else {
      app.state.songStart = src.i;
      const b = p().song[src.i];
      if (b && b.scene !== p().current) app.switchScene(b.scene);
      else render();
    }
  }
  const inside = (el, x, y) => {
    const r = el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };
  /** Où le pointeur déposerait l'élément : { zone: 'scenes' | 'arr', index (indice d'insertion) } ou null. */
  function findTarget(d, x, y) {
    if (d.src.kind === 'scene' && inside($('.sg-scenes'), x, y)) {
      const rows = [...document.querySelectorAll('#sgSceneList .sg-srow')];
      let index = rows.length;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i].getBoundingClientRect();
        if (y < r.top + r.height / 2) {
          index = i;
          break;
        }
      }
      return { zone: 'scenes', index };
    }
    if (inside($('.sg-arr'), x, y)) {
      const blocks = [...document.querySelectorAll('#sgBlocks .sg-block')];
      let index = blocks.length;
      for (let i = 0; i < blocks.length; i++) {
        const r = blocks[i].getBoundingClientRect();
        if (x < r.left + r.width / 2) {
          index = i;
          break;
        }
      }
      return { zone: 'arr', index };
    }
    return null;
  }
  function showTarget(d, t) {
    document.querySelectorAll('.sg-drop-before, .sg-drop-after, .sg-zone-on').forEach((el) => el.classList.remove('sg-drop-before', 'sg-drop-after', 'sg-zone-on'));
    const line = document.querySelector('#sgBlocks .sg-drop-line');
    if (line) line.hidden = true;
    if (!t) return;
    (t.zone === 'scenes' ? $('.sg-scenes') : $('.sg-arr')).classList.add('sg-zone-on');
    if (t.zone === 'scenes') {
      const list = [...document.querySelectorAll('#sgSceneList .sg-srow')];
      if (list[t.index]) list[t.index].classList.add('sg-drop-before');
      else if (list.length) list[list.length - 1].classList.add('sg-drop-after');
    } else if (line) {
      const { starts, total } = blockStarts();
      line.hidden = false;
      line.style.left = (t.index < starts.length ? starts[t.index] : total) * px + 'px';
    }
  }

  function openWindow() {
    const dlg = $('#songDialog');
    if (dlg.open) return;
    dlg.showModal();
    renderWindow();
    $('#songBtn').classList.add('active');
    $('#songBtn').setAttribute('aria-pressed', 'true');
  }
  function initWindow() {
    const dlg = $('#songDialog');
    $('#songBtn').addEventListener('click', openWindow);
    $('#songClose').addEventListener('click', () => dlg.close());
    $('#sgNewScene').addEventListener('click', () => {
      newEmptyScene();
      requestAnimationFrame(() => {
        const el = document.querySelector(`#sgSceneList [data-id="${p().current}"]`);
        el && el.scrollIntoView({ block: 'nearest' });
      });
    });
    $('#sgCopyScene').addEventListener('click', () => duplicate(sceneOf(p().current)));
    $('#sgPlay').addEventListener('click', () => {
      if (SS.audio.isPlaying() || SS.audio.isPaused()) app.stop();
      else app.play();
      render();
    });
    $('#sgMode').addEventListener('click', (e) => setPlayMode(e));
    try {
      $('#sgAutoBox').open = localStorage.getItem(AUTO_KEY) === 'open';
    } catch (e) {
      /* ignore */
    }
    $('#sgAutoBox').addEventListener('toggle', () => {
      try {
        localStorage.setItem(AUTO_KEY, $('#sgAutoBox').open ? 'open' : 'closed');
      } catch (e) {
        /* ignore */
      }
      renderWindow();
    });
    window.addEventListener('resize', () => winOpen() && renderWindow());
    $('#sgLoop').addEventListener('change', (e) => {
      p().songLoop = e.target.checked;
      changedSong();
    });
    // clic sur le fond (hors de la fenêtre) : fermer — sauf juste après un glisser
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg && !justDragged) dlg.close();
    });
    dlg.addEventListener('close', () => {
      closeMenu();
      $('#songBtn').classList.remove('active');
      $('#songBtn').setAttribute('aria-pressed', 'false');
    });
  }

  /** Chanson | Scène (frise du haut et fenêtre) : la lecture en cours reprend dans le nouveau mode. */
  function setPlayMode(e) {
    const b = e.target.closest('button');
    if (!b || b.dataset.mode === p().playMode) return;
    const wasPlaying = SS.audio.isPlaying();
    if (wasPlaying || SS.audio.isPaused()) app.stop();
    p().playMode = b.dataset.mode;
    changedSong();
    if (wasPlaying) app.play();
    render();
  }

  /* ---------- Frise de la chanson sous la barre du haut ---------- */
  let lastStep = -1; // pas joué dans la scène (-1 à l'arrêt)
  let menu = null;

  /** Modèle de la frise (js/wizplaybar.js) : les scènes de la Grille, dans l'ordre de l'arrangement. */
  function barModel() {
    const pr = p();
    const res = {
      // la couleur vient de la partie de l'assistant (sc.sec) ou, à défaut, du nom de la scène (« Refrain 2 »)
      scenes: pr.scenes.map((sc) => ({ id: sc.id, sec: String(sc.sec || sc.name || '').replace(/\s*\d+$/, ''), name: sc.name, bars: barsOf(sc), tempo: sc.tempo })),
      song: pr.song,
    };
    return SS.wizPlayBar.model(res, { spb: SS.stepsPerBar(pr), tempo: pr.tempo });
  }

  function renderBar() {
    const bar = $('#gridPlayBar');
    if (!bar || !SS.wizPlayBar) return;
    const pr = p();
    const m = barModel();
    const keyOf = (b) => (sceneOf(b.sceneId) || {}).key;
    const badge = (b, i) => (i && SS.keyChange ? SS.keyChange.describe(keyOf(m.blocks[i - 1]), keyOf(b)) : null);
    const opts = { color: SS.wizPlayBar.colorOf, onSeek: seekBlock, badge, chords: (id) => sceneChordList(sceneOf(id)), info: barInfo, hint: 'Clic : éditer et partir d’ici · double-clic : fiche · clic droit : plus' };
    // les cases ne sont redessinées que si la chanson change (sinon un double-clic perdrait sa case entre ses deux clics) ;
    // accords, tonalité et pistes sont relus à chaque fois (bulle, accord en cours)
    const sig = JSON.stringify([m.blocks.map((b, i) => [b.song, b.sceneId, b.name, b.sec, b.bars, b.dur, b.reps, badge(b, i)])]);
    if (sig !== bar._sig) {
      SS.wizPlayBar.render(bar, m, opts);
      bar._sig = sig;
    } else Object.assign(bar._pb, { opts, chords: new Map() });
    bar.querySelectorAll('.wpb-sc').forEach((c) => {
      const b = m.blocks[Number(c.dataset.i)];
      c.classList.toggle('edit', b.sceneId === pr.current);
      c.classList.toggle('start', pr.playMode === 'song' && b.song === app.state.songStart && b.rep === 0);
    });
    updateBar();
  }

  /** Accords d'une scène pour la frise : [{ bar (mesures depuis le début de la scène), name }]. */
  function sceneChordList(sc) {
    if (!sc) return [];
    const pr = p();
    const spb = SS.stepsPerBar(pr);
    const grid = SS.sceneGridChords ? SS.sceneGridChords(pr, sc) : [];
    if (grid.length) return grid.filter((c) => c.info && c.info.name).map((c) => ({ bar: c.step / spb, name: c.info.name }));
    try {
      // sans piste Accords : les accords reconnus dans les notes
      const H = SS.harmony;
      const key = H.valid(sc.key) ? sc.key : { tonic: 'C', mode: 'major' };
      return H.sceneChords(pr, sc.id).filter((c) => c.id).map((c) => ({ bar: (c.step || 0) / spb, name: H.chordName(key, c.id) }));
    } catch (e) {
      return [];
    }
  }
  /** Bulle d'une case : tonalité, émotion, pistes qui jouent. */
  function barInfo(b) {
    const sc = sceneOf(b.sceneId);
    if (!sc) return {};
    const emo = sc.emotion && SS.EMOTIONS ? SS.EMOTIONS.find((e) => e.id === sc.emotion) : null;
    return {
      key: SS.harmony && SS.harmony.valid(sc.key) ? SS.harmony.label(sc.key) + (sc.tempo ? ` · ${sc.tempo} bpm` : '') : sc.tempo ? `${sc.tempo} bpm` : null,
      emotion: emo ? emo.label.toLowerCase() : null,
      tracks: p().tracks.map((t) => ({ name: t.name, color: t.color, on: trackState(sc, t).st === 'on' })),
    };
  }

  /** Position de lecture dans la frise (en mesures), -1 à l'arrêt. */
  function barPos(m) {
    if (lastStep < 0) return -1;
    const spb = SS.stepsPerBar(p());
    if (playing >= 0) {
      const b = m.blocks.find((x) => x.song === playing && x.rep === playingRep);
      return b ? Math.min(b.start + lastStep / spb, b.start + b.bars) : -1;
    }
    const b = m.blocks.find((x) => x.sceneId === p().current); // scène en boucle : montrée à sa première place
    return b ? b.start + (lastStep % (b.bars * spb)) / spb : -1;
  }

  function updateBar() {
    const bar = $('#gridPlayBar');
    if (!bar || !bar._pb || !app || !app.project()) return;
    const pos = barPos(bar._pb.m);
    SS.wizPlayBar.update(bar, pos);
    if (pos < 0) {
      // à l'arrêt : la scène qu'on édite
      const sc = sceneOf(p().current);
      if (sc) bar.querySelector('.wpb-now').replaceChildren('Scène : ', h('b', {}, sc.name), ` · ${barsOf(sc)} mes.${sc.tempo ? ` · ${sc.tempo}` : ''}`);
    }
  }

  /** Clic sur une case : éditer sa scène, la lecture Chanson partira de ce bloc (et y saute si elle joue). */
  function seekBlock(i) {
    const b = p().song[i];
    if (!b) return;
    const restart = SS.audio.isPlaying() && p().playMode === 'song';
    if (restart) app.stop();
    app.state.songStart = i;
    if (b.scene !== p().current) app.switchScene(b.scene);
    else render();
    if (restart) app.play();
  }

  function closeMenu() {
    if (menu) menu.remove();
    menu = null;
  }
  /**
   * Petit menu (clic droit sur la frise ou un bloc, ⋯ d'une scène). items : [{ label, fn, off, cls }] ou null (trait).
   * Dans la fenêtre Arrangement ouverte, il va dans la fenêtre (couche supérieure) pour rester au-dessus.
   */
  function popMenu(title, items, x, y) {
    closeMenu();
    const item = (it) =>
      it ? h('button', { type: 'button', role: 'menuitem', class: it.cls, disabled: !!it.off, onclick: () => (closeMenu(), it.fn()) }, it.label) : h('hr');
    menu = h('div', { class: 'pbm-menu', role: 'menu', 'aria-label': title }, h('div', { class: 'pbm-head' }, title), items.filter((it, i) => it || (i && items[i - 1])).map(item));
    (winOpen() ? $('#songDialog') : document.body).append(menu);
    const w = menu.offsetWidth;
    const hgt = menu.offsetHeight;
    menu.style.left = Math.max(4, Math.min(x, innerWidth - w - 4)) + 'px';
    menu.style.top = Math.max(4, Math.min(y, innerHeight - hgt - 4)) + 'px';
    const first = menu.querySelector('button:not(:disabled)');
    if (first) first.focus({ preventScroll: true });
  }
  /** Menu d'un bloc de la chanson (frise du haut ou fenêtre Arrangement). */
  function openMenu(blk, x, y) {
    const pr = p();
    const i = blk.song;
    const sc = sceneOf(blk.sceneId);
    if (!sc || !pr.song[i]) return;
    const r = pr.song[i].repeat;
    popMenu(`${sc.name} · ${barsOf(sc)} mes. × ${r}`, [
      { label: 'Fiche de la scène…', fn: () => SS.sceneSheet && SS.sceneSheet.open(sc.id) },
      null,
      { label: `Une répétition de plus (×${r + 1})`, fn: () => setRepeat(i, r + 1), off: r >= 64 },
      { label: 'Une répétition de moins', fn: () => setRepeat(i, r - 1), off: r <= 1 },
      null,
      { label: `Nouvelle scène : copie de « ${sc.name} »`, fn: () => duplicate(sc) },
      { label: 'Nouvelle scène vide', fn: newEmptyScene },
      null,
      winOpen() ? null : { label: 'Ouvrir l’Arrangement…', fn: openWindow },
      pr.song.length > 1 ? { label: 'Retirer ce bloc de la chanson', fn: () => removeBlock(i), cls: 'pbm-del' } : null,
    ], x, y);
  }

  function initBar() {
    const bar = $('#gridPlayBar');
    const blockOf = (e) => {
      const c = e.target.closest('.wpb-sc');
      return c && bar._pb ? bar._pb.m.blocks[Number(c.dataset.i)] : null;
    };
    bar.addEventListener('dblclick', (e) => {
      const b = blockOf(e);
      if (b && SS.sceneSheet) SS.sceneSheet.open(b.sceneId);
    });
    bar.addEventListener('contextmenu', (e) => {
      const b = blockOf(e);
      if (!b) return;
      e.preventDefault();
      const r = e.target.closest('.wpb-sc').getBoundingClientRect();
      // clavier (touche Menu) : sous la case ; souris : au pointeur
      openMenu(b, e.clientX || r.left, e.clientY ? e.clientY + 4 : r.bottom + 4);
    });
    document.addEventListener('pointerdown', (e) => menu && !menu.contains(e.target) && closeMenu(), true);
    document.addEventListener('keydown', (e) => {
      if (!menu) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = [...menu.querySelectorAll('button:not(:disabled)')];
        const k = items.indexOf(document.activeElement);
        const n = items[(k + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
        if (n) n.focus();
      }
    }, true);
    window.addEventListener('resize', closeMenu);
  }

  function init(appApi) {
    app = appApi;
    initWindow();
    initBar();
    $('#songMode').addEventListener('click', setPlayMode);
  }

  return { init, render, setPlaying, setStep, open: openWindow };
})();
