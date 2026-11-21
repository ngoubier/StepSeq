/*
 * Mode tutoriel « Musique de film » : un coach à droite de l'assistant apprend à composer pour l'image, d'après le guide
 * « Composer une musique de film » (de l'émoticône au mixage à l'image).
 *
 * Le bouton « 🎓 Tutoriel » de la carte de scène (js/band.js, renderFilm) ouvre ou ferme le coach. Chaque leçon est une
 * suite d'étapes : une consigne courte, un projecteur sur le contrôle de l'assistant à utiliser, des écoutes, une
 * question ou un geste vérifié tout seul (lecture de l'état par SS.band.claude.film()). La progression est gardée dans
 * le navigateur. Échap ferme le coach (l'assistant reste ouvert). Coach fermé, l'assistant ne montre aucun texte en plus.
 *
 * Les leçons travaillent sur une scène d'exercice (« Exercice : le couloir », l'étude « La lumière revient » du guide
 * sans ses repères), que le coach propose d'ouvrir à la place de « Ma scène ».
 *
 * Les écoutes passent par l'aperçu de l'application (SS.audio.playNote, piano) et par quelques sons de synthèse
 * (clic de métronome, relais électrique, voix simulée) ; rien n'est écrit dans la chanson.
 *
 * Données des leçons : SS.tutorial.LESSONS (ici) ; les leçons 4 à 9 et le projet guidé viendront s'y ajouter.
 */
window.SS = window.SS || {};

