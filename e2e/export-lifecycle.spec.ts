import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { seedSession } from './helpers';

test('raw WAV export preserves PCM samples without a full offline render', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).offlineRenders = 0;
    const render = OfflineAudioContext.prototype.startRendering;
    OfflineAudioContext.prototype.startRendering = function () { (window as any).offlineRenders++; return render.call(this); };
  });
  await seedSession(page);
  await page.getByRole('button', { name: 'Export audio' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Raw recording', exact: true }).click();
  const wav = await readFile((await (await downloadPromise).path())!);
  expect(wav.subarray(0, 4).toString()).toBe('RIFF');
  expect(wav.subarray(8, 12).toString()).toBe('WAVE');
  expect(wav.readUInt16LE(22)).toBe(1);
  expect(wav.readUInt32LE(24)).toBe(48000);
  expect(wav.readUInt16LE(34)).toBe(16);
  expect(wav.readUInt32LE(40)).toBe(480000 * 2);
  expect(wav.length).toBe(44 + 480000 * 2);
  for (const i of [1, 42, 131071, 131072, 479999]) {
    const sample = Math.fround(0.05 * Math.sin(i / 48000 * 440 * Math.PI * 2));
    expect(wav.readInt16LE(44 + i * 2)).toBe(Math.trunc(sample * (sample < 0 ? 32768 : 32767)));
  }
  expect(await page.evaluate(() => (window as any).offlineRenders)).toBe(0);
});

test('bounded click export preserves tails and global normalization across segment boundaries', async ({ page }) => {
  await page.addInitScript(() => {
    const start = AudioBufferSourceNode.prototype.start;
    const render = OfflineAudioContext.prototype.startRendering;
    (window as any).renderDurations = [];
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
      if (this.context instanceof OfflineAudioContext && this.buffer) {
        if (this.buffer.duration > 1) (window as any).recordingBuffer = this.buffer;
        else (window as any).exportClickBuffer = this.buffer;
      }
      return start.apply(this, args);
    };
    OfflineAudioContext.prototype.startRendering = function () {
      (window as any).renderDurations.push(this.length / this.sampleRate);
      return render.call(this);
    };
    const createURL = URL.createObjectURL;
    URL.createObjectURL = function (blob) { if (blob instanceof Blob && blob.type === 'audio/wav') (window as any).exportedWav = blob; return createURL.call(this, blob); };
  });
  await seedSession(page);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => { const req = indexedDB.open('polypro'); req.onsuccess = () => resolve(req.result); });
    const tx = db.transaction(['sessions', 'recordings'], 'readwrite');
    const request = tx.objectStore('sessions').get('practice-take');
    request.onsuccess = () => tx.objectStore('sessions').put({ ...request.result, durationMs: 21000, analysisConfig: { latencyOffsetMs: 0 } });
    const pcm = new Float32Array(21 * 48000);
    // Force normalization, with a different peak near the end of the take.
    for (let i = 0; i < pcm.length; i++) pcm[i] = (i > 20 * 48000 ? 1.2 : 0.2) * Math.sin(i / 48000 * 440 * Math.PI * 2);
    tx.objectStore('recordings').put(new Blob([pcm.buffer]), 'practice-take');
    const eventsRequest = tx.objectStore('recordings').get('hitevents:practice-take');
    eventsRequest.onsuccess = () => {
      const events = JSON.parse(eventsRequest.result);
      events.gridBeats = [9.99, 19.99].map((time) => ({ time, beatIndex: 0, measure: 0, isMainBeat: true, isDownbeat: true, trackId: 'track-0' }));
      tx.objectStore('recordings').put(JSON.stringify(events), 'hitevents:practice-take');
    };
    await new Promise<void>((resolve) => { tx.oncomplete = () => resolve(); }); db.close();
  });
  await page.reload();
  await page.getByRole('button', { name: 'Recordings', exact: true }).click();
  await page.getByRole('button', { name: /Review take.*120 BPM/ }).click();
  await page.getByRole('button', { name: 'Export audio' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'With click', exact: true }).click();
  await download;
  const durations: number[] = await page.evaluate(() => (window as any).renderDurations);
  expect(durations).toHaveLength(6);
  expect(Math.max(...durations)).toBeLessThanOrEqual(10);
  const comparison = await page.evaluate(async () => {
    const sourceBuffer: AudioBuffer = (window as any).recordingBuffer;
    const clickBuffer: AudioBuffer = (window as any).exportClickBuffer;
    const reference = new OfflineAudioContext(1, sourceBuffer.length, sourceBuffer.sampleRate);
    const source = reference.createBufferSource(); source.buffer = sourceBuffer; source.connect(reference.destination); source.start();
    for (const time of [9.99, 19.99]) {
      const click = reference.createBufferSource(); click.buffer = clickBuffer;
      const gain = reference.createGain(); gain.gain.value = 0.5;
      click.connect(gain); gain.connect(reference.destination); click.start(time);
    }
    const expected = (await reference.startRendering()).getChannelData(0);
    let peak = 0; for (const value of expected) peak = Math.max(peak, Math.abs(value));
    const scale = peak > 0.98 ? 0.98 / peak : 1;
    const actual = new DataView(await ((window as any).exportedWav as Blob).arrayBuffer());
    let maxDifference = 0;
    for (let i = 0; i < expected.length; i++) {
      const sample = expected[i] * scale;
      const encoded = Math.trunc(Math.max(-32768, Math.min(32767, sample * (sample < 0 ? 32768 : 32767))));
      maxDifference = Math.max(maxDifference, Math.abs(encoded - actual.getInt16(44 + i * 2, true)));
    }
    return { maxDifference, peak };
  });
  expect(comparison.peak).toBeGreaterThan(0.98);
  expect(comparison.maxDifference).toBeLessThanOrEqual(1);
});

