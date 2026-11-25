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

  /* ---------- Fenêtre Song ---------- */
  /*
   * En haut, les scènes en cartes sur une ligne (sélection, renommage, copie, longueur, résumé) ; en dessous
   * l'arrangement en frise horizontale, de gauche à droite, chaque bloc large comme sa durée.
   * Glisser (souris ou doigt) : une carte se range parmi les scènes ou se dépose sur la frise ;
   * un bloc de l'arrangement se déplace. Le panneau compact sous la barre du haut reste disponible (case en bas).
   */
  const BAR_CHOICES = [1, 2, 4, 8, 16, 32, 64];
  const winOpen = () => $('#songDialog').open;
  const letterOf = (sc) => String.fromCharCode(65 + (p().scenes.indexOf(sc) % 26));

  /** Contenu d'une scène : pour la scène en cours, les pistes elles-mêmes ; sinon ce qui est rangé dans la scène. */
  function sceneContent(sc, t) {
    if (sc.id === p().current) return t.type === 'drum' ? { steps: t.steps } : { events: t.events };
    return (sc.data && sc.data[t.id]) || {};
  }
  /** Résumé d'une scène : tonalité, accords reconnus, pistes qui jouent. */
  function summary(sc) {
    const pr = p();
    const H = SS.harmony;
    const key = H && H.valid(sc.key) ? sc.key : null;
    let chords = [];
    try {
      const spellKey = key || { tonic: 'C', mode: 'major' };
      chords = H ? H.sceneChords(pr, sc.id).filter((c) => c.id).map((c) => H.chordName(spellKey, c.id)) : [];
    } catch (e) {
      chords = [];
    }
    let notes = 0;
    const playing = pr.tracks.filter((t) => {
      const d = sceneContent(sc, t);
      const n = t.type === 'drum' ? (d.steps || []).filter(Boolean).length : (d.events || []).length;
      notes += n;
      return n > 0;
    });
    return { key, chords, playing, notes };
  }

  function sceneTile(sc) {
    const pr = p();
    const sm = summary(sc);
    const cur = sc.id === pr.current;
    // une grille répétée (Am – F – Am – F…) s'affiche une seule fois, avec le nombre de tours
    const c = sm.chords;
    let per = c.length;
    for (let n = 1; n < c.length; n++) if (c.length % n === 0 && c.every((x, i) => x === c[i % n])) { per = n; break; }
    const turns = c.length / per;
    const cyc = c.slice(0, per);
    const chordsTxt = cyc.length ? cyc.slice(0, 8).join(' – ') + (cyc.length > 8 ? ' …' : '') + (turns > 1 ? ` (×${turns})` : '') : '';
    const tile = h(
      'div',
      {
        class: 'sg-tile' + (cur ? ' active' : ''),
        role: 'listitem',
        'data-id': sc.id,
        tabindex: '0',
        'aria-current': cur ? 'true' : null,
        title: 'Cliquer : éditer cette scène · glisser : ranger, ou déposer dans l\'arrangement',
        onkeydown: (e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            app.switchScene(sc.id);
          } else if (e.altKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault();
            const i = pr.scenes.indexOf(sc);
            moveScene(i, i + (e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1));
          }
        },
      },
      h('span', { class: 'sg-grip', 'aria-hidden': 'true' }, '⠿'),
      h(
        'div',
        { class: 'sg-tile-main' },
        h(
          'div',
          { class: 'sg-tile-head' },
          h('b', { class: 'sg-letter' }, letterOf(sc)),
          h('span', { class: 'sg-name', title: 'Double-clic pour renommer', ondblclick: (e) => rename(sc, e.currentTarget) }, sc.name),
          h('span', { class: 'spacer' }),
          h('button', { type: 'button', class: 'sg-ico', title: `Renommer « ${sc.name} »`, 'aria-label': 'Renommer', onclick: (e) => rename(sc, e.currentTarget.closest('.sg-tile').querySelector('.sg-name')) }, '✎'),
          h('button', { type: 'button', class: 'sg-ico', title: `Dupliquer « ${sc.name} »`, 'aria-label': 'Dupliquer', onclick: () => duplicate(sc) }, '⧉'),
          h('button', { type: 'button', class: 'sg-ico', title: 'Ajouter à la fin de l\'arrangement', 'aria-label': 'Ajouter à l\'arrangement', onclick: () => insertBlock(sc.id, pr.song.length) }, '→'),
          pr.scenes.length > 1 ? h('button', { type: 'button', class: 'sg-ico sg-del', title: `Supprimer « ${sc.name} »`, 'aria-label': 'Supprimer', onclick: () => remove(sc) }, '×') : null
        ),
        h(
          'div',
          { class: 'sg-tile-meta' },
          h(
            'select',
            { class: 'sg-bars', 'aria-label': `Longueur de « ${sc.name} »`, title: 'Longueur de la scène', onchange: (e) => setSceneBars(sc, +e.target.value) },
            BAR_CHOICES.concat(BAR_CHOICES.includes(barsOf(sc)) ? [] : [barsOf(sc)]).sort((a, b) => a - b).map((n) => h('option', { value: n, selected: n === barsOf(sc) }, `${n} mes.`))
          ),
          h('span', { class: 'sg-key' + (sm.key ? '' : ' none') }, sm.key ? SS.harmony.label(sm.key) : 'sans tonalité')
        ),
        h('div', { class: 'sg-chords' + (chordsTxt ? '' : ' none') }, chordsTxt || (sm.notes ? 'pas d\'accord' : 'scène vide')),
        h(
          'div',
          { class: 'sg-tracks', title: sm.playing.length ? 'Pistes qui jouent : ' + sm.playing.map((t) => t.name).join(', ') : 'Aucune piste ne joue' },
          pr.tracks.map((t) => h('i', { class: sm.playing.includes(t) ? 'on' : '', style: `--c:${t.color}` })),
          h('small', {}, sm.playing.length ? `${sm.playing.length}/${pr.tracks.length} pistes · ${sm.notes} notes` : '')
        )
      )
    );
    tile.addEventListener('pointerdown', (e) => startDrag(e, { kind: 'scene', id: sc.id, el: tile }));
    return tile;
  }

  function blockTile(b, i) {
    const pr = p();
    const sc = sceneOf(b.scene);
    if (!sc) return null;
    const bars = barsOf(sc) * b.repeat;
    const el = h(
      'div',
      {
        class: 'sg-block' + (i === app.state.songStart ? ' start' : '') + (i === playing ? ' playing' : '') + (sc.id === pr.current ? ' editing' : ''),
        role: 'listitem',
        'data-i': i,
        style: `--bars:${bars}`,
        title: `${sc.name} : ${barsOf(sc)} mesure(s) × ${b.repeat}. Clic : partir d'ici et éditer cette scène · glisser : déplacer`,
      },
      h('div', { class: 'sb-name' }, h('b', {}, letterOf(sc)), ' ', sc.name),
      h('small', { class: 'sg-block-bars' }, `${bars} mes.` + (b.repeat > 1 ? ` · ${barsOf(sc)} × ${b.repeat}` : '')),
      h(
        'div',
        { class: 'sb-tools' },
        h('button', { type: 'button', title: 'Une répétition de moins', onclick: () => setRepeat(i, b.repeat - 1) }, '−'),
        h('span', { class: 'sb-rep' }, i === playing ? `${playingRep + 1}/${b.repeat}` : `×${b.repeat}`),
        h('button', { type: 'button', title: 'Une répétition de plus', onclick: () => setRepeat(i, b.repeat + 1) }, '+')
      ),
      pr.song.length > 1 ? h('button', { type: 'button', class: 'sg-block-del', title: 'Retirer ce bloc', 'aria-label': `Retirer le bloc « ${sc.name} »`, onclick: () => removeBlock(i) }, '×') : null
    );
    el.addEventListener('pointerdown', (e) => startDrag(e, { kind: 'block', i, el }));
    return el;
  }

  /*
   * Frise : chaque bloc est large comme sa durée (--px par mesure, au moins MIN_PX pour rester lisible ;
   * une chanson longue défile alors horizontalement), la règle compte les mesures, la tête de lecture avance.
   */
  const MIN_PX = 20;
  const HINT_W = 120; // place gardée au bout de la frise pour déposer une scène
  let px = MIN_PX;
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
  function layoutTimeline() {
    const tl = $('#sgTimeline');
    const { total } = blockStarts();
    px = Math.max(MIN_PX, (tl.clientWidth - 24 - HINT_W) / Math.max(1, total));
    tl.style.setProperty('--px', px + 'px');
    // une graduation au moins tous les 40 px
    const every = [1, 2, 4, 8, 16, 32].find((n) => n * px >= 40) || 64;
    const marks = [];
    for (let m = 0; m <= total; m += every) marks.push(h('span', { style: `left:${m * px}px` }, String(m + 1)));
    $('#sgRuler').replaceChildren(...marks);
    $('#sgRuler').style.width = total * px + 'px';
  }
  function renderWindow() {
    if (!winOpen() || drag) return;
    const pr = p();
    $('#sgSceneList').replaceChildren(...pr.scenes.map(sceneTile));
    const blocks = pr.song.map(blockTile).filter(Boolean);
    $('#sgBlocks').replaceChildren(...blocks, h('div', { class: 'sg-drop-hint' }, blocks.length ? 'Déposer une scène ici' : 'Glisser une scène ici'));
    layoutTimeline();
    if (SS.beatAutoUI) SS.beatAutoUI.songView($('#sgAuto'), $('#sgAutoTools'), px, app);
    const len = SS.songLength(pr);
    $('#sgTotal').textContent = `${len.bars} mesures · ${fmtTime(len.seconds)}`;
    $('#sgLoop').checked = !!pr.songLoop;
    const on = SS.audio.isPlaying() && pr.playMode === 'song';
    $('#sgPlay').classList.toggle('on', on);
    $('#sgPlay').querySelector('.sg-play-ic').textContent = on ? '■' : '▶';
    $('#sgPlay').querySelector('.sg-play-txt').textContent = on ? 'Arrêter' : 'Écouter';
    if (playing < 0) $('#sgHead').hidden = true;
  }

  /** Tête de lecture de la frise (appelée à chaque pas pendant la lecture). */
  function setStep(step) {
    lastStep = step;
    updateBar();
    const head = $('#sgHead');
    if (!head || !winOpen() || playing < 0 || step < 0) {
      if (head) head.hidden = true;
      return;
    }
    const b = p().song[playing];
    const sc = b && sceneOf(b.scene);
    if (!sc) return;
    const bar = blockStarts().starts[playing] + playingRep * barsOf(sc) + step / SS.stepsPerBar(p());
    head.hidden = false;
    head.style.left = bar * px + 'px';
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
  function insertBlock(sceneId, at) {
    const s = p().song;
    at = Math.max(0, Math.min(s.length, at));
    s.splice(at, 0, { scene: sceneId, repeat: 1 });
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
  function setSceneBars(sc, n) {
    if (sc.id !== p().current) app.switchScene(sc.id);
    app.setBars(n);
    render();
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
        $('#songDialog').append(d.ghost); // dans la fenêtre (couche supérieure), au-dessus de tout
        src.el.classList.add('sg-dragging');
        document.body.classList.add('sg-drag-on');
      }
      ev.preventDefault();
      d.ghost.style.left = ev.clientX - d.dx + 'px';
      d.ghost.style.top = ev.clientY - d.dy + 'px';
      showTarget(d, (d.target = findTarget(d, ev.clientX, ev.clientY)));
    };
    const end = (ev) => {
      src.el.removeEventListener('pointermove', move);
      src.el.removeEventListener('pointerup', end);
      src.el.removeEventListener('pointercancel', end);
      if (!d.started) {
        if (ev.type === 'pointerup') clickOn(src);
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
      else if (src.kind === 'block' && t.zone === 'arr') moveBlockTo(src.i, t.index);
      else renderWindow();
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
      const tiles = [...document.querySelectorAll('#sgSceneList .sg-tile')];
      let index = tiles.length;
      for (let i = 0; i < tiles.length; i++) {
        const r = tiles[i].getBoundingClientRect();
        if (x < r.left + r.width / 2) {
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
        // blocs sur plusieurs lignes : avant ce bloc si on est au-dessus de sa ligne, ou sur sa ligne à gauche de son milieu
        if (y < r.top || (y <= r.bottom && x < r.left + r.width / 2)) {
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
    if (!t) return;
    const list = t.zone === 'scenes' ? [...document.querySelectorAll('#sgSceneList .sg-tile')] : [...document.querySelectorAll('#sgBlocks .sg-block')];
    (t.zone === 'scenes' ? $('.sg-scenes') : $('.sg-arr')).classList.add('sg-zone-on');
    if (list[t.index]) list[t.index].classList.add('sg-drop-before');
    else if (list.length) list[list.length - 1].classList.add('sg-drop-after');
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
    $('#songOk').addEventListener('click', () => dlg.close());
    $('#sgNewScene').addEventListener('click', () => {
      const id = SS.addScene(p(), { copy: false });
      app.switchScene(id);
      app.changed();
      requestAnimationFrame(() => {
        const el = document.querySelector(`#sgSceneList [data-id="${id}"]`);
        el && el.scrollIntoView({ block: 'nearest' });
      });
    });
    $('#sgPlay').addEventListener('click', () => {
      if (SS.audio.isPlaying() || SS.audio.isPaused()) return app.stop(), renderWindow();
      if (p().playMode !== 'song') {
        p().playMode = 'song';
        changedSong();
      }
      app.play();
      renderWindow();
    });
    window.addEventListener('resize', () => winOpen() && layoutTimeline());
    $('#sgLoop').addEventListener('change', (e) => {
      p().songLoop = e.target.checked;
      changedSong();
    });
    // clic sur le fond (hors de la fenêtre) : fermer — sauf juste après un glisser
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg && !justDragged) dlg.close();
    });
    dlg.addEventListener('close', () => {
      $('#songBtn').classList.remove('active');
      $('#songBtn').setAttribute('aria-pressed', 'false');
    });
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
    // les cases ne sont redessinées que si la chanson change (sinon un double-clic perdrait sa case entre ses deux clics)
    const sig = JSON.stringify([m.blocks.map((b, i) => [b.song, b.sceneId, b.name, b.sec, b.bars, b.dur, badge(b, i)])]);
    if (sig !== bar._sig) {
      SS.wizPlayBar.render(bar, m, { color: SS.wizPlayBar.colorOf, onSeek: seekBlock, badge });
      bar._sig = sig;
    }
    bar.querySelectorAll('.wpb-sc').forEach((c) => {
      const b = m.blocks[Number(c.dataset.i)];
      c.classList.toggle('edit', b.sceneId === pr.current);
      c.classList.toggle('start', pr.playMode === 'song' && b.song === app.state.songStart && b.rep === 0);
      const key = c.querySelector('.wpb-key');
      const sc = sceneOf(b.sceneId);
      c.title = `${b.name} · ${b.bars} mes.${sc && sc.tempo ? ` · ${sc.tempo} bpm` : ''} · ${SS.wizPlayBar.fmt(b.t0)}${key ? ' · ' + key.textContent : ''} — clic : éditer cette scène et partir d'ici · double-clic : sa fiche · clic droit : plus`;
    });
    updateBar();
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
  /** Menu du clic droit sur une case de la frise. */
  function openMenu(blk, x, y) {
    closeMenu();
    const pr = p();
    const i = blk.song;
    const sc = sceneOf(blk.sceneId);
    const r = pr.song[i] ? pr.song[i].repeat : 1;
    if (!sc) return;
    const item = (label, fn, opts = {}) =>
      h('button', { type: 'button', role: 'menuitem', class: opts.cls, disabled: !!opts.off, onclick: () => (closeMenu(), fn()) }, label);
    menu = h(
      'div',
      { class: 'pbm-menu', role: 'menu', 'aria-label': `Bloc « ${sc.name} »` },
      h('div', { class: 'pbm-head' }, `${sc.name} · ${barsOf(sc)} mes. × ${r}`),
      item('Fiche de la scène…', () => SS.sceneSheet && SS.sceneSheet.open(sc.id)),
      h('hr'),
      item(`Une répétition de plus (×${r + 1})`, () => setRepeat(i, r + 1), { off: r >= 64 }),
      item('Une répétition de moins', () => setRepeat(i, r - 1), { off: r <= 1 }),
      h('hr'),
      item(`Nouvelle scène : copie de « ${sc.name} »`, () => duplicate(sc)),
      item('Nouvelle scène vide', () => {
        const id = SS.addScene(p(), { copy: false });
        app.switchScene(id);
        app.changed();
      }),
      h('hr'),
      item('Ouvrir l’Arrangement…', openWindow),
      pr.song.length > 1 ? item('Retirer ce bloc de la chanson', () => removeBlock(i), { cls: 'pbm-del' }) : null
    );
    document.body.append(menu);
    const w = menu.offsetWidth;
    const hgt = menu.offsetHeight;
    menu.style.left = Math.max(4, Math.min(x, innerWidth - w - 4)) + 'px';
    menu.style.top = Math.max(4, Math.min(y, innerHeight - hgt - 4)) + 'px';
    const first = menu.querySelector('button:not(:disabled)');
    if (first) first.focus({ preventScroll: true });
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
    $('#songMode').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const wasPlaying = SS.audio.isPlaying();
      if (wasPlaying || SS.audio.isPaused()) app.stop();
      p().playMode = b.dataset.mode;
      changedSong();
      if (wasPlaying) app.play();
    });
  }

  return { init, render, setPlaying, setStep, open: openWindow };
})();
