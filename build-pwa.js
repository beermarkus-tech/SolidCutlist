/**
 * Builds the static PWA website into dist-pwa/ (for GitHub Pages):
 *  - resolves the Apps Script template includes (<?!= include('...'); ?>) into one index.html
 *  - serves Bootstrap from local files instead of the CDN (needed to work offline later)
 *  - copies static PWA assets from pwa/ (starter packs, later manifest/icons/service worker)
 *
 * The same src/ code still builds the Apps Script version (build.js / clasp push).
 * Usage: node build-pwa.js   (or: npm run build:pwa)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist-pwa');
const STATIC = path.join(ROOT, 'pwa');
const BOOTSTRAP = path.join(ROOT, 'node_modules', 'bootstrap', 'dist');
const SW_TEMPLATE = path.join(ROOT, 'pwa-src', 'sw.template.js');

const INCLUDE_RE = /<\?!=\s*include\(\s*'([^']+)'\s*\)\s*;?\s*\?>/g;

/** Recursively inlines include() scriptlets, like HtmlService does at request time. */
function resolveIncludes(html, seen = new Set()) {
    return html.replace(INCLUDE_RE, (_, name) => {
        if (seen.has(name)) throw new Error(`Include cycle at ${name}`);
        const file = path.join(SRC, name + '.html');
        if (!fs.existsSync(file)) throw new Error(`Missing include: ${name} (${file})`);
        return resolveIncludes(fs.readFileSync(file, 'utf8'), new Set([...seen, name]));
    });
}

function copyDir(from, to) {
    if (!fs.existsSync(from)) return;
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        const a = path.join(from, entry.name), b = path.join(to, entry.name);
        entry.isDirectory() ? copyDir(a, b) : fs.copyFileSync(a, b);
    }
}

function listFiles(dir, base = dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? listFiles(p, base) : [path.relative(base, p).split(path.sep).join('/')];
    }).sort();
}

function replaceOnce(html, search, replacement, label) {
    if (!html.includes(search)) throw new Error(`PWA build: could not find ${label} in index.html`);
    return html.replace(search, replacement);
}

function build() {
    if (!fs.existsSync(BOOTSTRAP)) throw new Error('Bootstrap not installed: run "npm install" first.');
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });

    let html = resolveIncludes(fs.readFileSync(path.join(SRC, 'Frontend', 'index.html'), 'utf8'));

    // Local Bootstrap instead of the CDN
    html = html.replace(/<link href="https:\/\/cdn\.jsdelivr\.net\/npm\/bootstrap@[^"]+\/bootstrap\.min\.css"[^>]*>/,
        '<link href="vendor/bootstrap/bootstrap.min.css" rel="stylesheet">');
    html = html.replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/bootstrap@[^"]+\/bootstrap\.bundle\.min\.js"[^>]*><\/script>/,
        '<script src="vendor/bootstrap/bootstrap.bundle.min.js"></script>');
    if (/cdn\.jsdelivr\.net/.test(html)) throw new Error('PWA build: a CDN reference is left in index.html');

    // Apps Script adds these via HtmlOutput; a static page needs them in the <head>
    html = replaceOnce(html, '<meta charset="UTF-8">',
        '<meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <meta name="theme-color" content="#212529">' +
        '\n    <link rel="manifest" href="manifest.webmanifest">' +
        '\n    <link rel="icon" type="image/png" href="icons/favicon-32.png">' +
        '\n    <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">' +
        '\n    <meta name="mobile-web-app-capable" content="yes">' +
        '\n    <meta name="apple-mobile-web-app-capable" content="yes">' +
        '\n    <meta name="apple-mobile-web-app-title" content="SolidCutlist">' +
        '\n    <meta name="apple-mobile-web-app-status-bar-style" content="black">',
        'charset meta');

    if (INCLUDE_RE.test(html) || html.includes('<?')) throw new Error('PWA build: unresolved template scriptlet left');

    fs.writeFileSync(path.join(OUT, 'index.html'), html);

    fs.mkdirSync(path.join(OUT, 'vendor', 'bootstrap'), { recursive: true });
    fs.copyFileSync(path.join(BOOTSTRAP, 'css', 'bootstrap.min.css'), path.join(OUT, 'vendor', 'bootstrap', 'bootstrap.min.css'));
    fs.copyFileSync(path.join(BOOTSTRAP, 'js', 'bootstrap.bundle.min.js'), path.join(OUT, 'vendor', 'bootstrap', 'bootstrap.bundle.min.js'));

    copyDir(STATIC, OUT);
    fs.writeFileSync(path.join(OUT, '.nojekyll'), ''); // GitHub Pages: serve files as-is

    // Offline cache: every built file, versioned by a hash of their contents
    const files = listFiles(OUT).filter(f => f !== 'sw.js' && f !== '.nojekyll' && !f.endsWith('.gitkeep'));
    const hash = crypto.createHash('sha256');
    files.forEach(f => { hash.update(f); hash.update(fs.readFileSync(path.join(OUT, f))); });
    const version = hash.digest('hex').slice(0, 12);
    const precache = ['./', ...files.map(f => './' + f)];
    const sw = fs.readFileSync(SW_TEMPLATE, 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(precache, null, 4));
    fs.writeFileSync(path.join(OUT, 'sw.js'), sw);

    const kb = (fs.statSync(path.join(OUT, 'index.html')).size / 1024).toFixed(0);
    console.log(`Offline cache: ${precache.length} entries, version ${version}`);
    console.log(`PWA build complete: dist-pwa/index.html (${kb} KB)`);
}

try {
    build();
} catch (err) {
    console.error('❌ PWA build failed:', err.message);
    process.exit(1);
}
