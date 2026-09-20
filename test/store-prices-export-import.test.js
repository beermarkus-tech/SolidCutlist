'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGasPartials } = require('./helpers/extractGasFunction');

// js_projects.html has unrelated top-level code (window.projectImages init,
// a DOMContentLoaded listener) that runs at load time, so a minimal stub
// must be seeded for these partials to evaluate at all in this sandboxed VM
// context. _resolveCatalogRef lives in js_projects.html but is shared by the
// store-prices-import logic under test here -- loadGasPartials evaluates
// both into one context, same as the real app's shared <script> scope.
const {
    _resolveCatalogRef,
    _buildStorePricesExportPayload,
    _validateStorePricesImportData,
    _prepareImportedStorePricesForMerge
} = loadGasPartials(['Frontend/JS/Domain/js_projects.html', 'Frontend/JS/Domain/js_prices.html'], {
    window: {},
    document: { addEventListener: () => {} },
    registerEditableTable: () => {}
});

function baseAppState(overrides) {
    return Object.assign({
        catalog: [], stores: [], profiles: [], materials: []
    }, overrides);
}

// ---- _buildStorePricesExportPayload ----

test('_buildStorePricesExportPayload: envelope carries the expected format/version fields', () => {
    const payload = _buildStorePricesExportPayload(baseAppState());
    assert.equal(payload.format, 'solidcutlist-store-prices');
    assert.equal(payload.schemaVersion, 1);
    assert.ok(payload.exportedAt);
});

test('_buildStorePricesExportPayload: only the stores/profiles/materials actually referenced by catalog rows are included', () => {
    const appState = baseAppState({
        catalog: [{ id: 'CAT-1', storeId: 'STR-1', profileId: 'PROF-1', materialId: 'MAT-1', price: 5, priceUnit: 'linear', length: 2438.4 }],
        stores: [{ id: 'STR-1', name: 'Home Depot' }, { id: 'STR-2', name: 'Lowes' }],
        profiles: [{ id: 'PROF-1', name: '2x4' }, { id: 'PROF-2', name: '2x6' }],
        materials: [{ id: 'MAT-1', name: 'Pine' }, { id: 'MAT-2', name: 'Oak' }]
    });
    const payload = _buildStorePricesExportPayload(appState);
    assert.equal(payload.catalog.length, 1);
    assert.equal(payload.stores.length, 1);
    assert.equal(payload.stores[0].id, 'STR-1');
    assert.equal(payload.usedProfiles.length, 1);
    assert.equal(payload.usedMaterials.length, 1);
});

test('_buildStorePricesExportPayload: an empty catalog exports cleanly', () => {
    const payload = _buildStorePricesExportPayload(baseAppState());
    assert.equal(payload.catalog.length, 0);
    assert.equal(payload.stores.length, 0);
    assert.equal(payload.usedProfiles.length, 0);
    assert.equal(payload.usedMaterials.length, 0);
});

// ---- _validateStorePricesImportData ----

test('_validateStorePricesImportData: a well-formed envelope passes', () => {
    const data = { format: 'solidcutlist-store-prices', schemaVersion: 1, catalog: [] };
    assert.equal(_validateStorePricesImportData(data).valid, true);
});

test('_validateStorePricesImportData: wrong or missing format is rejected', () => {
    assert.equal(_validateStorePricesImportData({ format: 'solidcutlist-stock', catalog: [] }).valid, false);
    assert.equal(_validateStorePricesImportData({ catalog: [] }).valid, false);
});

test('_validateStorePricesImportData: missing or non-array catalog is rejected', () => {
    assert.equal(_validateStorePricesImportData({ format: 'solidcutlist-store-prices' }).valid, false);
    assert.equal(_validateStorePricesImportData({ format: 'solidcutlist-store-prices', catalog: 'nope' }).valid, false);
});

test('_validateStorePricesImportData: non-object input is rejected without throwing', () => {
    assert.equal(_validateStorePricesImportData(null).valid, false);
    assert.equal(_validateStorePricesImportData('a string').valid, false);
    assert.equal(_validateStorePricesImportData(undefined).valid, false);
});

// ---- _prepareImportedStorePricesForMerge ----

