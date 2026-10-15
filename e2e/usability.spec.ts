import { expect, test } from '@playwright/test';
import { seedSession } from './helpers';

test('practice surfaces fit phone widths and expose usable focus navigation', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Start recording' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('home.png') });
  await seedSession(page);
  await page.getByRole('tab', { name: 'Review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start playback', exact: true })).toBeEnabled();
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('playback.png') });
  await page.getByRole('button', { name: 'Tune scoring', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Latency Offset' })).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('tune.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Calibration', exact: true }).click();
  await page.getByRole('button', { name: 'Run Calibration', exact: true }).click();
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('calibration.png') });
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]'))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('custom click recording is bounded, saves and can be selected', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Sample name' })).toBeVisible({ timeout: 12000 });
  await page.getByRole('textbox', { name: 'Sample name' }).fill('Practice click');
  await page.getByRole('button', { name: /^Save \(/ }).click();
  await expect(page.getByRole('textbox', { name: 'Sample name' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Woodblock', exact: true }).first().click();
  await page.getByRole('button', { name: /Practice click.*ms/ }).click();
  await expect(page.getByRole('button', { name: 'Practice click', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Practice click', exact: true })).toBeVisible();
});

test('instrument training starts and cancelling releases the microphone', async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    (window as any).trainingMics = [];
    navigator.mediaDevices.getUserMedia = async (constraints) => { const stream = await original(constraints); (window as any).trainingMics.push(stream); return stream; };
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Instruments', exact: true }).click();
  await page.getByRole('button', { name: 'Train Instruments', exact: true }).click();
  await page.getByRole('button', { name: /Snare Not trained/ }).click();
  await page.getByRole('button', { name: 'Train Snare', exact: true }).click();
  await expect(page.getByText('Listening… auto-stops at 60 seconds. Count is approximate.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).trainingMics.every((stream: MediaStream) => stream.getTracks().every((track) => track.readyState === 'ended')))).toBe(true);
});


test('detection bench advances patterns and safely closes during countdown', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Detection', exact: true }).click();
  await page.getByRole('button', { name: 'Run Detection Test', exact: true }).click();
  await page.getByRole('button', { name: 'Start (3s)', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Next Test', exact: true })).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Next Test', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Flam', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start (3s)', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Next Test', exact: true })).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Next Test', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Double Stroke', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start (3s)', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.waitForTimeout(2500);
  expect(errors).toEqual([]);
});

test('instrument training saves detected features and survives reload', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext({ sampleRate: 48000 }); await context.resume();
      const output = context.createMediaStreamDestination();
      const pcm = context.createBuffer(1, 48000 * 8, 48000);
      const channel = pcm.getChannelData(0);
      for (let hit = 0; hit < 25; hit++) {
        const start = Math.floor((0.7 + hit * 0.25) * 48000);
        for (let i = 0; i < 960; i++) channel[start + i] = 0.9 * Math.sin(2 * Math.PI * 1500 * i / 48000) * Math.exp(-i / 192);
      }
      const source = context.createBufferSource(); source.buffer = pcm; source.connect(output); source.start();
      output.stream.getTracks().forEach((track) => {
        const stop = track.stop.bind(track);
        track.stop = () => { stop(); if (context.state !== 'closed') void context.close().catch(() => {}); };
      });
      return output.stream;
    };
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Instruments', exact: true }).click();
  await page.getByRole('button', { name: 'Train Instruments', exact: true }).click();
  await page.getByRole('button', { name: /Snare Not trained/ }).click();
  await page.getByRole('button', { name: 'Train Snare', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Done ✓', exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Done ✓', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Snare Trained', exact: true })).toBeVisible();
  await expect(page.getByText('Needs a second instrument', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.reload();
  expect(await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('polypro'); req.onsuccess = () => resolve(req.result); });
    return new Promise<number>((resolve) => { const req = db.transaction('instrumentProfiles').objectStore('instrumentProfiles').get('Snare'); req.onsuccess = () => { db.close(); resolve(req.result.samples.length); }; });
  })).toBeGreaterThanOrEqual(20);
  expect(errors).toEqual([]);
});
