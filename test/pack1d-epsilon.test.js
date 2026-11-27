'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGasPartial } = require('./helpers/extractGasFunction');

const ctx = loadGasPartial('Frontend/JS/Modules/js_optimizer.html', {
    document: { addEventListener: () => {} },
    appState: { settings: {} }
});
const inch = x => x * 25.4;
const parts = (n, len) => Array.from({ length: n }, (_, i) => ({ partId: 'p' + i, name: 'p', length: inch(len), width: 0, grain: 'none' }));

// Regression guard: inch dimensions converted to mm carry binary-float noise, which made
// exact fits fail (3 × 32" from a 96" board placed only 2).
for (const [n, len] of [[3, 32], [8, 12], [6, 16], [4, 24]]) {
    test(`pack1D: ${n} × ${len}" fit exactly on one 96" board (no kerf, no trim)`, () => {
        const r = ctx.pack1D(parts(n, len), inch(96), 0, 0);
        assert.equal(r.unmapped.length, 0);
        assert.equal(r.boards.length, 1);
    });
}

test('pack1D: 4 × 23-29/32" + 3 × 1/8" kerf fit exactly in 96"', () => {
    const r = ctx.pack1D(parts(4, 23.90625), inch(96), inch(0.125), 0);
    assert.equal(r.boards.length, 1);
});

test('packSingle1D: exact fit accepted', () => {
    const r = ctx.packSingle1D(parts(3, 32), inch(96), 0, 0);
    assert.equal(r.unmapped.length, 0);
});

test('pack1D: a part genuinely 1 mm too long is still rejected', () => {
    const r = ctx.pack1D([{ partId: 'x', length: 2001, width: 0 }], 2000, 0, 0);
    assert.equal(r.unmapped.length, 1);
});

test('checkFit: a sheet without a grain value does not force rotation of grained parts', () => {
    const part = { width: 300, length: 1000, grain: 'length' };
    const rect = { w: 1220, l: 2440 };
    const fit = ctx.checkFit(part, rect, undefined);
    assert.equal(fit.fits, true);
    // With no sheet grain the packer may pick either orientation; it must not be
    // *forced* rotated: the normal orientation has to remain legal.
    const forced = ctx.checkFit({ width: 1220, length: 2440, grain: 'length' }, rect, undefined);
    assert.deepEqual([forced.fits, forced.rotated], [true, false]);
});
