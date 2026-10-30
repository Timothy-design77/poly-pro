import { expect, test } from '@playwright/test';

for (const capture of ['recording', 'training'] as const) {
  for (const operation of ['resume', 'addModule'] as const) {
    test(`${capture} recovers when ${operation} never settles`, async ({ page }) => {
      await page.addInitScript(({ operation }) => {
        const streams: MediaStream[] = [];
        (window as any).startupStreams = streams;
        const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async (constraints) => {
          const stream = await getUserMedia(constraints);
          streams.push(stream);
          return stream;
        };
        if (operation === 'resume') {
          Object.defineProperty(AudioContext.prototype, 'state', { configurable: true, get: () => 'suspended' });
          AudioContext.prototype.resume = () => new Promise(() => {});
        } else {
          const addModule = AudioWorklet.prototype.addModule;
          AudioWorklet.prototype.addModule = function (url, options) {
            return String(url).includes('pcm-capture') ? new Promise(() => {}) : addModule.call(this, url, options);
          };
        }
      }, { operation });
      await page.goto('./');
      if (capture === 'training') {
        await page.getByRole('button', { name: 'Settings', exact: true }).click();
        await page.getByRole('button', { name: 'Instruments', exact: true }).click();
        await page.getByRole('button', { name: 'Train Instruments', exact: true }).click();
        await page.getByRole('button', { name: /Snare Not trained/ }).click();
      }
      const start = page.getByRole('button', { name: capture === 'training' ? 'Train Snare' : 'Start recording', exact: true });
      await start.click();
      await expect(page.getByText(capture === 'training'
        ? 'Audio did not start in time. Tap Train to try again.'
        : 'Audio did not start in time. Tap Record to try again.', { exact: true })).toBeVisible({ timeout: 15000 });
      await expect(start).toBeEnabled();
      await expect.poll(() => page.evaluate(() => {
        const streams = (window as any).startupStreams as MediaStream[];
        return streams.length > 0 && streams.every((stream) => stream.getTracks().every((track) => track.readyState === 'ended'));
      })).toBe(true);
      await expect(page.getByRole('button', { name: 'Stop recording', exact: true })).toHaveCount(0);
    });
  }
}

test('cancelling training during pending audio startup releases the microphone promptly', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).pendingTrainingStreams = [];
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await getUserMedia(constraints);
      (window as any).pendingTrainingStreams.push(stream);
      return stream;
    };
    AudioContext.prototype.resume = () => { (window as any).trainingResumePending = true; return new Promise(() => {}); };
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Instruments', exact: true }).click();
  await page.getByRole('button', { name: 'Train Instruments', exact: true }).click();
  await page.getByRole('button', { name: /Snare Not trained/ }).click();
  await page.getByRole('button', { name: 'Train Snare', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).trainingResumePending === true)).toBe(true);
  await page.getByRole('button', { name: '← Back', exact: true }).click();
  await expect.poll(() => page.evaluate(() => {
    const streams = (window as any).pendingTrainingStreams as MediaStream[];
    return streams.length > 0 && streams.every((stream) => stream.getTracks().every((track) => track.readyState === 'ended'));
  }), { timeout: 1500 }).toBe(true);
});
