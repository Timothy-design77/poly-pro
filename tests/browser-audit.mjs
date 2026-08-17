import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import axe from 'axe-core';

const LOCAL_URL = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:4173/poly-pro/';
const DEPLOYED_URL = process.env.AUDIT_DEPLOYED_URL || 'https://timothy-design77.github.io/poly-pro/';
const OUTPUT_DIR = path.resolve(process.env.AUDIT_OUTPUT_DIR || 'audit-artifacts');
const FAKE_AUDIO = process.env.AUDIT_FAKE_AUDIO || '/tmp/poly-pro-fake-mic.wav';
const COMMIT = process.env.GITHUB_SHA || 'unknown';

await mkdir(OUTPUT_DIR, { recursive: true });
await mkdir(path.join(OUTPUT_DIR, 'screenshots'), { recursive: true });
await mkdir(path.join(OUTPUT_DIR, 'downloads'), { recursive: true });

const report = {
  generatedAt: new Date().toISOString(),
  commit: COMMIT,
  environment: {
    node: process.version,
    localUrl: LOCAL_URL,
    deployedUrl: DEPLOYED_URL,
    fakeAudio: FAKE_AUDIO,
  },
  checks: [],
  browserEvents: [],
  network: [],
  accessibility: null,
  artifacts: [],
  summary: {},
};

let activePage = null;
let screenshotCounter = 0;

function cleanName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function errorText(error) {
  if (error instanceof Error) return `${error.name}: ${error.message}\n${error.stack || ''}`;
  return String(error);
}

function assert(condition, message, details = undefined) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

async function screenshot(label, page = activePage) {
  if (!page || page.isClosed()) return null;
  const file = path.join(OUTPUT_DIR, 'screenshots', `${String(++screenshotCounter).padStart(2, '0')}-${cleanName(label)}.png`);
  try {
    await page.screenshot({ path: file, fullPage: true });
    report.artifacts.push(path.relative(OUTPUT_DIR, file));
    return path.relative(OUTPUT_DIR, file);
  } catch {
    return null;
  }
}

async function runCheck(name, category, fn, options = {}) {
  const startedAt = Date.now();
  const entry = {
    name,
    category,
    severity: options.severity || 'error',
    status: 'running',
    startedAt: new Date(startedAt).toISOString(),
  };
  report.checks.push(entry);
  console.log(`\n[AUDIT] ${category} :: ${name}`);
  try {
    const details = await fn();
    entry.status = 'passed';
    entry.durationMs = Date.now() - startedAt;
    if (details !== undefined) entry.details = details;
    console.log(`[PASS] ${name}`);
    return true;
  } catch (error) {
    entry.status = options.statusOnFailure || 'failed';
    entry.durationMs = Date.now() - startedAt;
    entry.error = errorText(error);
    if (error && typeof error === 'object' && 'details' in error) entry.details = error.details;
    entry.screenshot = await screenshot(`failure-${name}`);
    console.error(`[FAIL] ${name}: ${entry.error}`);
    return false;
  }
}

function installPageObservers(page, label) {
  page.on('console', (message) => {
    const type = message.type();
    if (type === 'error' || type === 'warning') {
      report.browserEvents.push({
        source: label,
        type: `console-${type}`,
        text: message.text(),
        location: message.location(),
      });
    }
  });
  page.on('pageerror', (error) => {
    report.browserEvents.push({ source: label, type: 'page-error', text: errorText(error) });
  });
  page.on('requestfailed', (request) => {
    report.network.push({
      source: label,
      type: 'request-failed',
      url: request.url(),
      method: request.method(),
      failure: request.failure(),
    });
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      report.network.push({
        source: label,
        type: 'http-error',
        url: response.url(),
        status: response.status(),
        statusText: response.statusText(),
      });
    }
  });
}