SS.tutorial = (() => {
  const KEY = 'stepseq.tutorial.film';
  const $ = (s, r = document) => r.querySelector(s);
  const W = () => SS.band && SS.band.claude;
  const FM = () => SS.film;

  /* ---------- état et progression ---------- */
  let on = false;
  let view = 'path'; // 'path' (parcours) ou 'lesson'
  let box = null; // le panneau du coach
  let timer = null;
  const mem = { done: {}, ok: {}, les: 0, step: 0, ans: {} };
  function load() {
    try {
      Object.assign(mem, JSON.parse(localStorage.getItem(KEY) || '{}'));
    } catch (e) {
      /* stockage indisponible : la progression ne survit pas au rechargement */
    }
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(mem));
    } catch (e) {
      /* stockage indisponible */
    }
  }

  /* ---------- lecture de l'assistant ---------- */
  /** État de la scène de film (null si l'assistant n'est pas sur « Musique de film »). */
  function film() {
    try {
      return W() ? W().film() : null;
    } catch (e) {
      return null;
    }
  }
  const EX = {
    id: 'scene',
    title: 'Exercice : le couloir',
    story: 'Une mère et sa fille attendent dans un couloir pendant une coupure. On entend le bâtiment, quelques mots vers 00:26, puis un relais électrique à 00:42 : la lumière se rallume et elles se regardent.',
    key: 'D minor',
    start: 0,
    end: 57,
    bpm: null,
    cues: [{ t: 0, emo: 'suspense', name: 'Le couloir', ten: 3, ene: 2 }],
  };
  const onExercise = (f = film()) => !!f && !f.modele && f.titre === EX.title;
  const near = (a, b, tol) => a != null && Math.abs(a - b) <= tol;
  const syncCue = (f) => (f ? f.reperes.find((r) => r.synchro && r.index > 0) : null);

  /* ---------- sons des écoutes ---------- */
  let token = 0;
  let out = null;
  let playing = null; // bouton en cours
  const pianoTrack = () => ({ id: null, type: 'instrument', family: 'keys', instrument: 'piano', category: 'mono', octave: SS.findFamily ? SS.findFamily('keys').octave : 4 });
  function stop() {
    token++;
    if (out) {
      try {
        out.gain.cancelScheduledValues(0);
        out.disconnect();
      } catch (e) {
        /* déjà débranché */
      }
      out = null;
    }
    if (playing) {
      playing.classList.remove('on');
      playing.textContent = playing.dataset.label;
      playing = null;
    }
  }
  /** Sons de synthèse : clic de métronome, relais électrique, voix simulée (formants, syllabes). */
  function sfx(ctx, dest, e, t) {
    const g = ctx.createGain();
    g.connect(dest);
    if (e.k === 'click') {
      const o = ctx.createOscillator();
      o.frequency.value = e.v > 0.8 ? 1800 : 1200;
      o.connect(g);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3 * (e.v || 0.6), t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      o.start(t);
      o.stop(t + 0.08);
    } else if (e.k === 'relay') {
      const len = Math.round(ctx.sampleRate * 0.25);
      const b = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 8);
      const n = ctx.createBufferSource();
      n.buffer = b;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2500;
      n.connect(bp);
      bp.connect(g);
      g.gain.value = 0.8;
      n.start(t);
      const o = ctx.createOscillator();
      const g2 = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      o.type = 'sawtooth';
      o.frequency.value = 100;
      lp.frequency.value = 400;
      o.connect(lp);
      lp.connect(g2);
      g2.connect(dest);
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.linearRampToValueAtTime(0.05, t + 0.05);
      g2.gain.linearRampToValueAtTime(0.0001, t + 2.4);
      o.start(t);
      o.stop(t + 2.5);
    } else if (e.k === 'voice') {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const sy = ctx.createGain();
      o.connect(sy);
      [[700, 6, 1], [1150, 7, 0.7], [2600, 8, 0.35]].forEach(([f, q, a]) => {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f;
        bp.Q.value = q;
        const fg = ctx.createGain();
        fg.gain.value = a * 2.2;
        sy.connect(bp);
        bp.connect(fg);
        fg.connect(g);
      });
      for (let k = 0; k * 0.22 < e.d; k++) {
        const ts = t + k * 0.22;
        o.frequency.setValueAtTime(170 + ((k * 37) % 60), ts);
        sy.gain.setValueAtTime(0.0001, ts);
        sy.gain.linearRampToValueAtTime(k % 5 === 4 ? 0.0001 : 0.5, ts + 0.05);
        sy.gain.linearRampToValueAtTime(0.08, ts + 0.2);
      }
      g.gain.value = 0.8;
      o.start(t);
      o.stop(t + e.d + 0.1);
    }
  }
  /**
   * Joue des notes de piano { m, s (secondes de la scène), d, v } et des sons { k, s, d, v } entre from et to.
   * onTick(t) reçoit le temps de la scène pendant l'écoute (null à la fin).
   */
  async function play(btn, { notes = [], fx = [], from = 0, to = Infinity, onTick = null }) {
    if (playing === btn) return stop();
    stop();
    const my = ++token;
    const tr = pianoTrack();
    const ns = notes.filter((n) => n.s >= from - 0.001 && n.s < to);
    const fs = fx.filter((e) => e.s >= from - 0.001 && e.s < to);
    try {
      if (ns.length) await SS.audio.preparePreview(tr, [...new Set(ns.map((n) => n.m))]);
      else SS.audio.ensureCtx();
    } catch (e) {
      console.warn(e);
    }
    if (my !== token) return;
    const master = SS.audio._master();
    const ctx = master.context;
    if (ctx.state === 'suspended') await ctx.resume();
    out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(master);
    const t0 = ctx.currentTime + 0.1;
    ns.forEach((n) => SS.audio.playNote(tr, n.m, t0 + n.s - from, n.d, n.v == null ? 0.7 : n.v, out));
    fs.forEach((e) => sfx(ctx, out, e, t0 + e.s - from));
    const end = Math.max(0, ...ns.map((n) => n.s + n.d + 1.2), ...fs.map((e) => e.s + (e.d || 0.5)));
    playing = btn;
    btn.classList.add('on');
    btn.textContent = '■ Arrêter';
    mem.heard = mem.heard || {};
    mem.heard[btn.dataset.id] = true;
    save();
    ping();
    const loop = () => {
      if (my !== token) return onTick && onTick(null);
      const t = from + ctx.currentTime - t0;
      if (onTick) onTick(t);
      if (t > Math.min(to, end)) return stop(), onTick && onTick(null);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /* ---------- l'étude « La lumière revient » (guide, § 9) : 80 BPM, entrée 00:06 ---------- */
  const BEAT = 0.75;
  const barT = (bar, beat = 1) => 6 + (bar - 1) * 4 * BEAT + (beat - 1) * BEAT;
  /** Thème [mesure, temps, midi, durée en temps] du modèle (js/film.js) → notes de piano. */
  const theme = (b0, b1, v = 0.62) => FM().LUMIERE.theme.filter(([b]) => b >= b0 && b <= b1).map(([b, bt, m, d]) => ({ bar: b, m, s: barT(b, bt), d: d * BEAT, v }));
  // basse et accords nus du piano, mesures 1 à 4 et 11 à 14 (répartition des voix du guide)
  const ACC = { 1: [[1, [38], 2], [2, [57], 1]], 2: [[1, [46, 62], 2]], 3: [[1, [45, 60], 2]], 4: [[1, [48, 55], 2]], 11: [[1, [45], 2], [2.5, [60], 0.5], [3.5, [65], 0.5]], 12: [[1, [48], 2], [3, [53, 55], 2]], 13: [[1, [41, 53, 60, 67], 2]], 14: [[1, [40, 55, 60], 2]] };
  const acc = (b0, b1, v = 0.42) => Object.entries(ACC).filter(([b]) => b >= b0 && b <= b1).flatMap(([b, ev]) => ev.flatMap(([bt, ms, d]) => ms.map((m) => ({ bar: +b, m, s: barT(+b, bt), d: d * BEAT, v }))));
  const SCENE_FX = [{ k: 'voice', s: 26, d: 2.5 }, { k: 'relay', s: 42, d: 2.4 }];

  /* ---------- l'écran (image simulée) ---------- */
  function screen() {
    const d = document.createElement('div');
    d.className = 'tut-screen';
    d.innerHTML = '<div class="tut-room"></div><i class="tut-fig"></i><i class="tut-fig b"></i><span class="tut-ev">Couloir · coupure</span><span class="tut-tc">00:00</span><span class="tut-sub">« Tu crois qu’elle va revenir ? »</span>';
    d.at = (t) => {
      if (t == null) return;
      $('.tut-tc', d).textContent = FM().fmt(t);
      const lit = t >= 42;
      const talk = t >= 26 && t < 28.5;
      d.classList.toggle('lit', lit);
      d.classList.toggle('talk', talk);
      $('.tut-ev', d).textContent = lit ? 'La lumière revient' : talk ? 'Réplique' : 'Couloir · coupure';
    };
    d.at(0);
    return d;
  }

  /* ---------- les leçons ----------
   * Étape : say (consigne, HTML), spot (sélecteur ou fonction → élément de l'assistant), listen ([{ id, label, play }]),
   * quiz ({ opts, ans, no: { option: message } }) ou ask ({ label, unit, ans, hint }), check (() → true | message | null),
   * ok (message quand c'est réussi), media (() → élément affiché dans le coach). */
  const LESSONS = [
    {
      id: 'intent',
      title: 'L’intention',
      color: '#8aa0d6',
      sum: 'De l’émotion à une phrase qui guide l’écriture.',
      steps: [
        { say: 'Avant de choisir des notes, demande-toi <b>qui ressent quoi, à quel moment</b>, et ce que la musique révèle au spectateur. Lis la scène.', spot: '#bandSong .bs-desc', ok: 'Trois sons racontent déjà la scène : le bâtiment, une réplique, un relais.' },
        {
          say: 'Choisis l’intention la plus utile pour écrire. Elle dit <b>ce que le spectateur doit sentir</b> et <b>ce qui va changer</b>.',
          quiz: { opts: ['C’est triste', 'On doit sentir que l’attente dure et que tout peut basculer', 'Une musique de couloir, calme'], ans: 1, no: 'Trop vague : cette phrase ne dit ni ce que vit le spectateur, ni ce qui va changer.' },
          ok: 'Oui. « Tout peut basculer » appelle déjà une pédale, une attente, un silence possible.',
        },
        {
          say: 'Quelle est la <b>trajectoire</b> de la scène, jusqu’au dernier regard ?',
          quiz: { opts: ['Doute → soulagement', 'Calme → peur', 'Joie → chagrin'], ans: 0, no: 'Relis la fin : la lumière revient, elles se regardent.' },
          ok: 'Une scène peut être intense avec une activation faible : c’est ce qui rend l’attente palpable.',
        },
        {
          say: 'Écoute A puis B. <b>Mêmes notes, même tempo</b> : seules la durée des notes et les accents changent. Laquelle sert l’attente ?',
          listen: [
            { id: 'i-a', label: '▶ Version A', play: () => ({ notes: [...theme(1, 4, 0.42).map((n) => ({ ...n, d: n.d * 1.4 })), ...acc(1, 4, 0.3)] }) },
            { id: 'i-b', label: '▶ Version B', play: () => ({ notes: [...theme(1, 4, 0.6).map((n, i) => ({ ...n, d: Math.min(n.d, BEAT * 0.45), v: i % 3 === 0 ? 0.85 : 0.6 })), ...acc(1, 4, 0.5).map((n) => ({ ...n, d: BEAT * 0.4 }))] }) },
          ],
          quiz: { opts: ['A', 'B'], ans: 0, no: 'B est décidée : attaques franches, notes courtes. Elle pousse vers l’action.' },
          ok: 'A retient : notes liées, accents doux, une phrase qui s’éteint.',
        },
        {
          say: 'À toi, dans l’assistant : le couloir dans le noir porte un souvenir chaud et douloureux. Donne au premier passage l’émotion <b>Nostalgie</b>.',
          spot: '.bfm-cues tbody tr:first-child .bfm-emo',
          check: (f) => (f.reperes[0].emotion === 'nostalgie' ? true : null),
          ok: 'Sa couleur apparaît sur la frise et sur les courbes. Le tempo des émotions guide déjà le tempo de la scène.',
        },
      ],
    },
    {
      id: 'spot',
      title: 'Repérer et synchroniser',
      color: '#a98bff',
      sum: 'Entrée, synchro, sortie, et le rapport à l’action.',
      steps: [
        {
          say: 'Regarde d’abord la scène <b>sans musique</b>. Repère ce que le son raconte déjà : le bâtiment, la réplique, le relais.',
          media: 'screen',
          listen: [{ id: 's-watch', label: '▶ La scène, 00:22 à 00:46', play: (scr) => ({ fx: SCENE_FX, from: 22, to: 46, onTick: scr.at }) }],
          check: () => (mem.heard && mem.heard['s-watch'] ? true : null),
          ok: 'Le relais est déjà un événement sonore : la musique devra lui laisser sa place.',
        },
        {
          say: 'La musique entre après une respiration du bâtiment. Règle l’<b>entrée</b> vers 6 secondes.',
          spot: '#bfmStart',
          check: (f) => (near(f.entree, 6, 2) ? true : f.entree > 0 ? 'Vers 00:06 : assez tôt pour accompagner l’attente, assez tard pour entendre le lieu.' : null),
          ok: 'Dans le guide, l’entrée est à 00:06.',
        },
        {
          say: 'Règle la <b>fin</b> de la musique vers 54 secondes, quand le regard est compris.',
          spot: '#bfmEnd',
          check: (f) => (f.fin >= 52 && f.fin <= 57 ? true : f.fin !== 57 ? 'Laisse la scène respirer jusqu’au regard, vers 00:54.' : null),
          ok: 'Garde jusqu’à trois secondes de queue après la fin du cue.',
        },
        {
          say: 'Ajoute un repère avec <b>+ Repère</b>, puis mets son temps à <b>42</b> secondes : le relais.',
          spot: () => (film() && film().reperes.length > 1 ? $('.bfm-cues tbody tr:last-child .bfm-time') : $('#bfmAdd')),
          check: (f) => (f.reperes.some((r) => r.index > 0 && near(r.temps, 42, 0.25)) ? true : null),
          ok: 'Un repère ouvre un passage : il a sa propre émotion, sa tension et son énergie.',
        },
        {
          say: 'Coche <b>Synchro</b> sur ce repère : c’est l’instant qui doit changer la musique.',
          spot: () => {
            const f = film();
            const i = f ? f.reperes.findIndex((r) => near(r.temps, 42, 0.25)) : -1;
            return i > 0 ? $(`.bfm-cues tbody tr:nth-child(${i + 1}) input[name="bfmSync"]`) : null;
          },
          check: (f) => (near((syncCue(f) || {}).temps, 42, 0.25) ? true : syncCue(f) ? 'La synchro doit être sur le relais, à 00:42.' : null),
          ok: 'Le tempo se cale aussitôt pour que la synchro tombe sur le premier temps d’une mesure.',
        },
        {
          say: 'Même musique, arrivée déplacée de trois quarts de temps. Écoute les trois versions avec l’image. Laquelle <b>donne du poids</b> au retour de la lumière ?',
          media: 'screen',
          listen: [-0.75, 0, 0.75].map((sh, k) => ({
            id: 's-arr' + k,
            label: '▶ ' + ['00:41,25', '00:42', '00:42,75'][k],
            play: (scr) => ({ notes: [...theme(11, 14), ...acc(11, 14)].map((n) => (n.bar >= 13 ? { ...n, s: n.s + sh } : n)), fx: SCENE_FX, from: 36, to: 50, onTick: scr.at }),
          })),
          quiz: { opts: ['Anticiper', 'Coïncider', 'Entrer après'], ans: 1, no: { 0: 'En avance, le spectateur devine le rallumage avant de le voir.', 2: 'En retard, la musique commente le regard qui suit, pas la lumière.' } },
          ok: 'Coïncider donne du poids. Anticiper prépare, entrer après commente : les trois sont justes selon ce que tu veux dire.',
        },
      ],
    },
    {
      id: 'tempo',
      title: 'Le tempo calé',
      color: '#ff9326',
      sum: 'BPM = 60 × noires ÷ secondes.',
      steps: [
        {
          say: 'De l’entrée (00:06) à la synchro (00:42), tu veux <b>12 mesures</b> en 4/4. Combien de noires ?',
          ask: { label: '12 mesures =', unit: 'noires', ans: 48, hint: '12 mesures × 4 temps.' },
          ok: '48 noires, en 36 secondes.',
        },
        {
          say: 'Applique la formule : <b>BPM = 60 × noires ÷ secondes</b>.',
          ask: { label: '60 × 48 ÷ 36 =', unit: 'BPM', ans: 80, hint: '60 × 48 = 2 880, à diviser par 36.' },
          ok: '80 BPM : la mesure dure 3 secondes, chaque noire 0,75 seconde.',
        },
        {
          say: 'Écoute quatre mesures depuis l’entrée. À 80, le temps 1 de la mesure 5 tombe <b>sur le clac</b> de 00:18. À 84, il arrive en avance.',
          listen: [80, 84].map((bpm) => ({
            id: 't-' + bpm,
            label: `▶ ${bpm} BPM`,
            play: () => ({ fx: [...Array(17)].map((_, k) => ({ k: 'click', s: 6 + (k * 60) / bpm, v: k % 4 === 0 ? 1 : 0.5 })).concat([{ k: 'relay', s: 18, d: 0.4 }]), from: 6, to: 19.5 }),
          })),
          check: () => (mem.heard && mem.heard['t-80'] && mem.heard['t-84'] ? true : null),
          ok: 'Si le tempo calculé gêne le jeu, place le repère sur un autre temps ou ménage une tenue libre.',
        },
        {
          say: 'Dans <b>Tempo calé</b>, l’assistant fait ce calcul pour toi. Choisis <b>12 mesures · 80 BPM</b>.',
          spot: () => $('.bfm-opts [data-bpm="80"]') || $('.bfm-opts'),
          check: (f) => (!syncCue(f) ? 'Il faut d’abord une synchro à 00:42 (leçon 2).' : f.bpm === 80 && syncCue(f).mesure === 13 ? true : null),
          ok: 'La synchro tombe pile au début de la mesure 13, comme dans l’étude « La lumière revient ».',
        },
      ],
    },
  ];

  /* ---------- le coach ---------- */
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'onclick') e.addEventListener('click', v);
      else if (k === 'html') e.innerHTML = v;
      else e.setAttribute(k, v === true ? '' : v);
    });
    kids.flat().forEach((c) => c != null && e.append(c));
    return e;
  };
  const lesson = () => LESSONS[mem.les] || LESSONS[0];
  const stepKey = (k = mem.step) => lesson().id + ':' + k;

  /** Résultat de l'étape : true (réussie), un message (pas encore), null (rien à dire). */
  function result(sp) {
    const a = mem.ans[stepKey()];
    if (sp.quiz) {
      if (a == null) return null;
      if (a !== sp.quiz.ans) return typeof sp.quiz.no === 'string' ? sp.quiz.no : sp.quiz.no[a] || 'Pas tout à fait.';
      if (!sp.check) return true;
    }
    if (sp.ask) {
      if (a == null || a === '') return null;
      return Math.abs(+String(a).replace(',', '.') - sp.ask.ans) < 0.01 ? true : sp.ask.hint;
    }
    if (!sp.check) return true;
    const f = film();
    if (!f && sp.check.length) return null;
    return sp.check(f);
  }
  function ping() {
    if (!on || !box || view !== 'lesson') return;
    const sp = lesson().steps[mem.step];
    if (!sp) return;
    const r = result(sp);
    if (r === true && !mem.ok[stepKey()]) {
      mem.ok[stepKey()] = true;
      save();
    }
    const fb = $('.tut-fb', box);
    if (fb) {
      fb.className = 'tut-fb' + (r === true ? ' ok' : typeof r === 'string' ? ' no' : '');
      fb.textContent = r === true ? '✓ ' + (sp.ok || 'C’est ça.') : typeof r === 'string' ? r : '';
    }
    const nx = $('.tut-next', box);
    if (nx) nx.disabled = !mem.ok[stepKey()];
    progress();
    spotlight(sp);
  }
  function progress() {
    const p = $('.tut-prog', box);
    if (p) p.innerHTML = lesson().steps.map((_, k) => `<i class="${mem.ok[stepKey(k)] ? 'done' : k === mem.step ? 'cur' : ''}"></i>`).join('');
  }
  /** Projecteur sur le contrôle visé (l'assistant redessine souvent : il est remis à chaque vérification). */
  function spotlight(sp) {
    const want = !sp || !sp.spot || !onExercise() ? null : typeof sp.spot === 'function' ? sp.spot() : $(sp.spot);
    document.querySelectorAll('.tut-spot').forEach((x) => x !== want && x.classList.remove('tut-spot'));
    if (want && !want.classList.contains('tut-spot')) {
      want.classList.add('tut-spot');
      want.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
  function clearSpot() {
    document.querySelectorAll('.tut-spot').forEach((x) => x.classList.remove('tut-spot'));
  }

  function head(title) {
    return el('div', { class: 'tut-head' },
      el('span', { class: 'tut-cap' }, '🎓 ' + title),
      el('span', { class: 'tut-sp' }),
      view === 'lesson' ? el('button', { type: 'button', class: 'btn btn-small tut-path', onclick: () => show('path') }, 'Parcours') : null,
      el('button', { type: 'button', class: 'btn btn-small btn-icon tut-close', title: 'Fermer le tutoriel (Échap)', 'aria-label': 'Fermer le tutoriel', onclick: () => toggle(false) }, '✕'));
  }
  /** Avant toute leçon : l'assistant sur « Musique de film », puis la scène d'exercice. */
  function gate() {
    const f = film();
    if (!f)
      return el('div', { class: 'tut-gate' }, el('p', {}, 'Le tutoriel travaille dans l’assistant, style 🎬 Musique de film.'),
        el('button', { type: 'button', class: 'btn btn-accent', onclick: () => { try { W().style('film', 'scene'); } catch (e) { console.warn(e); } render(); } }, 'Passer en Musique de film'));
    if (onExercise(f)) return null;
    return el('div', { class: 'tut-gate' }, el('p', {}, 'Les leçons se font sur une scène d’exercice : le couloir de l’étude « La lumière revient », sans ses repères. Elle remplace « Ma scène ».'),
      el('button', { type: 'button', class: 'btn btn-accent tut-open-ex', onclick: () => { W().filmScene(EX); render(); } }, 'Ouvrir la scène d’exercice'));
  }
  function renderPath() {
    const done = LESSONS.filter((l) => mem.done[l.id]).length;
    const next = LESSONS.findIndex((l) => !mem.done[l.id]);
    box.append(head('Tutoriel'),
      el('h3', { class: 'tut-title' }, 'Composer une musique de film'),
      el('div', { class: 'tut-bar' }, el('i', { style: `width:${(done / LESSONS.length) * 100}%` })),
      el('div', { class: 'tut-muted' }, `${done} leçon${done > 1 ? 's' : ''} sur ${LESSONS.length}`),
      el('div', { class: 'tut-list' }, ...LESSONS.map((l, k) =>
        el('button', { type: 'button', class: 'tut-les' + (mem.done[l.id] ? ' done' : ''), style: `--c:${l.color}`, 'data-les': l.id, onclick: () => start(k) },
          el('small', {}, `Leçon ${k + 1}`), el('b', {}, l.title), el('span', {}, l.sum), el('em', {}, mem.done[l.id] ? '✓' : `${l.steps.length} étapes`)))),
      el('button', { type: 'button', class: 'btn btn-accent tut-go', onclick: () => start(next < 0 ? 0 : next) }, next < 0 ? 'Recommencer' : done ? 'Continuer' : 'Commencer'));
  }
  function renderLesson() {
    const L = lesson();
    const sp = L.steps[mem.step];
    box.append(head(`Leçon ${mem.les + 1} / ${LESSONS.length}`),
      el('h3', { class: 'tut-title' }, el('i', { class: 'tut-dot', style: `--c:${L.color}` }), L.title),
      el('div', { class: 'tut-prog' }));
    const g = gate();
    if (g) {
      box.append(g);
      progress();
      return clearSpot();
    }
    box.append(el('div', { class: 'tut-say', html: sp.say }));
    let scr = null;
    if (sp.media === 'screen') box.append((scr = screen()));
    if (sp.listen)
      box.append(el('div', { class: 'tut-listen' }, ...sp.listen.map((x) => {
        const b = el('button', { type: 'button', class: 'btn tut-play', 'data-id': x.id, 'data-label': x.label }, x.label);
        b.addEventListener('click', () => play(b, x.play(scr)));
        return b;
      })));
    if (sp.quiz) {
      const a = mem.ans[stepKey()];
      box.append(el('div', { class: 'tut-quiz', role: 'radiogroup' }, ...sp.quiz.opts.map((o, k) =>
        el('button', { type: 'button', role: 'radio', 'aria-checked': String(a === k), class: 'chip' + (a === k ? (k === sp.quiz.ans ? ' good' : ' bad') : ''), onclick: () => answer(k) }, o))));
    }
    if (sp.ask) {
      const inp = el('input', { type: 'text', inputmode: 'decimal', class: 'tut-num', value: mem.ans[stepKey()] || '', 'aria-label': sp.ask.unit });
      inp.addEventListener('input', () => {
        mem.ans[stepKey()] = inp.value.trim();
        save();
        ping();
      });
      box.append(el('label', { class: 'tut-ask' }, sp.ask.label, ' ', inp, ' ', sp.ask.unit));
    }
    const last = mem.step === L.steps.length - 1;
    box.append(el('div', { class: 'tut-fb', 'aria-live': 'polite' }),
      el('div', { class: 'tut-nav' },
        el('button', { type: 'button', class: 'btn tut-prev', disabled: mem.step === 0, onclick: () => go(mem.step - 1) }, '← Précédent'),
        el('button', { type: 'button', class: 'btn btn-accent tut-next', onclick: next }, last ? (mem.les < LESSONS.length - 1 ? 'Leçon suivante →' : 'Terminer') : 'Suivant →')),
      el('div', { class: 'tut-muted' }, `Étape ${mem.step + 1} sur ${L.steps.length} · Échap : fermer`));
    ping();
  }
  function answer(k) {
    mem.ans[stepKey()] = k;
    save();
    render();
  }
  function go(k) {
    stop();
    mem.step = Math.max(0, Math.min(lesson().steps.length - 1, k));
    save();
    render();
  }
  function next() {
    if (!mem.ok[stepKey()]) return;
    if (mem.step < lesson().steps.length - 1) return go(mem.step + 1);
    mem.done[lesson().id] = true;
    if (mem.les < LESSONS.length - 1) start(mem.les + 1);
    else show('path');
  }
  function start(k) {
    mem.les = k;
    mem.step = 0;
    save();
    show('lesson');
  }
  function show(v) {
    stop();
    view = v;
    mem.view = v;
    save();
    render();
  }
  function render() {
    if (!box) return;
    box.replaceChildren();
    if (view === 'lesson') renderLesson();
    else {
      clearSpot();
      renderPath();
    }
  }

  /* ---------- ouverture ---------- */
  function mount() {
    const dlg = $('#bandDialog');
    if (!dlg) return null;
    if (!box) {
      box = el('aside', { class: 'tut-coach', id: 'tutCoach', 'aria-label': 'Tutoriel : composer une musique de film' });
      dlg.append(box);
      // chaque geste dans l'assistant peut réussir une étape
      ['change', 'input', 'click'].forEach((t) => dlg.addEventListener(t, (e) => !box.contains(e.target) && setTimeout(ping, 0)));
    }
    return dlg;
  }
  function toggle(want = !on) {
    const dlg = mount();
    if (!dlg) return;
    on = !!want;
    dlg.classList.toggle('tut-on', on);
    box.hidden = !on;
    const b = $('#bfmTuto');
    if (b) b.setAttribute('aria-pressed', String(on));
    clearInterval(timer);
    stop();
    if (!on) return clearSpot();
    load();
    view = mem.view === 'lesson' ? 'lesson' : 'path';
    render();
    // l'assistant redessine la carte de scène à chaque changement : projecteur et vérification suivent
    timer = setInterval(() => (!$('#bandDialog') || !document.body.classList.contains('wizard-mode') ? toggle(false) : ping()), 600);
  }
  // Échap ferme le coach avant l'assistant
  document.addEventListener(
    'keydown',
    (e) => {
      if (!on || e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      e.preventDefault();
      e.stopPropagation();
      toggle(false);
    },
    true
  );
  load();

  return { toggle, isOn: () => on, LESSONS, EX, _mem: mem, _ping: ping };
})();
