/*
 * Fenêtre « Groove » : swing (doubles-croches ou croches) et humanisation.
 * Les réglages sont dans project.groove et s'entendent immédiatement pendant la lecture.
 */
window.SS = window.SS || {};

SS.groove = (() => {
  const $ = (s) => document.querySelector(s);
  let app;
  let snapshot = null;

  const g = () => app.project().groove;

  function label() {
    const gr = g();
    const parts = [];
    if (gr.res && gr.swing > 0.5) parts.push(`swing 1/${gr.res} ${Math.round(gr.swing * 100)} %`);
    if (gr.human > 0) parts.push(`humain ${Math.round(gr.human * 100)} %`);
    return parts.length ? parts.join(' · ') : 'droit';
  }

  function updateButton() {
    const on = label() !== 'droit';
    $('#grooveLabel').textContent = 'Groove : ' + label();
    $('#grooveBtn').classList.toggle('on', on);
  }

  function sync() {
    const gr = g();
    $('#gvRes').querySelectorAll('button').forEach((b) => b.classList.toggle('active', +b.dataset.v === gr.res));
    $('#gvAmountRow').classList.toggle('dim', !gr.res);
    $('#gvSwing').disabled = !gr.res;
    $('#gvSwing').value = Math.round(gr.swing * 100);
    $('#gvSwingOut').textContent = gr.swing <= 0.5 ? '50 % (droit)' : `${Math.round(gr.swing * 100)} %`;
    $('#gvPresets').querySelectorAll('button').forEach((b) => {
      b.disabled = !gr.res;
      b.classList.toggle('active', !!gr.res && +b.dataset.s === Math.round(gr.swing * 100));
    });
    $('#gvHuman').value = Math.round(gr.human * 100);
    $('#gvHumanOut').textContent = gr.human ? `${Math.round(gr.human * 100)} %` : 'off';
    drawPreview();
    updateButton();
  }

  /** Schéma : 8 doubles-croches, position droite (pointillés) et position swinguée (points). */
  function drawPreview() {
    const p = app.project();
    const svg = $('#gvPreview');
    const W = 320;
    const n = 8;
    const step = (W - 20) / n;
    let html = '';
    for (let i = 0; i <= n; i++) {
      const x = 10 + i * step;
      html += `<line class="grid-line" x1="${x}" y1="${i % 4 === 0 ? 4 : 12}" x2="${x}" y2="40"/>`;
    }
    for (let i = 0; i < n; i++) {
      const x = 10 + i * step;
      const shifted = x + (SS.grooveOffset(p, i, 1) * step);
      html += `<circle class="straight" cx="${x.toFixed(1)}" cy="22" r="6"/>`;
      html += `<circle class="hit" cx="${shifted.toFixed(1)}" cy="22" r="${i % 2 ? 4.5 : 6}"/>`;
    }
    svg.innerHTML = html;
  }

  function set(patch) {
    Object.assign(g(), patch);
    sync();
    app.changed();
  }

  function init(appApi) {
    app = appApi;
    $('#grooveBtn').addEventListener('click', open);
    $('#gvRes').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const res = +b.dataset.v;
      // passer en swing alors que l'intensité est à 50 % ne changerait rien : on propose un swing moyen
      set(res && g().swing <= 0.5 ? { res, swing: 0.62 } : { res });
    });
    $('#gvSwing').addEventListener('input', (e) => set({ swing: +e.target.value / 100 }));
    $('#gvPresets').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) set({ swing: +b.dataset.s / 100 });
    });
    $('#gvHuman').addEventListener('input', (e) => set({ human: +e.target.value / 100 }));
    const dlg = $('#grooveDialog');
    $('#gvCancel').addEventListener('click', () => dlg.close('cancel'));
    $('#grooveForm').addEventListener('submit', (e) => {
      e.preventDefault();
      dlg.close('ok');
    });
    dlg.addEventListener('close', () => {
      if (dlg.returnValue !== 'ok' && snapshot) {
        app.project().groove = snapshot;
        app.changed();
      }
      snapshot = null;
      updateButton();
    });
    // la barre d'espace reste utilisable pour lancer / arrêter la lecture pendant le réglage
    dlg.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && e.target.tagName !== 'BUTTON') return;
      e.stopPropagation();
    });
  }

  function open() {
    snapshot = { ...g() };
    sync();
    $('#grooveDialog').returnValue = '';
    $('#grooveDialog').showModal();
  }

  return { init, open, updateButton };
})();
