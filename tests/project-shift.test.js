const test = require('node:test');
const assert = require('node:assert');
globalThis.window = globalThis;
require('../js/project.js');

test('micro-décalage : borné à un demi-pas, arrondi au centième, absent si nul', () => {
  assert.strictEqual(SS.cleanShift({ shift: 0.8 }).shift, 0.5);
  assert.strictEqual(SS.cleanShift({ shift: -0.9 }).shift, -0.5);
  assert.strictEqual(SS.cleanShift({ shift: 0.123 }).shift, 0.12);
  assert.ok(!('shift' in SS.cleanShift({ shift: 0 })));
  assert.ok(!('shift' in SS.cleanShift({ shift: 'x' })));
  assert.ok(!('shift' in SS.cleanShift({})));
});
