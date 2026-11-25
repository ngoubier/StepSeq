/*
 * Console Live : interface (logique dans js/liveconsole.js).
 * Bouton « Live » de la barre du haut (écran des pistes) → bandeau en bas de l'écran : une tranche par piste avec ses
 * boutons rotatifs (glisser vers le haut ou le bas, double-clic : retour à la courbe), un pavé Cutoff × Résonance pour
 * la piste choisie, « Enregistrer les gestes » (Au toucher | Verrou), et sous les tranches la courbe du réglage choisi
 * sur toute la chanson.
 */
window.SS = window.SS || {};

SS.liveConsolePanel = (() => {
  const LC = () => SS.liveConsole;
  const BA = () => SS.beatAuto;
  let app = null;
  let dock, btn, stripsEl, laneCv, laneName, recBtn, takeEl, xyEl, xyName;
  let sel = null; // { tid, k } : réglage choisi (courbe affichée)
  let xyTid = null; // piste du pavé Cutoff × Résonance
  const knobs = new Map(); // `${tid}|${k}` → { el, tid, k, big }
  let sig = '';
  let wasPlaying = false;
  let lastBeatKey = '';

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
  const SVGNS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs) => {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };

  /** Réglages d'une tranche, dans l'ordre ; le premier est le gros bouton. */
  function knobsFor(track) {
    const ok = new Set(BA().paramsFor(track).map((x) => x.id));
    const list = BA().hasFilter(track) ? ['cut', 'res', 'env', 'dec', 'mov', 'echo', 'hall', 'vol'] : ['dj', 'mov', 'echo', 'hall', 'vol'];
    return list.filter((k) => ok.has(k)); // Mouvement : seulement avec un phaser ou un flanger
  }
  const stripSig = (list) => list.map((t) => t.id + ':' + knobsFor(t).join('.')).join(',');
  const tracksOf = (p) => p.tracks.filter((t) => t.type === 'instrument' || t.type === 'drum');
  const norm = (k, v) => (v - BA().P[k].min) / (BA().P[k].max - BA().P[k].min);
  const denorm = (k, n) => BA().P[k].min + Math.max(0, Math.min(1, n)) * (BA().P[k].max - BA().P[k].min);

  /* ---------- valeur affichée : tenue à la main, sinon la courbe au temps entendu, sinon le neutre ---------- */
  function shownValue(p, track, k, pos) {
    const lv = LC().liveValue(track.id, k);
    if (lv != null) return lv;
    if (pos && pos.step >= 0) {
      const ba = BA().forTrack(p, track, pos.song);
      const v = ba && ba[k] ? ba[k]((pos.step % SS.totalSteps(p)) / SS.stepsPerBeat(p) + 0.5) : null;
      if (v != null) return v;
    }
    return BA().P[k].def;
  }

  /* ---------- un bouton rotatif ---------- */
  function knob(track, k, big) {
    const X = BA().P[k];
    const R = big ? 22 : 16, S = R * 2 + 6, c = S / 2;
    const s = svg('svg', { width: S, height: S, viewBox: `0 0 ${S} ${S}`, style: `width:${S}px;height:${S}px`, 'aria-hidden': 'true' });
    s.append(svg('circle', { cx: c, cy: c, r: R, class: 'lv-body' }), svg('path', { class: 'lv-arc' }), svg('line', { x1: c, y1: c, x2: c, y2: c, class: 'lv-ind' }));
    const el = h('div', { class: 'lv-knob' + (big ? ' big' : ''), role: 'slider', tabindex: '0', 'aria-label': `${track.name} : ${X.label}`, 'aria-valuemin': X.min, 'aria-valuemax': X.max, title: 'Glisser vers le haut ou le bas · double-clic : retour à la courbe' },
      s, h('span', { class: 'lv-lab' }, X.label), h('span', { class: 'lv-val' }), h('i', { class: 'lv-dot' }));
    const id = `${track.id}|${k}`;
    knobs.set(id, { el, tid: track.id, k, big, R, c });
    const select = () => {
      sel = { tid: track.id, k };
      if (BA().hasFilter(track)) xyTid = track.id;
      markSel();
      drawLane();
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      select();
      const p = app.project();
      let n = norm(k, shownValue(p, track, k, SS.audio.heardPos()));
      LC().touch(track.id, k, denorm(k, n));
      let y = e.clientY;
      const mv = (ev) => {
        n = Math.max(0, Math.min(1, n + (y - ev.clientY) / (ev.shiftKey ? 600 : 160)));
        y = ev.clientY;
        LC().move(track.id, k, denorm(k, n));
        paintKnob(id);
      };
      const up = () => {
        el.removeEventListener('pointermove', mv);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        LC().release(track.id, k);
        paintKnob(id);
      };
      el.addEventListener('pointermove', mv);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    });
    el.addEventListener('dblclick', () => {
      LC().reset(track.id, k);
      paintKnob(id);
    });
    el.addEventListener('keydown', (e) => {
      const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      select();
      const v = shownValue(app.project(), track, k, SS.audio.heardPos());
      LC().touch(track.id, k, denorm(k, norm(k, v) + d * 0.04));
      LC().release(track.id, k);
      paintKnob(id);
    });
    return el;
  }

  function paintKnob(id, pos = SS.audio.heardPos()) {
    const o = knobs.get(id);
    const p = app && app.project();
    if (!o || !p) return;
    const track = p.tracks.find((t) => t.id === o.tid);
    if (!track) return;
    const v = shownValue(p, track, o.k, pos);
    const n = norm(o.k, v), n0 = norm(o.k, BA().P[o.k].def);
    const { R, c } = o, r = R - 4;
    const ang = (x) => Math.PI * 0.75 + x * Math.PI * 1.5;
    const pt = (a, rr) => [c + Math.cos(a) * rr, c + Math.sin(a) * rr];
    // arc depuis le neutre (un réglage bipolaire part du milieu)
    const a = Math.min(n, n0), b = Math.max(n, n0);
    const [x0, y0] = pt(ang(a), r), [x1, y1] = pt(ang(b), r);
    o.el.querySelector('.lv-arc').setAttribute('d', b - a < 0.004 ? '' : `M${x0} ${y0} A${r} ${r} 0 ${(b - a) * 1.5 > 1 ? 1 : 0} 1 ${x1} ${y1}`);
    const [ix, iy] = pt(ang(n), R - 7);
    const ind = o.el.querySelector('.lv-ind');
    ind.setAttribute('x2', ix);
    ind.setAttribute('y2', iy);
    o.el.querySelector('.lv-val').textContent = BA().fmt(o.k, v);
    o.el.setAttribute('aria-valuenow', v);
    const live = LC().liveValue(o.tid, o.k) != null;
    o.el.classList.toggle('held', live);
    o.el.classList.toggle('writing', LC().isWriting(o.tid, o.k) && SS.audio.isPlaying());
    o.el.classList.toggle('auto', !live && BA().has(p, o.tid, o.k));
  }
  function markSel() {
    for (const [id, o] of knobs) o.el.classList.toggle('sel', !!sel && o.tid === sel.tid && o.k === sel.k);
  }

  /* ---------- tranches ---------- */
  function render() {
    const p = app.project();
    knobs.clear();
    stripsEl.textContent = '';
    const list = tracksOf(p);
    sig = stripSig(list);
    if (!list.length) {
      stripsEl.append(h('div', { class: 'lv-empty' }, 'Aucune piste'));
      sel = null;
    }
    for (const t of list) {
      const ks = knobsFor(t);
      stripsEl.append(h('div', { class: 'lv-strip', style: `--c:${t.color}` },
        h('div', { class: 'lv-sh' }, h('i', { class: 'lv-sw' }), h('b', { title: t.name }, t.name)),
        h('div', { class: 'lv-knobs' }, ks.map((k, i) => knob(t, k, i === 0)))));
    }
    if (!sel || !list.some((t) => t.id === sel.tid)) sel = list.length ? { tid: list[0].id, k: knobsFor(list[0])[0] } : null;
    if (!xyTid || !list.some((t) => t.id === xyTid && BA().hasFilter(t))) {
      const f = list.find((t) => BA().hasFilter(t));
      xyTid = f ? f.id : null;
    }
    markSel();
    for (const id of knobs.keys()) paintKnob(id);
    paintXY();
    drawLane();
    paintTake();
  }

  /* ---------- pavé Cutoff × Résonance ---------- */
  function paintXY() {
    const p = app.project();
    const t = xyTid && p.tracks.find((x) => x.id === xyTid);
    xyEl.classList.toggle('off', !t);
    xyName.textContent = t ? t.name : '—';
    if (!t) return;
    const pos = SS.audio.heardPos();
    const dot = xyEl.querySelector('.lv-xy-dot');
    dot.style.left = norm('cut', shownValue(p, t, 'cut', pos)) * 100 + '%';
    dot.style.top = (1 - norm('res', shownValue(p, t, 'res', pos))) * 100 + '%';
  }
  function bindXY() {
    xyEl.addEventListener('pointerdown', (e) => {
      if (!xyTid || e.button) return;
      e.preventDefault();
      xyEl.setPointerCapture(e.pointerId);
      const tid = xyTid;
      const at = (ev) => {
        const r = xyEl.getBoundingClientRect();
        return [denorm('cut', (ev.clientX - r.left) / r.width), denorm('res', 1 - (ev.clientY - r.top) / r.height)];
      };
      const [c0, r0] = at(e);
      LC().touch(tid, 'cut', c0);
      LC().touch(tid, 'res', r0);
      sel = { tid, k: 'cut' };
      markSel();
      drawLane();
      const mv = (ev) => {
        const [c, r] = at(ev);
        LC().move(tid, 'cut', c);
        LC().move(tid, 'res', r);
        paintXY();
      };
      const up = () => {
        xyEl.removeEventListener('pointermove', mv);
        xyEl.removeEventListener('pointerup', up);
        xyEl.removeEventListener('pointercancel', up);
        LC().release(tid, 'cut');
        LC().release(tid, 'res');
      };
      xyEl.addEventListener('pointermove', mv);
      xyEl.addEventListener('pointerup', up);
      xyEl.addEventListener('pointercancel', up);
    });
    xyEl.addEventListener('dblclick', () => {
      if (!xyTid) return;
      LC().reset(xyTid, 'cut');
      LC().reset(xyTid, 'res');
      paintXY();
    });
  }

  /* ---------- courbe du réglage choisi sur toute la chanson ---------- */
  function songBeats(p) {
    const out = [];
    let off = 0;
    p.song.forEach((b, i) => {
      const sc = p.scenes.find((s) => s.id === b.scene);
      if (!sc) return;
      const n = BA().sceneBeats(p, sc);
      for (let r = 0; r < b.repeat; r++) {
        out.push({ block: i, rep: r, off, n, color: sc.color });
        off += n;
      }
    });
    return { passes: out, total: off };
  }
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  function drawLane() {
    if (!laneCv || dock.hidden) return;
    const p = app.project();
    const t = sel && p.tracks.find((x) => x.id === sel.tid);
    laneName.textContent = t ? `${t.name} · ${BA().P[sel.k].label}` : '';
    const r = laneCv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    laneCv.width = Math.max(1, Math.round(r.width * dpr));
    laneCv.height = Math.max(1, Math.round(r.height * dpr));
    const g = laneCv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, r.width, r.height);
    if (!t) return;
    const { passes, total } = songBeats(p);
    if (!total) return;
    const W = r.width, H = r.height, k = sel.k, X = BA().P[k];
    const cells = LC().takeCells();
    const cCurve = cssVar('--c-violet'), cTake = cssVar('--c-red'), cLine = cssVar('--c-line'), cZero = cssVar('--c-line-strong');
    // séparations des passages
    g.fillStyle = cLine;
    for (const ps of passes) g.fillRect(Math.round((ps.off / total) * W), 0, 1, H);
    const y0 = H - 2 - norm(k, X.def) * (H - 4);
    g.fillStyle = cZero;
    g.fillRect(0, Math.round(y0), W, 1);
    for (const ps of passes) {
      for (let b = 0; b < ps.n; b++) {
        const v = BA().get(p, ps, t.id, k, b);
        if (v == null) continue;
        const x = ((ps.off + b) / total) * W, w = Math.max(1, W / total - 0.5);
        const y = H - 2 - norm(k, v) * (H - 4);
        g.fillStyle = cells && cells.has(`${t.id}|${k}|${ps.block}|${ps.rep}|${b}`) ? cTake : cCurve;
        g.fillRect(x, Math.min(y, y0), w, Math.max(1.5, Math.abs(y - y0)));
      }
    }
    // tête de lecture
    const pos = SS.audio.heardPos();
    if (pos && pos.step >= 0) {
      const pass = BA().playedPass(p, pos.song);
      const ps = pass && passes.find((x) => x.block === pass.block && x.rep === pass.rep);
      if (ps) {
        g.fillStyle = cssVar('--c-text');
        g.fillRect(((ps.off + (pos.step % SS.totalSteps(p)) / SS.stepsPerBeat(p)) / total) * W, 0, 2, H);
      }
    }
  }

  /* ---------- enregistrement ---------- */
  function paintRec() {
    recBtn.classList.toggle('on', LC().isRec());
    recBtn.setAttribute('aria-pressed', LC().isRec() ? 'true' : 'false');
    dock.classList.toggle('recording', LC().isRec());
  }
  function paintTake() {
    const n = LC().takeBeats();
    const last = LC().lastTake();
    takeEl.hidden = !(n || last);
    takeEl.querySelector('span').textContent = n ? `Prise · ${n} temps` : last ? `Prise · ${last.beats} temps` : '';
    takeEl.querySelector('button').hidden = !!n || !last;
  }

  /* ---------- ouverture ---------- */
  function setOpen(on) {
    LC().setOpen(on);
    dock.hidden = !on;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    document.body.classList.toggle('live-open', on);
    if (on) render();
    paintRec();
  }

  function frame() {
    requestAnimationFrame(frame);
    if (!dock || dock.hidden) return;
    const p = app.project();
    const playing = SS.audio.isPlaying();
    if (wasPlaying && !playing) {
      LC().stopped(); // arrêt : la prise se termine, les réglages reviennent aux courbes
      paintRec();
      paintTake();
      drawLane();
      if (SS.ui && SS.ui.renderAll) SS.ui.renderAll();
    }
    wasPlaying = playing;
    const s = stripSig(tracksOf(p));
    if (s !== sig) return render();
    const pos = SS.audio.heardPos();
    for (const id of knobs.keys()) paintKnob(id, pos);
    paintXY();
    const bk = pos ? `${pos.song ? pos.song.index + '.' + pos.song.rep : 's'}.${Math.floor(pos.step / SS.stepsPerBeat(p))}` : '';
    if (bk !== lastBeatKey) {
      lastBeatKey = bk;
      drawLane();
      paintTake();
    }
  }

  function init(a) {
    app = a;
    dock = document.getElementById('liveDock');
    btn = document.getElementById('liveBtn');
    if (!dock || !btn) return;
    recBtn = h('button', { type: 'button', class: 'btn lv-rec', 'aria-pressed': 'false', onclick: () => {
      LC().setRec(!LC().isRec());
      if (LC().isRec() && !SS.audio.isPlaying()) app.play();
      paintRec();
      paintTake();
      drawLane();
    } }, h('i', { class: 'lv-rec-dot' }), 'Enregistrer les gestes');
    const modeSeg = h('div', { class: 'segmented lv-mode', role: 'group', 'aria-label': 'Mode d’enregistrement' },
      [['touch', 'Au toucher'], ['latch', 'Verrou']].map(([m, label]) => h('button', { type: 'button', 'data-m': m, class: LC().mode() === m ? 'active' : '', onclick: (e) => {
        LC().setMode(m);
        modeSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.currentTarget));
      } }, label)));
    takeEl = h('div', { class: 'lv-take', hidden: true }, h('span'), h('button', { type: 'button', class: 'btn btn-small', onclick: () => {
      if (LC().undoTake()) {
        if (SS.ui && SS.ui.renderAll) SS.ui.renderAll();
        SS.ui.toast('Prise annulée', 1500);
      }
      paintTake();
      drawLane();
    } }, 'Annuler la prise'));
    xyName = h('span', { class: 'lv-xy-name' });
    xyEl = h('div', { class: 'lv-xy', title: 'Glisser : cutoff (gauche → droite) et résonance (bas → haut) · double-clic : retour aux courbes' },
      h('span', { class: 'lv-xy-ax x' }, 'Cutoff →'), h('span', { class: 'lv-xy-ax y' }, '↑ Résonance'), h('i', { class: 'lv-xy-dot' }));
    bindXY();
    stripsEl = h('div', { class: 'lv-strips' });
    laneName = h('span', { class: 'lv-lane-name' });
    laneCv = h('canvas', { class: 'lv-lane-cv' });
    dock.append(
      h('div', { class: 'lv-bar' },
        h('b', { class: 'lv-title' }, 'Live'),
        recBtn,
        modeSeg,
        SS.helpTip('Tournez les boutons pendant la lecture (glisser vers le haut ou le bas, Maj pour un réglage fin, double-clic : retour à la courbe). Sans enregistrement, le réglage reste où vous le laissez jusqu’à l’arrêt. « Enregistrer les gestes » écrit ce que vous jouez dans l’automation par temps de la chanson (bouton ∿ des pistes) : Au toucher, le geste s’écrit tant que vous tenez le bouton, puis la courbe reprend ; Verrou, la dernière valeur continue de s’écrire jusqu’à l’arrêt. Une prise s’annule d’un coup (Ctrl+Z ou « Annuler la prise »).', 'Console Live'),
        takeEl,
        h('span', { class: 'lv-sp' }),
        h('div', { class: 'lv-xy-wrap' }, xyName, xyEl)),
      stripsEl,
      h('div', { class: 'lv-lane' }, laneName, laneCv));
    btn.addEventListener('click', () => setOpen(dock.hidden));
    window.addEventListener('resize', () => drawLane());
    requestAnimationFrame(frame);
  }

  return { init, setOpen, isOpen: () => !!dock && !dock.hidden, render };
})();
