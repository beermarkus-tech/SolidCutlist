'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGasPartial } = require('./helpers/extractGasFunction');

// js_import.html has unrelated top-level code (appState.stagingParts init, a
// DOMContentLoaded listener) that runs at load time, so minimal stubs must be
// seeded for the partial to evaluate at all in this sandboxed VM context.
const { _parseImportQty } = loadGasPartial('Frontend/JS/Modules/js_import.html', {
    appState: {},
    window: {},
    document: { addEventListener: () => {} }
});

test('valid positive integer strings parse as-is', () => {
    assert.equal(_parseImportQty('1'), 1);
    assert.equal(_parseImportQty('5'), 5);
    assert.equal(_parseImportQty('42'), 42);
});

test('decimal strings truncate via parseInt', () => {
    assert.equal(_parseImportQty('3.7'), 3);
    assert.equal(_parseImportQty('1.99'), 1);
});

test('blank, undefined, or null input (unmapped Qty column, or an empty cell) defaults to 1', () => {
    assert.equal(_parseImportQty(undefined), 1);
    assert.equal(_parseImportQty(null), 1);
    assert.equal(_parseImportQty(''), 1);
    assert.equal(_parseImportQty('   '), 1);
});

test('zero and negative values default to 1 — a part can\'t have zero or negative quantity', () => {
    assert.equal(_parseImportQty('0'), 1);
    assert.equal(_parseImportQty('-5'), 1);
});

test('non-numeric garbage defaults to 1 rather than throwing or producing NaN', () => {
    assert.equal(_parseImportQty('abc'), 1);
    assert.equal(_parseImportQty('N/A'), 1);
});

test('whitespace-padded values parse correctly', () => {
    assert.equal(_parseImportQty('  7  '), 7);
});
