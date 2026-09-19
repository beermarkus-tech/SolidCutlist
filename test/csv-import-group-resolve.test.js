'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGasPartial } = require('./helpers/extractGasFunction');

// js_import.html has unrelated top-level code (appState.stagingParts init, a
// DOMContentLoaded listener) that runs at load time, so minimal stubs must be
// seeded for the partial to evaluate at all in this sandboxed VM context.
const { _resolveStagingGroups } = loadGasPartial('Frontend/JS/Modules/js_import.html', {
    appState: {},
    window: {},
    document: { addEventListener: () => {} }
});

function stagingPart(overrides) {
    return Object.assign({
        id: 'STG-1', projectId: 'PROJ-1', groupId: '', extractedGroup: 'Cabinets'
    }, overrides);
}

test('a single unresolved group creates exactly one new group and links it', () => {
    const appState = { groups: [] };
    const parts = [stagingPart()];

    const created = _resolveStagingGroups(parts, appState);

    assert.equal(created, 1);
    assert.equal(appState.groups.length, 1);
    assert.equal(appState.groups[0].name, 'Cabinets');
    assert.equal(appState.groups[0].projectId, 'PROJ-1');
    assert.equal(parts[0].groupId, appState.groups[0].id);
});

test('two staging parts sharing the same unresolved group (same project) create only ONE group', () => {
    const appState = { groups: [] };
    const parts = [
        stagingPart({ id: 'STG-1', extractedGroup: 'Cabinets' }),
        stagingPart({ id: 'STG-2', extractedGroup: 'Cabinets' })
    ];

    const created = _resolveStagingGroups(parts, appState);

    assert.equal(created, 1);
    assert.equal(appState.groups.length, 1);
    assert.equal(parts[0].groupId, parts[1].groupId);
});

test('group name matching for dedup is case-insensitive', () => {
    const appState = { groups: [] };
    const parts = [
        stagingPart({ id: 'STG-1', extractedGroup: 'Cabinets' }),
        stagingPart({ id: 'STG-2', extractedGroup: 'CABINETS' })
    ];

    const created = _resolveStagingGroups(parts, appState);

    assert.equal(created, 1);
    assert.equal(parts[0].groupId, parts[1].groupId);
});

test('the same group name in two different projects creates two separate groups', () => {
    const appState = { groups: [] };
    const parts = [
        stagingPart({ id: 'STG-1', projectId: 'PROJ-1', extractedGroup: 'Cabinets' }),
        stagingPart({ id: 'STG-2', projectId: 'PROJ-2', extractedGroup: 'Cabinets' })
    ];

    const created = _resolveStagingGroups(parts, appState);

    assert.equal(created, 2);
    assert.notEqual(parts[0].groupId, parts[1].groupId);
    assert.equal(appState.groups.find(g => g.id === parts[0].groupId).projectId, 'PROJ-1');
    assert.equal(appState.groups.find(g => g.id === parts[1].groupId).projectId, 'PROJ-2');
});

test('an already-resolved groupId is left untouched, and does not count toward the created total', () => {
    const appState = { groups: [{ id: 'GRP-EXISTING', projectId: 'PROJ-1', name: 'Doors' }] };
    const parts = [stagingPart({ groupId: 'GRP-EXISTING', extractedGroup: 'Doors' })];

    const created = _resolveStagingGroups(parts, appState);

    assert.equal(created, 0);
    assert.equal(appState.groups.length, 1);
    assert.equal(parts[0].groupId, 'GRP-EXISTING');
});

test('a groupId of "none" (explicitly no group) is left untouched', () => {
    const appState = { groups: [] };
    const parts = [stagingPart({ groupId: 'none', extractedGroup: '' })];

    const created = _resolveStagingGroups(parts, appState);

    assert.equal(created, 0);
    assert.equal(appState.groups.length, 0);
    assert.equal(parts[0].groupId, 'none');
});

test('an unresolved groupId with no extractedGroup at all is left untouched (nothing to create)', () => {
    const appState = { groups: [] };
    const parts = [stagingPart({ groupId: '', extractedGroup: '' })];

    const created = _resolveStagingGroups(parts, appState);

    assert.equal(created, 0);
    assert.equal(parts[0].groupId, '');
});

test('appState.groups is initialized if missing, and mixed resolved/unresolved rows in one batch work together', () => {
    const appState = {}; // no .groups at all yet
    const parts = [
        stagingPart({ id: 'STG-1', extractedGroup: 'Cabinets' }),
        stagingPart({ id: 'STG-2', groupId: 'none', extractedGroup: '' }),
        stagingPart({ id: 'STG-3', extractedGroup: 'Cabinets' }),
        stagingPart({ id: 'STG-4', extractedGroup: 'Shelving' })
    ];

    const created = _resolveStagingGroups(parts, appState);

    assert.equal(created, 2); // Cabinets + Shelving
    assert.equal(appState.groups.length, 2);
    assert.equal(parts[0].groupId, parts[2].groupId); // both "Cabinets" rows share one group
    assert.equal(parts[1].groupId, 'none'); // untouched
    assert.notEqual(parts[0].groupId, parts[3].groupId); // "Shelving" is a distinct group
});
