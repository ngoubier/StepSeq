/*
 * Piste générative (Jardin, Paysage, Fresque, js/ambient.js) dans la Grille : à la place des cases de notes, que le
 * moteur ne joue pas, une bande qui montre ce que la piste fait dans la scène :
 *   - la part de la courbe « présence sur toute la chanson » qui tombe dans la scène, retouchable en glissant dessus
 *     (une étape Ctrl+Z, au lâcher) ;
 *   - en haut, les accords suivis (ou la gamme de la scène si « Suit les accords » est coupé) ;
 *   - pendant la lecture, un point par note jouée par le module (hauteur = grave → aigu), qui s'efface.
 * build(track, grid, app) : appelée par js/ui.js (buildTrack) ; refresh(track) au changement de scène (paint).
 */
window.SS = window.SS || {};

SS.ambientLane = (() => {
  const lanes = new Map(); // track.id -> { draw, labels }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#7fd6ec';
  const LO = 36, HI = 100; // hauteurs dessinées (midi)
  const FADE = 3; // secondes pendant lesquelles un point reste visible

  /** Texte des accords suivis par la piste dans la scène, placés au pas : [{ step, text }]. */
  function harmonyLabels(p, track) {
    const sc = p.scenes && p.scenes.length ? SS.currentScene(p) : null;
    const key = sc && SS.harmony.valid(sc.key) ? sc.key : null;
    const chords = SS.sceneGridChords(p);
    if (SS.ambient.settings(track).follow && chords.length) {
      return chords.map((c) => ({ step: c.step, text: c.info.name + ' · ' + c.info.notes.map((n) => SS.harmony.french(n).toLowerCase()).join(' ') }));
    }
    return [{ step: 0, text: key ? `gamme : ${SS.harmony.label(key)}` : 'gamme : Do majeur' }];
  }

  function build(track, grid, app) {
    grid.classList.add('amb-grid');
    const p = app.project();
    const mod = SS.ambient.MODULES[SS.ambient.moduleOf(track)];
    const color = cssVar(mod.color);
    const cv = document.createElement('canvas');
    const chords = document.createElement('div');
    chords.className = 'amb-chords';
    const tag = document.createElement('div');
    tag.className = 'amb-tag';
    const lane = document.createElement('div');
    lane.className = 'amb-lane';
    lane.setAttribute('aria-label', `Présence de « ${track.name} » dans la scène : glisser pour la retoucher`);
    lane.append(cv, chords, tag);
    grid.append(lane);

    let x0 = 0, x1 = 1, H = 1, dpr = 1;
    let entry = null;
    const span = () => SS.ambient.sceneSpan(app.project());
    const presence = () => (track.ambient && Array.isArray(track.ambient.presence) ? track.ambient.presence : null);
    const fracAt = (px) => {
      const [a, b] = span();
      return a + (b - a) * clamp((px - x0) / Math.max(1, x1 - x0), 0, 1);
    };
    const ctx = cv.getContext('2d');

    function measure() {
      const cells = grid._cells || [];
      const n = Math.min(cells.length, SS.trackLen(app.project(), track)) || cells.length;
      if (!n) return;
      x0 = cells[0].offsetLeft;
      const last = cells[n - 1];
      x1 = last.offsetLeft + last.offsetWidth;
      H = Math.max(1, grid.clientHeight);
      dpr = window.devicePixelRatio || 1;
      lane.style.left = x0 + 'px';
      lane.style.width = Math.max(1, x1 - x0) + 'px';
      const w = Math.max(1, x1 - x0);
      const scale = Math.min(dpr, 4096 / w);
      cv.width = Math.round(w * scale);
      cv.height = Math.round(H * scale);
      cv.style.width = w + 'px';
      cv.style.height = H + 'px';
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    }

    function labels() {
      const P = app.project();
      const total = SS.totalSteps(P);
      chords.replaceChildren(
        ...harmonyLabels(P, track).map((l) => {
          const s = document.createElement('span');
          s.style.left = (l.step / total) * 100 + '%';
          s.textContent = l.text;
          return s;
        })
      );
      const A = SS.ambient.settings(track);
      tag.textContent = (A.follow ? 'suit les accords' : 'gamme de la scène') + (A.rands ? ' · hasard variable' : ` · hasard ${Math.round(A.rand * 100)} %`);
    }

    function draw() {
      const w = x1 - x0;
      ctx.clearRect(0, 0, w, H);
      const top = 20, bot = H - 4, y = (v) => bot - v * (bot - top);
      const pres = presence();
      const steps = Math.max(2, Math.round(w / 3));
      const pts = Array.from({ length: steps + 1 }, (_, i) => [(i / steps) * w, y(clamp(SS.ambient.curveAt(pres, fracAt(x0 + (i / steps) * w)), 0, 1))]);
      ctx.beginPath();
      ctx.moveTo(0, bot);
      pts.forEach(([x, yy]) => ctx.lineTo(x, yy));
      ctx.lineTo(w, bot);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, top, 0, bot);
      g.addColorStop(0, color + '66');
      g.addColorStop(1, color + '10');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.beginPath();
      pts.forEach(([x, yy], i) => (i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy)));
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      // barre de lecture (les cases, cachées, ne s'allument plus)
      const playing = SS.audio.isPlaying();
      if (playing && entry.step >= 0) {
        const n = SS.trackLen(app.project(), track);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.fillRect(((entry.step % n) / n) * w, 0, 1.5, H);
      }
      // notes jouées par le module pendant la lecture
      const mk = SS.ambient.marks(track.id);
      let live = false;
      if (mk && playing) {
        mk.list.forEach((d) => {
          const age = mk.now - d.t;
          if (age < 0 || age > FADE) return;
          live = true;
          const a = 1 - age / FADE;
          ctx.beginPath();
          ctx.arc(d.x * w, y(clamp((d.m - LO) / (HI - LO), 0.03, 0.97)), 2 + 4 * (1 - a), 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 255, 255, ${(0.85 * a).toFixed(3)})`;
          ctx.fill();
        });
      }
      return live;
    }

    // dessin continu pendant la lecture (points qui apparaissent et s'effacent), puis une dernière image
    let raf = 0;
    function tick() {
      raf = 0;
      if (!lane.isConnected) return lanes.get(track.id) && lanes.get(track.id).lane === lane && lanes.delete(track.id);
      const live = draw();
      if (live || SS.audio.isPlaying()) raf = requestAnimationFrame(tick);
    }
    const wake = () => raf || (raf = requestAnimationFrame(tick));

    // retouche de la présence : on glisse sur la bande
    lane.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (SS.freeze && SS.freeze.guard(track)) return;
      const PN = SS.ambient.PN;
      track.ambient = track.ambient || {};
      const arr = (presence() || new Array(PN).fill(1)).slice();
      track.ambient.presence = arr;
      const r = lane.getBoundingClientRect();
      let last = null;
      const put = (ev) => {
        const px = x0 + (ev.clientX - r.left);
        const v = Math.round(clamp((bot() - (ev.clientY - r.top)) / (bot() - 20), 0, 1) * 1000) / 1000;
        const i = Math.round(clamp(fracAt(px), 0, 1) * (PN - 1));
        const from = last ? last.i : i, fv = last ? last.v : v;
        const lo = Math.min(from, i), hi = Math.max(from, i);
        for (let k = lo; k <= hi; k++) arr[k] = hi === lo ? v : fv + ((v - fv) * (k - from)) / (i - from);
        last = { i, v };
        draw();
      };
      const bot = () => H - 4;
      put(e);
      lane.setPointerCapture(e.pointerId);
      const move = (ev) => put(ev);
      const up = () => {
        lane.removeEventListener('pointermove', move);
        lane.removeEventListener('pointerup', up);
        lane.removeEventListener('pointercancel', up);
        app.changed();
      };
      lane.addEventListener('pointermove', move);
      lane.addEventListener('pointerup', up);
      lane.addEventListener('pointercancel', up);
    });

    entry = { lane, labels, step: -1, wake, redraw: () => (measure(), draw(), wake()) };
    lanes.set(track.id, entry);
    // zoom horizontal, hauteur des pistes : les cases changent de taille sans reconstruction
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => (lane.isConnected ? entry.redraw() : ro.disconnect()));
      ro.observe(grid);
      if (grid._cells && grid._cells[0]) ro.observe(grid._cells[0]);
    }
    labels();
    requestAnimationFrame(() => {
      measure();
      draw();
      wake();
    });
    return lane;
  }

  /** Changement de scène (même forme de page) : accords, réglages et courbe de la nouvelle scène. */
  function refresh(track) {
    const e = lanes.get(track.id);
    if (!e || !e.lane.isConnected) return;
    e.labels();
    e.redraw();
  }
  /** Barre de lecture (js/ui.js setPlayhead) : pas joué, -1 à l'arrêt ; les bandes redessinent. */
  function at(step) {
    lanes.forEach((e) => {
      e.step = step;
      if (e.lane.isConnected) e.wake();
    });
  }

  return { build, refresh, at, harmonyLabels };
})();
