/**
 * Browser test (Playwright/Chromium) of the built PWA: installability, offline start,
 * starter pack, optimizing and editing with no network, and the update prompt.
 * Run: npm run test:e2e   (needs Playwright with Chromium installed)
 */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'dist-pwa'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); fs.createReadStream(f).pipe(res);
}).listen(8096);
const booted = page => page.waitForFunction(() => document.getElementById('boot-loader').classList.contains('d-none'), null, { timeout: 15000 });
(async () => {
  const browser = await chromium.launch(); const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto('http://localhost:8096/'); await booted(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 }).catch(async () => { await page.reload(); await booted(page); });
  console.log('service worker controlling page:', await page.evaluate(() => !!navigator.serviceWorker.controller));
  const cdp = await ctx.newCDPSession(page);
  const inst = await cdp.send('Page.getInstallabilityErrors');
  console.log('installability errors:', JSON.stringify(inst.installabilityErrors));
  // data + starter pack while online
  await page.evaluate(() => { appState.settings.displayUnit = 'mm'; renderSettings(); loadStarterPack(); });
  await page.waitForFunction(() => appState.projects.length === 3, null, { timeout: 10000 });
  await page.waitForTimeout(3500);
  // ---- OFFLINE ----
  await ctx.setOffline(true);
  await page.reload(); await booted(page);
  const offlineInfo = await page.evaluate(() => ({ online: navigator.onLine, projects: appState.projects.length, parts: appState.parts.length }));
  console.log('offline reload:', JSON.stringify(offlineInfo));
  // recalculate in the "store" with no signal (mobile => cutlist view)
  const wb = await page.evaluate(() => appState.projects.find(p => p.name === 'Workbench').id);
  await page.evaluate(id => { navigateTo('view-cutlist'); const c = document.getElementById('chk-' + id); c.checked = true; toggleProjectTree(id, true); runOptimization(); }, wb);
  await page.waitForTimeout(1000);
  console.log('offline optimization:', (await page.evaluate(() => document.getElementById('pane-shopping').innerText)).replace(/\s+/g, ' ').slice(0, 120));
  // edit offline, reload offline, still there
  await page.evaluate(() => { appState.projects[0].name = 'Edited offline'; saveState(); });
  await page.waitForTimeout(3500);
  await page.reload(); await booted(page);
  console.log('offline edit kept:', await page.evaluate(() => appState.projects.some(p => p.name === 'Edited offline')));
  await page.screenshot({ path: path.join(require('os').tmpdir(), 'pwa-offline.png') });
  // ---- NEW VERSION ----
  await ctx.setOffline(false);
  const swPath = path.join(ROOT, 'sw.js');
  fs.writeFileSync(swPath, fs.readFileSync(swPath, 'utf8').replace(/const VERSION = '([^']+)'/, "const VERSION = '$1-next'"));
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
  await page.waitForSelector('#pwa-update-banner', { timeout: 15000 });
  console.log('update banner:', await page.textContent('#pwa-update-banner'));
  await page.screenshot({ path: path.join(require('os').tmpdir(), 'pwa-update.png') });
  await Promise.all([page.waitForNavigation({ timeout: 15000 }), page.click('#pwa-update-banner button')]);
  await booted(page);
  console.log('after update, cache:', await page.evaluate(() => caches.keys()), 'data kept:', await page.evaluate(() => appState.projects.length));
  console.log('errors:', errors.length ? errors : 'none');
  const ok = offlineInfo.projects === 3 && errors.length === 0;
  if (!ok) { console.error('E2E FAILED'); process.exitCode = 1; } else console.log('E2E PASSED');
  await browser.close(); server.close();
})().catch(e => { console.error('FAILED', e); server.close(); process.exit(1); });
