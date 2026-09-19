'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGasPartial } = require('./helpers/extractGasFunction');

// js_import.html has unrelated top-level code (appState.stagingParts init, a
// DOMContentLoaded listener) that runs at load time, so minimal stubs must be
// seeded for the partial to evaluate at all in this sandboxed VM context.
const { _parseImportDimension } = loadGasPartial('Frontend/JS/Modules/js_import.html', {
    appState: {},
    window: {},
    document: { addEventListener: () => {} }
});

test('plain decimal (SketchUp-style)', () => {
    assert.equal(_parseImportDimension('16.5'), 16.5);
    assert.equal(_parseImportDimension('16'), 16);
});

test('a stray unit suffix is stripped from a plain decimal', () => {
    assert.equal(_parseImportDimension('16.5"'), 16.5);
    assert.equal(_parseImportDimension('16.5mm'), 16.5);
});

test('regression guard: a dash-mixed fraction must NOT be mangled into a huge plain number', () => {
    // Before the fix, "16-1/2" fell through to the digit-stripping fallback and
    // concatenated every digit ("16", "1", "2" -> "1612"), silently producing a
    // wildly wrong value instead of 16.5.
    const result = _parseImportDimension('16-1/2');
    assert.equal(result, 16.5);
    assert.notEqual(result, 1612);
});

test('dash-separated mixed fraction (current CSV export format)', () => {
    assert.equal(_parseImportDimension('16-1/2'), 16.5);
    assert.equal(_parseImportDimension('1-3/4'), 1.75);
});

test('space-separated mixed fraction (legacy format, still accepted)', () => {
    assert.equal(_parseImportDimension('16 1/2'), 16.5);
    assert.equal(_parseImportDimension('1 3/4'), 1.75);
});

test('bare fraction, no whole part', () => {
    assert.equal(_parseImportDimension('1/2'), 0.5);
    assert.equal(_parseImportDimension('3/4'), 0.75);
});

test('a leading apostrophe (spreadsheet force-text marker) is stripped before parsing', () => {
    assert.equal(_parseImportDimension("'16.5"), 16.5);
    assert.equal(_parseImportDimension("'16-1/2"), 16.5);
    assert.equal(_parseImportDimension("'16 1/2"), 16.5);
    assert.equal(_parseImportDimension("'3/4"), 0.75);
});

test('empty/falsy input returns 0', () => {
    assert.equal(_parseImportDimension(''), 0);
    assert.equal(_parseImportDimension(null), 0);
    assert.equal(_parseImportDimension(undefined), 0);
});

test('garbage input falls back to 0 rather than throwing', () => {
    assert.equal(_parseImportDimension('abc'), 0);
});
