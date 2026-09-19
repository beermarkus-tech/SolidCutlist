'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * Loads a Google Apps Script HTML partial (a file whose body is one or more
 * plain <script>...</script> blocks) and evaluates it in a sandboxed VM
 * context, so tests exercise the real production source directly instead of
 * a duplicated copy. Returns the sandbox context object; named functions
 * declared at the top level of the partial's script(s) become properties of
 * it (e.g. `ctx.resolveShortfallGreedy`).
 *
 * @param {string} relativeHtmlPath - path relative to the repo's src/ dir,
 *   e.g. 'Frontend/JS/Modules/js_bulk_margin.html'
 * @param {object} [extraGlobals] - extra properties to seed into the sandbox
 *   (e.g. stub versions of appState-adjacent helpers the partial calls out to)
 * @returns {object} the VM sandbox context, with the partial's top-level
 *   functions/vars attached
 */
function loadGasPartial(relativeHtmlPath, extraGlobals) {
    const fullPath = path.join(__dirname, '..', '..', 'src', relativeHtmlPath);
    const html = fs.readFileSync(fullPath, 'utf8');

    const scriptBodies = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)]
        .map(m => m[1]);
    if (scriptBodies.length === 0) {
        throw new Error(`No <script> blocks found in ${relativeHtmlPath}`);
    }

    const context = vm.createContext(Object.assign({ console }, extraGlobals || {}));
    scriptBodies.forEach((src, i) => {
        new vm.Script(src, { filename: `${relativeHtmlPath}#script${i}` }).runInContext(context);
    });

    return context;
}

module.exports = { loadGasPartial };
