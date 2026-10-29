import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { holdScreenWakeLock } from './useWakeLock';

class FakeSentinel extends EventTarget {
  released = false;
  release = vi.fn(async () => {
    this.released = true;
    this.dispatchEvent(new Event('release'));
  });
}

describe('screen wake lock lifecycle', () => {
  let visibility: string;
  let request: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    visibility = 'visible';
    const document = new EventTarget();
    Object.defineProperty(document, 'visibilityState', { get: () => visibility });
    vi.stubGlobal('document', document);
    request = vi.fn();
    vi.stubGlobal('navigator', { wakeLock: { request } });
  });
  afterEach(() => vi.unstubAllGlobals());
  const changeVisibility = (state: string) => {
    visibility = state;
    document.dispatchEvent(new Event('visibilitychange'));
  };

  it('releases a request that resolves after practice stops', async () => {
    const sentinel = new FakeSentinel();
    let grant!: (value: FakeSentinel) => void;
    request.mockImplementation(() => new Promise((resolve) => { grant = resolve; }));
    const stop = holdScreenWakeLock();
    stop();
    grant(sentinel);
    await Promise.resolve();
    expect(sentinel.release).toHaveBeenCalledOnce();
    changeVisibility('visible');
    expect(request).toHaveBeenCalledOnce();
  });

  it('coalesces visibility events while a request is pending and while a lock is held', async () => {
    const sentinel = new FakeSentinel();
    let grant!: (value: FakeSentinel) => void;
    request.mockImplementation(() => new Promise((resolve) => { grant = resolve; }));
    const stop = holdScreenWakeLock();
    changeVisibility('visible');
    changeVisibility('visible');
    expect(request).toHaveBeenCalledOnce();
    grant(sentinel);
    await Promise.resolve();
    changeVisibility('visible');
    expect(request).toHaveBeenCalledOnce();
    stop();
    expect(sentinel.release).toHaveBeenCalledOnce();
  });

  it('releases when hidden and acquires one fresh lock when returning', async () => {
    const first = new FakeSentinel();
    const second = new FakeSentinel();
    request.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const stop = holdScreenWakeLock();
    await Promise.resolve();
    changeVisibility('hidden');
    expect(first.release).toHaveBeenCalledOnce();
    changeVisibility('visible');
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(2);
    stop();
    expect(second.release).toHaveBeenCalledOnce();
  });

  it('does not retain a lock granted while the page is hidden', async () => {
    const sentinel = new FakeSentinel();
    let grant!: (value: FakeSentinel) => void;
    request.mockImplementation(() => new Promise((resolve) => { grant = resolve; }));
    const stop = holdScreenWakeLock();
    changeVisibility('hidden');
    grant(sentinel);
    await Promise.resolve();
    expect(sentinel.release).toHaveBeenCalledOnce();
    stop();
  });

  it('retries a rejected request on return without an unhandled error', async () => {
    const sentinel = new FakeSentinel();
    request.mockRejectedValueOnce(new Error('Not allowed')).mockResolvedValueOnce(sentinel);
    const stop = holdScreenWakeLock();
    await Promise.resolve();
    changeVisibility('hidden');
    changeVisibility('visible');
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(2);
    stop();
    expect(sentinel.release).toHaveBeenCalledOnce();
  });

  it('keeps a new practice session independent of an old late grant', async () => {
    const oldSentinel = new FakeSentinel();
    const currentSentinel = new FakeSentinel();
    let grantOld!: (value: FakeSentinel) => void;
    request.mockImplementationOnce(() => new Promise((resolve) => { grantOld = resolve; }))
      .mockResolvedValueOnce(currentSentinel);
    const stopOld = holdScreenWakeLock();
    stopOld();
    const stopCurrent = holdScreenWakeLock();
    await Promise.resolve();
    grantOld(oldSentinel);
    await Promise.resolve();
    expect(oldSentinel.release).toHaveBeenCalledOnce();
    expect(currentSentinel.release).not.toHaveBeenCalled();
    stopCurrent();
    expect(currentSentinel.release).toHaveBeenCalledOnce();
  });
});
