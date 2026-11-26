/*
 * Fenêtre « Mon motif de basse » (bouton Avancé… de l'étape Basse de l'assistant ; maquette validée le 2026-11-26) :
 * un petit éditeur sur une ou deux mesures, en doubles-croches, dont les lignes sont des degrés (js/mybass.js ROWS) : le
 * motif suit les accords comme ceux de l'appli. Clic : une note ; tirer son bord droit : l'allonger ; clic sur une note :
 * l'effacer ; outil Glissé : la note glisse depuis la précédente ; barres du bas : la nuance (fantôme, normale, appuyée).
 * « Ce qu'on entend » : les vraies notes du moteur (SS.bandSong.previewBass) sur les accords de la scène choisie.
 *
 * SS.bassEdit.open(host) ; host = {
 *   name, notes (format du moteur), spb, beat, shift (registre), scenes: [{ id, name, spans, key }], scene (id),
 *   from: [[titre, [[id, nom]]]] (« Partir de »), fromNotes(id) → notes,
 *   scope, onScope(v), keep (case « Garder dans Mes motifs »), group (avec le groupe), setGroup(on),
 *   playing(), play(sceneId), pos() → { scene, step } | null, audition(midi, vel),
 *   onChange(notes) (en direct), ok({ name, notes, keep }), cancel()
 * }
 */
window.SS = window.SS || {};

