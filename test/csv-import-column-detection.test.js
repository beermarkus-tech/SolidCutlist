'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGasPartial } = require('./helpers/extractGasFunction');

// js_import.html has unrelated top-level code (appState.stagingParts init, a
// DOMContentLoaded listener) that runs at load time, so minimal stubs must be
// seeded for the partial to evaluate at all in this sandboxed VM context.
const { _findHeaderColumnIndex } = loadGasPartial('Frontend/JS/Modules/js_import.html', {
    appState: {},
    window: {},
    document: { addEventListener: () => {} }
});

// The exact real OpenCutList export header row, in its real fixed column order —
// the same one renderMappingUI()'s hardcoded fallbackIndex values assume.
const OPENCUTLIST_HEADERS = [
    'Number', 'Path', 'Instance count', 'Designation', 'Length - raw',
    'Width - raw', 'Thickness - raw', 'Length', 'Width', 'Thickness',
    'Entity type', 'Description', 'Material'
];

test('every OpenCutList real header resolves to the same index the current hardcoded fallback already uses', () => {
    // These candidate lists and expected indexes mirror exactly what renderMappingUI() wires up.
    assert.equal(_findHeaderColumnIndex(OPENCUTLIST_HEADERS, ['designation', 'name', 'part name']), 3);
    assert.equal(_findHeaderColumnIndex(OPENCUTLIST_HEADERS, ['path', 'group', 'group path']), 1);
    assert.equal(_findHeaderColumnIndex(OPENCUTLIST_HEADERS, ['length - raw', 'length', 'raw length']), 4);
    assert.equal(_findHeaderColumnIndex(OPENCUTLIST_HEADERS, ['width - raw', 'width', 'raw width']), 5);
    assert.equal(_findHeaderColumnIndex(OPENCUTLIST_HEADERS, ['thickness - raw', 'thickness', 'raw thickness']), 6);
    assert.equal(_findHeaderColumnIndex(OPENCUTLIST_HEADERS, ['material']), 12);
});

test('a reordered/renamed header set is still detected correctly by header text', () => {
    const headers = ['Material', 'Part Name', 'Group', 'Length', 'Width', 'Thickness'];
    assert.equal(_findHeaderColumnIndex(headers, ['designation', 'name', 'part name']), 1);
    assert.equal(_findHeaderColumnIndex(headers, ['path', 'group', 'group path']), 2);
    assert.equal(_findHeaderColumnIndex(headers, ['length - raw', 'length', 'raw length']), 3);
    assert.equal(_findHeaderColumnIndex(headers, ['width - raw', 'width', 'raw width']), 4);
    assert.equal(_findHeaderColumnIndex(headers, ['thickness - raw', 'thickness', 'raw thickness']), 5);
    assert.equal(_findHeaderColumnIndex(headers, ['material']), 0);
});

test('SolidCutlist\'s own exported CSV headers (with a unit suffix in parens) are detected too', () => {
    // Matches buildPartsCsv()'s header row shape from js_export.html.
    const headers = ['Project', 'Group', 'Part Name', 'Category', 'Qty', 'Bulk', 'Profile',
                      'Width (mm)', 'Length (mm)', 'Thickness (mm)', 'Material', 'Grain',
                      'Weight (kg)', 'Cost ($)'];
    assert.equal(_findHeaderColumnIndex(headers, ['designation', 'name', 'part name']), 2);
    assert.equal(_findHeaderColumnIndex(headers, ['path', 'group', 'group path']), 1);
    assert.equal(_findHeaderColumnIndex(headers, ['width - raw', 'width', 'raw width']), 7);
    assert.equal(_findHeaderColumnIndex(headers, ['length - raw', 'length', 'raw length']), 8);
    assert.equal(_findHeaderColumnIndex(headers, ['thickness - raw', 'thickness', 'raw thickness']), 9);
    assert.equal(_findHeaderColumnIndex(headers, ['material']), 10);
});

test('matching is case-insensitive', () => {
    assert.equal(_findHeaderColumnIndex(['MATERIAL'], ['material']), 0);
    assert.equal(_findHeaderColumnIndex(['Length - Raw'], ['length - raw']), 0);
});

test('no match returns -1, so the caller falls back to its hardcoded default', () => {
    assert.equal(_findHeaderColumnIndex(['Foo', 'Bar', 'Baz'], ['material']), -1);
});

test('an empty or missing header list never throws', () => {
    assert.equal(_findHeaderColumnIndex([], ['material']), -1);
    assert.equal(_findHeaderColumnIndex(undefined, ['material']), -1);
});

const QTY_CANDIDATES = ['qty', 'quantity', 'count', 'amount', 'pcs', 'pieces'];

test('a "Qty" or "Quantity" header is detected', () => {
    assert.equal(_findHeaderColumnIndex(['Name', 'Qty', 'Length'], QTY_CANDIDATES), 1);
    assert.equal(_findHeaderColumnIndex(['Name', 'Quantity', 'Length'], QTY_CANDIDATES), 1);
});

test('a genuine OpenCutList header set has no qty-like column, so detection returns -1 — the caller\'s fallbackIndex of -1 then keeps the field unmapped, matching "SketchUp files leave Qty unassigned"', () => {
    assert.equal(_findHeaderColumnIndex(OPENCUTLIST_HEADERS, QTY_CANDIDATES), -1);
});

test('SolidCutlist\'s own exported "Qty" header (no unit suffix) is detected too', () => {
    const headers = ['Project', 'Group', 'Part Name', 'Category', 'Qty', 'Bulk', 'Profile',
                      'Width (mm)', 'Length (mm)', 'Thickness (mm)', 'Material', 'Grain',
                      'Weight (kg)', 'Cost ($)'];
    assert.equal(_findHeaderColumnIndex(headers, QTY_CANDIDATES), 4);
});
