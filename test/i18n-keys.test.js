'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { loadGasPartial } = require('./helpers/extractGasFunction');

const SRC = path.join(__dirname, '..', 'src', 'Frontend');
const { translations } = (() => {
    const ctx = loadGasPartial('Frontend/JS/Core/js_languages.html', { appState: { settings: {} } });
    // `const translations` is not a context property; read it through a function in scope
    return { translations: new (require('vm').Script)('translations').runInContext(ctx) };
})();
const LANGS = ['en', 'de', 'fr', 'es', 'pt', 'it'];

function listFiles(dir) {
    return fs.readdirSync(dir).flatMap(f => {
        const p = path.join(dir, f);
        return fs.statSync(p).isDirectory() ? listFiles(p) : [p];
    });
}

test('every language defines exactly the same keys as English', () => {
    const en = Object.keys(translations.en);
    for (const lang of LANGS) {
        const keys = Object.keys(translations[lang]);
        assert.deepEqual(en.filter(k => !keys.includes(k)), [], `${lang} is missing keys`);
        assert.deepEqual(keys.filter(k => !en.includes(k)), [], `${lang} has extra keys`);
    }
});

test('placeholders like {name} match across languages', () => {
    const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
    for (const lang of LANGS) {
        for (const k of Object.keys(translations.en)) {
            assert.equal(ph(translations[lang][k]), ph(translations.en[k]), `${lang}.${k}`);
        }
    }
});

test('every statically referenced key exists (t("...") and data-i18n attributes)', () => {
    const used = new Set();
    for (const f of listFiles(SRC)) {
        if (f.includes('js_languages')) continue;
        const s = fs.readFileSync(f, 'utf8');
        for (const m of s.matchAll(/\bt\(\s*['"`]([a-zA-Z0-9_]+)['"`]/g)) used.add(m[1]);
        for (const m of s.matchAll(/data-i18n(?:-title|-placeholder)?="([^"]+)"/g)) used.add(m[1]);
    }
    const missing = [...used].filter(k => !(k in translations.en) && !k.endsWith('_'));
    assert.deepEqual(missing, []);
});
