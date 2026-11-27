'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGasPartials } = require('./helpers/extractGasFunction');

// js_import.html has unrelated top-level code (appState.stagingParts init, a
// DOMContentLoaded listener) that runs at load time, so minimal stubs must be
// seeded for the partial to evaluate at all in this sandboxed VM context.
const { _parseImportDimension } = loadGasPartials(['Frontend/JS/Core/js_utils.html', 'Frontend/JS/Modules/js_import.html'], {
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

// Regression guards for European decimal commas and trailing inch marks, which the
// old digit-stripping fallback concatenated ("18,5" -> 185, '23 1/2"' -> 2312).
test('decimal comma is read as a decimal point', () => {
    assert.equal(_parseImportDimension('18,5'), 18.5);
    assert.equal(_parseImportDimension('1.200,5'), 1200.5);
});
test('thousands separators are ignored', () => {
    assert.equal(_parseImportDimension('1,200'), 1200);
    assert.equal(_parseImportDimension('1,200.5'), 1200.5);
});
test('fractions followed by an inch mark', () => {
    assert.equal(_parseImportDimension('3/4"'), 0.75);
    assert.equal(_parseImportDimension('23 1/2"'), 23.5);
    assert.equal(_parseImportDimension('23-1/2 in'), 23.5);
});
test('extra spaces in a mixed fraction', () => {
    assert.equal(_parseImportDimension('1  3/4'), 1.75);
});

const { _splitCsvLine, _detectCsvDelimiter } = loadGasPartials(['Frontend/JS/Core/js_utils.html', 'Frontend/JS/Modules/js_import.html'], {
    appState: {}, window: {}, document: { addEventListener: () => {} }
});
test('quoted CSV fields may contain the delimiter and escaped quotes', () => {
    assert.deepEqual([..._splitCsvLine('"Shelf, top";"18,5";2', ';')], ['Shelf, top', '18,5', '2']);
    assert.deepEqual([..._splitCsvLine('"Leg 3/4"" thick",450,4', ',')], ['Leg 3/4" thick', '450', '4']);
});
test('delimiter detection picks the one producing most columns', () => {
    assert.equal(_detectCsvDelimiter('Name;Length;Width'), ';');
    assert.equal(_detectCsvDelimiter('Name,Length,Width'), ',');
    assert.equal(_detectCsvDelimiter('Name\tLength\tWidth'), '\t');
    assert.equal(_detectCsvDelimiter('"Name; with semi",Length,Width'), ',');
});

const { _matchImportProfile } = loadGasPartials(['Frontend/JS/Core/js_utils.html', 'Frontend/JS/Modules/js_import.html'], {
    appState: {}, window: {}, document: { addEventListener: () => {} }
});
test('profile matching picks the nearest profile, not the first within tolerance', () => {
    const profiles = [{ id: 'S19', type: 'sheet', thickness: 19 }, { id: 'S18', type: 'sheet', thickness: 18 }];
    assert.equal(_matchImportProfile(profiles, 'sheet', 18.2, 0).id, 'S18');
});
test('lumber profile matches with thickness/width swapped in the CSV', () => {
    const profiles = [{ id: 'L', type: 'lumber', thickness: 38, width: 89 }];
    assert.equal(_matchImportProfile(profiles, 'lumber', 89, 38).id, 'L');
    assert.equal(_matchImportProfile(profiles, 'lumber', 45, 89), undefined);
});
