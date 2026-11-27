'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGasPartial } = require('./helpers/extractGasFunction');

function loadWithUnit(displayUnit) {
    // js_utils.html has unrelated top-level code (the "Glow Registry") that reads
    // `window` at load time, so a minimal stub must be seeded for the partial to
    // evaluate at all in this sandboxed VM context.
    return loadGasPartial('Frontend/JS/Core/js_utils.html', {
        appState: { settings: { displayUnit } },
        window: {}
    });
}

test('formatForDisplay renders a mixed fractional inch as hyphenated, not space-separated', () => {
    const { formatForDisplay } = loadWithUnit('frac_in');
    // 16.75in = 425.45mm
    assert.equal(formatForDisplay(425.45), '16-3/4');
});

test('formatForDisplay still renders a bare fraction and a whole number without a separator', () => {
    const { formatForDisplay } = loadWithUnit('frac_in');
    assert.equal(formatForDisplay(19.05), '3/4');   // 0.75in, whole === 0
    assert.equal(formatForDisplay(406.4), '16');    // exactly 16in, no remainder
});

test('parseToBaseUnit reads the new hyphenated mixed format back to the correct mm value', () => {
    const { parseToBaseUnit } = loadWithUnit('frac_in');
    assert.ok(Math.abs(parseToBaseUnit('16-3/4') - 425.45) < 0.001);
});

test('parseToBaseUnit still reads the legacy space-separated mixed format (backward compatible)', () => {
    const { parseToBaseUnit } = loadWithUnit('frac_in');
    assert.ok(Math.abs(parseToBaseUnit('16 3/4') - 425.45) < 0.001);
});

test('parseToBaseUnit still reads a bare fraction and a bare whole number', () => {
    const { parseToBaseUnit } = loadWithUnit('frac_in');
    assert.ok(Math.abs(parseToBaseUnit('3/4') - 19.05) < 0.001);
    assert.ok(Math.abs(parseToBaseUnit('16') - 406.4) < 0.001);
});

test('display -> parse round-trips exactly for a hyphenated mixed value', () => {
    const { formatForDisplay, parseToBaseUnit } = loadWithUnit('frac_in');
    const original = 425.45; // 16-3/4in
    const displayed = formatForDisplay(original);
    assert.equal(displayed, '16-3/4');
    assert.ok(Math.abs(parseToBaseUnit(displayed) - original) < 0.001);
});

test('a bare negative fraction (no leading whole number) is unaffected by the new hyphen handling', () => {
    const { parseToBaseUnit } = loadWithUnit('frac_in');
    // Regression guard: the narrow hyphen regex only matches "digits-digits/digits",
    // so a lone "-3/4" must still fall through to the original bare-fraction parsing
    // instead of being misread as a "0-3/4" mixed number.
    const { parseDimensionNumber } = loadWithUnit('frac_in');
    assert.equal(parseDimensionNumber('-3/4'), -0.75);
    // Negative dimensions are invalid input and parse to 0 (never a positive 0-3/4).
    assert.equal(parseToBaseUnit('-3/4'), 0);
});

test('mm and decimal-inch display are unaffected by the fractional-inch separator change', () => {
    const mmCtx = loadWithUnit('mm');
    assert.equal(mmCtx.formatForDisplay(425.45), '425.45');

    const decCtx = loadWithUnit('dec_in');
    assert.equal(decCtx.formatForDisplay(425.45), '16.75');
});

// Regression guard for the "48x48 sheet part rejected as too large after CSV
// round-trip" bug: 48 * 25.4 in raw JS floating point is 1219.1999999999998,
// not the exact 1219.2 — so a value typed directly into the UI and the same
// value re-entered via CSV export/import (which rounds to 2 decimal places)
// used to land on two bit-different mm values, and the packer's zero-tolerance
// fit check treated the reimported part as microscopically too large.
test('parseToBaseUnit (dec_in) rounds away binary-float multiplication noise', () => {
    const { parseToBaseUnit } = loadWithUnit('dec_in');
    // Raw JS: 48 * 25.4 === 1219.1999999999998, not 1219.2 — assert the clean value.
    assert.equal(parseToBaseUnit('48'), 1219.2);
});

test('parseToBaseUnit (dec_in) matches the CSV-import path\'s own rounding for the same input, bit-for-bit', () => {
    const { parseToBaseUnit } = loadWithUnit('dec_in');
    // Mirrors js_import.html's processMapping(): Math.round(raw * scaleFactor * 100) / 100,
    // scaleFactor = 25.4 for an inches-unit import.
    const importPathResult = Math.round(48 * 25.4 * 100) / 100;
    assert.equal(parseToBaseUnit('48'), importPathResult);
});

test('parseToBaseUnit (frac_in) also rounds away binary-float multiplication noise', () => {
    const { parseToBaseUnit } = loadWithUnit('frac_in');
    assert.equal(parseToBaseUnit('48'), 1219.2);
    // 16.75in = 425.45mm exactly, at 6-decimal precision.
    assert.equal(parseToBaseUnit('16-3/4'), 425.45);
});
