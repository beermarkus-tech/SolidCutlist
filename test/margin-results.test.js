'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGasPartial } = require('./helpers/extractGasFunction');

const { computeMarginTopups } = loadGasPartial('Frontend/JS/Modules/js_bulk_margin.html', {
    calculateCostPerPiece: item => item.price
});

function baseAppState(overrides) {
    return Object.assign({
        catalog: [],
        settings: { optimizer: { marginEnabled: true }, marginPercent: 5 }
    }, overrides);
}

function lumberPart(id, length, qty) {
    return { id, category: 'lumber', is_bulk: false, status: 'ready', profileId: 'PR-1', materialId: 'M-1', length, qty };
}

test('marginEnabled false returns nothing, regardless of packer waste', () => {
    const parts = [lumberPart('A', 1000, 1)];
    const packerResults = [{ sku: { profileId: 'PR-1', materialId: 'M-1', category: 'lumber' }, success: true, purchase: { waste: 0 } }];
    const appState = baseAppState({ settings: { optimizer: { marginEnabled: false }, marginPercent: 5 } });

    assert.equal(computeMarginTopups(parts, packerResults, appState, ['store-1']).length, 0);
});

test('packer waste already at/above the threshold adds no top-up line', () => {
    // nominal = 1000 * 10 = 10000; 5% threshold = 500; packer already left 600 -> covered.
    const parts = [lumberPart('A', 1000, 10)];
    const packerResults = [{
        sku: { profileId: 'PR-1', materialId: 'M-1', category: 'lumber' },
        success: true, purchase: { waste: 600 }
    }];
    const appState = baseAppState({
        catalog: [{ id: 'CAT-1', profileId: 'PR-1', materialId: 'M-1', categoryId: 'lumber', storeId: 'store-1', length: 1000, price: 5 }]
    });

    assert.equal(computeMarginTopups(parts, packerResults, appState, ['store-1']).length, 0);
});

test('packer waste below threshold resolves the shortfall as an extra shopping-list line', () => {
    // nominal = 1000 * 10 = 10000; 5% threshold = 500; packer only left 100 -> shortfall 400.
    const parts = [lumberPart('A', 1000, 10)];
    const packerResults = [{
        sku: { profileId: 'PR-1', materialId: 'M-1', category: 'lumber' },
        success: true, purchase: { waste: 100 }
    }];
    const appState = baseAppState({
        catalog: [{ id: 'CAT-1', profileId: 'PR-1', materialId: 'M-1', categoryId: 'lumber', storeId: 'store-1', length: 1000, price: 5 }]
    });

    const results = computeMarginTopups(parts, packerResults, appState, ['store-1']);
    assert.equal(results.length, 1);
    assert.equal(results[0].purchase.boardsNeeded, 1); // ceil(400/1000)
    assert.equal(results[0].purchase.layout.length, 0);
});

test('waste is summed across every matching finalCutlist entry for a SKU (stock + store + tail-alt)', () => {
    // nominal = 1000 * 20 = 20000; 5% threshold = 1000.
    // Three finalCutlist entries for the SAME SKU (shop-stock draw, primary store purchase,
    // tail-substituted alt) — each must contribute to the summed leftover, not just one.
    const parts = [lumberPart('A', 1000, 20)];
    const sku = { profileId: 'PR-1', materialId: 'M-1', category: 'lumber' };
    const catItem = { id: 'CAT-1', storeId: 'store-1', length: 1000, price: 5 };
    const packerResults = [
        { sku, success: true, purchase: { catalogItem: { storeId: 'shop_stock' }, waste: 300 } },
        { sku, success: true, purchase: { catalogItem: catItem, boardsNeeded: 15, waste: 400 } },
        { sku, success: true, purchase: { catalogItem: catItem, boardsNeeded: 5, waste: 350 } } // tail-alt entry
    ];
    // Summed leftover = 300+400+350 = 1050 >= 1000 threshold -> no top-up needed.
    const appState = baseAppState({
        catalog: [{ id: 'CAT-1', profileId: 'PR-1', materialId: 'M-1', categoryId: 'lumber', storeId: 'store-1', length: 1000, price: 5 }]
    });
    assert.equal(computeMarginTopups(parts, packerResults, appState, ['store-1']).length, 0);

    // Drop the tail-alt's waste so the sum (300+400=700) falls below the 1000 threshold —
    // a buggy implementation reading only "the winning option" would still see 400 (or 300)
    // and reach a different (wrong) conclusion than reading the correct multi-entry sum.
    const packerResultsShort = packerResults.slice(0, 2);
    const shortResults = computeMarginTopups(parts, packerResultsShort, appState, ['store-1']);
    assert.equal(shortResults.length, 1);
    assert.equal(shortResults[0].purchase.boardsNeeded, 1); // ceil(300/1000) shortfall
});

