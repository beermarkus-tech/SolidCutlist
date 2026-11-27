'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGasPartial } = require('./helpers/extractGasFunction');

// Regression guard: with equal (e.g. zero) prices the first catalog row used to win,
// so sorting the price table changed the cut plan. Ties now prefer fewer boards.
function run(catalogOrder) {
    const appState = {
        settings: { bladeKerf: 3, factoryEdgeTrim: 0, optimizer: {} },
        stock: [],
        catalog: catalogOrder.map((len, i) => ({ id: 'C' + i, profileId: 'P', materialId: 'M', categoryId: 'lumber', storeId: 'S', length: len, price: 0, priceUnit: 'piece' }))
    };
    const ctx = loadGasPartial('Frontend/JS/Modules/js_optimizer.html', {
        document: { addEventListener: () => {} }, appState
    });
    const parts = [{ id: 'A', status: 'ready', category: 'lumber', profileId: 'P', materialId: 'M', length: 1150, qty: 3, name: 'A' }];
    const res = ctx.runPackingEngine(parts, ['S']).filter(r => r.success);
    return JSON.parse(JSON.stringify(res.map(r => [r.purchase.catalogItem.length, r.purchase.boardsNeeded])));
}

test('zero prices: fewer boards wins regardless of catalog order', () => {
    assert.deepEqual(run([2400, 3600]), [[3600, 1]]);
    assert.deepEqual(run([3600, 2400]), [[3600, 1]]);
});
