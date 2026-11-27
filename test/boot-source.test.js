'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGasPartial } = require('./helpers/extractGasFunction');

const { decideBootSource } = loadGasPartial('Frontend/JS/Core/js_state.html', {
    document: { addEventListener: () => {} }, window: { addEventListener: () => {} }
});

test('no unsynced local edits: boot from the Sheet', () => {
    assert.equal(decideBootSource({ hasLocal: true, localTime: 500, cloudTime: 100, unsyncedFlag: '0', lastSyncedCloudTime: '100' }), 'cloud');
});
test('unsynced local edits and the Sheet unchanged since our last sync: keep local silently', () => {
    // Regression guard: an edit closed within the old 10 s window used to be silently lost.
    assert.equal(decideBootSource({ hasLocal: true, localTime: 105, cloudTime: 100, unsyncedFlag: '1', lastSyncedCloudTime: '100' }), 'local');
});
test('unsynced local edits and someone else wrote the Sheet: ask the user', () => {
    assert.equal(decideBootSource({ hasLocal: true, localTime: 105, cloudTime: 200, unsyncedFlag: '1', lastSyncedCloudTime: '100' }), 'conflict');
});
test('empty Sheet with unsynced local data: keep local', () => {
    assert.equal(decideBootSource({ hasLocal: true, localTime: 105, cloudTime: 0, unsyncedFlag: '1', lastSyncedCloudTime: null }), 'local');
});
test('legacy install without markers keeps the previous 10 s rule', () => {
    assert.equal(decideBootSource({ hasLocal: true, localTime: 20001, cloudTime: 10000, unsyncedFlag: null, lastSyncedCloudTime: null }), 'conflict');
    assert.equal(decideBootSource({ hasLocal: true, localTime: 15000, cloudTime: 10000, unsyncedFlag: null, lastSyncedCloudTime: null }), 'cloud');
});
test('no local copy: boot from the Sheet', () => {
    assert.equal(decideBootSource({ hasLocal: false, localTime: 0, cloudTime: 5, unsyncedFlag: '1', lastSyncedCloudTime: null }), 'cloud');
});
