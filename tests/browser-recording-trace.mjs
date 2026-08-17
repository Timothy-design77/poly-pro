import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:4173/poly-pro/';
const OUT = path.resolve(process.env.AUDIT_OUTPUT_DIR || 'audit-recording-trace');
const FAKE_AUDIO = process.env.AUDIT_FAKE_AUDIO || '/tmp/poly-pro-fake-mic.wav';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${FAKE_AUDIO}`,
    '--disable-dev-shm-usage',
  ],
});

const result = { generatedAt: new Date().toISOString(), directWorklet: null, appTrace: null, console: [] };
try {
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
    serviceWorkers: 'allow',
    permissions: ['microphone'],
  });
  await context.grantPermissions(['microphone'], { origin: new URL(BASE_URL).origin });
  const page = await context.newPage();
  page.on('console', (m) => result.console.push({ type: m.type(), text: m.text() }));
  page.on('pageerror', (e) => result.console.push({ type: 'pageerror', text: `${e.name}: ${e.message}` }));
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.getByRole('button', { name: 'Home', exact: true }).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(700);

  result.directWorklet = await page.evaluate(async (baseUrl) => {
    const trace = [];
    const race = (promise, label, timeout = 15_000) => Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timeout`)), timeout)),
    ]);
    let stream;
    let ctx;
    try {
      trace.push({ step: 'gum:start', at: performance.now() });
      stream = await race(navigator.mediaDevices.getUserMedia({ audio: {
        echoCancellation: { exact: false },
        autoGainControl: { exact: false },
        noiseSuppression: { exact: false },
      }}), 'direct-gum');
      trace.push({ step: 'gum:end', at: performance.now(), settings: stream.getAudioTracks()[0]?.getSettings() });
      ctx = new AudioContext({ sampleRate: 48000 });
      trace.push({ step: 'context', at: performance.now(), state: ctx.state, sampleRate: ctx.sampleRate });
      await race(ctx.resume(), 'context-resume');
      trace.push({ step: 'resume:end', at: performance.now(), state: ctx.state });
      const moduleUrl = new URL('worklets/pcm-capture.js', baseUrl).href;
      trace.push({ step: 'addModule:start', at: performance.now(), moduleUrl });
      await race(ctx.audioWorklet.addModule(moduleUrl), 'addModule');
      trace.push({ step: 'addModule:end', at: performance.now() });
      const source = ctx.createMediaStreamSource(stream);
      trace.push({ step: 'source-created', at: performance.now() });
      const node = new AudioWorkletNode(ctx, 'pcm-capture-processor');
      trace.push({ step: 'node-created', at: performance.now() });
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(node);
      node.connect(gain);
      gain.connect(ctx.destination);
      const firstMessage = new Promise((resolve) => {
        node.port.onmessage = (event) => resolve({ type: event.data?.type, peak: event.data?.peak, sampleLength: event.data?.samples?.length });
      });
      node.port.postMessage({ type: 'start' });
      trace.push({ step: 'start-posted', at: performance.now() });
      const message = await race(firstMessage, 'worklet-message', 10_000);
      trace.push({ step: 'message', at: performance.now(), message });
      node.port.postMessage({ type: 'stop' });
      source.disconnect();
      node.disconnect();
      gain.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      await ctx.close();
      return { success: true, trace };
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (ctx && ctx.state !== 'closed') await ctx.close().catch(() => {});
      return { success: false, error: `${error.name}: ${error.message}`, trace };
    }
  }, BASE_URL);

  result.appTrace = await page.evaluate(async () => {
    const trace = [];
    globalThis.__recordingAuditTrace = trace;
    const push = (step, extra = {}) => trace.push({ step, at: performance.now(), ...extra });
    const originalEnumerate = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
    const originalGum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

    const base = await originalGum({ audio: {
      echoCancellation: { exact: false },
      autoGainControl: { exact: false },
      noiseSuppression: { exact: false },
    }});
    globalThis.__auditBaseStream = base;
    push('base-stream-open', { settings: base.getAudioTracks()[0]?.getSettings() });

    navigator.mediaDevices.enumerateDevices = async (...args) => {
      push('enumerate:start');
      try {
        const devices = await originalEnumerate(...args);
        push('enumerate:end', { devices: devices.map((d) => ({ kind: d.kind, label: d.label, deviceId: d.deviceId })) });
        return devices;
      } catch (error) {
        push('enumerate:error', { error: `${error.name}: ${error.message}` });
        throw error;
      }
    };

    navigator.mediaDevices.getUserMedia = async (constraints) => {
      push('getUserMedia:start', { constraints });
      const clone = base.clone();
      push('getUserMedia:end', { settings: clone.getAudioTracks()[0]?.getSettings() });
      return clone;
    };

    if (globalThis.AudioWorklet?.prototype?.addModule) {
      const originalAddModule = globalThis.AudioWorklet.prototype.addModule;
      globalThis.AudioWorklet.prototype.addModule = async function(url, options) {
        push('addModule:start', { url: String(url) });
        try {
          const value = await originalAddModule.call(this, url, options);
          push('addModule:end');
          return value;
        } catch (error) {
          push('addModule:error', { error: `${error.name}: ${error.message}` });
          throw error;
        }
      };
    } else {
      push('AudioWorklet-constructor-not-global');
    }

    const originalCreateSource = AudioContext.prototype.createMediaStreamSource;
    AudioContext.prototype.createMediaStreamSource = function(stream) {
      push('createMediaStreamSource:start');
      const value = originalCreateSource.call(this, stream);
      push('createMediaStreamSource:end');
      return value;
    };

    const OriginalNode = globalThis.AudioWorkletNode;
    if (OriginalNode) {
      globalThis.AudioWorkletNode = new Proxy(OriginalNode, {
        construct(target, args, newTarget) {
          push('AudioWorkletNode:start', { name: args[1] });
          try {
            const value = Reflect.construct(target, args, newTarget);
            push('AudioWorkletNode:end');
            return value;
          } catch (error) {
            push('AudioWorkletNode:error', { error: `${error.name}: ${error.message}` });
            throw error;
          }
        },
      });
    }

    return { trace, baseSettings: base.getAudioTracks()[0]?.getSettings() };
  });

  await page.getByRole('button', { name: 'RECORD', exact: true }).click();
  await page.waitForTimeout(15_000);
  const after = await page.evaluate(() => ({
    trace: window.__unused,
    buttons: [...document.querySelectorAll('button')].map((b) => (b.textContent || '').trim()).filter(Boolean),
    body: document.body.innerText.slice(0, 2200),
  }));
  const traceSnapshot = await page.evaluate(() => globalThis.__recordingAuditTrace || null).catch(() => null);
  result.appTrace.after = after;
  result.appTrace.traceSnapshot = traceSnapshot;
  await page.screenshot({ path: path.join(OUT, 'recording-trace.png'), fullPage: true });
  await page.evaluate(() => window.__auditBaseStream?.getTracks().forEach((t) => t.stop())).catch(() => {});
  await context.close();
} finally {
  await browser.close();
}

await writeFile(path.join(OUT, 'recording-trace.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
