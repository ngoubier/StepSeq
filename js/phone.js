/*
 * StepSeq sur téléphone (telephone.html) : l'écran.
 *
 *   Accueil     « Nouvelle chanson » et « Mes chansons » (toucher ▶ joue la chanson, ✎ reprend une chanson du téléphone)
 *   #tempo      tempo (− / ＋, curseur, « Taper ») et tonalité (12 notes, Majeur | Mineur)
 *   #musiciens  Batterie, Basse, Clavier : présents ou non, et leur son
 *   #scenes     les scènes dans l'ordre (ajouter, monter, retirer)
 *   #parties    « Qui joue quoi » : un tableau musiciens × types de scène, puis « Créer la chanson »
 *   #partie     la partie d'un musicien dans un type de scène : Ne joue pas, celle du modèle, ★ et tous les motifs ;
 *               toucher un motif le choisit et fait entendre la scène en boucle
 *
 * La recette et la chanson viennent de js/phonesong.js ; la chanson est enregistrée dans « Mes chansons » (js/store.js)
 * comme un projet ordinaire. L'écoute est toujours pré-calculée (js/prelisten.js) : un téléphone ne décroche pas.
 * Le bouton Retour du téléphone suit les écrans (une entrée d'historique par écran).
 */
(() => {
  const P = SS.phoneSong;
  const $ = (q) => document.querySelector(q);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const STEPS = ['tempo', 'musiciens', 'scenes', 'parties'];
  const SUB = ['partie']; // sous-écran (pas de point d'étape)
  const COVERS = ['var(--c-violet)', 'var(--c-cyan)', 'var(--c-amber)', 'var(--c-green)', 'var(--c-pink)', 'var(--c-orange)', 'var(--c-blue)', 'var(--c-teal)'];

  const S = {
    recipe: null, // chanson en cours de création ou de retouche
    editId: null, // chanson de « Mes chansons » retouchée (null : nouvelle)
    songs: [], // résumés de « Mes chansons » + recette du téléphone (phone)
    taps: [],
    cell: null, // { mu, sc } : la case du tableau ouverte (#partie)
    allOpen: false, // « Tous les motifs » déplié
  };
  // lecture : { id, title, proj, block, calc (pourcent ou null), ctrl, live }
  let play = null;

  /* ---------- Écrans ---------- */
  const view = () => {
    const h = location.hash.slice(1);
    if (h === 'partie') return S.recipe && S.cell ? h : 'home';
    return STEPS.includes(h) && S.recipe ? h : 'home';
  };
  function go(v) {
    if (v === view()) return render();
    history.pushState(null, '', v === 'home' ? location.pathname : '#' + v);
    render();
  }
  window.addEventListener('popstate', render);

  function render() {
    const v = view();
    if (play && play.id === DRAFT && v !== 'parties' && v !== 'partie') stopPlay(); // écoute de la chanson en cours : on la quitte
    if (v === 'home') renderHome();
    else if (v === 'tempo') renderTempo();
    else if (v === 'musiciens') renderMus();
    else if (v === 'scenes') renderScenes();
    else if (v === 'parties') renderParts();
    else renderPart();
    renderFoot();
  }

  function top(title) {
    const i = SUB.includes(view()) ? STEPS.length - 1 : STEPS.indexOf(view());
    $('#phTop').innerHTML = `<button class="ph-back" data-act="back" aria-label="Retour">‹</button><span class="ph-title">${esc(title)}</span><span class="ph-dots">${STEPS.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</span>`;
  }

  /* ---------- Accueil ---------- */
  function renderHome() {
    $('#phTop').innerHTML = '<span class="ph-logo">Step<b>Seq</b></span><span class="ph-sp"></span><a class="ph-full" href="index.html" data-act="full">Version complète</a>';
    $('#phTop').appendChild(SS.helpTip('Sur téléphone, StepSeq garde l’écoute et la création d’une chanson pas à pas. Tout le reste (Grille, Arrangement, Mix…) est dans la version complète, sur l’ordinateur.', 'StepSeq sur téléphone'));
    const list = S.songs.length
      ? S.songs.map((s, i) => {
        const on = play && play.id === s.id;
        const meta = s.phone ? `${s.phone.tempo} BPM · ${P.keyLabel(s.phone)}` : `${s.tempo} BPM · ${s.tracks} piste${s.tracks > 1 ? 's' : ''}`;
        return `<div class="ph-song${on ? ' on' : ''}"><div class="ph-cov" style="background:${COVERS[i % COVERS.length]}"></div><div><div class="t">${esc(s.title)}</div><div class="m">${esc(meta)}</div></div>${s.phone ? `<button class="ph-ic" data-act="edit" data-id="${esc(s.id)}" aria-label="Retoucher">✎</button>` : ''}<button class="ph-ic play${on ? ' on' : ''}" data-act="play" data-id="${esc(s.id)}" aria-label="${on ? 'Arrêter' : 'Écouter'}">${on ? '■' : '▶'}</button></div>`;
      }).join('')
      : '<div class="ph-empty">Aucune chanson</div>';
    $('#phBody').innerHTML = `<button class="ph-new" data-act="new"><span>＋</span>Nouvelle chanson</button><div class="ph-lbl">Mes chansons</div>${list}`;
  }

  /* ---------- Tempo et tonalité ---------- */
  function renderTempo() {
    const r = S.recipe;
    top('Tempo et tonalité');
    $('#phBody').innerHTML = `
      <div class="ph-card"><div class="ph-lbl">Tempo</div>
        <div class="ph-tempo"><button data-act="tempo" data-d="-1" aria-label="Moins vite">−</button><output id="phBpm">${r.tempo}</output><button data-act="tempo" data-d="1" aria-label="Plus vite">＋</button></div>
        <input class="ph-range" id="phTempo" type="range" min="${P.TEMPO_MIN}" max="${P.TEMPO_MAX}" value="${r.tempo}" aria-label="Tempo">
        <button class="ph-tap" data-act="tap">Taper</button></div>
      <div class="ph-card"><div class="ph-lbl">Tonalité</div>
        <div class="ph-notes">${Array.from({ length: 12 }, (_, pc) => `<button data-act="tonic" data-pc="${pc}" class="${pc === r.tonic ? 'on' : ''}">${P.tonicLabel(pc)}</button>`).join('')}</div>
        <div class="ph-seg"><button data-act="mode" data-m="major" class="${r.mode === 'major' ? 'on' : ''}">Majeur</button><button data-act="mode" data-m="minor" class="${r.mode === 'minor' ? 'on' : ''}">Mineur</button></div></div>`;
    $('#phTempo').addEventListener('input', (e) => setTempo(+e.target.value, true));
    const lbl = $('#phBody .ph-card .ph-lbl');
    lbl.appendChild(SS.helpTip('« Taper » : touche le bouton en rythme, quatre fois ou plus, pour donner le tempo au doigt.', 'Tempo'));
  }
  function setTempo(v, fromRange) {
    const t = Math.round(Math.min(P.TEMPO_MAX, Math.max(P.TEMPO_MIN, v)));
    S.recipe.tempo = t;
    $('#phBpm').textContent = t;
    if (!fromRange) $('#phTempo').value = t;
  }
  function tap() {
    const now = performance.now();
    S.taps = S.taps.filter((t) => now - t < 2500);
    S.taps.push(now);
    if (S.taps.length > 1) setTempo((60000 * (S.taps.length - 1)) / (now - S.taps[0]));
  }

  /* ---------- Musiciens ---------- */
  function renderMus() {
    const r = S.recipe;
    top('Musiciens');
    $('#phBody').innerHTML = P.MUSICIANS.map((m) => {
      const st = r.mus[m.id];
      const opts = P.sounds(m.id).map((s, i) => `<option value="${i}"${i === st.pick ? ' selected' : ''}>${esc(s.label)}</option>`).join('');
      return `<div class="ph-mus${st.on ? ' on' : ''}" style="--mc:${m.color}" data-act="mus" data-id="${m.id}"><div class="ic">${m.icon}</div><div><div class="t">${m.label}</div><select data-id="${m.id}" aria-label="Son : ${m.label}">${opts}</select></div><button class="ph-ck" data-act="mus" data-id="${m.id}" aria-label="${st.on ? 'Retirer' : 'Ajouter'} : ${m.label}">✓</button></div>`;
    }).join('');
    $('#phBody').querySelectorAll('select').forEach((sel) => sel.addEventListener('change', () => {
      const st = S.recipe.mus[sel.dataset.id];
      st.pick = +sel.value;
      st.on = true;
      renderMus();
      renderFoot();
    }));
  }

  /* ---------- Scènes ---------- */
  function renderScenes() {
    const r = S.recipe;
    top('Scènes');
    const rows = r.scenes.map((id, i) => {
      const t = P.sceneType(id);
      return `<div class="ph-sc" style="--sc:${t.color}"><div><div class="t">${t.label}</div><div class="m">${P.barsOf(id)} mesures · ${esc(P.chordsOf(r, id))}</div></div><button data-act="up" data-i="${i}" aria-label="Monter"${i ? '' : ' disabled'}>↑</button><button data-act="del" data-i="${i}" aria-label="Retirer">✕</button></div>`;
    }).join('');
    const sec = P.seconds(r);
    $('#phBody').innerHTML = `${rows || '<div class="ph-empty">Aucune scène</div>'}
      <div class="ph-adds">${P.SCENES.map((s) => `<button data-act="add" data-id="${s.id}">＋ ${s.label}</button>`).join('')}</div>
      ${r.scenes.length ? `<div class="ph-sum">${Math.floor(sec / 60)} min ${String(sec % 60).padStart(2, '0')}</div>` : ''}`;
  }

  /* ---------- Qui joue quoi ---------- */
  const musOn = () => P.MUSICIANS.filter((m) => S.recipe.mus[m.id].on);
  function renderParts() {
    const r = S.recipe;
    top('Qui joue quoi');
    const types = P.sceneTypes(r);
    const head = types.map((id) => `<span class="ph-mxh" style="--sc:${P.sceneType(id).color}">${P.sceneType(id).label}</span>`).join('');
    const rows = musOn().map((m) => `<span class="ph-mxi" aria-label="${m.label}">${m.icon}</span>` + types.map((sc) => {
      const p = P.partLabel(r, m.id, sc);
      return `<button class="ph-mxc${p.plays ? '' : ' off'}${p.id && p.id !== 'off' ? ' own' : ''}" style="--mc:${m.color}" data-act="cell" data-mu="${m.id}" data-sc="${sc}" aria-label="${m.label}, ${P.sceneType(sc).label} : ${esc(p.name)}">${p.plays ? esc(p.name) : '—'}</button>`;
    }).join('')).join('');
    $('#phBody').innerHTML = `<div class="ph-mx" style="grid-template-columns:32px repeat(${types.length},minmax(0,1fr))"><span></span>${head}${rows}</div>`;
    const lbl = document.createElement('div');
    lbl.className = 'ph-lbl';
    lbl.append('Parties', SS.helpTip('Chaque case est la partie d’un musicien dans un type de scène (les deux couplets jouent la même). Touchez une case pour la changer. En clair : la partie du modèle ; en couleur : celle que vous avez choisie.', 'Qui joue quoi'));
    $('#phBody').prepend(lbl);
  }

  /** Petit dessin d'un motif de batterie : grosse caisse, caisse claire (ou clap), charleston sur 16 pas. */
  function drumSvg(id) {
    const p = (SS.DRUM_PATTERNS.pop || []).find((x) => x.id === id);
    if (!p) return '';
    const L = p.lanes;
    const rows = [[L.H || L.O || '', 3], [L.S || L.C || '', 13], [L.K || '', 23]];
    const rects = rows.flatMap(([lane, y]) => [...lane].map((c, i) => (c === '-' ? '' : `<rect x="${i * 10 + 1}" y="${y}" width="8" height="7" rx="1.5" fill="currentColor" opacity="${c === 'x' ? 1 : c === 'o' ? 0.7 : 0.4}"/>`))).join('');
    return `<svg viewBox="0 0 160 34" preserveAspectRatio="none" aria-hidden="true">${rects}</svg>`;
  }
  function motifSvg(mu, id) {
    try {
      if (mu === 'drums') return drumSvg(id);
      if (mu === 'bass') return SS.bassMotifs.svg(id, 16);
      return SS.keyboardist.svg(id);
    } catch (e) {
      return '';
    }
  }
  function renderPart() {
    const r = S.recipe;
    const { mu, sc } = S.cell;
    const m = P.MUSICIANS.find((x) => x.id === mu);
    top(`${m.label} · ${P.sceneType(sc).label}`);
    const cur = P.partLabel(r, mu, sc).id; // motif, 'off' ou null (le modèle)
    const stars = P.stars(mu, sc);
    const plan = P.planPart(mu, sc);
    const row = (id, name, { star = false, svg = '' } = {}) =>
      `<button class="ph-mo${cur === id ? ' on' : ''}" data-act="motif" data-id="${id === null ? '' : esc(id)}">${svg ? `<span class="ph-mosvg">${svg}</span>` : ''}<span class="t">${esc(name)}</span>${star ? '<span class="ph-star">★</span>' : ''}</button>`;
    const all = P.motifs(mu).filter((id) => !stars.includes(id));
    $('#phBody').innerHTML = [
      row('off', 'Ne joue pas'),
      plan.id ? row(null, `Modèle : ${plan.name}`, { svg: plan.id && mu !== 'drums' ? motifSvg(mu, plan.id) : '' }) : '',
      stars.length ? '<div class="ph-lbl">★ Pour cette scène</div>' : '',
      ...stars.map((id) => row(id, P.motifName(mu, id), { star: true, svg: motifSvg(mu, id) })),
      S.allOpen ? `<div class="ph-lbl">Tous les motifs (${all.length})</div>` : `<button class="ph-more" data-act="more">Tous les motifs (${all.length})</button>`,
      ...(S.allOpen ? all.map((id) => row(id, P.motifName(mu, id), { svg: motifSvg(mu, id) })) : []),
    ].join('');
  }

  /* ---------- Bas d'écran ---------- */
  function renderFoot() {
    const v = view();
    if (v === 'tempo' || v === 'musiciens') {
      const none = v === 'musiciens' && !P.MUSICIANS.some((m) => S.recipe.mus[m.id].on);
      $('#phFoot').innerHTML = `<button class="ph-next" data-act="next"${none ? ' disabled' : ''}>Suivant</button>`;
    } else if (v === 'scenes') {
      $('#phFoot').innerHTML = `<button class="ph-next" data-act="next"${S.recipe.scenes.length ? '' : ' disabled'}>Suivant</button>`;
    } else if (v === 'parties') {
      const on = play && play.id === DRAFT;
      $('#phFoot').innerHTML = `<div class="ph-row"><button class="ph-ic play${on ? ' on' : ''}" data-act="draft" aria-label="${on ? 'Arrêter' : 'Écouter la chanson'}">${on ? '■' : '▶'}</button><button class="ph-next" data-act="create">${S.editId ? 'Mettre à jour la chanson' : 'Créer la chanson'}</button></div>${on ? playerMeta() : ''}`;
    } else renderPlayer();
  }
  /** Écoute de la chanson en cours de création (pas encore enregistrée). */
  const DRAFT = '__draft';
  function playerMeta() {
    if (!play || !play.proj) return play && play.calc != null ? `<div class="ph-meta">Calcul de l’écoute… ${play.calc} %</div>` : '';
    const proj = play.proj;
    const blk = play.scene ? null : proj.song[play.block];
    const sc = play.scene ? proj.scenes.find((x) => x.id === play.scene) : blk && proj.scenes.find((x) => x.id === blk.scene);
    const txt = play.calc != null ? `Calcul de l’écoute… ${play.calc} %` : sc ? (play.scene ? `${sc.name} en boucle` : sc.name) : '';
    return `<div class="ph-meta">${esc(txt)}</div>`;
  }
  function renderPlayer() {
    const v = view();
    if (v === 'parties') return renderFoot();
    if (v === 'partie') {
      const on = !!play;
      $('#phFoot').innerHTML = `<div class="ph-player"><button class="ph-ic play${on ? ' on' : ''}" data-act="${on ? 'stop' : 'loop'}" aria-label="${on ? 'Arrêter' : 'Écouter la scène'}">${on ? '■' : '▶'}</button><div><div class="t">${esc(P.sceneType(S.cell.sc).label)} en boucle</div>${on && play.calc != null ? `<div class="ph-meta">Calcul de l’écoute… ${play.calc} %</div>` : ''}</div></div>`;
      return;
    }
    if (STEPS.includes(v)) return;
    if (!play) return void ($('#phFoot').innerHTML = '');
    const proj = play.proj;
    const blk = proj && proj.song[play.block];
    const sc = blk && proj.scenes.find((x) => x.id === blk.scene);
    const meta = play.calc != null ? `Calcul de l’écoute… ${play.calc} %` : play.live ? 'Lecture en direct' : sc ? sc.name : '';
    const frise = proj ? proj.song.map((b, i) => `<i style="flex:${(proj.scenes.find((x) => x.id === b.scene) || { bars: 1 }).bars * b.repeat}" class="${i === play.block ? 'on' : i < play.block ? 'done' : ''}"></i>`).join('') : '';
    $('#phFoot').innerHTML = `<div class="ph-player"><button class="ph-ic play on" data-act="stop" aria-label="Arrêter">■</button><div><div class="t">${esc(play.title)}</div><div class="m">${esc(meta)}</div><div class="ph-frise">${frise}</div></div></div>`;
  }

  /* ---------- Mes chansons ---------- */
  async function loadSongs() {
    try {
      const list = await SS.store.list();
      S.songs = await Promise.all(list.map(async (s) => ({ ...s, phone: await recipeOf(s.id) })));
    } catch (e) {
      S.songs = [];
    }
    if (view() === 'home') renderHome();
  }
  /** Recette du téléphone rangée dans une chanson (null : chanson faite sur l'ordinateur, ou retouchée depuis). */
  async function recipeOf(id) {
    try {
      const data = JSON.parse(await SS.store.get(id));
      return P.clean(data && data.phone);
    } catch (e) {
      return null;
    }
  }

  async function create() {
    const r = S.recipe;
    const old = S.editId ? S.songs.find((s) => s.id === S.editId) : null;
    const title = old ? old.title : SS.songName.invent(S.songs.map((s) => s.title));
    const proj = P.build(r, old ? { id: old.id, title } : { id: SS.uid(), title });
    if (!proj) return;
    try {
      if (old) await SS.store.keepVersion(old.id);
      await SS.store.put(proj, SS.serialize(proj));
    } catch (e) {
      console.warn('enregistrement', e);
    }
    stopPlay();
    S.recipe = null;
    S.editId = null;
    S.cell = null;
    history.go(-STEPS.length); // une entrée par étape : retour à l'accueil
    await loadSongs();
    startPlay(proj.id, proj);
  }

  /* ---------- Écoute ---------- */
  function stopPlay() {
    if (!play) return;
    if (play.ctrl) play.ctrl.abort();
    SS.audio.stop();
    play = null;
    render();
  }
  async function startPlay(id, built = null, scene = null) {
    stopPlay();
    const s = S.songs.find((x) => x.id === id);
    const me = (play = { id, title: s ? s.title : (built && built.title) || '', proj: null, block: 0, scene, calc: 0, ctrl: new AbortController(), live: false });
    SS.audio.ensureCtx(); // dans le geste de l'utilisateur
    render();
    let proj = built;
    if (!proj) {
      try {
        proj = SS.normalizeProject(JSON.parse(await SS.store.get(id)));
      } catch (e) {
        console.warn('lecture', e);
      }
    }
    if (play !== me) return;
    if (!proj || !proj.song || !proj.song.length) return stopPlay();
    proj.playMode = 'song';
    SS.loadScene(proj, scene || proj.song[0].scene, { commit: false });
    me.proj = proj;
    renderPlayer();
    const opts = scene ? {} : {
      song: {
        index: 0,
        onBlock: (i) => {
          const b = proj.song[i];
          if (b && b.scene !== proj.current) SS.loadScene(proj, b.scene, { commit: false });
        },
        onBlockVisible: (i) => {
          if (play !== me) return;
          me.block = i;
          renderPlayer();
        },
        onEnd: () => play === me && stopPlay(),
      },
    };
    let started = false;
    const begin = (backing) => {
      if (started || play !== me || me.ctrl.signal.aborted) return;
      started = true;
      me.calc = null;
      SS.audio.start(() => proj, () => {}, backing ? { ...opts, backing } : opts);
      renderPlayer();
    };
    SS.preListen.render(proj, scene ? 'scene' : 'song', 0, {
      signal: me.ctrl.signal,
      ready: begin,
      onProgress: (pc) => {
        if (play !== me || started) return;
        me.calc = pc;
        renderPlayer();
      },
    }).then(begin, (e) => {
      if (me.ctrl.signal.aborted || play !== me || started) return;
      console.warn('écoute pré-calculée', e);
      me.live = true; // calcul impossible : lecture en direct
      begin(null);
    });
  }

  /** Écoute la chanson en cours de création, en entier ou une scène en boucle (sceneType : type de scène). */
  function playDraft(sceneType) {
    const proj = P.build(S.recipe, { id: 'telephone', title: 'Écoute' });
    if (!proj) return;
    const sc = sceneType ? proj.scenes.find((x) => x.sec === sceneType) : null;
    startPlay(DRAFT, proj, sc ? sc.id : null);
  }

  /* ---------- Gestes ---------- */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || e.target.closest('select')) return;
    const act = b.dataset.act;
    const r = S.recipe;
    if (act === 'full') {
      try {
        sessionStorage.setItem('ss.full', '1'); // la version complète, pour cette session
      } catch (err) {
        /* stockage indisponible : index.html renverra ici */
      }
      return;
    }
    if (act === 'back') return history.back();
    if (act === 'new') {
      S.recipe = P.fresh();
      S.editId = null;
      return go('tempo');
    }
    if (act === 'edit') {
      const s = S.songs.find((x) => x.id === b.dataset.id);
      if (!s || !s.phone) return;
      S.recipe = JSON.parse(JSON.stringify(s.phone));
      S.editId = s.id;
      return go('tempo');
    }
    if (act === 'play') return play && play.id === b.dataset.id ? stopPlay() : startPlay(b.dataset.id);
    if (act === 'stop') return stopPlay();
    if (act === 'tempo') return setTempo(r.tempo + +b.dataset.d);
    if (act === 'tap') return tap();
    if (act === 'tonic') {
      r.tonic = +b.dataset.pc;
      return renderTempo();
    }
    if (act === 'mode') {
      r.mode = b.dataset.m;
      return renderTempo();
    }
    if (act === 'mus') {
      const st = r.mus[b.dataset.id];
      st.on = !st.on;
      renderMus();
      return renderFoot();
    }
    if (act === 'next') return go(STEPS[STEPS.indexOf(view()) + 1]);
    if (act === 'cell') {
      S.cell = { mu: b.dataset.mu, sc: b.dataset.sc };
      S.allOpen = false;
      return go('partie');
    }
    if (act === 'more') {
      S.allOpen = true;
      return renderPart();
    }
    if (act === 'motif') {
      P.setPart(r, S.cell.mu, S.cell.sc, b.dataset.id || null);
      renderPart();
      return playDraft(S.cell.sc); // la scène en boucle avec ce motif
    }
    if (act === 'loop') return playDraft(S.cell.sc);
    if (act === 'draft') return play && play.id === DRAFT ? stopPlay() : playDraft(null);
    if (act === 'add') r.scenes.push(b.dataset.id);
    else if (act === 'del') r.scenes.splice(+b.dataset.i, 1);
    else if (act === 'up') {
      const i = +b.dataset.i;
      [r.scenes[i - 1], r.scenes[i]] = [r.scenes[i], r.scenes[i - 1]];
    } else if (act === 'create') return void create();
    else return;
    renderScenes();
    renderFoot();
  });

  // un écran de création ouvert sans chanson en cours (rechargement de la page) : retour à l'accueil
  if (location.hash && view() === 'home') history.replaceState(null, '', location.pathname);
  render();
  loadSongs();
})();
