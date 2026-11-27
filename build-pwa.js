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

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist-pwa');
const STATIC = path.join(ROOT, 'pwa');
const BOOTSTRAP = path.join(ROOT, 'node_modules', 'bootstrap', 'dist');

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
        '<meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <meta name="theme-color" content="#212529">',
        'charset meta');

    if (INCLUDE_RE.test(html) || html.includes('<?')) throw new Error('PWA build: unresolved template scriptlet left');

    fs.writeFileSync(path.join(OUT, 'index.html'), html);

    fs.mkdirSync(path.join(OUT, 'vendor', 'bootstrap'), { recursive: true });
    fs.copyFileSync(path.join(BOOTSTRAP, 'css', 'bootstrap.min.css'), path.join(OUT, 'vendor', 'bootstrap', 'bootstrap.min.css'));
    fs.copyFileSync(path.join(BOOTSTRAP, 'js', 'bootstrap.bundle.min.js'), path.join(OUT, 'vendor', 'bootstrap', 'bootstrap.bundle.min.js'));

    copyDir(STATIC, OUT);
    fs.writeFileSync(path.join(OUT, '.nojekyll'), ''); // GitHub Pages: serve files as-is

    const kb = (fs.statSync(path.join(OUT, 'index.html')).size / 1024).toFixed(0);
    console.log(`PWA build complete: dist-pwa/index.html (${kb} KB)`);
}

try {
    build();
} catch (err) {
    console.error('❌ PWA build failed:', err.message);
    process.exit(1);
}
