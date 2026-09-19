'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGasPartial } = require('./helpers/extractGasFunction');

// calculateCostPerPiece is normally defined in js_prices.html and reads appState.
// For these fixtures every catalog item's price is already the absolute per-piece
// cost, so the stub just returns it directly — matching the resolver's own tests.
const { computeBulkResults } = loadGasPartial('Frontend/JS/Modules/js_bulk_margin.html', {
    calculateCostPerPiece: item => item.price
});

function baseAppState(overrides) {
    return Object.assign({
        stock: [],
        catalog: [],
        settings: { optimizer: {}, bulkMinimumStockLength: 0, marginPercent: 0 }
    }, overrides);
}

test('worked example from the brief: 80m required, 5% margin, only 4m boards, no stock', () => {
    const parts = [{ id: 'PART-1', category: 'lumber', is_bulk: true, status: 'ready',
                      profileId: 'PR-1', materialId: 'M-1', length: 80000 }];
    const appState = baseAppState({
        catalog: [{ id: 'CAT-1', profileId: 'PR-1', materialId: 'M-1', categoryId: 'lumber',
                    storeId: 'store-1', length: 4000, price: 12 }],
        settings: { optimizer: { marginEnabled: true }, bulkMinimumStockLength: 0, marginPercent: 5 }
    });

    const results = computeBulkResults(parts, appState, ['store-1']);
    assert.equal(results.length, 1);
    assert.equal(results[0].success, true);
    assert.equal(results[0].purchase.boardsNeeded, 21);
    assert.equal(results[0].purchase.layout.length, 0); // cross-realm array, compare by content not deepEqual
    assert.equal(results[0].sku.category, 'lumber');
});

test('stock alone covering the requirement is listed as a shop-stock line, not silently consumed', () => {
    const parts = [{ id: 'PART-1', category: 'lumber', is_bulk: true, status: 'ready',
                      profileId: 'PR-1', materialId: 'M-1', length: 5000 }];
    const appState = baseAppState({
        stock: [{ profileId: 'PR-1', materialId: 'M-1', categoryId: 'lumber', length: 6000, qty: 1 }],
        catalog: [{ id: 'CAT-1', profileId: 'PR-1', materialId: 'M-1', categoryId: 'lumber',
                    storeId: 'store-1', length: 4000, price: 12 }]
    });

    const results = computeBulkResults(parts, appState, ['store-1']);
    assert.equal(results.length, 1); // one stock piece drawn, no store purchase needed
    assert.equal(results[0].success, true);
    assert.equal(results[0].purchase.catalogItem.storeId, 'shop_stock');
    assert.equal(results[0].purchase.catalogItem.length, 6000);
    assert.equal(results[0].purchase.boardsNeeded, 1);
    assert.equal(results[0].purchase.totalCost, 0);
});

test('stock covering only part of the requirement produces BOTH a stock line and a store line', () => {
    const parts = [{ id: 'PART-1', category: 'lumber', is_bulk: true, status: 'ready',
                      profileId: 'PR-1', materialId: 'M-1', length: 10000 }];
    const appState = baseAppState({
        stock: [{ profileId: 'PR-1', materialId: 'M-1', categoryId: 'lumber', length: 3000, qty: 1 }],
        catalog: [{ id: 'CAT-1', profileId: 'PR-1', materialId: 'M-1', categoryId: 'lumber',
                    storeId: 'store-1', length: 4000, price: 12 }]
    });

    const results = computeBulkResults(parts, appState, ['store-1']);
    assert.equal(results.length, 2);
    const stockLine = results.find(r => r.purchase.catalogItem.storeId === 'shop_stock');
    const storeLine = results.find(r => r.purchase.catalogItem.storeId === 'store-1');
    assert.ok(stockLine, 'expected a shop-stock line');
    assert.equal(stockLine.purchase.boardsNeeded, 1);
    assert.ok(storeLine, 'expected a store line for the remainder');
    assert.equal(storeLine.purchase.boardsNeeded, Math.ceil((10000 - 3000) / 4000));
});

test('multiple distinct stock lengths each become their own shop-stock line, longest drawn first', () => {
    const parts = [{ id: 'PART-1', category: 'lumber', is_bulk: true, status: 'ready',
                      profileId: 'PR-1', materialId: 'M-1', length: 4500 }];
    const appState = baseAppState({
        stock: [
            { profileId: 'PR-1', materialId: 'M-1', categoryId: 'lumber', length: 1000, qty: 5 }, // 5000mm available
            { profileId: 'PR-1', materialId: 'M-1', categoryId: 'lumber', length: 3000, qty: 1 }   // drawn first (longest)
        ]
    });

    const results = computeBulkResults(parts, appState, ['store-1']);
    // 3000mm piece drawn first (remaining 1500), then whole 1000mm pieces one at a time:
    // one leaves 500mm still remaining, so a second is drawn to fully cover it.
    const byLength = Object.fromEntries(results.map(r => [r.purchase.catalogItem.length, r.purchase.boardsNeeded]));
    assert.equal(byLength[3000], 1);
    assert.equal(byLength[1000], 2);
    assert.equal(results.length, 2);
});

