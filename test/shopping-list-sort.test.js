'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadGasPartial } = require('./helpers/extractGasFunction');

// _compareShoppingListItems() itself is pure, but js_optimizer.html has
// unrelated top-level code (a DOMContentLoaded listener) that runs at load
// time, so a minimal stub must be seeded for the partial to evaluate at all
// in this sandboxed VM context.
const { _compareShoppingListItems } = loadGasPartial('Frontend/JS/Modules/js_optimizer.html', {
    document: { addEventListener: () => {} }
});

function item(overrides) {
    return Object.assign({ category: 'lumber', profName: 'Profile', matName: 'Material' }, overrides);
}

test('lumber sorts before sheet, regardless of names', () => {
    const lumber = item({ category: 'lumber', profName: 'Zzz', matName: 'Zzz' });
    const sheet = item({ category: 'sheet', profName: 'Aaa', matName: 'Aaa' });
    assert.ok(_compareShoppingListItems(lumber, sheet) < 0);
    assert.ok(_compareShoppingListItems(sheet, lumber) > 0);
});

test('within the same category, sorts ascending by "Profile - Material", natural/numeric-aware', () => {
    const a = item({ category: 'lumber', profName: '45x90mm', matName: 'Pine' });
    const b = item({ category: 'lumber', profName: '70x140mm', matName: 'Pine' });
    assert.ok(_compareShoppingListItems(a, b) < 0); // "45x.." before "70x.."
    assert.ok(_compareShoppingListItems(b, a) > 0);
});

test('title comparison is case-insensitive', () => {
    const a = item({ profName: 'apple', matName: 'Wood' });
    const b = item({ profName: 'Banana', matName: 'Wood' });
    assert.ok(_compareShoppingListItems(a, b) < 0);
});

test('identical category and title compare equal', () => {
    const a = item({ category: 'sheet', profName: 'Ply', matName: 'Birch' });
    const b = item({ category: 'sheet', profName: 'Ply', matName: 'Birch' });
    assert.equal(_compareShoppingListItems(a, b), 0);
});

test('a full lumber-then-sheet, ascending-title sort matches renderDiagramsTab\'s own ordering', () => {
    const items = [
        item({ category: 'sheet', profName: 'Plywood', matName: 'Birch' }),
        item({ category: 'lumber', profName: '70x140mm', matName: 'Pine' }),
        item({ category: 'sheet', profName: 'MDF', matName: 'Standard' }),
        item({ category: 'lumber', profName: '45x90mm', matName: 'Pine' })
    ];
    items.sort(_compareShoppingListItems);
    assert.deepEqual(
        items.map(i => `${i.category}:${i.profName}`),
        ['lumber:45x90mm', 'lumber:70x140mm', 'sheet:MDF', 'sheet:Plywood']
    );
});
