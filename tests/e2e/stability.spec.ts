import { expect, test, type Page } from '@playwright/test';

function dial(page: Page) {
  return page.locator('canvas[role="button"]').first();
}

async function readBpm(page: Page): Promise<number> {
  const label = await dial(page).getAttribute('aria-label');
  const match = label?.match(/^([0-9.]+) BPM/);
  if (!match) throw new Error(`Could not parse BPM label: ${label ?? 'missing'}`);
  return Number(match[1]);
}

async function setBpm(page: Page, value: number) {
  await dial(page).click();
  const dialog = page.getByRole('dialog', { name: 'BPM' });
  await expect(dialog).toBeVisible();
  const backspace = dialog.getByRole('button', { name: 'Backspace' });
  for (let index = 0; index < 8; index += 1) await backspace.click();
  for (const character of String(value)) {
    await dialog.getByRole('button', {
      name: character === '.' ? 'Decimal point' : character,
      exact: true,
    }).click();
  }
  await dialog.getByRole('button', { name: 'Set', exact: true }).click();
  await expect.poll(() => readBpm(page)).toBe(value);
}

test('metronome remains responsive through a real 15-minute browser run', async ({ page }) => {
  test.setTimeout(16 * 60 * 1_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(`${error.name}: ${error.message}`));

  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Home', exact: true })).toBeVisible();
  await setBpm(page, 180.5);
  await page.getByRole('button', { name: 'Start metronome' }).click();
  await expect(page.getByRole('button', { name: 'Stop metronome' })).toBeVisible();

  for (let minute = 1; minute <= 15; minute += 1) {
    await page.waitForTimeout(60_000);
    await expect(page.getByRole('button', { name: 'Stop metronome' })).toBeVisible();
    await expect(dial(page)).toHaveAttribute('aria-label', /BPM/);

    if (minute === 5) {
      await setBpm(page, 181.5);
      await expect(page.getByRole('button', { name: 'Stop metronome' })).toBeVisible();
    }
  }

  await page.getByRole('button', { name: 'Stop metronome' }).click();
  await expect(page.getByRole('button', { name: 'Start metronome' })).toBeVisible();
  expect(await readBpm(page)).toBe(181.5);
  expect(pageErrors).toEqual([]);
});
