import { expect, test, type Page } from '@playwright/test';

async function savedCaptureCounts(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('polypro');
      request.onsuccess = () => resolve(request.result);
    });
    const counts = await Promise.all(['sessions', 'recordingManifests', 'recordingChunks'].map((store) => new Promise<number>((resolve) => {
      const request = database.transaction(store).objectStore(store).count();
      request.onsuccess = () => resolve(request.result);
    })));
    database.close();
    return counts;
  });
}

test('preparation delay saves no audio and cancellation releases the microphone', async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    (window as any).captureMics = [];
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      (window as any).captureMics.push(stream);
      return stream;
    };
  });
  await page.goto('./');
  await page.getByText('Recording setup', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Preparation delay' }).selectOption('3');
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('No audio is saved until the countdown ends');
  expect(await savedCaptureCounts(page)).toEqual([0, 0, 0]);
  await page.getByRole('button', { name: 'Cancel recording setup' }).click();
  await expect(page.getByRole('button', { name: 'Start recording', exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => (window as any).captureMics.flatMap((stream: MediaStream) => stream.getTracks()).every((track: MediaStreamTrack) => track.readyState === 'ended'))).toBe(true);
  await page.waitForTimeout(3300);
  expect(await savedCaptureCounts(page)).toEqual([0, 0, 0]);
  await page.reload();
  await page.getByText('Recording setup', { exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Preparation delay' })).toHaveValue('3');
});

test('a delayed silent take stops itself at the exact duration and opens saved review', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Record without click' }).click();
  await page.getByText('Recording setup', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Preparation delay' }).selectOption('3');
  await page.getByRole('combobox', { name: 'Take length' }).selectOption('15');
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('No audio is saved until the countdown ends');
  await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /TAP TEMPO/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /Open tempo keypad/ })).toHaveCount(0);
  await expect(page.getByText('Stop recording to change tempo or setup.')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Review take' })).toBeVisible({ timeout: 25000 });
  const saved = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('polypro'); request.onsuccess = () => resolve(request.result);
    });
    const sessions = await new Promise<any[]>((resolve) => {
      const request = database.transaction('sessions').objectStore('sessions').getAll(); request.onsuccess = () => resolve(request.result);
    });
    database.close();
    return sessions;
  });
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ durationMs: 15000, hasRecording: true, analyzed: true });
  expect(saved[0].recordingTiming.scheduledBeats.length).toBeGreaterThan(20);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Record without click' })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await page.getByText('Recording setup', { exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Take length' })).toHaveValue('15');
});

test('leaving during countdown cancels it before any audio is saved', async ({ page }) => {
  await page.goto('./');
  await page.getByText('Recording setup', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Preparation delay' }).selectOption('3');
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('No audio is saved until the countdown ends');
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await page.waitForTimeout(3300);
  expect(await savedCaptureCounts(page)).toEqual([0, 0, 0]);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start recording', exact: true })).toBeEnabled();
});

test('cancelling pending microphone permission discards late probe streams without requesting another mic', async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const enumerate = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
    (window as any).captureMics = [];
    navigator.mediaDevices.enumerateDevices = async () => (window as any).captureMics.length ? enumerate() : [];
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      (window as any).captureMics.push(stream);
      await new Promise((resolve) => setTimeout(resolve, 800));
      return stream;
    };
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).captureMics.length)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Cancel recording setup' }).click();
  await page.waitForTimeout(1000);
  await expect.poll(() => page.evaluate(() => (window as any).captureMics.flatMap((stream: MediaStream) => stream.getTracks()).every((track: MediaStreamTrack) => track.readyState === 'ended'))).toBe(true);
  expect(await page.evaluate(() => (window as any).captureMics.length)).toBe(1);
  await expect(page.getByRole('button', { name: 'Start recording', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await savedCaptureCounts(page)).toEqual([0, 0, 0]);
});

test('recording with Trainer saves the same starting tempo as the captured beat grid', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: /Trainer Off/ }).click();
  await page.getByRole('switch', { name: 'Enable Trainer' }).click();
  await page.getByRole('spinbutton', { name: 'Trainer start BPM' }).fill('80');
  await page.getByRole('spinbutton', { name: 'Trainer start BPM' }).blur();
  await expect(page.getByRole('spinbutton', { name: 'Trainer start BPM' })).toHaveValue('80');
  await page.getByRole('button', { name: 'Record without click' }).click();
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible();
  await page.waitForTimeout(2200);
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Review take' })).toBeVisible();
  const session = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('polypro'); request.onsuccess = () => resolve(request.result);
    });
    const session = await new Promise<any>((resolve) => {
      const request = database.transaction('sessions').objectStore('sessions').getAll(); request.onsuccess = () => resolve(request.result[0]);
    });
    database.close();
    return session;
  });
  expect(session.bpm).toBe(80);
  const beats = session.recordingTiming.scheduledBeats;
  expect(beats.length).toBeGreaterThan(2);
  expect(beats[1].time - beats[0].time).toBeCloseTo(60 / session.bpm, 4);
});