test('bulk (is_bulk) rows are excluded from the nominal-length totals', () => {
    const parts = [
        lumberPart('A', 1000, 1),
        { id: 'B', category: 'lumber', is_bulk: true, status: 'ready', profileId: 'PR-1', materialId: 'M-1', length: 50000, qty: 1 }
    ];
    const packerResults = [{ sku: { profileId: 'PR-1', materialId: 'M-1', category: 'lumber' }, success: true, purchase: { waste: 0 } }];
    const appState = baseAppState({
        catalog: [{ id: 'CAT-1', profileId: 'PR-1', materialId: 'M-1', categoryId: 'lumber', storeId: 'store-1', length: 1000, price: 5 }]
    });

    // If the bulk row's 50000mm leaked into nominalTotals, the threshold (5% of ~51000mm)
    // would dwarf the shortfall computation. With it correctly excluded, nominal is just
    // 1000mm, threshold 50mm, so the (zero) packer waste demands only a 1-board top-up.
    const results = computeMarginTopups(parts, packerResults, appState, ['store-1']);
    assert.equal(results.length, 1);
    assert.equal(results[0].purchase.boardsNeeded, 1);
});

test('no vendor options for the shortfall silently skips the top-up rather than erroring', () => {
    const parts = [lumberPart('A', 1000, 10)];
    const packerResults = [{ sku: { profileId: 'PR-1', materialId: 'M-1', category: 'lumber' }, success: true, purchase: { waste: 0 } }];
    const appState = baseAppState({ catalog: [] }); // no matching catalog entries at all

    assert.equal(computeMarginTopups(parts, packerResults, appState, ['store-1']).length, 0);
});

test('top-up reuses the packer\'s already-chosen board length, never a "better value" length picked independently', () => {
    // nominal = 3658 * 20 = 73160 (144in boards, 20 needed); 5% threshold = 3658; packer waste 0 -> full shortfall.
    const parts = [lumberPart('A', 3658, 20)]; // 144in in mm
    const chosenBoard = { id: 'CAT-144IN', storeId: 'store-1', length: 3658, price: 6 }; // what the packer bought
    const packerResults = [{
        sku: { profileId: 'PR-1', materialId: 'M-1', category: 'lumber' },
        success: true,
        purchase: { catalogItem: chosenBoard, boardsNeeded: 20, waste: 0 }
    }];
    const appState = baseAppState({
        catalog: [
            chosenBoard,
            // A longer, better-value-per-mm board is also available in the catalog — the
            // resolver would normally prefer this on pure price/length ratio, but the
            // top-up must NOT switch to it: it should add more 144in boards instead.
            { id: 'CAT-194IN', storeId: 'store-1', length: 4927, price: 6 } // 194in, same price -> better $/mm
        ]
    });

    const results = computeMarginTopups(parts, packerResults, appState, ['store-1']);
    assert.equal(results.length, 1);
    assert.equal(results[0].purchase.catalogItem.id, 'CAT-144IN');
    assert.equal(results[0].purchase.catalogItem.length, 3658);
});

test('multiple existing store purchases for the same SKU: tops up whichever one the packer bought the most of', () => {
    const parts = [lumberPart('A', 1000, 30)];
    const dominant = { id: 'CAT-DOMINANT', storeId: 'store-1', length: 1000, price: 5 };
    const minor = { id: 'CAT-MINOR', storeId: 'store-1', length: 800, price: 5 };
    const packerResults = [
        { sku: { profileId: 'PR-1', materialId: 'M-1', category: 'lumber' }, success: true, purchase: { catalogItem: dominant, boardsNeeded: 25, waste: 0 } },
        { sku: { profileId: 'PR-1', materialId: 'M-1', category: 'lumber' }, success: true, purchase: { catalogItem: minor, boardsNeeded: 3, waste: 0 } }
    ];
    const appState = baseAppState({ catalog: [dominant, minor] });

    const results = computeMarginTopups(parts, packerResults, appState, ['store-1']);
    assert.equal(results.length, 1);
    assert.equal(results[0].purchase.catalogItem.id, 'CAT-DOMINANT');
});

test('SKU fully covered by shop stock (no existing store purchase) falls back to resolving against the catalog', () => {
    const parts = [lumberPart('A', 1000, 10)];
    const onlyOption = { id: 'CAT-1', profileId: 'PR-1', materialId: 'M-1', categoryId: 'lumber', storeId: 'store-1', length: 1000, price: 5 };
    const packerResults = [{
        sku: { profileId: 'PR-1', materialId: 'M-1', category: 'lumber' },
        success: true,
        purchase: { catalogItem: { storeId: 'shop_stock' }, waste: 0 }
    }];
    const appState = baseAppState({ catalog: [onlyOption] });

    const results = computeMarginTopups(parts, packerResults, appState, ['store-1']);
    assert.equal(results.length, 1);
    assert.equal(results[0].purchase.catalogItem.id, 'CAT-1');
});
