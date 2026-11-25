/*
 * Automation par temps (js/beatauto.js) : interface.
 *  - menu du bouton Automation d'une piste : active Cutoff, Résonance, Vélocité (par temps) ou la ligne par pas ;
 *  - panneau sous les notes de la piste, affiché seulement quand une automation par temps est active : un histogramme,
 *    une barre par temps aligné sur la grille, avec la courbe lissée par-dessus ; choix du passage (tous ou un seul) ;
 *  - frise de la fenêtre Song : les mêmes valeurs sur toute la chanson, une ligne par piste.
 * Dessin : glisser sur les barres ; les voisines suivent (Liaison : aucune, douce, large) ; Alt+clic ou clic droit efface.
 */
window.SS = window.SS || {};

SS.beatAutoUI = (() => {
  const BA = () => SS.beatAuto;
  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    children.flat().forEach((c) => c != null && el.append(c));
    return el;
  };
  const SVGNS = 'http://www.w3.org/2000/svg';

  const LINKS = [
    [0, 'Aucune', 'La barre bouge seule'],
    [3, 'Douce', 'Les 3 temps voisins de chaque côté suivent'],
    [6, 'Large', 'Les 6 temps voisins de chaque côté suivent'],
  ];
  let radius = 3;
  try {
    const raw = localStorage.getItem('ss.bautoLink');
    const r = raw == null ? NaN : Number(raw);
    if (LINKS.some(([v]) => v === r)) radius = r;
  } catch (e) {
    /* stockage indisponible */
  }
  const setRadius = (r) => {
    radius = r;
    try {
      localStorage.setItem('ss.bautoLink', String(r));
    } catch (e) {
      /* idem */
    }
    document.querySelectorAll('.ba-link button').forEach((b) => b.classList.toggle('on', +b.dataset.r === radius));
  };
  const linkSeg = () =>
    h('div', { class: 'ba-seg ba-link', role: 'group', 'aria-label': 'Liaison : jusqu\'où les barres voisines suivent' },
      LINKS.map(([r, label, tip]) => h('button', { type: 'button', 'data-r': r, class: r === radius ? 'on' : '', title: tip, onclick: () => setRadius(r) }, label)));

  /* ---------- affichage d'une barre (un temps) ---------- */

  const norm = (k, v) => (v - BA().P[k].min) / (BA().P[k].max - BA().P[k].min);
  /** Construit une case de temps vide (barre + courbe). */
  function cellEl(attrs) {
    const c = h('div', attrs, h('div', { class: 'ba-bar' }));
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', 'ba-curve');
    const fill = document.createElementNS(SVGNS, 'path');
    fill.setAttribute('class', 'ba-fill');
    const line = document.createElementNS(SVGNS, 'path');
    line.setAttribute('class', 'ba-line');
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(fill, line);
    c.append(svg);
    return c;
  }
  /** Peint la case du temps i : vals(i) donne la valeur de chaque temps (ou null), step : lecture en paliers. */
  function paintCell(c, k, vals, i, step) {
    const P = BA().P[k];
    const v = vals(i);
    const bar = c.firstChild;
    bar.style.height = norm(k, v ?? P.def) * 100 + '%';
    c.classList.toggle('empty', v == null);
    c.classList.toggle('linked', !step && v != null);
    const [fill, line] = c.lastChild.childNodes;
    if (step || v == null) {
      fill.setAttribute('d', '');
      line.setAttribute('d', '');
      return;
    }
    const pts = [];
    for (let s = 0; s <= 10; s++) {
      const y = BA().curveAt(vals, i + s / 10 - (s === 10 ? 1e-6 : 0), false);
      pts.push(`${s * 10} ${(100 - norm(k, y ?? v) * 100).toFixed(2)}`);
    }
    line.setAttribute('d', 'M' + pts.join(' L'));
    fill.setAttribute('d', 'M0 100 L' + pts.join(' L') + ' L100 100Z');
  }

  /* ---------- dessin (commun aux deux vues) ---------- */

  /**
   * Branche le dessin sur une grille de cases. o : {
   *   k, n (nombre de temps), indexOf(case) → indice, targets : [{ get(i), set(i, v) }] (passages modifiés ensemble),
   *   repaint(), done() }.
   */
  function attachDraw(grid, o) {
    grid.addEventListener('contextmenu', (e) => e.target.closest('.ba-cell') && e.preventDefault());
    grid.addEventListener('pointerdown', (e) => {
      const cell = e.target.closest('.ba-cell');
      if (!cell) return;
      const erase = e.button === 2 || e.altKey;
      if (e.button !== 0 && !erase) return;
      e.preventDefault();
      const P = BA().P[o.k];
      const snaps = o.targets.map((t) => {
        const m = new Map();
        for (let i = 0; i < o.n; i++) m.set(i, t.get(i));
        return m;
      });
      const anchors = new Map();
      let last = null;
      const valueAt = (c, y) => {
        const r = c.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, 1 - (y - r.top) / r.height));
        let v = P.min + x * (P.max - P.min);
        if (Math.abs(v - P.def) < (P.max - P.min) * 0.02) v = P.def; // s'accroche sur le neutre
        return v;
      };
      const apply = (c, y) => {
        if (!c) return;
        const i = o.indexOf(c);
        if (i == null || i < 0) return;
        if (erase) {
          o.targets.forEach((t) => t.set(i, null));
        } else {
          const v = valueAt(c, y);
          // temps sautés entre deux positions du pointeur : droite entre les deux
          if (last && Math.abs(i - last.i) > 1) {
            const d = Math.sign(i - last.i);
            for (let j = last.i + d; j !== i; j += d) anchors.set(j, last.v + ((v - last.v) * (j - last.i)) / (i - last.i));
          }
          anchors.set(i, v);
          last = { i, v };
          o.targets.forEach((t, ti) => {
            const changes = BA().brush((j) => snaps[ti].get(j), anchors, radius, o.n, P.def);
            changes.forEach((val, j) => t.set(j, val));
          });
        }
        o.repaint(i);
      };
      apply(cell, e.clientY);
      grid.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const r = grid.getBoundingClientRect();
        const el = document.elementFromPoint(ev.clientX, Math.max(r.top + 2, Math.min(r.bottom - 2, ev.clientY)));
        const c = el && el.closest('.ba-cell');
        if (c && grid.contains(c)) apply(c, ev.clientY);
      };
      const up = () => {
        grid.removeEventListener('pointermove', move);
        grid.removeEventListener('pointerup', up);
        grid.removeEventListener('pointercancel', up);
        o.done();
      };
      grid.addEventListener('pointermove', move);
      grid.addEventListener('pointerup', up);
      grid.addEventListener('pointercancel', up);
    });
  }

  /* ---------- état d'affichage des panneaux (par piste, en mémoire) ---------- */

  const views = new Map(); // piste → { open: Set, hidden: Set }
  const viewOf = (id) => {
    if (!views.has(id)) views.set(id, { open: new Set(), hidden: new Set() });
    return views.get(id);
  };
  /** Réglages affichés sous les notes : ceux activés dans le menu, et ceux qui ont une courbe dans la scène (sauf masqués). */
  function shown(p, track) {
    const v = viewOf(track.id);
    const passes = BA().passages(p, p.current);
    return BA().paramsFor(track).filter((x) => v.open.has(x.id) || (!v.hidden.has(x.id) && BA().hasIn(p, passes, track.id, x.id)));
  }
  const isOn = (p, track) => BA().has(p, track.id);

  /* ---------- menu du bouton Automation ---------- */

  let menuEl = null;
  function closeMenu() {
    if (!menuEl) return;
    menuEl.remove();
    menuEl = null;
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', onKey, true);
  }
  function outside(e) {
    if (menuEl && !menuEl.contains(e.target) && !e.target.closest('.th-auto')) closeMenu();
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeMenu();
    }
  }
  /**
   * o : { stepOpen (ligne par pas affichée), toggleStep(), rerender() }.
   */
  function openMenu(track, btn, app, o) {
    if (menuEl) {
      const same = menuEl.dataset.track === track.id;
      closeMenu();
      if (same) return;
    }
    const p = app.project();
    const v = viewOf(track.id);
    const vis = new Set(shown(p, track).map((x) => x.id));
    const passes = BA().passages(p, p.current);
    const item = (checked, label, small, onclick, color) =>
      h('button', { type: 'button', role: 'menuitemcheckbox', 'aria-checked': String(checked), onclick },
        h('span', { class: 'ba-ck' }, checked ? '✓' : ''),
        color ? h('span', { class: 'ba-sw', style: `background:${color}` }) : null,
        h('span', {}, label),
        small ? h('small', {}, small) : null);
    menuEl = h('div', { class: 'ba-menu', role: 'menu', 'data-track': track.id, 'aria-label': `Automation de la piste ${track.name}` },
      h('div', { class: 'ba-mt' }, 'Par temps · toute la chanson'),
      BA().paramsFor(track).map((x) =>
        item(vis.has(x.id), x.label, BA().hasIn(p, passes, track.id, x.id) ? 'courbe' : BA().has(p, track.id, x.id) ? 'ailleurs' : '', () => {
          if (vis.has(x.id)) {
            v.open.delete(x.id);
            v.hidden.add(x.id);
          } else {
            v.open.add(x.id);
            v.hidden.delete(x.id);
          }
          closeMenu();
          o.rerender();
        }, x.color)),
      h('div', { class: 'ba-mt' }, 'Par pas · dans la scène'),
      item(o.stepOpen, 'Filtre DJ, volume, envois, son…', track.auto ? 'courbe' : '', () => {
        closeMenu();
        o.toggleStep();
      }));
    document.body.append(menuEl);
    const r = btn.getBoundingClientRect();
    const w = menuEl.offsetWidth;
    menuEl.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)) + 'px';
    menuEl.style.top = Math.min(window.innerHeight - menuEl.offsetHeight - 8, r.bottom + 4) + 'px';
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', onKey, true);
    const first = menuEl.querySelector('button');
    first && first.focus();
  }

  /* ---------- panneau sous les notes d'une piste ---------- */

  /** Passages modifiés et passage affiché, d'après le choix (tous ou un seul). */
  function passChoice(p) {
    const passes = BA().passages(p, p.current);
    let c = BA().loopPass(p.current);
    if (c !== 'all' && !passes[c]) c = 'all';
    return { passes, c, edit: c === 'all' ? passes : [passes[c]], show: passes[c === 'all' ? 0 : c] };
  }

  function panel(track, app, rerender) {
    const p = app.project();
    const lanes = shown(p, track);
    if (!lanes.length) return null;
    const v = viewOf(track.id);
    const n = BA().sceneBeats(p, SS.currentScene(p));
    const spb = SS.stepsPerBeat(p);
    const bpb = BA().beatsPerBar(p);
    const { passes, c, edit, show } = passChoice(p);

    const head = h('div', { class: 'ba-head' },
      h('span', { class: 'ba-title' }, 'Automation par temps'));
    if (!passes.length) {
      head.append(h('span', { class: 'ba-msg' }, 'Cette scène n\'est pas dans l\'arrangement : ajoute-la à la chanson pour l\'automatiser par temps.'),
        h('button', { type: 'button', class: 'ba-btn', onclick: () => {
          p.song.push({ scene: p.current, repeat: 1 });
          app.changed();
          rerender();
        } }, '+ Ajouter à la chanson'));
      return h('div', { class: 'ba-panel', style: `--c:${track.color}` }, head);
    }
    const passSeg = h('div', { class: 'ba-seg', role: 'group', 'aria-label': 'Passage de la scène à modifier' });
    const choose = (x) => {
      BA().setLoopPass(p.current, x);
      SS.ui && SS.ui.renderAll ? SS.ui.renderAll() : rerender();
    };
    if (passes.length > 1) passSeg.append(h('button', { type: 'button', class: c === 'all' ? 'on' : '', title: 'Modifier tous les passages de la scène ensemble', onclick: () => choose('all') }, `Tous (${passes.length})`));
    passes.forEach((ps, i) =>
      passSeg.append(h('button', { type: 'button', class: String(c) === String(i) || passes.length === 1 ? 'on' : '', title: `Seulement le passage ${i + 1} (mesures ${ps.bar + 1} à ${ps.bar + ps.bars} de la chanson) ; c'est lui qu'on entend en boucle`, onclick: () => choose(i) },
        `${i + 1} · mes. ${ps.bar + 1}–${ps.bar + ps.bars}`)));
    const modeSeg = h('div', { class: 'ba-seg', role: 'group', 'aria-label': 'Lecture entre deux temps' },
      [[false, 'Fluide', 'La valeur glisse en douceur d\'un temps au suivant'], [true, 'Paliers', 'Chaque temps garde sa valeur']].map(([st, label, tip]) =>
        h('button', { type: 'button', class: !!track.bautoStep === st ? 'on' : '', title: tip, onclick: () => {
          if (st) track.bautoStep = true;
          else delete track.bautoStep;
          app.changed();
          rerender();
        } }, label)));
    head.append(h('label', {}, 'Passage'), passSeg, h('label', {}, 'Liaison'), linkSeg(), h('label', {}, 'Lecture'), modeSeg,
      h('button', { type: 'button', class: 'ba-btn', title: 'Voir et dessiner ces courbes sur toute la chanson (fenêtre Arrangement)', onclick: () => {
        songParam = lanes[0].id;
        SS.song.open();
      } }, 'Toute la chanson…'));

    const el = h('div', { class: 'ba-panel', style: `--c:${track.color}` }, h('div', { class: 'ba-headrow' }, head));
    lanes.forEach((x) => {
      const k = x.id;
      const vals = (i) => (i < 0 || i >= n ? null : BA().get(p, show, track.id, k, i));
      const readout = h('small', { class: 'ba-read' });
      const shapes = h('select', { class: 'ba-shape', 'aria-label': `Forme toute prête pour ${x.label}`, onchange: (e) => {
        const vs = BA().shape(k, e.target.value, n);
        edit.forEach((ps) => vs.forEach((val, i) => BA().set(p, ps, track.id, k, i, val)));
        e.target.value = '';
        app.changed();
        rerender();
      } }, h('option', { value: '' }, 'Forme…'), BA().SHAPES.map((s) => h('option', { value: s.id }, s.label)));
      const lab = h('div', { class: 'ba-lab' },
        h('div', { class: 'ba-lab-row' }, h('b', { style: `color:${x.color}` }, x.label), h('small', {}, x.sub)),
        readout,
        h('div', { class: 'ba-lab-row' }, shapes,
          h('button', { type: 'button', class: 'ba-x', title: 'Masquer ce panneau (la courbe est gardée et continue de jouer)', 'aria-label': `Masquer ${x.label}`, onclick: () => {
            v.open.delete(k);
            v.hidden.add(k);
            rerender();
          } }, '×')));
      const grid = h('div', { class: 'grid ba-grid', style: `--bc:${x.color}`, title: 'Glisser pour dessiner · les barres voisines suivent (Liaison) · Alt+clic ou clic droit : effacer' });
      const zero = h('div', { class: 'ba-zero', style: `bottom:${norm(k, x.def) * 100}%` });
      grid.append(zero);
      const cells = [];
      for (let i = 0; i < n; i++) {
        const cl = 'ba-cell' + (i > 0 && i % bpb === 0 ? ' bar' : '');
        const cell = cellEl({ class: cl, 'data-i': i, style: `grid-column: span ${spb}` });
        cells.push(cell);
        grid.append(cell);
      }
      const showRead = () => {
        const set = [];
        for (let i = 0; i < n; i++) if (vals(i) != null) set.push(vals(i));
        let txt = set.length ? `${BA().fmt(k, Math.min(...set))} … ${BA().fmt(k, Math.max(...set))}` : 'comme écrit';
        if (c === 'all' && passes.length > 1 && passes.some((ps) => { for (let i = 0; i < n; i++) if (BA().get(p, ps, track.id, k, i) !== vals(i)) return true; return false; })) txt += ' · varie selon le passage';
        readout.textContent = txt;
      };
      const repaint = () => {
        for (let i = 0; i < n; i++) paintCell(cells[i], k, vals, i, !!track.bautoStep);
        showRead();
      };
      grid.addEventListener('pointermove', (e) => {
        if (e.buttons) return;
        const cell = e.target.closest('.ba-cell');
        if (!cell) return;
        const i = +cell.dataset.i;
        cell.title = `Mesure ${Math.floor(i / bpb) + 1}, temps ${(i % bpb) + 1} : ${BA().fmt(k, vals(i))}`;
      });
      attachDraw(grid, {
        k,
        n,
        indexOf: (cell) => +cell.dataset.i,
        targets: edit.map((ps) => ({ get: (i) => BA().get(p, ps, track.id, k, i), set: (i, val) => BA().set(p, ps, track.id, k, i, val) })),
        repaint,
        done: () => {
          v.open.add(k); // dessiné : reste affiché même si on efface tout
          app.changed();
          const btn = document.querySelector(`.track[data-id="${track.id}"] .th-auto`);
          if (btn) btn.classList.toggle('on', !!track.auto || isOn(p, track));
        },
      });
      repaint();
      el.append(h('div', { class: 'ba-lane' }, lab, grid));
    });
    return el;
  }

  /* ---------- frise de la fenêtre Song ---------- */

  let songParam = 'cut';
  /**
   * Lignes d'automation sous les blocs de la frise. host : élément à remplir ; tools : barre d'outils ;
   * px : largeur d'une mesure ; app.
   */
  function songView(host, tools, px, app) {
    const p = app.project();
    const bpb = BA().beatsPerBar(p);
    const tracks = p.tracks.filter((t) => BA().paramsFor(t).some((x) => x.id === songParam));
    tools.replaceChildren(
      h('span', { class: 'ba-title' }, 'Automation par temps'),
      h('div', { class: 'ba-seg', role: 'group', 'aria-label': 'Réglage affiché' },
        SS.BEAT_AUTO.map((x) => h('button', { type: 'button', class: x.id === songParam ? 'on' : '', onclick: () => {
          songParam = x.id;
          songView(host, tools, px, app);
        } }, x.label))),
      h('label', {}, 'Liaison'), linkSeg(),
      SS.helpTip('Glisser sur les barres pour dessiner · Alt+clic : effacer.', 'Automation par temps'));
    const k = songParam;
    const x = BA().P[k];
    // positions de la frise : un temps = (bloc, répétition, temps dans la scène)
    const slots = [];
    p.song.forEach((b, block) => {
      const sc = p.scenes.find((s) => s.id === b.scene);
      if (!sc) return;
      const n = BA().sceneBeats(p, sc);
      for (let rep = 0; rep < b.repeat; rep++) for (let beat = 0; beat < n; beat++) slots.push({ pass: { block, rep }, beat, first: rep === 0 && beat === 0, bar: beat % bpb === 0 });
    });
    const rows = tracks.map((t) => {
      const vals = (i) => (i < 0 || i >= slots.length ? null : BA().get(p, slots[i].pass, t.id, k, slots[i].beat));
      const grid = h('div', { class: 'ba-row-grid', style: `--bc:${x.color}` }, h('div', { class: 'ba-zero', style: `bottom:${norm(k, x.def) * 100}%` }));
      const cells = slots.map((s, i) => {
        const cell = cellEl({ class: 'ba-cell' + (s.first ? ' block' : s.bar ? ' bar' : ''), 'data-i': i, style: `width:${px / bpb}px` });
        grid.append(cell);
        return cell;
      });
      const repaint = () => cells.forEach((cell, i) => paintCell(cell, k, vals, i, !!t.bautoStep));
      grid.addEventListener('pointermove', (e) => {
        if (e.buttons) return;
        const cell = e.target.closest('.ba-cell');
        if (!cell) return;
        const i = +cell.dataset.i, s = slots[i];
        const sc = p.scenes.find((q) => q.id === p.song[s.pass.block].scene);
        cell.title = `${t.name} · ${sc ? sc.name : ''} (passage ${s.pass.rep + 1}) · mesure ${Math.floor(s.beat / bpb) + 1}, temps ${(s.beat % bpb) + 1} : ${BA().fmt(k, vals(i))}`;
      });
      attachDraw(grid, {
        k,
        n: slots.length,
        indexOf: (cell) => +cell.dataset.i,
        targets: [{ get: vals, set: (i, val) => BA().set(p, slots[i].pass, t.id, k, slots[i].beat, val) }],
        repaint,
        done: () => {
          app.changed();
          SS.ui && SS.ui.renderAll && SS.ui.renderAll();
        },
      });
      repaint();
      return h('div', { class: 'ba-row', style: `--c:${t.color}` }, h('span', { class: 'ba-row-name' }, t.name), grid);
    });
    host.replaceChildren(...(rows.length ? rows : [h('div', { class: 'ba-msg' }, 'Aucune piste ne peut recevoir ce réglage.')]));
  }

  return { openMenu, closeMenu, panel, songView, shown, isOn };
})();
