'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGasPartial } = require('./helpers/extractGasFunction');

// Regression guard: optimizer toggles used to write into the MASTER settings even while
// a saved job was loaded, leaking job tweaks back into the user's defaults.
function setup(activeJobId) {
    let saved = 0;
    const appState = {
        settings: { optimizer: { kerfEnabled: true, useStock: false } },
        jobs: [{ id: 'J1', settings: { optimizer: { kerfEnabled: true } } }]
    };
    const window = { activeJobId };
    const ctx = loadGasPartial('Frontend/JS/Modules/js_optimizer.html', {
        document: { addEventListener: () => {}, getElementById: () => null },
        appState, window,
        saveState: () => { saved++; },
        setUnsavedChangesState: () => {},
        syncJobSettingsToMobileUI: () => {}
    });
    return { ctx, appState, saved: () => saved };
}

test('with a job loaded, toggles change only the job', () => {
    const { ctx, appState, saved } = setup('J1');
    ctx.toggleKerfMode(false);
    ctx.toggleUseStock(true);
    ctx.toggleTransportMode(true);
    ctx.updateSheetCutPreference('rip');
    assert.equal(appState.settings.optimizer.kerfEnabled, true);
    assert.equal(appState.settings.optimizer.useStock, false);
    assert.equal(appState.settings.optimizer.transport, undefined);
    assert.equal(appState.settings.optimizer.sheetCutPreference, undefined);
    const jo = appState.jobs[0].settings.optimizer;
    assert.deepEqual([jo.kerfEnabled, jo.useStock, jo.transport.enabled, jo.sheetCutPreference], [false, true, true, 'rip']);
    assert.equal(saved(), 0);
});

test('without a job, toggles change and save the master settings', () => {
    const { ctx, appState, saved } = setup(null);
    ctx.toggleScrapMode(false);
    assert.equal(appState.settings.optimizer.scrapEnabled, false);
    assert.equal(saved(), 1);
});
