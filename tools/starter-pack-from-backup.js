#!/usr/bin/env node
/**
 * Converts a SolidCutlist full-backup JSON (Settings -> Download full backup) into a PWA
 * starter pack file. Used to move the starter packs out of the Sheet's pck_* tabs:
 * in a reset app, load the starter pack (metric for EU, inches for US), download a full
 * backup, then run:
 *
 *   node tools/starter-pack-from-backup.js backup.json EU   -> pwa/starter-packs/starter_EU.json
 *   node tools/starter-pack-from-backup.js backup.json US   -> pwa/starter-packs/starter_US.json
 */
const fs = require('fs');
const path = require('path');

const [, , file, region] = process.argv;
if (!file || !['EU', 'US'].includes(region)) {
    console.error('Usage: node tools/starter-pack-from-backup.js <full-backup.json> <EU|US>');
    process.exit(1);
}
const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
if (backup.format !== 'solidcutlist-full-backup') {
    console.error('Not a SolidCutlist full backup (format = ' + backup.format + ')');
    process.exit(1);
}
const s = backup.appState || {};
const pack = {};
['materials', 'profiles', 'projects', 'groups', 'parts', 'catalog', 'stores'].forEach(tab => {
    pack[tab] = Array.isArray(s[tab]) ? s[tab] : [];
});
// Starter prices are in the region's own unit system
const system = region === 'US' ? 'imperial' : 'metric';
pack.catalog.forEach(c => { if (!c.priceSystem) c.priceSystem = system; });
pack.thumbnails = backup.images || {};

const out = path.join(__dirname, '..', 'pwa', 'starter-packs', `starter_${region}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(pack, null, 1));
console.log(`Wrote ${out}: ` + Object.entries(pack).map(([k, v]) => `${k}=${Array.isArray(v) ? v.length : Object.keys(v).length}`).join(', '));
