import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperationTimeoutError, withTimeout } from './async';

afterEach(() => { vi.useRealTimers(); });

describe('withTimeout', () => {
  it('resolves with the value when the operation settles in time', async () => {
    await expect(withTimeout(Promise.resolve(42), 1_000, 'test')).resolves.toBe(42);
  });

  it('rejects with OperationTimeoutError when the operation never settles', async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise<never>(() => {}), 10_000, 'Audio startup');
    vi.advanceTimersByTime(10_000);
    await expect(pending).rejects.toBeInstanceOf(OperationTimeoutError);
  });

  it('rejects with AbortError when aborted', async () => {
    const controller = new AbortController();
    const pending = withTimeout(new Promise<never>(() => {}), 10_000, 'Audio startup', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('consumes an operation rejection when its signal was already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(withTimeout(Promise.reject(new Error('Late failure')), 1000, 'Audio startup', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('propagates operation errors', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1_000, 'test')).rejects.toThrow('boom');
  });
});
