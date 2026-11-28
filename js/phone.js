/*
 * StepSeq sur téléphone (telephone.html) : l'écran.
 *
 *   Accueil     « Nouvelle chanson » et « Mes chansons » : toucher une chanson la sélectionne ; la barre du bas agit sur
 *               elle : Écouter (▶ / ■), Exporter (⇪ vers l'ordinateur : partage du téléphone, sinon téléchargement du
 *               fichier .stepseq.json), Modifier (✎ : une chanson du téléphone, ou de l'assistant que le téléphone sait
 *               refaire, après un avertissement : son mix est refait), Supprimer (après confirmation)
 *   #tempo      tempo (− / ＋, curseur, « Taper ») et tonalité (12 notes, Majeur | Mineur)
 *   #musiciens  Batterie, Basse, Clavier : présents ou non, et leur son
 *   #scenes     les scènes dans l'ordre (ajouter, monter, retirer)
 *   #parties    « Qui joue quoi » : un tableau musiciens × types de scène, puis « Créer la chanson »
 *   #partie     la partie d'un musicien dans un type de scène, en trois onglets :
 *               Motifs  Ne joue pas, celle du modèle, ★ et tous les motifs ; toucher un motif le choisit et fait entendre
 *                       la scène en boucle
 *               Pas     la partie en une mesure de 16 pas (deux pages de 8) : batterie par instrument, basse par note de
 *                       l'accord, clavier main droite / main gauche ; toucher un pas le pose ou l'enlève
 *               Jouer   de grands pads qui sonnent au doigt ; ● enregistre ce qu'on joue pendant la boucle de la scène
 *
 * La recette et la chanson viennent de js/phonesong.js ; la chanson est enregistrée dans « Mes chansons » (js/store.js)
 * comme un projet ordinaire. L'écoute est toujours pré-calculée (js/prelisten.js), à fréquence réduite (RATE : moitié
 * moins de calcul), et jouée par le lecteur léger (js/phoneplayer.js) : le moteur complet (js/audio.js) ne sert qu'aux
 * pads, et se met en veille quand on ne les touche plus.
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
    sel: null, // chanson sélectionnée dans « Mes chansons » (id)
    songs: [], // résumés de « Mes chansons » + recette du téléphone (phone) ou chanson de l'assistant compatible (edit)
    taps: [],
    cell: null, // { mu, sc } : la case du tableau ouverte (#partie)
    allOpen: false, // « Tous les motifs » déplié
    tab: 'motifs', // onglet de #partie : motifs | pas | jouer
    page: 0, // page de l'écran Pas : 0 (pas 1–8) ou 1 (pas 9–16)
    rec: false, // ● Jouer : enregistrement en cours
    recDirty: false, // des notes ont été enregistrées depuis le début de la boucle
    padProj: null, // chanson qui donne le son des pads quand rien ne joue
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
    if (v !== 'partie') S.rec = false;
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
    if (!S.songs.some((s) => s.id === S.sel)) S.sel = S.songs.length ? S.songs[0].id : null;
    const list = S.songs.length
      ? S.songs.map((s, i) => {
        const meta = s.phone ? `${s.phone.tempo} BPM · ${P.keyLabel(s.phone)}` : `${s.tempo} BPM · ${s.tracks} piste${s.tracks > 1 ? 's' : ''}`;
        const playing = play && play.id === s.id;
        return `<button class="ph-song${s.id === S.sel ? ' on' : ''}" data-act="sel" data-id="${esc(s.id)}" aria-pressed="${s.id === S.sel}"><span class="ph-cov" style="background:${COVERS[i % COVERS.length]}"></span><span class="ph-sx"><span class="t">${esc(s.title)}</span><span class="m">${playing ? '♪ ' : ''}${esc(meta)}</span></span></button>`;
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
      const ed = p.plays && !!P.editOf(r, m.id, sc); // partie retouchée (Pas, Jouer)
      return `<button class="ph-mxc${p.plays ? '' : ' off'}${(p.id && p.id !== 'off') || ed ? ' own' : ''}" style="--mc:${m.color}" data-act="cell" data-mu="${m.id}" data-sc="${sc}" aria-label="${m.label}, ${P.sceneType(sc).label} : ${esc(p.name)}${ed ? ' retouchée' : ''}">${p.plays ? esc(p.name) + (ed ? ' ✎' : '') : '—'}</button>`;
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
    const { mu, sc } = S.cell;
    const m = P.MUSICIANS.find((x) => x.id === mu);
    top(`${m.label} · ${P.sceneType(sc).label}`);
    const tabs = [['motifs', 'Motifs'], ['pas', 'Pas'], ['jouer', 'Jouer']].map(([id, l]) => `<button data-act="tab" data-tab="${id}" class="${S.tab === id ? 'on' : ''}">${l}</button>`).join('');
    const body = S.tab === 'pas' ? pasHtml(m) : S.tab === 'jouer' ? jouerHtml(m) : motifsHtml();
    $('#phBody').innerHTML = `<div class="ph-tabrow"><div class="ph-seg ph-tabs">${tabs}</div><span id="phTip"></span></div>${body}`;
    const tip = S.tab === 'pas'
      ? (mu === 'bass' ? 'Une mesure de 16 pas, qui se répète sur toute la scène. Les lignes suivent l’accord en cours : « Fondamentale » joue la note de l’accord, « Quinte » sa quinte… Une note tient jusqu’à la suivante.' : mu === 'keys' ? 'Une mesure de 16 pas, qui se répète sur toute la scène. « Accord » : la main droite joue l’accord en cours ; « Basse » : la main gauche joue sa fondamentale. Un accord tient jusqu’au suivant.' : 'Une mesure de 16 pas, qui se répète sur toute la scène. Touchez un pas pour poser ou enlever un coup.')
      : S.tab === 'jouer' ? 'Touchez les pads pour jouer. Avec ● la scène tourne en boucle et ce que vous jouez est posé sur le pas le plus proche ; touchez ● encore pour arrêter et entendre le résultat.' : '';
    if (tip) $('#phTip').appendChild(SS.helpTip(tip, S.tab === 'pas' ? 'Pas' : 'Jouer'));
    nowLoop();
  }
  function motifsHtml() {
    const r = S.recipe;
    const { mu, sc } = S.cell;
    const edited = !!P.editOf(r, mu, sc) && P.partLabel(r, mu, sc).plays;
    const cur = edited ? '__edit' : P.partLabel(r, mu, sc).id; // motif, 'off' ou null (le modèle)
    const stars = P.stars(mu, sc);
    const plan = P.planPart(mu, sc);
    const row = (id, name, { star = false, svg = '' } = {}) =>
      `<button class="ph-mo${cur === id ? ' on' : ''}" data-act="motif" data-id="${id === null ? '' : esc(id)}">${svg ? `<span class="ph-mosvg">${svg}</span>` : ''}<span class="t">${esc(name)}</span>${star ? '<span class="ph-star">★</span>' : ''}</button>`;
    const all = P.motifs(mu).filter((id) => !stars.includes(id));
    return [
      edited ? `<button class="ph-mo on" data-act="tab" data-tab="pas"><span class="t">✎ Ma version (${esc(P.partLabel(r, mu, sc).name)} retouché)</span></button>` : '',
      row('off', 'Ne joue pas'),
      plan.id ? row(null, `Modèle : ${plan.name}`, { svg: plan.id && mu !== 'drums' ? motifSvg(mu, plan.id) : '' }) : '',
      stars.length ? '<div class="ph-lbl">★ Pour cette scène</div>' : '',
      ...stars.map((id) => row(id, P.motifName(mu, id), { star: true, svg: motifSvg(mu, id) })),
      S.allOpen ? `<div class="ph-lbl">Tous les motifs (${all.length})</div>` : `<button class="ph-more" data-act="more">Tous les motifs (${all.length})</button>`,
      ...(S.allOpen ? all.map((id) => row(id, P.motifName(mu, id), { svg: motifSvg(mu, id) })) : []),
    ].join('');
  }

  /* ---------- Pas : la partie en 16 pas ---------- */
  /** Partie à retoucher : celle déjà retouchée, sinon ce que joue le motif choisi (une mesure). */
  const cellEdit = () => P.startEdit(S.recipe, S.cell.mu, S.cell.sc);
  /** Lignes de l'écran Pas : { id, name, on(pas) → '' | 'on' | 'hold' | 'soft', txt(pas) }. */
  function pasRows(mu, e) {
    if (mu === 'drums') {
      return P.DRUM_LANES.map(([k, , name]) => ({ id: k, name, cls: (i) => (e[k][i] === '-' ? '' : e[k][i] === 'x' ? 'on' : 'on soft'), txt: () => '' }));
    }
    if (mu === 'bass') {
      const rows = [...P.BASS_ROWS];
      e.forEach((n) => !rows.includes(n[2]) && rows.push(n[2])); // une ligne du motif d'origine (approche, sixte…) reste visible
      return rows.map((v) => ({
        id: String(v),
        name: P.rowName(v),
        cls: (i) => {
          const n = e.find((x) => i >= x[0] && i < x[0] + x[1]);
          return !n || n[2] !== v ? '' : n[0] === i ? 'on' : 'hold';
        },
        txt: () => '',
      }));
    }
    const hand = (lh) => (i) => (e[i] ? e[i].split('+').filter((t) => P.isLH(t) === lh).join('+') : '');
    return [['rh', 'Accord', false], ['lh', 'Basse', true]].map(([id, name, lh]) => ({ id, name, cls: (i) => (hand(lh)(i) ? 'on' : ''), txt: hand(lh) }));
  }
  function pasHtml(m) {
    const e = cellEdit();
    const from = S.page * 8;
    const cols = Array.from({ length: 8 }, (_, k) => from + k);
    const head = cols.map((i) => `<span class="ph-pash${i % 4 === 0 ? ' beat' : ''}" data-col="${i}">${i % 4 === 0 ? i / 4 + 1 : '·'}</span>`).join('');
    const rows = pasRows(m.id, e).map((row) => `<span class="ph-pasl">${esc(row.name)}</span>` + cols.map((i) => {
      const c = row.cls(i);
      return `<button class="ph-pc ${c}${i % 4 === 0 ? ' beat' : ''}" data-act="pas" data-row="${esc(row.id)}" data-i="${i}" data-col="${i}" aria-label="${esc(row.name)}, pas ${i + 1}${c.startsWith('on') ? ' (posé)' : ''}">${esc(row.txt(i))}</button>`;
    }).join('')).join('');
    const edited = !!P.editOf(S.recipe, m.id, S.cell.sc);
    return `<div class="ph-seg ph-pages"><button data-act="page" data-p="0" class="${S.page ? '' : 'on'}">Pas 1–8</button><button data-act="page" data-p="1" class="${S.page ? 'on' : ''}">Pas 9–16</button></div>
      <div class="ph-pas" style="--mc:${m.color}"><span></span>${head}${rows}</div>
      <div class="ph-row"><button class="ph-more" data-act="clear">Effacer</button>${edited ? '<button class="ph-more" data-act="reset">Revenir au motif</button>' : ''}</div>`;
  }
  /** Range la partie retouchée ; la boucle reprend avec elle un peu plus tard (plusieurs pas posés d'affilée : un seul calcul). */
  let relTimer = null;
  function saveEdit(v, { relaunch = true } = {}) {
    const r = S.recipe;
    const { mu, sc } = S.cell;
    if (P.partLabel(r, mu, sc).id === 'off') P.setPart(r, mu, sc, null); // retoucher une partie muette : le musicien rejoue
    P.setEdit(r, mu, sc, v);
    S.padProj = null;
    if (!relaunch) return;
    clearTimeout(relTimer);
    relTimer = setTimeout(() => play && play.id === DRAFT && !S.rec && playDraft(S.cell.sc), 900);
  }
  function tapPas(rowId, i) {
    const { mu } = S.cell;
    const e = cellEdit();
    if (mu === 'drums') {
      const lane = e[rowId];
      e[rowId] = lane.slice(0, i) + (lane[i] === '-' ? 'x' : '-') + lane.slice(i + 1);
      saveEdit(e);
      previewPad(rowId);
    } else if (mu === 'bass') {
      const row = /^-?\d+$/.test(rowId) ? +rowId : rowId;
      const was = e.find((n) => n[0] === i && n[2] === row);
      saveEdit(P.toggleBass(e, i, row));
      if (!was) previewPad(row, i);
    } else {
      saveEdit(P.keysPat(P.toggleKeys(e, i, rowId)));
      if (!(e[i] || '').split('+').some((t) => t && P.isLH(t) === (rowId === 'lh'))) previewPad(rowId === 'lh' ? 'B' : 'C', i);
    }
  }

  /* ---------- Jouer : des pads au doigt ---------- */
  const PADS = {
    drums: P.DRUM_LANES.map(([k, , name]) => [k, name]),
    bass: P.BASS_ROWS.map((v) => [String(v), P.rowName(v)]),
    keys: [['C', 'Accord'], ['c', 'Accord court'], ['B', 'Basse'], ['O', 'Octave']],
  };
  function jouerHtml(m) {
    const chord = curChord();
    const head = m.id === 'drums' ? '' : `<div class="ph-chord">Accord : <b id="phChord">${esc(chord ? chord.name : '')}</b></div>`;
    return `${head}<div class="ph-pads ${m.id}" style="--mc:${m.color}">${PADS[m.id].map(([id, name]) => `<button class="ph-pad" data-pad="${esc(id)}">${esc(name)}</button>`).join('')}</div>
      <div class="ph-row"><button class="ph-rec${S.rec ? ' on' : ''}" data-act="rec" aria-label="${S.rec ? 'Arrêter l’enregistrement' : 'Enregistrer'}">●</button><button class="ph-more" data-act="clear">Effacer</button></div>`;
  }
  /** Pas de la scène qu'on entend (depuis son début, en boucle), ou null si rien ne joue. */
  function heardStep() {
    if (!play || play.id !== DRAFT || play.calc != null) return null;
    const ps = play.live ? null : player().pos();
    const st = play.live ? (SS.audio.isPlaying() ? SS.audio.stepAt(SS.audio.heardTime()) : null) : ps && ps.step;
    if (st == null || !play.proj) return null;
    const sc = play.proj.scenes.find((x) => x.id === play.scene);
    const len = (sc ? sc.bars : 4) * P.STEPS;
    return ((st % len) + len) % len;
  }
  /** Accord en cours : celui qu'on entend, sinon le premier de la scène. */
  function curChord() {
    const st = heardStep();
    return P.chordAt(S.recipe, S.cell.sc, st == null ? 0 : Math.floor(st));
  }
  /** Chanson qui donne le son des pads : celle qu'on écoute, sinon une construite pour l'occasion (sons préchargés). */
  function padTracks() {
    let proj = play && play.id === DRAFT && play.proj;
    if (!proj) {
      if (!S.padProj) {
        S.padProj = P.build({ ...S.recipe, scenes: [S.cell.sc] });
        if (S.padProj) S.padProj.tracks.forEach((t) => SS.audio.prepareTrack(t).catch(() => {}));
        quietLater();
      }
      proj = S.padProj;
    }
    return proj ? proj.tracks : [];
  }
  const DRUM_SND = Object.fromEntries(P.DRUM_LANES.map(([k, snd]) => [k, snd]));
  /** Fait entendre un pad : un coup de batterie, une note de basse ou un accord du clavier sur l'accord du pas. */
  function previewPad(id, step = null) {
    const { mu, sc } = S.cell;
    const tracks = padTracks();
    SS.audio.ensureCtx(); // réveille le moteur s'il était en veille
    quietLater();
    if (mu === 'drums') {
      const t = tracks.find((x) => x.type === 'drum' && x.band && x.band.key === 'drums:' + DRUM_SND[id]);
      return t && SS.audio.preview(t, null);
    }
    const chord = step == null ? curChord() : P.chordAt(S.recipe, sc, step);
    if (!chord) return;
    const t = tracks.find((x) => x.band && x.band.key === mu);
    if (!t) return;
    if (mu === 'bass') return SS.audio.preview(t, 36 + chord.rootPc + P.rowSemis(typeof id === 'string' && /^-?\d+$/.test(id) ? +id : id, chord), 0.4);
    const third = P.rowSemis('t', chord);
    const root = chord.rootPc;
    const notes = id === 'B' ? [48 + root] : id === 'O' ? [36 + root, 48 + root] : [60 + root, 60 + root + third, 60 + root + 7].map((n) => (n > 72 ? n - 12 : n));
    return SS.audio.preview(t, notes, id === 'c' ? 0.18 : 0.7);
  }
  /** Le moteur complet (pads) se met en veille 4 s après le dernier pad : il ne calcule plus rien pendant l'écoute. */
  let quietTimer = null;
  function quietLater() {
    clearTimeout(quietTimer);
    quietTimer = setTimeout(() => {
      if (play && play.live) return; // lecture en direct : c'est lui qui joue
      const c = SS.audio.ensureCtx();
      if (c.state === 'running') c.suspend();
    }, 4000);
  }
  /** Pad touché : il sonne, et avec ● il est posé sur le pas le plus proche de ce qu'on entend. */
  function hitPad(id, el) {
    el.classList.add('hit');
    setTimeout(() => el.classList.remove('hit'), 120);
    previewPad(id);
    if (!S.rec) return;
    const st = heardStep();
    if (st == null) return;
    const i = Math.round(st) % P.STEPS;
    const { mu } = S.cell;
    const e = cellEdit();
    if (mu === 'drums') e[id] = e[id].slice(0, i) + 'x' + e[id].slice(i + 1);
    const v = mu === 'drums' ? e : mu === 'bass' ? P.toggleBass(e, i, /^-?\d+$/.test(id) ? +id : id, { keep: true }) : P.keysPat(P.toggleKeys(e, i, P.isLH(id) ? 'lh' : 'rh', { tok: id, keep: true }));
    saveEdit(v, { relaunch: false });
    S.recDirty = true;
  }
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-pad]');
    if (!b || view() !== 'partie') return;
    e.preventDefault();
    hitPad(b.dataset.pad, b);
  });

  /** Le pas qu'on entend s'éclaire (écran Pas) ; l'accord en cours s'affiche (écran Jouer). */
  let nowRaf = 0;
  function nowLoop() {
    cancelAnimationFrame(nowRaf);
    if (view() !== 'partie' || S.tab === 'motifs') return;
    let last = -1;
    let lastChord = '';
    const tick = () => {
      if (view() !== 'partie' || S.tab === 'motifs') return;
      const st = heardStep();
      const i = st == null ? -1 : Math.floor(st) % P.STEPS;
      if (i !== last) {
        document.querySelectorAll('#phBody [data-col].now').forEach((x) => x.classList.remove('now'));
        if (i >= 0) document.querySelectorAll(`#phBody [data-col="${i}"]`).forEach((x) => x.classList.add('now'));
        last = i;
      }
      const ch = $('#phChord');
      if (ch) {
        const c = curChord();
        const n = c ? c.name : '';
        if (n !== lastChord) ch.textContent = lastChord = n;
      }
      nowRaf = requestAnimationFrame(tick);
    };
    nowRaf = requestAnimationFrame(tick);
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
    $('#phFoot').innerHTML = (play ? playerLine() : '') + actionBar();
  }
  /** Chanson en cours d'écoute : titre, scène (ou calcul), frise des blocs. */
  function playerLine() {
    const proj = play.proj;
    const blk = proj && proj.song[play.block];
    const sc = blk && proj.scenes.find((x) => x.id === blk.scene);
    const meta = play.calc != null ? `Calcul de l’écoute… ${play.calc} %` : play.live ? 'Lecture en direct' : sc ? sc.name : '';
    const frise = proj ? proj.song.map((b, i) => `<i style="flex:${(proj.scenes.find((x) => x.id === b.scene) || { bars: 1 }).bars * b.repeat}" class="${i === play.block ? 'on' : i < play.block ? 'done' : ''}"></i>`).join('') : '';
    return `<div class="ph-player ph-now"><div><div class="t">${esc(play.title)}</div><div class="m">${esc(meta)}</div><div class="ph-frise">${frise}</div></div></div>`;
  }
  /** Barre du bas de l'accueil : les quatre actions sur la chanson sélectionnée. */
  function actionBar() {
    const s = S.songs.find((x) => x.id === S.sel);
    if (!s) return '';
    const on = play && play.id === s.id;
    const b = (act, ic, label, { cls = '', off = false } = {}) => `<button class="ph-act ${cls}" data-act="${act}" data-id="${esc(s.id)}"${off ? ' disabled' : ''}><b>${ic}</b>${label}</button>`;
    return `<div class="ph-acts">${b('play', on ? '■' : '▶', on ? 'Arrêter' : 'Écouter', { cls: 'play' })}${b('send', '⇪', 'Exporter')}${b('edit', '✎', 'Modifier', { off: !s.edit })}${b('del', '🗑', 'Supprimer', { cls: 'del' })}</div>`;
  }

  /* ---------- Mes chansons ---------- */
  async function loadSongs() {
    try {
      const list = await SS.store.list();
      S.songs = await Promise.all(list.map(async (s) => {
        const edit = await recipeOf(s.id);
        return { ...s, edit, phone: edit && edit.phone ? edit.recipe : null };
      }));
    } catch (e) {
      S.songs = [];
    }
    if (view() === 'home') {
      renderHome();
      renderFoot();
    }
  }
  /** Recette d'une chanson pour la modifier ici ({ recipe, phone }), null si le téléphone ne sait pas la refaire. */
  async function recipeOf(id) {
    try {
      return P.fromProject(JSON.parse(await SS.store.get(id)));
    } catch (e) {
      return null;
    }
  }

  /** Avertissement avant de modifier une chanson faite sur l'ordinateur : ce qui est gardé, ce qui est refait. */
  function editSheet(s) {
    closeSheet();
    const el = document.createElement('div');
    el.className = 'ph-veil';
    el.innerHTML = `<div class="ph-sheet" role="dialog" aria-label="Modifier sur le téléphone"><h3>Modifier « ${esc(s.title)} » sur le téléphone</h3>
      <div class="ph-keep"><div>Tempo, tonalité, scènes</div><div>Batterie, basse, clavier et leurs motifs</div></div>
      <div class="ph-lose"><div>Mix, effets et réglages fins faits sur l’ordinateur : refaits par le téléphone</div></div>
      <div class="ph-meta">L’ancienne version reste dans les versions de la chanson.</div>
      <button class="ph-next" data-act="editok" data-id="${esc(s.id)}">Modifier</button><button class="ph-more" data-act="sheetno">Annuler</button></div>`;
    el.addEventListener('click', (e) => e.target === el && closeSheet());
    document.body.appendChild(el);
  }
  /** Confirmation avant de supprimer une chanson (et ses versions) de ce téléphone. */
  function delSheet(s) {
    closeSheet();
    const el = document.createElement('div');
    el.className = 'ph-veil';
    el.innerHTML = `<div class="ph-sheet" role="dialog" aria-label="Supprimer"><h3>Supprimer « ${esc(s.title)} » ?</h3>
      <div class="ph-meta">Elle disparaît de ce téléphone, avec ses versions. Exportez-la d’abord pour la garder.</div>
      <button class="ph-next ph-danger" data-act="delok" data-id="${esc(s.id)}">Supprimer</button><button class="ph-more" data-act="sheetno">Annuler</button></div>`;
    el.addEventListener('click', (e) => e.target === el && closeSheet());
    document.body.appendChild(el);
  }
  async function remove(id) {
    closeSheet();
    if (play && play.id === id) stopPlay();
    try {
      await SS.store.remove(id);
    } catch (e) {
      console.warn('suppression', e);
    }
    const i = S.songs.findIndex((x) => x.id === id);
    if (S.sel === id) S.sel = (S.songs[i + 1] || S.songs[i - 1] || {}).id || null; // la voisine est sélectionnée
    await loadSongs();
    renderFoot();
  }
  function closeSheet() {
    document.querySelectorAll('.ph-veil').forEach((x) => x.remove());
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
    S.sel = proj.id; // la chanson créée est sélectionnée (après la liste : sinon la première l'est)
    startPlay(proj.id, proj);
  }

  /**
   * Envoie une chanson vers l'ordinateur : le fichier du projet (.stepseq.json), que l'ordinateur ouvre par « Ouvrir un
   * fichier… ». Le téléphone propose ses moyens habituels (mail, Drive, Bluetooth…) ; sans partage de fichier, il est téléchargé.
   */
  async function send(id) {
    const s = S.songs.find((x) => x.id === id);
    let text = null;
    try {
      text = await SS.store.get(id);
    } catch (e) {
      console.warn('envoi', e);
    }
    if (!s || !text) return;
    const name = SS.fileName({ title: s.title });
    const file = new File([text], name, { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) return await navigator.share({ files: [file], title: s.title });
    } catch (e) {
      if (e.name === 'AbortError') return; // partage annulé
      console.warn('partage indisponible, téléchargement', e);
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); // comme « Enregistrer » sur l'ordinateur (js/project.js)
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- Écoute ---------- */
  const RATE = 24000; // fréquence du rendu de l'écoute : moitié moins de calcul qu'à 48 kHz (aigus jusqu'à 12 kHz)
  let pl = null;
  const player = () => pl || (pl = SS.phonePlayer.create());
  function stopPlay() {
    S.rec = false;
    if (!play) return;
    if (play.ctrl) play.ctrl.abort();
    player().stop();
    if (play.live) SS.audio.stop();
    play = null;
    render();
  }
  async function startPlay(id, built = null, scene = null) {
    stopPlay();
    const s = S.songs.find((x) => x.id === id);
    const me = (play = { id, title: s ? s.title : (built && built.title) || '', proj: null, block: 0, scene, calc: 0, ctrl: new AbortController(), live: false });
    player().resume(); // dans le geste de l'utilisateur (politique autoplay)
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
    const onBlock = (i) => {
      if (play !== me) return;
      me.block = i;
      renderPlayer();
    };
    const onEnd = () => play === me && stopPlay();
    let started = false;
    const begin = (backing) => {
      if (started || play !== me || me.ctrl.signal.aborted) return;
      started = true;
      me.calc = null;
      player().play(backing, { blocks: scene ? 0 : proj.song.length, onBlock, onEnd });
      renderPlayer();
    };
    // calcul impossible : lecture en direct par le moteur complet (comme avant)
    const live = () => {
      started = true;
      me.calc = null;
      me.live = true;
      const opts = scene ? {} : { song: { index: 0, onBlock: (i) => proj.song[i] && proj.song[i].scene !== proj.current && SS.loadScene(proj, proj.song[i].scene, { commit: false }), onBlockVisible: onBlock, onEnd } };
      SS.audio.start(() => proj, () => {}, opts);
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
      ctx: player().ctx,
      fed: () => play === me && started && !me.live && player().fed(),
      sampleRate: RATE,
      trust: 0.75, // un téléphone ralentit quand l'écoute démarre : départ plus prudent que sur l'ordinateur
      margin: 3,
    }).then(begin, (e) => {
      if (me.ctrl.signal.aborted || play !== me || started) return;
      console.warn('écoute pré-calculée', e);
      live();
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
    if (act === 'edit' || act === 'editok') {
      const s = S.songs.find((x) => x.id === b.dataset.id);
      closeSheet();
      if (!s || !s.edit) return;
      if (!s.edit.phone && act === 'edit') return editSheet(s); // chanson de l'ordinateur : on prévient une fois
      S.recipe = JSON.parse(JSON.stringify(s.edit.recipe));
      S.editId = s.id;
      return go('tempo');
    }
    if (act === 'sheetno') return closeSheet();
    if (act === 'sel') {
      S.sel = b.dataset.id;
      renderHome();
      return renderFoot();
    }
    if (act === 'del') {
      const s = S.songs.find((x) => x.id === b.dataset.id);
      return s && delSheet(s);
    }
    if (act === 'delok') return void remove(b.dataset.id);
    if (act === 'play') return play && play.id === b.dataset.id ? stopPlay() : startPlay(b.dataset.id);
    if (act === 'stop') return stopPlay();
    if (act === 'send') return void send(b.dataset.id);
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
      Object.assign(S, { allOpen: false, tab: 'motifs', page: 0, rec: false, padProj: null });
      return go('partie');
    }
    if (act === 'tab') {
      S.tab = b.dataset.tab;
      if (S.tab === 'jouer') padTracks(); // les sons des pads se chargent tout de suite
      return renderPart();
    }
    if (act === 'page') {
      S.page = +b.dataset.p;
      return renderPart();
    }
    if (act === 'pas') {
      tapPas(b.dataset.row, +b.dataset.i);
      return renderPart();
    }
    if (act === 'clear' || act === 'reset') {
      const { mu } = S.cell;
      if (act === 'reset') saveEdit(null);
      else saveEdit(mu === 'drums' ? Object.fromEntries(P.DRUM_LANES.map(([k]) => [k, '-'.repeat(P.STEPS)])) : mu === 'bass' ? [] : P.keysPat(new Array(P.STEPS).fill('')));
      return renderPart();
    }
    if (act === 'rec') {
      if (S.rec) {
        S.rec = false;
        if (S.recDirty) playDraft(S.cell.sc); // la boucle reprend avec ce qui a été joué
        return renderPart();
      }
      if (!(play && play.id === DRAFT && play.scene)) playDraft(S.cell.sc);
      S.rec = true;
      S.recDirty = false;
      return renderPart();
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
