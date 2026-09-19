'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGasPartial } = require('./helpers/extractGasFunction');

const { mergeShoppingResults } = loadGasPartial('Frontend/JS/Modules/js_bulk_margin.html');

test('a margin top-up sharing the packer\'s catalog item merges into one line (8+2=10)', () => {
    const packerEntry = { sku: { profileId: 'PR-1', materialId: 'M-1', category: 'lumber' }, success: true,
        purchase: { catalogItem: { id: 'CAT-1', storeId: 'store-1', length: 2438 }, boardsNeeded: 8, totalCost: 40, layout: [{ cuts: [{}] }] } };
    const marginEntry = { sku: { profileId: 'PR-1', materialId: 'M-1', category: 'lumber' }, success: true,
        purchase: { catalogItem: { id: 'CAT-1', storeId: 'store-1', length: 2438 }, boardsNeeded: 2, totalCost: 10, layout: [] } };

    const merged = mergeShoppingResults([packerEntry, marginEntry]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].purchase.boardsNeeded, 10);
    assert.equal(merged[0].purchase.totalCost, 50);
});

test('entries with different catalog items stay as separate lines', () => {
    const a = { sku: { profileId: 'PR-1', materialId: 'M-1', category: 'lumber' }, success: true,
        purchase: { catalogItem: { id: 'CAT-1', storeId: 'store-1', length: 2438 }, boardsNeeded: 8, totalCost: 40 } };
    const b = { sku: { profileId: 'PR-2', materialId: 'M-2', category: 'lumber' }, success: true,
        purchase: { catalogItem: { id: 'CAT-2', storeId: 'store-1', length: 3000 }, boardsNeeded: 2, totalCost: 20 } };

    const merged = mergeShoppingResults([a, b]);
    assert.equal(merged.length, 2);
});

test('error entries are never merged, even alongside a matching-looking success entry', () => {
    const err = { sku: { profileId: 'PR-1', materialId: 'M-1', category: 'lumber' }, error: 'no source' };
    const ok = { sku: { profileId: 'PR-1', materialId: 'M-1', category: 'lumber' }, success: true,
        purchase: { catalogItem: { id: 'CAT-1', storeId: 'store-1', length: 2438 }, boardsNeeded: 1, totalCost: 5 } };

    const merged = mergeShoppingResults([err, ok]);
    assert.equal(merged.length, 2);
});

test('two shop_stock groups with different length/grain (no catalog id) stay separate', () => {
    const a = { sku: {}, success: true, purchase: { catalogItem: { storeId: 'shop_stock', length: 1000, grain: 'none' }, boardsNeeded: 1, totalCost: 0 } };
    const b = { sku: {}, success: true, purchase: { catalogItem: { storeId: 'shop_stock', length: 2000, grain: 'none' }, boardsNeeded: 1, totalCost: 0 } };

    const merged = mergeShoppingResults([a, b]);
    assert.equal(merged.length, 2);
});

test('two shop_stock entries with identical length/width/grain (no id) DO merge', () => {
    const a = { sku: {}, success: true, purchase: { catalogItem: { storeId: 'shop_stock', length: 1000, width: 0, grain: 'none' }, boardsNeeded: 1, totalCost: 0 } };
    const b = { sku: {}, success: true, purchase: { catalogItem: { storeId: 'shop_stock', length: 1000, width: 0, grain: 'none' }, boardsNeeded: 2, totalCost: 0 } };

    const merged = mergeShoppingResults([a, b]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].purchase.boardsNeeded, 3);
});

test('does not mutate the original input objects (results array stays safe for diagrams/analytics)', () => {
    const packerEntry = { sku: {}, success: true, purchase: { catalogItem: { id: 'CAT-1', storeId: 'store-1', length: 2438 }, boardsNeeded: 8, totalCost: 40, layout: [{ cuts: [{}] }] } };
    const marginEntry = { sku: {}, success: true, purchase: { catalogItem: { id: 'CAT-1', storeId: 'store-1', length: 2438 }, boardsNeeded: 2, totalCost: 10 } };
    const originalBoards = packerEntry.purchase.boardsNeeded;

    mergeShoppingResults([packerEntry, marginEntry]);
    assert.equal(packerEntry.purchase.boardsNeeded, originalBoards);
});