SS.bassEdit = (() => {
  let dlg = null;

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
    kids.flat().forEach((c) => c != null && n.append(c.nodeType ? c : document.createTextNode(c)));
    return n;
  }
  const seg = (id, list, value, onPick) => {
    const box = el('span', { class: 'segmented', role: 'radiogroup', id });
    const draw = (v) =>
      box.replaceChildren(...list.map(([k, t]) => el('button', { type: 'button', role: 'radio', class: k === v ? 'active' : '', 'aria-checked': String(k === v), 'data-v': k, onclick: () => (draw(k), onPick(k)) }, t)));
    draw(value);
    return box;
  };
  const field = (label, ...kids) => el('span', { class: 'bbe-field' }, el('span', { class: 'bh-lbl' }, label), ...kids);

  function open(host) {
    close();
    const MB = SS.myBass;
    const ROWS = MB.ROWS;
    const spb = host.spb || 16;
    const beat = host.beat || 4;
    const RH = 22; // hauteur d'une ligne
    // état : notes { s, l, n, v, g }
    const toEd = (list) => MB.cleanNotes(list, spb).map(([s, l, n, v, g]) => ({ s, l, n, v: MB.velOf(v), g: g === 'g' }));
    let notes = toEd(host.notes);
    let bars = Math.min(MB.MAX_BARS, Math.max(1, notes.some((x) => x.s >= spb) ? 2 : 1));
    let tool = 'note';
    let stepLen = 1;
    let scene = host.scene || (host.scenes[0] && host.scenes[0].id);
    const total = () => bars * spb;
    const out = () => notes.filter((x) => x.s < total()).sort((a, b) => a.s - b.s).map((x) => (x.g ? [x.s, x.l, x.n, x.v, 'g'] : [x.s, x.l, x.n, x.v]));
    const sceneOf = () => host.scenes.find((x) => x.id === scene) || host.scenes[0];
    const changed = () => (draw(), host.onChange(out()));

    // nom des lignes : la note sur le premier accord de la scène (les lignes violettes dépendent de l'accord suivant)
    const rowNote = (n) => {
      const sc = sceneOf();
      if (!sc || MB.SPECIAL.includes(n)) return '';
      const sp = sc.spans[0];
      const ev = SS.bandSong.previewBass([{ ...sp, step: 0, len: spb }], [[0, 1, n, 0.8]], sc.key, { spb, beat, shift: host.shift || 0 });
      return ev[0] ? SS.noteNameFr(ev[0].notes[0]) : '';
    };

    const labels = el('div', { class: 'bbe-labels' });
    const cells = el('div', { class: 'bbe-cells', id: 'bbeCells' });
    const vel = el('div', { class: 'bbe-vel', id: 'bbeVel' });
    const cursor = el('div', { class: 'bbe-cursor' });
    const strip = el('div', { class: 'bbe-strip', id: 'bbeStrip' });
    const playBtn = el('button', { type: 'button', class: 'btn bbe-play', id: 'bbePlay', title: 'Écouter la scène en boucle', 'aria-label': 'Écouter', onclick: () => (host.play(scene), setTimeout(syncPlay, 60)) }, '▶');
    const syncPlay = () => {
      const on = host.playing();
      playBtn.textContent = on ? '■' : '▶';
      playBtn.classList.toggle('on', on);
    };

    function drawLabels() {
      labels.replaceChildren(
        ...ROWS.map(([n, nm]) => el('div', { class: 'bbe-lab' + (MB.SPECIAL.includes(n) ? ' sp' : '') + (n === 0 ? ' root' : '') }, nm, el('span', { class: 'bbe-nt' }, rowNote(n)))),
        el('div', { class: 'bbe-lab bbe-vlab' }, 'Nuance')
      );
    }
    function draw() {
      const n = total();
      cells.style.setProperty('--n', n);
      cells.replaceChildren(
        ...ROWS.map(([v], ri) =>
          el(
            'div',
            { class: 'bbe-row' + (MB.SPECIAL.includes(v) ? ' sp' : '') + (v === 0 ? ' root' : '') },
            ...Array.from({ length: n }, (_, s) => el('i', { class: (s + 1) % spb === 0 ? 'bar' : (s + 1) % beat === 0 ? 'beat' : null, 'data-s': s, 'data-r': ri }))
          )
        ),
        ...notes
          .map((nt, i) => [nt, i])
          .filter(([nt]) => nt.s < n)
          .map(([nt, i]) =>
            el(
              'div',
              {
                class: 'bbe-note' + (MB.SPECIAL.includes(nt.n) ? ' sp' : '') + (nt.g ? ' slide' : ''),
                'data-i': i,
                style: `left:calc(${(nt.s / n) * 100}% + 1px);width:calc(${(Math.min(nt.l, n - nt.s) / n) * 100}% - 2px);top:${ROWS.findIndex((r) => r[0] === nt.n) * RH + 2}px;opacity:${0.45 + nt.v * 0.6}`,
                title: nt.g ? 'Glissée depuis la note précédente' : null,
              },
              el('span', { class: 'bbe-h' })
            )
          ),
        cursor
      );
      vel.replaceChildren(
        ...notes
          .map((nt, i) => [nt, i])
          .filter(([nt]) => nt.s < n)
          .map(([nt, i]) => el('span', { 'data-i': i, title: ['Fantôme', 'Normale', 'Appuyée'][MB.VELS.indexOf(nt.v)] || null, style: `left:calc(${((nt.s + 0.5) / n) * 100}% - 5px);height:${Math.round(nt.v * 34)}px` }))
      );
      drawStrip();
    }
    function drawStrip() {
      const sc = sceneOf();
      if (!sc) return strip.replaceChildren();
      // huit mesures au plus : assez pour entendre les changements d'accords sans tasser les notes
      const len = Math.min(sc.bars, 8) * spb;
      const spans = sc.spans.filter((x) => x.step < len).map((x) => ({ ...x, len: Math.min(x.len, len - x.step) }));
      const ev = SS.bandSong.previewBass(spans, out(), sc.key, { spb, beat, shift: host.shift || 0 });
      const ms = ev.map((e) => e.notes[0]);
      const lo = Math.min(...ms, 36);
      const hi = Math.max(...ms, lo + 12);
      const y = (m) => 18 + (1 - (m - lo) / (hi - lo)) * 58;
      const sp = new Set(notes.filter((x) => MB.SPECIAL.includes(x.n)).map((x) => x.s));
      const chords = [];
      spans.forEach((x) => chords.push(el('div', { class: 'bbe-ch', style: `left:${(x.step / len) * 100}%;width:${(x.len / len) * 100}%` }, x.chord.tok || '')));
      // noms des notes : pas deux à moins de 30 px sur la même hauteur
      const W = strip.clientWidth || 900;
      const lastX = {};
      const named = ev.filter((e) => {
        const x = (e.step / len) * W;
        if (lastX[e.notes[0]] != null && x - lastX[e.notes[0]] < 30) return false;
        lastX[e.notes[0]] = x;
        return true;
      });
      strip.replaceChildren(
        ...chords,
        ...ev.map((e) => el('div', { class: 'bbe-n' + (sp.has(e.step % total()) ? ' sp' : ''), style: `left:${((e.step + (e.shift || 0)) / len) * 100}%;width:calc(${(e.len / len) * 100}% - 1px);top:${y(e.notes[0])}px;opacity:${0.4 + e.vel * 0.6}` })),
        ...named.map((e) => el('div', { class: 'bbe-nn', style: `left:${(e.step / len) * 100}%;top:${y(e.notes[0]) - 11}px` }, SS.noteNameFr(e.notes[0])))
      );
    }

    // souris : poser, allonger, effacer, glisser ; nuances
    let drag = null;
    cells.addEventListener('pointerdown', (e) => {
      const W = cells.clientWidth / total();
      const nd = e.target.closest('.bbe-note');
      if (nd) {
        const i = +nd.dataset.i;
        if (e.target.classList.contains('bbe-h')) {
          drag = { i, x0: e.clientX, l0: notes[i].l, W };
          return;
        }
        if (tool === 'slide') notes[i].g = !notes[i].g;
        else notes.splice(i, 1);
        changed();
        return;
      }
      const c = e.target.closest('i');
      if (!c || tool === 'slide') return;
      const s = +c.dataset.s;
      const n = ROWS[+c.dataset.r][0];
      notes = notes.filter((x) => x.s !== s); // une note par pas
      // une note qui commence plus tôt et recouvre ce pas s'arrête avant
      notes.forEach((x) => x.s < s && x.s + x.l > s && (x.l = s - x.s));
      const nt = { s, l: Math.min(stepLen, total() - s), n, v: s % beat === 0 ? MB.VELS[2] : MB.VELS[1], g: false };
      notes.push(nt);
      changed();
      const sc = sceneOf();
      if (sc && host.audition) {
        const ev = SS.bandSong.previewBass(sc.spans.slice(0, 2), [[0, 1, n, 0.8]], sc.key, { spb, beat, shift: host.shift || 0 });
        if (ev[0]) host.audition(ev[0].notes[0], nt.v);
      }
      drag = { i: notes.indexOf(nt), x0: e.clientX, l0: nt.l, W };
    });
    const onMove = (e) => {
      if (drag) {
        const nt = notes[drag.i];
        const nextS = Math.min(total(), ...notes.filter((x) => x.s > nt.s).map((x) => x.s));
        const l = Math.max(1, Math.min(nextS - nt.s, Math.round(drag.l0 + (e.clientX - drag.x0) / drag.W)));
        if (l !== nt.l) {
          nt.l = l;
          draw();
        }
      }
      if (vdrag != null) setVel(e);
    };
    const onUp = () => {
      if (drag || vdrag != null) host.onChange(out());
      drag = null;
      vdrag = null;
    };
    let vdrag = null;
    const setVel = (e) => {
      const r = vel.getBoundingClientRect();
      notes[vdrag].v = MB.velOf((r.bottom - 4 - e.clientY) / 34);
      draw();
    };
    vel.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('span');
      if (!b) return;
      vdrag = +b.dataset.i;
      setVel(e);
    });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    // tête de lecture
    let raf = 0;
    const tick = () => {
      const p = host.pos && host.pos();
      const sc = sceneOf();
      if (p && sc && p.scene === scene && p.step >= 0) {
        const st = p.step % (sc.bars * spb);
        const local = st - Math.floor(st / spb) * spb + (Math.floor(st / spb) % bars) * spb;
        cursor.style.display = 'block';
        cursor.style.left = (local / total()) * 100 + '%';
      } else cursor.style.display = 'none';
      if (dlg) raf = requestAnimationFrame(tick);
    };

    const name = el('input', { type: 'text', id: 'bbeName', class: 'bbe-name', value: host.name || 'Mon motif', maxlength: 40, spellcheck: 'false', 'aria-label': 'Nom du motif' });
    const from = el(
      'select',
      { id: 'bbeFrom', 'aria-label': 'Partir de', onchange: (e) => {
        const v = e.target.value;
        if (!v) return;
        notes = toEd(v === 'empty' ? [] : host.fromNotes(v));
        bars = notes.some((x) => x.s >= spb) ? 2 : 1;
        barsSeg.replaceWith((barsSeg = mkBars()));
        e.target.value = '';
        changed();
      } },
      el('option', { value: '' }, '—'),
      ...(host.from || []).map(([title, list]) => el('optgroup', { label: title }, ...list.map(([id, nm]) => el('option', { value: id }, nm)))),
      el('option', { value: 'empty' }, 'Vide')
    );
    const sceneSel = el(
      'select',
      { id: 'bbeScene', 'aria-label': 'Écouter sur', onchange: (e) => {
        scene = e.target.value;
        drawLabels();
        draw();
        if (host.playing()) host.play(scene, true);
      } },
      ...host.scenes.map((x) => el('option', { value: x.id, selected: x.id === scene ? true : null }, `${x.name} · ${[...new Set(x.spans.map((s) => s.chord.tok))].slice(0, 8).join(' ')}`))
    );
    const mkBars = () => seg('bbeBars', [['1', '1'], ['2', '2']], String(bars), (v) => {
      const nb = +v;
      if (nb === 2 && bars === 1) notes = notes.concat(notes.filter((x) => x.s < spb).map((x) => ({ ...x, s: x.s + spb }))); // la 2e mesure part d'une copie
      if (nb === 1) notes = notes.filter((x) => x.s < spb).map((x) => ({ ...x, l: Math.min(x.l, spb - x.s) }));
      bars = nb;
      changed();
    });
    let barsSeg = mkBars();
    const keep = el('input', { type: 'checkbox', id: 'bbeKeep', checked: host.keep !== false ? true : null });
    const group = el('input', { type: 'checkbox', id: 'bbeGroup', checked: host.group !== false ? true : null, onchange: (e) => host.setGroup(e.target.checked) });

    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      if (ok) host.ok({ name: name.value.trim() || 'Mon motif', notes: out(), keep: keep.checked });
      else host.cancel();
      close();
    };
    dlg = el(
      'dialog',
      { id: 'bbeDialog', class: 'sd-dialog bbe-dlg', 'aria-label': 'Mon motif de basse' },
      el(
        'div',
        { class: 'bbe-head' },
        el('b', {}, 'Mon motif de basse'),
        name,
        SS.helpTip('Le motif est écrit en degrés : chaque ligne est une note de l’accord (fondamentale, quinte, octave…). Quand l’accord change, la ligne suit toute seule. Les lignes violettes regardent l’accord suivant : approche (la note voisine), accord suivant (joué en avance), chromatique (un demi-ton à côté).', 'Mon motif de basse'),
        el('span', { class: 'spacer' }),
        field('Partir de', from)
      ),
      el(
        'div',
        { class: 'bbe-bar' },
        playBtn,
        field('Écouter sur', sceneSel),
        el('label', { class: 'bbe-chk' }, group, 'Avec le groupe'),
        el('span', { class: 'spacer' }),
        field('Outil', seg('bbeTool', [['note', '✎ Notes'], ['slide', '↗ Glissé']], tool, (v) => (tool = v))),
        SS.helpTip('Clic sur une case : pose une note. Tirer le bord droit d’une note : l’allonge. Clic sur une note : l’efface. Outil Glissé : clic sur une note pour qu’elle glisse depuis la précédente. En bas, la hauteur des barres règle la nuance (fantôme, normale, appuyée).', 'Écrire le motif'),
        field('Mesures', barsSeg),
        field('Pas', seg('bbeLen', [['1', '♬ double'], ['2', '♪ croche'], ['4', '♩ noire']], '1', (v) => (stepLen = +v)))
      ),
      el('div', { class: 'bbe-roll' }, labels, el('div', { class: 'bbe-grid' }, cells, vel)),
      el(
        'div',
        { class: 'bbe-hear' },
        el('div', { class: 'bh-lbl' }, 'Ce qu’on entend dans la scène', SS.helpTip('Les vraies notes jouées sur les accords de la scène choisie. Les notes violettes changent selon l’accord qui arrive.', 'Ce qu’on entend')),
        strip
      ),
      el(
        'div',
        { class: 'bbe-foot' },
        SS.motifPicker.scopeSeg('bbeScope', host.scope || 'one', (v) => {
          host.onScope(v);
          document.querySelectorAll('#bbeScope button').forEach((b) => {
            b.classList.toggle('active', b.dataset.v === v);
            b.setAttribute('aria-checked', String(b.dataset.v === v));
          });
        }),
        el('label', { class: 'bbe-chk' }, keep, 'Garder dans Mes motifs', SS.helpTip('Le motif rejoint la famille « ✎ Mes motifs » de l’étape Basse et du bouton MOTIF de la Grille, pour toutes vos chansons.', 'Mes motifs')),
        el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'btn', id: 'bbeClear', onclick: () => ((notes = []), changed()) }, 'Effacer'),
        el('button', { type: 'button', class: 'btn', id: 'bbeCancel', onclick: () => finish(false) }, 'Annuler'),
        el('button', { type: 'button', class: 'btn btn-primary', id: 'bbeOk', onclick: () => finish(true) }, 'OK')
      )
    );
    dlg.addEventListener('cancel', (e) => (e.preventDefault(), finish(false)));
    dlg._off = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      cancelAnimationFrame(raf);
    };
    document.body.append(dlg);
    dlg.showModal();
    drawLabels();
    draw();
    syncPlay();
    host.onChange(out()); // le motif s'entend dans la scène dès l'ouverture
    raf = requestAnimationFrame(tick);
    return dlg;
  }

  function close() {
    if (!dlg) return;
    const d = dlg;
    dlg = null;
    d._off && d._off();
    if (d.open) d.close();
    d.remove();
  }
  const isOpen = () => !!dlg;

  return { open, close, isOpen };
})();
