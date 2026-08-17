import { expect, test, type Page } from '@playwright/test';
import axe from 'axe-core';

async function boot(page: Page) {
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Home', exact: true })).toBeVisible();
  await expect(page.locator('button[aria-current="page"]')).toHaveText('Home');
  await expect(dial(page)).toBeVisible();
  await expect(dial(page)).toHaveAttribute('aria-label', /BPM/);
}

async function navigate(page: Page, name: 'Projects' | 'Home' | 'Progress') {
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.locator('button[aria-current="page"]')).toHaveText(name);
}

function dial(page: Page) {
  return page.locator('canvas[role="button"]').first();
}

async function readDialBpm(page: Page): Promise<number> {
  const label = await dial(page).getAttribute('aria-label');
  const match = label?.match(/^([0-9.]+) BPM/);
  if (!match) throw new Error(`Could not parse dial label: ${label ?? 'missing'}`);
  return Number(match[1]);
}

async function openBpmDialog(page: Page) {
  await navigate(page, 'Home');
  await dial(page).click();
  const dialog = page.getByRole('dialog', { name: 'BPM' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function setBpm(page: Page, value: number) {
  const dialog = await openBpmDialog(page);
  const backspace = dialog.getByRole('button', { name: 'Backspace' });
  for (let index = 0; index < 8; index += 1) await backspace.click();
  for (const character of String(value)) {
    const name = character === '.' ? 'Decimal point' : character;
    await dialog.getByRole('button', { name, exact: true }).click();
  }
  await dialog.getByRole('button', { name: 'Set', exact: true }).click();
  await expect.poll(() => readDialBpm(page)).toBe(value);
}

async function openSettings(page: Page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function runSeriousAxe(page: Page, label: string) {
  await page.addScriptTag({ content: axe.source });
  const result = await page.evaluate(async () => {
    const engine = (window as typeof window & { axe: typeof axe }).axe;
    return engine.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
      },
    });
  });
  const failures = result.violations
    .filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        failureSummary: node.failureSummary,
      })),
    }));
  expect(failures, `${label} accessibility failures`).toEqual([]);
}

async function patchWorkletToHang(page: Page) {
  await page.evaluate(async () => {
    const context = new AudioContext();
    const worklet = context.audioWorklet;
    const prototype = Object.getPrototypeOf(worklet) as { addModule: (url: string) => Promise<void> };
    prototype.addModule = () => new Promise<void>(() => undefined);
    await context.close();
  });
}

async function installSyntheticWorklet(page: Page) {
  await page.evaluate(async () => {
    const context = new AudioContext();
    const workletPrototype = Object.getPrototypeOf(context.audioWorklet) as {
      addModule: (url: string) => Promise<void>;
    };
    workletPrototype.addModule = async () => undefined;
    await context.close();

    class SyntheticPort {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onmessageerror: ((event: MessageEvent) => void) | null = null;
      private timer: number | null = null;
      private chunkIndex = 0;

      postMessage(message: { type?: string }) {
        if (message.type === 'stop') {
          if (this.timer !== null) window.clearInterval(this.timer);
          this.timer = null;
          return;
        }
        if (message.type !== 'start' || this.timer !== null) return;

        this.timer = window.setInterval(() => {
          const samples = new Float32Array(12_000);
          if (this.chunkIndex % 2 === 0) {
            for (let index = 0; index < 1_600; index += 1) {
              const envelope = Math.exp(-index / 350);
              samples[150 + index] = envelope * (
                Math.sin((2 * Math.PI * 180 * index) / 48_000) * 0.65
                + Math.sin((2 * Math.PI * 780 * index) / 48_000) * 0.2
              );
            }
          }
          this.onmessage?.(new MessageEvent('message', {
            data: { type: 'pcm', samples },
          }));
          this.onmessage?.(new MessageEvent('message', {
            data: { type: 'level', peak: 0.65 },
          }));
          if (this.chunkIndex % 2 === 0) {
            this.onmessage?.(new MessageEvent('message', {
              data: { type: 'onset', time: performance.now() / 1000, peak: 0.65 },
            }));
          }
          this.chunkIndex += 1;
        }, 250);
      }
    }

    function SyntheticAudioWorkletNode(this: unknown, audioContext: AudioContext) {
      const node = audioContext.createGain() as GainNode & { port: SyntheticPort };
      Object.defineProperty(node, 'port', {
        value: new SyntheticPort(),
        configurable: true,
      });
      return node;
    }

    Object.defineProperty(window, 'AudioWorkletNode', {
      configurable: true,
      writable: true,
      value: SyntheticAudioWorkletNode,
    });
  });
}