async function waitForApp(page, url = LOCAL_URL) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.getByRole('button', { name: 'Home', exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('button[aria-current="page"]').filter({ hasText: 'Home' }).waitFor({ state: 'visible', timeout: 10_000 });
  await page.waitForTimeout(500);
}

async function goToPage(page, name) {
  await page.getByRole('button', { name, exact: true }).click();
  await page.locator('button[aria-current="page"]').filter({ hasText: name }).waitFor({ state: 'visible', timeout: 5_000 });
  await page.waitForTimeout(250);
}

async function openBpmModal(page) {
  await goToPage(page, 'Home');
  await page.locator('canvas').first().click({ position: { x: 100, y: 100 } });
  const overlay = page.locator('[data-no-swipe].fixed').filter({ hasText: 'BPM' }).last();
  await overlay.waitFor({ state: 'visible', timeout: 5_000 });
  return overlay;
}

async function readBpm(page) {
  const overlay = await openBpmModal(page);
  const valueText = (await overlay.locator('div.text-center.mb-4 > div').nth(1).innerText()).trim();
  await overlay.getByRole('button', { name: 'Cancel', exact: true }).click();
  return Number(valueText);
}

async function setBpm(page, value) {
  const overlay = await openBpmModal(page);
  const keypad = overlay.locator('div.grid.grid-cols-3 > button');
  for (let i = 0; i < 7; i += 1) await keypad.nth(11).click();
  for (const char of String(value)) {
    await overlay.getByRole('button', { name: char, exact: true }).click();
  }
  await overlay.getByRole('button', { name: 'Set', exact: true }).click();
  await page.waitForTimeout(150);
}

async function bpmControlButtons(page) {
  const root = page.locator('canvas').first().locator('xpath=../following-sibling::div[1]/div[1]');
  return {
    minus: root.locator('button').nth(0),
    plus: root.locator('button').nth(1),
  };
}

async function openCard(page, title) {
  const header = page.locator('button[aria-expanded]').filter({ hasText: title }).first();
  await header.scrollIntoViewIfNeeded();
  if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
  await page.waitForTimeout(200);
  return header.locator('xpath=..');
}

async function longPress(page, locator, duration = 700) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  assert(box, 'Target has no bounding box for long press');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(duration);
  await page.mouse.up();
}

async function openSettings(page, context) {
  await goToPage(page, 'Home');
  const label = page.locator('span').filter({ hasText: /^Settings$/ }).last();
  await label.scrollIntoViewIfNeeded();
  const handle = label.locator('xpath=..');
  const box = await handle.boundingBox();
  assert(box, 'Settings handle is not visible');
  const cdp = await context.newCDPSession(page);
  const x = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  const endY = Math.max(60, startY - 520);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: startY, radiusX: 4, radiusY: 4, force: 1, id: 1 }] });
  for (let i = 1; i <= 8; i += 1) {
    const y = startY + ((endY - startY) * i) / 8;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }] });
    await page.waitForTimeout(20);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor({ state: 'visible', timeout: 5_000 });
}

async function openSettingsSection(page, title) {
  const header = page.locator('button').filter({ hasText: title }).filter({ has: page.locator('svg polyline[points="6 9 12 15 18 9"]') }).first();
  await header.scrollIntoViewIfNeeded();
  await header.click();
  await page.waitForTimeout(200);
  return header.locator('xpath=..');
}

