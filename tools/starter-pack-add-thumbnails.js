#!/usr/bin/env node
/**
 * Adds project pictures to a PWA starter pack from the Sheet's pck_thumbnails tab.
 * In the Sheet: open tab pck_thumbnails_EU / _US -> File -> Download -> CSV, then:
 *
 *   node tools/starter-pack-add-thumbnails.js pck_thumbnails_EU.csv EU
 *
 * Only pictures whose Project ID exists in the pack are added; every picture is checked
 * to be a valid base64 data URI first.
 */
const fs = require('fs');
const path = require('path');

const [, , file, region] = process.argv;
if (!file || !['EU', 'US'].includes(region)) {
    console.error('Usage: node tools/starter-pack-add-thumbnails.js <pck_thumbnails.csv> <EU|US>');
    process.exit(1);
}

/** Minimal RFC 4180 CSV parser (quoted fields, "" escapes, CRLF). */
function parseCsv(text) {
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) {
            if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
            else cur += c;
        } else if (c === '"') q = true;
        else if (c === ',') { row.push(cur); cur = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(cur); rows.push(row); row = []; cur = '';
        } else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(v => v.trim() !== ''));
}

const packFile = path.join(__dirname, '..', 'pwa', 'starter-packs', `starter_${region}.json`);
const pack = JSON.parse(fs.readFileSync(packFile, 'utf8'));
const projectIds = new Set(pack.projects.map(p => String(p.id)));
pack.thumbnails = pack.thumbnails || {};

const rows = parseCsv(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')).slice(1); // skip header
let added = 0, skipped = 0;
for (const [rawId, rawUri] of rows) {
    const id = String(rawId || '').trim(), uri = String(rawUri || '').trim();
    const m = uri.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!projectIds.has(id) || !m) { skipped++; console.warn(`skipped ${id || '(empty id)'}: ${!projectIds.has(id) ? 'no such project in pack' : 'not a base64 image'}`); continue; }
    const bytes = Buffer.from(m[2], 'base64');
    if (!bytes.length) { skipped++; continue; }
    pack.thumbnails[id] = uri;
    added++;
}
fs.writeFileSync(packFile, JSON.stringify(pack, null, 1));
const names = Object.fromEntries(pack.projects.map(p => [String(p.id), p.name]));
console.log(`starter_${region}.json: ${added} picture(s) added, ${skipped} skipped -> ` +
    Object.keys(pack.thumbnails).map(id => names[id] || id).join(', '));
