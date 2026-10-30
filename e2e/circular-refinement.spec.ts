import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('tempo keypad replaces the previous value, preserves decimals and cancels without changing tempo', async ({ page }) => {
  await page.goto('./');
  const tempo = page.getByRole('button', { name: /^Tempo .* Open tempo keypad/ });
  await tempo.click();
  const keypad = page.getByRole('dialog', { name: 'BPM', exact: true });
  for (const key of ['3', '9', '9', 'Decimal point', '5']) await keypad.getByRole('button', { name: key, exact: true }).click();
  await expect(keypad.getByText('399.5', { exact: true })).toBeVisible();
  await keypad.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(tempo).toHaveAccessibleName('Tempo 120 BPM. Open tempo keypad.');
  await expect(tempo).toBeFocused();
  await tempo.click();
  await expect(keypad).toBeFocused();
  await page.keyboard.type('90.5');
  await expect(keypad.getByText('90.5', { exact: true })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(tempo).toHaveAccessibleName('Tempo 90.5 BPM. Open tempo keypad.');
  await page.reload();
  await expect(tempo).toHaveAccessibleName('Tempo 90.5 BPM. Open tempo keypad.');
});

test('tempo and transport remain reachable through folding, with readable dial text and rhythm state', async ({ page }, testInfo) => {
  await page.goto('./');
  await page.getByRole('button', { name: /^Meter & subdivision/ }).click();
  await page.getByRole('button', { name: 'Next beats per measure' }).click();
  await page.getByRole('button', { name: 'Triplets', exact: true }).click();
  await page.getByRole('button', { name: /^Meter & subdivision/ }).click();
  await page.getByRole('button', { name: 'Start metronome', exact: true }).click();
  await expect(page.locator('.dial-meter')).toHaveText('5/4 · Triplets');
  for (const width of [320, 412, 884]) {
    await page.setViewportSize({ width, height: 915 });
    const navTop = (await page.getByRole('navigation').boundingBox())!.y;
    for (const name of ['Decrease tempo', 'Increase tempo', 'Tap tempo', 'Stop metronome', 'Start recording']) {
      const bounds = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.y).toBeGreaterThanOrEqual(0);
      expect(bounds.y + bounds.height).toBeLessThan(navTop);
    }
    await expect(page.locator('[data-rhythm-track="track-0"] [data-active="true"]')).toHaveCount(1);
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`playing-${width}.png`), animations: 'disabled' });
  }
  await page.getByRole('button', { name: 'Stop metronome', exact: true }).click();
  await expect(page.locator('[data-active="true"]')).toHaveCount(0);
});

test('empty library leads to Practice and cancelled pointer gestures do not swallow keyboard transport', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Recordings', exact: true }).click();
  await page.getByRole('button', { name: 'Go to Practice', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Practice', exact: true })).toHaveAttribute('aria-current', 'page');
  const start = page.getByRole('button', { name: 'Start metronome', exact: true });
  await start.dispatchEvent('pointerdown', { isPrimary: true, button: 2, pointerId: 1 });
  await expect(start).toBeVisible();
  await start.dispatchEvent('pointerdown', { isPrimary: true, button: 0, pointerId: 1 });
  const stop = page.getByRole('button', { name: 'Stop metronome', exact: true });
  await expect(stop).toBeVisible();
  await stop.dispatchEvent('pointercancel', { isPrimary: true, pointerId: 1 });
  await stop.press('Space');
  await expect(start).toBeVisible();
});

test('recording input meter follows captured audio, including silence and clipping', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext(); await context.resume();
      const source = context.createConstantSource(); source.offset.value = 1;
      const gain = context.createGain(); gain.gain.value = 0.25;
      const output = context.createMediaStreamDestination();
      source.connect(gain).connect(output); source.start();
      (window as any).captureLevel = gain;
      for (const track of output.stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => { stop(); void context.close(); };
      }
      return output.stream;
    };
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  const meter = page.getByRole('meter', { name: 'Microphone level' });
  await expect(meter).toHaveAttribute('aria-valuenow', '25');
  await page.screenshot({ path: testInfo.outputPath('recording.png'), animations: 'disabled' });
  await page.evaluate(() => { (window as any).captureLevel.gain.value = 0; });
  await expect(meter).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByText('Quiet', { exact: true })).toBeVisible();
  await page.evaluate(() => { (window as any).captureLevel.gain.value = 1; });
  await expect(meter).toHaveAttribute('aria-valuetext', 'Clipping');
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Review take', exact: true })).toBeVisible();
});

test('four rhythm rings leave room for a decimal tempo on the narrow screen', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('./');
  await page.getByRole('button', { name: /^Tempo .* Open tempo keypad/ }).click();
  const dialog = page.getByRole('dialog');
  for (const key of ['3', '9', '9', 'Decimal point', '5']) await dialog.getByRole('button', { name: key, exact: true }).click();
  await dialog.getByRole('button', { name: 'Set', exact: true }).click();
  await page.getByRole('button', { name: /^Polyrhythm/ }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '+ Add Track', exact: true }).click();
  await page.getByRole('button', { name: /^Polyrhythm/ }).click();
  await page.locator('.metronome-dial').scrollIntoViewIfNeeded();
  const ring = (await page.locator('[data-rhythm-track] > circle').last().boundingBox())!;
  const cx = ring.x + ring.width / 2, cy = ring.y + ring.height / 2;
  for (const selector of ['.dial-tempo', '.dial-meter', '.dial-ratio']) {
    const label = (await page.locator(selector).boundingBox())!;
    for (const x of [label.x, label.x + label.width]) for (const y of [label.y, label.y + label.height]) {
      expect(Math.hypot(x - cx, y - cy)).toBeLessThan(ring.width / 2);
    }
  }
  await page.screenshot({ path: testInfo.outputPath('four-rings-320.png'), animations: 'disabled' });
});
