/*
 * Panneau « Chanson » : scènes (Intro, Couplet, Refrain…) et arrangement.
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

    // scènes
    const chips = pr.scenes.map((sc, i) =>
      h(
        'div',
        { class: 'scene-chip' + (sc.id === pr.current ? ' active' : ''), 'data-id': sc.id },
        h(
          'button',
          {
            type: 'button',
            class: 'scene-name',
            title: 'Cliquer pour éditer cette scène · double-clic pour la renommer',
            onclick: () => app.switchScene(sc.id),
            ondblclick: (e) => rename(sc, e.currentTarget),
          },
          h('b', {}, String.fromCharCode(65 + (i % 26))),
          ' ',
          sc.name,
          h('small', {}, ` ${barsOf(sc)} mes.`)
        ),
        pr.scenes.length > 1
          ? h('button', { type: 'button', class: 'scene-del', title: `Supprimer la scène « ${sc.name} »`, onclick: () => remove(sc) }, '×')
          : null
      )
    );
    $('#sceneList').replaceChildren(...chips);

    // arrangement
    const maxW = 260;
    const blocks = pr.song.map((b, i) => {
      const sc = sceneOf(b.scene);
      if (!sc) return null;
      const bars = barsOf(sc) * b.repeat;
      const letter = String.fromCharCode(65 + (pr.scenes.indexOf(sc) % 26));
      return h(
        'div',
        {
          class: 'song-block' + (i === app.state.songStart ? ' start' : '') + (i === playing ? ' playing' : '') + (sc.id === pr.current ? ' editing' : ''),
          style: `width:${Math.min(maxW, 156 + bars * 4)}px`, // un peu plus large pour les blocs longs
          title: `${sc.name} : ${barsOf(sc)} mesure(s) × ${b.repeat}. Cliquer pour partir d'ici et éditer cette scène.`,
          onclick: (e) => {
            if (e.target.closest('button')) return;
            app.state.songStart = i;
            app.switchScene(sc.id);
          },
        },
        h('div', { class: 'sb-name' }, h('b', {}, letter), ' ', sc.name),
        h(
          'div',
          { class: 'sb-tools' },
          h('button', { type: 'button', title: 'Une répétition de moins', onclick: () => setRepeat(i, b.repeat - 1) }, '−'),
          h('span', { class: 'sb-rep' }, i === playing ? `${playingRep + 1}/${b.repeat}` : `×${b.repeat}`),
          h('button', { type: 'button', title: 'Une répétition de plus', onclick: () => setRepeat(i, b.repeat + 1) }, '+'),
          h('button', { type: 'button', title: 'Avancer plus tôt', onclick: () => moveBlock(i, -1), disabled: i === 0 }, '‹'),
          h('button', { type: 'button', title: 'Reculer plus tard', onclick: () => moveBlock(i, 1), disabled: i === pr.song.length - 1 }, '›'),
          pr.song.length > 1 ? h('button', { type: 'button', title: 'Retirer ce bloc', onclick: () => removeBlock(i) }, '×') : null
        )
      );
    });
    const add = h(
      'select',
      {
        class: 'song-add',
        'aria-label': 'Ajouter une scène à la chanson',
        onchange: (e) => {
          if (!e.target.value) return;
          pr.song.push({ scene: e.target.value, repeat: 1 });
          e.target.value = '';
          changedSong();
        },
      },
      h('option', { value: '' }, '+ Ajouter…'),
      pr.scenes.map((sc) => h('option', { value: sc.id }, sc.name))
    );
    $('#songBlocks').replaceChildren(...blocks.filter(Boolean), add);

    const len = SS.songLength(pr);
    $('#songTotal').textContent = `${len.bars} mesures · ${fmtTime(len.seconds)}`;
    $('#songLoop').checked = !!pr.songLoop;
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
      if (e.key === 'Escape') done(false);
    });
    input.addEventListener('blur', () => done(true), { once: true });
  }

  /** Appelé pendant la lecture de la chanson (i = -1 à l'arrêt). */
  function setPlaying(i, rep = 0) {
    playing = i;
    playingRep = rep;
    if (!app || !app.project()) return;
    render();
    const block = i >= 0 && p().song[i];
    const sc = block && sceneOf(block.scene);
    $('#lcdTitle').textContent = sc ? `${sc.name} ${rep + 1}/${block.repeat}` : p().title;
    if (i >= 0) {
      const el = $('#songBlocks').children[i];
      if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function init(appApi) {
    app = appApi;
    $('#songMode').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const wasPlaying = SS.audio.isPlaying();
      if (wasPlaying) app.stop();
      p().playMode = b.dataset.mode;
      changedSong();
      if (wasPlaying) app.play();
    });
    $('#sceneCopy').addEventListener('click', () => {
      const id = SS.addScene(p(), { copy: true });
      app.switchScene(id);
      app.changed();
    });
    $('#sceneEmpty').addEventListener('click', () => {
      const id = SS.addScene(p(), { copy: false });
      app.switchScene(id);
      app.changed();
    });
    $('#songLoop').addEventListener('change', (e) => {
      p().songLoop = e.target.checked;
      app.changed();
    });
  }

  return { init, render, setPlaying };
})();