test('production PWA boots, navigates explicitly, and has no viewport overflow', async ({ page }) => {
  await boot(page);

  for (const name of ['Projects', 'Progress', 'Home'] as const) {
    await navigate(page, name);
  }

  for (const viewport of [
    { width: 360, height: 800 },
    { width: 412, height: 915 },
    { width: 884, height: 760 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await navigate(page, 'Home');
    const dimensions = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.innerWidth + 1);
  }
});

test('Tap Tempo remains unchanged when the BPM keypad opens and cancels', async ({ page }) => {
  await boot(page);
  await setBpm(page, 90);

  const tap = page.getByRole('button', { name: /Tap tempo/i });
  const tapTimes: number[] = [];
  for (let index = 0; index < 5; index += 1) {
    await tap.click();
    tapTimes.push(Date.now());
    if (index < 4) await page.waitForTimeout(600);
  }

  const intervals = tapTimes.slice(1).map((time, index) => time - tapTimes[index]);
  const averageInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
  const expectedBpm = Math.round((60_000 / averageInterval) * 2) / 2;

  await expect.poll(() => readDialBpm(page)).not.toBe(90);
  const tappedBpm = await readDialBpm(page);
  expect(Math.abs(tappedBpm - expectedBpm)).toBeLessThanOrEqual(1.5);

  const dialog = await openBpmDialog(page);
  const displayed = Number((await dialog.locator('.font-mono.text-4xl').innerText()).trim());
  expect(displayed).toBe(tappedBpm);
  expect(await readDialBpm(page)).toBe(tappedBpm);

  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect.poll(() => readDialBpm(page)).toBe(tappedBpm);
});

test('recording preparation times out safely and cleans up stalled AudioWorklet startup', async ({ page }) => {
  await boot(page);
  await patchWorkletToHang(page);

  await page.getByRole('button', { name: 'Start recording' }).click();
  await expect(page.getByRole('button', { name: 'Cancel recording setup' })).toBeVisible();
  await expect(page.getByText(/could not initialize raw audio capture/i)).toBeVisible({
    timeout: 35_000,
  });

  await expect(page.getByRole('button', { name: 'Start recording' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start metronome' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop metronome' })).toHaveCount(0);
});

test('recording orchestration streams PCM, analyzes in a worker, saves, and opens details', async ({ page }) => {
  await boot(page);
  await installSyntheticWorklet(page);
  await setBpm(page, 120);

  await page.getByRole('button', { name: 'Start recording' }).click();
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(5_000);
  await page.getByRole('button', { name: 'Stop recording' }).click();

  await expect(page.getByText('Session Complete', { exact: true })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('Hit Rate', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save Session', exact: true }).click();
  await expect(page.getByText('Session Saved', { exact: true })).toBeVisible({ timeout: 60_000 });

  await page.getByRole('button', { name: 'View Details', exact: true }).click();
  for (const tab of ['Score', 'Timeline', 'Charts', 'Tune']) {
    await page.getByRole('button', { name: tab, exact: true }).first().click();
  }
  await page.getByRole('button', { name: '← Back', exact: true }).click();

  await navigate(page, 'Progress');
  await expect(page.getByText(/Sessions \(1\)|1 sessions?/i)).toBeVisible();
});

test('backup export and import round-trip through the Settings dialog', async ({ page }, testInfo) => {
  await boot(page);
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Data', exact: true }).click();

  const downloadPromise = page.waitForEvent('download');
  await settings.getByRole('button', { name: 'Export Backup', exact: true }).click();
  const download = await downloadPromise;
  const backupPath = testInfo.outputPath('roundtrip.polypro');
  await download.saveAs(backupPath);

  await settings.locator('input[type="file"][accept=".polypro"]').setInputFiles(backupPath);
  await expect(settings.getByText('Import Preview', { exact: true })).toBeVisible();
  await settings.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(settings.getByText(/Imported .* projects, .* sessions/)).toBeVisible({ timeout: 30_000 });
});

test('service worker controls the PWA and supports an offline reload', async ({ page, context }) => {
  await boot(page);
  const ready = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    await navigator.serviceWorker.ready;
    return true;
  });
  expect(ready).toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Home', exact: true })).toBeVisible();
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: 'Home', exact: true })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test('custom precision controls support keyboard operation', async ({ page }) => {
  await boot(page);
  const settings = await openSettings(page);
  await settings.getByRole('button', { name: 'Calibration', exact: true }).click();
  const slider = settings.getByRole('slider', { name: 'Fine-tune latency adjustment' });
  await expect(slider).toBeVisible();
  const initial = Number(await slider.getAttribute('aria-valuenow'));
  await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', String(initial + 0.5));
  await slider.press('Home');
  await expect(slider).toHaveAttribute('aria-valuenow', '-150');
  await slider.press('End');
  await expect(slider).toHaveAttribute('aria-valuenow', '150');
});

test('critical and serious WCAG violations are absent from primary surfaces', async ({ page }) => {
  await boot(page);
  await runSeriousAxe(page, 'Home');

  await navigate(page, 'Projects');
  await runSeriousAxe(page, 'Projects');

  await navigate(page, 'Progress');
  await runSeriousAxe(page, 'Progress');

  const settings = await openSettings(page);
  const sectionNames = [
    'Sounds',
    'Recording',
    'Detection',
    'Vibration',
    'Interface',
    'Calibration',
    'Instruments',
    'Data',
    'Cloud Enhancement',
  ];
  for (const name of sectionNames) {
    const button = settings.getByRole('button', { name, exact: true });
    if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
  }
  await runSeriousAxe(page, 'Settings');

  const unnamed = await page.locator('button, [role="button"], [role="switch"], [role="slider"], input, canvas').evaluateAll(
    (elements) => elements.filter((element) => {
      const aria = element.getAttribute('aria-label') || element.getAttribute('aria-labelledby');
      const title = element.getAttribute('title');
      const text = (element.textContent || '').trim();
      const value = element instanceof HTMLInputElement ? element.value : '';
      return !aria && !title && !text && !value;
    }).map((element) => element.outerHTML.slice(0, 300)),
  );
  expect(unnamed).toEqual([]);
});