test('closing during export cancels late downloads, deduplicates starts, and releases activity', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  let downloads = 0; page.on('download', () => downloads++);
  await page.addInitScript(() => {
    const render = OfflineAudioContext.prototype.startRendering;
    (window as any).renderCalls = 0;
    OfflineAudioContext.prototype.startRendering = function () {
      (window as any).renderCalls++;
      const result = render.call(this);
      return new Promise<AudioBuffer>((resolve, reject) => {
        (window as any).releaseExport = async () => { try { resolve(await result); } catch (error) { reject(error); } };
      });
    };
  });
  await seedSession(page);
  await page.getByRole('button', { name: 'Export audio' }).click();
  await page.getByRole('button', { name: 'With click', exact: true }).evaluate((button) => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => (window as any).renderCalls)).toBe(1);
  // The UI must stay responsive while a render is outstanding.
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => (window as any).releaseExport());
  await page.getByRole('button', { name: /Review take.*120 BPM/ }).click();
  await page.getByRole('button', { name: 'Start playback', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause playback', exact: true })).toBeVisible();
  expect(downloads).toBe(0);
  expect(errors).toEqual([]);
});

test('failed and cancelled exports can be retried without a late download', async ({ page }) => {
  let downloads = 0; page.on('download', () => downloads++);
  await page.addInitScript(() => {
    const render = OfflineAudioContext.prototype.startRendering;
    let attempts = 0;
    OfflineAudioContext.prototype.startRendering = function () {
      if (++attempts === 1) return Promise.reject(new Error('Export temporarily unavailable'));
      const result = render.call(this);
      return new Promise<AudioBuffer>((resolve, reject) => {
        (window as any).releaseCancelledExport = async () => { try { resolve(await result); } catch (error) { reject(error); } };
      });
    };
  });
  await seedSession(page);
  await page.getByRole('button', { name: 'Export audio' }).click();
  await page.getByRole('button', { name: 'With click', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Export temporarily unavailable');
  await page.getByRole('button', { name: 'With click', exact: true }).click();
  await expect(page.getByRole('progressbar', { name: 'Audio export progress' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel export', exact: true }).click();
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Raw recording', exact: true }).click();
  await page.evaluate(() => (window as any).releaseCancelledExport());
  expect((await download).suggestedFilename()).toMatch(/raw\.wav$/);
  expect(downloads).toBe(1);
  await expect(page.getByRole('button', { name: 'Raw recording', exact: true })).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
