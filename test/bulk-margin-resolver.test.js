'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGasPartial } = require('./helpers/extractGasFunction');

const { resolveShortfallGreedy } = loadGasPartial('Frontend/JS/Modules/js_bulk_margin.html');

test('single option covers the remainder exactly', () => {
    const res = resolveShortfallGreedy(4000, [{ id: 'A', length: 4000, price: 10 }]);
    assert.equal(res.totalBoards, 1);
    assert.equal(res.coveredLength, 4000);
    assert.equal(res.totalCost, 10);
    assert.equal(res.groups.length, 1);
    assert.equal(res.groups[0].boardsNeeded, 1);
});

test('worked example from the brief: 84m required, only 4m boards available', () => {
    // 80m x 1.05 margin = 84m target; store sells only 4m boards -> 21 boards
    const res = resolveShortfallGreedy(84000, [{ id: 'A', length: 4000, price: 12 }]);
    assert.equal(res.totalBoards, 21);
    assert.equal(res.coveredLength, 84000);
    assert.equal(res.totalCost, 21 * 12);
});

test('remainder needing 3 boards overshoots on the last board (natural ceiling, no rounding step)', () => {
    const res = resolveShortfallGreedy(2500, [{ id: 'A', length: 1000, price: 5 }]);
    assert.equal(res.totalBoards, 3);
    assert.equal(res.coveredLength, 3000);
    assert.ok(res.coveredLength >= 2500);
});

test('price/length ratio tie is broken by longest length first', () => {
    // Both options have identical $/mm ratio (0.01); the 2000mm option should win every pick.
    const res = resolveShortfallGreedy(1000, [
        { id: 'short', length: 1000, price: 10 },
        { id: 'long', length: 2000, price: 20 }
    ]);
    assert.equal(res.groups.length, 1);
    assert.equal(res.groups[0].optionId, 'long');
});

test('a cheaper absolute price but worse ratio is NOT chosen over a better-ratio option', () => {
    // 'cheapAbs': $8 total but $0.008/mm (worse ratio). 'bestRatio': $10 total but $0.005/mm (better ratio).
    const res = resolveShortfallGreedy(500, [
        { id: 'cheapAbs', length: 1000, price: 8 },
        { id: 'bestRatio', length: 2000, price: 10 }
    ]);
    assert.equal(res.groups.length, 1);
    assert.equal(res.groups[0].optionId, 'bestRatio');
});

test('remainingLength <= 0 needs zero boards and costs nothing', () => {
    // Note: res.groups is an array from the vm sandbox's own realm, so it's compared
    // by content (.length) here rather than via deepEqual against a literal [] —
    // cross-realm arrays can otherwise trip Node's strict reference/prototype check.
    const zero = resolveShortfallGreedy(0, [{ id: 'A', length: 1000, price: 5 }]);
    assert.equal(zero.totalBoards, 0);
    assert.equal(zero.totalCost, 0);
    assert.equal(zero.groups.length, 0);

    const negative = resolveShortfallGreedy(-500, [{ id: 'A', length: 1000, price: 5 }]);
    assert.equal(negative.totalBoards, 0);
});

test('empty storeOptions returns a defined "no source" shape instead of throwing', () => {
    const res = resolveShortfallGreedy(1000, []);
    assert.equal(res.totalBoards, 0);
    assert.equal(res.unresolved, true);
});

test('options with zero/negative length or price are filtered out, not crashed on', () => {
    const res = resolveShortfallGreedy(1000, [
        { id: 'bad-length', length: 0, price: 5 },
        { id: 'bad-length-neg', length: -100, price: 5 },
        { id: 'bad-price', length: 1000, price: -1 },
        { id: 'ok', length: 1000, price: 5 }
    ]);
    assert.equal(res.groups.length, 1);
    assert.equal(res.groups[0].optionId, 'ok');
});
