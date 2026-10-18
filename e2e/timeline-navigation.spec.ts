import { expect, test } from '@playwright/test';
import { seedSession } from './helpers';

test('folding the display keeps a zoomed waveform inside its scroll bounds', async ({ page }) => {
  await page.setViewportSize({ width: 884, height: 1104 });
  await seedSession(page);
  await page.getByRole('button', { name: '32×', exact: true }).click();
  const position = page.getByRole('slider', { name: 'Recording position', exact: true });
  await position.fill('900');
  await page.getByRole('button', { name: 'Start playback', exact: true }).click();
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: 'Pause playback', exact: true }).click();
  await page.setViewportSize({ width: 320, height: 740 });
  const waveform = page.getByRole('img', { name: 'Recording waveform and detected hits' });
  await expect.poll(() => waveform.evaluate((canvas) => {
    const strip = canvas.parentElement!;
    const viewport = strip.parentElement!;
    const offset = -new DOMMatrix(getComputedStyle(strip).transform).m41;
    return offset >= 0 && offset <= strip.clientWidth - viewport.clientWidth + 1;
  })).toBe(true);
  await expect(position).toHaveValue(/9\d\d/);
});
