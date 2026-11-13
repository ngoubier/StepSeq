/*
 * Lecture et écriture de fichiers MIDI standard (SMF type 0 et 1), sans dépendance.
 *
 *   SS.midiFile.parse(ArrayBuffer | Uint8Array) -> { format, ppq, tracks: [[event...]] }
 *     event : { tick (absolu), type, ... }
 *       type 'note'    : { ch, note, vel, off: bool }      (Note On vélocité 0 = Note Off)
 *       type 'cc'      : { ch, cc, value }
 *       type 'program' : { ch, program }
 *       type 'pitch'   : { ch, value }                     (-8192..8191)
 *       type 'meta'    : { meta, data (Uint8Array), text? }
 *         meta 0x51 tempo -> { usPerQuarter } ; 0x58 mesure -> { num, den } ; 0x59 armure -> { sf, mi }
 *       autres messages (aftertouch, sysex) : type 'other'
 *
 *   SS.midiFile.write({ ppq, tracks: [[{ tick, bytes: [...] } | { tick, meta, data }]] }) -> Uint8Array (type 1)
 */
(function (root) {
  const SS = (root.SS = root.SS || {});

  const td = typeof TextDecoder !== 'undefined' ? new TextDecoder('latin1') : null;
  const textOf = (bytes) => {
    if (!bytes.length) return '';
    // UTF-8 si c'est valide, sinon latin-1 (anciens fichiers)
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (e) {
      return td ? td.decode(bytes) : String.fromCharCode(...bytes);
    }
  };

  function parse(buf) {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let pos = 0;
    const u32 = () => ((b[pos++] << 24) | (b[pos++] << 16) | (b[pos++] << 8) | b[pos++]) >>> 0;
    const u16 = () => (b[pos++] << 8) | b[pos++];
    const str4 = () => String.fromCharCode(b[pos++], b[pos++], b[pos++], b[pos++]);
    const vlq = (end) => {
      let v = 0;
      for (let i = 0; i < 4 && pos < end; i++) {
        const c = b[pos++];
        v = (v << 7) | (c & 0x7f);
        if (!(c & 0x80)) return v;
      }
      return v;
    };
    // certains fichiers (RIFF « RMID », MacBinary) ont des octets avant l'en-tête MThd
    for (let i = 0; i < Math.min(b.length - 4, 512); i++) {
      if (b[i] === 0x4d && b[i + 1] === 0x54 && b[i + 2] === 0x68 && b[i + 3] === 0x64) {
        pos = i;
        break;
      }
    }
    if (str4() !== 'MThd') throw new Error("Ce n'est pas un fichier MIDI");
    const hlen = u32();
    const hstart = pos;
    const format = u16();
    const ntrks = u16();
    const division = u16();
    pos = hstart + hlen;
    if (division & 0x8000) throw new Error('Fichier MIDI en temps SMPTE : non pris en charge');
    const ppq = division || 96;
    const tracks = [];
    for (let t = 0; t < ntrks && pos + 8 <= b.length; t++) {
      const id = str4();
      const len = u32();
      const start = pos;
      const end = Math.min(b.length, start + len);
      if (id !== 'MTrk') {
        pos = end;
        t--;
        continue;
      }
      const evs = [];
      let tick = 0;
      let status = 0;
      while (pos < end) {
        tick += vlq(end);
        let st = b[pos];
        if (st & 0x80) pos++;
        else st = status; // running status
        if (st === 0xff) {
          const meta = b[pos++];
          const l = vlq(end);
          const data = b.subarray(pos, pos + l);
          pos += l;
          const ev = { tick, type: 'meta', meta, data };
          if (meta >= 1 && meta <= 7) ev.text = textOf(data);
          if (meta === 0x51 && l >= 3) ev.usPerQuarter = (data[0] << 16) | (data[1] << 8) | data[2];
          if (meta === 0x58 && l >= 2) Object.assign(ev, { num: data[0], den: 1 << data[1] });
          if (meta === 0x59 && l >= 2) Object.assign(ev, { sf: (data[0] << 24) >> 24, mi: data[1] });
          if (meta === 0x2f) break;
          evs.push(ev);
          continue;
        }
        if (st === 0xf0 || st === 0xf7) {
          const l = vlq(end);
          pos += l;
          evs.push({ tick, type: 'other' });
          continue;
        }
        if (!(st & 0x80)) break; // données corrompues
        status = st;
        const kind = st & 0xf0;
        const ch = st & 0x0f;
        const d1 = b[pos++];
        const d2 = kind === 0xc0 || kind === 0xd0 ? 0 : b[pos++];
        if (kind === 0x90) evs.push({ tick, type: 'note', ch, note: d1, vel: d2, off: d2 === 0 });
        else if (kind === 0x80) evs.push({ tick, type: 'note', ch, note: d1, vel: 0, off: true });
        else if (kind === 0xb0) evs.push({ tick, type: 'cc', ch, cc: d1, value: d2 });
        else if (kind === 0xc0) evs.push({ tick, type: 'program', ch, program: d1 });
        else if (kind === 0xe0) evs.push({ tick, type: 'pitch', ch, value: ((d2 << 7) | d1) - 8192 });
        else evs.push({ tick, type: 'other', ch });
      }
      pos = end;
      tracks.push(evs);
    }
    return { format, ppq, tracks };
  }

  /* ---------- Écriture ---------- */
  const vlqBytes = (v) => {
    const out = [v & 0x7f];
    while ((v >>= 7)) out.unshift((v & 0x7f) | 0x80);
    return out;
  };
  const textBytes = (s) => Array.from(new TextEncoder().encode(String(s)));

  /** Événements méta utiles. */
  const meta = {
    name: (tick, s) => ({ tick, meta: 0x03, data: textBytes(s) }),
    marker: (tick, s) => ({ tick, meta: 0x06, data: textBytes(s) }),
    text: (tick, s) => ({ tick, meta: 0x01, data: textBytes(s) }),
    tempo: (tick, bpm) => {
      const us = Math.round(60000000 / bpm);
      return { tick, meta: 0x51, data: [(us >> 16) & 0xff, (us >> 8) & 0xff, us & 0xff] };
    },
    timeSig: (tick, num, den) => ({ tick, meta: 0x58, data: [num, Math.round(Math.log2(den)), 24, 8] }),
    keySig: (tick, sf, minor) => ({ tick, meta: 0x59, data: [sf & 0xff, minor ? 1 : 0] }),
  };

  function writeTrack(events) {
    // ordre stable : par tick, les Note Off avant les Note On au même instant, les méta en premier
    const rank = (e) => (e.meta != null ? 0 : (e.bytes[0] & 0xf0) === 0x80 ? 1 : (e.bytes[0] & 0xf0) === 0x90 ? 3 : 2);
    const evs = events.map((e, i) => ({ e, i })).sort((a, b) => a.e.tick - b.e.tick || rank(a.e) - rank(b.e) || a.i - b.i);
    const out = [];
    let last = 0;
    for (const { e } of evs) {
      const tick = Math.max(0, Math.round(e.tick));
      out.push(...vlqBytes(tick - last));
      last = tick;
      if (e.meta != null) out.push(0xff, e.meta, ...vlqBytes(e.data.length), ...e.data);
      else out.push(...e.bytes);
    }
    out.push(0, 0xff, 0x2f, 0);
    return out;
  }

  function write({ ppq = 480, tracks }) {
    const chunks = [];
    const u32 = (v) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
    chunks.push(0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, tracks.length > 1 ? 1 : 0, (tracks.length >> 8) & 0xff, tracks.length & 0xff, (ppq >> 8) & 0xff, ppq & 0xff);
    for (const t of tracks) {
      const body = writeTrack(t);
      chunks.push(0x4d, 0x54, 0x72, 0x6b, ...u32(body.length));
      for (let i = 0; i < body.length; i++) chunks.push(body[i]);
    }
    return new Uint8Array(chunks);
  }

  SS.midiFile = { parse, write, meta };
})(typeof window !== 'undefined' ? window : globalThis);
