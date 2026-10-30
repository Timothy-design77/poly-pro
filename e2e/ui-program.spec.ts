import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { seedSession } from './helpers';

// Guards for the shared UI system: transport reachability across Fold 7
// postures, axe on the rebuilt screens, and keyboard access to new controls.

async function axe(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(result.violations.map((v) => ({ rule: v.id, targets: v.nodes.map((n) => n.target) }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function inViewport(page: Page, name: string) {
  const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
  const viewport = page.viewportSize()!;
  return box.y >= 0 && box.y + box.height <= viewport.height && box.x >= 0 && box.x + box.width <= viewport.width;
}

for (const size of [
  { name: 'narrow', width: 320, height: 740 },
  { name: 'folded', width: 412, height: 915 },
  { name: 'folded landscape', width: 915, height: 412 },
  { name: 'unfolded', width: 884, height: 1104 },
  { name: 'unfolded landscape', width: 1104, height: 884 },
]) {
  test(`Start and Record are visible without scrolling: ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('./');
    expect(await inViewport(page, 'Start metronome')).toBe(true);
    expect(await inViewport(page, 'Start recording')).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('rebuilt settings tools pass axe and the sample trimmer works from the keyboard', async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Sounds', exact: true }).click();
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Sample name' })).toBeVisible({ timeout: 12_000 });
  const start = page.getByRole('slider', { name: 'Sample start' });
  const before = Number(await start.getAttribute('aria-valuenow'));
  await start.focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(async () => Number(await start.getAttribute('aria-valuenow'))).toBeGreaterThan(before);
  await axe(page);
  await page.getByRole('button', { name: 'Discard', exact: true }).click();

  await page.getByRole('button', { name: 'Calibration', exact: true }).click();
  await page.getByRole('button', { name: 'Run calibration', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Audio calibration' })).toBeVisible();
  await axe(page);
  await page.getByRole('button', { name: 'Back', exact: true }).click();

  await page.getByRole('button', { name: 'Detection', exact: true }).click();
  await page.getByRole('button', { name: 'Run detection test', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Test progress' })).toBeVisible();
  await axe(page);
  await page.getByRole('button', { name: 'Skip all', exact: true }).click();
  await expect(page.getByText('tests passed')).toBeVisible();
  await axe(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('recordings progress, project form and review tools pass axe', async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await seedSession(page);
  await page.getByText(/^Waveform view/).click();
  await page.getByRole('button', { name: 'Audio cleanup controls' }).click();
  await page.getByRole('switch', { name: 'Playback cleanup' }).click();
  await expect(page.getByRole('slider', { name: 'Low cut' })).toBeVisible();
  await axe(page);
  await page.getByRole('tab', { name: 'Charts' }).click();
  await page.getByRole('button', { name: 'How was this computed?' }).click();
  await expect(page.getByRole('button', { name: 'Hide score breakdown' })).toHaveAttribute('aria-expanded', 'true');
  await axe(page);
  await page.getByRole('button', { name: 'Back', exact: true }).click();

  await page.getByRole('button', { name: 'Practice progress' }).click();
  await expect(page.getByRole('img', { name: /Practiced on 1 of the last 28 days/ })).toBeVisible();
  await axe(page);

  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Project name' })).toBeFocused();
  await page.getByRole('button', { name: '🎯' }).click();
  await expect(page.getByRole('button', { name: '🎯' })).toHaveAttribute('aria-pressed', 'true');
  await axe(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('deferred practice sections and screens are prefetched after startup', async ({ page }) => {
  const chunks: string[] = [];
  page.on('response', (response) => { if (response.url().endsWith('.js')) chunks.push(response.url()); });
  await page.goto('./');
  await expect.poll(() => chunks.some((url) => /PracticeSections-/.test(url)), { timeout: 10_000 }).toBe(true);
  await expect.poll(() => chunks.some((url) => /SessionDetailPage-/.test(url)), { timeout: 10_000 }).toBe(true);
  await page.getByRole('button', { name: /^Pattern/ }).click();
  await expect(page.getByRole('button', { name: /^Track 1 beat 1,/ })).toBeVisible();
  await expect(page.getByText('Loading…')).toHaveCount(0);
});
