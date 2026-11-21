/*
 * Fiche « Scène » : tiroir à droite, ouvert par un double-clic sur une scène (ligne Scènes ou bloc de l'arrangement).
 * Elle rassemble ce qui définit la scène : nom, longueur, tempo, émotion, énergie et tension, tonalité et accords
 * par mesure, instruments (joue / muet dans cette scène / vide), mouvements (automations) et enchaînements.
 * La grille reste visible et jouable à gauche : ‹ › passent d'une scène à l'autre (la grille suit).
 *
 *   SS.sceneSheet.init({ project, changed, switchScene })
 *   SS.sceneSheet.open(id) / close() / isOpen() / refresh()
 *   SS.sceneSheet.measureEnergy(p, sc) → énergie entendue, 1 à 5 (une décimale)
 *   SS.sceneSheet.paintMutes()        → grise dans la grille les pistes muettes dans la scène en cours
 */
window.SS = window.SS || {};

SS.sceneSheet = (() => {
  let app;
  let openId = null;
  let emoOpen = false; // panneau des émotions ouvert
  const OPEN_KEY = 'stepseq.sceneSheet.closed'; // rubriques repliées (préférence de l'utilisateur)

  /* Couleurs des émotions (mêmes repères que l'assistant Musique de film : tristesse bleu, joie jaune, colère rouge…). */
  const EMO_COLORS = {
    joie: '#ffd23a', euphorie: '#ffb020', tristesse: '#3f6fe0', nostalgie: '#8aa0d6', melancolie: '#7f9cc0', espoir: '#9ad65a',
    suspense: '#a98bff', angoisse: '#6b3cc9', mystere: '#5a6bb0', serenite: '#2fb36d', tendresse: '#f08fb0', triomphe: '#ff9326',
    ambivalence: '#b3a37a', emerveillement: '#2fcfd6', beaute: '#9b6fb8',
  };
  SS.EMOTION_COLORS = EMO_COLORS;

  const HELP = {
    tempo: '= Chanson : la scène suit le tempo de la chanson (le changer la change aussi). Propre : la scène garde son tempo ; il change d’un coup au début de la scène.',
    emo: 'Ce que la scène doit faire ressentir. Sert à l’assistant (accords, sons) et colore la scène.',
    ene: 'Cases pleines : l’énergie voulue. Case en pointillé : l’énergie entendue dans ce qui joue (instruments actifs, densité de notes, vélocité). La tension monte avec les dissonances et l’attente.',
    chords: 'Une case par mesure : les accords de la piste Accords, ou ceux reconnus dans les notes (en gris).',
    inst: 'Joue : la piste joue ses notes. Muet : ses notes restent, mais elle se tait dans cette scène seulement. Vide : aucune note dans cette scène.',
    move: 'Les automations de la scène (par pas) et de l’arrangement (par temps).',
    trans: 'Les scènes qui viennent avant et après celle-ci dans l’arrangement.',
    eneFilm: 'Les émotions de l’assistant Musique de film. Émotion, énergie et tension changées ici sont renvoyées au passage de l’assistant : elles comptent quand tu recrées la chanson. Case en pointillé : l’énergie entendue dans ce qui joue.',
    film: 'Le passage de l’assistant Musique de film dont vient cette scène : son repère dans l’image, l’harmonie, la nuance et les articulations choisies.',
  };

  const h = (tag, attrs = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    children.flat().forEach((c) => c != null && c !== false && el.append(c));
    return el;
  };
  const tip = (k, title) => (SS.helpTip ? SS.helpTip(HELP[k], title) : null);
  const p = () => app.project();
  const sceneOf = (id) => p().scenes.find((sc) => sc.id === id);
  const barsOf = (sc) => (sc.id === p().current ? p().bars : sc.bars);
  const letterOf = (sc) => String.fromCharCode(65 + (p().scenes.indexOf(sc) % 26));
  const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  /** Contenu d'une piste dans une scène : la piste elle-même pour la scène en cours, sinon ce qui est rangé. */
  function content(pr, sc, t) {
    if (sc.id === pr.current) return t.type === 'drum' ? { steps: t.steps || [] } : { events: t.events || [] };
    return (sc.data && sc.data[t.id]) || {};
  }
  /** Notes par mesure d'une piste dans la scène, et vélocité moyenne. */
  function perBar(pr, sc, t) {
    const spb = SS.stepsPerBar(pr);
    const bars = sc.id === pr.current ? pr.bars : sc.bars;
    const out = new Array(bars).fill(0);
    let vel = 0;
    let n = 0;
    const d = content(pr, sc, t);
    if (t.type === 'drum') {
      (d.steps || []).forEach((v, i) => {
        if (v > 0 && i < bars * spb) {
          out[Math.floor(i / spb)]++;
          vel += v;
          n++;
        }
      });
    } else {
      (d.events || []).forEach((e) => {
        if (e.step < bars * spb) {
          out[Math.floor(e.step / spb)] += Math.max(1, (e.notes || []).length);
          vel += e.vel == null ? 0.8 : e.vel;
          n++;
        }
      });
    }
    const follows = SS.follows && SS.follows(t) && SS.sceneGridChords(pr, sc).length > 0; // la piste joue la piste Accords
    return { bars: out, total: out.reduce((a, b) => a + b, 0), vel: n ? vel / n : 0, follows };
  }

  /**
   * Énergie entendue (1–5) : part des pistes qui jouent, densité de notes par mesure et par piste, vélocité moyenne.
   */
  function measureEnergy(pr, sc) {
    const tracks = pr.tracks;
    if (!tracks.length) return 1;
    let playing = 0;
    let dens = 0;
    let vel = 0;
    tracks.forEach((t) => {
      if (SS.sceneMuted(pr, t, sc)) return;
      const b = perBar(pr, sc, t);
      if (!b.total && !b.follows) return;
      playing++;
      dens += b.follows ? 3 : b.total / Math.max(1, b.bars.length);
      vel += b.follows ? 0.8 : b.vel;
    });
    if (!playing) return 1;
    const frac = playing / tracks.length;
    const d = clamp(dens / playing / 8, 0, 1);
    const v = clamp(vel / playing, 0, 1);
    return Math.round((1 + 4 * clamp(0.45 * frac + 0.35 * d + 0.2 * v, 0, 1)) * 10) / 10;
  }

  /** Accords de la scène par mesure : [[noms], …] et s'ils viennent de la piste Accords ou des notes. */
  function chordsByBar(pr, sc) {
    const spb = SS.stepsPerBar(pr);
    const bars = barsOf(sc);
    const out = Array.from({ length: bars }, () => []);
    const grid = SS.sceneGridChords ? SS.sceneGridChords(pr, sc) : [];
    if (grid.length) {
      grid.forEach((c) => {
        const b = Math.floor(c.step / spb);
        if (out[b] && c.info && c.info.name) out[b].push(c.info.name);
      });
      // un accord qui dure plusieurs mesures : rappelé en gris clair dans les suivantes
      let last = null;
      out.forEach((names, i) => {
        if (names.length) last = names[names.length - 1];
        else if (last) out[i] = [{ held: last }];
      });
      return { bars: out, from: 'grid' };
    }
    try {
      const H = SS.harmony;
      const key = H.valid(sc.key) ? sc.key : { tonic: 'C', mode: 'major' };
      H.sceneChords(pr, sc.id).forEach((c) => {
        const b = Math.floor((c.step || 0) / spb);
        if (c.id && out[b] && !out[b].includes(H.chordName(key, c.id))) out[b].push(H.chordName(key, c.id));
      });
    } catch (e) {
      /* pas d'accord reconnu */
    }
    return { bars: out, from: 'notes' };
  }

  /* ---------------- Rubriques ---------------- */

  function closedSet() {
    try {
      return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || '[]'));
    } catch (e) {
      return new Set();
    }
  }
  function remember(id, open) {
    const s = closedSet();
    if (open) s.delete(id);
    else s.add(id);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify([...s]));
    } catch (e) {
      /* ignore */
    }
  }
  function section(id, title, help, sum, ...body) {
    const det = h('details', { class: 'ssh-sec', 'data-sec': id, open: !closedSet().has(id) },
      h('summary', {}, h('span', { class: 'ssh-st' }, title), help, h('span', { class: 'ssh-sum' }, sum)),
      h('div', { class: 'ssh-body' }, ...body));
    det.addEventListener('toggle', () => remember(id, det.open));
    return det;
  }

  function levels(n, value, onPick, { color, measured } = {}) {
    const m = measured == null ? null : Math.round(measured);
    return h('span', { class: 'ssh-lvl', style: color ? `--c:${color}` : null },
      Array.from({ length: n }, (_, i) =>
        h('button', {
          type: 'button',
          class: (value && i < value ? 'on' : '') + (m === i + 1 ? ' meas' : ''),
          'aria-label': `${i + 1} sur ${n}`,
          'aria-pressed': String(!!(value && i < value)),
          onclick: () => onPick(value === i + 1 ? null : i + 1),
        })
      ));
  }

  function render() {
    const root = document.getElementById('sceneSheet');
    if (!root) return;
    const pr = p();
    const sc = openId && sceneOf(openId);
    if (!sc) return close();
    const bars = barsOf(sc);
    const seconds = (bars * SS.stepsPerBar(pr) * 60) / SS.tempoOf(pr, sc) / 4;
    const blocks = pr.song.map((b, i) => ({ ...b, i })).filter((b) => b.scene === sc.id);
    const times = blocks.reduce((a, b) => a + b.repeat, 0);
    const idx = pr.scenes.indexOf(sc);
    const go = (d) => {
      const next = pr.scenes[(idx + d + pr.scenes.length) % pr.scenes.length];
      openId = next.id;
      app.switchScene(next.id); // la grille suit ; render() est rappelé par le panneau Chanson
      render();
    };
    const changed = () => {
      app.changed();
      render();
    };

    // --- en-tête
    const name = h('input', {
      type: 'text', class: 'ssh-name', value: sc.name, maxlength: 40, 'aria-label': 'Nom de la scène',
      onkeydown: (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          e.currentTarget.value = sc.name;
          e.currentTarget.blur();
        }
      },
      onchange: (e) => {
        const v = e.currentTarget.value.trim();
        if (v && v !== sc.name) {
          sc.name = v;
          app.changed();
        } else e.currentTarget.value = sc.name;
      },
    });
    const head = h('header', { class: 'ssh-head' },
      h('b', { class: 'ssh-letter' }, letterOf(sc)),
      name,
      h('span', { class: 'ssh-meta' }, `${bars} mes. · ${fmtTime(seconds)}${times ? ` · ×${times}` : ''}`),
      h('span', { class: 'spacer' }),
      pr.scenes.length > 1 ? h('button', { type: 'button', class: 'ssh-nav', title: 'Scène précédente', 'aria-label': 'Scène précédente', onclick: () => go(-1) }, '‹') : null,
      pr.scenes.length > 1 ? h('button', { type: 'button', class: 'ssh-nav', title: 'Scène suivante', 'aria-label': 'Scène suivante', onclick: () => go(1) }, '›') : null,
      h('button', { type: 'button', class: 'ssh-nav', title: 'Fermer (Échap)', 'aria-label': 'Fermer la fiche', onclick: close }, '✕'));

    // --- tempo
    const own = !!sc.tempo;
    const setTempo = (v) => {
      if (v == null) delete sc.tempo;
      else sc.tempo = Math.round(clamp(Number(v) || pr.tempo, 20, 300));
      if (SS.audio && SS.audio.applyAllFx && sc.id === pr.current) SS.audio.applyAllFx(pr); // l'écho suit
      if (app.syncTempo) app.syncTempo();
      changed();
    };
    const bpm = h('input', {
      type: 'number', class: 'ssh-bpm' + (own ? '' : ' off'), min: 20, max: 300, value: SS.tempoOf(pr, sc), readonly: own ? null : true,
      'aria-label': 'Tempo de la scène',
      onkeydown: (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') e.currentTarget.blur();
      },
      onchange: (e) => own && setTempo(e.currentTarget.value),
    });
    const tempo = section('tempo', 'Tempo', tip('tempo', 'Tempo'), `${own ? 'propre' : '= chanson'} · ${SS.tempoOf(pr, sc)}`,
      h('div', { class: 'ssh-row' },
        h('span', { class: 'ssh-seg' },
          h('button', { type: 'button', class: own ? '' : 'on', 'aria-pressed': String(!own), onclick: () => own && setTempo(null) }, '= Chanson'),
          h('button', { type: 'button', class: own ? 'on' : '', 'aria-pressed': String(own), onclick: () => !own && setTempo(pr.tempo) }, 'Propre')),
        bpm, h('span', { class: 'ssh-muted' }, 'BPM'), h('span', { class: 'ssh-tag' }, fmtTime(seconds))),
      own && pr.tempo !== sc.tempo ? h('small', { class: 'ssh-muted' }, `chanson : ${pr.tempo}`) : null);

    // --- émotion, énergie, tension
    // émotions : celles de l'assistant Musique de film pour une scène qui vient d'un passage de film (mêmes noms,
    // mêmes couleurs que l'assistant), sinon celles de l'application
    const FM = SS.film;
    const fromFilm = !!(sc.film && FM);
    const list = fromFilm
      ? FM.EMOS.map((e) => ({ k: e.k, label: e.label, color: e.color, id: e.id }))
      : (SS.EMOTIONS || []).map((e) => ({ k: e.id, label: e.label, color: EMO_COLORS[e.id] || '#9a9aa3', id: e.id }));
    const curK = fromFilm ? sc.film.emo : sc.emotion;
    const emo = list.find((e) => e.k === curK) || null;
    const measured = measureEnergy(pr, sc);
    const pick = (e) => {
      if (e) sc.emotion = e.id;
      else delete sc.emotion;
      if (fromFilm && e) {
        sc.film.emo = e.k;
        filmPush(pr, sc, { emo: e.k });
      }
      emoOpen = false;
      changed();
    };
    const setLevel = (k, fk, v) => {
      if (v) sc[k] = v;
      else delete sc[k];
      if (fromFilm && v) {
        sc.film[fk] = v;
        filmPush(pr, sc, { [fk]: v });
      }
      changed();
    };
    const emoBox = h('div', { class: 'ssh-combo' },
      h('button', {
        type: 'button', class: 'ssh-combo-btn' + (emo ? '' : ' none'), 'aria-haspopup': 'listbox', 'aria-expanded': String(emoOpen),
        style: emo ? `--c:${emo.color}` : null,
        onclick: (e) => {
          e.stopPropagation();
          emoOpen = !emoOpen;
          render();
        },
      }, emo ? h('i') : null, h('span', {}, emo ? emo.label : 'Choisir une émotion'), h('b', { 'aria-hidden': 'true' }, '▾')),
      emoOpen
        ? h('div', { class: 'ssh-emo-panel', role: 'listbox', 'aria-label': 'Émotions', onclick: (e) => e.stopPropagation() },
            list.map((e) =>
              h('button', {
                type: 'button', role: 'option', class: 'ssh-emo' + (curK === e.k ? ' on' : ''), style: `--c:${e.color}`, 'aria-selected': String(curK === e.k), 'data-emo': e.k,
                onclick: () => pick(e),
              }, h('i'), e.label)),
            emo && !fromFilm ? h('button', { type: 'button', role: 'option', class: 'ssh-emo ssh-emo-none', onclick: () => pick(null) }, 'Aucune') : null)
        : null);
    const fmt1 = (x) => String(x).replace('.', ',');
    const feel = section('feel', 'Émotion et énergie', tip(fromFilm ? 'eneFilm' : 'ene', 'Émotion et énergie'),
      h('span', {}, emo ? h('i', { class: 'ssh-dot', style: `--c:${emo.color}` }) : null, `${emo ? emo.label : 'sans émotion'} · ${sc.energy || fmt1(measured)}/5`),
      emoBox,
      h('div', { class: 'ssh-kv' },
        h('span', {}, 'Énergie'),
        h('span', { class: 'ssh-row' }, levels(5, sc.energy, (v) => setLevel('energy', 'ene', v), { color: '#e5382f', measured }),
          h('small', { class: 'ssh-muted', 'data-energy': measured }, (sc.energy ? `voulue ${sc.energy} · ` : '') + `entendue ${fmt1(measured)}`)),
        h('span', {}, 'Tension'),
        h('span', { class: 'ssh-row' }, levels(5, sc.tension, (v) => setLevel('tension', 'ten', v), { color: '#cfcfd6' }))));

    // --- passage de film (assistant Musique de film)
    const ART = { trem: 'Trémolo', pizz: 'Pizzicato', glock: 'Glockenspiel', marimba: 'Marimba', bells: 'Cloches' };
    let filmSec = null;
    if (fromFilm) {
      const F = sc.film;
      const harmLabel = F.harm === 'ecrit' ? 'écrite' : F.harm === 'song' ? 'comme une chanson' : (FM.HARM[F.harm] || {}).label || '—';
      filmSec = section('film', 'Film', tip('film', 'Film'), `${FM.fmt ? FM.fmt(F.at) : F.at + ' s'}${F.sync ? ' · synchro' : ''}`,
        h('div', { class: 'ssh-kv' },
          h('span', {}, 'Repère'), h('span', { class: 'ssh-row' }, h('b', {}, FM.fmt ? FM.fmt(F.at) : `${F.at} s`), F.sync ? h('span', { class: 'ssh-tag sync' }, '▼ synchro forte') : null),
          F.dlg || F.hold ? h('span', {}, 'Passage') : null,
          F.dlg || F.hold ? h('span', { class: 'ssh-emos' }, F.dlg ? h('span', { class: 'ssh-tag' }, 'Dialogue') : null, F.hold ? h('span', { class: 'ssh-tag' }, 'Point d’orgue') : null) : null,
          h('span', {}, 'Harmonie'), h('span', {}, harmLabel),
          h('span', {}, 'Nuance'), h('span', {}, F.dyn || '—'),
          h('span', {}, 'Articulations'), h('span', { class: 'ssh-emos' }, (F.art || []).length ? F.art.map((k) => h('span', { class: 'ssh-tag' }, ART[k] || k)) : h('span', { class: 'ssh-muted' }, '—'))),
        h('div', { class: 'ssh-row' },
          h('button', { type: 'button', class: 'ssh-btn', onclick: () => openAssistant() }, 'Modifier dans l’assistant'),
          sc.filmDirty ? h('span', { class: 'ssh-muted ssh-small' }, 'changé ici : recréer la chanson dans l’assistant pour l’entendre') : null));
    }

    // --- tonalité et accords
    const ch = chordsByBar(pr, sc);
    const keyLabel = SS.harmony && SS.harmony.valid(sc.key) ? SS.harmony.label(sc.key) : 'sans tonalité';
    const chordCells = ch.bars.map((names, i) =>
      h('div', { class: 'ssh-chord' + (ch.from === 'notes' ? ' rec' : '') + (names.length && names[0].held ? ' held' : '') },
        h('small', {}, String(i + 1)),
        names.length ? (names[0].held ? names[0].held : names.join(' ')) : '·'));
    const harmony = section('chords', 'Accords', tip('chords', 'Accords'), keyLabel,
      h('div', { class: 'ssh-chords' }, chordCells));

    // --- instruments
    let nPlay = 0;
    const rows = pr.tracks.map((t) => {
      const b = perBar(pr, sc, t);
      const muted = SS.sceneMuted(pr, t, sc);
      const empty = !b.total && !b.follows;
      if (!empty && !muted) nPlay++;
      const max = Math.max(1, ...b.bars);
      const setMute = (on) => {
        sc.mute = sc.mute || {};
        if (on) sc.mute[t.id] = true;
        else delete sc.mute[t.id];
        if (!Object.keys(sc.mute).length) delete sc.mute;
        if (SS.audio && SS.audio.applyMutes) SS.audio.applyMutes(pr);
        paintMutes();
        changed();
      };
      return h('div', { class: 'ssh-tr' + (muted ? ' mute' : '') + (empty ? ' empty' : ''), style: `--c:${t.color}`, 'data-track': t.id },
        h('span', { class: 'ssh-cl' }),
        h('div', { class: 'ssh-tn' },
          h('span', { class: 'ssh-tname' }, t.name, t.mute ? h('small', { class: 'ssh-muted' }, ' · muet partout') : null),
          h('div', { class: 'ssh-dens' }, b.follows && !b.total ? h('small', { class: 'ssh-muted' }, 'suit les accords') : b.bars.map((v) => h('span', { style: `height:${v ? 3 + Math.round((v / max) * 11) : 1}px` })))),
        empty && !muted
          ? h('span', { class: 'ssh-muted ssh-empty' }, 'vide')
          : h('span', { class: 'ssh-st3' },
              h('button', { type: 'button', class: muted ? '' : 'on play', 'aria-pressed': String(!muted), onclick: () => muted && setMute(false) }, 'Joue'),
              h('button', { type: 'button', class: muted ? 'on mute' : '', 'aria-pressed': String(muted), onclick: () => !muted && setMute(true) }, 'Muet')));
    });
    const inst = section('inst', 'Instruments', tip('inst', 'Instruments'), `${nPlay}/${pr.tracks.length} jouent`, rows);

    // --- mouvement : automations de la scène (par pas) et de l'arrangement (par temps)
    const moves = [];
    pr.tracks.forEach((t) => {
      const d = sc.id === pr.current ? { auto: t.auto } : (sc.data && sc.data[t.id]) || {};
      Object.keys(d.auto || {}).forEach((k) => {
        const P = (SS.AUTO_PARAMS || []).find((x) => x.id === k);
        moves.push(`${t.name} · ${P ? P.label.toLowerCase() : k}`);
      });
    });
    const BA = { cut: 'cutoff', res: 'résonance', vel: 'vélocité' };
    const seenBa = new Set();
    blocks.forEach((b) => Object.entries(b.bauto || {}).forEach(([tid, params]) => {
      const t = pr.tracks.find((x) => x.id === tid);
      if (!t) return;
      Object.keys(params || {}).forEach((k) => {
        const label = `${t.name} · ${BA[k] || k} par temps`;
        if (!seenBa.has(label)) {
          seenBa.add(label);
          moves.push(label);
        }
      });
    }));
    const move = section('move', 'Mouvement', tip('move', 'Mouvement'), moves.length ? `${moves.length} automation${moves.length > 1 ? 's' : ''}` : 'aucun',
      moves.length ? h('div', { class: 'ssh-emos' }, moves.map((m) => h('span', { class: 'ssh-tag' }, m))) : h('span', { class: 'ssh-muted' }, 'Aucune automation dans cette scène.'));

    // --- entrée et sortie
    const nameAt = (i) => {
      const b = pr.song[i];
      const s = b && sceneOf(b.scene);
      return s ? `${letterOf(s)} ${s.name}` : null;
    };
    const ins = [...new Set(blocks.map((b) => nameAt(b.i - 1) || 'début'))];
    const outs = [...new Set(blocks.map((b) => nameAt(b.i + 1) || 'fin'))];
    const trans = section('trans', 'Entrée et sortie', tip('trans', 'Entrée et sortie'), blocks.length ? `${ins[0]} → ${outs[0]}` : 'pas dans l’arrangement',
      blocks.length
        ? h('div', { class: 'ssh-kv' }, h('span', {}, 'Depuis'), h('span', { class: 'ssh-emos' }, ins.map((x) => h('span', { class: 'ssh-tag' }, x))),
            h('span', {}, 'Vers'), h('span', { class: 'ssh-emos' }, outs.map((x) => h('span', { class: 'ssh-tag' }, x))))
        : h('span', { class: 'ssh-muted' }, 'Cette scène n’est pas dans l’arrangement.'));

    // les rubriques gardent le défilement
    const scroll = root.scrollTop;
    root.replaceChildren(...[head, tempo, feel, filmSec, harmony, inst, move, trans].filter(Boolean));
    root.scrollTop = scroll;
    root.dataset.scene = sc.id;
  }

  /**
   * Renvoie au passage de l'assistant Musique de film (brouillon project.wizard) une émotion, une énergie ou une
   * tension changée dans la fiche. Un modèle figé (« La lumière revient »…) devient une scène libre, au même tempo.
   */
  function filmPush(pr, sc, patch) {
    const d = pr.wizard && pr.wizard.state;
    const FM = SS.film;
    if (!d || !FM || !sc.sec) return false;
    let f = d.film;
    if (!f || !Array.isArray(f.cues) || !f.cues.length) {
      const T = FM.TEMPLATES[d.presetId];
      if (!T) return false;
      f = d.film = { ...FM.editable(T), bpm: T.bpm || null };
      d.presetId = 'scene';
    }
    const i = FM.cueIndexOf(f, sc.sec);
    if (i < 0) return false;
    Object.assign(f.cues[i], patch);
    Object.defineProperty(sc, 'filmDirty', { value: true, enumerable: false, configurable: true });
    return true;
  }
  function openAssistant() {
    close();
    if (app.project().wizard && SS.band.resume()) return;
    SS.band.open();
  }

  /** Grise dans la grille les pistes muettes dans la scène en cours. */
  function paintMutes() {
    if (!app || !app.project()) return;
    const pr = p();
    document.querySelectorAll('.track[data-id]').forEach((el) => {
      const t = pr.tracks.find((x) => x.id === el.dataset.id);
      const m = !!t && SS.sceneMuted(pr, t);
      el.classList.toggle('scene-muted', m);
      const head = el.querySelector('.track-head');
      if (head) head.title = m ? 'Muette dans cette scène (fiche Scène)' : '';
    });
  }

  function open(id) {
    if (!sceneOf(id)) return;
    let root = document.getElementById('sceneSheet');
    if (!root) {
      root = h('aside', { id: 'sceneSheet', class: 'scene-sheet', 'aria-label': 'Fiche Scène' });
      document.body.append(root);
    }
    openId = id;
    root.hidden = false;
    document.body.classList.add('scene-sheet-open');
    render();
  }
  function close() {
    openId = null;
    emoOpen = false;
    const root = document.getElementById('sceneSheet');
    if (root) root.hidden = true;
    document.body.classList.remove('scene-sheet-open');
  }
  const isOpen = () => !!openId;
  function refresh() {
    paintMutes();
    if (!openId) return;
    if (document.activeElement && document.activeElement.classList.contains('ssh-name')) return; // renommage en cours
    render();
  }

  function init(a) {
    app = a;
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !openId || document.querySelector('dialog[open]')) return;
      if (emoOpen) {
        emoOpen = false;
        render();
      } else close();
    });
    document.addEventListener('click', () => {
      if (!emoOpen) return;
      emoOpen = false;
      if (openId) render();
    });
  }

  return { init, open, close, isOpen, refresh, measureEnergy, paintMutes, chordsByBar, filmPush };
})();
