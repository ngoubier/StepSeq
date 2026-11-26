/* Projet Ableton Live (.als) → fichier MIDI → chanson StepSeq (js/ableton.js). Projet de test écrit à la main. */
globalThis.window = globalThis;
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
['library.js', 'dirt.js', 'dirt-tuning.js', 'sounds.js', 'juno.js', 'arp.js', 'project.js', 'harmony.js', 'chords.js', 'beatauto.js', 'midi-file.js', 'midi.js', 'ableton.js'].forEach((f) => require('../js/' + f));

const V = (tag, v) => `<${tag} Value="${v}" />`;
const notes = (list) => `<Notes><KeyTracks>${list.map(([key, times]) => `<KeyTrack Id="0"><Notes>${times.map((t) => `<MidiNoteEvent Time="${t}" Duration="0.25" Velocity="100" IsEnabled="true" />`).join('')}</Notes>${V('MidiKey', key)}</KeyTrack>`).join('')}</KeyTracks></Notes>`;
const clip = (start, end, ls, le, loop, list) =>
  `<MidiClip Time="${start}">${V('CurrentStart', start)}${V('CurrentEnd', end)}<Loop>${V('LoopStart', ls)}${V('LoopEnd', le)}${V('StartRelative', 0)}${V('LoopOn', loop)}</Loop>${V('Name', '')}<TimeSignature><TimeSignatures><RemoteableTimeSignature>${V('Numerator', 4)}${V('Denominator', 4)}</RemoteableTimeSignature></TimeSignatures></TimeSignature>${notes(list)}</MidiClip>`;
const track = (name, { devices = '', clips, volume = 1, pan = 0, envelopes = '' }) =>
  `<MidiTrack Id="1"><Name>${V('EffectiveName', name)}</Name><AutomationEnvelopes><Envelopes>${envelopes}</Envelopes></AutomationEnvelopes><DeviceChain><Mixer><Volume>${V('Manual', volume)}<AutomationTarget Id="${name}v" /></Volume><Pan>${V('Manual', pan)}</Pan><Speaker>${V('Manual', 'true')}</Speaker></Mixer><MainSequencer><ClipTimeable><ArrangerAutomation><Events>${clips}</Events></ArrangerAutomation></ClipTimeable></MainSequencer><DeviceChain><Devices>${devices}</Devices></DeviceChain></DeviceChain></MidiTrack>`;
const envelope = (id, pts) => `<AutomationEnvelope><EnvelopeTarget>${V('PointeeId', id)}</EnvelopeTarget><Automation><Events>${pts.map(([t, v]) => `<FloatEvent Time="${t}" Value="${v}" />`).join('')}</Events></Automation></AutomationEnvelope>`;

// 8 mesures : la grosse caisse tout du long, la basse entre à la mesure 5 (transposée d'une octave), son filtre s'ouvre à la mesure 7
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<Ableton MajorVersion="5" Creator="Ableton Live 11.3"><LiveSet><Tracks>
${track('Kick', { devices: '<DrumGroupDevice />', clips: clip(0, 32, 0, 4, 'true', [[36, [0, 1, 2, 3]]]) })}
${track('Bass', {
  volume: 0.25,
  pan: -0.5,
  devices: `<MidiPitcher><Pitch>${V('Manual', 12)}</Pitch></MidiPitcher><PluginDevice><PluginDesc><VstPluginInfo>${V('PlugName', 'SuperSynth')}</VstPluginInfo></PluginDesc><ParameterList><PluginFloatParameter>${V('ParameterName', 'Filter Cutoff')}<ParameterValue>${V('Manual', 0.2)}<AutomationTarget Id="cut1" /></ParameterValue></PluginFloatParameter></ParameterList></PluginDevice>`,
  clips: clip(16, 32, 0, 4, 'true', [[26, [0, 0.5, 1, 2]], [33, [3]]]),
  envelopes: envelope('cut1', [[-63072000, 0.2], [24, 0.2], [24, 0.6]]),
})}
<ReturnTrack><Name>${V('EffectiveName', 'Delay')}</Name></ReturnTrack>
</Tracks><MasterTrack><DeviceChain><Mixer><Tempo>${V('Manual', 124)}<AutomationTarget Id="tempo" /></Tempo></Mixer></DeviceChain></MasterTrack><Locators><Locators /></Locators></LiveSet></Ableton>`;

test('Ableton : décompression, pistes, boucles des clips, transposition, console et automations', async () => {
  const xml = await SS.ableton.unpack(new Uint8Array(zlib.gzipSync(XML)));
  assert.equal(xml, XML);
  const a = SS.ableton.toMidi(xml);
  assert.equal(a.info.version, 'Ableton Live 11.3');
  assert.equal(a.info.tempo, 124);
  assert.equal(a.info.bars, 8);
  assert.deepEqual(a.cuts, [4], 'nouvelle scène quand la basse entre');
  assert.deepEqual(a.info.tracks.map((t) => [t.name, t.drum, t.notes]), [['Kick', true, 32], ['Bass', false, 20]]);
  assert.ok(a.info.ignored.some((w) => /Delay/.test(w)), 'piste de retour signalée');
  assert.ok(a.info.warnings.some((w) => /SuperSynth/.test(w)), 'plugin signalé');

  const { project: p, report } = SS.midi.importFile(a.bytes, { title: 'Essai', cuts: a.cuts, quantize: true });
  assert.equal(p.tempo, 124);
  assert.deepEqual(p.song.map((b) => [p.scenes.find((s) => s.id === b.scene).bars, b.repeat]), [[4, 1], [4, 1]], 'deux scènes de 4 mesures');
  const kick = p.tracks.find((t) => t.type === 'drum');
  assert.equal(kick.bank, '36', 'grosse caisse GM');
  const bass = p.tracks.find((t) => t.name === 'Bass');
  assert.equal(bass.instrument, SS.midi.gmForProgram(38).id, 'son de basse d’après le nom');
  assert.equal(bass.volume, 0.5, 'gain 0,25 (−12 dB) → volume 0,5');
  assert.ok(Math.abs(bass.mix.pan + 0.5) < 0.02, 'panoramique à gauche');
  const ev = p.scenes[1].data[bass.id].events;
  assert.deepEqual(ev.slice(0, 2).map((e) => [e.step, e.notes]), [[0, [38]], [2, [38]]], 'transposée d’une octave, la boucle de 4 temps se répète');
  assert.equal(ev.length, 20);
  const cut = p.song[1].bauto[bass.id].cut[0];
  assert.equal(cut[0], 0, 'filtre au repos = réglage du son');
  assert.equal(cut[8], 4, 'puis ouvert (+0,4 → +4 octaves)');
  assert.ok(report.moves.some((m) => m.track === 'Bass' && /Cutoff/.test(m.what)));
});

test('Ableton : un fichier qui n’en est pas un', async () => {
  await assert.rejects(SS.ableton.unpack(new Uint8Array([1, 2, 3])), /Ableton/);
  assert.throws(() => SS.ableton.toMidi('<Ableton><LiveSet><Tracks /></LiveSet></Ableton>'), /aucune piste MIDI/);
});
