'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGasPartial } = require('./helpers/extractGasFunction');

const load = unit => loadGasPartial('Frontend/JS/Core/js_utils.html', { appState: { settings: { displayUnit: unit } }, window: {} });

test('mm input accepts a decimal comma', () => {
    assert.equal(load('mm').parseToBaseUnit('12,5'), 12.5);
});
test('frac_in input tolerates double spaces and an inch mark', () => {
    const { parseToBaseUnit } = load('frac_in');
    assert.ok(Math.abs(parseToBaseUnit('1  3/4') - 44.45) < 1e-6);
    assert.ok(Math.abs(parseToBaseUnit('1 3/4"') - 44.45) < 1e-6);
});
test('dec_in input accepts a decimal comma', () => {
    assert.ok(Math.abs(load('dec_in').parseToBaseUnit('1,5') - 38.1) < 1e-6);
});
test('garbage and negative input parse to 0', () => {
    const { parseToBaseUnit } = load('mm');
    assert.equal(parseToBaseUnit('abc'), 0);
    assert.equal(parseToBaseUnit('-5'), 0);
    assert.equal(parseToBaseUnit(''), 0);
});
test('numeric (non-string) input still works', () => {
    assert.equal(load('mm').parseToBaseUnit(42), 42);
});
