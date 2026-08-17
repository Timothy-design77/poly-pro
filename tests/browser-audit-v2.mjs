import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:4173/poly-pro/';
const OUT = path.resolve(process.env.AUDIT_OUTPUT_DIR || 'audit-artifacts-v2');
const FAKE_AUDIO = process.env.AUDIT_FAKE_AUDIO || '/tmp/poly-pro-fake-mic.wav';
await mkdir(path.join(OUT, 'screenshots'), { recursive: true });
await mkdir(path.join(OUT, 'downloads'), { recursive: true });

const report = {
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA || 'unknown',
  checks: [],
  browserEvents: [],
  networkEvents: [],
  summary: {},
};
let activePage = null;
let shot = 0;

function assert(condition, message, details) {
  if (condition) return;
  const error = new Error(message);
  error.details = details;
  throw error;
}
function textError(error) {
  return error instanceof Error ? `${error.name}: ${error.message}\n${error.stack || ''}` : String(error);
}
async function screenshot(label, page = activePage) {
  if (!page || page.isClosed()) return null;
  const safe = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
  const filename = path.join(OUT, 'screenshots', `${String(++shot).padStart(2, '0')}-${safe}.png`);
  try {
    await page.screenshot({ path: filename, fullPage: true });
    return path.relative(OUT, filename);
  } catch {
    return null;
  }
}
async function check(name, category, fn, options = {}) {
  const started = Date.now();
  const item = { name, category, status: 'running', severity: options.severity || 'error' };
  report.checks.push(item);
  console.log(`\n[VERIFY] ${category} :: ${name}`);
  try {
    item.details = await fn();
    item.status = 'passed';
    item.durationMs = Date.now() - started;
    console.log(`[PASS] ${name}`);
    return true;
  } catch (error) {
    item.status = options.statusOnFailure || 'failed';
    item.durationMs = Date.now() - started;
    item.error = textError(error);
    if (error && typeof error === 'object' && 'details' in error) item.details = error.details;
    item.screenshot = await screenshot(`failure-${name}`);
    console.error(`[FAIL] ${name}: ${item.error}`);
    return false;
  }
}
function observe(page, label) {
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      report.browserEvents.push({ source: label, type: message.type(), text: message.text(), location: message.location() });
    }
  });
  page.on('pageerror', (error) => report.browserEvents.push({ source: label, type: 'pageerror', text: textError(error) }));
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText || '';
    if (failure !== 'net::ERR_ABORTED') {
      report.networkEvents.push({ source: label, url: request.url(), method: request.method(), failure });
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) report.networkEvents.push({ source: label, url: response.url(), status: response.status() });
  });
}
async function waitForApp(page) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.getByRole('button', { name: 'Home', exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(600);
}
async function go(page, name) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.locator('button[aria-current="page"]').filter({ hasText: name }).waitFor({ state: 'visible', timeout: 5_000 });
  await page.waitForTimeout(250);
}
async function openBpm(page) {
  await go(page, 'Home');
  await page.locator('canvas').first().click({ position: { x: 110, y: 110 } });
  const overlay = page.locator('[data-no-swipe].fixed').filter({ hasText: 'BPM' }).last();
  await overlay.waitFor({ state: 'visible', timeout: 5_000 });
  return overlay;
}
async function readBpm(page) {
  const overlay = await openBpm(page);
  const raw = (await overlay.locator('div.font-mono.text-4xl').innerText()).trim();
  await overlay.getByRole('button', { name: 'Cancel', exact: true }).click();
  const value = Number(raw);
  assert(Number.isFinite(value), `BPM display was not numeric: ${raw}`);
  return value;
}
async function setBpm(page, value) {
  const overlay = await openBpm(page);
  const keys = overlay.locator('div.grid.grid-cols-3 > button');
  for (let i = 0; i < 7; i += 1) await keys.nth(11).click();
  for (const character of String(value)) await overlay.getByRole('button', { name: character, exact: true }).click();
  await overlay.getByRole('button', { name: 'Set', exact: true }).click();
  await page.waitForTimeout(250);
}
function bpmButtons(page) {
  const horizontal = page.locator('svg line[x1="6"][y1="12"][x2="18"][y2="12"]');
  const vertical = page.locator('svg line[x1="12"][y1="6"][x2="12"][y2="18"]');
  return {
    minus: page.locator('button').filter({ has: horizontal, hasNot: vertical }).first(),
    plus: page.locator('button').filter({ has: vertical }).first(),
  };
}
async function longPress(page, locator, duration = 750) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  assert(box, 'Long-press target had no bounding box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(duration);
  await page.mouse.up();
}
function projectCard(page, name) {
  return page.getByText(name, { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"touch-manipulation")][1]');
}
async function openSettings(page, context) {
  await go(page, 'Home');
  const handle = page.locator('span').filter({ hasText: /^Settings$/ }).last().locator('xpath=..');
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  assert(box, 'Settings handle was not visible');
  const cdp = await context.newCDPSession(page);
  const x = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const endY = Math.max(55, startY - 560);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: startY, radiusX: 4, radiusY: 4, force: 1, id: 1 }] });
  for (let i = 1; i <= 10; i += 1) {
    const y = startY + ((endY - startY) * i) / 10;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }] });
    await page.waitForTimeout(18);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const heading = page.getByRole('heading', { name: 'Settings', exact: true });
  await heading.waitFor({ state: 'visible', timeout: 5_000 });
  return heading.locator('xpath=ancestor::div[contains(@class,"fixed")][1]');
}
async function sectionButton(overlay, title) {
  const locator = overlay.locator('button').filter({ hasText: new RegExp(`^\\s*${title}`) }).first();
  await locator.scrollIntoViewIfNeeded();
  assert(await locator.count(), `Settings section not found: ${title}`);
  return locator;
}

