'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGasPartials } = require('./helpers/extractGasFunction');

// js_projects.html has unrelated top-level code (window.projectImages init,
// a DOMContentLoaded listener) that runs at load time, so a minimal stub
// must be seeded for these partials to evaluate at all in this sandboxed VM
// context. _resolveCatalogRef lives in js_projects.html but is shared by the
// stock-import logic under test here -- loadGasPartials evaluates both into
// one context, same as the real app's shared <script> scope.
const {
    _resolveCatalogRef,
    _buildStockExportPayload,
    _validateStockImportData,
    _prepareImportedStockForMerge
} = loadGasPartials(['Frontend/JS/Domain/js_projects.html', 'Frontend/JS/Domain/js_stock.html'], {
    window: {},
    document: { addEventListener: () => {} },
    registerEditableTable: () => {}
});

function baseAppState(overrides) {
    return Object.assign({
        stock: [], profiles: [], materials: []
    }, overrides);
}

// ---- _buildStockExportPayload ----

test('_buildStockExportPayload: envelope carries the expected format/version fields', () => {
    const payload = _buildStockExportPayload(baseAppState());
    assert.equal(payload.format, 'solidcutlist-stock');
    assert.equal(payload.schemaVersion, 1);
    assert.ok(payload.exportedAt);
});

test('_buildStockExportPayload: only the profiles/materials actually referenced by stock are included', () => {
    const appState = baseAppState({
        stock: [{ id: 'STK-1', profileId: 'PROF-1', materialId: 'MAT-1' }],
        profiles: [{ id: 'PROF-1', name: '2x4' }, { id: 'PROF-2', name: '2x6' }],
        materials: [{ id: 'MAT-1', name: 'Pine' }, { id: 'MAT-2', name: 'Oak' }]
    });
    const payload = _buildStockExportPayload(appState);
    assert.equal(payload.stock.length, 1);
    assert.equal(payload.usedProfiles.length, 1);
    assert.equal(payload.usedProfiles[0].id, 'PROF-1');
    assert.equal(payload.usedMaterials.length, 1);
    assert.equal(payload.usedMaterials[0].id, 'MAT-1');
});

test('_buildStockExportPayload: an empty stock table exports cleanly', () => {
    const payload = _buildStockExportPayload(baseAppState());
    assert.equal(payload.stock.length, 0);
    assert.equal(payload.usedProfiles.length, 0);
    assert.equal(payload.usedMaterials.length, 0);
});

// ---- _validateStockImportData ----

test('_validateStockImportData: a well-formed envelope passes', () => {
    const data = { format: 'solidcutlist-stock', schemaVersion: 1, stock: [] };
    assert.equal(_validateStockImportData(data).valid, true);
});

test('_validateStockImportData: wrong or missing format is rejected', () => {
    assert.equal(_validateStockImportData({ format: 'solidcutlist-project', stock: [] }).valid, false);
    assert.equal(_validateStockImportData({ stock: [] }).valid, false);
});

test('_validateStockImportData: missing or non-array stock is rejected', () => {
    assert.equal(_validateStockImportData({ format: 'solidcutlist-stock' }).valid, false);
    assert.equal(_validateStockImportData({ format: 'solidcutlist-stock', stock: 'nope' }).valid, false);
});

test('_validateStockImportData: non-object input is rejected without throwing', () => {
    assert.equal(_validateStockImportData(null).valid, false);
    assert.equal(_validateStockImportData('a string').valid, false);
    assert.equal(_validateStockImportData(undefined).valid, false);
});

// ---- _prepareImportedStockForMerge ----

function importFixture(overrides) {
    return Object.assign({
        stock: [{ id: 'STK-OLD', profileId: 'PROF-1', materialId: 'MAT-1', qty: 2, length: 950 }],
        usedProfiles: [],
        usedMaterials: []
    }, overrides);
}

test('_prepareImportedStockForMerge: mints a fresh id per row, different from the input', () => {
    const appState = baseAppState();
    const result = _prepareImportedStockForMerge(importFixture(), appState);
    assert.equal(result.stock.length, 1);
    assert.notEqual(result.stock[0].id, 'STK-OLD');
    assert.equal(result.stock[0].qty, 2);
});

test('_prepareImportedStockForMerge: re-running on the SAME input twice never produces colliding ids', () => {
    const appState = baseAppState();
    const first = _prepareImportedStockForMerge(importFixture(), appState);
    const second = _prepareImportedStockForMerge(importFixture(), appState);
    assert.notEqual(first.stock[0].id, second.stock[0].id);
});

test('_prepareImportedStockForMerge: catalog healing -- exact id match in the live catalog is kept', () => {
    const appState = baseAppState({
        profiles: [{ id: 'PROF-1', name: '2x4' }],
        materials: [{ id: 'MAT-1', name: 'Pine' }]
    });
    const data = importFixture({
        usedProfiles: [{ id: 'PROF-1', name: '2x4' }],
        usedMaterials: [{ id: 'MAT-1', name: 'Pine' }]
    });
    const result = _prepareImportedStockForMerge(data, appState);
    assert.equal(result.stock[0].profileId, 'PROF-1');
    assert.equal(result.stock[0].materialId, 'MAT-1');
    assert.equal(result.catalogAdditions, 0);
});

test('_prepareImportedStockForMerge: catalog healing -- no id match but a name match remaps to the live entry', () => {
    const appState = baseAppState({
        profiles: [{ id: 'PROF-LIVE', name: '2x4' }],
        materials: [{ id: 'MAT-LIVE', name: 'Pine' }]
    });
    const data = importFixture({
        stock: [{ id: 'STK-OLD', profileId: 'PROF-SNAPSHOT', materialId: 'MAT-SNAPSHOT', qty: 2, length: 950 }],
        usedProfiles: [{ id: 'PROF-SNAPSHOT', name: '2x4' }],
        usedMaterials: [{ id: 'MAT-SNAPSHOT', name: 'Pine' }]
    });
    const result = _prepareImportedStockForMerge(data, appState);
    assert.equal(result.stock[0].profileId, 'PROF-LIVE');
    assert.equal(result.stock[0].materialId, 'MAT-LIVE');
    assert.equal(result.catalogAdditions, 0);
    assert.equal(appState.profiles.length, 1); // no new entry, just remapped
});

test('_prepareImportedStockForMerge: catalog healing -- no match reinserts the snapshot and counts as an addition', () => {
    const appState = baseAppState(); // empty catalog
    const data = importFixture({
        stock: [{ id: 'STK-OLD', profileId: 'PROF-GONE', materialId: 'MAT-GONE', qty: 2, length: 950 }],
        usedProfiles: [{ id: 'PROF-GONE', name: '2x4', width: 88.9, thickness: 38.1 }],
        usedMaterials: [{ id: 'MAT-GONE', name: 'Pine', density: 500 }]
    });
    const result = _prepareImportedStockForMerge(data, appState);
    assert.equal(result.stock[0].profileId, 'PROF-GONE');
    assert.equal(result.stock[0].materialId, 'MAT-GONE');
    assert.equal(result.catalogAdditions, 2);
    assert.equal(appState.profiles.length, 1);
    assert.equal(appState.materials.length, 1);
});
