/*
 * Bilan d'écoute (StepSeq.bilan, chanson guidée par Claude) : Claude n'entend pas le son, alors StepSeq le calcule
 * et le mesure pour lui. Le rendu est celui de l'export audio (js/render.js : cadre invisible, hors temps réel) :
 *   - le Master : volume perçu (LUFS intégré), crête vraie, plage de volume (LRA), équilibre grave / médium / aigu,
 *     et le volume de chaque passage de l'arrangement (la courbe d'énergie de la chanson) ;
 *   - chaque musicien seul (stems, sans le traitement du Master) : son volume, sa crête, sa part de grave, et le
 *     chevauchement de la basse sur les coups de grosse caisse (basse qui masque le kick).
 * Puis quelques conseils en clair (trop fort, trop de grave, basse sur le kick…).
 *
 * Fonctions pures (tests/bilan.test.js) : bands, lowEnv, kickBassOverlap, passages, conseils.
 */
window.SS = window.SS || {};
SS.bilan = (() => {
  const r1 = (x) => (Number.isFinite(x) ? Math.round(x * 10) / 10 : null);
  const r2 = (x) => Math.round(x * 100) / 100;

  /** Filtre RBJ du 2e ordre (passe-bas ou passe-haut) : [b0, b1, b2, a1, a2]. */
  function biquad(kind, f, sr, q = Math.SQRT1_2) {
    const w = (2 * Math.PI * f) / sr;
    const c = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    const a0 = 1 + al;
    const b = kind === 'lp' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : [(1 + c) / 2, -(1 + c), (1 + c) / 2];
    return [b[0] / a0, b[1] / a0, b[2] / a0, (-2 * c) / a0, (1 - al) / a0];
  }
  /** Énergie d'un signal filtré (mono : moyenne des deux canaux), de from à to. */
  function filteredEnergy(left, right, coefs, from, to) {
    let e = 0;
    for (const x of [left, right]) {
      const st = coefs.map(() => [0, 0, 0, 0]);
      for (let i = from; i < to; i++) {
        let v = x[i];
        for (let k = 0; k < coefs.length; k++) {
          const [b0, b1, b2, a1, a2] = coefs[k];
          const s = st[k];
          const y = b0 * v + b1 * s[0] + b2 * s[1] - a1 * s[2] - a2 * s[3];
          s[1] = s[0]; s[0] = v; s[3] = s[2]; s[2] = y;
          v = y;
        }
        e += v * v;
      }
    }
    return e;
  }
  /**
   * Équilibre grave (< 250 Hz) / médium (250 Hz – 4 kHz) / aigu (> 4 kHz), en parts de l'énergie (somme 1).
   * Filtres du 4e ordre (deux biquads) : les bandes se recouvrent peu.
   */
  function bands(left, right, sr, from = 0, to = left.length) {
    const lo = filteredEnergy(left, right, [biquad('lp', 250, sr), biquad('lp', 250, sr)], from, to);
    const mid = filteredEnergy(left, right, [biquad('hp', 250, sr), biquad('hp', 250, sr), biquad('lp', 4000, sr), biquad('lp', 4000, sr)], from, to);
    const hi = filteredEnergy(left, right, [biquad('hp', 4000, sr), biquad('hp', 4000, sr)], from, to);
    const sum = lo + mid + hi;
    return sum > 0 ? { grave: lo / sum, medium: mid / sum, aigu: hi / sum } : { grave: 0, medium: 0, aigu: 0 };
  }
  /** Enveloppe du grave (< 120 Hz) par tranches de 20 ms : énergie moyenne de chaque tranche. */
  function lowEnv(left, right, sr, from = 0, to = left.length) {
    const hop = Math.max(1, Math.round(sr * 0.02));
    const n = Math.max(0, Math.floor((to - from) / hop));
    const out = new Float64Array(n);
    const c = [biquad('lp', 120, sr), biquad('lp', 120, sr)];
    for (const x of [left, right]) {
      const st = c.map(() => [0, 0, 0, 0]);
      for (let b = 0; b < n; b++) {
        let acc = 0;
        const end = from + (b + 1) * hop;
        for (let i = from + b * hop; i < end; i++) {
          let v = x[i];
          for (let k = 0; k < 2; k++) {
            const [b0, b1, b2, a1, a2] = c[k];
            const s = st[k];
            const y = b0 * v + b1 * s[0] + b2 * s[1] - a1 * s[2] - a2 * s[3];
            s[1] = s[0]; s[0] = v; s[3] = s[2]; s[2] = y;
            v = y;
          }
          acc += v * v;
        }
        out[b] += acc / hop / 2;
      }
    }
    return out;
  }
  /**
   * Basse sur les coups de grosse caisse : parmi les tranches où le grave de la batterie frappe (au-dessus de la moitié
   * de son maximum, à −6 dB), la part où le grave de la basse est à moins de 6 dB de celui de la batterie.
   * null si la batterie n'a pas de coups graves.
   */
  function kickBassOverlap(drumEnv, bassEnv) {
    const n = Math.min(drumEnv.length, bassEnv.length);
    let max = 0;
    for (let i = 0; i < n; i++) max = Math.max(max, drumEnv[i]);
    if (!(max > 0)) return null;
    let hits = 0, masked = 0;
    for (let i = 0; i < n; i++) {
      if (drumEnv[i] < max * 0.25) continue; // −6 dB en amplitude = un quart de l'énergie
      hits++;
      if (bassEnv[i] > drumEnv[i] * 0.25) masked++;
    }
    return hits ? masked / hits : null;
  }

  /** Passages de l'arrangement : [{ scene, nom, debut, fin }] en secondes depuis le début de la chanson. */
  function passages(project, song) {
    const spb = SS.stepsPerBar(project);
    const out = [];
    let t = 0;
    const count = {};
    song.forEach((b) => {
      const sc = project.scenes.find((x) => x.id === b.scene);
      if (!sc) return;
      const bars = sc.id === project.current ? project.bars : sc.bars;
      const len = (bars * spb * 60) / SS.tempoOf(project, sc) / 4;
      for (let r = 0; r < (b.repeat || 1); r++) {
        count[sc.id] = (count[sc.id] || 0) + 1;
        out.push({ scene: sc.id, nom: `${sc.name}${count[sc.id] > 1 ? ' ' + count[sc.id] : ''}`, debut: t, fin: t + len });
        t += len;
      }
    });
    return out;
  }

  /**
   * Repères : les chansons des 9 styles de l'assistant, créées sans retouche et mixées par le mixage automatique
   * (tools/bilan-calibrate.js, 2026-11-23) : −14,3 à −12,5 LUFS, crête −1,7 à −0,4 dBTP, grave 51 à 89 % de l'énergie
   * (94 % sur un refrain latin), aigu 1 à 7 %, écart entre passages 3 à 15 LU, basse sur le kick 0 à 49 %
   * (synthwave : basse au galop sous le kick). L'énergie brute est surtout grave : un mix équilibré a souvent 70 % de grave.
   */
  const REPERES = { lufs: [-14.5, -12.5], grave: [0.5, 0.9], aigu: [0.01, 0.07], ecart: [3, 15], basseSurKick: [0, 0.5] };

  /** Conseils en clair d'après un bilan. */
  function conseils(b) {
    const out = [];
    const m = b.master || {};
    if (m.lufs != null && m.lufs > -8) out.push(`Master très fort (${m.lufs} LUFS) : le son s’écrase. Vise −14 à −10 LUFS (master({ … }) ou mastering plus doux).`);
    else if (m.lufs != null && m.lufs < -18) out.push(`Master faible (${m.lufs} LUFS) : monte le volume ou le mastering (vise −14 à −10 LUFS).`);
    if (m.crete != null && m.crete > -0.3) out.push(`Crête à ${m.crete} dBTP : risque de saturation à l’écoute en ligne (vise −1 dBTP, limiteur du Master).`);
    if (m.equilibre) {
      if (m.equilibre.grave > REPERES.grave[1] + 0.04) out.push(`Beaucoup de grave (${Math.round(m.equilibre.grave * 100)} %) : le mix peut sonner sourd. Allège la basse ou les nappes sous 250 Hz.`);
      if (m.equilibre.aigu < REPERES.aigu[0]) out.push('Très peu d’aigu : le mix peut manquer d’air (charleston, brillance des nappes, EQ aigu).');
      if (m.equilibre.aigu > 0.15) out.push(`Beaucoup d’aigu (${Math.round(m.equilibre.aigu * 100)} %) : le mix peut être agressif.`);
    }
    if (b.basseSurKick != null && b.basseSurKick > 0.6) out.push(`La basse couvre la grosse caisse sur ${Math.round(b.basseSurKick * 100)} % des coups : sidechain sur la basse (effets({ sidechain })) ou EQ grave de la basse un peu plus bas.`);
    const ps = b.passages || [];
    if (ps.length > 2) {
      const vals = ps.map((p) => p.lufs).filter((x) => x != null);
      if (vals.length && Math.max(...vals) - Math.min(...vals) < 2) out.push('Tous les passages ont presque le même volume : la chanson peut paraître plate (retirer des musiciens au couplet, ouvrir au refrain).');
    }
    (b.musiciens || []).forEach((g) => {
      if (g.crete != null && g.crete > -0.3) out.push(`${g.nom} touche 0 dB seul : baisse son volume.`);
    });
    return out;
  }

  /**
   * Bilan d'une chanson (projet de la grille). opts : { range 'song' | 'scene', loops, pistes (stems par musicien) }.
   * onStage(nom, i, total) : progression.
   */
  async function run(project, { range = 'song', loops = 2, pistes = true } = {}, { onStage, signal } = {}) {
    const R = SS.render;
    const sr = 44100;
    const groups = pistes ? R.stemGroups(project, 'musician') : [];
    const total = 1 + groups.length;
    onStage && onStage('Master', 0, total);
    const pm = R.prepare(project, { range, loops });
    const cfg = { seconds: pm.seconds, sampleRate: sr, seed: 0x5eed };
    const M = await R.renderOnce(pm.json, cfg, { signal });
    const B = R.bounds(M.left, M.right, sr, pm.lead, pm.songSeconds);
    const m = R.measure(M.left, M.right, sr, B.from, B.to);
    const eq = bands(M.left, M.right, sr, B.from, B.to);
    const out = {
      duree: Math.round((B.to - B.from) / sr),
      master: { lufs: r1(m.integrated), crete: r1(m.truePeak), plage: r1(m.lra), equilibre: { grave: r2(eq.grave), medium: r2(eq.medium), aigu: r2(eq.aigu) } },
    };
    // volume de chaque passage (le début du son est à pm.lead secondes)
    const plan = R.songPlan(project, { range, loops });
    const start = Math.round(pm.lead * sr);
    out.passages = passages(project, plan.song).map((p) => {
      const a = start + Math.round(p.debut * sr);
      const z = Math.min(M.left.length, start + Math.round(p.fin * sr));
      const mm = z - a > sr * 0.5 ? R.measure(M.left, M.right, sr, a, z) : null;
      return { nom: p.nom, debut: Math.round(p.debut * 10) / 10, lufs: mm ? r1(mm.integrated) : null };
    });
    // chaque musicien seul
    const envs = {};
    out.musiciens = [];
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      onStage && onStage(g.name, i + 1, total);
      const ps = R.prepare(project, { range, loops, keep: g.tracks, neutralMaster: true });
      const S = await R.renderOnce(ps.json, cfg, { signal });
      const sm = R.measure(S.left, S.right, sr, B.from, B.to);
      const se = bands(S.left, S.right, sr, B.from, B.to);
      const role = g.id.startsWith('band:') ? g.id.slice(5) : null;
      if (role === 'drums' || role === 'bass') envs[role] = lowEnv(S.left, S.right, sr, B.from, B.to);
      out.musiciens.push({ nom: g.name, pistes: g.tracks.length, lufs: r1(sm.integrated), crete: r1(sm.samplePeak), grave: r2(se.grave) });
      await new Promise((r) => setTimeout(r, 0));
    }
    const ov = envs.drums && envs.bass ? kickBassOverlap(envs.drums, envs.bass) : null;
    out.basseSurKick = ov == null ? null : r2(ov);
    out.conseils = conseils(out);
    out.reperes = 'chansons de l’assistant, mixage automatique : ' + `${REPERES.lufs[0]} à ${REPERES.lufs[1]} LUFS, grave ${REPERES.grave[0] * 100}–${REPERES.grave[1] * 100} %, aigu ${REPERES.aigu[0] * 100}–${REPERES.aigu[1] * 100} %, écart entre passages ${REPERES.ecart[0]}–${REPERES.ecart[1]} LU, basse sur le kick ${REPERES.basseSurKick[1] * 100} % au plus`;
    return out;
  }

  return { REPERES, run, bands, lowEnv, kickBassOverlap, passages, conseils, biquad };
})();
