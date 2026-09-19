'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGasPartial } = require('./helpers/extractGasFunction');

// checkFit() itself is a pure, appState-free geometry function, but
// js_optimizer.html has unrelated top-level code (a DOMContentLoaded listener)
// that runs at load time, so a minimal stub must be seeded for the partial to
// evaluate at all in this sandboxed VM context.
const { checkFit } = loadGasPartial('Frontend/JS/Modules/js_optimizer.html', {
    document: { addEventListener: () => {} }
});

test('a part exactly matching the rectangle fits', () => {
    const part = { width: 1219.2, length: 2438.4, grain: 'none' };
    const rect = { w: 1219.2, l: 2438.4 };
    assert.equal(checkFit(part, rect, 'none').fits, true);
});

// Regression guard for the "48x48 sheet part rejected as too large after CSV
// round-trip" bug: two conceptually-equal dimensions that differ only by
// binary-float noise (e.g. 1219.1999999999998 vs 1219.2) must still fit.
test('a part 1e-10mm over the rectangle (simulated float noise) still fits', () => {
    const part = { width: 1219.2 + 1e-10, length: 500, grain: 'none' };
    const rect = { w: 1219.2, l: 2438.4 };
    assert.equal(checkFit(part, rect, 'none').fits, true);
});

test('a part genuinely 1mm too large is still correctly rejected (non-regression)', () => {
    // Square part vs. square rect so rotation can't rescue the fit either way.
    const part = { width: 1220.2, length: 1220.2, grain: 'none' };
    const rect = { w: 1219.2, l: 1219.2 };
    assert.equal(checkFit(part, rect, 'none').fits, false);
});

test('a part that only fits rotated is still detected as such', () => {
    const part = { width: 2438.4, length: 1219.2, grain: 'none' };
    const rect = { w: 1219.2, l: 2438.4 };
    const result = checkFit(part, rect, 'none');
    assert.equal(result.fits, true);
    assert.equal(result.rotated, true);
});

test('grain constraints still block rotation when grain must run a specific way', () => {
    // Part and sheet share the same grain direction -> rotating would cross the grain, illegal.
    const part = { width: 500, length: 300, grain: 'length' };
    const rect = { w: 300, l: 1219.2 }; // only fits rotated by raw dimensions
    const result = checkFit(part, rect, 'length');
    assert.equal(result.fits, false);
});

test('a part slightly too large even with the epsilon tolerance is rejected', () => {
    // Square part vs. square rect, 0.002mm over (outside DIM_EPSILON) in both dims
    // so rotation can't rescue the fit either.
    const part = { width: 1219.202, length: 1219.202, grain: 'none' };
    const rect = { w: 1219.2, l: 1219.2 };
    assert.equal(checkFit(part, rect, 'none').fits, false);
});
