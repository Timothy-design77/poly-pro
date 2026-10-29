import { expect, test } from '@playwright/test';

test('a recording-engine load failure releases the microphone and allows a clear retry', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).captureTestTracks = [];
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext(); await context.resume();
      const source = context.createConstantSource(); source.offset.value = 0.25;
      const output = context.createMediaStreamDestination();
      source.connect(output); source.start();
      const stream = output.stream;
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => { stop(); void context.close(); };
      }
      (window as any).captureTestTracks.push(...stream.getTracks());
      return stream;
    };
    const addModule = AudioWorklet.prototype.addModule;
    let failed = false;
    AudioWorklet.prototype.addModule = function (url, options) {
      if (!failed && String(url).includes('pcm-capture.js')) {
        failed = true;
        return Promise.reject(new DOMException('Failed to load worklet module script', 'AbortError'));
      }
      return addModule.call(this, url, options);
    };
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('The recording engine could not load. Check your connection and try again.');
  await expect.poll(() => page.evaluate(() => {
    const tracks = (window as any).captureTestTracks as MediaStreamTrack[];
    return tracks.length > 0 && tracks.every((track) => track.readyState === 'ended');
  })).toBe(true);
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toBeVisible();
  await expect(page.getByRole('meter', { name: 'Microphone level' })).toHaveAttribute('aria-valuenow', '25');
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Review take', exact: true })).toBeVisible();
});

test('microphone disconnection stops capture and saves the partial take', async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints); (window as any).lastMic = stream; return stream;
    };
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
  await page.waitForTimeout(1300);
  await page.evaluate(() => (window as any).lastMic.getAudioTracks()[0].dispatchEvent(new Event('ended')));
  await expect(page.getByRole('alert')).toContainText('microphone was disconnected');
  await expect(page.getByRole('button', { name: 'Start recording' })).toBeEnabled();
  await page.getByRole('button', { name: 'Recordings', exact: true }).click();
  await expect(page.getByText('Needs analysis', { exact: true })).toBeVisible();
});

test('storage failure stops recording and recovers previously saved chunks', async ({ page }) => {
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    let chunks = 0;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof original>) {
      if (this.name === 'recordingChunks' && ++chunks > 1) throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
      return original.apply(this, args);
    };
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Storage could not keep up', { timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Start recording' })).toBeEnabled();
  await page.getByRole('button', { name: 'Recordings', exact: true }).click();
  await expect(page.getByText('Needs analysis', { exact: true })).toBeVisible();
});

test('denied microphone permission leaves the metronome usable', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); };
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Microphone access denied');
  await page.getByRole('button', { name: /Start metronome/ }).click();
  await expect(page.getByRole('button', { name: /Stop metronome/ })).toBeVisible();
});

test('cancelling calibration during microphone setup releases late-arriving streams', async ({ page }) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    (window as any).mics = [];
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints); (window as any).mics.push(stream);
      await new Promise((resolve) => setTimeout(resolve, 800)); return stream;
    };
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Calibration', exact: true }).click();
  await page.getByRole('button', { name: 'Run Calibration', exact: true }).click();
  await page.getByRole('button', { name: 'Calibrate', exact: true }).click();
  await page.getByRole('dialog', { name: 'Audio calibration' }).getByRole('button', { name: /Back|Cancel/ }).first().click();
  await expect.poll(() => page.evaluate(() => (window as any).mics.length)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => (window as any).mics.flatMap((stream: MediaStream) => stream.getTracks()).every((track: MediaStreamTrack) => track.readyState === 'ended'))).toBe(true);
});
