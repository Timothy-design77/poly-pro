import { expect, test } from '@playwright/test';
import { seedSession } from './helpers';

test('undo and redo keep hit corrections, timing and charts in one draft', async ({ page }) => {
  await seedSession(page);
  await page.getByRole('button', { name: 'Hit correction tools' }).click();
  await expect(page.getByRole('button', { name: 'Add Here', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '−5ms', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Tune scoring' }).click();
  const latency = page.getByRole('slider', { name: 'Latency Offset' });
  await latency.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(latency).toHaveAttribute('aria-valuenow', '1');
  await page.keyboard.press('Control+z');
  await expect(latency).toHaveAttribute('aria-valuenow', '0.5');
  await page.getByRole('button', { name: 'Undo last change' }).click();
  await expect(latency).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByText('19 detected hits', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo last change' }).click();
  await expect(page.getByText('20 detected hits', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Undo last change' })).toBeDisabled();
  await expect(page.getByText('Back to saved version', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Charts', exact: true }).click();
  await expect(page.getByRole('tabpanel').getByText('20/20', { exact: true })).toBeVisible();
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByRole('tabpanel').getByText('19/20', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Redo last change' }).click();
  await page.getByRole('tab', { name: 'Review', exact: true }).click();
  await expect(latency).toHaveAttribute('aria-valuenow', '0.5');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save and close' }).click();
  await expect(page.getByRole('dialog', { name: 'Review take', exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await page.getByRole('button', { name: /Review take.*120 BPM/ }).click();
  await expect(page.getByText('19 detected hits', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo last change' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Tune scoring' }).click();
  await expect(latency).toHaveAttribute('aria-valuenow', '0.5');
});

test('a slider drag is one undo step and a new correction replaces the redo branch', async ({ page }) => {
  await seedSession(page);
  await page.getByRole('button', { name: 'Hit correction tools' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Tune scoring' }).click();
  const latency = page.getByRole('slider', { name: 'Latency Offset' });
  await latency.scrollIntoViewIfNeeded();
  const box = (await latency.boundingBox())!;
  await page.mouse.move(box.x + box.width / 3, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 3 + 70, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  expect(Number(await latency.getAttribute('aria-valuenow'))).toBeGreaterThan(50);
  await page.getByRole('button', { name: 'Undo last change' }).click();
  await expect(latency).toHaveAttribute('aria-valuenow', '0');
  await expect(page.getByText('19 detected hits', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Undo last change' }).click();
  await expect(page.getByText('20 detected hits', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hit correction tools' }).click();
  await page.getByRole('button', { name: '+5ms', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Redo last change' })).toBeDisabled();
  await expect(page.getByText(/Nearest 5ms/)).toBeVisible();
  await page.setViewportSize({ width: 320, height: 915 });
  expect(await page.getByRole('dialog', { name: 'Review take', exact: true }).evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(page.getByText(/Nearest 0ms/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo last change' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Review take', exact: true })).toHaveCount(0);
});

test('discard immediately after saving keeps the confirmed save while its background read is delayed', async ({ page }) => {
  await seedSession(page);
  await page.evaluate(() => {
    const get = IDBObjectStore.prototype.get;
    let delayed = false;
    IDBObjectStore.prototype.get = function (key) {
      const request = get.call(this, key);
      if (key === 'hitevents:practice-take' && !delayed) {
        delayed = true;
        const listen = request.addEventListener.bind(request);
        request.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
          if (type !== 'success') return listen(type, listener, options);
          listen(type, (event) => setTimeout(() => {
            if (typeof listener === 'function') listener.call(request, event);
            else listener.handleEvent(event);
          }, 3000), options);
        }) as typeof request.addEventListener;
      }
      return request;
    };
  });
  await page.getByRole('button', { name: 'Hit correction tools' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText('18 detected hits', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect(page.getByText('19 detected hits', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Progress', exact: true }).click();
  await page.getByRole('button', { name: /Review take.*120 BPM/ }).click();
  await expect(page.getByText('18 detected hits', { exact: true })).toBeVisible();
});

test('a failed save preserves undo history and text-input shortcuts do not change the take', async ({ page }) => {
  await seedSession(page);
  await page.getByRole('button', { name: 'Hit correction tools' }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Tune scoring' }).click();
  await page.getByRole('button', { name: 'Edit Latency Offset', exact: true }).click();
  const input = page.getByRole('spinbutton', { name: 'Latency Offset' });
  await input.fill('12');
  await page.keyboard.press('Control+z');
  await expect(page.getByText('19 detected hits', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    let failed = false;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'recordings' && String(args[1]).startsWith('hitevents:') && !failed) {
        failed = true; throw new DOMException('Storage temporarily unavailable', 'QuotaExceededError');
      }
      return put.apply(this, args);
    };
  });
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('alert')).toContainText('Storage temporarily unavailable');
  await page.getByRole('button', { name: 'Undo last change' }).click();
  await expect(page.getByText('20 detected hits', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await page.getByRole('button', { name: 'Redo last change' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Changes saved', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo last change' })).toHaveCount(0);
});
