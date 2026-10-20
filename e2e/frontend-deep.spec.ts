import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { seedSession } from './helpers';

async function auditVisibleScreen(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations.map((violation) => ({
    rule: violation.id,
    nodes: violation.nodes.map((node) => ({ target: node.target, message: node.failureSummary })),
  }))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

test('advanced practice controls expose names, selections and usable narrow layouts', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('./');
  for (const name of ['Fine tempo', 'Meter & subdivision', 'Pattern', 'Practice modes', 'Trainer', 'Polyrhythm']) {
    const section = page.getByRole('button', { name: new RegExp(`^${name}`) });
    await section.click();
    if (name === 'Meter & subdivision') {
      await page.getByRole('button', { name: 'Next beats per measure' }).click();
      await expect(page.getByRole('button', { name: 'Time signature 5/4. Change beat unit' })).toBeVisible();
      const eighths = page.getByRole('button', { name: '8ths', exact: true });
      await eighths.click();
      await expect(eighths).toHaveAttribute('aria-pressed', 'true');
    }
    if (name === 'Practice modes') {
      for (const label of ['Play / Mute Cycle', 'Gap Click', 'Random Mute']) await page.getByRole('switch', { name: label, exact: true }).click();
      await page.getByRole('slider', { name: 'Gap click mute probability' }).press('Home');
      await expect(page.getByRole('slider', { name: 'Gap click mute probability' })).toHaveValue('5');
      await page.getByRole('button', { name: 'Increase play bars' }).click();
    }
    if (name === 'Pattern') {
      const beat = page.getByRole('button', { name: /^Track 1 beat 1,/ });
      const before = await beat.getAttribute('aria-label');
      await beat.press('Enter');
      await expect(beat).not.toHaveAttribute('aria-label', before!);
      await beat.press('F2');
      await expect(page.getByRole('dialog', { name: 'Beat 1 sound' })).toBeVisible();
      await auditVisibleScreen(page);
      await page.keyboard.press('Escape');
      await expect(beat).toBeFocused();
      await page.getByRole('button', { name: 'Set subdivisions to Ghost' }).click();
      await expect(page.getByRole('button', { name: 'Track 1 beat 1 subdivision 2, Ghost' })).toBeVisible();
      await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('pattern-320.png') });
    }
    if (name === 'Trainer') {
      await page.getByRole('switch', { name: 'Enable Trainer' }).click();
      await page.getByRole('spinbutton', { name: 'Trainer start BPM' }).fill('90');
      await page.getByRole('spinbutton', { name: 'Trainer end BPM' }).fill('130');
      await page.getByRole('button', { name: 'Increase trainer BPM step' }).click();
      await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('trainer-320.png') });
    }
    if (name === 'Polyrhythm') {
      await page.getByRole('button', { name: '+ Add Track', exact: true }).click();
      await page.getByRole('button', { name: /^Track 2/ }).click();
      await page.getByRole('slider', { name: 'Track 2 swing' }).press('ArrowRight');
      await expect(page.getByRole('slider', { name: 'Track 2 swing' })).toHaveValue('1');
      await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('polyrhythm-320.png') });
    }
    await section.scrollIntoViewIfNeeded();
    await auditVisibleScreen(page);
    await section.click();
  }
});