test('minimum-stock-length filter ON excludes short offcuts; OFF lets them count', () => {
    const parts = [{ id: 'PART-1', category: 'lumber', is_bulk: true, status: 'ready',
                      profileId: 'PR-1', materialId: 'M-1', length: 5000 }];
    const shortStock = { profileId: 'PR-1', materialId: 'M-1', categoryId: 'lumber', length: 300, qty: 1 };
    const catalog = [{ id: 'CAT-1', profileId: 'PR-1', materialId: 'M-1', categoryId: 'lumber',
                        storeId: 'store-1', length: 4000, price: 12 }];

    // Filter ON, minimum 500mm: the 300mm offcut is excluded, so full 5000mm must be bought.
    const onState = baseAppState({
        stock: [shortStock], catalog,
        settings: { optimizer: { bulkEnabled: true }, bulkMinimumStockLength: 500, marginPercent: 0 }
    });
    const onResults = computeBulkResults(parts, onState, ['store-1']);
    const onStoreLine = onResults.find(r => r.purchase.catalogItem.storeId === 'store-1');
    assert.ok(onStoreLine, 'expected a store line when the offcut is excluded');
    assert.equal(onStoreLine.purchase.boardsNeeded, Math.ceil(5000 / 4000));
    assert.ok(!onResults.some(r => r.purchase.catalogItem.storeId === 'shop_stock'), 'the 300mm offcut must not appear as a stock line when excluded by the filter');

    // Filter OFF: the same 300mm offcut counts, reducing what must be bought, and appears
    // as its own shop-stock line alongside the store line for the remainder.
    const offState = baseAppState({
        stock: [shortStock], catalog,
        settings: { optimizer: { bulkEnabled: false }, bulkMinimumStockLength: 500, marginPercent: 0 }
    });
    const offResults = computeBulkResults(parts, offState, ['store-1']);
    const offStockLine = offResults.find(r => r.purchase.catalogItem.storeId === 'shop_stock');
    const offStoreLine = offResults.find(r => r.purchase.catalogItem.storeId === 'store-1');
    assert.ok(offStockLine, 'expected the 300mm offcut to be listed as a shop-stock line');
    assert.equal(offStockLine.purchase.boardsNeeded, 1);
    assert.ok(offStoreLine, 'expected a store line for the remainder');
    assert.equal(offStoreLine.purchase.boardsNeeded, Math.ceil((5000 - 300) / 4000));
});

test('multiple bulk rows for the same profile+material are summed into one requirement', () => {
    const parts = [
        { id: 'PART-1', category: 'lumber', is_bulk: true, status: 'ready', profileId: 'PR-1', materialId: 'M-1', length: 3000 },
        { id: 'PART-2', category: 'lumber', is_bulk: true, status: 'ready', profileId: 'PR-1', materialId: 'M-1', length: 4000 }
    ];
    const appState = baseAppState({
        catalog: [{ id: 'CAT-1', profileId: 'PR-1', materialId: 'M-1', categoryId: 'lumber',
                    storeId: 'store-1', length: 1000, price: 1 }]
    });

    const results = computeBulkResults(parts, appState, ['store-1']);
    assert.equal(results.length, 1);
    assert.equal(results[0].purchase.boardsNeeded, 7); // (3000+4000)/1000
});

test('non-bulk, non-lumber, and not-ready rows are all ignored', () => {
    const parts = [
        { id: 'A', category: 'lumber', is_bulk: false, status: 'ready', profileId: 'PR-1', materialId: 'M-1', length: 5000 },
        { id: 'B', category: 'sheet', is_bulk: true, status: 'ready', profileId: 'PR-1', materialId: 'M-1', length: 5000 },
        { id: 'C', category: 'lumber', is_bulk: true, status: 'needs_mapping', profileId: 'PR-1', materialId: 'M-1', length: 5000 }
    ];
    const appState = baseAppState({
        catalog: [{ id: 'CAT-1', profileId: 'PR-1', materialId: 'M-1', categoryId: 'lumber',
                    storeId: 'store-1', length: 1000, price: 1 }]
    });

    assert.equal(computeBulkResults(parts, appState, ['store-1']).length, 0); // cross-realm array
});

test('no store inventory at all produces a sourcing-error entry, not a throw', () => {
    const parts = [{ id: 'PART-1', category: 'lumber', is_bulk: true, status: 'ready',
                      profileId: 'PR-1', materialId: 'M-1', length: 5000 }];
    const appState = baseAppState(); // empty catalog and stock

    const results = computeBulkResults(parts, appState, ['store-1']);
    assert.equal(results.length, 1);
    assert.ok(results[0].error);
    assert.equal(results[0].success, undefined);
});
