// Headless screenshot + axe audit of every screen at the target viewports.
// Usage: node scripts/ui-audit.mjs <outDir> [baseURL]   (requires a running `vite preview`)
// AUDIT_ONLY=practice,settings limits screens; AUDIT_VP=cover,320 limits viewports.
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const outDir = process.argv[2] ?? 'ui-audit';
const baseURL = process.argv[3] ?? 'http://127.0.0.1:4273/poly-pro/';
const only = process.env.AUDIT_ONLY?.split(',');
const onlyVp = process.env.AUDIT_VP?.split(',');
mkdirSync(outDir, { recursive: true });

// Galaxy Z Fold 7: cover ≈ 412 CSS px wide, inner display ≈ 884 CSS px wide.
const viewports = [
  { name: '320', width: 320, height: 740 },
  { name: 'cover', width: 412, height: 915 },
  { name: 'cover-land', width: 915, height: 412 },
  { name: 'unfolded', width: 884, height: 1104 },
  { name: 'unfolded-land', width: 1104, height: 884 },
].filter((vp) => !onlyVp || onlyVp.includes(vp.name));

async function seed(page) {
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('polypro'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const gridBeats = Array.from({ length: 20 }, (_, i) => ({ time: i / 2, beatIndex: i % 4, measure: Math.floor(i / 4), isMainBeat: true, isDownbeat: i % 4 === 0, trackId: 'track-0' }));
    const jitter = (i) => ((i * 37) % 11 - 5) / 1000;
    const rawOnsets = gridBeats.map((b, i) => ({ time: b.time + jitter(i), peak: 0.3 + (i % 4 === 0 ? 0.4 : 0.1), flux: 1, isFlam: false }));
    const scoredOnsets = gridBeats.map((b, i) => ({ time: b.time + jitter(i), peak: 0.5, delta: jitter(i) * 1000, absDelta: Math.abs(jitter(i) * 1000), matchedBeatTime: b.time, matchedBeatIndex: b.beatIndex, measurePosition: b.beatIndex / 4, scored: true }));
    const mk = (id, daysAgo, bpm, score) => ({ id, date: new Date(Date.now() - daysAgo * 864e5).toISOString(), projectId: null, bpm, meter: '4/4', subdivision: 1, durationMs: 10000, totalHits: 20, totalScored: 20, totalExpected: 20, avgDelta: 1.2, stdDev: 3.4, perfectPct: score, score, sigma: 3.4, hasRecording: true, analyzed: true, recordingSampleRate: 48000 });
    const pcm = new Float32Array(480000);
    for (let i = 0; i < pcm.length; i++) { const t = (i / 48000) % 0.5; pcm[i] = t < 0.03 ? Math.exp(-t * 120) * Math.sin(i * 0.3) * 0.8 : 0.002 * Math.sin(i); }
    const tx = db.transaction(['sessions', 'recordings'], 'readwrite');
    for (const [id, d, bpm, score] of [['take-a', 0, 120, 86], ['take-b', 1, 112, 78], ['take-c', 4, 104, 71]]) {
      tx.objectStore('sessions').put(mk(id, d, bpm, score));
      tx.objectStore('recordings').put(new Blob([pcm.buffer]), id);
      tx.objectStore('recordings').put(JSON.stringify({ sessionId: id, rawOnsets, scoredOnsets, gridBeats }), `hitevents:${id}`);
    }
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    db.close();
  });
}

const nav = (label) => async (page) => page.getByRole('button', { name: label, exact: true }).click();
const settings = (section) => async (page) => {
  await nav('Settings')(page);
  await page.getByRole('button', { name: new RegExp(`^${section}`) }).first().click();
  await page.waitForTimeout(150);
};
const openReview = async (page) => {
  await nav('Recordings')(page);
  await page.getByRole('button', { name: /Review take.*120 BPM/ }).click();
  await page.waitForTimeout(800);
};

