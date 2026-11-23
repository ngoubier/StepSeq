/*
 * Fenêtre « Lire une partition » (menu → Lire une partition…, ou Ouvrir un fichier… sur une image, un PDF, un MusicXML).
 * Maquette : maquette-partition-midi.html. Trois lecteurs :
 *   ✦ Claude   : la page s'affiche en grand ; Claude (extension Chrome) la lit et écrit les notes (StepSeq.lirePartition) ;
 *   Audiveris  : logiciel gratuit sur l'ordinateur, qui produit un MusicXML (.mxl) déposé ici ;
 *   MusicXML   : exporté de MuseScore, Sibelius, Finale, Dorico… exact, sans lecture.
 * Puis : vérifier (mesures à vérifier, tempo, tonalité, son par portée, écoute), Enregistrer le .mid ou Importer dans
 * StepSeq (la fenêtre « Importer MIDI » existante, js/midipanel.js). Le travail sur la partition : js/score-read.js.
 */
window.SS = window.SS || {};
SS.scorePanel = (() => {
  const $ = (q) => document.querySelector(q);
  const R = () => SS.scoreRead;
  const PDF_JS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  const MAX_PAGES = 20;
  const st = {
    step: 1,
    engine: 'claude', // claude | audiveris | musicxml
    kind: 'auto', // auto | melodie | piano | ensemble (indication pour Claude)
    file: null, // nom du fichier
    pages: [], // [{ url, on }]
    page: 0, // page affichée à l'étape 2
    score: null,
    opts: null, // { tempo, timeSig, key, parts: [{ on, program }], merge, chords: { on, program } }
    by: null, // qui a lu : Claude, Audiveris, MusicXML
  };
  let playing = null;

  function h(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => c != null && e.append(c.nodeType ? c : document.createTextNode(String(c))));
    return e;
  }
  const isScoreFile = (name) => /\.(pdf|png|jpe?g|gif|webp|bmp|musicxml|xml|mxl)$/i.test(name || '');
  const isXml = (name) => /\.(musicxml|xml|mxl)$/i.test(name || '');
  const titleOf = (name) => String(name || 'Partition').replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').trim();

  /* ---------------- Fichiers ---------------- */
  let pdfLib = null;
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfLib) return pdfLib;
    pdfLib = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PDF_JS + 'pdf.min.js';
      s.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS + 'pdf.worker.min.js';
        resolve(window.pdfjsLib);
      };
      s.onerror = () => {
        pdfLib = null;
        reject(new Error('lecteur PDF indisponible (connexion internet ?)'));
      };
      document.head.appendChild(s);
    });
    return pdfLib;
  }
  async function pdfPages(buf) {
    const lib = await loadPdfJs();
    const pdf = await lib.getDocument({ data: buf }).promise;
    const out = [];
    for (let i = 1; i <= Math.min(pdf.numPages, MAX_PAGES); i++) {
      const page = await pdf.getPage(i);
      const v0 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: Math.min(3, 1800 / v0.width) });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width);
      c.height = Math.round(vp.height);
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: g, viewport: vp }).promise;
      out.push({ url: c.toDataURL('image/jpeg', 0.9), on: true });
    }
    return out;
  }
  const dataUrl = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });

  /** Un fichier choisi ou déposé : MusicXML → résultat direct ; image ou PDF → pages pour Claude ou Audiveris. */
  async function takeFile(file) {
    if (!file) return;
    if (!isScoreFile(file.name)) {
      SS.ui.toast('Partition : une image (PNG, JPG), un PDF ou un MusicXML (.musicxml, .mxl).');
      return;
    }
    try {
      if (isXml(file.name)) {
        const buf = new Uint8Array(await file.arrayBuffer());
        const text = /\.mxl$/i.test(file.name) ? await R().unzipMxl(buf) : new TextDecoder().decode(buf);
        if (!st.file || st.engine !== 'audiveris') {
          st.file = file.name;
          st.pages = [];
        }
        setScore(R().fromMusicXML(text), st.engine === 'audiveris' ? 'Audiveris' : 'MusicXML', file.name);
        return;
      }
      st.file = file.name;
      st.score = null;
      setBusy('Ouverture…');
      st.pages = /\.pdf$/i.test(file.name) ? await pdfPages(new Uint8Array(await file.arrayBuffer())) : [{ url: await dataUrl(file), on: true }];
      if (st.engine === 'musicxml') st.engine = 'claude';
      show(1);
    } catch (e) {
      console.error(e);
      SS.ui.toast(`Partition illisible : ${e.message || e}`, 6000);
      show(st.step);
    }
  }
  function pick(accept) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept || '.pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.musicxml,.xml,.mxl,image/*,application/pdf';
    input.onchange = () => takeFile(input.files[0]);
    input.click();
  }

  /* ---------------- Résultat ---------------- */
  function setScore(score, by, name) {
    stopPreview();
    st.score = score;
    st.by = by;
    if (name && !st.file) st.file = name;
    if (!score.title) score.title = titleOf(st.file);
    st.opts = {
      tempo: Math.round(score.tempo),
      timeSig: score.timeSig.slice(),
      key: { ...score.key },
      parts: score.parts.map((p) => ({ on: true, program: p.program })),
      merge: false,
      chords: { on: false, program: 89 },
    };
    if (!$('#scoreDialog').open) open();
    show(3);
  }

  /* ---------------- Affichage ---------------- */
  function setBusy(msg) {
    const box = $('#scBody');
    box.textContent = '';
    box.append(h('div', { class: 'sc-busy' }, h('div', { class: 'sc-spin' }), msg));
  }
  function show(step) {
    st.step = step;
    stopPreview();
    const box = $('#scBody');
    box.textContent = '';
    if (step === 1) box.append(paneDrop());
    else if (step === 2) box.append(st.engine === 'audiveris' ? paneAudiveris() : paneClaude());
    else box.append(paneResult());
    $('#scBack').hidden = step === 1;
    $('#scSave').hidden = step !== 3;
    const next = $('#scNext');
    next.textContent = step === 3 ? 'Importer dans StepSeq' : 'Lire la partition';
    next.hidden = step === 2;
    next.disabled = step === 1 ? !st.pages.some((p) => p.on) : step === 3 && !anyTrack();
  }
  const anyTrack = () => st.score && (st.opts.parts.some((p, i) => p.on && st.score.parts[i].notes.length) || (st.opts.chords.on && st.score.chords.length));

  const ENGINES = [
    { id: 'claude', name: '✦ Claude', badge: 'Chrome', stars: 3, sub: 'Mélodie, grille, piano simple' },
    { id: 'audiveris', name: 'Audiveris', stars: 4, sub: 'Imprimé, plusieurs portées' },
    { id: 'musicxml', name: 'MusicXML', stars: 5, sub: 'Exact, sans lecture' },
  ];
  function paneDrop() {
    const drop = h('div', { class: 'sc-drop' },
      h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }),
      h('b', {}, st.file && st.pages.length ? st.file : 'Glisser la partition ici'),
      h('button', { type: 'button', class: 'btn', onclick: () => pick() }, st.pages.length ? 'Autre fichier…' : 'Choisir un fichier…'),
      h('div', { class: 'sc-fmts' }, ['PDF', 'PNG', 'JPG', 'Photo', 'MusicXML · MXL'].map((f) => h('span', { class: 'sc-fmt' }, f))));
    drop.querySelector('svg').innerHTML = '<path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>';
    const wrap = h('div', { class: 'sc-pane' }, drop);
    if (st.pages.length) {
      const on = st.pages.filter((p) => p.on).length;
      wrap.append(h('div', { class: 'sc-thumbs' },
        st.pages.map((p, i) => h('button', { type: 'button', class: `sc-th${p.on ? ' on' : ''}`, onclick: () => { p.on = !p.on; show(1); } },
          h('img', { src: p.url, alt: '' }), `Page ${i + 1}`)),
        st.pages.length > 1 ? h('span', { class: 'sc-count' }, `${on} page${on > 1 ? 's' : ''} sur ${st.pages.length}`, SS.helpTip('Clic sur une page pour l’inclure ou l’exclure (couverture, paroles seules…).', 'Pages')) : null));
    }
    wrap.append(h('div', { class: 'sc-row' },
      h('span', { class: 'sc-l' }, 'Lecteur', SS.helpTip('Claude lit la partition tout de suite avec ton abonnement, par l’extension Claude in Chrome. Audiveris (gratuit, à installer) est le plus fiable sur une partition imprimée de plusieurs pages. Un MusicXML exporté de MuseScore, Sibelius, Finale ou Dorico n’a pas besoin de lecture : il est exact.', 'Lecteur')),
      h('div', { class: 'sc-eng' }, ENGINES.map((e) => h('button', {
        type: 'button', class: `sc-card${st.engine === e.id ? ' on' : ''}`,
        onclick: () => {
          st.engine = e.id;
          if (e.id === 'musicxml') return pick('.musicxml,.xml,.mxl');
          show(1);
        },
      }, h('b', {}, e.name, e.badge ? h('span', { class: 'sc-badge' }, e.badge) : null), h('span', { class: 'sc-stars' }, '★'.repeat(e.stars) + '☆'.repeat(5 - e.stars)), h('small', {}, e.sub))))));
    if (st.engine === 'claude') {
      const seg = h('div', { class: 'segmented' }, [['auto', 'Auto'], ['melodie', 'Mélodie'], ['piano', 'Piano'], ['ensemble', 'Ensemble']].map(([v, l]) =>
        h('button', { type: 'button', class: st.kind === v ? 'active' : null, onclick: () => { st.kind = v; show(1); } }, l)));
      wrap.append(h('div', { class: 'sc-row' }, h('span', { class: 'sc-l' }, 'Contenu'), seg,
        SS.helpTip('Aide Claude : « Mélodie » = une portée (chant, lead sheet) ; « Piano » = 2 portées liées ; « Ensemble » = plusieurs instruments (quatuor, orchestre…).', 'Contenu')));
    }
    return wrap;
  }

  const onPages = () => st.pages.filter((p) => p.on);
  function pageView() {
    const pages = onPages();
    st.page = Math.min(st.page, pages.length - 1);
    const nav = pages.length > 1 ? h('div', { class: 'sc-nav' },
      h('button', { type: 'button', class: 'btn btn-small', disabled: st.page === 0, onclick: () => { st.page--; show(2); } }, '◀'),
      h('span', {}, `Page ${st.page + 1} / ${pages.length}`),
      h('button', { type: 'button', class: 'btn btn-small', disabled: st.page >= pages.length - 1, onclick: () => { st.page++; show(2); } }, '▶')) : null;
    return [nav, h('div', { class: 'sc-page' }, h('img', { id: 'scPageImg', src: pages[st.page] ? pages[st.page].url : '', alt: `Partition, page ${st.page + 1}` }))];
  }
  function paneClaude() {
    return h('div', { class: 'sc-pane' },
      h('div', { class: 'sc-wait' }, h('div', { class: 'sc-spin' }), h('b', {}, 'En attente de Claude…'),
        SS.helpTip('Dans Chrome, ouvre Claude et demande-lui : « Lis la partition dans StepSeq ». Il regarde chaque page et écrit les notes ; le résultat s’affiche ici pour vérifier.', 'Lecture par Claude')),
      ...pageView());
  }
  function paneAudiveris() {
    const drop = h('div', { class: 'sc-drop sc-drop-small' },
      h('b', {}, 'Déposer le .mxl d’Audiveris'),
      h('div', { class: 'sc-nav' },
        h('button', { type: 'button', class: 'btn', onclick: () => pick('.mxl,.musicxml,.xml') }, 'Choisir le .mxl…'),
        h('a', { class: 'btn', href: 'https://github.com/Audiveris/audiveris/releases', target: '_blank', rel: 'noopener' }, '⤓ Audiveris'),
        SS.helpTip(`1. Installe Audiveris (gratuit). 2. Ouvre-y « ${st.file || 'ta partition'} » : il lit toutes les pages. 3. Menu Book ▸ Export Book As… (.mxl). 4. Dépose ce fichier ici.`, 'Audiveris')));
    return h('div', { class: 'sc-pane' }, drop, ...pageView());
  }

  /* --- étape 3 --- */
  function paneResult() {
    const sc = st.score;
    const o = st.opts;
    const left = h('div', { class: 'sc-left' });
    if (st.pages.length) left.append(h('div', { class: 'sc-page sc-page-small' }, onPages().map((p) => h('img', { src: p.url, alt: '' }))));
    else left.append(overview());
    const strip = h('div', { class: 'sc-bars', id: 'scBars' }, sc.bars.map((b, i) => h('button', {
      type: 'button', class: `sc-bar${b.suspect ? ' bad' : ''}`, 'data-i': i,
      title: b.suspect ? `Mesure ${b.n} : ${fmtBeats(b.expected)} attendus${b.parts && b.parts.length ? ` (${b.parts.join(', ')})` : ''}` : `Mesure ${b.n}`,
      onclick: () => preview(i),
    }, b.n)));
    left.append(h('div', { class: 'sc-legend' },
      h('span', {}, h('i', { class: 'sc-sw now' }), 'En écoute'), h('span', {}, h('i', { class: 'sc-sw bad' }), 'À vérifier'),
      SS.helpTip('Une mesure « à vérifier » n’a pas le bon nombre de temps : une note ou un silence mal lu. Clic sur une mesure : écoute à partir d’elle. Le fichier MIDI garde un repère « À vérifier » sur chacune.', 'Mesures')), strip);

    const keySel = h('select', { onchange: (e) => (o.key = R().KEYS[+e.target.value]) }, R().KEYS.map((k, i) => h('option', { value: i, selected: k.sf === o.key.sf && k.minor === o.key.minor ? true : null }, k.label)));
    const tempoIn = h('input', { type: 'number', min: 20, max: 300, value: o.tempo, onchange: (e) => (o.tempo = Math.max(20, Math.min(300, Math.round(+e.target.value) || o.tempo))) });
    const tsIn = h('input', { type: 'text', value: o.timeSig.join('/'), onchange: (e) => { const m = /^(\d+)\s*\/\s*(\d+)$/.exec(e.target.value); if (m) o.timeSig = [+m[1], +m[2]]; e.target.value = o.timeSig.join('/'); } });
    const meta = h('div', { class: 'sc-meta' },
      h('label', { class: 'sc-f' }, h('span', {}, 'Tempo', sc.tempoText ? SS.helpTip(`« ${sc.tempoText} » traduit en ${Math.round(sc.tempo)}. Change-le si besoin.`, 'Tempo') : null), tempoIn),
      h('label', { class: 'sc-f' }, h('span', {}, 'Mesure'), tsIn),
      h('label', { class: 'sc-f' }, h('span', {}, 'Tonalité'), keySel));
    const progSel = (val, onch) => h('select', { onchange: (e) => onch(+e.target.value) }, R().PROGRAMS.map(([p, l]) => h('option', { value: p, selected: p === val ? true : null }, l)),
      R().PROGRAMS.some(([p]) => p === val) ? null : h('option', { value: val, selected: true }, `GM ${val + 1}`));
    const tracks = h('div', { class: 'sc-tracks' }, sc.parts.map((p, i) => h('div', { class: 'sc-tr' },
      h('input', { type: 'checkbox', checked: o.parts[i].on ? true : null, onchange: (e) => { o.parts[i].on = e.target.checked; show(3); } }),
      h('span', { class: 'sc-nm', title: `${p.notes.length} notes` }, p.name),
      progSel(o.parts[i].program, (v) => (o.parts[i].program = v)),
      roll(p.notes, i))));
    if (sc.chords.length) tracks.append(h('div', { class: 'sc-tr' },
      h('input', { type: 'checkbox', checked: o.chords.on ? true : null, onchange: (e) => { o.chords.on = e.target.checked; show(3); } }),
      h('span', { class: 'sc-nm', title: sc.chords.map((c) => c.name).join(' ') }, `Accords (${sc.chords.slice(0, 2).map((c) => c.name).join(', ')}…)`),
      progSel(o.chords.program, (v) => (o.chords.program = v)),
      roll(sc.chords.flatMap((c) => (R().chordNotes(c.name) || []).map((pp) => ({ p: pp, t: c.t, d: c.d }))), 'ch')));
    const right = h('div', { class: 'sc-side' },
      h('div', { class: 'sc-by' }, `${st.by} · ${sc.bars.length} mesures · ${sc.noteCount} notes`),
      meta, tracks);
    if (sc.suspects.length) {
      const first = sc.bars.findIndex((b) => b.suspect);
      right.append(h('div', { class: 'sc-warn' }, '⚠ ',
        h('span', {}, h('b', {}, `${sc.suspects.length} mesure${sc.suspects.length > 1 ? 's' : ''}`), ` à vérifier (${sc.suspects.slice(0, 6).join(', ')}${sc.suspects.length > 6 ? '…' : ''})`),
        h('button', { type: 'button', class: 'btn btn-small', onclick: () => preview(first) }, `Écouter ${sc.bars[first].n}`)));
    }
    if (sc.errors && sc.errors.length) right.append(h('ul', { class: 'midi-warn' }, sc.errors.slice(0, 5).map((e) => h('li', {}, e))));
    const seg = h('div', { class: 'segmented' }, [[false, 'Une piste par portée'], [true, 'Tout sur une piste']].map(([v, l]) =>
      h('button', { type: 'button', class: o.merge === v ? 'active' : null, onclick: () => { o.merge = v; show(3); } }, l)));
    right.append(h('div', { class: 'sc-play' }, h('button', { type: 'button', class: 'btn sc-playbtn', id: 'scPlay', title: 'Écouter', onclick: () => (playing ? stopPreview() : preview(0)) }, '▶'), sc.parts.length > 1 ? seg : null));
    return h('div', { class: 'sc-split' }, left, right);
  }
  /** Sans image (MusicXML) : toutes les portées en piano roll, mesures à vérifier en orange. */
  function overview() {
    const sc = st.score;
    const W = 1200;
    const H = 420;
    const c = h('canvas', { class: 'sc-over', width: W, height: H });
    const g = c.getContext('2d');
    const css = getComputedStyle(document.documentElement);
    const v = (n, d) => css.getPropertyValue(n).trim() || d;
    const total = sc.length || 1;
    const x = (q) => (q / total) * W;
    sc.bars.forEach((b) => {
      if (b.suspect) {
        g.fillStyle = v('--c-amber-bg', '#2a2214');
        g.fillRect(x(b.start), 0, x(b.len), H);
      }
      g.fillStyle = v('--c-line', '#3e3e44');
      g.fillRect(x(b.start), 0, 1, H);
    });
    const all = sc.parts.flatMap((p) => p.notes.map((n) => n.p));
    const lo = Math.min(...all, 127) - 2;
    const hi = Math.max(...all, 0) + 2;
    const y = (p) => H - ((p - lo) / Math.max(1, hi - lo)) * H;
    const cols = [v('--c-cyan', '#4fc3f7'), v('--c-violet', '#a479ff'), v('--c-teal', '#3fcf8e'), v('--c-orange', '#ff8a3d'), v('--c-pink', '#e3179c')];
    sc.parts.forEach((p, i) => {
      g.fillStyle = cols[i % cols.length];
      p.notes.forEach((n) => g.fillRect(x(n.t) + 1, y(n.p) - 4, Math.max(2, x(n.d) - 2), 7));
    });
    return c;
  }
  const fmtBeats = (q) => `${Math.round(q * 100) / 100} temps`;
  function roll(notes, id) {
    const c = h('canvas', { class: 'sc-roll', width: 240, height: 60 });
    const total = st.score.length || 1;
    const ps = notes.map((n) => n.p);
    const lo = Math.min(...ps, 127);
    const hi = Math.max(...ps, 0);
    const g = c.getContext('2d');
    const css = getComputedStyle(document.documentElement);
    g.fillStyle = css.getPropertyValue(id === 'ch' ? '--c-teal' : id % 2 ? '--c-violet' : '--c-cyan').trim() || '#4fc3f7';
    for (const n of notes) g.fillRect((n.t / total) * 240, 54 - ((n.p - lo) / Math.max(1, hi - lo)) * 48, Math.max(1.5, (n.d / total) * 240 - 0.5), 4);
    return c;
  }

  /* ---------------- Écoute (petit synthé, sans toucher au projet) ---------------- */
  function preview(fromBar) {
    stopPreview();
    const sc = st.score;
    const o = st.opts;
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const spq = 60 / o.tempo;
    const t0 = sc.bars[fromBar] ? sc.bars[fromBar].start : 0;
    const now = ctx.currentTime + 0.08;
    const out = ctx.createGain();
    out.gain.value = 0.18;
    out.connect(ctx.destination);
    const lanes = sc.parts.filter((p, i) => o.parts[i].on).map((p) => p.notes);
    if (o.chords.on) lanes.push(sc.chords.flatMap((c) => (R().chordNotes(c.name) || []).map((p) => ({ p, t: c.t, d: c.d, v: 50 }))));
    let end = 0;
    lanes.flat().filter((n) => n.t + n.d > t0 + 1e-3).forEach((n) => {
      const s = now + Math.max(0, n.t - t0) * spq;
      const e = now + (n.t + n.d - t0) * spq;
      if (s - now > 600) return;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 440 * 2 ** ((n.p - 69) / 12);
      const g = ctx.createGain();
      const v = ((n.v || 82) / 127) * 0.6;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(v, s + 0.01);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, v * 0.35), Math.max(s + 0.02, e));
      g.gain.linearRampToValueAtTime(0, Math.max(s + 0.03, e) + 0.06);
      osc.connect(g).connect(out);
      osc.start(s);
      osc.stop(Math.max(s + 0.03, e) + 0.1);
      end = Math.max(end, e);
    });
    playing = { ctx, now, t0, spq, raf: 0 };
    const btn = $('#scPlay');
    if (btn) btn.textContent = '■';
    const tick = () => {
      if (!playing) return;
      const q = playing.t0 + (ctx.currentTime - playing.now) / playing.spq;
      const i = sc.bars.findIndex((b) => q >= b.start && q < b.start + b.len);
      document.querySelectorAll('#scBars .sc-bar').forEach((el) => el.classList.toggle('now', +el.dataset.i === i));
      if (ctx.currentTime > end + 0.3) return stopPreview();
      playing.raf = requestAnimationFrame(tick);
    };
    tick();
  }
  function stopPreview() {
    if (!playing) return;
    cancelAnimationFrame(playing.raf);
    playing.ctx.close();
    playing = null;
    document.querySelectorAll('#scBars .sc-bar.now').forEach((el) => el.classList.remove('now'));
    const btn = $('#scPlay');
    if (btn) btn.textContent = '▶';
  }

  /* ---------------- Sorties ---------------- */
  const midiName = () => `${(st.score.title || titleOf(st.file)).replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Partition'}.mid`;
  const bytes = () => R().toMidi(st.score, st.opts);
  function save() {
    const name = midiName();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes()], { type: 'audio/midi' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    SS.ui.toast(`« ${name} » enregistré.`);
    return name;
  }
  function importIt() {
    const b = bytes();
    const name = midiName();
    stopPreview();
    $('#scoreDialog').close('ok');
    SS.midiPanel.openWith(name, b);
  }

  function open(file) {
    const dlg = $('#scoreDialog');
    if (!dlg.open) {
      dlg.returnValue = '';
      dlg.showModal();
    }
    if (file) return takeFile(file);
    if (!dlg.dataset.ready || st.step !== 3) show(st.score ? 3 : st.step === 2 && st.pages.length ? 2 : 1);
    dlg.dataset.ready = '1';
  }

  function init() {
    const dlg = $('#scoreDialog');
    $('#scClose').addEventListener('click', () => dlg.close('cancel'));
    dlg.addEventListener('close', stopPreview);
    dlg.addEventListener('keydown', (e) => e.stopPropagation());
    $('#scBack').addEventListener('click', () => show(st.step === 3 && st.pages.length && st.by !== 'MusicXML' ? 2 : 1));
    $('#scSave').addEventListener('click', save);
    $('#scNext').addEventListener('click', () => (st.step === 3 ? importIt() : show(2)));
    dlg.addEventListener('dragover', (e) => {
      e.preventDefault();
      dlg.classList.add('sc-dragging');
    });
    dlg.addEventListener('dragleave', (e) => e.target === dlg && dlg.classList.remove('sc-dragging'));
    dlg.addEventListener('drop', (e) => {
      e.preventDefault();
      dlg.classList.remove('sc-dragging');
      takeFile(e.dataTransfer.files[0]);
    });
    const btn = $('#scoreBtn');
    if (btn) btn.addEventListener('click', () => open());
  }

  /* ---------------- Pour Claude (js/claude-tools.js) ---------------- */
  const claude = {
    etat: () => ({
      ouverte: $('#scoreDialog').open,
      fichier: st.file,
      lecteur: st.engine,
      contenu: st.kind,
      pages: onPages().length,
      page: st.step === 2 ? st.page + 1 : null,
      etape: ['', 'déposer', 'lecture', 'vérifier'][st.step],
      resultat: st.score ? { lecteur: st.by, mesures: st.score.bars.length, notes: st.score.noteCount, aVerifier: st.score.suspects, portees: st.score.parts.map((p) => p.name) } : null,
    }),
    /** Affiche une page en grand (étape « lecture ») pour que Claude la regarde. */
    page(n) {
      if (!st.pages.length) throw new Error('aucune partition image ou PDF ouverte : demande à l’utilisateur de la déposer dans la fenêtre « Lire une partition »');
      if (!$('#scoreDialog').open) open();
      if (st.engine !== 'claude') st.engine = 'claude';
      st.page = Math.max(0, Math.min(onPages().length - 1, (+n || 1) - 1));
      show(2);
      return { page: st.page + 1, pages: onPages().length };
    },
    lire(score, by = 'Claude') {
      setScore(score, by);
      return claude.etat().resultat;
    },
    open,
    importer: importIt,
    enregistrer: save,
  };

  return { init, open, claude };
})();
