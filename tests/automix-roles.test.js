const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.window = globalThis;
require('../js/project.js');
require('../js/sounds.js');
require('../js/automix.js');
test('Auto Mix reconnaît les rôles sans dépendre des anciens profils', () => {
  const cases = [
    [{ type:'drum',sound:'bd' },'kick'],
    [{ type:'drum',sound:'sd' },'snare'],
    [{ type:'drum',sound:'hh' },'hat'],
    [{ type:'drum',source:'dirt',bank:'deep_kick' },'kick'],
    [{ type:'instrument',family:'bass' },'bass'],
    [{ type:'instrument',category:'arp' },'arp'],
    [{ type:'instrument',family:'pads' },'pad'],
    [{ type:'instrument',family:'synth' },'lead'],
    [{ type:'instrument',family:'keys' },'keys'],
    [{ type:'instrument',family:'keys',band:{key:'bass'} },'bass'],
  ];
  assert.equal(SS.profiles,undefined);
  for (const [track,role] of cases) {
    assert.equal(SS.automix.roleOf(track),role);
    assert.ok(SS.automix.ROLE_LABELS[role]);
  }
});
test('Les anciens projets gardent leurs réglages audio sans les métadonnées de profils', () => {
  const p=SS.newProject();
  p.tracks=[SS.newTrack({type:'drum',name:'Kick',sound:'bd',color:'#ff0000'},p)];
  p.tracks[0].mix={eq:{on:true,low:{f:80,g:2}},comp:{on:true,th:-12}};
  p.tracks[0].mixProfile={id:'old',name:'Ancien profil'};
  p.master={...SS.masterParams(p),volume:0.6};
  p.masterProfile={id:'old',name:'Ancien master'};
  const loaded=SS.normalizeProject(p);
  assert.equal(loaded.tracks[0].mix.eq.low.g,2);
  assert.equal(loaded.tracks[0].mix.comp.th,-12);
  assert.equal(loaded.master.volume,0.6);
  assert.ok(!('mixProfile' in loaded.tracks[0]));
  assert.ok(!('masterProfile' in loaded));
});