function importFixture(overrides) {
    return Object.assign({
        catalog: [{ id: 'CAT-OLD', storeId: 'STR-1', profileId: 'PROF-1', materialId: 'MAT-1', price: 5, priceUnit: 'linear', length: 2438.4 }],
        stores: [],
        usedProfiles: [],
        usedMaterials: []
    }, overrides);
}

test('_prepareImportedStorePricesForMerge: mints a fresh id per row, different from the input', () => {
    const appState = baseAppState();
    const result = _prepareImportedStorePricesForMerge(importFixture(), appState);
    assert.equal(result.catalog.length, 1);
    assert.notEqual(result.catalog[0].id, 'CAT-OLD');
    assert.equal(result.catalog[0].price, 5);
});

test('_prepareImportedStorePricesForMerge: re-running on the SAME input twice never produces colliding ids', () => {
    const appState = baseAppState();
    const first = _prepareImportedStorePricesForMerge(importFixture(), appState);
    const second = _prepareImportedStorePricesForMerge(importFixture(), appState);
    assert.notEqual(first.catalog[0].id, second.catalog[0].id);
});

test('_prepareImportedStorePricesForMerge: store healing -- exact id match in the live stores is kept', () => {
    const appState = baseAppState({ stores: [{ id: 'STR-1', name: 'Home Depot' }] });
    const data = importFixture({ stores: [{ id: 'STR-1', name: 'Home Depot' }] });
    const result = _prepareImportedStorePricesForMerge(data, appState);
    assert.equal(result.catalog[0].storeId, 'STR-1');
    assert.equal(result.catalogAdditions, 0);
    assert.equal(appState.stores.length, 1);
});

test('_prepareImportedStorePricesForMerge: store healing -- no id match but a name match remaps to the live store', () => {
    const appState = baseAppState({ stores: [{ id: 'STR-LIVE', name: 'Home Depot' }] });
    const data = importFixture({
        catalog: [{ id: 'CAT-OLD', storeId: 'STR-SNAPSHOT', profileId: 'PROF-1', materialId: 'MAT-1', price: 5, priceUnit: 'linear', length: 2438.4 }],
        stores: [{ id: 'STR-SNAPSHOT', name: 'Home Depot' }]
    });
    const result = _prepareImportedStorePricesForMerge(data, appState);
    assert.equal(result.catalog[0].storeId, 'STR-LIVE');
    assert.equal(result.catalogAdditions, 0);
    assert.equal(appState.stores.length, 1); // reused by name, no duplicate created
});

test('_prepareImportedStorePricesForMerge: store healing -- no match reinserts the snapshot store and counts as an addition', () => {
    const appState = baseAppState(); // no stores yet
    const data = importFixture({
        catalog: [{ id: 'CAT-OLD', storeId: 'STR-GONE', profileId: 'PROF-1', materialId: 'MAT-1', price: 5, priceUnit: 'linear', length: 2438.4 }],
        stores: [{ id: 'STR-GONE', name: 'Home Depot' }]
    });
    const result = _prepareImportedStorePricesForMerge(data, appState);
    assert.equal(result.catalog[0].storeId, 'STR-GONE');
    assert.equal(result.catalogAdditions, 1);
    assert.equal(appState.stores.length, 1);
    assert.equal(appState.stores[0].name, 'Home Depot');
});

test('_prepareImportedStorePricesForMerge: profile/material healing behaves like project import', () => {
    const appState = baseAppState(); // empty catalog everywhere
    const data = importFixture({
        catalog: [{ id: 'CAT-OLD', storeId: 'STR-1', profileId: 'PROF-GONE', materialId: 'MAT-GONE', price: 5, priceUnit: 'linear', length: 2438.4 }],
        stores: [{ id: 'STR-1', name: 'Home Depot' }],
        usedProfiles: [{ id: 'PROF-GONE', name: '2x4', width: 88.9, thickness: 38.1 }],
        usedMaterials: [{ id: 'MAT-GONE', name: 'Pine', density: 500 }]
    });
    const result = _prepareImportedStorePricesForMerge(data, appState);
    assert.equal(result.catalog[0].profileId, 'PROF-GONE');
    assert.equal(result.catalog[0].materialId, 'MAT-GONE');
    // 1 store + 1 profile + 1 material all reinserted
    assert.equal(result.catalogAdditions, 3);
});