function projectCard(page, projectName) {
  return page.getByText(projectName, { exact: true }).locator('xpath=ancestor::div[contains(@class,"touch-manipulation")][1]');
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

try {
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
    locale: 'en-US',
    acceptDownloads: true,
    serviceWorkers: 'allow',
    permissions: ['microphone'],
  });
  await context.grantPermissions(['microphone'], { origin: new URL(LOCAL_URL).origin });
  const page = await context.newPage();
  activePage = page;
  installPageObservers(page, 'local-core');

  await runCheck('Application boots to the Home page', 'startup', async () => {
    await waitForApp(page);
    const current = await page.locator('button[aria-current="page"]').innerText();
    assert(current.trim() === 'Home', `Expected Home to be active, got ${current}`);
    const defaultProjectVisible = await page.getByText('My First Project', { exact: true }).count();
    assert(defaultProjectVisible > 0, 'Default project context was not created or rendered');
    await screenshot('startup-home', page);
    return { activePage: current.trim(), defaultProject: 'My First Project' };
  });

  await runCheck('Page-pill navigation works in both directions', 'navigation', async () => {
    const visited = [];
    for (const target of ['Projects', 'Progress', 'Home']) {
      await goToPage(page, target);
      visited.push((await page.locator('button[aria-current="page"]').innerText()).trim());
    }
    assert(visited.join(',') === 'Projects,Progress,Home', `Unexpected navigation sequence: ${visited.join(',')}`);
    return { visited };
  });

  await runCheck('Responsive layouts avoid document-level horizontal overflow', 'responsive-layout', async () => {
    const viewports = [
      { width: 360, height: 800, label: 'small-phone' },
      { width: 412, height: 915, label: 'phone' },
      { width: 884, height: 760, label: 'fold-open' },
      { width: 1280, height: 800, label: 'desktop' },
    ];
    const measurements = [];
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await goToPage(page, 'Home');
      await page.waitForTimeout(250);
      const measured = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
      }));
      measurements.push({ ...viewport, ...measured });
      assert(measured.documentWidth <= measured.innerWidth + 1, `Horizontal overflow at ${viewport.label}`, measured);
      await screenshot(`responsive-${viewport.label}`, page);
    }
    await page.setViewportSize({ width: 412, height: 915 });
    return measurements;
  });

  await runCheck('PWA manifest, worker, icons, worklet, and all sound samples are reachable', 'assets', async () => {
    const relativeAssets = [
      'manifest.webmanifest', 'sw.js', 'registerSW.js',
      'icons/icon-192.png', 'icons/icon-512.png',
      'worklets/pcm-capture.js',
      'sounds/bell.wav', 'sounds/clave.wav', 'sounds/count-1.wav', 'sounds/count-2.wav',
      'sounds/count-3.wav', 'sounds/count-4.wav', 'sounds/cowbell.wav', 'sounds/hihat.wav',
      'sounds/kick.wav', 'sounds/marimba.wav', 'sounds/rimshot.wav', 'sounds/shaker.wav',
      'sounds/snare.wav', 'sounds/sticks.wav', 'sounds/tick.wav', 'sounds/woodblock.wav',
    ];
    const statuses = [];
    for (const asset of relativeAssets) {
      const url = new URL(asset, LOCAL_URL).href;
      const response = await page.request.get(url);
      const body = await response.body();
      statuses.push({ asset, status: response.status(), bytes: body.length });
      assert(response.ok(), `${asset} returned HTTP ${response.status()}`);
      assert(body.length > 0, `${asset} returned an empty body`);
    }
    return statuses;
  });

  await runCheck('BPM keypad accepts half-BPM values and persists them', 'metronome-controls', async () => {
    await setBpm(page, 123.5);
    const immediate = await readBpm(page);
    assert(immediate === 123.5, `Expected 123.5 BPM, got ${immediate}`);
    await page.waitForTimeout(900);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Home', exact: true }).waitFor({ timeout: 15_000 });
    const persisted = await readBpm(page);
    assert(persisted === 123.5, `BPM did not persist across reload: ${persisted}`);
    return { immediate, persisted };
  });

  await runCheck('BPM increment and decrement controls preserve fractional precision', 'metronome-controls', async () => {
    await setBpm(page, 123.5);
    const { minus, plus } = await bpmControlButtons(page);
    await plus.click();
    const raised = await readBpm(page);
    await minus.click();
    const restored = await readBpm(page);
    assert(raised === 124.5, `Expected + button to produce 124.5, got ${raised}`);
    assert(restored === 123.5, `Expected - button to restore 123.5, got ${restored}`);
    return { start: 123.5, raised, restored };
  });

  await runCheck('Tap tempo calculates approximately 120 BPM', 'metronome-controls', async () => {
    await setBpm(page, 90);
    const tap = page.getByRole('button', { name: /TAP/ });
    for (let i = 0; i < 4; i += 1) {
      await tap.click();
      if (i < 3) await page.waitForTimeout(500);
    }
    const measured = await readBpm(page);
    assert(measured >= 116 && measured <= 124, `Tap tempo expected about 120 BPM, got ${measured}`);
    return { measuredBpm: measured, taps: 4, nominalIntervalMs: 500 };
  });

  await runCheck('Metronome starts, runs, accepts live changes, and stops repeatedly', 'audio-playback', async () => {
    await goToPage(page, 'Home');
    let start = page.getByRole('button', { name: 'Start metronome' });
    await start.click();
    await page.getByRole('button', { name: 'Stop metronome' }).waitFor({ state: 'visible', timeout: 5_000 });
    await page.waitForTimeout(2200);
    await page.getByRole('button', { name: '8ths', exact: true }).click();
    await setBpm(page, 132.5);
    await page.getByRole('button', { name: 'Stop metronome' }).click();
    await page.getByRole('button', { name: 'Start metronome' }).waitFor({ state: 'visible', timeout: 5_000 });
    for (let i = 0; i < 3; i += 1) {
      await page.getByRole('button', { name: 'Start metronome' }).click();
      await page.waitForTimeout(350);
      await page.getByRole('button', { name: 'Stop metronome' }).click();
      await page.waitForTimeout(150);
    }
    return { liveBpm: await readBpm(page), subdivision: '8ths', restartCycles: 3 };
  });

  await runCheck('Meter, subdivision, pattern editing, and per-beat sound picker work', 'advanced-metronome', async () => {
    await goToPage(page, 'Home');
    const meterCard = await openCard(page, 'Meter & Subdivision');
    const nextMeter = meterCard.locator('button:has(svg polyline[points="9 18 15 12 9 6"])').first();
    await nextMeter.click();
    const meterButton = meterCard.getByRole('button', { name: '5/4', exact: true });
    await meterButton.waitFor({ state: 'visible', timeout: 3_000 });
    await meterButton.click();
    await meterCard.getByRole('button', { name: '5/8', exact: true }).waitFor({ state: 'visible', timeout: 3_000 });
    await meterCard.getByRole('button', { name: '16ths', exact: true }).click();

    const patternCard = await openCard(page, 'Pattern');
    const beatOne = patternCard.getByRole('button', { name: '1', exact: true }).first();
    const before = await beatOne.locator('div.absolute').first().getAttribute('style');
    await beatOne.click();
    const after = await beatOne.locator('div.absolute').first().getAttribute('style');
    assert(before !== after, 'Pattern cell visual state did not change after tap', { before, after });
    await longPress(page, beatOne, 720);
    await page.getByText('Beat 1 Sound', { exact: true }).waitFor({ state: 'visible', timeout: 5_000 });
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    return { meter: '5/8', subdivision: '16ths', patternStateChanged: true, soundPickerOpened: true };
  });

  await runCheck('Polyrhythm track add, mute, and remove operations work', 'advanced-metronome', async () => {
    const polyCard = await openCard(page, 'Polyrhythm');
    await polyCard.getByRole('button', { name: '+ Add Track', exact: true }).click();
    await polyCard.getByText('Track 2', { exact: true }).waitFor({ state: 'visible', timeout: 3_000 });
    const onButton = polyCard.getByRole('button', { name: 'ON', exact: true }).first();
    await onButton.click();
    await polyCard.getByRole('button', { name: 'MUTED', exact: true }).waitFor({ state: 'visible', timeout: 3_000 });
    const trackRow = polyCard.getByText('Track 2', { exact: true }).locator('xpath=ancestor::div[contains(@class,"bg-bg-surface")][1]');
    const actionButtons = trackRow.locator('button');
    await actionButtons.last().click();
    await page.waitForTimeout(200);
    assert((await polyCard.getByText('Track 2', { exact: true }).count()) === 0, 'Track 2 remained after remove');
    return { added: true, muted: true, removed: true };
  });

  await runCheck('Trainer and practice mode controls update state', 'advanced-metronome', async () => {
    const trainerCard = await openCard(page, 'Trainer');
    const trainerToggle = trainerCard.locator('button[role="switch"]').first();
    await trainerToggle.click();
    assert((await trainerToggle.getAttribute('aria-checked')) === 'true', 'Trainer toggle did not enable');
    await trainerCard.locator('input[type="number"]').nth(1).fill('160');

    const practiceCard = await openCard(page, 'Practice Modes');
    const toggles = practiceCard.locator('button[role="switch"]');
    const toggleCount = await toggles.count();
    assert(toggleCount >= 3, `Expected at least 3 practice toggles, got ${toggleCount}`);
    for (let i = 0; i < Math.min(3, toggleCount); i += 1) await toggles.nth(i).click();
    const enabled = [];
    for (let i = 0; i < Math.min(3, toggleCount); i += 1) enabled.push(await toggles.nth(i).getAttribute('aria-checked'));
    assert(enabled.every((value) => value === 'true'), `Practice toggles failed to enable: ${enabled.join(',')}`);
    // Restore neutral state before recording-oriented tests in other contexts.
    for (let i = 0; i < Math.min(3, toggleCount); i += 1) await toggles.nth(i).click();
    await trainerToggle.click();
    return { trainerEndBpm: 160, practiceToggleCount: toggleCount };
  });

  await runCheck('Project create, persistence, edit, switch, and delete workflow works', 'projects', async () => {
    await goToPage(page, 'Projects');
    await page.getByRole('button', { name: '+ New Project', exact: true }).click();
    await page.getByText('New Project', { exact: true }).waitFor({ state: 'visible', timeout: 3_000 });
    const nameInput = page.locator('input[placeholder*="Paradiddles"]').last();
    await nameInput.fill('Audit Project');
    const numeric = page.locator('input[type="number"]');
    await numeric.nth(0).fill('90');
    await numeric.nth(1).fill('150');
    await page.getByRole('button', { name: 'Create Project', exact: true }).click();
    await page.getByText('Audit Project', { exact: true }).waitFor({ state: 'visible', timeout: 5_000 });
    await page.waitForTimeout(900);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Home', exact: true }).waitFor({ timeout: 15_000 });
    await goToPage(page, 'Projects');
    await page.getByText('Audit Project', { exact: true }).waitFor({ state: 'visible', timeout: 5_000 });

    await projectCard(page, 'My First Project').click();
    await page.waitForTimeout(700);
    await longPress(page, projectCard(page, 'Audit Project'));
    await page.getByText('Edit Project', { exact: true }).waitFor({ state: 'visible', timeout: 5_000 });
    await page.locator('input[placeholder*="Paradiddles"]').last().fill('Audit Project Renamed');
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await page.getByText('Audit Project Renamed', { exact: true }).waitFor({ state: 'visible', timeout: 5_000 });

    await longPress(page, projectCard(page, 'Audit Project Renamed'));
    await page.getByRole('button', { name: 'Delete Project', exact: true }).click();
    await page.getByText(/Delete Audit Project Renamed\?/).waitFor({ state: 'visible', timeout: 5_000 });
    await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
    await page.waitForTimeout(500);
    assert((await page.getByText('Audit Project Renamed', { exact: true }).count()) === 0, 'Deleted project remains visible');
    return { created: true, persisted: true, renamed: true, deleted: true };
  });

  await runCheck('Settings opens by touch gesture and Data backup export/import completes', 'settings-and-data', async () => {
    await openSettings(page, context);
    const sectionNames = ['Sounds', 'Recording', 'Detection', 'Vibration', 'Interface', 'Calibration', 'Instruments', 'Data'];
    for (const name of sectionNames) {
      assert((await page.getByText(name, { exact: true }).count()) > 0, `Missing Settings section: ${name}`);
    }
    await openSettingsSection(page, 'Data');
    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Export Backup', exact: true }).click();
    const download = await downloadPromise;
    const backupPath = path.join(OUTPUT_DIR, 'downloads', 'poly-pro-audit-backup.polypro');
    await download.saveAs(backupPath);
    const backupStat = await stat(backupPath);
    assert(backupStat.size > 100, `Exported backup is unexpectedly small: ${backupStat.size} bytes`);
    report.artifacts.push(path.relative(OUTPUT_DIR, backupPath));

    await page.locator('input[type="file"][accept=".polypro"]').setInputFiles(backupPath);
    await page.getByText('Import Preview', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    await page.getByText(/Imported .* projects, .* sessions/).waitFor({ state: 'visible', timeout: 30_000 });
    await page.keyboard.press('Escape');
    await page.getByRole('heading', { name: 'Settings', exact: true }).waitFor({ state: 'hidden', timeout: 5_000 });
    return { sections: sectionNames, backupBytes: backupStat.size, importCompleted: true };
  });

  await runCheck('Service worker controls the app and offline reload succeeds', 'pwa-offline', async () => {
    await goToPage(page, 'Home');
    const registration = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return { supported: false, ready: false, controlled: false };
      const ready = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((resolve) => setTimeout(() => resolve(null), 15_000)),
      ]);
      return {
        supported: true,
        ready: !!ready,
        controlled: !!navigator.serviceWorker.controller,
        scope: ready?.scope || null,
      };
    });
    assert(registration.supported && registration.ready, 'Service worker did not become ready', registration);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Home', exact: true }).waitFor({ timeout: 15_000 });
    const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
    assert(controlled, 'Page was not controlled by the service worker after reload');
    await context.setOffline(true);
    try {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 20_000 });
      await page.getByRole('button', { name: 'Home', exact: true }).waitFor({ timeout: 15_000 });
    } finally {
      await context.setOffline(false);
    }
    return { ...registration, controlledAfterReload: controlled, offlineReload: true };
  });

  await runCheck('Automated WCAG audit completes and records all violations', 'accessibility', async () => {
    await goToPage(page, 'Home');
    await page.addScriptTag({ content: axe.source });
    const axeResult = await page.evaluate(async () => {
      const result = await globalThis.axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      });
      return {
        violations: result.violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          description: violation.description,
          help: violation.help,
          helpUrl: violation.helpUrl,
          nodes: violation.nodes.slice(0, 25).map((node) => ({
            target: node.target,
            html: node.html.slice(0, 600),
            failureSummary: node.failureSummary,
          })),
          totalNodes: violation.nodes.length,
        })),
        passes: result.passes.length,
        incomplete: result.incomplete.length,
      };
    });
    const unnamedControls = await page.locator('button, [role="button"], [role="switch"], input, canvas').evaluateAll((elements) => elements
      .filter((element) => {
        const aria = element.getAttribute('aria-label') || element.getAttribute('aria-labelledby') || '';
        const title = element.getAttribute('title') || '';
        const text = (element.textContent || '').trim();
        const value = 'value' in element ? String(element.value || '') : '';
        return !aria && !title && !text && !value;
      })
      .slice(0, 100)
      .map((element) => ({ tag: element.tagName, role: element.getAttribute('role'), html: element.outerHTML.slice(0, 500) })));
    report.accessibility = { ...axeResult, unnamedControls };
    return {
      violationCount: axeResult.violations.length,
      violationNodes: axeResult.violations.reduce((sum, v) => sum + v.totalNodes, 0),
      unnamedControlCount: unnamedControls.length,
    };
  }, { severity: 'warning' });

  await screenshot('local-core-final', page);
  await context.close();

  // Recording/analysis gets a fresh context so previous trainer/practice state
  // and project mutations cannot contaminate the result.
  const recordingContext = await browser.newContext({
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
    locale: 'en-US',
    acceptDownloads: true,
    serviceWorkers: 'allow',
    permissions: ['microphone'],
  });
  await recordingContext.grantPermissions(['microphone'], { origin: new URL(LOCAL_URL).origin });
  const recordingPage = await recordingContext.newPage();
  activePage = recordingPage;
  installPageObservers(recordingPage, 'local-recording');

  await runCheck('Fake-device microphone recording reaches analysis and review', 'recording-analysis', async () => {
    await waitForApp(recordingPage);
    await setBpm(recordingPage, 120);
    await recordingPage.getByRole('button', { name: 'RECORD', exact: true }).click();
    await recordingPage.getByRole('button', { name: 'STOP REC', exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
    await recordingPage.waitForTimeout(7_000);
    await recordingPage.getByRole('button', { name: 'STOP REC', exact: true }).click();
    await recordingPage.getByText('Session Complete', { exact: true }).waitFor({ state: 'visible', timeout: 90_000 });
    const reviewText = await recordingPage.locator('body').innerText();
    assert(/Hits/i.test(reviewText) && /Hit Rate/i.test(reviewText), 'Review screen is missing analysis metrics');
    const reviewButtons = (await recordingPage.locator('button:visible').allTextContents()).map((text) => text.trim()).filter(Boolean);
    await screenshot('recording-review', recordingPage);
    return { reviewReached: true, reviewButtons, bodyExcerpt: reviewText.slice(0, 1800) };
  });

  await runCheck('Reviewed recording can be committed and appears in Progress', 'recording-analysis', async () => {
    const visibleButtons = recordingPage.locator('button:visible');
    const texts = (await visibleButtons.allTextContents()).map((text) => text.trim());
    const preferredPatterns = [/^Save$/i, /Save Session/i, /Keep.*Continue/i, /Finish/i];
    let saveIndex = -1;
    for (const pattern of preferredPatterns) {
      saveIndex = texts.findIndex((text) => pattern.test(text));
      if (saveIndex >= 0) break;
    }
    assert(saveIndex >= 0, 'No recognizable save/commit button on review screen', { buttonTexts: texts });
    await visibleButtons.nth(saveIndex).click();
    await recordingPage.waitForTimeout(800);
    const postSaveButtons = (await recordingPage.locator('button:visible').allTextContents()).map((text) => text.trim()).filter(Boolean);
    const viewDetails = recordingPage.getByRole('button', { name: /View Details/i });
    const recordAgain = recordingPage.getByRole('button', { name: /Record Again/i });
    if (await viewDetails.count()) {
      await viewDetails.click();
      await recordingPage.waitForTimeout(500);
      await recordingPage.keyboard.press('Escape').catch(() => {});
    } else if (await recordAgain.count()) {
      await recordAgain.click();
    }
    await goToPage(recordingPage, 'Progress');
    const progressText = await recordingPage.locator('body').innerText();
    assert(/Sessions \(1\)/.test(progressText) || /1 sessions?/.test(progressText), 'Saved recording did not appear in Progress', { progressExcerpt: progressText.slice(0, 1600), postSaveButtons });
    await screenshot('recording-progress', recordingPage);
    return { saved: true, postSaveButtons, progressExcerpt: progressText.slice(0, 1200) };
  });

  await recordingContext.close();

  // Smoke-test the actual deployed site in a separate clean browser profile.
  const deployedContext = await browser.newContext({
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
    colorScheme: 'dark',
    locale: 'en-US',
    serviceWorkers: 'allow',
  });
  const deployedPage = await deployedContext.newPage();
  activePage = deployedPage;
  installPageObservers(deployedPage, 'deployed');

  await runCheck('Deployed GitHub Pages app boots and navigates in Chromium', 'deployed-browser-smoke', async () => {
    await waitForApp(deployedPage, DEPLOYED_URL);
    for (const target of ['Projects', 'Progress', 'Home']) await goToPage(deployedPage, target);
    const manifestResponse = await deployedPage.request.get(new URL('manifest.webmanifest', DEPLOYED_URL).href);
    assert(manifestResponse.ok(), `Deployed manifest returned ${manifestResponse.status()}`);
    const secure = await deployedPage.evaluate(() => window.isSecureContext);
    assert(secure, 'Deployed app is not a secure context');
    await screenshot('deployed-home', deployedPage);
    return { secureContext: secure, manifestStatus: manifestResponse.status(), url: deployedPage.url() };
  });

  await deployedContext.close();
} finally {
  await browser.close();
}

const failed = report.checks.filter((check) => check.status === 'failed').length;
const passed = report.checks.filter((check) => check.status === 'passed').length;
const warnings = report.checks.filter((check) => check.severity === 'warning').length;
report.summary = {
  total: report.checks.length,
  passed,
  failed,
  warnings,
  consoleErrors: report.browserEvents.filter((event) => event.type === 'console-error' || event.type === 'page-error').length,
  consoleWarnings: report.browserEvents.filter((event) => event.type === 'console-warning').length,
  networkFailures: report.network.length,
  accessibilityViolations: report.accessibility?.violations?.length ?? null,
};

const reportPath = path.join(OUTPUT_DIR, 'browser-audit-report.json');
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`\n[AUDIT SUMMARY] ${JSON.stringify(report.summary)}`);
console.log(`[AUDIT REPORT] ${reportPath}`);

if (failed > 0) process.exitCode = 1;