const browser = await chromium.launch({
  headless: true,
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${FAKE_AUDIO}`,
    '--disable-dev-shm-usage',
  ],
});

async function newContext(label, options = {}) {
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
    locale: 'en-US',
    acceptDownloads: true,
    serviceWorkers: 'allow',
    permissions: ['microphone'],
    ...options,
  });
  await context.grantPermissions(['microphone'], { origin: new URL(BASE_URL).origin });
  const page = await context.newPage();
  activePage = page;
  observe(page, label);
  await waitForApp(page);
  return { context, page };
}

try {
  {
    const { context, page } = await newContext('bpm');
    await check('Half-BPM keypad value persists across a full reload', 'metronome-controls', async () => {
      await setBpm(page, 123.5);
      const immediate = await readBpm(page);
      await page.waitForTimeout(1100);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Home', exact: true }).waitFor({ timeout: 15_000 });
      const persisted = await readBpm(page);
      assert(immediate === 123.5 && persisted === 123.5, 'BPM value mismatch', { immediate, persisted });
      return { immediate, persisted };
    });
    await check('Plus and minus controls preserve 0.5-BPM precision', 'metronome-controls', async () => {
      await setBpm(page, 123.5);
      const { minus, plus } = bpmButtons(page);
      await plus.click();
      const raised = await readBpm(page);
      await minus.click();
      const restored = await readBpm(page);
      assert(raised === 124.5 && restored === 123.5, 'Unexpected BPM adjustment result', { raised, restored });
      return { start: 123.5, raised, restored };
    });
    await context.close();
  }

  {
    const { context, page } = await newContext('tap-tempo');
    await check('Tap tempo updates BPM from five measured taps', 'metronome-controls', async () => {
      await setBpm(page, 90);
      const tap = page.getByRole('button', { name: /TAP/ });
      const timestamps = [];
      for (let i = 0; i < 5; i += 1) {
        timestamps.push(Date.now());
        await tap.click({ delay: 35 });
        if (i < 4) await page.waitForTimeout(600);
      }
      const badge = await tap.locator('span').innerText().catch(() => 'none');
      const measured = await readBpm(page);
      const intervals = timestamps.slice(1).map((value, index) => value - timestamps[index]);
      const expected = 60000 / (intervals.reduce((sum, value) => sum + value, 0) / intervals.length);
      assert(measured >= 96 && measured <= 104, `Expected approximately 100 BPM, got ${measured}`, { measured, expected, intervals, badge });
      return { measured, expected, intervals, badge };
    });
    await context.close();
  }

  {
    const { context, page } = await newContext('stability');
    await check('Metronome remains responsive during a 60-second browser stability run', 'audio-stability', async () => {
      await setBpm(page, 180.5);
      await page.getByRole('button', { name: 'Start metronome' }).click();
      await page.getByRole('button', { name: 'Stop metronome' }).waitFor({ timeout: 5_000 });
      const started = Date.now();
      for (let i = 0; i < 6; i += 1) {
        await page.waitForTimeout(10_000);
        assert(await page.getByRole('button', { name: 'Stop metronome' }).isVisible(), `Metronome stopped unexpectedly at ${i * 10 + 10}s`);
        if (i === 2) await setBpm(page, 181.5);
      }
      await page.getByRole('button', { name: 'Stop metronome' }).click();
      const finalBpm = await readBpm(page);
      assert(finalBpm === 181.5, 'Live BPM change did not survive the stability run', { finalBpm });
      return { durationMs: Date.now() - started, finalBpm };
    });
    await context.close();
  }

  {
    const { context, page } = await newContext('projects');
    await check('Project create, reload persistence, rename, switch, and delete all work', 'projects', async () => {
      await go(page, 'Projects');
      await page.getByRole('button', { name: '+ New Project', exact: true }).click();
      await page.getByText('New Project', { exact: true }).waitFor({ timeout: 5_000 });
      await page.locator('input[placeholder*="Paradiddles"]').last().fill('Audit Project');
      const numbers = page.locator('input[type="number"]');
      await numbers.nth(0).fill('90');
      await numbers.nth(1).fill('150');
      await page.getByRole('button', { name: 'Create Project', exact: true }).click();
      await page.getByText('Audit Project', { exact: true }).first().waitFor({ timeout: 5_000 });
      await page.waitForTimeout(1000);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('button', { name: 'Home', exact: true }).waitFor({ timeout: 15_000 });
      await go(page, 'Projects');
      await page.getByText('Audit Project', { exact: true }).first().waitFor({ timeout: 5_000 });
      await projectCard(page, 'My First Project').click();
      await page.waitForTimeout(700);
      await longPress(page, projectCard(page, 'Audit Project'));
      await page.getByText('Edit Project', { exact: true }).waitFor({ timeout: 5_000 });
      await page.locator('input[placeholder*="Paradiddles"]').last().fill('Audit Project Renamed');
      await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
      await page.getByText('Audit Project Renamed', { exact: true }).first().waitFor({ timeout: 5_000 });
      await longPress(page, projectCard(page, 'Audit Project Renamed'));
      await page.getByRole('button', { name: 'Delete Project', exact: true }).click();
      await page.getByText(/Delete Audit Project Renamed\?/).waitFor({ timeout: 5_000 });
      await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
      await page.waitForTimeout(500);
      assert((await page.getByText('Audit Project Renamed', { exact: true }).count()) === 0, 'Deleted project remained visible');
      return { created: true, persisted: true, renamed: true, switched: true, deleted: true };
    });
    await context.close();
  }

  {
    const { context, page } = await newContext('settings');
    await check('Every Settings section opens and exposes functional controls', 'settings', async () => {
      const overlay = await openSettings(page, context);
      const titles = ['Sounds', 'Recording', 'Detection', 'Vibration', 'Interface', 'Calibration', 'Instruments', 'Data', 'Cloud Enhancement'];
      const results = [];
      for (const title of titles) {
        const button = await sectionButton(overlay, title);
        const section = button.locator('xpath=..');
        let controls = await section.locator('button, input, select, textarea').count();
        if (controls <= 1) {
          await button.click();
          await page.waitForTimeout(180);
          controls = await section.locator('button, input, select, textarea').count();
        }
        const text = (await section.innerText()).slice(0, 400);
        assert(controls > 1 || text.length > title.length + 20, `Section did not expose meaningful content: ${title}`, { controls, text });
        results.push({ title, controls, excerpt: text.slice(0, 120) });
        if ((await section.locator('button, input, select, textarea').count()) > 1) await button.click();
      }
      return results;
    });
    await check('Data backup exports, previews, and imports successfully', 'settings-data', async () => {
      const overlay = page.getByRole('heading', { name: 'Settings', exact: true }).locator('xpath=ancestor::div[contains(@class,"fixed")][1]');
      const dataButton = await sectionButton(overlay, 'Data');
      await dataButton.click();
      const data = dataButton.locator('xpath=..');
      const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
      await data.getByRole('button', { name: 'Export Backup', exact: true }).click();
      const download = await downloadPromise;
      const backupPath = path.join(OUT, 'downloads', 'poly-pro-refined-audit.polypro');
      await download.saveAs(backupPath);
      const size = (await stat(backupPath)).size;
      assert(size > 100, `Backup was unexpectedly small: ${size}`);
      await data.locator('input[type="file"][accept=".polypro"]').setInputFiles(backupPath);
      await data.getByText('Import Preview', { exact: true }).waitFor({ timeout: 20_000 });
      await data.getByRole('button', { name: 'Import', exact: true }).click();
      await data.getByText(/Imported .* projects, .* sessions/).waitFor({ timeout: 30_000 });
      return { bytes: size, previewed: true, imported: true };
    });
    await context.close();
  }

  {
    const { context, page } = await newContext('recording');
    await check('Chromium fake microphone supports raw audio constraints used by the app', 'recording-environment', async () => {
      const result = await page.evaluate(async () => {
        const constraints = {
          audio: {
            echoCancellation: { exact: false },
            autoGainControl: { exact: false },
            noiseSuppression: { exact: false },
            sampleRate: { ideal: 48000 },
            channelCount: { ideal: 1 },
          },
        };
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('getUserMedia timeout')), 20_000));
        const stream = await Promise.race([navigator.mediaDevices.getUserMedia(constraints), timeout]);
        const track = stream.getAudioTracks()[0];
        const details = { label: track?.label || '', settings: track?.getSettings?.() || {}, constraints: track?.getConstraints?.() || {} };
        stream.getTracks().forEach((item) => item.stop());
        return details;
      });
      assert(result.label || result.settings, 'Fake microphone stream returned no audio track', result);
      return result;
    });

    let reviewReached = false;
    await check('App recording starts, captures fake microphone audio, analyzes it, and reaches review', 'recording-analysis', async () => {
      await setBpm(page, 120);
      await page.getByRole('button', { name: 'RECORD', exact: true }).click();
      await page.waitForFunction(() => {
        const body = document.body.innerText;
        return [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('STOP REC')) ||
          /Microphone access denied|No microphone found|Microphone is in use|Recording failed/.test(body);
      }, null, { timeout: 60_000 });
      const errorText = await page.locator('body').innerText();
      assert(!/Microphone access denied|No microphone found|Microphone is in use|Recording failed/.test(errorText), 'App displayed a microphone error', { excerpt: errorText.slice(0, 1200) });
      const stop = page.getByRole('button', { name: 'STOP REC', exact: true });
      await stop.waitFor({ state: 'visible', timeout: 5_000 });
      await page.waitForTimeout(9_000);
      await stop.click();
      await page.getByText('Session Complete', { exact: true }).waitFor({ state: 'visible', timeout: 120_000 });
      const review = await page.locator('body').innerText();
      assert(/Hits/.test(review) && /Hit Rate/.test(review) && /Save Session/.test(review), 'Review screen lacked required analysis and save controls', { excerpt: review.slice(0, 1800) });
      reviewReached = true;
      await screenshot('recording-review-refined', page);
      return { reviewReached, excerpt: review.slice(0, 1200) };
    });

    await check('Reviewed session saves, opens details, and appears in Progress', 'recording-analysis', async () => {
      assert(reviewReached, 'Blocked because recording review was not reached');
      await page.getByRole('button', { name: 'Save Session', exact: true }).click();
      await page.getByText('Session Saved', { exact: true }).waitFor({ timeout: 60_000 });
      await page.getByRole('button', { name: 'View Details', exact: true }).click();
      await page.getByRole('button', { name: 'Timeline', exact: true }).waitFor({ state: 'visible', timeout: 20_000 });
      const tabs = [];
      for (const tab of ['Score', 'Timeline', 'Charts', 'Tune']) {
        await page.getByRole('button', { name: tab, exact: true }).click();
        tabs.push(tab);
      }
      await page.getByRole('button', { name: '← Back', exact: true }).click();
      await go(page, 'Progress');
      const progress = await page.locator('body').innerText();
      assert(/Sessions \(1\)/.test(progress) || /1 sessions?/.test(progress), 'Saved session did not appear in Progress', { excerpt: progress.slice(0, 1600) });
      await screenshot('recording-progress-refined', page);
      return { saved: true, detailTabs: tabs, progressExcerpt: progress.slice(0, 1000) };
    }, { statusOnFailure: reviewReached ? 'failed' : 'blocked' });
    await context.close();
  }
} finally {
  await browser.close();
}

const failed = report.checks.filter((item) => item.status === 'failed').length;
const blocked = report.checks.filter((item) => item.status === 'blocked').length;
const passed = report.checks.filter((item) => item.status === 'passed').length;
report.summary = {
  total: report.checks.length,
  passed,
  failed,
  blocked,
  consoleErrors: report.browserEvents.filter((item) => item.type === 'error' || item.type === 'pageerror').length,
  consoleWarnings: report.browserEvents.filter((item) => item.type === 'warning').length,
  networkFailures: report.networkEvents.length,
};
await writeFile(path.join(OUT, 'browser-audit-v2-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`\n[VERIFY SUMMARY] ${JSON.stringify(report.summary)}`);
if (failed > 0) process.exitCode = 1;