const screens = [
  ['practice', async () => {}],
  ['practice-setup', async (p) => { await p.locator('.recording-setup > summary, [data-audit="recording-setup"]').first().click(); }],
  ['practice-meter', async (p) => { await p.getByRole('button', { name: /^Meter & subdivision/ }).click(); }],
  ['practice-pattern', async (p) => { await p.getByRole('button', { name: /^Pattern/ }).click(); }],
  ['practice-modes', async (p) => { await p.getByRole('button', { name: /^Practice modes/ }).click(); }],
  ['practice-trainer', async (p) => { await p.getByRole('button', { name: /^Trainer/ }).click(); }],
  ['practice-poly', async (p) => { await p.getByRole('button', { name: /^Polyrhythm/ }).click(); }],
  ['keypad', async (p) => { await p.getByRole('button', { name: /^Tempo .* Open tempo keypad/ }).click(); }],
  ['recordings-empty', nav('Recordings')],
  ['recordings', nav('Recordings'), true],
  ['review', openReview, true],
  ['charts', async (p) => { await openReview(p); await p.getByRole('tab', { name: 'Charts' }).click(); await p.waitForTimeout(500); }, true],
  ['projects', nav('Projects')],
  ['project-create', async (p) => { await nav('Projects')(p); await p.getByRole('button', { name: /New project/i }).first().click(); }],
  ['settings', nav('Settings')],
  ['settings-sounds', settings('Sounds')],
  ['settings-recording', settings('Recording')],
  ['settings-detection', settings('Detection')],
  ['settings-vibration', settings('Vibration')],
  ['settings-calibration', settings('Calibration')],
  ['settings-instruments', settings('Instruments')],
  ['settings-data', settings('Data')],
  ['custom-samples', async (p) => { await settings('Sounds')(p); await p.getByRole('button', { name: 'Record', exact: true }).click(); await p.getByRole('textbox', { name: 'Sample name' }).waitFor({ timeout: 15000 }); await p.getByRole('textbox', { name: 'Sample name' }).scrollIntoViewIfNeeded(); }],
  ['detection-bench', async (p) => { await settings('Detection')(p); await p.getByRole('button', { name: /Run Detection Test|Test detection/i }).click(); }],
  ['calibration', async (p) => { await settings('Calibration')(p); await p.getByRole('button', { name: /Run Calibration|Recalibrate|Calibrate/i }).first().click(); }],
  ['training', async (p) => { await settings('Instruments')(p); await p.getByRole('button', { name: /Train Instruments|Manage Instruments|Train instruments|Manage instruments/ }).click(); }],
];

const report = [];
const browser = await chromium.launch({ headless: true, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
for (const vp of viewports) {
  for (const [name, act, needsData] of screens) {
    if (only && !only.includes(name)) continue;
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, permissions: ['microphone'], reducedMotion: 'reduce', serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const row = { vp: vp.name, name };
    try {
      await page.goto(baseURL);
      await page.getByRole('button', { name: 'Practice', exact: true }).waitFor();
      if (needsData) { await seed(page); await page.reload(); await page.getByRole('button', { name: 'Practice', exact: true }).waitFor(); }
      await act(page);
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${outDir}/${name}-${vp.name}.png`, animations: 'disabled' });
      if (['320', 'cover', 'unfolded'].includes(vp.name)) {
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
        row.axe = axe.violations.map((v) => `${v.id}(${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      }
      row.overflowX = await page.evaluate(() => {
        const w = innerWidth; const bad = [];
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect();
          if (r.width && r.right > w + 1 && !el.closest('[hidden]')) bad.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)} ${Math.round(r.right)}`);
          if (bad.length > 4) break;
        }
        return bad;
      });
      row.smallTargets = await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('button, a[href], input, select, [role="switch"], [role="slider"], [role="tab"]')) {
          const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
          if (el.closest('[hidden],[aria-hidden="true"]') || el.type === 'range') continue;
          const before = getComputedStyle(el, '::before');
          if (before.content !== 'none' && before.position === 'absolute') continue; // hit area extended by ::before
          if (r.width < 24 || r.height < 24 || (r.height < 40 && r.width < 40)) out.push(`${(el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 28)} ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
        return out.slice(0, 12);
      });
    } catch (e) {
      row.error = String(e).split('\n')[0];
      await page.screenshot({ path: `${outDir}/${name}-${vp.name}-ERROR.png` }).catch(() => {});
    }
    if (errors.length) row.pageErrors = errors;
    report.push(row);
    await ctx.close();
  }
}
await browser.close();
writeFileSync(`${outDir}/report.json`, JSON.stringify(report, null, 1));
for (const r of report) {
  const issues = [
    r.error && `ERROR ${r.error}`,
    r.axe?.length && `axe: ${r.axe.join('; ')}`,
    r.overflowX?.length && `overflow: ${r.overflowX.join(', ')}`,
    r.smallTargets?.length && `small: ${r.smallTargets.join(', ')}`,
    r.pageErrors && `pageErrors: ${r.pageErrors.join(' ')}`,
  ].filter(Boolean);
  console.log(`${r.vp.padEnd(13)} ${r.name.padEnd(22)} ${issues.length ? issues.join('\n' + ' '.repeat(37)) : 'ok'}`);
}
