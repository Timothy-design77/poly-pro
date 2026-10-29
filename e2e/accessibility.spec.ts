import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { seedSession } from './helpers';

async function audit(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations.map((item) => ({ rule: item.id, impact: item.impact, nodes: item.nodes.map((node) => ({ target: node.target, message: node.failureSummary })) }))).toEqual([]);
}

test('primary practice and library screens meet automated accessibility checks', async ({ page }) => {
  await page.goto('./');
  await audit(page);
  for (const name of ['Projects', 'Recordings', 'Settings']) {
    await page.getByRole('button', { name, exact: true }).click();
    await audit(page);
  }
});

test('review, editing, tuning and charts meet automated accessibility checks', async ({ page }, testInfo) => {
  await seedSession(page);
  await expect(page.getByRole('button', { name: 'Start playback', exact: true })).toBeEnabled();
  await audit(page);
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('review.png') });
  await page.getByRole('button', { name: 'Hit correction tools' }).click();
  await page.getByText('Playhead 0ms', { exact: true }).scrollIntoViewIfNeeded();
  await audit(page);
  await page.getByRole('button', { name: 'Sync click' }).click();
  await page.getByRole('slider', { name: 'Click offset' }).scrollIntoViewIfNeeded();
  await audit(page);
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('timing.png') });
  await page.getByRole('tab', { name: 'Charts', exact: true }).click();
  await expect(page.getByText('Professional', { exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Hit Rate', exact: true })).toContainText('100%');
  await expect(page.getByText('window unavailable', { exact: true })).toHaveCount(2);
  await audit(page);
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('charts.png') });
});

test.describe('dense fold display', () => {
  test.use({ deviceScaleFactor: 3 });

test('review fits narrow and high-density unfolded screens and keeps playback reachable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await seedSession(page);
  const play = page.getByRole('button', { name: 'Start playback', exact: true });
  await expect(play).toBeEnabled();
  expect(await play.evaluate((element) => { const rect = element.getBoundingClientRect(); return rect.top >= 0 && rect.bottom < innerHeight; })).toBe(true);
  expect(await page.getByRole('tabpanel').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('review-320.png') });
  await page.setViewportSize({ width: 884, height: 1104 });
  await page.getByText(/^Waveform view/).click();
  await page.getByRole('button', { name: '32×', exact: true }).click();
  expect(await page.getByRole('img', { name: 'Recording waveform and detected hits' }).evaluate((canvas) => (canvas as HTMLCanvasElement).width)).toBeLessThanOrEqual(16384);
  expect(await page.getByRole('tabpanel').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

});
