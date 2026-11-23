/*
 * Référence de mixage commune : UNE table de cibles de volume par style, lue par les quatre réglages automatiques
 *   - le mix de l'assistant « Nouvelle chanson » (js/bandmix.js, STYLE.loud → gain du mastering, js/band-drive.js) ;
 *   - Auto Mix (js/automix.js, TARGETS : objectif proposé d'après le style) ;
 *   - le bilan du son de la chanson guidée par Claude (js/bilan.js, conseils) ;
 *   - les boutons « Viser » du Mastering (js/mixer.js).
 *
 * Par groupe de styles :
 *   loud : volume court terme (LUFS, fenêtres de 3 s) visé pour le passage le plus fort ; c'est sur lui que se règle
 *          le gain d'entrée du limiteur (comme un ingénieur de mastering) ;
 *   lufs : volume intégré attendu sur la chanson entière (ce que mesurent Auto Mix et le bilan) ;
 *   tp   : plafond de crête vraie (dBTP) ; plr : crête − volume intégré (dB) ; lra : plage de volume (LU).
 * Les valeurs « loud » sont celles du mix de l'assistant avant cette table (sauf Musique de film, qui retombait sur la
 * synthwave) : les chansons créées sonnent comme avant. Streaming et Club restent des objectifs de diffusion.
 */
window.SS = window.SS || {};
SS.mixRef = (() => {
  const GROUPS = {
    synthwave: { name: 'Pop / synthwave', styles: ['synthwave', 'pop', 'funk', 'latin', 'zero'], loud: -9.5, lufs: -12.5, tp: -1, plr: [8, 13], lra: [3, 9], desc: 'dense mais dynamique' },
    edm: { name: 'Électro', styles: ['edm', 'techno', 'dnb'], loud: -8.5, lufs: -12, tp: -1, plr: [7, 12], lra: [3, 9], desc: 'fort et serré' },
    cliches: { name: 'Clichés', styles: ['cliches'], loud: -10, lufs: -13, tp: -1, plr: [8, 13], lra: [3, 9], desc: 'mur de son, grande salle' },
    soul: { name: 'Hip-hop / soul', styles: ['hiphop', 'soul'], loud: -11, lufs: -14, tp: -1, plr: [9, 14], lra: [4, 10], desc: 'souple, de la place pour la voix' },
    ambient: { name: 'Ambient', styles: ['ambient'], loud: -13, lufs: -16, tp: -1, plr: [10, 18], lra: [5, 14], desc: 'calme et ouvert' },
    film: { name: 'Musique de film', styles: ['film'], loud: -14, lufs: -18, tp: -1, plr: [12, 20], lra: [6, 18], desc: 'de la place pour le dialogue' },
  };
  /** Objectifs de diffusion, hors styles. */
  const DIFFUSION = {
    streaming: { name: 'Streaming', lufs: -14, tp: -1, plr: [9, 15], lra: [4, 10], desc: 'Spotify, Apple Music, YouTube' },
    club: { name: 'Club', lufs: -8, tp: -1, plr: [6, 9], lra: [2, 7], desc: 'pour les sonos de club' },
  };
  const BY_STYLE = {};
  for (const [id, g] of Object.entries(GROUPS)) g.styles.forEach((s) => (BY_STYLE[s] = id));

  /** Identifiant de groupe d'un style de l'assistant (null s'il est inconnu). */
  const groupOf = (style) => BY_STYLE[style] || null;
  /** Cible d'un style (groupe), sinon null. */
  const of = (style) => (groupOf(style) ? { id: groupOf(style), ...GROUPS[groupOf(style)] } : null);
  /** Style de l'assistant d'un projet ou d'une liste de pistes (le plus fréquent parmi les pistes de l'assistant). */
  function styleOf(tracks) {
    const n = {};
    (tracks || []).forEach((t) => t && t.band && t.band.style && (n[t.band.style] = (n[t.band.style] || 0) + 1));
    const best = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : null;
  }

  return { GROUPS, DIFFUSION, groupOf, of, styleOf };
})();
