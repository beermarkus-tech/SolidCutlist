'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGasPartial } = require('./helpers/extractGasFunction');

// Regression guard: a catalog price's unit system is stored on the item, so switching
// the display unit must never silently re-interpret stored prices (€10/m ≠ €10/ft).
function load(displayUnit) {
    const appState = {
        settings: { displayUnit },
        profiles: [
            { id: 'P1', type: 'lumber', thickness: 38, width: 89 },
            { id: 'S1', type: 'sheet',  thickness: 18, width: 0 }
        ],
        catalog: [], jobs: []
    };
    const ctx = loadGasPartial('Frontend/JS/Domain/js_prices.html', {
        appState,
        t: k => k,
        registerEditableTable: () => {},
        document: { addEventListener: () => {}, getElementById: () => null }
    });
    return { ctx, appState };
}

test('metric linear price keeps its value after switching to inches', () => {
    const { ctx, appState } = load('mm');
    const item = { profileId: 'P1', categoryId: 'lumber', length: 3000, price: 10, priceUnit: 'linear' };
    appState.catalog.push(item);
    ctx.stampAllMissingPriceSystems();
    assert.equal(item.priceSystem, 'metric');
    const before = ctx.calculateCostPerPiece(item);
    assert.ok(Math.abs(before - 30) < 1e-9); // 3 m × €10/m

    appState.settings.displayUnit = 'frac_in';
    assert.ok(Math.abs(ctx.calculateCostPerPiece(item) - before) < 1e-9);
});

test('imperial area price keeps its value after switching to mm', () => {
    const { ctx, appState } = load('dec_in');
    const sheet = { profileId: 'S1', categoryId: 'sheet', length: 2438.4, width: 1219.2, price: 2, priceUnit: 'area' };
    appState.catalog.push(sheet);
    ctx.stampAllMissingPriceSystems();
    const before = ctx.calculateCostPerPiece(sheet);
    assert.ok(Math.abs(before - 64) < 1e-6); // 8 ft × 4 ft = 32 sqft × $2

    appState.settings.displayUnit = 'mm';
    assert.ok(Math.abs(ctx.calculateCostPerPiece(sheet) - before) < 1e-6);
});

test('normalized display converts into the current display system', () => {
    const { ctx, appState } = load('mm');
    const item = { profileId: 'P1', categoryId: 'lumber', length: 3048, price: 10, priceUnit: 'linear', priceSystem: 'metric' };
    assert.equal(ctx.getNormalizedPriceDisplay(item, 'linear'), '10.00');   // €/m
    appState.settings.displayUnit = 'frac_in';
    assert.equal(ctx.getNormalizedPriceDisplay(item, 'linear'), '3.05');    // €/ft = 10 × 0.3048
});

test('stamping never overwrites an existing system, and jobs use their own unit', () => {
    const { ctx, appState } = load('mm');
    const kept = { price: 1, priceUnit: 'linear', priceSystem: 'imperial' };
    const jobItem = { price: 1, priceUnit: 'linear' };
    appState.catalog.push(kept);
    appState.jobs.push({ settings: { displayUnit: 'dec_in' }, catalog: [jobItem] });
    ctx.stampAllMissingPriceSystems();
    assert.equal(kept.priceSystem, 'imperial');
    assert.equal(jobItem.priceSystem, 'imperial');
});

test('per-piece prices are unaffected by unit system', () => {
    const { ctx } = load('mm');
    assert.equal(ctx.calculateCostPerPiece({ profileId: 'P1', price: 7.5, priceUnit: 'piece', priceSystem: 'imperial' }), 7.5);
});
