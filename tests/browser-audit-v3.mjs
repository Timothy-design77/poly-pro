import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:4173/poly-pro/';
const OUT = path.resolve(process.env.AUDIT_OUTPUT_DIR || 'audit-artifacts-v3');
const FAKE_AUDIO = process.env.AUDIT_FAKE_AUDIO || '/tmp/poly-pro-fake-mic.wav';
await mkdir(path.join(OUT, 'screenshots'), { recursive: true });
await mkdir(path.join(OUT, 'downloads'), { recursive: true });

const report = { generatedAt: new Date().toISOString(), commit: process.env.GITHUB_SHA || 'unknown', checks: [], events: [], summary: {} };
let pageForShot = null;
let shotNo = 0;
function fail(message, details) { const e = new Error(message); e.details = details; throw e; }
function assert(ok, message, details) { if (!ok) fail(message, details); }
function errText(e) { return e instanceof Error ? `${e.name}: ${e.message}\n${e.stack || ''}` : String(e); }
async function shot(label, page = pageForShot) {
  if (!page || page.isClosed()) return null;
  const safe = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  const file = path.join(OUT, 'screenshots', `${String(++shotNo).padStart(2, '0')}-${safe}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  return path.relative(OUT, file);
}
async function test(name, category, fn, options = {}) {
  const item = { name, category, status: 'running' };
  const start = Date.now();
  report.checks.push(item);
  console.log(`\n[TEST] ${category} :: ${name}`);
  try {
    item.details = await fn();
    item.status = 'passed';
    console.log(`[PASS] ${name}`);
  } catch (e) {
    item.status = options.blocked ? 'blocked' : 'failed';
    item.error = errText(e);
    if (e && typeof e === 'object' && 'details' in e) item.details = e.details;
    item.screenshot = await shot(`failure-${name}`);
    console.error(`[FAIL] ${name}: ${item.error}`);
  }
  item.durationMs = Date.now() - start;
  return item.status === 'passed';
}

const browser = await chromium.launch({ headless: true, args: [
  '--autoplay-policy=no-user-gesture-required',
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  `--use-file-for-fake-audio-capture=${FAKE_AUDIO}`,
  '--disable-dev-shm-usage',
] });

async function setup(label) {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, colorScheme: 'dark', acceptDownloads: true, serviceWorkers: 'allow', permissions: ['microphone'] });
  await context.grantPermissions(['microphone'], { origin: new URL(BASE_URL).origin });
  const page = await context.newPage();
  pageForShot = page;
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) report.events.push({ label, type: m.type(), text: m.text() }); });
  page.on('pageerror', e => report.events.push({ label, type: 'pageerror', text: errText(e) }));
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.getByRole('button', { name: 'Home', exact: true }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(700);
  return { context, page };
}
async function go(page, name) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.locator('button[aria-current="page"]').filter({ hasText: name }).waitFor({ timeout: 5000 });
  await page.waitForTimeout(200);
}
async function openKeypad(page) {
  await go(page, 'Home');
  await page.locator('canvas').first().click({ position: { x: 150, y: 150 } });
  const overlay = page.locator('[data-no-swipe].fixed').filter({ hasText: 'BPM' }).last();
  await overlay.waitFor({ timeout: 5000 });
  await page.waitForTimeout(350);
  return overlay;
}
async function setBpm(page, value) {
  const overlay = await openKeypad(page);
  const keys = overlay.locator('div.grid.grid-cols-3 > button');
  for (let i = 0; i < 7; i++) await keys.nth(11).click();
  for (const c of String(value)) await overlay.getByRole('button', { name: c, exact: true }).click();
  await overlay.getByRole('button', { name: 'Set', exact: true }).click();
  await page.waitForTimeout(800);
}
function headerTempo(page) {
  return page.locator('span.font-mono.text-text-muted').filter({ hasText: /\// }).first();
}
async function readHeaderTempo(page) {
  const text = (await headerTempo(page).innerText()).trim();
  const match = text.match(/^([0-9.]+)\s*\//);
  assert(match, `Could not parse project tempo header: ${text}`);
  return Number(match[1]);
}
async function openSettings(page, context) {
  await go(page, 'Home');
  const handle = page.locator('span').filter({ hasText: /^Settings$/ }).last().locator('xpath=..');
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  assert(box, 'Settings handle missing');
  const cdp = await context.newCDPSession(page);
  const x = box.x + box.width / 2, sy = box.y + box.height / 2, ey = Math.max(50, sy - 580);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: sy, id: 1, radiusX: 4, radiusY: 4, force: 1 }] });
  for (let i = 1; i <= 10; i++) {
    const y = sy + (ey - sy) * i / 10;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] });
    await page.waitForTimeout(18);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor({ timeout: 5000 });
}
function section(page, title) {
  return page.locator('button').filter({ hasText: new RegExp(`^\\s*${title}`) }).first();
}

try {
  {
    const { context, page } = await setup('tempo');
    await test('BPM persistence is visible after reload without reopening the keypad', 'tempo', async () => {
      await setBpm(page, 123.5);
      const before = await readHeaderTempo(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Home', exact: true }).waitFor({ timeout: 15000 });
      await page.waitForTimeout(900);
      const after = await readHeaderTempo(page);
      assert(before === 123.5 && after === 123.5, 'Persisted header tempo mismatch', { before, after });
      return { before, after };
    });
    await test('Plus control changes tempo before the keypad is reopened', 'tempo', async () => {
      await setBpm(page, 123.5);
      const plus = page.locator('button').filter({ has: page.locator('svg line[x1="12"][y1="6"][x2="12"][y2="18"]') }).first();
      await plus.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 1, isPrimary: true, buttons: 1 });
      await page.waitForTimeout(60);
      await plus.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 1, isPrimary: true, buttons: 0 });
      await page.waitForTimeout(900);
      const changed = await readHeaderTempo(page);
      assert(changed === 124.5, 'Plus control did not apply +1 BPM', { changed });
      return { changed };
    });
    await test('Tap tempo changes tempo before the keypad is reopened', 'tempo', async () => {
      await setBpm(page, 90);
      const tap = page.getByRole('button', { name: /TAP/ });
      const times = [];
      for (let i = 0; i < 5; i++) {
        times.push(Date.now());
        await tap.click({ delay: 25 });
        if (i < 4) await page.waitForTimeout(600);
      }
      await page.waitForTimeout(800);
      const changed = await readHeaderTempo(page);
      const intervals = times.slice(1).map((v, i) => v - times[i]);
      const expected = Math.round((60000 / (intervals.reduce((a,b)=>a+b,0)/intervals.length)) * 2) / 2;
      assert(Math.abs(changed - expected) <= 1, 'Tap tempo header did not match measured taps', { changed, expected, intervals });
      return { changed, expected, intervals };
    });
    await test('Opening the BPM keypad after an external tempo change does not revert tempo', 'tempo-regression', async () => {
      const before = await readHeaderTempo(page);
      const overlay = await openKeypad(page);
      await page.waitForTimeout(800);
      const displayed = Number((await overlay.locator('div.font-mono.text-4xl').innerText()).trim());
      const during = await readHeaderTempo(page);
      await overlay.getByRole('button', { name: 'Cancel', exact: true }).click();
      await page.waitForTimeout(500);
      const after = await readHeaderTempo(page);
      assert(displayed === before && during === before && after === before, 'Keypad opening reverted or desynchronized tempo', { before, displayed, during, after });
      return { before, displayed, during, after };
    });
    await context.close();
  }

  {
    const { context, page } = await setup('settings');
    await test('All nine Settings sections are present and can be expanded', 'settings', async () => {
      await openSettings(page, context);
      const titles = ['Sounds','Recording','Detection','Vibration','Interface','Calibration','Instruments','Data','Cloud Enhancement'];
      const results = [];
      for (const title of titles) {
        const b = section(page, title);
        await b.waitFor({ state: 'visible', timeout: 5000 });
        const parent = b.locator('xpath=..');
        let count = await parent.locator('button, input, select, textarea').count();
        if (count <= 1) { await b.click(); await page.waitForTimeout(180); count = await parent.locator('button, input, select, textarea').count(); }
        const excerpt = (await parent.innerText()).slice(0, 160);
        assert(count > 1 || excerpt.length > title.length + 20, `No functional content in ${title}`, { count, excerpt });
        results.push({ title, controls: count, excerpt });
        if ((await parent.locator('button, input, select, textarea').count()) > 1) await b.click();
      }
      return results;
    });
    await test('Backup export and import round-trip succeeds', 'settings-data', async () => {
      const b = section(page, 'Data');
      await b.scrollIntoViewIfNeeded();
      await b.click();
      const parent = b.locator('xpath=..');
      const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
      await parent.getByRole('button', { name: 'Export Backup', exact: true }).click();
      const download = await downloadPromise;
      const file = path.join(OUT, 'downloads', 'roundtrip.polypro');
      await download.saveAs(file);
      const bytes = (await stat(file)).size;
      await parent.locator('input[type="file"][accept=".polypro"]').setInputFiles(file);
      await parent.getByText('Import Preview', { exact: true }).waitFor({ timeout: 20000 });
      await parent.getByRole('button', { name: 'Import', exact: true }).click();
      await parent.getByText(/Imported .* projects, .* sessions/).waitFor({ timeout: 30000 });
      assert(bytes > 100, 'Backup file was too small', { bytes });
      return { bytes, preview: true, import: true };
    });
    await context.close();
  }

  {
    const { context, page } = await setup('media-diagnostic');
    await test('Sequential dummy-then-raw fake microphone acquisition behavior is diagnosed', 'recording-environment', async () => {
      const result = await page.evaluate(async () => {
        const trace = [];
        const withTimeout = (p, label, ms=15000) => Promise.race([p, new Promise((_, reject)=>setTimeout(()=>reject(new Error(`${label} timeout`)), ms))]);
        try {
          trace.push({ step: 'enumerate-1', devices: (await navigator.mediaDevices.enumerateDevices()).map(d=>({kind:d.kind,label:d.label,deviceId:d.deviceId})) });
          const dummy = await withTimeout(navigator.mediaDevices.getUserMedia({ audio: { sampleRate: { ideal: 48000 }, echoCancellation: false, autoGainControl: false, noiseSuppression: false } }), 'dummy');
          trace.push({ step: 'dummy-open', settings: dummy.getAudioTracks()[0]?.getSettings() });
          trace.push({ step: 'enumerate-2', devices: (await navigator.mediaDevices.enumerateDevices()).map(d=>({kind:d.kind,label:d.label,deviceId:d.deviceId})) });
          dummy.getTracks().forEach(t=>t.stop());
          trace.push({ step: 'dummy-stopped' });
          const raw = await withTimeout(navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: {exact:false}, autoGainControl:{exact:false}, noiseSuppression:{exact:false}, sampleRate:{ideal:48000}, channelCount:1 } }), 'raw');
          trace.push({ step: 'raw-open', settings: raw.getAudioTracks()[0]?.getSettings() });
          raw.getTracks().forEach(t=>t.stop());
          return { success: true, trace };
        } catch (error) {
          return { success: false, error: `${error.name}: ${error.message}`, trace };
        }
      });
      return result;
    });
    await context.close();
  }

  {
    const { context, page } = await setup('recording-bypassed-mic-selection');
    let review = false;
    await test('Recording, PCM capture, analysis, and review work when fake-device reacquisition is stabilized', 'recording-pipeline', async () => {
      const patch = await page.evaluate(async () => {
        const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        const base = await original({ audio: { echoCancellation: {exact:false}, autoGainControl:{exact:false}, noiseSuppression:{exact:false} } });
        window.__auditBaseStream = base;
        navigator.mediaDevices.getUserMedia = async () => base.clone();
        return { label: base.getAudioTracks()[0]?.label, settings: base.getAudioTracks()[0]?.getSettings() };
      });
      await setBpm(page, 120);
      await page.getByRole('button', { name: 'RECORD', exact: true }).click();
      await page.getByRole('button', { name: 'STOP REC', exact: true }).waitFor({ timeout: 30000 });
      await page.waitForTimeout(9000);
      await page.getByRole('button', { name: 'STOP REC', exact: true }).click();
      await page.getByText('Session Complete', { exact: true }).waitFor({ timeout: 120000 });
      const body = await page.locator('body').innerText();
      assert(/Hits/.test(body) && /Hit Rate/.test(body) && /Save Session/.test(body), 'Review screen missing required metrics', { excerpt: body.slice(0,1600) });
      review = true;
      await shot('recording-review-v3', page);
      return { patch, excerpt: body.slice(0,1200) };
    });
    await test('Saved recording opens all detail tabs and appears in Progress', 'recording-pipeline', async () => {
      assert(review, 'Recording review was not reached');
      await page.getByRole('button', { name: 'Save Session', exact: true }).click();
      await page.getByText('Session Saved', { exact: true }).waitFor({ timeout: 60000 });
      await page.getByRole('button', { name: 'View Details', exact: true }).click();
      const tabs = [];
      for (const name of ['Score','Timeline','Charts','Tune']) {
        const b = page.getByRole('button', { name, exact: true });
        await b.waitFor({ timeout: 20000 });
        await b.click();
        tabs.push(name);
      }
      await page.getByRole('button', { name: '← Back', exact: true }).click();
      await go(page, 'Progress');
      const text = await page.locator('body').innerText();
      assert(/Sessions \(1\)|1 sessions?/i.test(text), 'Saved session absent from Progress', { excerpt:text.slice(0,1500) });
      await shot('saved-progress-v3', page);
      return { tabs, excerpt:text.slice(0,1000) };
    }, { blocked: !review });
    await page.evaluate(() => window.__auditBaseStream?.getTracks().forEach(t=>t.stop())).catch(()=>{});
    await context.close();
  }
} finally {
  await browser.close();
}

const failed = report.checks.filter(c=>c.status==='failed').length;
const blocked = report.checks.filter(c=>c.status==='blocked').length;
const passed = report.checks.filter(c=>c.status==='passed').length;
report.summary = { total:report.checks.length, passed, failed, blocked, consoleErrors:report.events.filter(e=>e.type==='error'||e.type==='pageerror').length, consoleWarnings:report.events.filter(e=>e.type==='warning').length };
await writeFile(path.join(OUT,'browser-audit-v3-report.json'), JSON.stringify(report,null,2)+'\n');
console.log(`\n[SUMMARY] ${JSON.stringify(report.summary)}`);
if (failed) process.exitCode=1;