test('fine tempo responds to keyboard and ends held adjustment when its panel closes', async ({ page }) => {
  await page.goto('./');
  const section = page.getByRole('button', { name: /^Fine tempo/ });
  await section.click();
  const increase = page.getByRole('button', { name: 'Increase tempo', exact: true });
  const decrease = page.getByRole('button', { name: 'Decrease tempo', exact: true });
  const tempo = page.getByRole('button', { name: /^Tempo .* Open tempo keypad/ });
  const initial = await tempo.getAttribute('aria-label');
  await increase.press('Enter');
  await expect(tempo).not.toHaveAttribute('aria-label', initial!);
  await decrease.press('Space');
  await expect(tempo).toHaveAttribute('aria-label', initial!);
  await increase.scrollIntoViewIfNeeded();
  const bounds = (await increase.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await expect(tempo).not.toHaveAttribute('aria-label', initial!);
  // Closing the card while a hold is active must dispose its repeat timer.
  await section.press('Enter');
  await expect(increase).toHaveCount(0);
  const stopped = await tempo.getAttribute('aria-label');
  await page.waitForTimeout(650);
  await expect(tempo).toHaveAttribute('aria-label', stopped!);
  await page.mouse.up();
});

test('expanded settings remain accessible and vibration controls survive reload', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  for (const name of ['Sounds', 'Recording', 'Detection', 'Vibration', 'Calibration', 'Instruments', 'Data']) {
    const section = page.getByRole('button', { name, exact: true });
    await section.click();
    await section.scrollIntoViewIfNeeded();
    await auditVisibleScreen(page);
    if (name === 'Vibration') {
      const intensity = page.getByRole('slider', { name: 'Vibration intensity' });
      await intensity.focus();
      await intensity.press('End');
      await expect(intensity).toHaveValue('100');
      const haptics = page.getByRole('switch', { name: 'Haptic feedback' });
      await haptics.click();
      await expect(haptics).not.toBeChecked();
      await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('vibration-accessible.png') });
    }
    await section.click();
  }
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Vibration', exact: true }).click();
  const haptics = page.getByRole('switch', { name: 'Haptic feedback' });
  await expect(haptics).not.toBeChecked();
  await haptics.click();
  await expect(page.getByRole('slider', { name: 'Vibration intensity' })).toHaveValue('100');
});

test('cancelled slider gestures preserve values and exact entry keeps keyboard focus', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Detection', exact: true }).click();
  const slider = page.getByRole('slider', { name: 'Scoring Window', exact: true });
  await slider.scrollIntoViewIfNeeded();
  const bounds = (await slider.boundingBox())!;
  const x = bounds.x + bounds.width * 0.8;
  const y = bounds.y + bounds.height / 2;
  await expect(slider).toHaveAttribute('aria-valuenow', '5');
  await page.mouse.move(x, y);
  await page.mouse.down();
  // Android cancels a pointer when its scroll gesture takes ownership.
  await slider.dispatchEvent('pointercancel', { pointerId: 1, clientX: x, clientY: y, isPrimary: true });
  await page.mouse.up();
  await expect(slider).toHaveAttribute('aria-valuenow', '5');
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '5.25');
  const edit = page.getByRole('button', { name: 'Edit Scoring Window', exact: true });
  await edit.click();
  const input = page.getByRole('spinbutton', { name: 'Scoring Window', exact: true });
  await input.fill('7.5');
  await input.press('Enter');
  await expect(slider).toHaveAttribute('aria-valuenow', '7.5');
  await expect(edit).toBeFocused();
  await edit.press('Enter');
  await input.fill('20');
  await input.press('Escape');
  await expect(slider).toHaveAttribute('aria-valuenow', '7.5');
  await expect(edit).toBeFocused();
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Detection', exact: true }).click();
  await expect(slider).toHaveAttribute('aria-valuenow', '7.5');
});

test('help and exact-value Escape close the local control before the review dialog', async ({ page }, testInfo) => {
  await seedSession(page);
  await page.getByRole('button', { name: 'Sync click', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Review take', exact: true });
  const help = review.getByRole('button', { name: 'Help', exact: true }).first();
  await help.click();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('timing-help.png') });
  await help.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(review).toBeVisible();
  const edit = page.getByRole('button', { name: 'Edit Click offset', exact: true });
  await edit.click();
  const input = page.getByRole('spinbutton', { name: 'Click offset' });
  await input.fill('150');
  await input.press('Escape');
  await expect(edit).toBeFocused();
  await expect(page.getByRole('slider', { name: 'Click offset' })).toHaveAttribute('aria-valuenow', '0');
  await expect(review).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(review).toHaveCount(0);
});

test('advanced dialogs fit a narrow display and expose complete accessible controls', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: '+ New Project', exact: true }).click();
  await page.getByRole('textbox', { name: 'Project name' }).fill('Quiet rudiments');
  await auditVisibleScreen(page);
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('project-320.png') });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Instruments', exact: true }).click();
  await page.getByRole('button', { name: 'Train Instruments', exact: true }).click();
  const snare = page.getByRole('button', { name: /Snare Not trained/ });
  await snare.click();
  await expect(snare).toHaveAttribute('aria-pressed', 'true');
  await auditVisibleScreen(page);
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('training-320.png') });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Detection', exact: true }).click();
  await page.getByRole('button', { name: 'Run Detection Test', exact: true }).click();
  await auditVisibleScreen(page);
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('detection-320.png') });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
