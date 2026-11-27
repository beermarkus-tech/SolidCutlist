'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist-pwa');

test('PWA build produces an installable, fully cached static site', () => {
    execFileSync(process.execPath, [path.join(ROOT, 'build-pwa.js')], { stdio: 'pipe' });
    const html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');

    assert.ok(!html.includes('<?'), 'no Apps Script scriptlets left');
    assert.ok(!/cdn\.jsdelivr\.net/.test(html), 'no CDN references (must work offline)');
    assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
    assert.match(html, /js_local_backend|SOLIDCUTLIST_LOCAL_BACKEND/);

    const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.webmanifest'), 'utf8'));
    assert.equal(manifest.display, 'standalone');
    assert.ok(manifest.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable'));
    manifest.icons.forEach(i => assert.ok(fs.existsSync(path.join(OUT, i.src)), 'icon exists: ' + i.src));

    const sw = fs.readFileSync(path.join(OUT, 'sw.js'), 'utf8');
    const precache = JSON.parse(sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1]);
    for (const f of ['./index.html', './manifest.webmanifest', './vendor/bootstrap/bootstrap.min.css',
                     './vendor/bootstrap/bootstrap.bundle.min.js', './starter-packs/starter_EU.json', './starter-packs/starter_US.json']) {
        assert.ok(precache.includes(f), 'precached: ' + f);
    }
    precache.filter(u => u !== './').forEach(u => assert.ok(fs.existsSync(path.join(OUT, u)), 'precached file exists: ' + u));
    assert.match(sw, /const VERSION = '[0-9a-f]{12}'/);
});

test('the PWA version changes when any file changes (so users get updates)', () => {
    const version = () => fs.readFileSync(path.join(OUT, 'sw.js'), 'utf8').match(/const VERSION = '([^']+)'/)[1];
    execFileSync(process.execPath, [path.join(ROOT, 'build-pwa.js')], { stdio: 'pipe' });
    const v1 = version();
    execFileSync(process.execPath, [path.join(ROOT, 'build-pwa.js')], { stdio: 'pipe' });
    assert.equal(version(), v1, 'same input -> same version (no needless update prompts)');
});
